/**
 * The wordmark is pure text in Nohemi Black — the same treatment the landing
 * animation resolves to on its final frame, so the header reads as a
 * continuation of the intro rather than a different brand.
 */
export default function Logo({ size = 22, className = '', withDot = true }) {
  return (
    <span
      className={`wordmark ${className}`}
      style={{ fontSize: size }}
      aria-label="Indulge"
    >
      indulge{withDot ? '.' : ''}
    </span>
  );
}
