import type { Config } from 'tailwindcss';

/* Three colours, as everywhere else in this project: brand teal carries the
 * emphasis, black carries the content, white is the ground. The greys below
 * are tints of the teal, not a fourth hue. */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#005F6A',
          deep: '#00434A',
          wash: '#E9F1F2',
          mist: '#F4F9F9',
          line: '#DDE7E8',
        },
        ink: '#000000',
        muted: '#5C6E72',
        ground: '#FAFCFC',
      },
      fontFamily: {
        sans: ['Quicksand', 'ui-rounded', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      maxWidth: { site: '1400px' },
    },
  },
  plugins: [],
} satisfies Config;
