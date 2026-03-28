/** @type {import('tailwindcss').Config} */

// Helper to create CSS-variable-based color with opacity support
const c = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;

// Generate a full color scale using CSS variables
const scale = (name) => ({
  50: c(`${name}-50`),
  100: c(`${name}-100`),
  200: c(`${name}-200`),
  300: c(`${name}-300`),
  400: c(`${name}-400`),
  500: c(`${name}-500`),
  600: c(`${name}-600`),
  700: c(`${name}-700`),
  800: c(`${name}-800`),
  900: c(`${name}-900`),
  950: c(`${name}-950`),
});

export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter var', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // All major color scales use CSS variables for multi-theme support
        slate: scale('slate'),
        indigo: scale('indigo'),
        green: scale('green'),
        red: scale('red'),
        amber: scale('amber'),
        blue: scale('blue'),
        purple: scale('purple'),
        orange: scale('orange'),
        emerald: scale('emerald'),
        yellow: scale('yellow'),
        pink: scale('pink'),
        // Custom brand colors
        orbit: {
          50: '#f0f4ff',
          100: '#e0e9ff',
          200: '#c7d5fe',
          300: '#a4b8fc',
          400: '#7e91f8',
          500: '#5f6af1',
          600: '#4f4ce5',
          700: '#433dca',
          800: '#3734a3',
          900: '#323181',
          950: '#1e1c4c',
        }
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
        'pulse-subtle': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      boxShadow: {
        'inner-lg': 'inset 0 2px 4px 0 rgb(0 0 0 / 0.1)',
      }
    },
  },
  plugins: [],
}
