import { useEffect, useState } from "react";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { StatusChip } from "../../../components/StatusChip/StatusChip";
import { api, ApiError } from "../../../api/client";
import { formatMoney, formatDateTime } from "../../../lib/format";
import type { InvoiceRecord } from "../../../api/types";
import styles from "./AllInvoices.module.css";

export function AllInvoices() {
  const [items, setItems] = useState<InvoiceRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getAllInvoices()
      .then((res) => setItems(res.items))
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Could not reach the submission service."),
      );
  }, []);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!items) return <CircularProgress size={24} />;
  if (items.length === 0) {
    return (
      <Paper variant="outlined" className={styles.empty}>
        <Typography color="text.secondary">No invoices submitted yet.</Typography>
      </Paper>
    );
  }

  return (
    <Paper variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Pretty ID</TableCell>
            <TableCell>Vendor</TableCell>
            <TableCell>Submitted by</TableCell>
            <TableCell>Status</TableCell>
            <TableCell align="right">Total</TableCell>
            <TableCell>Submitted at</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.trackingId}>
              <TableCell>
                <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                  <div>{item.prettyId}</div>
                  <IconButton
                    size="small"
                    onClick={() => navigator.clipboard.writeText(item.prettyId)}
                    aria-label="copy invoice id"
                  >
                    <ContentCopyIcon fontSize="inherit" />
                  </IconButton>
                </Stack>
                <div className={styles.trackingId}>{item.trackingId}</div>
              </TableCell>
              <TableCell>{item.vendor}</TableCell>
              <TableCell>{item.submittedByUsername ?? item.submitter ?? "—"}</TableCell>
              <TableCell>
                <StatusChip value={item.status} />
              </TableCell>
              <TableCell align="right">{formatMoney(item.total, item.currency)}</TableCell>
              <TableCell>{formatDateTime(item.submittedAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  );
}
