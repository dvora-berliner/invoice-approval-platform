import Chip from "@mui/material/Chip";
import { turquoise } from "../../theme";

type Tone = "neutral" | "positive" | "negative" | "pending" | "brand";

const TONE_STYLES: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: "rgba(27, 33, 31, 0.08)", fg: "#3E4643" },
  positive: { bg: "#E4F3E9", fg: "#1E5E38" },
  negative: { bg: "#F7E5DF", fg: "#8A3419" },
  pending: { bg: "#FBEFD9", fg: "#8A5E13" },
  brand: { bg: turquoise[100], fg: turquoise[800] },
};

const STATUS_TONE: Record<string, Tone> = {
  pending: "pending",
  awaiting_approval: "pending",
  paid: "positive",
  auto_approve: "positive",
  approve: "positive",
  rejected: "negative",
  reject: "negative",
  payment_failed: "negative",
  human_review: "brand",
  request_info: "brand",
};

export function StatusChip({ value, label }: { value: string; label?: string }) {
  const tone = STATUS_TONE[value] ?? "neutral";
  const style = TONE_STYLES[tone];
  return (
    <Chip
      size="small"
      label={label ?? value.replace(/_/g, " ")}
      sx={{
        bgcolor: style.bg,
        color: style.fg,
        textTransform: "capitalize",
        fontSize: "0.72rem",
      }}
    />
  );
}
