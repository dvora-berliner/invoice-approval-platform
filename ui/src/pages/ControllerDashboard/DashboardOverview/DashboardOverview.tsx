import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import { StatCard } from "../../../components/StatCard/StatCard";
import { BarSeries } from "../../../components/BarRow/BarRow";
import { api, ApiError } from "../../../api/client";
import { formatMoney } from "../../../lib/format";
import type { DashboardStats } from "../../../api/types";
import styles from "./DashboardOverview.module.css";

function sortedEntries(record: Record<string, number>): Array<[string, number]> {
  return Object.entries(record).sort(([a], [b]) => a.localeCompare(b));
}

export function DashboardOverview() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getDashboard()
      .then(setStats)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not reach audit-service."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <CircularProgress size={24} />;
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!stats) return null;

  return (
    <Box>
      <Box className={styles.statGrid}>
        <StatCard label="Submitted" value={stats.totalSubmitted} />
        <StatCard label="Escalated to human" value={stats.totalEscalated} />
        <StatCard label="Finalized" value={stats.totalFinalized} />
        <StatCard label="Rejected" value={stats.rejected} />
        <StatCard
          label="Auto-approved"
          value={stats.autoApproved.count}
          sub={formatMoney(stats.autoApproved.usdAmount)}
        />
        <StatCard
          label="Human-approved"
          value={stats.humanApproved.count}
          sub={formatMoney(stats.humanApproved.usdAmount)}
        />
      </Box>

      <Box className={styles.chartGrid}>
        <Paper variant="outlined" className={styles.chartCard}>
          <Typography variant="h3" className={styles.chartTitle}>
            Submitted per day
          </Typography>
          {Object.keys(stats.submittedByDay).length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No submissions yet.
            </Typography>
          ) : (
            <BarSeries data={sortedEntries(stats.submittedByDay)} />
          )}
        </Paper>
        <Paper variant="outlined" className={styles.chartCard}>
          <Typography variant="h3" className={styles.chartTitle}>
            Finalized per day
          </Typography>
          {Object.keys(stats.finalizedByDay).length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Nothing finalized yet.
            </Typography>
          ) : (
            <BarSeries data={sortedEntries(stats.finalizedByDay)} />
          )}
        </Paper>
      </Box>
    </Box>
  );
}
