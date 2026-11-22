/* eslint-disable @next/next/no-img-element */
/** SAFE falcon symbol, taken from the master artwork in the brand guidelines (never redrawn). */
export function Logo({ height = 32, className = "" }: { height?: number; className?: string }) {
  return (
    <img
      src="/brand/safe-symbol.png"
      srcSet="/brand/safe-symbol.png 1x, /brand/safe-symbol@2x.png 2x"
      alt="SAFE"
      height={Math.max(height, 12)}
      style={{ height: Math.max(height, 12), width: "auto" }}
      className={className}
    />
  );
}
