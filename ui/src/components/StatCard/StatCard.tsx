import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import styles from "./StatCard.module.css";

export function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <Paper variant="outlined" className={styles.card}>
      <Typography variant="overline" className={styles.label}>
        {label}
      </Typography>
      <Typography variant="h1" className={styles.value}>
        {value}
      </Typography>
      {sub && (
        <Box>
          <Typography variant="body2" className={styles.sub}>
            {sub}
          </Typography>
        </Box>
      )}
    </Paper>
  );
}
