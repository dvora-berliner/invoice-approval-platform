import { useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import Link from "@mui/material/Link";
import { api, ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import type { Role } from "../../auth/types";
import styles from "./Login.module.css";

const ROLES: Role[] = ["submitter", "approver", "admin"];

const PASSWORD_HELPER_TEXT = "At least 8 characters, including a letter and a number";

function isValidPassword(password: string): boolean {
  return password.length >= 8 && /[A-Za-z]/.test(password) && /[0-9]/.test(password);
}

export function Login() {
  const { setAuthenticated } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("submitter");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "register" && !isValidPassword(password)) {
      setError(`Password does not meet the requirements: ${PASSWORD_HELPER_TEXT.toLowerCase()}.`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const session =
        mode === "login" ? await api.login({ username, password }) : await api.register({ username, password, role });
      setAuthenticated(session);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box className={styles.page}>
      <Typography variant="h1" className={styles.title}>
        {mode === "login" ? "Sign in" : "Create an account"}
      </Typography>
      <Typography variant="subtitle1" className={styles.subtitle}>
        {mode === "login" ? "ApprovalFlow console access." : "Pick the role you'll be acting as."}
      </Typography>

      <Paper variant="outlined" className={styles.formCard}>
        <Box component="form" onSubmit={handleSubmit}>
          <TextField
            label="Username"
            required
            autoFocus
            className={styles.field}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <TextField
            label="Password"
            required
            type="password"
            className={styles.field}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            helperText={mode === "register" ? PASSWORD_HELPER_TEXT : undefined}
          />
          {mode === "register" && (
            <TextField
              select
              label="Role"
              className={styles.field}
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              {ROLES.map((r) => (
                <MenuItem key={r} value={r}>
                  {r}
                </MenuItem>
              ))}
            </TextField>
          )}

          <Button type="submit" variant="contained" size="large" className={styles.submit} disabled={submitting}>
            {submitting ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}
          </Button>
        </Box>
      </Paper>

      {error && (
        <Alert severity="error" className={styles.resultAlert}>
          {error}
        </Alert>
      )}

      <Typography variant="body2" className={styles.toggle}>
        {mode === "login" ? "No account yet? " : "Already have an account? "}
        <Link
          component="button"
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError(null);
          }}
        >
          {mode === "login" ? "Create one" : "Sign in"}
        </Link>
      </Typography>
    </Box>
  );
}
