import { useState } from "react";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import { theme } from "../theme";
import { SubmitInvoice } from "../pages/SubmitInvoice/SubmitInvoice";
import { CheckStatus } from "../pages/CheckStatus/CheckStatus";
import { MyInvoices } from "../pages/MyInvoices/MyInvoices";
import { ApproverQueue } from "../pages/ApproverQueue/ApproverQueue";
import { ControllerDashboard } from "../pages/ControllerDashboard/ControllerDashboard";
import { Login } from "../pages/Login/Login";
import { AuthProvider, useAuth } from "../auth/AuthContext";
import type { Role } from "../auth/types";
import styles from "./App.module.css";

const SECTIONS = [
  { label: "Submit", roles: ["submitter", "admin"] as Role[], render: () => <SubmitInvoice /> },
  { label: "My invoices", roles: ["submitter", "admin"] as Role[], render: () => <MyInvoices /> },
  { label: "Status", roles: ["submitter", "approver", "admin"] as Role[], render: () => <CheckStatus /> },
  { label: "Approvals", roles: ["approver", "admin"] as Role[], render: () => <ApproverQueue /> },
  { label: "Dashboard", roles: ["admin"] as Role[], render: () => <ControllerDashboard /> },
] as const;

function AuthenticatedApp() {
  const { session } = useAuth();
  const sections = SECTIONS.filter((s) => session && s.roles.includes(session.role));
  const [section, setSection] = useState(0);
  const activeIndex = Math.min(section, sections.length - 1);

  return (
    <>
      <Box className={styles.tabsBar}>
        <Box className={styles.tabsInner}>
          <Tabs value={activeIndex} onChange={(_, v) => setSection(v)}>
            {sections.map((s) => (
              <Tab key={s.label} label={s.label} />
            ))}
          </Tabs>
        </Box>
      </Box>

      <Box className={styles.content}>{sections[activeIndex]?.render()}</Box>
    </>
  );
}

function AppShell() {
  const { session, logout } = useAuth();

  return (
    <Box className={styles.root}>
      <AppBar position="static">
        <Toolbar className={styles.toolbar}>
          <TaskAltIcon className={styles.wordmarkIcon} />
          <Typography variant="h6" className={styles.wordmark}>
            Approval<span className={styles.wordmarkAccent}>Flow</span>
          </Typography>
          <Typography variant="body2" className={styles.tagline}>
            invoice approval console
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          {session && (
            <>
              <Chip
                size="small"
                label={`${session.username} - ${session.role}`}
                sx={{
                  mr: 2,
                  color: "#ffffff",
                  bgcolor: "rgba(255, 255, 255, 0.12)",
                  border: "1px solid rgba(255, 255, 255, 0.24)",
                }}
              />
              <Button color="inherit" size="small" onClick={logout}>
                Sign out
              </Button>
            </>
          )}
        </Toolbar>
      </AppBar>

      {session ? <AuthenticatedApp /> : <Box className={styles.content}><Login /></Box>}
    </Box>
  );
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
