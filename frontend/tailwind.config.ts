import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

// KPMG visual identity (per the brand guide).
// Primary palette is anchored on KPMG Blue (#00338D); secondary palette
// adds Violet / Purple / Light Purple / Green for charts and accents.
// Body/subhead font is Arial for digital surfaces.
//
// The native Soft Modern token names (`pa-*`) are kept as semantic aliases
// so existing component code keeps working — they simply now resolve to
// KPMG hexes.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // KPMG primary
        kpmg: {
          blue:      "#00338D",
          mediumblue:"#005EB8",
          lightblue: "#0091DA",
          violet:    "#483698",
          purple:    "#470A68",
          lightpurple:"#6D2077",
          teal:      "#00A3A1",
          green:     "#00A3A1",
          pink:      "#EAAA00",
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
          success: "#00A3A1",
          warning: "#E19900",
          error:   "#C62828",
        },
        // Semantic aliases — same shape as before; values now mapped to KPMG.
        pa: {
          cream:          "#F7F7F8",   // page gutter
          "cream-soft":   "#FAFAFB",   // soft inner surface
          line:           "#EEEEEE",
          "line-soft":    "#F4F4F6",
          ink:            "#262626",   // headings
          body:           "#4D4D4F",   // body text
          muted:          "#8C8C8C",   // muted/labels
          accent:         "#00338D",   // KPMG Blue (primary action)
          "accent-2":     "#005EB8",   // hover / secondary
          "accent-soft":  "#E5EAF3",   // soft tint behind primary chips
          blush:          "#E0F0FA",   // legacy alias (light blue tint, used for avatars)
          success:        "#00A3A1",
          warning:        "#E19900",
          danger:         "#C62828",
          "success-soft": "#D6EFEE",
          "warning-soft": "#FBE8C2",
          "danger-soft":  "#F5DCDC",
        },
      },
      fontFamily: {
        // Arial is the brand-mandated digital typeface.
        sans:   ['Arial', '"Helvetica Neue"', 'Helvetica', 'system-ui', 'sans-serif'],
        mono:   ['"Geist Mono"', '"JetBrains Mono"', 'ui-monospace', 'Menlo', 'monospace'],
        arabic: ['"IBM Plex Sans Arabic"', '"Noto Sans Arabic"', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        card:          "0 1px 3px 0 rgba(0,51,141,0.06), 0 1px 2px 0 rgba(0,51,141,0.04)",
        raise:         "0 4px 12px 0 rgba(0,51,141,0.10)",
        accent:        "0 6px 18px rgba(0,51,141,0.25)",
        "accent-soft": "0 6px 16px rgba(0,51,141,0.18)",
      },
      borderRadius: {
        sm:      "4px",
        DEFAULT: "6px",
        md:      "8px",
        lg:      "10px",
        xl:      "12px",
        "2xl":   "14px",
      },
    },
  },
  plugins: [typography],
} satisfies Config;
