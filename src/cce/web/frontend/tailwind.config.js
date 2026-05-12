/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'bg-primary': 'var(--bg-primary)',
        'bg-secondary': 'var(--bg-secondary)',
        'surface-primary': 'var(--surface-primary)',
        'surface-secondary': 'var(--surface-secondary)',
        'surface-tertiary': 'var(--surface-tertiary)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-tertiary': 'var(--text-tertiary)',
        'text-muted': 'var(--text-muted)',
        'text-inverse': 'var(--text-inverse)',
        'border-primary': 'var(--border-primary)',
        'border-secondary': 'var(--border-secondary)',
        'brand': {
          DEFAULT: 'var(--brand)',
          hover: 'var(--brand-hover)',
          muted: 'var(--brand-muted)',
          surface: 'var(--brand-surface)',
          border: 'var(--brand-border)',
        },
        'success': {
          DEFAULT: 'var(--success)',
          surface: 'var(--success-surface)',
          border: 'var(--success-border)',
          muted: 'var(--success-muted)',
        },
        'warning': {
          DEFAULT: 'var(--warning)',
          surface: 'var(--warning-surface)',
          border: 'var(--warning-border)',
          muted: 'var(--warning-muted)',
        },
        'danger': {
          DEFAULT: 'var(--danger)',
          surface: 'var(--danger-surface)',
          border: 'var(--danger-border)',
          muted: 'var(--danger-muted)',
        },
        'info': {
          DEFAULT: 'var(--info)',
          surface: 'var(--info-surface)',
          border: 'var(--info-border)',
          muted: 'var(--info-muted)',
        },
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '20px',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'Liberation Mono', 'Courier New', 'monospace'],
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
}
