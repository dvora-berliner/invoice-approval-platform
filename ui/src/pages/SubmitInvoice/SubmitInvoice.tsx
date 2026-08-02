import { useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import Divider from "@mui/material/Divider";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { api, ApiError } from "../../api/client";
import type { LineItem } from "../../api/types";
import styles from "./SubmitInvoice.module.css";

const CURRENCIES = ["USD", "EUR", "GBP"];
const CATEGORIES = ["meals", "saas", "hardware", "travel", "other"];
const DEPARTMENTS = ["engineering-2026Q2", "sales-2026Q2", "marketing-2026Q2"];

interface FormState {
  vendor: string;
  invoiceNumber: string;
  total: string;
  currency: string;
  category: string;
  department: string;
  submitter: string;
  attendees: string;
  taxAmount: string;
  receiptPresent: boolean;
  date: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  vendor: "",
  invoiceNumber: "",
  total: "",
  currency: "USD",
  category: "saas",
  department: "",
  submitter: "",
  attendees: "",
  taxAmount: "",
  receiptPresent: true,
  date: new Date().toISOString().slice(0, 10),
  notes: "",
};

type Result =
  | { kind: "ok"; trackingId: string; prettyId?: string; duplicate: boolean; message?: string }
  | { kind: "error"; message: string; fieldErrors?: Record<string, string[]> };

export function SubmitInvoice() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const addLineItem = () =>
    setLineItems((items) => [...items, { description: "", quantity: 1, unitPrice: 0 }]);

  const updateLineItem = (index: number, patch: Partial<LineItem>) =>
    setLineItems((items) => items.map((it, i) => (i === index ? { ...it, ...patch } : it)));

  const removeLineItem = (index: number) =>
    setLineItems((items) => items.filter((_, i) => i !== index));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    try {
      const payload = {
        vendor: form.vendor.trim(),
        invoiceNumber: form.invoiceNumber.trim(),
        total: Number(form.total),
        currency: form.currency,
        category: form.category,
        department: form.department.trim() || undefined,
        submitter: form.submitter.trim() || undefined,
        attendees: form.attendees ? Number(form.attendees) : undefined,
        taxAmount: form.taxAmount ? Number(form.taxAmount) : undefined,
        receiptPresent: form.receiptPresent,
        date: form.date || undefined,
        notes: form.notes.trim() || undefined,
        lineItems: lineItems.length ? lineItems : undefined,
      };
      const res = await api.submitInvoice(payload);
      setResult({
        kind: "ok",
        trackingId: res.trackingId,
        prettyId: res.prettyId,
        duplicate: Boolean(res.duplicateSubmission),
        message: res.message,
      });
      if (!res.duplicateSubmission) {
        setForm(EMPTY_FORM);
        setLineItems([]);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        const fieldErrors =
          err.details && typeof err.details === "object" && "fieldErrors" in err.details
            ? ((err.details as { fieldErrors: Record<string, string[]> }).fieldErrors)
            : undefined;
        setResult({ kind: "error", message: err.message, fieldErrors });
      } else {
        setResult({ kind: "error", message: "Could not reach the submission service." });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box className={styles.page}>
      <Typography variant="overline" className={styles.eyebrow}>
        Submitter
      </Typography>
      <Typography variant="h1" className={styles.title}>
        Submit an invoice
      </Typography>
      <Typography variant="subtitle1" className={styles.subtitle}>
        A tracking id is issued immediately - the routing decision happens after.
      </Typography>

      <Paper variant="outlined" className={styles.formCard}>
        <Box component="form" onSubmit={handleSubmit}>
          <Box className={styles.grid}>
            <TextField
              label="Vendor"
              required
              value={form.vendor}
              onChange={(e) => set("vendor", e.target.value)}
              error={Boolean(result?.kind === "error" && result.fieldErrors?.vendor)}
              helperText={result?.kind === "error" ? result.fieldErrors?.vendor?.[0] : undefined}
            />
            <TextField
              label="Invoice number"
              required
              value={form.invoiceNumber}
              onChange={(e) => set("invoiceNumber", e.target.value)}
              error={Boolean(result?.kind === "error" && result.fieldErrors?.invoiceNumber)}
              helperText={result?.kind === "error" ? result.fieldErrors?.invoiceNumber?.[0] : undefined}
            />
            <TextField
              label="Total"
              required
              type="number"
              slotProps={{ htmlInput: { step: "0.01", min: 0 } }}
              value={form.total}
              onChange={(e) => set("total", e.target.value)}
              error={Boolean(result?.kind === "error" && result.fieldErrors?.total)}
              helperText={result?.kind === "error" ? result.fieldErrors?.total?.[0] : undefined}
            />
            <TextField
              select
              label="Currency"
              value={form.currency}
              onChange={(e) => set("currency", e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <MenuItem key={c} value={c}>
                  {c}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Category"
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <MenuItem key={c} value={c}>
                  {c}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Department / budget pool"
              value={form.department}
              onChange={(e) => set("department", e.target.value)}
            >
              <MenuItem value="">
                <em>Not specified</em>
              </MenuItem>
              {DEPARTMENTS.map((d) => (
                <MenuItem key={d} value={d}>
                  {d}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Submitter email"
              type="email"
              value={form.submitter}
              onChange={(e) => set("submitter", e.target.value)}
            />
            <TextField
              label="Date"
              type="date"
              value={form.date}
              onChange={(e) => set("date", e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Attendees"
              type="number"
              slotProps={{ htmlInput: { min: 0 } }}
              value={form.attendees}
              onChange={(e) => set("attendees", e.target.value)}
              helperText="Relevant for meals & entertainment"
            />
            <TextField
              label="Tax amount"
              type="number"
              slotProps={{ htmlInput: { step: "0.01", min: 0 } }}
              value={form.taxAmount}
              onChange={(e) => set("taxAmount", e.target.value)}
            />
          </Box>

          <FormControlLabel
            className={styles.receiptToggle}
            control={
              <Checkbox
                checked={form.receiptPresent}
                onChange={(e) => set("receiptPresent", e.target.checked)}
              />
            }
            label="Receipt is attached / on file"
          />

          <TextField
            label="Notes"
            multiline
            minRows={2}
            className={styles.notesField}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />

          <Divider className={styles.divider} />

          <Stack direction="row" className={styles.sectionHeader}>
            <Typography variant="h3">Line items</Typography>
            <Button size="small" startIcon={<AddIcon />} onClick={addLineItem}>
              Add line
            </Button>
          </Stack>

          {lineItems.length === 0 && (
            <Typography variant="body2" className={styles.hint}>
              Optional - add a breakdown if the invoice covers more than one item.
            </Typography>
          )}

          <Stack spacing={1.5}>
            {lineItems.map((item, i) => (
              <Stack key={i} direction="row" spacing={1.5} className={styles.lineItemEditRow}>
                <TextField
                  label="Description"
                  size="small"
                  fullWidth
                  value={item.description}
                  onChange={(e) => updateLineItem(i, { description: e.target.value })}
                />
                <TextField
                  label="Qty"
                  size="small"
                  type="number"
                  sx={{ width: 100 }}
                  value={item.quantity}
                  onChange={(e) => updateLineItem(i, { quantity: Number(e.target.value) })}
                />
                <TextField
                  label="Unit price"
                  size="small"
                  type="number"
                  sx={{ width: 130 }}
                  value={item.unitPrice}
                  onChange={(e) => updateLineItem(i, { unitPrice: Number(e.target.value) })}
                />
                <IconButton size="small" onClick={() => removeLineItem(i)} className={styles.lineItemRemove}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Stack>
            ))}
          </Stack>

          <Divider className={styles.divider} />

          <Button type="submit" variant="contained" size="large" disabled={submitting}>
            {submitting ? "Submitting..." : "Submit invoice"}
          </Button>
        </Box>
      </Paper>

      {result?.kind === "ok" && (
        <Alert severity={result.duplicate ? "warning" : "success"} className={styles.resultAlert}>
          <Stack direction="row" spacing={1} className={styles.trackingRow}>
            <span>
              {result.duplicate ? "Already submitted." : "Received."}{" "}
              {result.prettyId && (
                <>
                  Reference: <strong>{result.prettyId}</strong>{" "}
                </>
              )}
              Tracking id: <strong className={styles.trackingId}>{result.trackingId}</strong>
            </span>
            <IconButton
              size="small"
              onClick={() => navigator.clipboard.writeText(result.prettyId ?? result.trackingId)}
              aria-label="copy invoice id"
            >
              <ContentCopyIcon fontSize="inherit" />
            </IconButton>
          </Stack>
          {result.message && (
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              {result.message}
            </Typography>
          )}
        </Alert>
      )}

      {result?.kind === "error" && (
        <Alert severity="error" className={styles.resultAlert}>
          {result.message}
        </Alert>
      )}
    </Box>
  );
}
