import { useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import Divider from "@mui/material/Divider";
import Collapse from "@mui/material/Collapse";
import CircularProgress from "@mui/material/CircularProgress";
import { StatusChip } from "../../components/StatusChip/StatusChip";
import { api, ApiError } from "../../api/client";
import { formatMoney, formatDateTime } from "../../lib/format";
import type { InvoiceRecord } from "../../api/types";
import styles from "./CheckStatus.module.css";

const DETAIL_FIELDS: Array<[keyof InvoiceRecord, string]> = [
  ["submitter", "Submitter"],
  ["category", "Category"],
  ["department", "Department"],
  ["date", "Invoice date"],
  ["taxAmount", "Tax amount"],
  ["receiptPresent", "Receipt present"],
  ["notes", "Notes"],
];

export function CheckStatus() {
  const [trackingId, setTrackingId] = useState("");
  const [loading, setLoading] = useState(false);
  const [record, setRecord] = useState<InvoiceRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSupplement, setShowSupplement] = useState(false);
  const [supplementNotes, setSupplementNotes] = useState("");
  const [supplementBusy, setSupplementBusy] = useState(false);
  const [supplementResult, setSupplementResult] = useState<string | null>(null);

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackingId.trim()) return;
    setLoading(true);
    setError(null);
    setRecord(null);
    setSupplementResult(null);
    try {
      const res = await api.getStatus(trackingId.trim());
      setRecord(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the submission service.");
    } finally {
      setLoading(false);
    }
  };

  const sendSupplement = async (record: InvoiceRecord) => {
    setSupplementBusy(true);
    setSupplementResult(null);
    try {
      await api.supplementInvoice(record.trackingId, { notes: supplementNotes.trim() });
      setSupplementResult("Additional information sent - this record will be re-evaluated.");
      setSupplementNotes("");
      setShowSupplement(false);
      const refreshed = await api.getStatus(record.trackingId);
      setRecord(refreshed);
    } catch (err) {
      setSupplementResult(
        err instanceof ApiError ? err.message : "Could not send the supplement.",
      );
    } finally {
      setSupplementBusy(false);
    }
  };

  return (
    <Box className={styles.page}>
      <Typography variant="overline" className={styles.eyebrow}>
        Submitter
      </Typography>
      <Typography variant="h1" className={styles.title}>
        Check invoice status
      </Typography>
      <Typography variant="subtitle1" className={styles.subtitle}>
        Look up the current state of a submission by its tracking id.
      </Typography>

      <Paper variant="outlined" className={styles.lookupCard}>
        <Box component="form" onSubmit={lookup}>
          <Stack direction="row" spacing={1.5}>
            <TextField
              label="Tracking id"
              value={trackingId}
              onChange={(e) => setTrackingId(e.target.value)}
              fullWidth
              placeholder="e.g. 8f2e1c3a-..."
            />
            <Button type="submit" variant="contained" disabled={loading} sx={{ px: 3 }}>
              {loading ? <CircularProgress size={20} color="inherit" /> : "Look up"}
            </Button>
          </Stack>
        </Box>
      </Paper>

      {error && (
        <Alert severity="error" className={styles.resultCard}>
          {error}
        </Alert>
      )}

      {record && (
        <Paper variant="outlined" className={styles.resultCard}>
          <Stack direction="row" spacing={1.5} className={styles.titleRow}>
            <Typography variant="h2">
              {record.vendor} · {record.invoiceNumber}
            </Typography>
            <StatusChip value={record.status} />
          </Stack>
          <Typography variant="body2" color="text.secondary" className={styles.trackingId}>
            {record.trackingId}
          </Typography>

          <Typography className={styles.message}>{record.message}</Typography>
          {record.reason && record.reason !== record.message && (
            <Typography variant="body2" className={styles.reason}>
              Reason: {record.reason}
            </Typography>
          )}

          <Divider className={styles.divider} />

          <Box className={styles.detailGrid}>
            <Field label="Total">{formatMoney(record.total, record.currency)}</Field>
            <Field label="Submitted">{formatDateTime(record.submittedAt)}</Field>
            {DETAIL_FIELDS.map(([key, label]) => {
              const value = record[key];
              if (value === undefined || value === null || value === "") return null;
              return (
                <Field key={key} label={label}>
                  {typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)}
                </Field>
              );
            })}
          </Box>

          {record.lineItems && record.lineItems.length > 0 && (
            <>
              <Divider className={styles.divider} />
              <Typography variant="h3" className={styles.sectionHeading}>
                Line items
              </Typography>
              <Stack spacing={0.5}>
                {record.lineItems.map((li, i) => (
                  <Box key={i} className={styles.lineItemRow}>
                    <Typography variant="body2">
                      {li.description || "—"} × {li.quantity}
                    </Typography>
                    <Typography variant="body2">{formatMoney(li.unitPrice * li.quantity, record.currency)}</Typography>
                  </Box>
                ))}
              </Stack>
            </>
          )}

          <Divider className={styles.divider} />

          <Button variant="outlined" size="small" onClick={() => setShowSupplement((v) => !v)}>
            {showSupplement ? "Cancel" : "Provide additional information"}
          </Button>

          <Collapse in={showSupplement}>
            <Stack spacing={1.5} className={styles.supplementForm}>
              <TextField
                label="What would you like to add?"
                multiline
                minRows={2}
                value={supplementNotes}
                onChange={(e) => setSupplementNotes(e.target.value)}
              />
              <Box>
                <Button
                  variant="contained"
                  size="small"
                  disabled={supplementBusy || !supplementNotes.trim()}
                  onClick={() => sendSupplement(record)}
                >
                  {supplementBusy ? "Sending..." : "Send"}
                </Button>
              </Box>
            </Stack>
          </Collapse>

          {supplementResult && (
            <Alert severity="info" sx={{ mt: 2 }}>
              {supplementResult}
            </Alert>
          )}
        </Paper>
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
