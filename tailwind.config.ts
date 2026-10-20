import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      colors: {
        border: "var(--border)",
        background: "var(--bg)",
        foreground: "var(--foreground)",
        surface: "var(--surface)",
        "surface-elevated": "var(--surface-elevated)",
        card: "var(--surface)",
        "card-foreground": "var(--foreground)",
        muted: "var(--muted)",
        "muted-foreground": "var(--muted)",
        primary: "var(--primary)",
        "primary-hover": "var(--primary-hover)",
        "primary-muted": "var(--primary-muted)",
        "primary-border": "var(--primary-border)",
        success: "var(--success)",
        "success-muted": "var(--success-muted)",
        "success-border": "var(--success-border)",
        error: "var(--error)",
        "error-muted": "var(--error-muted)",
        "error-border": "var(--error-border)",
        info: "var(--info)",
        accent: "var(--accent)",
      },
    },
  },
  plugins: [],
};
export default config;
