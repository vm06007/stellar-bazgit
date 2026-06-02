"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { SiteHeader } from "@/app/components/SiteHeader";
import { Stars } from "@/app/components/Stars";

type CatalogEntry = {
    full_name: string;
    name: string;
    description: string | null;
    language: string | null;
    stars: number;
    mode: "flat" | "granular";
    rules: { path: string; price: string; asset: "XLM" | "USDC" }[];
    page_url: string;
    rating?: { avg: number; count: number };
};

type GitHubUser = {
    login: string;
    name: string | null;
    avatar_url: string;
    bio: string | null;
    company: string | null;
    location: string | null;
    blog: string | null;
    followers: number;
    public_repos: number;
    created_at: string;
};

function lowestPrice(rules: { price: string }[]): string {
    const prices = rules.map((r) => parseFloat(r.price)).filter((p) => !isNaN(p) && p > 0);
    return prices.length ? Math.min(...prices).toFixed(2) : "?";
}

export default function PublisherPage({ params }: { params: Promise<{ owner: string }> }) {
    const { owner } = use(params);
    const [repos, setRepos] = useState<CatalogEntry[]>([]);
    const [profile, setProfile] = useState<GitHubUser | null>(null);
    const [rating, setRating] = useState<{ avg: number; count: number }>({ avg: 0, count: 0 });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            fetch(`/api/catalog?owner=${encodeURIComponent(owner)}`).then((r) => r.json()),
            fetch(`https://api.github.com/users/${owner}`).then((r) => r.ok ? r.json() : null),
            fetch(`/api/reviews?owner=${encodeURIComponent(owner)}`).then((r) => r.ok ? r.json() : null),
        ]).then(([repoData, userData, reviewResp]) => {
            setRepos(Array.isArray(repoData) ? repoData : []);
            if (userData && !userData.message) setProfile(userData);
            if (reviewResp?.rating) setRating(reviewResp.rating);
            setLoading(false);
        });
    }, [owner]);

    return (
        <div className="min-h-screen bg-zinc-950 text-white">
            <SiteHeader right={
                <Link href="/bazaar" className="text-sm text-zinc-400 hover:text-white transition-colors">← Bazaar</Link>
            } />

            <main className="max-w-4xl mx-auto px-6 py-10">
                {/* Breadcrumb */}
                <nav className="flex items-center gap-1.5 text-sm text-zinc-500 mb-8">
                    <Link href="/" className="hover:text-zinc-300 transition-colors">Home</Link>
                    <span>/</span>
                    <Link href="/bazaar" className="hover:text-zinc-300 transition-colors">bazaar</Link>
                    <span>/</span>
                    <span className="text-zinc-300 font-mono">{owner}</span>
                </nav>

                {/* Profile card */}
                {loading ? (
                    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6 mb-8 animate-pulse">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-full bg-zinc-800" />
                            <div className="space-y-2 flex-1">
                                <div className="h-4 w-32 bg-zinc-800 rounded" />
                                <div className="h-3 w-64 bg-zinc-800 rounded" />
                            </div>
                        </div>
                    </div>
                ) : profile ? (
                    <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-6 mb-8">
                        <div className="flex items-start gap-5">
                            <a href={`https://github.com/${profile.login}`} target="_blank" rel="noopener noreferrer" className="shrink-0">
                                <Image src={profile.avatar_url} alt={profile.login} width={64} height={64}
                                    className="rounded-full border border-zinc-700 hover:border-cyan-500 transition-colors" />
                            </a>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <h1 className="text-xl font-bold text-white">{profile.name ?? profile.login}</h1>
                                    <span className="text-zinc-500 font-mono text-sm">@{profile.login}</span>
                                    <a href={`https://github.com/${profile.login}`} target="_blank" rel="noopener noreferrer"
                                        className="text-xs border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-200 px-2 py-0.5 rounded transition-colors">
                                        GitHub ↗
                                    </a>
                                    {rating.count > 0 && (
                                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-950/30 border border-amber-900/50">
                                            <Stars avg={rating.avg} count={rating.count} size={13} />
                                            <span className="text-[10px] text-amber-500/70 uppercase tracking-wide">merchant</span>
                                        </span>
                                    )}
                                </div>
                                {profile.bio && <p className="text-zinc-400 text-sm mt-1">{profile.bio}</p>}
                                <div className="flex flex-wrap items-center gap-4 mt-3">
                                    <span className="text-xs text-zinc-500">
                                        <span className="text-zinc-200 font-semibold">{profile.followers.toLocaleString()}</span> followers
                                    </span>
                                    <span className="text-xs text-zinc-500">
                                        <span className="text-zinc-200 font-semibold">{profile.public_repos}</span> public repos
                                    </span>
                                    {profile.company && (
                                        <span className="text-xs text-zinc-500">🏢 {profile.company.replace(/^@/, "")}</span>
                                    )}
                                    {profile.location && (
                                        <span className="text-xs text-zinc-500">📍 {profile.location}</span>
                                    )}
                                    {profile.blog && (
                                        <a href={profile.blog.startsWith("http") ? profile.blog : `https://${profile.blog}`}
                                            target="_blank" rel="noopener noreferrer"
                                            className="text-xs text-zinc-500 hover:text-cyan-400 transition-colors">
                                            🔗 {profile.blog.replace(/^https?:\/\//, "")}
                                        </a>
                                    )}
                                    <span className="text-xs text-zinc-600">
                                        on GitHub since {new Date(profile.created_at).getFullYear()}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="mb-8">
                        <h1 className="text-xl font-bold font-mono">{owner}</h1>
                    </div>
                )}

                {/* Repos */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">Listed repositories</h2>
                        {!loading && <span className="text-xs text-zinc-600">{repos.length} listed</span>}
                    </div>

                    {loading ? (
                        <div className="space-y-3">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 animate-pulse">
                                    <div className="h-4 w-40 bg-zinc-800 rounded mb-2" />
                                    <div className="h-3 w-64 bg-zinc-800 rounded" />
                                </div>
                            ))}
                        </div>
                    ) : repos.length === 0 ? (
                        <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-6 py-10 text-center">
                            <p className="text-zinc-500 text-sm">
                                No repos listed by <span className="font-mono text-zinc-400">{owner}</span> yet.
                            </p>
                        </div>
                    ) : (
                        repos.map((repo) => {
                            const asset = repo.rules[0]?.asset ?? "XLM";
                            const price = repo.mode === "flat"
                                ? `${parseFloat(repo.rules[0]?.price ?? "0").toFixed(2)} ${asset}`
                                : `from ${lowestPrice(repo.rules)} ${asset}`;

                            return (
                                <Link key={repo.full_name} href={`/repo/${repo.full_name}`}
                                    className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-5 py-4 hover:border-zinc-600 hover:bg-zinc-800/50 transition-colors group">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-sm font-medium text-white group-hover:text-cyan-400 transition-colors">
                                                {repo.name}
                                            </span>
                                            <span className={`text-xs px-1.5 py-0.5 rounded-full border font-medium ${
                                                repo.mode === "flat"
                                                    ? "bg-indigo-950/50 border-indigo-800 text-indigo-400"
                                                    : "bg-purple-950/50 border-purple-800 text-purple-400"
                                            }`}>
                                                {repo.mode === "flat" ? "flat" : "per file"}
                                            </span>
                                        </div>
                                        {repo.description && (
                                            <p className="text-xs text-zinc-500 mt-1 truncate">{repo.description}</p>
                                        )}
                                        <div className="flex items-center gap-3 mt-1.5">
                                            {repo.language && <span className="text-xs text-zinc-600">{repo.language}</span>}
                                            {repo.stars > 0 && <span className="text-xs text-zinc-600">★ {repo.stars}</span>}
                                            {repo.rating && repo.rating.count > 0 && <Stars avg={repo.rating.avg} count={repo.rating.count} size={12} />}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0 ml-4">
                                        <span className="text-sm font-semibold text-cyan-400">{price}</span>
                                        <span className="text-xs text-zinc-600 group-hover:text-zinc-400 transition-colors">View →</span>
                                    </div>
                                </Link>
                            );
                        })
                    )}
                </div>
            </main>
        </div>
    );
}
