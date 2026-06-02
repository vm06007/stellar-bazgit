"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type CatalogEntry = {
    full_name: string;
    rules: { path: string; price: string; asset: string }[];
    mode: string;
    stellarAddress?: string;
    listing?: { description?: string; preview_url?: string };
    description?: string;
    language?: string;
    stars?: number;
    pushed_at?: string;
    topics?: string[];
};

export default function Catalog() {
    const [entries, setEntries] = useState<CatalogEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/catalog")
            .then((r) => r.json())
            .then((data) => { setEntries(Array.isArray(data) ? data : []); setLoading(false); })
            .catch(() => setLoading(false));
    }, []);

    return (
        <div className="min-h-screen bg-zinc-950 text-white">
            <header className="sticky top-0 z-10 border-b border-zinc-800 px-6 py-4 bg-zinc-950 flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2.5">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-400">
                        <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" />
                            <line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" />
                        </svg>
                    </div>
                    <span className="text-lg font-bold tracking-tight text-white">Stellar Bazgit</span>
                </Link>
                <Link href="/dashboard" className="text-sm text-zinc-400 hover:text-white transition-colors">Dashboard →</Link>
            </header>

            <main className="px-6 py-8 max-w-4xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-2xl font-bold">Catalog</h1>
                    <p className="text-zinc-400 text-sm mt-1">
                        Private GitHub repos for sale — pay with XLM or USDC on Stellar.
                    </p>
                </div>

                {loading ? (
                    <div className="flex items-center gap-2 text-zinc-500 text-sm">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300" />
                        Loading catalog...
                    </div>
                ) : entries.length === 0 ? (
                    <div className="text-center py-20">
                        <p className="text-zinc-600 text-lg">No repos listed yet.</p>
                        <p className="text-zinc-700 text-sm mt-2">Be the first to monetize a repo.</p>
                        <Link href="/dashboard" className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold transition-colors">
                            Go to Dashboard
                        </Link>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {entries.map((entry) => {
                            const price = entry.mode === "flat"
                                ? `${entry.rules[0]?.price ?? "?"} ${entry.rules[0]?.asset ?? "XLM"}`
                                : `${entry.rules.length} rules`;
                            const [owner, repo] = entry.full_name.split("/");

                            return (
                                <div key={entry.full_name}
                                    className="rounded-lg border border-zinc-800 bg-zinc-900 hover:border-zinc-600 transition-colors p-5">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-xs text-zinc-500 font-mono">{owner}/</span>
                                                <h3 className="text-base font-semibold text-white">{repo}</h3>
                                                {entry.language && (
                                                    <span className="text-xs text-zinc-500">{entry.language}</span>
                                                )}
                                                {entry.stars != null && entry.stars > 0 && (
                                                    <span className="text-xs text-zinc-600">★ {entry.stars}</span>
                                                )}
                                            </div>
                                            <p className="text-sm text-zinc-400 mt-1 line-clamp-2">
                                                {entry.listing?.description ?? entry.description ?? "No description"}
                                            </p>
                                            {entry.topics && entry.topics.length > 0 && (
                                                <div className="flex flex-wrap gap-1.5 mt-2">
                                                    {entry.topics.slice(0, 5).map((t) => (
                                                        <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">{t}</span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex flex-col items-end gap-2 shrink-0">
                                            <div className="text-right">
                                                <p className="text-lg font-bold text-cyan-400">{price}</p>
                                                <p className="text-xs text-zinc-600">per access</p>
                                            </div>
                                            <Link
                                                href={`/repo/${entry.full_name}`}
                                                className="px-3 py-1.5 rounded-md text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white transition-colors"
                                            >
                                                View →
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>
        </div>
    );
}
