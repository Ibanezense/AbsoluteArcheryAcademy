
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-body)', 'sans-serif'],
        heading: ['var(--font-heading)', 'sans-serif'],
      },
      colors: {
        navy: '#101e2a',
        bg: 'rgb(var(--color-bg) / <alpha-value>)',
        card: 'rgb(var(--color-card) / <alpha-value>)',
        textpri: 'rgb(var(--color-ink) / <alpha-value>)',
        textsec: 'rgb(var(--color-muted) / <alpha-value>)',
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
        success: '#15803d',
        danger: '#b91c1c',
        warning: '#b45309',
        info: '#0369a1',
        line: 'rgb(var(--color-line) / <alpha-value>)',
      },
      borderRadius: { 'xl2': '1.25rem' },
      boxShadow: {
        soft: '0 16px 40px -20px rgba(16, 30, 42, 0.20)',
        card: '0 3px 12px -5px rgba(16, 30, 42, 0.10)',
      },
    },
  },
  plugins: [],
}
