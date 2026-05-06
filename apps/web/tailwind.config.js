/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      boxShadow: {
        'neo-card': '0 4px 20px -4px rgba(0, 0, 0, 0.05), 0 -2px 10px -2px rgba(255, 255, 255, 0.8)',
        'neo-btn': '0 2px 8px -2px rgba(0, 0, 0, 0.05), 0 -1px 4px -1px rgba(255, 255, 255, 0.8)',
        'neo-btn-dark': '0 2px 8px rgba(0, 0, 0, 0.4)',
        'neo-inset': 'inset 0 2px 4px rgba(0, 0, 0, 0.04)',
        'neo-inset-dark': 'inset 0 2px 6px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
      },
      colors: {
        slate: {
          950: '#020617',
        }
      }
    },
  },
  plugins: [],
}
