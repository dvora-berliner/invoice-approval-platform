import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import styles from "./BarRow.module.css";

export function BarSeries({ data }: { data: Array<[string, number]> }) {
  const max = Math.max(1, ...data.map(([, v]) => v));
  return (
    <Stack spacing={0.75}>
      {data.map(([label, value]) => (
        <Box key={label} className={styles.row}>
          <Typography variant="body2" className={styles.label}>
            {label}
          </Typography>
          <Box className={styles.track}>
            <Box
              className={styles.fill}
              style={{ width: `${(value / max) * 100}%`, minWidth: value > 0 ? 6 : 0 }}
            />
          </Box>
          <Typography variant="body2" className={styles.value}>
            {value}
          </Typography>
        </Box>
      ))}
    </Stack>
  );
}
