import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/features/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/shared/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--color-background)",
        foreground: "var(--color-foreground)",
        brand: {
          DEFAULT: "var(--color-brand)",
          subtle: "var(--color-brand-subtle)",
          mid: "var(--color-brand-mid)",
          dark: "var(--color-brand-dark)",
        },
        error: {
          DEFAULT: "var(--color-error)",
          subtle: "var(--color-error-subtle)",
        },
        muted: {
          DEFAULT: "var(--color-muted)",
          subtle: "var(--color-muted-subtle)",
        },
        border: "var(--color-border)",
        surface: {
          DEFAULT: "var(--color-surface)",
          "2": "var(--color-surface-2)",
        },
        // Commitment status colors
        pending: {
          bg: "var(--status-pending-bg)",
          text: "var(--status-pending-text)",
        },
        fulfilled: {
          bg: "var(--status-fulfilled-bg)",
          text: "var(--status-fulfilled-text)",
        },
        missed: {
          bg: "var(--status-missed-bg)",
          text: "var(--status-missed-text)",
        },
        deferred: {
          bg: "var(--status-deferred-bg)",
          text: "var(--status-deferred-text)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "DM Sans", ...defaultTheme.fontFamily.sans],
        serif: ["var(--font-serif)", "Instrument Serif", ...defaultTheme.fontFamily.serif],
        heading: ["var(--font-jakarta)", "Plus Jakarta Sans", ...defaultTheme.fontFamily.sans],
        poppins: ["var(--font-poppins)", "Poppins", ...defaultTheme.fontFamily.sans],
      },
      fontSize: {
        display: "var(--font-size-display)",
        h2: "var(--font-size-h2)",
        h3: "var(--font-size-h3)",
        "2xl-heading": ["28px", { lineHeight: "32px", fontWeight: "700" }],
      },
      spacing: {
        sidebar: "var(--sidebar-width)",
        topbar: "var(--topbar-height)",
      },
      borderRadius: {
        radius: "var(--radius)",
        "radius-md": "var(--radius-md)",
        "radius-lg": "var(--radius-lg)",
        "radius-xl": "var(--radius-xl)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        brand: "var(--shadow-brand)",
      },
      transitionDuration: {
        fast: "150ms",
        base: "200ms",
        slow: "400ms",
      },
    },
  },
  plugins: [],
};

export default config;
