// The Erwin mark (brand/BRAND.md § Mark): a plate with two corners cut, a run
// of railroad minute track, and the twelve-o'clock index in rust. Inline so it
// takes the page's ink, which is how mark-mono.svg is meant to be used. Below
// 32px the track turns to noise, so small marks use favicon.svg's geometry: the
// same plate with a heavier index and no track.
export function Mark({ size = 28, className }: { size?: number; className?: string }) {
  if (size < 32) {
    return (
      <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden="true">
        <path fill="currentColor" d="M7 1H31V25L25 31H1V7Z" />
        <path fill="var(--er-accent)" d="M9.5 6h13L16 18z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden="true">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M16 4H60V48L48 60H4V16ZM11 14h1v4h-1zM15.5 14h1v4h-1zM20 14h1v4h-1zM24.5 14h1v4h-1zM38.5 14h1v4h-1zM43 14h1v4h-1zM47.5 14h1v4h-1zM52 14h1v4h-1zM11 19h42v1H11zM25 11h14l-7 13z"
      />
      <path fill="var(--er-accent)" d="M26.5 12h11L32 22.2z" />
    </svg>
  );
}
