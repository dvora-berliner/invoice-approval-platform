import { createTheme } from "@mui/material/styles";

// A deliberately un-"AI slop" palette: deep ink-teal as the working color,
// a warm paper background instead of stark white, no purple, no gradients.
const turquoise = {
  900: "#06282A",
  800: "#0B3B3E",
  700: "#0F4F52",
  600: "#13656A",
  500: "#178A8F", // primary
  400: "#2AABAE",
  300: "#5FC4C3",
  200: "#A6DEDA",
  100: "#DCF0EB",
  50: "#F0F8F6",
};

const paper = "#FBF8F2";
const ink = "#1B211F";

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: turquoise[500],
      dark: turquoise[700],
      light: turquoise[300],
      contrastText: "#FFFFFF",
    },
    secondary: {
      main: "#C1531A", // burnt coral - used sparingly for reject / warnings
    },
    background: {
      default: paper,
      paper: "#FFFFFF",
    },
    text: {
      primary: ink,
      secondary: "#5B655F",
    },
    divider: "rgba(27, 33, 31, 0.12)",
    success: { main: "#2E7D4F" },
    warning: { main: "#B4791E" },
    error: { main: "#B3311A" },
  },
  shape: {
    borderRadius: 6,
  },
  typography: {
    fontFamily: '"Manrope", -apple-system, "Segoe UI", sans-serif',
    h1: { fontSize: "1.85rem", fontWeight: 700, letterSpacing: "-0.01em" },
    h2: { fontSize: "1.4rem", fontWeight: 700, letterSpacing: "-0.01em" },
    h3: { fontSize: "1.1rem", fontWeight: 700 },
    subtitle1: { fontSize: "0.95rem", fontWeight: 600, color: "#5B655F" },
    body2: { fontSize: "0.875rem" },
    button: { textTransform: "none", fontWeight: 600, letterSpacing: 0 },
    overline: {
      fontWeight: 700,
      letterSpacing: "0.08em",
      fontSize: "0.68rem",
    },
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: turquoise[900],
          backgroundImage: "none",
          boxShadow: "none",
          borderBottom: `1px solid ${turquoise[700]}`,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
        outlined: {
          borderColor: "rgba(27, 33, 31, 0.12)",
        },
      },
      defaultProps: {
        elevation: 0,
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: "1px solid rgba(27, 33, 31, 0.12)",
          boxShadow: "none",
        },
      },
      defaultProps: {
        variant: "outlined",
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 5,
        },
        contained: {
          boxShadow: "none",
          "&:hover": { boxShadow: "none" },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          height: 3,
          backgroundColor: turquoise[400],
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 600,
          minHeight: 52,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600,
          borderRadius: 4,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 700,
          fontSize: "0.72rem",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "#5B655F",
          borderBottom: `2px solid rgba(27, 33, 31, 0.12)`,
        },
      },
    },
  },
});

export { turquoise };
