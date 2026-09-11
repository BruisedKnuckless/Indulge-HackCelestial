/** @type {import("tailwindcss").Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Every token resolves through a CSS custom property so a single
        // :root / .dark block in index.css switches the entire UI.
        // The rgb(var() / <alpha-value>) syntax preserves Tailwind opacity
        // modifiers: bg-surface/80, text-ink/65, ring-ink/25 etc.

        nav:           "rgb(var(--color-nav)           / <alpha-value>)",
        "nav-soft":    "rgb(var(--color-nav-soft)      / <alpha-value>)",

        surface:           "rgb(var(--color-surface)           / <alpha-value>)",
        "surface-section": "rgb(var(--color-surface-section)   / <alpha-value>)",
        "surface-tinted":  "rgb(var(--color-surface-tinted)    / <alpha-value>)",
        "surface-warm":    "rgb(var(--color-surface-warm)      / <alpha-value>)",
        "surface-elevated":"rgb(var(--color-surface-elevated)  / <alpha-value>)",
        "surface-alt":     "rgb(var(--color-surface-alt)       / <alpha-value>)",
        "surface-sunk":    "rgb(var(--color-surface-sunk)      / <alpha-value>)",

        ink:           "rgb(var(--color-ink)           / <alpha-value>)",
        "ink-soft":    "rgb(var(--color-ink-soft)      / <alpha-value>)",
        "ink-mute":    "rgb(var(--color-ink-mute)      / <alpha-value>)",
        "ink-invert":  "rgb(var(--color-ink-invert)    / <alpha-value>)",

        line:          "rgb(var(--color-line)          / <alpha-value>)",
        "line-strong": "rgb(var(--color-line-strong)   / <alpha-value>)",

        accent:        "rgb(var(--color-accent)        / <alpha-value>)",
        success:       "rgb(var(--color-success)       / <alpha-value>)",
        danger:        "rgb(var(--color-danger)        / <alpha-value>)",
        warn:          "rgb(var(--color-warn)          / <alpha-value>)",

        // ── Accent palette — hospitality × B2B ───────────────
        // Use strategically: icons, charts, badges, active states.
        indigo:         "rgb(var(--color-indigo)        / <alpha-value>)",
        teal:           "rgb(var(--color-teal)          / <alpha-value>)",
        "amber-accent": "rgb(var(--color-amber-accent)  / <alpha-value>)",
        "green-accent": "rgb(var(--color-green-accent)  / <alpha-value>)",
        "red-accent":   "rgb(var(--color-red-accent)    / <alpha-value>)",
        violet:         "rgb(var(--color-violet)        / <alpha-value>)",
      },
      fontFamily: {
        brand: [
          "'Plus Jakarta Sans'",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "'Segoe UI'",
          "Roboto",
          "sans-serif",
        ],
        display: ["Nohemi", "Georgia", "serif"],
        sans: [
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      fontSize: {
        xs:    ["12px", "18px"],
        sm:    ["13px", "20px"],
        base:  ["15px", "24px"],
        lg:    ["17px", "26px"],
        xl:    ["20px", "28px"],
        "2xl": ["25px", "32px"],
        "3xl": ["32px", "38px"],
        "4xl": ["44px", "48px"],
      },
      letterSpacing: {
        tightest: "-0.04em",
      },
      maxWidth: {
        page:  "1200px",
        prose: "680px",
      },
      borderRadius: {
        DEFAULT: "6px",
        sm:    "4px",
        md:    "8px",
        lg:    "10px",
        xl:    "12px",
        "2xl": "16px",
        full:  "9999px",
      },
    },
  },
  plugins: [],
};
