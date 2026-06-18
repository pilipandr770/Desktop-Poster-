/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        crust:    "var(--crust)",
        mantle:   "var(--mantle)",
        base:     "var(--base)",
        surface0: "var(--surface0)",
        surface1: "var(--surface1)",
        text:     "var(--text)",
        subtext:  "var(--subtext1)",
        overlay:  "var(--overlay0)",
        blue:     "var(--blue)",
        green:    "var(--green)",
        red:      "var(--red)",
        yellow:   "var(--yellow)",
        mauve:    "var(--mauve)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      animation: {
        "fade-in": "fadeIn 0.15s ease-out",
      },
    },
  },
  plugins: [],
};
