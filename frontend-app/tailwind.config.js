/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  corePlugins: {
    // IMPORTANT: preflight resets margins/headings/form-element defaults.
    // This app has 16+ existing forms styled with plain CSS (global.css,
    // FormComponents.css, etc.) that rely on the browser/CSS-cascade
    // defaults those forms were built against. Turning preflight off
    // means Tailwind only adds utility classes and never touches
    // anything it wasn't explicitly asked to style, so FormA–FormL,
    // ScreeningForm, etc. are unaffected.
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        portal: {
          primary: "#00132c",
          "primary-mid": "#0f2847",
          secondary: "#006398",
          highlight: "#5bb8fe",
          "secondary-fixed": "#cce5ff",
          ink: "#0e1c2f",
          muted: "#44474e",
          outline: "#74777e",
          mist: "#f9f9ff",
          ice: "#e7eeff",
          "surface-low": "#f0f3ff",
          line: "#c4c6ce",
          accent: "#ba1a1a",
          live: "#059669",
          teal: "#0E7C7B",
          "teal-bright": "#14A8A7",
        },
      },
      fontFamily: {
        portal: ["Inter", "system-ui", "Segoe UI", "sans-serif"],
        display: ["Plus Jakarta Sans", "Inter", "system-ui", "sans-serif"],
        serif: ["Lora", "Georgia", "serif"],
        "data-mono": ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      keyframes: {
        "ds-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
        "ds-shimmer": {
          "0%": { backgroundPosition: "-420px 0" },
          "100%": { backgroundPosition: "420px 0" },
        },
        "ds-typing": {
          "0%, 80%, 100%": { opacity: "0.25", transform: "translateY(0)" },
          "40%": { opacity: "1", transform: "translateY(-2px)" },
        },
      },
      animation: {
        "ds-pulse": "ds-pulse 2s ease-in-out infinite",
        "ds-shimmer": "ds-shimmer 1.4s linear infinite",
        "ds-typing": "ds-typing 1s ease-in-out infinite",
      },
      maxWidth: {
        portal: "1440px",
      },
      boxShadow: {
        card: "0 1px 8px rgba(0, 0, 0, 0.04)",
        "portal-subtle": "0 1px 8px rgba(0, 0, 0, 0.04)",
        "portal-elevated":
          "0 10px 30px -10px rgba(0, 19, 44, 0.08), 0 4px 12px -4px rgba(0, 19, 44, 0.04)",
      },
    },
  },
  plugins: [],
};
