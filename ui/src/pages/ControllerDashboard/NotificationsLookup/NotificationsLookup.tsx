import { useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import { api, ApiError } from "../../../api/client";
import { formatDateTime } from "../../../lib/format";
import type { NotificationsResponse } from "../../../api/types";
import styles from "./NotificationsLookup.module.css";

export function NotificationsLookup() {
  const [trackingId, setTrackingId] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<NotificationsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackingId.trim()) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await api.getNotifications(trackingId.trim());
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach audit-service.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 560 }}>
        The lifecycle of submitter-facing notifications for a single tracking id - what would
        have been emailed, in order.
      </Typography>

      <Box component="form" onSubmit={lookup} className={styles.lookupRow}>
        <TextField
          label="Tracking id"
          value={trackingId}
          onChange={(e) => setTrackingId(e.target.value)}
          fullWidth
        />
        <Button type="submit" variant="contained" disabled={loading} sx={{ px: 3 }}>
          {loading ? <CircularProgress size={20} color="inherit" /> : "Look up"}
        </Button>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      {data && (
        <>
          <Paper variant="outlined" className={styles.latestCard}>
            <Typography variant="overline" className={styles.latestLabel}>
              Latest
            </Typography>
            <Typography sx={{ mt: 0.5 }}>{data.latest.message}</Typography>
            <Typography variant="body2" className={styles.historyTime} sx={{ mt: 0.5 }}>
              {formatDateTime(data.latest.occurredAt)}
            </Typography>
          </Paper>

          {data.history.length > 1 && (
            <Stack className={styles.historyList}>
              {data.history.map((entry, i) => (
                <Box key={i} className={styles.historyItem}>
                  <Typography variant="body2">{entry.message}</Typography>
                  <Typography variant="body2" className={styles.historyTime}>
                    {formatDateTime(entry.occurredAt)}
                  </Typography>
                </Box>
              ))}
            </Stack>
          )}
        </>
      )}
    </Box>
  );
}
