import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../src/policy/configStore", () => ({
  loadThresholds: vi.fn(),
  loadFxRates: vi.fn(),
}));

import { loadFxRates, loadThresholds } from "../src/policy/configStore";
import { buildApp } from "../src/app";
import type { LLMProvider, LLMRecommendation } from "../src/llm/provider";

const loadThresholdsMock = vi.mocked(loadThresholds);
const loadFxRatesMock = vi.mocked(loadFxRates);

function fakeProvider(impl: (invoice: unknown, usdAmount: number) => Promise<LLMRecommendation>): LLMProvider {
  return { recommend: impl };
}

const validInvoice = { trackingId: "t1", vendor: "Atlassian", invoiceNumber: "INV-1", total: 50 };

beforeEach(() => {
  vi.clearAllMocks();
  loadThresholdsMock.mockResolvedValue({ ceiling: 250, confidence: 0.8 });
  loadFxRatesMock.mockResolvedValue({ USD: 1 });
});

describe("GET /healthz", () => {
  it("reports ok", async () => {
    const app = buildApp(fakeProvider(async () => ({ recommendedRoute: "auto_approve", confidence: 1, citedRules: [], reasoning: "" })), () => "policy");
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", service: "decision-service" });
  });
});

describe("POST /decide", () => {
  it("rejects an invalid invoice with 400", async () => {
    const app = buildApp(fakeProvider(async () => ({ recommendedRoute: "auto_approve", confidence: 1, citedRules: [], reasoning: "" })), () => "policy");
    const res = await request(app).post("/decide").send({ vendor: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid invoice");
  });

  it("returns 400 for an unsupported currency", async () => {
    loadFxRatesMock.mockResolvedValue({ USD: 1 });
    const app = buildApp(fakeProvider(async () => ({ recommendedRoute: "auto_approve", confidence: 1, citedRules: [], reasoning: "" })), () => "policy");

    const res = await request(app).post("/decide").send({ ...validInvoice, currency: "XYZ" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Unsupported currency");
  });

  it("escalates to human_review when the LLM provider fails", async () => {
    const app = buildApp(fakeProvider(async () => Promise.reject(new Error("provider down"))), () => "policy");

    const res = await request(app).post("/decide").send(validInvoice);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      route: "human_review",
      usdAmount: 50,
      confidence: 0,
      citedRules: [],
      reason: "AI provider unavailable",
      appliedCeiling: 250,
    });
  });

  it("auto-approves a compliant invoice and includes the agent's reasoning", async () => {
    const app = buildApp(
      fakeProvider(async () => ({ recommendedRoute: "auto_approve", confidence: 0.95, citedRules: [], reasoning: "all good" })),
      () => "policy",
    );

    const res = await request(app).post("/decide").send({ ...validInvoice, receiptPresent: true });

    expect(res.status).toBe(200);
    expect(res.body.route).toBe("auto_approve");
    expect(res.body.agentReasoning).toBe("all good");
  });

  it("escalates when the agent cites a policy violation", async () => {
    const app = buildApp(
      fakeProvider(async () => ({
        recommendedRoute: "human_review",
        confidence: 0.9,
        citedRules: ["MEAL-02"],
        reasoning: "no client name found",
      })),
      () => "policy",
    );

    const res = await request(app).post("/decide").send({ ...validInvoice, category: "meals" });

    expect(res.status).toBe(200);
    expect(res.body.route).toBe("human_review");
    expect(res.body.citedRules).toContain("MEAL-02");
  });

  it("returns 500 when an unexpected error occurs after FX conversion", async () => {
    loadThresholdsMock.mockRejectedValue(new Error("boom"));
    const app = buildApp(fakeProvider(async () => ({ recommendedRoute: "auto_approve", confidence: 1, citedRules: [], reasoning: "" })), () => "policy");

    const res = await request(app).post("/decide").send(validInvoice);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to reach a decision" });
  });
});
