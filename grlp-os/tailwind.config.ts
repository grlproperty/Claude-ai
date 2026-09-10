import type { Config } from 'tailwindcss';

/**
 * GRLP brand tokens, taken from the 2026 brand kit.
 * Primary maroon #991C1F; neutrals from white through to charcoal; Montserrat
 * throughout. The palette is deliberately narrow — the brand guide asks for
 * clean, minimal layouts with white space, and an executive interface should
 * carry no colour that is not doing work.
 */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        maroon: {
          DEFAULT: '#991C1F',
          50: '#FBF2F2',
          100: '#F5E0E1',
          200: '#E4B4B5',
          600: '#991C1F',
          700: '#7F1719',
          800: '#5E1113',
        },
        ink: {
          DEFAULT: '#3A3A3A',
          soft: '#5A5A5A',
          muted: '#8A8A8A',
        },
        line: '#D5D5D0',
        surface: {
          DEFAULT: '#FFFFFF',
          sunken: '#F2F2F0',
        },
        signal: {
          urgent: '#991C1F',
          attention: '#8A6A1F',
          calm: '#2F6B4F',
        },
      },
      fontFamily: {
        sans: ['var(--font-montserrat)', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      fontSize: {
        micro: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.08em' }],
      },
      maxWidth: { measure: '68ch' },
      boxShadow: {
        card: '0 1px 2px rgba(58,58,58,0.04), 0 1px 12px rgba(58,58,58,0.04)',
      },
    },
  },
  plugins: [],
} satisfies Config;
