import { useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import { DashboardOverview } from "./DashboardOverview/DashboardOverview";
import { CeilingProofPanel } from "./CeilingProofPanel/CeilingProofPanel";
import { TrailLookup } from "./TrailLookup/TrailLookup";
import { NotificationsLookup } from "./NotificationsLookup/NotificationsLookup";
import styles from "./ControllerDashboard.module.css";

const PANELS = [
  { label: "Overview", render: () => <DashboardOverview /> },
  { label: "Ceiling proof", render: () => <CeilingProofPanel /> },
  { label: "Decision trail", render: () => <TrailLookup /> },
  { label: "Notifications", render: () => <NotificationsLookup /> },
] as const;

export function ControllerDashboard() {
  const [tab, setTab] = useState(0);

  return (
    <Box>
      <Box className={styles.header}>
        <Typography variant="overline" className={styles.eyebrow}>
          Controller
        </Typography>
        <Typography variant="h1" className={styles.title}>
          Dashboard
        </Typography>
        <Typography variant="subtitle1" className={styles.subtitle}>
          Autonomy proof, aggregate volume, and the full audit trail.
        </Typography>
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} className={styles.tabs}>
        {PANELS.map((p) => (
          <Tab key={p.label} label={p.label} />
        ))}
      </Tabs>

      <Box className={styles.panel}>{PANELS[tab].render()}</Box>
    </Box>
  );
}
