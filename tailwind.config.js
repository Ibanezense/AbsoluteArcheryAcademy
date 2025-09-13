
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0f172a",         // slate-900-ish
        card: "#111827",       // gray-900
        accent: "#facc15",     // yellow-400
        textpri: "#e5e7eb",    // gray-200
        textsec: "#9ca3af",    // gray-400
        success: "#22c55e",
        danger: "#ef4444",
        warning: "#f59e0b", // <— NUEVO (naranja)
        info: "#38bdf8",     // celeste
      },
      borderRadius: { 'xl2': '1.25rem' }
    },
  },
  plugins: [],
}
