/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Chrome
        squid: '#131921',
        navy: '#232F3E',
        'navy-dark': '#131A22',
        'back-to-top': '#37475A',
        'back-to-top-hover': '#485769',

        // Surfaces
        ground: '#EAEDED',
        'ground-alt': '#E3E6E6',

        // Text
        ink: '#0F1111',
        'ink-soft': '#565959',
        'ink-mute': '#767676',

        // Interactive
        link: '#007185',
        'link-hover': '#C7511F',

        // Buttons
        yellow: '#FFD814',
        'yellow-hover': '#F7CA00',
        'yellow-border': '#FCD200',
        orange: '#FFA41C',
        'orange-hover': '#FA8900',
        'orange-border': '#FF8F00',
        search: '#FEBD69',
        'search-hover': '#F3A847',

        // Signals
        deal: '#CC0C39',
        star: '#FFA41C',
        success: '#007600',
        danger: '#B12704',
        'cart-badge': '#F08804',

        // Lines
        bd: '#D5D9D9',
        'bd-soft': '#DDD',
      },
      fontFamily: {
        // Amazon Ember is proprietary; Arial/Helvetica is Amazon's own fallback
        // and is what most visitors actually see.
        sans: ['"Amazon Ember"', '"Helvetica Neue"', 'Helvetica', 'Arial', 'sans-serif'],
      },
      fontSize: {
        // Amazon's type ramp, named the way their CSS does.
        micro: ['11px', '16px'],
        mini: ['12px', '16px'],
        base: ['13px', '19px'],
        body: ['14px', '20px'],
        lead: ['16px', '22px'],
        title: ['18px', '24px'],
        section: ['21px', '27px'],
        page: ['28px', '34px'],
      },
      boxShadow: {
        btn: '0 2px 5px 0 rgba(213,217,217,.5)',
        card: '0 2px 5px rgba(15,17,17,.15)',
        pop: '0 2px 8px rgba(15,17,17,.25)',
        focus: '0 0 0 3px #C8F3FA, 0 1px 2px rgba(15,17,17,.15) inset',
      },
      maxWidth: {
        page: '1500px',
      },
    },
  },
  plugins: [],
};
