/**
 * Indulge Brand Logo:
 * Represents B2B Hospitality Resource Exchange.
 * 
 * Concept:
 * - Stately architectural venue arch / portico (Hospitality / Venues / Hotels)
 * - Two dynamic reciprocal flow arrows through the gateway (Resource Exchange / Supply ↔ Demand / Fulfillment)
 * - Signature Indigo accent (#6366F1) on the active capacity flow
 * - Confident, modern "Indulge" wordmark in Nohemi Black
 * 
 * Works cleanly as a standalone mark and in both light & dark themes.
 */
export default function Logo({
  size = 21,
  width,
  className = '',
  showMark = true,
  showText = true,
  dark,
}) {
  // Derive visual dimensions: icon is 28px at default size 21 for precise cap-height balance
  const fontSize = width ? Math.round(width * 0.17) : size;
  const markSize = Math.max(24, Math.min(36, Math.round(fontSize * 1.35)));

  // Determine base tone:
  // dark === true  -> explicitly light/white text (for dark backgrounds)
  // dark === false -> explicitly dark near-black text (for light backgrounds)
  // undefined      -> responsive theme classes (text-zinc-950 dark:text-zinc-100)
  const toneClass = dark === true
    ? 'text-zinc-100'
    : dark === false
    ? 'text-zinc-950'
    : 'text-zinc-950 dark:text-zinc-100';

  return (
    <span
      className={`inline-flex items-center gap-2 select-none group ${toneClass} ${className}`.trim()}
      aria-label="Indulge — B2B Hospitality Resource Exchange"
    >
      {showMark && (
        <span
          className="shrink-0 flex items-center justify-center transition-transform duration-200 group-hover:scale-105"
          style={{ width: markSize, height: markSize }}
          aria-hidden="true"
        >
          {/* Hospitality Venue Portal + Bidirectional Resource Exchange Flow */}
          <svg
            width={markSize}
            height={markSize}
            viewBox="0 0 32 32"
            fill="none"
            className="w-full h-full drop-shadow-xs"
          >
            {/* Grand hospitality venue archway / portico */}
            <path
              d="M7 25.5V13C7 8 11 4.5 16 4.5C21 4.5 25 8 25 13V25.5"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            {/* Foundation plinth */}
            <path
              d="M4 26H28"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            {/* Top exchange flow: Provider capacity discovery (left to right) */}
            <path
              d="M9.5 12H22.5M19 8.5L22.5 12L19 15.5"
              stroke="#6366F1"
              strokeWidth="2.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Bottom exchange flow: Requirement fulfillment & return (right to left) */}
            <path
              d="M22.5 19H9.5M13 15.5L9.5 19L13 22.5"
              stroke="currentColor"
              strokeWidth="2.3"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeOpacity="0.85"
            />
          </svg>
        </span>
      )}

      {/* Modern, bold, geometric Indulge wordmark */}
      {showText && (
        <span
          className="font-brand font-extrabold tracking-[-0.03em] leading-none flex items-center"
          style={{ fontSize }}
        >
          Indulge
        </span>
      )}
    </span>
  );
}


