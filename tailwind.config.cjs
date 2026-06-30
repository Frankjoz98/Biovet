/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Outfit"', 'sans-serif'],
      },
      colors: {
        'deep-space': '#030308',
        'glass-card': 'rgba(10, 10, 20, 0.6)',
        'glass-border': 'rgba(255, 255, 255, 0.08)',
        'neon-blue': '#38bdf8',
        'neon-green': '#10b981',
        'neon-purple': '#c084fc',
        'neon-emerald': '#34d399',
      },
      boxShadow: {
        'neon-blue': '0 0 15px -3px rgba(56, 189, 248, 0.4)',
        'neon-green': '0 0 15px -3px rgba(16, 185, 129, 0.4)',
        'neon-purple': '0 0 15px -3px rgba(192, 132, 252, 0.4)',
        'card-glow': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
      },
    },
  },
  plugins: [],
}
