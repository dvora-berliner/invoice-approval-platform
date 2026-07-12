import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Divider from "@mui/material/Divider";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import RefreshIcon from "@mui/icons-material/Refresh";
import { StatusChip } from "../../components/StatusChip/StatusChip";
import { api, ApiError } from "../../api/client";
import { formatMoney, formatDateTime, formatPercent } from "../../lib/format";
import type { ApprovalAction, ApprovalQueueItem } from "../../api/types";
import styles from "./ApproverQueue.module.css";

export function ApproverQueue() {
  const [items, setItems] = useState<ApprovalQueueItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [approverId, setApproverId] = useState("");
  const [reason, setReason] = useState("");
  const [busyAction, setBusyAction] = useState<ApprovalAction | null>(null);
  const [actionResult, setActionResult] = useState<{ ok: boolean; message: string } | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getApprovalQueue();
      setItems(res.items);
      setSelectedId((current) =>
        current && res.items.some((i) => i.trackingId === current) ? current : res.items[0]?.trackingId ?? null,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach workflow-service.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const selected = items?.find((i) => i.trackingId === selectedId) ?? null;

  const decide = async (action: ApprovalAction) => {
    if (!selected) return;
    if (!approverId.trim()) {
      setActionResult({ ok: false, message: "Enter your approver id first." });
      return;
    }
    setBusyAction(action);
    setActionResult(null);
    try {
      await api.decideApproval(selected.trackingId, {
        approverId: approverId.trim(),
        action,
        reason: reason.trim() || undefined,
      });
      setActionResult({ ok: true, message: `Recorded: ${action.replace("_", " ")}.` });
      setReason("");
      await load();
    } catch (err) {
      setActionResult({
        ok: false,
        message: err instanceof ApiError ? err.message : "Could not record the decision.",
      });
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <Box>
      <Stack direction="row" className={styles.header}>
        <Box>
          <Typography variant="overline" className={styles.eyebrow}>
            Approver
          </Typography>
          <Typography variant="h1" className={styles.title}>
            Approval queue
          </Typography>
          <Typography variant="subtitle1" className={styles.subtitle}>
            Items the agent escalated for human review.
          </Typography>
        </Box>
        <Button startIcon={<RefreshIcon />} onClick={load} disabled={loading}>
          Refresh
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading && !items ? (
        <CircularProgress size={24} />
      ) : items && items.length === 0 ? (
        <Paper variant="outlined" className={styles.empty}>
          <Typography color="text.secondary">Queue is empty. Nothing waiting on a human right now.</Typography>
        </Paper>
      ) : (
        <Box className={styles.layout}>
          <Paper variant="outlined">
            <List disablePadding>
              {items?.map((item) => (
                <ListItemButton
                  key={item.trackingId}
                  selected={item.trackingId === selectedId}
                  onClick={() => setSelectedId(item.trackingId)}
                  className={`${styles.listItem} ${item.trackingId === selectedId ? styles.listItemSelected : ""}`}
                >
                  <Box className={styles.itemRow}>
                    <Typography variant="body2" className={styles.vendorName}>
                      {item.invoice.vendor}
                    </Typography>
                    <Typography variant="body2">
                      {formatMoney(item.invoice.total, item.invoice.currency)}
                    </Typography>
                  </Box>
                  <Box className={styles.itemRowSpaced}>
                    <Typography variant="body2" className={styles.listItemId}>
                      {item.trackingId.slice(0, 8)}
                    </Typography>
                    <StatusChip value={item.decision.route} />
                  </Box>
                </ListItemButton>
              ))}
            </List>
          </Paper>

          {selected && (
            <Paper variant="outlined" className={styles.detailCard}>
              <Stack direction="row" spacing={1.5} className={styles.titleRow}>
                <Typography variant="h2">
                  {selected.invoice.vendor} · {selected.invoice.invoiceNumber}
                </Typography>
                <StatusChip value={selected.decision.route} />
              </Stack>
              <Typography variant="body2" color="text.secondary" className={styles.trackingId}>
                {selected.trackingId}
              </Typography>

              <Box className={styles.metaGrid}>
                <Field label="Amount">{formatMoney(selected.invoice.total, selected.invoice.currency)}</Field>
                <Field label="USD equivalent">{formatMoney(selected.decision.usdAmount)}</Field>
                <Field label="Applied ceiling">{formatMoney(selected.decision.appliedCeiling)}</Field>
                <Field label="Confidence">{formatPercent(selected.decision.confidence)}</Field>
                <Field label="Category">{selected.invoice.category ?? "—"}</Field>
                <Field label="Department">{selected.invoice.department ?? "—"}</Field>
              </Box>

              <Divider className={styles.divider} />

              <Typography variant="h3" className={styles.sectionHeading}>
                Agent recommendation
              </Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                {selected.decision.reason}
              </Typography>
              {selected.decision.agentReasoning && (
                <Paper variant="outlined" className={styles.reasoningBlock}>
                  <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>
                    {selected.decision.agentReasoning}
                  </Typography>
                </Paper>
              )}
              {selected.decision.citedRules.length > 0 && (
                <Stack direction="row" spacing={0.75} useFlexGap className={styles.rulesRow}>
                  {selected.decision.citedRules.map((rule) => (
                    <Chip key={rule} label={rule} size="small" variant="outlined" sx={{ mb: 0.75 }} />
                  ))}
                </Stack>
              )}

              <Divider className={styles.divider} />

              <Typography variant="h3" className={styles.sectionHeading}>
                Your decision
              </Typography>
              <Stack spacing={1.5} className={styles.decisionForm}>
                <TextField
                  label="Approver id"
                  size="small"
                  value={approverId}
                  onChange={(e) => setApproverId(e.target.value)}
                  sx={{ maxWidth: 320 }}
                />
                <TextField
                  label="Reason / note (optional)"
                  size="small"
                  multiline
                  minRows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <Stack direction="row" spacing={1.5}>
                  <Button
                    variant="contained"
                    color="primary"
                    disabled={busyAction !== null}
                    onClick={() => decide("approve")}
                  >
                    {busyAction === "approve" ? "..." : "Approve"}
                  </Button>
                  <Button
                    variant="outlined"
                    color="secondary"
                    disabled={busyAction !== null}
                    onClick={() => decide("reject")}
                  >
                    {busyAction === "reject" ? "..." : "Reject"}
                  </Button>
                  <Button
                    variant="text"
                    disabled={busyAction !== null}
                    onClick={() => decide("request_info")}
                  >
                    {busyAction === "request_info" ? "..." : "Request info"}
                  </Button>
                </Stack>
              </Stack>

              {actionResult && (
                <Alert severity={actionResult.ok ? "success" : "error"} sx={{ mt: 2 }}>
                  {actionResult.message}
                </Alert>
              )}

              <Typography variant="body2" className={styles.timestamp}>
                Escalated {formatDateTime(selected.createdAt)}
              </Typography>
            </Paper>
          )}
        </Box>
      )}
    </Box>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography variant="overline" className={styles.fieldLabel}>
        {label}
      </Typography>
      <Typography variant="body2">{children}</Typography>
    </Box>
  );
}
