/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        cyber: {
          bg: '#07070d',
          surface: '#111222',
          card: '#15162a',
          hover: '#1c1d36',
          border: 'rgba(168, 85, 247, 0.18)',
          glow: '#a855f7',
          pink: '#d946ef',
          cyan: '#06b6d4',
        },
      },
      boxShadow: {
        'glow-purple': '0 0 25px -3px rgba(168, 85, 247, 0.45)',
        'glow-pink': '0 0 25px -3px rgba(217, 70, 239, 0.45)',
        'glow-btn': '0 0 20px 2px rgba(168, 85, 247, 0.5)',
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
      },
      backgroundImage: {
        'gradient-purple-pink': 'linear-gradient(135deg, #9333ea 0%, #d946ef 100%)',
        'gradient-hero': 'linear-gradient(135deg, #1e1045 0%, #150c33 50%, #0a061a 100%)',
        'gradient-card': 'linear-gradient(180deg, rgba(26, 27, 54, 0.8) 0%, rgba(17, 18, 36, 0.95) 100%)',
      },
    },
  },
  plugins: [],
};
