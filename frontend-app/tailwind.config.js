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
          primary: "#002446",
          "primary-mid": "#1a3a5f",
          secondary: "#0060ac",
          highlight: "#68abff",
          ink: "#0b1c30",
          muted: "#43474e",
          mist: "#f8f9ff",
          ice: "#e5eeff",
          line: "#e2e8f0",
          accent: "#d73f3f",
        },
      },
      fontFamily: {
        portal: ["Inter", "system-ui", "Segoe UI", "sans-serif"],
      },
      maxWidth: {
        portal: "1440px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)",
        "portal-subtle":
          "0 2px 8px -2px rgba(0, 36, 70, 0.05), 0 1px 4px -1px rgba(0, 36, 70, 0.02)",
        "portal-elevated":
          "0 10px 30px -10px rgba(0, 36, 70, 0.08), 0 4px 12px -4px rgba(0, 36, 70, 0.04)",
      },
    },
  },
  plugins: [],
};