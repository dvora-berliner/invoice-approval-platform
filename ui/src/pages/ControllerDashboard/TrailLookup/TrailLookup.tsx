import { useState } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import { api, ApiError } from "../../../api/client";
import { formatDateTime, formatMoney } from "../../../lib/format";
import type { DecisionEventRow } from "../../../api/types";
import styles from "./TrailLookup.module.css";

function summarize(row: DecisionEventRow): string {
  const p = row.payload as Record<string, unknown>;
  switch (row.event_type) {
    case "InvoiceSubmitted":
      return `${p.vendor ?? "—"} · ${p.invoiceNumber ?? "—"} · ${
        typeof p.total === "number" ? formatMoney(p.total, String(p.currency ?? "USD")) : ""
      }`;
    case "DecisionFinalized":
      return `${p.outcome ?? ""} — ${p.reason ?? ""}`;
    case "EscalationCreated":
      return `Escalated — ${p.reason ?? ""}`;
    case "InfoRequested":
      return `Info requested by ${p.approverId ?? "approver"}${p.reason ? `: ${p.reason}` : ""}`;
    case "InvoiceSupplemented":
      return "Submitter provided additional information";
    default:
      return JSON.stringify(p);
  }
}

export function TrailLookup() {
  const [id, setId] = useState("");
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<DecisionEventRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim()) return;
    setLoading(true);
    setError(null);
    setEvents(null);
    try {
      const res = await api.getTrail(id.trim());
      setEvents(res.events);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach audit-service.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 560 }}>
        Reconstructs the full decision trail for a tracking id or correlation id, in the order
        events were recorded.
      </Typography>

      <Box component="form" onSubmit={lookup} className={styles.lookupRow}>
        <TextField
          label="Tracking id or correlation id"
          value={id}
          onChange={(e) => setId(e.target.value)}
          fullWidth
        />
        <Button type="submit" variant="contained" disabled={loading} sx={{ px: 3 }}>
          {loading ? <CircularProgress size={20} color="inherit" /> : "Look up"}
        </Button>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      {events && events.length === 0 && (
        <Typography className={styles.empty}>No events recorded for this id.</Typography>
      )}

      {events && events.length > 0 && (
        <Stack spacing={2} className={styles.timeline}>
          {events.map((row) => (
            <Box key={row.id} className={styles.event}>
              <Box className={styles.eventHeader}>
                <Chip label={row.event_type} size="small" variant="outlined" />
                <Typography variant="body2" className={styles.eventTime}>
                  {formatDateTime(row.occurred_at)}
                </Typography>
              </Box>
              <Typography variant="body2" className={styles.eventSummary}>
                {summarize(row)}
              </Typography>
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}
