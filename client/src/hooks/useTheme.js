/**
 * Re-exports useTheme from the centralised ThemeContext.
 * Import from this path (hooks/useTheme) or directly from context/ThemeContext —
 * both resolve to the same singleton hook backed by ThemeProvider in main.jsx.
 */
export { useTheme as default, useTheme } from '../context/ThemeContext';

