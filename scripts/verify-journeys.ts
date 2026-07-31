import { readFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import { randomBytes } from "crypto";

// D5: runs the four worked journeys and the anti-cheese guards against a live
// `docker compose up` stack, through api-gateway only (the only host-exposed service).

const BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3000";
const PASSWORD = "Verify1234pass";
const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 45_000;
const RESTART_WAIT_MS = 30_000;
const runId = randomBytes(3).toString("hex");
const TERMINAL = new Set(["paid", "rejected", "payment_failed"]);

interface Fixture {
  id: string;
  scenario?: string;
  expected: { route: string; violations: string[]; reason: string };
  [key: string]: unknown;
}

function loadFixtures(): Fixture[] {
  const raw = readFileSync(join(__dirname, "../sample-invoices.json"), "utf-8");
  return (JSON.parse(raw) as { fixtures: Fixture[] }).fixtures;
}

function fixtureById(fixtures: Fixture[], id: string): Fixture {
  const found = fixtures.find((f) => f.id === id);
  if (!found) throw new Error(`Fixture ${id} not found in sample-invoices.json`);
  return found;
}

// Drops fixture-only metadata and appends a per-run suffix to invoiceNumber so
// repeated runs against the same live stack don't collide with earlier runs'
// dedup keys (vendor + invoiceNumber + total). INV-1001/INV-1007 share the same
// vendor/invoiceNumber/total in the fixture file, so applying the same suffix to
// both under one run reproduces the duplicate on purpose.
function toSubmission(fixture: Fixture, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...fixture };
  delete rest.id;
  delete rest.scenario;
  delete rest.expected;
  return { ...rest, invoiceNumber: `${fixture.invoiceNumber}-${runId}`, ...extra };
}

interface CheckResult {
  name: string;
  pass: boolean;
  detail?: string;
}
const results: CheckResult[] = [];
function check(name: string, pass: boolean, detail?: unknown): void {
  results.push({ name, pass, detail: detail === undefined ? undefined : String(detail) });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail !== undefined ? `  (${String(detail)})` : ""}`);
}

interface AuthResponse {
  token: string;
}
interface SubmitResponse {
  trackingId: string;
  duplicateSubmission?: boolean;
}
interface StatusResponse {
  status: string;
}
interface QueueItem {
  trackingId: string;
}
interface QueueResponse {
  items: QueueItem[];
}
interface TrailEvent {
  event_type: string;
  payload: Record<string, unknown>;
}
interface TrailResponse {
  events: TrailEvent[];
}

async function api<T>(
  path: string,
  opts: { method?: string; token?: string; body?: unknown } = {}
): Promise<{ status: number; body: T }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : undefined) as T };
}

async function registerOrLogin(role: "submitter" | "approver" | "admin"): Promise<string> {
  const username = `verify-${role}-${runId}`;
  const reg = await api<AuthResponse>("/auth/register", { method: "POST", body: { username, password: PASSWORD, role } });
  if (reg.status === 201) return reg.body.token;
  const login = await api<AuthResponse>("/auth/login", { method: "POST", body: { username, password: PASSWORD } });
  if (login.status !== 200) throw new Error(`Auth failed for ${username}: ${JSON.stringify(login.body)}`);
  return login.body.token;
}

async function submitInvoice(token: string, payload: Record<string, unknown>): Promise<SubmitResponse> {
  const res = await api<SubmitResponse>("/invoices", { method: "POST", token, body: payload });
  if (res.status !== 202 && res.status !== 200) {
    throw new Error(`Submit failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

// Network errors are swallowed and retried here on purpose: a restart (Journey B's
// M11 proof) makes the target briefly unreachable, and that's not a failure to report.
async function pollStatus(
  token: string,
  trackingId: string,
  isDone: (status: string) => boolean,
  timeoutMs = POLL_TIMEOUT_MS
): Promise<StatusResponse> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await api<StatusResponse>(`/invoices/${trackingId}/status`, { token });
      if (res.status === 200 && isDone(res.body.status)) return res.body;
    } catch {
      // target unreachable (e.g. mid-restart) - fall through and retry
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`Timed out waiting for ${trackingId} to reach the expected status`);
}

async function findInQueue(approverToken: string, trackingId: string, timeoutMs = POLL_TIMEOUT_MS): Promise<QueueItem> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await api<QueueResponse>("/approvals/queue", { token: approverToken });
      const item = (res.body?.items ?? []).find((i) => i.trackingId === trackingId);
      if (item) return item;
    } catch {
      // target unreachable (e.g. mid-restart) - fall through and retry
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`Timed out waiting for ${trackingId} to appear in the approval queue`);
}

async function decide(
  approverToken: string,
  approverId: string,
  trackingId: string,
  action: "approve" | "reject" | "request_info"
): Promise<void> {
  const res = await api(`/approvals/${trackingId}/decision`, { method: "POST", token: approverToken, body: { approverId, action } });
  if (res.status !== 202) throw new Error(`Decision failed for ${trackingId}: ${res.status} ${JSON.stringify(res.body)}`);
}

async function getTrail(adminToken: string, trackingId: string): Promise<TrailEvent[]> {
  const res = await api<TrailResponse>(`/audit/trail/${trackingId}`, { token: adminToken });
  if (res.status !== 200) throw new Error(`Trail lookup failed for ${trackingId}: ${res.status}`);
  return res.body.events;
}

function finalizedEventOf(events: TrailEvent[]): Record<string, unknown> | undefined {
  return events.find((e) => e.event_type === "DecisionFinalized")?.payload;
}

// Proves M11: the escalation pause must survive workflow-service restarting while paused.
function restartWorkflowService(): void {
  console.log("Restarting workflow-service mid-pause to prove M11...");
  execSync("docker compose restart workflow-service workflow-service-dapr", { stdio: "inherit" });
  execSync(
    'docker compose exec -T workflow-service sh -c "until wget -qO- http://localhost:3003/healthz >/dev/null 2>&1; do sleep 1; done"',
    { stdio: "inherit", timeout: RESTART_WAIT_MS }
  );
}

async function main(): Promise<void> {
  const fixtures = loadFixtures();
  console.log(`Run id: ${runId}\nTarget: ${BASE_URL}\n`);

  const submitterToken = await registerOrLogin("submitter");
  const approverToken = await registerOrLogin("approver");
  const adminToken = await registerOrLogin("admin");
  const approverId = `verify-approver-${runId}`;

  let autoApproveCount = 0;

  console.log("\n--- Journey A: auto-approve (INV-1001) ---");
  try {
    const { trackingId } = await submitInvoice(submitterToken, toSubmission(fixtureById(fixtures, "INV-1001")));
    const status = await pollStatus(submitterToken, trackingId, (s) => TERMINAL.has(s));
    const finalized = finalizedEventOf(await getTrail(adminToken, trackingId));
    check("Journey A - reaches 'paid'", status.status === "paid", status.status);
    check("Journey A - no human involved", !finalized?.approverId);
    if (status.status === "paid" && !finalized?.approverId) autoApproveCount++;
  } catch (err) {
    check("Journey A - auto-approve", false, err);
  }

  console.log("\n--- Journey B: escalate-and-resume across a restart (INV-1003) ---");
  try {
    const { trackingId } = await submitInvoice(submitterToken, toSubmission(fixtureById(fixtures, "INV-1003")));
    await pollStatus(submitterToken, trackingId, (s) => s === "awaiting_approval");
    restartWorkflowService();
    const queued = await findInQueue(approverToken, trackingId);
    check("Journey B - still queued after restart", Boolean(queued));
    await decide(approverToken, approverId, trackingId, "approve");
    const status = await pollStatus(submitterToken, trackingId, (s) => TERMINAL.has(s));
    check("Journey B - resumes to 'paid' after approval", status.status === "paid", status.status);
  } catch (err) {
    check("Journey B - escalate-and-resume", false, err);
  }

  console.log("\n--- Journey C: duplicate re-submission (INV-1007 = INV-1001) ---");
  try {
    const res = await submitInvoice(submitterToken, toSubmission(fixtureById(fixtures, "INV-1007")));
    check("Journey C - short-circuited as a duplicate", res.duplicateSubmission === true, JSON.stringify(res));
  } catch (err) {
    check("Journey C - duplicate", false, err);
  }

  console.log("\n--- Journey D: payment failure + compensation (INV-1012) ---");
  try {
    const { trackingId } = await submitInvoice(
      submitterToken,
      toSubmission(fixtureById(fixtures, "INV-1012"), { forcePaymentFailure: true })
    );
    await pollStatus(submitterToken, trackingId, (s) => s === "awaiting_approval");
    await findInQueue(approverToken, trackingId);
    await decide(approverToken, approverId, trackingId, "approve");
    const status = await pollStatus(submitterToken, trackingId, (s) => TERMINAL.has(s));
    const finalized = finalizedEventOf(await getTrail(adminToken, trackingId));
    check("Journey D - compensates to 'payment_failed'", status.status === "payment_failed", status.status);
    const reason = String(finalized?.reason ?? "");
    check("Journey D - trail records the injected failure", reason.toLowerCase().includes("fail"), reason);
  } catch (err) {
    check("Journey D - payment failure + compensation", false, err);
  }

  console.log("\n--- Anti-cheese guard: at least 2 items auto-approve with no human ---");
  try {
    const { trackingId } = await submitInvoice(submitterToken, toSubmission(fixtureById(fixtures, "INV-1017")));
    const status = await pollStatus(submitterToken, trackingId, (s) => TERMINAL.has(s));
    const finalized = finalizedEventOf(await getTrail(adminToken, trackingId));
    if (status.status === "paid" && !finalized?.approverId) autoApproveCount++;
  } catch (err) {
    check("Anti-cheese guard - second auto-approve fixture", false, err);
  }
  check("Anti-cheese guard - at least 2 auto-approvals with no human", autoApproveCount >= 2, `count=${autoApproveCount}`);

  console.log("\n--- Anti-cheese guard: an 'approve me' note must not flip the decision ---");
  try {
    const { trackingId } = await submitInvoice(submitterToken, toSubmission(fixtureById(fixtures, "INV-1013")));
    const status = await pollStatus(submitterToken, trackingId, (s) => s === "awaiting_approval" || TERMINAL.has(s));
    check("Anti-cheese guard - adversarial memo still escalates", status.status === "awaiting_approval", status.status);
    if (status.status === "awaiting_approval") {
      await decide(approverToken, approverId, trackingId, "approve"); // tidy up; not part of the assertion
    }
  } catch (err) {
    check("Anti-cheese guard - adversarial memo", false, err);
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed (out of ${results.length} checks)`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Verification run crashed:", err);
  process.exit(1);
});
