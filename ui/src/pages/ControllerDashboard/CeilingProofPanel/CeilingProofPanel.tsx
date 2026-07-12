import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import { StatCard } from "../../../components/StatCard/StatCard";
import { api, ApiError } from "../../../api/client";
import { formatMoney } from "../../../lib/format";
import type { CeilingProof } from "../../../api/types";
import styles from "./CeilingProofPanel.module.css";

export function CeilingProofPanel() {
  const [proof, setProof] = useState<CeilingProof | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getCeilingProof()
      .then(setProof)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not reach audit-service."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <CircularProgress size={24} />;
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!proof) return null;

  return (
    <Box>
      <Typography variant="body2" className={styles.intro}>
        Verifies that no finalized auto-approval ever exceeded the autonomy ceiling that was in
        effect at the time - the deterministic guard, not the agent, is what's being checked here.
      </Typography>

      <Box className={styles.summaryGrid}>
        <StatCard label="Current ceiling" value={formatMoney(proof.currentCeiling)} />
        <StatCard label="Items checked" value={proof.itemsChecked} />
        <Paper variant="outlined" className={styles.resultCard}>
          <Typography variant="overline" className={styles.resultLabel}>
            Result
          </Typography>
          <Box className={styles.resultChip}>
            <Chip
              label={proof.passed ? "Passed" : "Violations found"}
              color={proof.passed ? "success" : "error"}
              size="small"
              sx={{ fontWeight: 700 }}
            />
          </Box>
        </Paper>
      </Box>

      {proof.violations.length > 0 && (
        <>
          <Divider className={styles.divider} />
          <Typography variant="h3" className={styles.sectionHeading}>
            Violations
          </Typography>
          <Stack spacing={1.5} className={styles.violationsList}>
            {proof.violations.map((v) => (
              <Paper key={v.tracking_id} variant="outlined" className={styles.violationCard}>
                <Typography variant="body2" className={styles.violationId}>
                  {v.tracking_id}
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  {formatMoney(v.payload.usdAmount)} approved against a ceiling of{" "}
                  {formatMoney(v.payload.appliedCeiling)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {v.payload.reason}
                </Typography>
              </Paper>
            ))}
          </Stack>
        </>
      )}
    </Box>
  );
}
