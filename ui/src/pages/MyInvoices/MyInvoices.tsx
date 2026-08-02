import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import IconButton from "@mui/material/IconButton";
import RefreshIcon from "@mui/icons-material/Refresh";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { StatusChip } from "../../components/StatusChip/StatusChip";
import { api, ApiError } from "../../api/client";
import { formatMoney, formatDateTime } from "../../lib/format";
import type { InvoiceRecord } from "../../api/types";
import styles from "./MyInvoices.module.css";

const DETAIL_FIELDS: Array<[keyof InvoiceRecord, string]> = [
  ["category", "Category"],
  ["department", "Department"],
  ["date", "Invoice date"],
  ["taxAmount", "Tax amount"],
  ["receiptPresent", "Receipt present"],
  ["notes", "Notes"],
];

export function MyInvoices() {
  const [items, setItems] = useState<InvoiceRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getMyInvoices();
      setItems(res.items);
      setSelectedId((current) =>
        current && res.items.some((i) => i.trackingId === current) ? current : (res.items[0]?.trackingId ?? null),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the submission service.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const selected = items?.find((i) => i.trackingId === selectedId) ?? null;

  return (
    <Box>
      <Stack direction="row" className={styles.header}>
        <Box>
          <Typography variant="overline" className={styles.eyebrow}>
            Submitter
          </Typography>
          <Typography variant="h1" className={styles.title}>
            My invoices
          </Typography>
          <Typography variant="subtitle1" className={styles.subtitle}>
            Everything you've submitted, with its current status.
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
          <Typography color="text.secondary">You haven't submitted anything yet.</Typography>
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
                    <Typography variant="body2" className={styles.prettyId}>
                      {item.prettyId}
                    </Typography>
                    <StatusChip value={item.status} />
                  </Box>
                  <Box className={styles.itemRowSpaced}>
                    <Typography variant="body2" className={styles.vendorName}>
                      {item.vendor}
                    </Typography>
                    <Typography variant="body2">{formatMoney(item.total, item.currency)}</Typography>
                  </Box>
                </ListItemButton>
              ))}
            </List>
          </Paper>

          {selected && (
            <Paper variant="outlined" className={styles.detailCard}>
              <Stack direction="row" spacing={1.5} className={styles.titleRow}>
                <Typography variant="h2">
                  {selected.vendor} · {selected.invoiceNumber}
                </Typography>
                <StatusChip value={selected.status} />
              </Stack>
              <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                <Typography variant="body2" className={styles.trackingId}>
                  {selected.prettyId} · {selected.trackingId}
                </Typography>
                <IconButton
                  size="small"
                  onClick={() => navigator.clipboard.writeText(selected.prettyId)}
                  aria-label="copy invoice id"
                >
                  <ContentCopyIcon fontSize="inherit" />
                </IconButton>
              </Stack>

              <Typography sx={{ mt: 2 }}>{selected.message}</Typography>
              {selected.reason && selected.reason !== selected.message && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  Reason: {selected.reason}
                </Typography>
              )}

              <Divider className={styles.divider} />

              <Box className={styles.detailGrid}>
                <Field label="Total">{formatMoney(selected.total, selected.currency)}</Field>
                <Field label="Submitted">{formatDateTime(selected.submittedAt)}</Field>
                {DETAIL_FIELDS.map(([key, label]) => {
                  const value = selected[key];
                  if (value === undefined || value === null || value === "") return null;
                  return (
                    <Field key={key} label={label}>
                      {typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)}
                    </Field>
                  );
                })}
              </Box>
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
