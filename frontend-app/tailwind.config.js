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
      boxShadow: {
        card: "0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)",
      },
    },
  },
  plugins: [],
};