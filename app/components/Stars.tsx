"use client";

function Star({ fill, size }: { fill: number; size: number }) {
    // fill: 0..1 portion of this star that is filled
    const id = `star-${Math.random().toString(36).slice(2)}`;
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" className="shrink-0">
            <defs>
                <linearGradient id={id}>
                    <stop offset={`${fill * 100}%`} stopColor="#fbbf24" />
                    <stop offset={`${fill * 100}%`} stopColor="transparent" />
                </linearGradient>
            </defs>
            <polygon
                points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
                fill={`url(#${id})`}
                stroke="#fbbf24"
                strokeWidth="1.2"
            />
        </svg>
    );
}

/** Read-only star display. `avg` 0–5, optional count. */
export function Stars({ avg, count, size = 14, showCount = true }: { avg: number; count?: number; size?: number; showCount?: boolean }) {
    if (!count) {
        return <span className="text-xs text-zinc-600">No reviews yet</span>;
    }
    return (
        <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-center gap-0.5">
                {[0, 1, 2, 3, 4].map((i) => (
                    <Star key={i} size={size} fill={Math.max(0, Math.min(1, avg - i))} />
                ))}
            </span>
            <span className="text-xs text-zinc-400 font-medium">{avg.toFixed(1)}</span>
            {showCount && <span className="text-xs text-zinc-600">({count})</span>}
        </span>
    );
}

/** Interactive star picker for leaving a rating. */
export function StarPicker({ value, onChange, size = 24 }: { value: number; onChange: (v: number) => void; size?: number }) {
    return (
        <div className="inline-flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => onChange(n)}
                    className="cursor-pointer transition-transform hover:scale-110" title={`${n} star${n > 1 ? "s" : ""}`}>
                    <svg width={size} height={size} viewBox="0 0 24 24"
                        fill={n <= value ? "#fbbf24" : "transparent"} stroke="#fbbf24" strokeWidth="1.5">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                </button>
            ))}
        </div>
    );
}
