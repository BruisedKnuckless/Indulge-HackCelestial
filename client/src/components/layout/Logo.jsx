/**
 * The Indulge wordmark: lowercase type with a swoosh underscore, echoing the
 * shape language of a marketplace logo without copying anyone's mark.
 */
export default function Logo({ className = '', width = 108, dark = false }) {
  const ink = dark ? '#131921' : '#FFFFFF';

  return (
    <svg
      viewBox="0 0 150 42"
      width={width}
      className={className}
      role="img"
      aria-label="Indulge"
    >
      <text
        x="0"
        y="27"
        fill={ink}
        fontFamily='"Amazon Ember", Helvetica, Arial, sans-serif'
        fontSize="27"
        fontWeight="700"
        letterSpacing="-0.5"
      >
        indulge
      </text>
      {/* Swoosh sweeping right and tapering, with an arrowhead at the tip. */}
      <path
        d="M4 33 Q 48 42 92 33"
        stroke="#FFA41C"
        strokeWidth="3.2"
        fill="none"
        strokeLinecap="round"
      />
      <path d="M88 29.5 L95 32.8 L87.5 36.2 Z" fill="#FFA41C" />
      <text
        x="99"
        y="24"
        fill="#FFA41C"
        fontFamily='"Amazon Ember", Helvetica, Arial, sans-serif'
        fontSize="11"
        fontWeight="400"
      >
        .biz
      </text>
    </svg>
  );
}
