
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: '#1C1C22',         // Fondo principal (casi negro)
        card: '#2A2A30',       // Fondo de las tarjetas (gris oscuro)
        textpri: '#F0F0F0',    // Texto principal (casi blanco)
        textsec: '#A0A0A0',    // Texto secundario (gris)
        accent: '#E53E5F',     // Acento principal (rojo/rosa)
        success: '#22c55e',
        danger: '#ef4444',
        warning: '#f59e0b',
        info: '#38bdf8',
      },
      borderRadius: { 'xl2': '1.25rem' }
    },
  },
  plugins: [],
}
