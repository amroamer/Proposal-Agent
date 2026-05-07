import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        kpmg: {
          blue:       "#00338D",  // primary
          lightblue:  "#0091DA",  // accent
          purple:     "#470A68",  // secondary
          violet:     "#6D2077",
          teal:       "#00A3A1",
          green:      "#00A3A1",
          pink:       "#EAAA00",
          gray: {
            50:  "#F7F7F8",
            100: "#EEEEEE",
            200: "#D9D9D9",
            300: "#BFBFBF",
            400: "#8C8C8C",
            500: "#595959",
            600: "#4D4D4F",
            700: "#3A3A3C",
            800: "#262626",
            900: "#141414",
          },
          success: "#2E7D32",
          warning: "#E19900",
          error:   "#C62828",
        },
      },
      fontFamily: {
        sans: ['"KPMG Display"', 'Arial', 'system-ui', 'sans-serif'],
        arabic: ['"IBM Plex Sans Arabic"', '"Noto Sans Arabic"', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        card:  "0 1px 3px 0 rgba(0,0,0,0.08), 0 1px 2px 0 rgba(0,0,0,0.04)",
        raise: "0 4px 12px 0 rgba(0,0,0,0.10)",
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        md: "8px",
        lg: "12px",
      },
    },
  },
  plugins: [typography],
} satisfies Config;
