import type { Config } from 'tailwindcss'
import forms from '@tailwindcss/forms'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          50: '#F0F4FA',
          100: '#E2EAF4',
          900: '#0D1525',
          800: '#111E30',
          700: '#162238',
          600: '#1C2D45',
          500: '#243552',
          border: '#1F3050',
          muted: '#2A3F5F',
        },
        ice: {
          400: '#67E8F9',
          500: '#38BDF8',
          600: '#0EA5E9',
        },
        ai: {
          400: '#A78BFA',
          500: '#6366F1',
        },
        amber: {
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
        },
      },
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '6px',
        lg: '8px',
      },
      keyframes: {
        'flow-rail': {
          '0%': { backgroundPosition: '0% 50%' },
          '100%': { backgroundPosition: '200% 50%' },
        },
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },
      animation: {
        'flow-rail': 'flow-rail 3s linear infinite',
        'fade-in': 'fade-in 0.2s ease-out',
        shimmer: 'shimmer 2s linear infinite',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
      },
    },
  },
  plugins: [forms],
} satisfies Config
