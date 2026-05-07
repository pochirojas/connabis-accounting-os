// Connabis monogram — geometric "C" with a leaf-stroke notch.
// Single shape, monochrome, currentColor — works at 24px and 200px.
export function ConnabisLogo({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      aria-label="Connabis"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Outer C */}
      <path d="M26 9.5a10 10 0 1 0 0 13" />
      {/* Inner leaf-stem accent */}
      <path d="M16 11.5v9" />
      <path d="M16 14.5l3.5-2" />
      <path d="M16 17.5l3.5-2" />
    </svg>
  );
}
