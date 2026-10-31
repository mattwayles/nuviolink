"use client";

export function formatRating(r: number | null | undefined): string {
  return r && r > 0 ? r.toFixed(1) : "NR";
}

/** Dialog synopsis: undefined while loading, null when there is none. */
export function TitleDescription({ text }: { text: string | null | undefined }) {
  if (text === undefined) return <p className="text-sm text-white/50">Loading description…</p>;
  return <p className="whitespace-pre-line text-sm leading-relaxed text-white/70">{text || "No description available."}</p>;
}

export function CardSkeleton() {
  return (
    <div aria-hidden="true" className="animate-pulse-glow">
      <div className="aspect-[2/3] rounded-2xl bg-white/[0.06]" />
      <div className="mt-2 h-3 w-3/4 rounded bg-white/[0.06]" />
      <div className="mt-1.5 h-3 w-1/3 rounded bg-white/[0.06]" />
    </div>
  );
}

export function SkeletonGrid({ count = 12 }: { count?: number }) {
  return (
    <div className="grid-titles" data-testid="skeleton">
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

export default function TitleCard({
  title,
  year,
  posterUrl,
  rating,
  badge,
  onActivate,
}: {
  title: string;
  year?: string | null;
  posterUrl: string | null | undefined;
  rating: number | null | undefined;
  badge: string | null;
  onActivate: (anchor: DOMRect) => void;
}) {
  return (
    <button
      type="button"
      data-testid="title-card"
      aria-haspopup="dialog"
      onClick={(e) => onActivate(e.currentTarget.getBoundingClientRect())}
      className="group block w-full min-w-0 animate-fade-up self-start text-left"
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-2xl border border-white/10 bg-ink-800 shadow-card transition-transform duration-200 group-hover:-translate-y-1 group-hover:border-sky-400/50 group-focus-visible:border-sky-400">
        {posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={posterUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-ink-700 to-ink-900 p-3">
            <span className="line-clamp-4 text-center font-display text-sm font-bold text-white/30 sm:text-lg">{title}</span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent" />
        {badge && (
          <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/90 backdrop-blur">
            {badge}
          </span>
        )}
        <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold backdrop-blur">
          {rating && rating > 0 ? (
            <>
              <span aria-hidden="true" className="text-amber-400">★</span>
              <span aria-label={`Rating ${formatRating(rating)}`}>{formatRating(rating)}</span>
            </>
          ) : (
            <span aria-label="Not rated" className="text-white/60">NR</span>
          )}
        </span>
      </div>
      <p className="mt-2 truncate text-sm font-semibold text-white/90" title={title}>
        {title}
      </p>
      {year && <p className="text-xs text-white/50">{year}</p>}
    </button>
  );
}
