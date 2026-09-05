/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // The navbar grey is sampled from the landing animation's backdrop, so
        // the chrome reads as a continuation of the intro rather than a
        // separate surface.
        nav: '#A0A1A6',
        'nav-soft': '#B4B5B9',

        // Surfaces — white page, near-white for the rare raised block.
        surface: '#FFFFFF',
        'surface-alt': '#FAFAFA',
        'surface-sunk': '#F4F4F5',

        // Text
        ink: '#141416',
        'ink-soft': '#5C5C61',
        'ink-mute': '#8E8E93',
        'ink-invert': '#FFFFFF',

        // Hairlines. Minimal UI leans on these instead of shadows.
        line: '#E4E4E7',
        'line-strong': '#D0D0D4',

        // A single accent keeps the palette quiet; signals stay muted.
        accent: '#141416',
        success: '#177245',
        danger: '#A32020',
        warn: '#8A6A00',
      },
      fontFamily: {
        // Nohemi ships here as a single Black weight, so it is reserved for the
        // wordmark and display type; body copy uses the system stack.
        display: ['Nohemi', 'Georgia', 'serif'],
        sans: [
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      fontSize: {
        xs: ['12px', '18px'],
        sm: ['13px', '20px'],
        base: ['15px', '24px'],
        lg: ['17px', '26px'],
        xl: ['20px', '28px'],
        '2xl': ['25px', '32px'],
        '3xl': ['32px', '38px'],
        '4xl': ['44px', '48px'],
      },
      letterSpacing: {
        tightest: '-0.04em',
      },
      maxWidth: {
        page: '1200px',
        prose: '680px',
      },
      borderRadius: {
        DEFAULT: '6px',
      },
    },
  },
  plugins: [],
};
