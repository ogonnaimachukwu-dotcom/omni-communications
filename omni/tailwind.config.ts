import type { Config } from "tailwindcss";

// Minimal foundation config. The full design-system tokens (premium / Linear-Stripe
// aesthetic) are introduced in Batch 2 alongside the UI, using the frontend-design skill.
const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
