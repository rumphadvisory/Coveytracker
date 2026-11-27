import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        forest: { DEFAULT: "#3d6e38", dark: "#2b4f28", light: "#e3ecdf" },
        covey: "#e76624",
        contact: "#257de0",
        ink: "#2a2722",
        bark: "#5c5346",
        sand: { DEFAULT: "#f6f2ea", dark: "#ebe4d6" },
        line: "#ddd5c5",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
