
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
        bg: '#F8F9FA',
        card: '#FFFFFF',
        textpri: '#1F2937',
        textsec: '#6B7280',
        accent: '#F97316',
        success: '#22c55e',
        danger: '#ef4444',
        warning: '#f59e0b',
        info: '#38bdf8',
        line: '#E5E7EB',
      },
      borderRadius: { 'xl2': '1.25rem' },
      boxShadow: {
        soft: '0 10px 30px rgba(15, 23, 42, 0.06)',
        card: '0 4px 12px rgba(15, 23, 42, 0.05)',
      },
    },
  },
  plugins: [],
}
