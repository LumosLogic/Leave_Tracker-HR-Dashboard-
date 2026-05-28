/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Executive Precision design system
        primary: '#3525cd',
        'primary-container': '#4f46e5',
        secondary: '#712ae2',
        'secondary-container': '#8a4cfc',
        background: '#f9f9ff',
        surface: '#f9f9ff',
        'surface-bright': '#f9f9ff',
        'surface-container-lowest': '#ffffff',
        'surface-container-low': '#f0f3ff',
        'surface-container': '#e7eefe',
        'surface-container-high': '#e2e8f8',
        'surface-container-highest': '#dce2f3',
        'on-surface': '#151c27',
        'on-surface-variant': '#464555',
        outline: '#777587',
        'outline-variant': '#c7c4d8',
        'on-primary': '#ffffff',
        'on-secondary': '#ffffff',
        'inverse-surface': '#2a313d',
        error: '#ba1a1a',
        'on-error': '#ffffff',
        'error-container': '#ffdad6',
        tertiary: '#7e3000',
        'tertiary-container': '#a44100',
        // Legacy sky kept for backward compat (maps to primary shades)
        sky: {
          50:  '#f0f3ff',
          100: '#e7eefe',
          200: '#dce2f3',
          300: '#c7c4d8',
          400: '#4f46e5',
          500: '#3525cd',
          600: '#3525cd',
          700: '#3525cd',
          800: '#2a1fa0',
          900: '#1e1575',
        },
        brand: {
          DEFAULT: '#3525cd',
          dark:    '#4f46e5',
          light:   '#8a4cfc',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      boxShadow: {
        card:       '0 4px 12px rgba(0,0,0,0.04)',
        'card-hover': '0 8px 20px rgba(0,0,0,0.06)',
      },
    },
  },
  plugins: [],
};
