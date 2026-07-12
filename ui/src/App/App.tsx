import { useState } from "react";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import { theme } from "../theme";
import { SubmitInvoice } from "../pages/SubmitInvoice/SubmitInvoice";
import { CheckStatus } from "../pages/CheckStatus/CheckStatus";
import { ApproverQueue } from "../pages/ApproverQueue/ApproverQueue";
import { ControllerDashboard } from "../pages/ControllerDashboard/ControllerDashboard";
import styles from "./App.module.css";

const SECTIONS = [
  { label: "Submit", render: () => <SubmitInvoice /> },
  { label: "Status", render: () => <CheckStatus /> },
  { label: "Approvals", render: () => <ApproverQueue /> },
  { label: "Dashboard", render: () => <ControllerDashboard /> },
] as const;

function App() {
  const [section, setSection] = useState(0);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box className={styles.root}>
        <AppBar position="static">
          <Toolbar className={styles.toolbar}>
            <Typography variant="h6" className={styles.wordmark}>
              Approval<span className={styles.wordmarkAccent}>Flow</span>
            </Typography>
            <Typography variant="body2" className={styles.tagline}>
              invoice approval console
            </Typography>
          </Toolbar>
        </AppBar>

        <Box className={styles.tabsBar}>
          <Box className={styles.tabsInner}>
            <Tabs value={section} onChange={(_, v) => setSection(v)}>
              {SECTIONS.map((s) => (
                <Tab key={s.label} label={s.label} />
              ))}
            </Tabs>
          </Box>
        </Box>

        <Box className={styles.content}>{SECTIONS[section].render()}</Box>
      </Box>
    </ThemeProvider>
  );
}

export default App;
