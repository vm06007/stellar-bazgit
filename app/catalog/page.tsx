"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { SiteHeader } from "@/app/components/SiteHeader";
import { AgentPanel, AgentFAB } from "@/app/components/AgentPanel";

type CatalogEntry = {
    full_name: string;
    name: string;
    description: string | null;
    language: string | null;
    stars: number;
    mode: "flat" | "granular";
    rules: { path: string; price: string; asset: "XLM" | "USDC" }[];
    gateway_url: string;
    page_url: string;
    stellarAddress: string | null;
    listing?: { description?: string } | null;
};

type OwnerProfile = { login: string; name: string | null; avatar_url: string };

function lowestPrice(rules: { price: string }[]): string {
    const prices = rules.map((r) => parseFloat(r.price)).filter((p) => !isNaN(p) && p > 0);
    return prices.length ? Math.min(...prices).toFixed(2) : "?";
}

function PriceBadge({ entry }: { entry: CatalogEntry }) {
    const asset = entry.rules[0]?.asset ?? "XLM";
    if (entry.mode === "flat") {
        const price = entry.rules[0]?.price ? parseFloat(entry.rules[0].price).toFixed(2) : "?";
        return <>{price} {asset}</>;
    }
    return <>from {lowestPrice(entry.rules)} {asset}</>;
}

function SkeletonCard() {
    return (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 space-y-3 animate-pulse">
            <div className="h-4 bg-zinc-800 rounded w-2/3" />
            <div className="h-3 bg-zinc-800 rounded w-full" />
            <div className="h-3 bg-zinc-800 rounded w-4/5" />
            <div className="flex gap-2 mt-4">
                <div className="h-5 bg-zinc-800 rounded w-16" />
                <div className="h-5 bg-zinc-800 rounded w-14" />
            </div>
        </div>
    );
}

function ApiPanel() {
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const origin = typeof window !== "undefined" ? window.location.origin : "https://stellar-bazgit.app";

    const snippet = `# All listed repos
GET ${origin}/api/catalog

# Filter by seller
GET ${origin}/api/catalog?owner=alice

# Single repo
GET ${origin}/api/catalog?repo=alice/my-repo

# Payment gateway — returns 402 with Stellar details
GET ${origin}/api/access/alice/my-repo`;

    return (
        <div className="mb-8 rounded-lg border border-zinc-800 bg-zinc-900">
            <button onClick={() => setOpen(v => !v)}
                className="flex items-center gap-2 w-full px-4 py-3 text-left cursor-pointer">
                <span className="text-zinc-500 text-xs transition-transform duration-150"
                    style={{ display: "inline-block", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Agent & API Access</span>
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-900/40 text-indigo-400 border border-indigo-800/60 font-medium ml-1">no auth needed</span>
            </button>
            {open && (
                <div className="border-t border-zinc-800 px-4 py-4 space-y-4">
                    <div className="flex gap-3 p-3 rounded-md bg-zinc-800/50 border border-zinc-700/50">
                        <span className="text-lg shrink-0">⚡</span>
                        <p className="text-xs text-zinc-400 leading-relaxed">
                            The catalog is a <span className="text-zinc-200 font-medium">public, unauthenticated endpoint</span> — agents can discover all repos, prices, and Stellar addresses without credentials. Each entry includes everything needed to pay and clone autonomously.
                        </p>
                    </div>
                    <div className="rounded-md bg-zinc-950 border border-zinc-800 overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800">
                            <span className="text-xs text-zinc-600 font-mono">Stellar Bazgit API</span>
                            <button onClick={() => { navigator.clipboard.writeText(snippet); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                                className="text-xs text-zinc-600 hover:text-zinc-300 cursor-pointer transition-colors">
                                {copied ? "Copied!" : "Copy"}
                            </button>
                        </div>
                        <pre className="px-3 py-3 text-[11px] text-zinc-400 font-mono leading-relaxed overflow-x-auto whitespace-pre">{snippet}</pre>
                    </div>
                    <p className="text-xs text-zinc-600">
                        The 402 response includes <code className="text-zinc-500 bg-zinc-800 px-1 rounded">stellar_address</code>,{" "}
                        <code className="text-zinc-500 bg-zinc-800 px-1 rounded">amount</code>,{" "}
                        <code className="text-zinc-500 bg-zinc-800 px-1 rounded">asset</code>, and{" "}
                        <code className="text-zinc-500 bg-zinc-800 px-1 rounded">memo</code> — POST the tx hash to{" "}
                        <code className="text-zinc-500 bg-zinc-800 px-1 rounded">/api/pay</code> to receive a 1-hour clone token.
                    </p>
                </div>
            )}
        </div>
    );
}

export default function CatalogPage() {
    const [entries, setEntries] = useState<CatalogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [ownerProfiles, setOwnerProfiles] = useState<Record<string, OwnerProfile>>({});
    const [search, setSearch] = useState("");
    const [agentOpen, setAgentOpen] = useState(false);

    useEffect(() => {
        fetch("/api/catalog")
            .then((r) => r.json())
            .then(async (data) => {
                const list: CatalogEntry[] = Array.isArray(data) ? data : [];
                setEntries(list);
                setLoading(false);

                const owners = [...new Set(list.map((e) => e.full_name.split("/")[0]))];
                const profiles = await Promise.all(
                    owners.map((o) =>
                        fetch(`https://api.github.com/users/${o}`)
                            .then((r) => (r.ok ? r.json() : null))
                            .catch(() => null)
                    )
                );
                const map: Record<string, OwnerProfile> = {};
                for (const p of profiles) {
                    if (p && !p.message) map[p.login] = { login: p.login, name: p.name, avatar_url: p.avatar_url };
                }
                setOwnerProfiles(map);
            })
            .catch(() => setLoading(false));
    }, []);

    const filtered = search.trim()
        ? entries.filter((e) =>
            e.full_name.toLowerCase().includes(search.toLowerCase()) ||
            (e.description ?? "").toLowerCase().includes(search.toLowerCase()) ||
            (e.language ?? "").toLowerCase().includes(search.toLowerCase())
        )
        : entries;

    return (
        <div className={`bg-zinc-950 text-white flex flex-row ${agentOpen ? "h-screen overflow-hidden" : "min-h-screen"}`}>
        <div className={`flex flex-col flex-1 min-w-0 ${agentOpen ? "overflow-y-auto" : ""}`}>
            <SiteHeader right={
                <Link href="/catalog" className="text-sm text-zinc-400 hover:text-white transition-colors hidden sm:block">Catalog</Link>
            } />

            <main className="max-w-4xl mx-auto px-6 py-10 w-full">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight">Catalog</h1>
                    <p className="text-zinc-400 mt-2">Private GitHub repos available to purchase with XLM or USDC on Stellar.</p>
                </div>

                <ApiPanel />

                {!loading && entries.length > 0 && (
                    <div className="mb-6">
                        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search repos, descriptions, languages…"
                            className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors" />
                    </div>
                )}

                {loading ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                        {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                        <div className="text-4xl mb-4">📭</div>
                        {entries.length === 0 ? (
                            <>
                                <p className="text-zinc-300 font-medium text-lg mb-2">No repos listed yet</p>
                                <p className="text-zinc-500 text-sm mb-6 max-w-sm">Be the first to monetize a private GitHub repository.</p>
                                <Link href="/dashboard" className="px-4 py-2 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium transition-colors">
                                    List your repo →
                                </Link>
                            </>
                        ) : (
                            <>
                                <p className="text-zinc-400 text-lg mb-2">No results for &ldquo;{search}&rdquo;</p>
                                <button onClick={() => setSearch("")} className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer">Clear search</button>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                        {filtered.map((entry) => {
                            const ownerLogin = entry.full_name.split("/")[0];
                            const profile = ownerProfiles[ownerLogin];
                            const asset = entry.rules[0]?.asset ?? "XLM";
                            return (
                                <div key={entry.full_name} className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 flex flex-col gap-3 hover:border-zinc-700 transition-colors">
                                    <div className="flex items-center gap-2">
                                        {profile ? (
                                            <Link href={`/publisher/${ownerLogin}`} className="shrink-0">
                                                <Image src={profile.avatar_url} alt={ownerLogin} width={20} height={20}
                                                    className="rounded-full border border-zinc-700 hover:border-zinc-500 transition-colors" />
                                            </Link>
                                        ) : (
                                            <div className="w-5 h-5 rounded-full bg-zinc-800 shrink-0 animate-pulse" />
                                        )}
                                        <Link href={`/publisher/${ownerLogin}`} className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors font-mono">
                                            {profile?.name ?? ownerLogin}
                                        </Link>
                                        <a href={`https://github.com/${ownerLogin}`} target="_blank" rel="noopener noreferrer"
                                            className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors" onClick={(e) => e.stopPropagation()}>
                                            GitHub ↗
                                        </a>
                                    </div>

                                    <p className="text-base font-semibold text-white">{entry.name}</p>

                                    {entry.listing?.description ? (
                                        <p className="text-sm text-zinc-400 leading-relaxed line-clamp-2">{entry.listing.description.replace(/[#*`]/g, "").trim()}</p>
                                    ) : entry.description ? (
                                        <p className="text-sm text-zinc-400 leading-relaxed line-clamp-2">{entry.description}</p>
                                    ) : (
                                        <p className="text-sm text-zinc-600 italic">No description</p>
                                    )}

                                    <div className="flex items-center gap-2 flex-wrap">
                                        {entry.language && (
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300">{entry.language}</span>
                                        )}
                                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${entry.mode === "flat" ? "bg-indigo-950/50 border-indigo-800 text-indigo-400" : "bg-purple-950/50 border-purple-800 text-purple-400"}`}>
                                            {entry.mode === "flat" ? "flat" : "per file"}
                                        </span>
                                        <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-950/40 border border-cyan-900 text-cyan-500 font-medium">{asset}</span>
                                        {entry.stars > 0 && <span className="text-xs text-zinc-500">★ {entry.stars}</span>}
                                    </div>

                                    <div className="flex items-center justify-between mt-auto pt-3 border-t border-zinc-800">
                                        <span className="text-2xl font-bold text-white tracking-tight"><PriceBadge entry={entry} /></span>
                                        <Link href={entry.page_url} className="inline-flex items-center gap-1.5 text-sm text-cyan-400 hover:text-cyan-300 transition-colors font-medium">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                                            </svg>
                                            View details
                                        </Link>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {!loading && entries.length > 0 && (
                    <p className="text-center text-xs text-zinc-700 mt-10">
                        {filtered.length} of {entries.length} repo{entries.length !== 1 ? "s" : ""} in the catalog
                    </p>
                )}
            </main>
        </div>
        {agentOpen && <AgentPanel onClose={() => setAgentOpen(false)} />}
        {!agentOpen && <AgentFAB onClick={() => setAgentOpen(true)} />}
        </div>
    );
}
