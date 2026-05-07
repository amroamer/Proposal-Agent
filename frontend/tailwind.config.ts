import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

// Soft Modern palette (Direction D from the Proposal Agent design canvas):
// warm cream paper, indigo-violet accent, rounded geometry. The legacy
// `kpmg-*` token names are retained so existing class references continue
// to work, but their values now resolve to the Soft Modern hues.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Native Soft Modern tokens (preferred for new code).
        pa: {
          cream:          "#f7f4ee",
          "cream-soft":   "#faf8f3",
          line:           "#e8e4f0",
          "line-soft":    "#f1edf6",
          ink:            "#1e1b3a",
          body:           "#52507a",
          muted:          "#8b88a8",
          accent:         "#5b4cd9",
          "accent-2":     "#7d6ff0",
          "accent-soft":  "#efebfb",
          blush:          "#fce6dd",
          success:        "#2f9e6e",
          warning:        "#c98a26",
          danger:         "#c4505b",
          "success-soft": "#dff6e9",
          "warning-soft": "#fbeed4",
          "danger-soft":  "#fadddf",
        },
        // Legacy KPMG token names — remapped to Soft Modern values so
        // existing components transition without a 400+ class rewrite.
        kpmg: {
          blue:       "#5b4cd9",
          lightblue:  "#7d6ff0",
          purple:     "#1e1b3a",
          violet:     "#7d6ff0",
          teal:       "#2f9e6e",
          green:      "#2f9e6e",
          pink:       "#c98a26",
          gray: {
            50:  "#faf8f3",
            100: "#f1edf6",
            200: "#e8e4f0",
            300: "#dcd6e8",
            400: "#8b88a8",
            500: "#7a7798",
            600: "#52507a",
            700: "#3a3760",
            800: "#2a2748",
            900: "#1e1b3a",
          },
          success: "#2f9e6e",
          warning: "#c98a26",
          error:   "#c4505b",
        },
      },
      fontFamily: {
        sans:   ['"Geist"', '"Inter"', 'system-ui', 'sans-serif'],
        mono:   ['"Geist Mono"', '"JetBrains Mono"', 'ui-monospace', 'Menlo', 'monospace'],
        arabic: ['"IBM Plex Sans Arabic"', '"Noto Sans Arabic"', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        card:          "0 1px 3px 0 rgba(30,27,58,0.06), 0 1px 2px 0 rgba(30,27,58,0.04)",
        raise:         "0 4px 12px 0 rgba(30,27,58,0.08)",
        accent:        "0 6px 18px rgba(91,76,217,0.25)",
        "accent-soft": "0 6px 16px rgba(91,76,217,0.18)",
      },
      borderRadius: {
        sm:      "6px",
        DEFAULT: "8px",
        md:      "10px",
        lg:      "12px",
        xl:      "16px",
        "2xl":   "18px",
      },
    },
  },
  plugins: [typography],
} satisfies Config;
