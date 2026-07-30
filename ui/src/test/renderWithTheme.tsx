import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { theme } from "../theme";
import { AuthProvider } from "../auth/AuthContext";

// AuthProvider is included unconditionally - harmless for pages that don't call
// useAuth(), and lets pages that do (e.g. ApproverQueue) render without every
// test file needing its own wrapper.
export function renderWithTheme(ui: ReactElement) {
  return render(
    <ThemeProvider theme={theme}>
      <AuthProvider>{ui}</AuthProvider>
    </ThemeProvider>,
  );
}
