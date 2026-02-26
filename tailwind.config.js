/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Space Grotesk', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        background: '#0a0a0a',
        surface: '#1a1a1a',
        border: '#2a2a2a',
        accent: '#c9a84c',
        'accent-red': '#e63946',
        muted: '#6b7280',
      },
    },
  },
  plugins: [],
};
