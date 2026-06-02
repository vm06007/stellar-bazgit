"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import ReactMarkdown from "react-markdown";
import BuyButton from "@/app/components/BuyButton";
import MonetizeModal, { type ExistingEntry } from "@/app/components/MonetizeModal";
import { SiteHeader } from "@/app/components/SiteHeader";
import { AgentPanel, AgentFAB } from "@/app/components/AgentPanel";
import { shortStellarAddress } from "@/lib/stellar";

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
    listing?: {
        description?: string;
        use_readme?: boolean;
        images?: string[];
        preview_url?: string;
    } | null;
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

type Purchase = {
    id: string;
    full_name: string;
    path: string | null;
    payer: string;
    transaction: string;
    network: string;
    amount: string;
    asset: "XLM" | "USDC";
    paid_at: string;
};

function timeAgo(iso: string): string {
    const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (secs < 60) return "just now";
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    return `${Math.floor(secs / 86400)}d ago`;
}

function lowestPrice(rules: { price: string }[]): string {
    const prices = rules.map((r) => parseFloat(r.price)).filter((p) => !isNaN(p) && p > 0);
    return prices.length ? Math.min(...prices).toFixed(2) : "?";
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button onClick={() => { navigator.clipboard.writeText(text); toast.success("Copied!"); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="text-xs text-zinc-400 hover:text-white bg-zinc-700 hover:bg-zinc-600 px-2 py-1 rounded cursor-pointer transition-colors shrink-0">
            {copied ? "Copied!" : "Copy"}
        </button>
    );
}

function ImageGallery({ images }: { images: string[] }) {
    const [lightbox, setLightbox] = useState<number | null>(null);

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (lightbox === null) return;
            if (e.key === "ArrowLeft") setLightbox(i => i !== null ? (i - 1 + images.length) % images.length : null);
            if (e.key === "ArrowRight") setLightbox(i => i !== null ? (i + 1) % images.length : null);
            if (e.key === "Escape") setLightbox(null);
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    });

    return (
        <>
            <div className="mb-8 flex gap-3 overflow-x-auto pb-2">
                {images.map((src, i) => (
                    <button key={i} onClick={() => setLightbox(i)} className="shrink-0 cursor-pointer group">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt={`Screenshot ${i + 1}`}
                            className="h-48 w-auto rounded-lg object-cover border border-zinc-800 group-hover:border-zinc-500 transition-colors"
                            style={{ maxWidth: "320px" }} />
                    </button>
                ))}
            </div>
            {lightbox !== null && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm" onClick={() => setLightbox(null)}>
                    <button onClick={(e) => { e.stopPropagation(); setLightbox(i => i !== null ? (i - 1 + images.length) % images.length : null); }}
                        className="absolute left-4 text-zinc-300 hover:text-white text-3xl px-3 py-2 cursor-pointer select-none">‹</button>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={images[lightbox]} alt="" className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
                    <button onClick={(e) => { e.stopPropagation(); setLightbox(i => i !== null ? (i + 1) % images.length : null); }}
                        className="absolute right-4 text-zinc-300 hover:text-white text-3xl px-3 py-2 cursor-pointer select-none">›</button>
                    <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 text-zinc-400 hover:text-white text-xl cursor-pointer px-2 py-1">✕</button>
                    {images.length > 1 && (
                        <div className="absolute bottom-4 flex gap-1.5">
                            {images.map((_, i) => (
                                <button key={i} onClick={(e) => { e.stopPropagation(); setLightbox(i); }}
                                    className={`w-2 h-2 rounded-full transition-colors cursor-pointer ${i === lightbox ? "bg-white" : "bg-zinc-600 hover:bg-zinc-400"}`} />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </>
    );
}

function BargainPanel({ fullName, listingPrice, asset }: { fullName: string; listingPrice: string; asset: string }) {
    const [open, setOpen] = useState(false);
    const [amount, setAmount] = useState("");
    const [bidder, setBidder] = useState("");
    const [message, setMessage] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [sent, setSent] = useState(false);

    async function submit() {
        const price = parseFloat(amount);
        if (isNaN(price) || price <= 0) { toast.error("Enter a valid amount"); return; }
        if (!bidder.trim()) { toast.error("Enter your Stellar address or handle"); return; }
        setSubmitting(true);
        try {
            const res = await fetch("/api/bids", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ full_name: fullName, amount: price.toFixed(2), asset, message, bidder: bidder.trim() }),
            });
            if (res.ok) { setSent(true); toast.success("Offer sent to the seller!"); }
            else { const d = await res.json(); toast.error(d.error ?? "Failed to send offer"); }
        } catch { toast.error("Network error"); }
        finally { setSubmitting(false); }
    }

    const suggested = (parseFloat(listingPrice) * 0.7).toFixed(2);

    return (
        <div className="mt-3">
            <div className="flex items-center gap-3 my-3">
                <div className="flex-1 h-px bg-zinc-800" /><span className="text-xs text-zinc-600">or</span><div className="flex-1 h-px bg-zinc-800" />
            </div>
            {sent ? (
                <div className="rounded-lg border border-cyan-800/50 bg-cyan-950/20 px-4 py-3 text-center">
                    <p className="text-sm text-cyan-400 font-medium">Offer sent!</p>
                    <p className="text-xs text-zinc-500 mt-0.5">The seller will review your bid and respond.</p>
                </div>
            ) : !open ? (
                <button onClick={() => { setOpen(true); setAmount(suggested); }}
                    className="w-full py-2.5 rounded-lg border border-zinc-700 hover:border-zinc-500 text-sm text-zinc-400 hover:text-white transition-colors cursor-pointer">
                    💬 Make an Offer
                </button>
            ) : (
                <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-zinc-300">Your offer</p>
                        <button onClick={() => setOpen(false)} className="text-zinc-600 hover:text-zinc-400 text-xs cursor-pointer">✕</button>
                    </div>
                    <div className="flex items-center bg-zinc-800 border border-zinc-700 rounded-md focus-within:border-zinc-500 transition-colors">
                        <input type="text" inputMode="decimal" value={amount}
                            onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                            placeholder={suggested}
                            className="flex-1 bg-transparent px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none" />
                        <span className="text-zinc-500 text-xs pr-3 shrink-0">{asset}</span>
                    </div>
                    <input type="text" value={bidder} onChange={e => setBidder(e.target.value)}
                        placeholder="Your Stellar address (G…) or handle"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-white font-mono placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 resize-none transition-colors" />
                    <textarea value={message} onChange={e => setMessage(e.target.value)}
                        placeholder="Optional message to the seller…" rows={2}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 resize-none" />
                    <button onClick={submit} disabled={submitting || !amount || !bidder}
                        className="w-full py-2.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-sm text-white font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                        {submitting ? "Sending…" : "Send Offer"}
                    </button>
                    <p className="text-xs text-zinc-600 text-center">Seller can accept or decline your offer.</p>
                </div>
            )}
        </div>
    );
}

function Skeleton() {
    return (
        <div className="min-h-screen bg-zinc-950 text-white">
            <div className="sticky top-0 z-20 h-16 border-b border-zinc-800 bg-zinc-950/95" />
            <main className="max-w-5xl mx-auto px-6 py-12 space-y-6">
                <div className="h-4 w-48 bg-zinc-800 rounded animate-pulse" />
                <div className="h-8 w-64 bg-zinc-800 rounded animate-pulse" />
                <div className="h-4 w-full bg-zinc-800 rounded animate-pulse" />
                <div className="h-4 w-3/4 bg-zinc-800 rounded animate-pulse" />
            </main>
        </div>
    );
}

export default function RepoDetailPage({ params }: { params: Promise<{ owner: string; repo: string }> }) {
    const { owner, repo } = use(params);
    const full_name = `${owner}/${repo}`;

    const { data: session } = useSession();
    const githubLogin = (session as any)?.login ?? session?.user?.name ?? "";
    const isOwner = !!session && githubLogin === owner;

    const [entry, setEntry] = useState<CatalogEntry | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [ownerProfile, setOwnerProfile] = useState<GitHubUser | null>(null);
    const [purchases, setPurchases] = useState<Purchase[]>([]);
    const [editOpen, setEditOpen] = useState(false);
    const [agentOpen, setAgentOpen] = useState(false);

    function fetchPurchases() {
        fetch(`/api/purchases?repo=${encodeURIComponent(full_name)}`)
            .then((r) => r.ok ? r.json() : [])
            .then((data) => { if (Array.isArray(data)) setPurchases(data); })
            .catch(() => {});
    }

    useEffect(() => {
        Promise.all([
            fetch(`/api/catalog?repo=${encodeURIComponent(full_name)}`).then(async (r) => {
                if (r.status === 404) { setNotFound(true); return null; }
                return r.json();
            }),
            fetch(`https://api.github.com/users/${owner}`).then((r) => r.ok ? r.json() : null),
            fetch(`/api/purchases?repo=${encodeURIComponent(full_name)}`).then((r) => r.ok ? r.json() : []),
        ]).then(([catalogData, userData, purchaseData]) => {
            if (catalogData && !catalogData.error) setEntry(catalogData);
            else if (!catalogData || catalogData.error) setNotFound(true);
            if (userData && !userData.message) setOwnerProfile(userData);
            if (Array.isArray(purchaseData)) setPurchases(purchaseData);
            setLoading(false);
        }).catch(() => { setNotFound(true); setLoading(false); });
    }, [full_name, owner]);

    if (loading) return <Skeleton />;

    const originUrl = typeof window !== "undefined" ? window.location.origin : "";
    const gatewayUrl = `${originUrl}/api/access/${full_name}`;
    const curlBasic = `curl -i ${gatewayUrl}`;

    if (notFound || !entry) {
        return (
            <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
                <SiteHeader />
                <main className="flex-1 flex flex-col items-center justify-center text-center px-6">
                    <p className="text-zinc-400 text-lg mb-2">Repository not found</p>
                    <p className="text-zinc-600 text-sm mb-6">
                        <code className="font-mono">{full_name}</code> is not in the catalog.
                    </p>
                    <Link href="/catalog" className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors">← Back to catalog</Link>
                </main>
            </div>
        );
    }

    const asset = entry.rules[0]?.asset ?? "XLM";
    const explorerBase = entry.stellarAddress
        ? (process.env.STELLAR_NETWORK === "mainnet"
            ? "https://stellar.expert/explorer/public"
            : "https://stellar.expert/explorer/testnet")
        : null;

    return (
        <div className={`bg-zinc-950 text-white flex flex-row ${agentOpen ? "h-screen overflow-hidden" : "min-h-screen"}`}>
        <div className={`flex flex-col flex-1 min-w-0 ${agentOpen ? "overflow-y-auto" : ""}`}>
            <SiteHeader right={
                <Link href="/catalog" className="text-sm text-zinc-400 hover:text-white transition-colors hidden sm:block">← Catalog</Link>
            } />

            <main className="max-w-5xl mx-auto px-6 py-10 w-full">
                {/* Breadcrumb */}
                <nav className="flex items-center gap-1.5 text-sm text-zinc-500 mb-8 flex-wrap">
                    <Link href="/" className="hover:text-zinc-300 transition-colors">Home</Link>
                    <span>/</span>
                    <Link href="/catalog" className="hover:text-zinc-300 transition-colors">catalog</Link>
                    <span>/</span>
                    <Link href={`/publisher/${owner}`} className="hover:text-zinc-300 transition-colors font-mono">{owner}</Link>
                    <span>/</span>
                    <span className="text-zinc-300 font-mono">{entry.name}</span>
                </nav>

                {/* Title */}
                <div className="mb-8">
                    <div className="flex items-center gap-3 flex-wrap mb-1">
                        <h1 className="text-2xl font-bold tracking-tight font-mono">{entry.full_name}</h1>
                        {isOwner && (
                            <button onClick={() => setEditOpen(true)}
                                className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md border border-zinc-600 hover:border-zinc-400 text-zinc-400 hover:text-white transition-colors cursor-pointer">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                                Edit Listing
                            </button>
                        )}
                    </div>
                    {entry.description && <p className="text-zinc-400 text-base mt-1">{entry.description}</p>}
                    <div className="flex items-center gap-3 mt-3 flex-wrap">
                        {entry.language && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300">{entry.language}</span>
                        )}
                        {entry.stars > 0 && <span className="text-xs text-zinc-500">★ {entry.stars}</span>}
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                            entry.mode === "flat" ? "bg-indigo-950/50 border-indigo-800 text-indigo-400" : "bg-purple-950/50 border-purple-800 text-purple-400"
                        }`}>{entry.mode === "flat" ? "flat pricing" : "per file pricing"}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-950/40 border border-cyan-900 text-cyan-500 font-medium">
                            {asset} on Stellar
                        </span>
                    </div>
                </div>

                {/* Owner card */}
                {ownerProfile && (
                    <div className="mb-8 rounded-lg border border-zinc-800 bg-zinc-900 px-5 py-4">
                        <div className="flex items-center gap-4">
                            <a href={`https://github.com/${ownerProfile.login}`} target="_blank" rel="noopener noreferrer" className="shrink-0">
                                <Image src={ownerProfile.avatar_url} alt={ownerProfile.login} width={48} height={48}
                                    className="rounded-full border border-zinc-700 hover:border-zinc-500 transition-colors" />
                            </a>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <Link href={`/publisher/${ownerProfile.login}`} className="font-semibold text-white hover:text-cyan-400 transition-colors">
                                        {ownerProfile.name ?? ownerProfile.login}
                                    </Link>
                                    <Link href={`/publisher/${ownerProfile.login}`} className="text-zinc-500 text-sm font-mono hover:text-zinc-300 transition-colors">
                                        @{ownerProfile.login}
                                    </Link>
                                    <Link href={`/publisher/${ownerProfile.login}`} className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-700 hover:border-zinc-500 rounded px-2 py-0.5 transition-colors">
                                        All repos ↗
                                    </Link>
                                    <a href={`https://github.com/${ownerProfile.login}`} target="_blank" rel="noopener noreferrer"
                                        className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-700 hover:border-zinc-500 rounded px-2 py-0.5 transition-colors">
                                        GitHub ↗
                                    </a>
                                </div>
                                {ownerProfile.bio && <p className="text-sm text-zinc-400 mt-0.5 truncate">{ownerProfile.bio}</p>}
                                <div className="flex items-center gap-4 mt-1.5 flex-wrap">
                                    <span className="text-xs text-zinc-500"><span className="text-zinc-200 font-medium">{ownerProfile.followers.toLocaleString()}</span> followers</span>
                                    {ownerProfile.company && <span className="text-xs text-zinc-500">🏢 {ownerProfile.company.replace(/^@/, "")}</span>}
                                    {ownerProfile.location && <span className="text-xs text-zinc-500">📍 {ownerProfile.location}</span>}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Image gallery */}
                {entry.listing?.images && entry.listing.images.length > 0 && (
                    <ImageGallery images={entry.listing.images} />
                )}

                {/* Description / overview */}
                {entry.listing?.description && (
                    <div className="mb-8">
                        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500 mb-3">Overview</h2>
                        <div className="prose prose-invert prose-sm max-w-none text-zinc-300 [&_a]:text-cyan-400 [&_a:hover]:text-cyan-300 [&_code]:bg-zinc-800 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_pre]:bg-zinc-900 [&_pre]:border [&_pre]:border-zinc-800 [&_pre]:rounded-lg [&_pre]:p-4 [&_pre]:overflow-x-auto">
                            <ReactMarkdown>{entry.listing.description}</ReactMarkdown>
                        </div>
                    </div>
                )}

                {entry.listing?.preview_url && (
                    <div className="mb-8">
                        <a href={entry.listing.preview_url} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-zinc-700 hover:border-zinc-500 text-sm text-zinc-300 hover:text-white transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" /><polygon points="10 8 16 12 10 16 10 8" />
                            </svg>
                            Live Preview ↗
                        </a>
                    </div>
                )}

                {/* Two-column: Buy + Agent */}
                <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
                    {/* Buy */}
                    <div className="flex flex-col gap-4">
                        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">Purchase</h2>
                        {entry.mode === "flat" ? (
                            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6 flex flex-col flex-1 gap-6">
                                <div className="flex flex-col gap-2">
                                    <p className="text-zinc-500 text-xs uppercase tracking-widest">Full repo access</p>
                                    <p className="text-4xl font-bold text-white">{parseFloat(entry.rules[0]?.price ?? "0").toFixed(2)}</p>
                                    <p className="text-zinc-400 text-sm">
                                        per access · {asset} on Stellar
                                        {entry.stellarAddress && (
                                            <> · Pays to{" "}
                                                {explorerBase ? (
                                                    <a href={`${explorerBase}/account/${entry.stellarAddress}`} target="_blank" rel="noopener noreferrer"
                                                        className="font-mono text-zinc-500 hover:text-cyan-400 transition-colors">
                                                        {shortStellarAddress(entry.stellarAddress)}
                                                    </a>
                                                ) : (
                                                    <span className="font-mono text-zinc-500">{shortStellarAddress(entry.stellarAddress)}</span>
                                                )}
                                            </>
                                        )}
                                    </p>
                                    <p className="text-zinc-600 text-xs">One payment unlocks all files in this repository.</p>
                                </div>
                                <div className="w-full">
                                    <BuyButton fullName={entry.full_name} onSuccess={fetchPurchases} />
                                    <BargainPanel fullName={entry.full_name} listingPrice={entry.rules[0]?.price ?? "1"} asset={asset} />
                                </div>
                            </div>
                        ) : (
                            <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden flex flex-col flex-1">
                                <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between gap-4">
                                    <p className="text-xs text-zinc-500">
                                        From <span className="text-white font-semibold">{lowestPrice(entry.rules)} {asset}</span> · Stellar
                                    </p>
                                    {entry.stellarAddress && (
                                        <p className="text-xs text-zinc-600 font-mono">→ {shortStellarAddress(entry.stellarAddress)}</p>
                                    )}
                                </div>
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-zinc-800">
                                            <th className="text-left px-4 py-2 text-xs text-zinc-500 font-medium">Path</th>
                                            <th className="text-right px-4 py-2 text-xs text-zinc-500 font-medium">Price</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {entry.rules.map((rule) => (
                                            <tr key={rule.path} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/30 transition-colors">
                                                <td className="px-4 py-2.5 font-mono text-zinc-300 text-xs">{rule.path}</td>
                                                <td className="px-4 py-2.5 text-right text-white font-semibold">{parseFloat(rule.price).toFixed(2)} {rule.asset}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <div className="p-4 border-t border-zinc-800 mt-auto">
                                    <BuyButton fullName={entry.full_name} onSuccess={fetchPurchases} />
                                    <BargainPanel fullName={entry.full_name} listingPrice={lowestPrice(entry.rules)} asset={asset} />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Agent instructions */}
                    <div className="flex flex-col gap-4">
                        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">Agent Instructions</h2>
                        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 space-y-5 flex-1">
                            <div className="space-y-2">
                                <p className="text-xs text-zinc-500 uppercase tracking-widest">Gateway URL</p>
                                <div className="flex items-center gap-2 bg-zinc-950 rounded-md px-3 py-2 border border-zinc-800 overflow-hidden">
                                    <code className="text-xs text-cyan-400 flex-1 break-all">{gatewayUrl}</code>
                                    <CopyButton text={gatewayUrl} />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <p className="text-xs text-zinc-500 uppercase tracking-widest">Try it — 402 response</p>
                                <div className="flex items-center gap-2 bg-zinc-950 rounded-md px-3 py-2.5 border border-zinc-800 overflow-hidden">
                                    <code className="text-xs text-zinc-300 break-all flex-1">{curlBasic}</code>
                                    <CopyButton text={curlBasic} />
                                </div>
                                <p className="text-xs text-zinc-600">
                                    Returns <span className="text-amber-400">402 Payment Required</span> with machine-readable Stellar payment instructions.
                                </p>
                            </div>
                            <div className="space-y-2">
                                <p className="text-xs text-zinc-500 uppercase tracking-widest">With payment token</p>
                                <div className="flex items-center gap-2 bg-zinc-950 rounded-md px-3 py-2.5 border border-zinc-800 overflow-hidden">
                                    <code className="text-xs text-zinc-300 break-all flex-1">{`curl -H "X-Payment-Token: <token>" ${gatewayUrl}`}</code>
                                    <CopyButton text={`curl -H "X-Payment-Token: <token>" ${gatewayUrl}`} />
                                </div>
                                <p className="text-xs text-zinc-600">Returns file content after a valid payment.</p>
                            </div>
                            <div className="rounded-md bg-zinc-800/50 border border-zinc-700 px-3 py-2.5">
                                <p className="text-xs text-zinc-400 leading-relaxed">
                                    <span className="text-zinc-200 font-medium">Stellar-native payments</span>{" "}
                                    — The 402 response includes a structured JSON body with <code className="text-zinc-500 bg-zinc-900 px-1 rounded">stellar_address</code>, <code className="text-zinc-500 bg-zinc-900 px-1 rounded">amount</code>, <code className="text-zinc-500 bg-zinc-900 px-1 rounded">asset</code>, and <code className="text-zinc-500 bg-zinc-900 px-1 rounded">memo</code> so agents can pay autonomously. Settles in 2–5s with sub-cent fees.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Recent purchases */}
                <div className="mt-10 space-y-4">
                    <div className="flex items-center justify-between gap-4">
                        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">
                            Recent Purchases{purchases.length > 0 && <span className="ml-2 text-zinc-600 normal-case tracking-normal font-normal">({purchases.length})</span>}
                        </h2>
                        {entry.stellarAddress && explorerBase && (
                            <a href={`${explorerBase}/account/${entry.stellarAddress}`} target="_blank" rel="noopener noreferrer"
                                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1 shrink-0">
                                View on Stellar Expert ↗
                            </a>
                        )}
                    </div>

                    {purchases.length === 0 ? (
                        <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-5 py-8 text-center">
                            <p className="text-zinc-600 text-sm">No purchases yet — be the first.</p>
                        </div>
                    ) : (
                        <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-zinc-800">
                                        <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-medium">Buyer</th>
                                        <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-medium hidden sm:table-cell">Path</th>
                                        <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-medium hidden md:table-cell">Transaction</th>
                                        <th className="text-right px-4 py-2.5 text-xs text-zinc-500 font-medium">Amount</th>
                                        <th className="text-right px-4 py-2.5 text-xs text-zinc-500 font-medium hidden sm:table-cell">When</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {purchases.map((p) => {
                                        const txExplorer = explorerBase ? `${explorerBase}/tx/${p.transaction}` : null;
                                        const shortPayer = p.payer.length > 20 ? shortStellarAddress(p.payer) : p.payer;
                                        const shortTx = p.transaction ? `${p.transaction.slice(0, 8)}…${p.transaction.slice(-6)}` : "—";
                                        return (
                                            <tr key={p.id} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/30 transition-colors">
                                                <td className="px-4 py-3">
                                                    <span className="font-mono text-xs text-zinc-400">{shortPayer}</span>
                                                </td>
                                                <td className="px-4 py-3 hidden sm:table-cell">
                                                    <span className="font-mono text-xs text-zinc-400">{p.path ?? "full repo"}</span>
                                                </td>
                                                <td className="px-4 py-3 hidden md:table-cell">
                                                    {txExplorer ? (
                                                        <a href={txExplorer} target="_blank" rel="noopener noreferrer"
                                                            className="font-mono text-xs text-zinc-400 hover:text-cyan-400 transition-colors">
                                                            {shortTx} ↗
                                                        </a>
                                                    ) : (
                                                        <span className="font-mono text-xs text-zinc-500">{shortTx}</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <span className="text-xs font-semibold text-white">{parseFloat(p.amount).toFixed(2)}</span>
                                                    <span className="text-xs text-zinc-500 ml-1">{p.asset}</span>
                                                </td>
                                                <td className="px-4 py-3 text-right hidden sm:table-cell">
                                                    <span className="text-xs text-zinc-500">{timeAgo(p.paid_at)}</span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className="mt-10 pt-6 border-t border-zinc-800">
                    <Link href="/catalog" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">← Back to catalog</Link>
                </div>
            </main>

            {editOpen && isOwner && (
                <MonetizeModal
                    repo={{ full_name: entry.full_name, name: entry.name }}
                    existing={entry as unknown as ExistingEntry}
                    onClose={() => setEditOpen(false)}
                    onSaved={async () => {
                        setEditOpen(false);
                        toast.success("Listing updated!");
                        const r = await fetch(`/api/catalog?repo=${encodeURIComponent(full_name)}`);
                        if (r.ok) setEntry(await r.json());
                    }}
                />
            )}
        </div>
        {agentOpen && (
            <AgentPanel
                onClose={() => setAgentOpen(false)}
                context={{ repos: [{ full_name, name: entry.name, private: true }] }}
            />
        )}
        {!agentOpen && <AgentFAB onClick={() => setAgentOpen(true)} />}
        </div>
    );
}
