/**
 * The GRLP mark, drawn rather than loaded, so the interface has no image
 * dependency and stays crisp at any size. The line-drawing motif is the
 * homestead from the brand kit, reduced to what reads at 32 px.
 */
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <svg viewBox="0 0 48 32" className="h-7 w-11 shrink-0" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 27c4-1 6-4 9-4" />
        <path d="M7 23c0-6 1.5-11 3-11s3 5 3 11" />
        <path d="M12 23c0-7 1.5-13 3.5-13S19 16 19 23" />
        <path d="M11 27h13v-5l6-5 6 5v5" />
        <path d="M24 22h6" />
        <path d="M30 17l6-5 6 5" />
        <path d="M36 12c1-3 4-4 6-2" />
        <path d="M2 29c8 0 12-2 20-2s16 1 24-2" />
      </svg>
      <span className="leading-none">
        <span className="block text-[0.6rem] font-semibold uppercase tracking-[0.22em]">Garden Route</span>
        <span className="block text-sm font-bold uppercase tracking-[0.12em]">Lifestyle Property</span>
      </span>
    </div>
  );
}
