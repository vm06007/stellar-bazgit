"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import Image from "next/image";
import Link from "next/link";
import { BrandLink, HEADER_TITLE_CLASS, SITE_HEADER_STYLE } from "@/app/components/AppLogo";
import MonetizeModal, { type MonetizedEntry } from "@/app/components/MonetizeModal";
import { AgentPanel, AgentFAB } from "@/app/components/AgentPanel";

type Repo = {
    id: number;
    name: string;
    full_name: string;
    private: boolean;
    description: string | null;
    updated_at: string;
    language: string | null;
    stargazers_count: number;
};

export default function Dashboard() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [repos, setRepos] = useState<Repo[]>([]);
    const [loading, setLoading] = useState(true);
    const [monetizing, setMonetizing] = useState<Repo | null>(null);
    const [monetizedMap, setMonetizedMap] = useState<Record<string, MonetizedEntry>>({});
    const [agentOpen, setAgentOpen] = useState(false);

    function handleMadePrivate(id: number) {
        setRepos((prev) => prev.map((r) => (r.id === id ? { ...r, private: true } : r)));
    }

    function handleMonetized(full_name: string, entry: MonetizedEntry) {
        setMonetizedMap((prev) => ({ ...prev, [full_name]: entry }));
    }

    function handleDemonetized(full_name: string) {
        setMonetizedMap((prev) => { const next = { ...prev }; delete next[full_name]; return next; });
    }

    useEffect(() => {
        if (status === "unauthenticated") router.push("/");
    }, [status, router]);

    async function refreshData() {
        return Promise.all([
            fetch("/api/repos").then((r) => r.json()),
            fetch("/api/monetize").then((r) => r.json()),
        ]).then(([repoData, monetizeData]) => {
            setRepos(Array.isArray(repoData) ? repoData : []);
            const map: Record<string, MonetizedEntry> = {};
            if (Array.isArray(monetizeData)) {
                for (const entry of monetizeData) map[entry.full_name] = entry;
            }
            setMonetizedMap(map);
            setLoading(false);
        }).catch(() => setLoading(false));
    }

    useEffect(() => {
        if (status !== "authenticated") return;
        refreshData();
    }, [status]);

    if (status === "loading") {
        return (
            <div className="flex min-h-screen items-center justify-center bg-zinc-950">
                <div className="flex items-center gap-2.5">
                    <span className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300 shrink-0" />
                    <p className="text-sm text-zinc-400">Loading...</p>
                </div>
            </div>
        );
    }

    const safeRepos = Array.isArray(repos) ? repos : [];
    const privateRepos = safeRepos.filter((r) => r.private);
    const publicRepos = safeRepos.filter((r) => !r.private);

    const agentContext = {
        repos: safeRepos.map(r => ({ name: r.name, full_name: r.full_name, private: r.private })),
        listings: Object.values(monetizedMap).map(m => ({ full_name: m.full_name, rules: m.rules, mode: m.mode })),
    };

    return (
        <div className={`bg-zinc-950 text-white flex flex-row ${agentOpen ? "h-screen overflow-hidden" : "min-h-screen"}`}>
        <div className={`flex flex-col flex-1 min-w-0 ${agentOpen ? "overflow-y-auto" : ""}`}>
            <header
                className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-zinc-800 px-6 bg-zinc-950 overflow-hidden"
                style={SITE_HEADER_STYLE}
            >
                <BrandLink
                    logoSize="md"
                    linkClassName="group/logo flex items-center gap-2.5"
                    titleClassName={HEADER_TITLE_CLASS}
                />
                <ProfileDropdown session={session} />
            </header>

            <main className="px-6 py-8 max-w-4xl mx-auto w-full flex-1">
                <div className="mb-6 flex items-end justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-semibold">
                            Your Repositories{!loading && <span className="text-zinc-500 ml-1">({safeRepos.length})</span>}
                        </h2>
                        <p className="text-zinc-400 text-sm mt-1">
                            Select a repo to monetize — buyers pay in XLM or USDC on Stellar.
                        </p>
                    </div>
                    <Link
                        href="/catalog"
                        className="shrink-0 flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-2 transition-colors"
                    >
                        Browse Catalog
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                        </svg>
                    </Link>
                </div>

                <FeePanel />
                <BidsPanel />
                <ApiKeysPanel />

                {loading ? (
                    <p className="text-zinc-500 text-sm">Fetching repos from GitHub...</p>
                ) : (
                    <>
                        {privateRepos.length > 0 && (
                            <RepoSection label="Private" repos={privateRepos} monetizedMap={monetizedMap}
                                onMadePrivate={handleMadePrivate} onMonetize={setMonetizing} onDemonetize={handleDemonetized} defaultOpen />
                        )}
                        {publicRepos.length > 0 && (
                            <RepoSection label="Public" repos={publicRepos} monetizedMap={monetizedMap}
                                onMadePrivate={handleMadePrivate} onMonetize={setMonetizing} onDemonetize={handleDemonetized} defaultOpen />
                        )}
                        {safeRepos.length === 0 && (
                            <p className="text-zinc-600 text-sm">No repositories found.</p>
                        )}
                    </>
                )}
            </main>

            {monetizing && (
                <MonetizeModal
                    repo={monetizing}
                    existing={monetizedMap[monetizing.full_name] ?? null}
                    onClose={() => setMonetizing(null)}
                    onSaved={(entry) => handleMonetized(monetizing.full_name, entry)}
                />
            )}
        </div>

        {agentOpen && (
            <AgentPanel
                onClose={() => setAgentOpen(false)}
                context={agentContext}
                onRefresh={() => fetch("/api/monetize").then(r => r.json()).then(d => {
                    if (!Array.isArray(d)) return;
                    const map: Record<string, MonetizedEntry> = {};
                    for (const e of d) map[e.full_name] = e;
                    setMonetizedMap(map);
                })}
            />
        )}
        {!agentOpen && <AgentFAB onClick={() => setAgentOpen(true)} />}
        </div>
    );
}

function ProfileDropdown({ session }: { session: ReturnType<typeof useSession>["data"] }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const githubLogin = (session as any)?.login ?? session?.user?.name ?? "";

    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    return (
        <div className="relative" ref={ref}>
            <button onClick={() => setOpen((o) => !o)}
                className="group flex items-center gap-3 px-5 py-4 transition-colors cursor-pointer self-stretch">
                {session?.user?.image && (
                    <div className="w-12 h-12 rounded-full overflow-hidden shrink-0">
                        <Image src={session.user.image} alt={session.user.name ?? "avatar"} width={48} height={48}
                            className="rounded-full transition-transform duration-300 group-hover:scale-125" />
                    </div>
                )}
                <span className="text-sm font-medium text-zinc-500 group-hover:text-white transition-colors">
                    {session?.user?.name}
                </span>
                <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>

            {open && (
                <div className="absolute right-0 -mt-[7px] w-56 rounded-xl border border-zinc-800 bg-zinc-900 shadow-xl py-1 z-50">
                    <div className="px-4 py-2.5 border-b border-zinc-800">
                        <p className="text-xs text-zinc-500">Signed in as</p>
                        <p className="text-sm font-medium text-zinc-200 truncate">{session?.user?.email ?? session?.user?.name}</p>
                    </div>
                    <div className="py-1">
                        <a href={`https://github.com/${githubLogin}`} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-3 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12" />
                            </svg>
                            GitHub profile
                        </a>
                        <Link href="/dashboard" onClick={() => setOpen(false)}
                            className="flex items-center gap-3 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                                <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
                            </svg>
                            Dashboard
                        </Link>
                        <Link href="/catalog" onClick={() => setOpen(false)}
                            className="flex items-center gap-3 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="8" cy="6" r="2" /><path d="M12 6h8" />
                                <circle cx="8" cy="12" r="2" /><path d="M12 12h8" />
                                <circle cx="8" cy="18" r="2" /><path d="M12 18h8" />
                            </svg>
                            Catalog
                        </Link>
                    </div>
                    <div className="border-t border-zinc-800 py-1">
                        <button onClick={() => signOut({ callbackUrl: "/" })}
                            className="flex w-full items-center gap-3 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-red-400 transition-colors cursor-pointer">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                            </svg>
                            Sign out
                        </button>
                        <button
                            onClick={async () => {
                                if (!confirm("This will remove Stellar Bazgit from your GitHub authorized apps. Continue?")) return;
                                await fetch("/api/revoke", { method: "POST" });
                                signOut({ callbackUrl: "/" });
                            }}
                            className="flex w-full items-start gap-3 px-4 py-2.5 hover:bg-red-950/40 transition-colors cursor-pointer group/revoke">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 mt-0.5 text-red-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                            </svg>
                            <div className="text-left">
                                <div className="text-sm text-red-400 font-medium">Revoke GitHub access</div>
                                <div className="text-xs text-zinc-600 group-hover/revoke:text-zinc-500 mt-0.5">Removes app from GitHub settings</div>
                            </div>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function RepoSection({ label, repos, monetizedMap, onMadePrivate, onMonetize, onDemonetize, defaultOpen = true }: {
    label: string; repos: Repo[]; monetizedMap: Record<string, MonetizedEntry>;
    onMadePrivate: (id: number) => void; onMonetize: (repo: Repo) => void;
    onDemonetize: (full_name: string) => void; defaultOpen?: boolean;
}) {
    const [open, setOpen] = useState(defaultOpen);
    const liveCount = repos.filter((r) => monetizedMap[r.full_name]).length;

    return (
        <div className="mb-6">
            <button onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-2 mb-3 group w-full text-left cursor-pointer">
                <span className="text-zinc-500 text-xs transition-transform duration-150" style={{ display: "inline-block", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500 group-hover:text-zinc-300 transition-colors">
                    {label} — {repos.length} repo{repos.length !== 1 ? "s" : ""}
                </span>
                {liveCount > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-cyan-900/50 text-cyan-400 border border-cyan-800 font-medium">
                        {liveCount} live
                    </span>
                )}
            </button>
            {open && (
                <ul className="space-y-2">
                    {repos.map((repo) => (
                        <RepoRow key={repo.id} repo={repo} monetized={monetizedMap[repo.full_name] ?? null}
                            onMadePrivate={onMadePrivate} onMonetize={onMonetize} onDemonetize={onDemonetize} />
                    ))}
                </ul>
            )}
        </div>
    );
}

function RepoRow({ repo, monetized, onMadePrivate, onMonetize, onDemonetize }: {
    repo: Repo; monetized: MonetizedEntry | null;
    onMadePrivate: (id: number) => void; onMonetize: (repo: Repo) => void;
    onDemonetize: (full_name: string) => void;
}) {
    const [converting, setConverting] = useState(false);
    const [removing, setRemoving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const gatewayUrl = monetized ? `${typeof window !== "undefined" ? window.location.origin : ""}/api/access/${repo.full_name}` : null;

    async function makePrivate() {
        setConverting(true); setError(null);
        const res = await fetch("/api/repos/make-private", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ full_name: repo.full_name }),
        });
        const data = await res.json();
        if (!res.ok) {
            setError(data.error ?? "Failed to convert"); setConverting(false);
            toast.error(`Failed to convert "${repo.name}": ${data.error ?? "unknown error"}`);
        } else {
            onMadePrivate(repo.id);
            toast.success(`"${repo.name}" is now private — ready to monetize`);
        }
    }

    async function removeMonetization() {
        if (!confirm(`Remove monetization from "${repo.name}"?`)) return;
        setRemoving(true);
        const res = await fetch("/api/monetize", {
            method: "DELETE", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ full_name: repo.full_name }),
        });
        setRemoving(false);
        if (!res.ok) toast.error("Failed to remove monetization");
        else { onDemonetize(repo.full_name); toast.success(`"${repo.name}" removed from catalog`); }
    }

    function copyUrl() {
        if (!gatewayUrl) return;
        navigator.clipboard.writeText(gatewayUrl);
        setCopied(true); setTimeout(() => setCopied(false), 1500);
        toast.success("Gateway URL copied!");
    }

    const priceLabel = monetized
        ? monetized.mode === "flat"
            ? `${monetized.rules[0]?.price ?? "?"} ${monetized.rules[0]?.asset ?? "XLM"}`
            : `${monetized.rules.length} rule${monetized.rules.length !== 1 ? "s" : ""}`
        : null;

    return (
        <li className={`rounded-lg border transition-colors ${monetized ? "border-cyan-900 bg-cyan-950/20 hover:border-cyan-700" : "border-zinc-800 bg-zinc-900 hover:border-zinc-600"}`}>
            <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${monetized ? "bg-cyan-500" : repo.private ? "bg-amber-600" : "bg-zinc-600"}`} />
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-white truncate">{repo.name}</p>
                            {monetized && (
                                <span className="text-xs px-1.5 py-0.5 rounded-full bg-cyan-900/60 text-cyan-400 border border-cyan-800 font-medium shrink-0">live</span>
                            )}
                        </div>
                        {repo.description && <p className="text-xs text-zinc-500 truncate">{repo.description}</p>}
                        {error && <p className="text-xs text-red-400 mt-0.5">{error}</p>}
                    </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 ml-4">
                    {repo.language && <span className="text-xs text-zinc-500">{repo.language}</span>}
                    {monetized ? (
                        <>
                            <span className="text-xs text-zinc-400 font-mono">{priceLabel}</span>
                            <button onClick={() => onMonetize(repo)}
                                className="text-xs px-3 py-1.5 rounded-md font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-300 transition-colors cursor-pointer">
                                Edit
                            </button>
                            <button onClick={removeMonetization} disabled={removing}
                                className="text-xs px-3 py-1.5 rounded-md font-medium bg-transparent border border-zinc-700 hover:border-red-800 hover:bg-red-950/40 hover:text-red-400 text-zinc-500 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                                {removing ? "..." : "Remove"}
                            </button>
                        </>
                    ) : repo.private ? (
                        <button onClick={() => onMonetize(repo)}
                            className="text-xs px-3 py-1.5 rounded-md font-medium bg-cyan-600 hover:bg-cyan-500 text-white transition-colors cursor-pointer">
                            Monetize →
                        </button>
                    ) : (
                        <button onClick={makePrivate} disabled={converting}
                            className="text-xs px-3 py-1.5 rounded-md font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-300 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                            {converting ? "Converting..." : "Make private"}
                        </button>
                    )}
                </div>
            </div>

            {monetized && gatewayUrl && (
                <div className="flex items-center gap-2 px-4 py-2 border-t border-cyan-900/50 bg-zinc-950/40 rounded-b-lg">
                    <span className="text-xs text-zinc-600 shrink-0">Gateway</span>
                    <code className="text-xs text-cyan-400 flex-1 truncate">{gatewayUrl}</code>
                    <button onClick={copyUrl}
                        className="text-xs text-zinc-500 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 px-2 py-0.5 rounded transition-colors cursor-pointer shrink-0">
                        {copied ? "Copied!" : "Copy"}
                    </button>
                    <a href={gatewayUrl} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-zinc-500 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 px-2 py-0.5 rounded transition-colors shrink-0">
                        Open ↗
                    </a>
                    <a href={`/repo/${repo.full_name}`} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-zinc-500 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 px-2 py-0.5 rounded transition-colors shrink-0">
                        Public page ↗
                    </a>
                </div>
            )}
        </li>
    );
}

type Bid = { id: string; full_name: string; amount: string; asset: string; message: string; bidder: string; status: string; submitted_at: string };

function BidsPanel() {
    const [open, setOpen] = useState(false);
    const [bids, setBids] = useState<Bid[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        fetch("/api/bids").then(r => r.json()).then(d => { if (Array.isArray(d)) setBids(d); }).finally(() => setLoading(false));
    }, [open]);

    async function respond(id: string, status: "accepted" | "rejected") {
        const res = await fetch("/api/bids", {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, status }),
        });
        if (res.ok) setBids(prev => prev.map(b => b.id === id ? { ...b, status } : b));
        else toast.error("Failed to update offer");
    }

    const pendingCount = bids.filter(b => b.status === "pending").length;

    return (
        <div className="mb-4 rounded-lg border border-zinc-800 bg-zinc-900">
            <button onClick={() => setOpen(v => !v)} className="flex items-center gap-2 w-full px-4 py-3 text-left cursor-pointer">
                <span className="text-zinc-500 text-xs transition-transform duration-150" style={{ display: "inline-block", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Incoming Offers</span>
                {pendingCount > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-900/40 text-amber-400 border border-amber-800/60 font-medium">{pendingCount} pending</span>
                )}
            </button>
            {open && (
                <div className="border-t border-zinc-800 px-4 py-4">
                    {loading ? <p className="text-xs text-zinc-500">Loading...</p>
                        : bids.length === 0 ? <p className="text-xs text-zinc-600">No offers yet. Buyers can make offers on your repo listing pages.</p>
                        : (
                            <div className="space-y-2">
                                {bids.map(bid => (
                                    <div key={bid.id} className="rounded-md border border-zinc-800 bg-zinc-950 px-4 py-3 flex items-start gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-sm font-mono text-zinc-300">{bid.full_name}</span>
                                                <span className="text-sm font-semibold text-cyan-400">{bid.amount} {bid.asset}</span>
                                                <span className={`text-xs px-1.5 py-0.5 rounded-full border font-medium ${bid.status === "pending" ? "bg-amber-900/30 text-amber-400 border-amber-800/50" : bid.status === "accepted" ? "bg-cyan-900/30 text-cyan-400 border-cyan-800/50" : "bg-zinc-800 text-zinc-500 border-zinc-700"}`}>
                                                    {bid.status}
                                                </span>
                                            </div>
                                            {bid.message && <p className="text-xs text-zinc-500 mt-1 truncate">{bid.message}</p>}
                                            <p className="text-xs text-zinc-700 mt-0.5">{new Date(bid.submitted_at).toLocaleString()}</p>
                                        </div>
                                        {bid.status === "pending" && (
                                            <div className="flex gap-2 shrink-0">
                                                <button onClick={() => respond(bid.id, "accepted")} className="text-xs px-2.5 py-1 rounded bg-cyan-800/50 hover:bg-cyan-700/50 text-cyan-400 border border-cyan-800/60 cursor-pointer transition-colors">Accept</button>
                                                <button onClick={() => respond(bid.id, "rejected")} className="text-xs px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-zinc-700 cursor-pointer transition-colors">Decline</button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                </div>
            )}
        </div>
    );
}

type FeeSummaryAsset = { earned: number; paid: number; owed: number; threshold: number; blocked: boolean };
type FeeSummaryData = { xlm: FeeSummaryAsset; usdc: FeeSummaryAsset; blocked: boolean; treasury_address: string | null };

type FeePayStep = "idle" | "connecting" | "building" | "signing" | "submitting" | "done";

function FeePanel() {
    const [open, setOpen] = useState(false);
    const [fees, setFees] = useState<FeeSummaryData | null>(null);
    const [payAsset, setPayAsset] = useState<"XLM" | "USDC">("XLM");
    const [step, setStep] = useState<FeePayStep>("idle");

    async function load() {
        fetch("/api/fees").then(r => r.json()).then(setFees).catch(() => {});
    }

    useEffect(() => { load(); }, []);

    async function payWithFreighter() {
        try {
            setStep("connecting");
            const { isConnected, requestAccess } = await import("@stellar/freighter-api");
            const { isConnected: connected } = await isConnected();
            if (!connected) {
                toast.error("Freighter wallet not installed — get it at freighter.app", { duration: 7000 });
                setStep("idle"); return;
            }
            const { address: publicKey, error: accessError } = await requestAccess();
            if (accessError || !publicKey) throw new Error("Wallet connection rejected");

            setStep("building");
            const prepareRes = await fetch("/api/fees/prepare", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ buyer_address: publicKey, asset: payAsset }),
            });
            const prepareData = await prepareRes.json();
            if (!prepareRes.ok) throw new Error(prepareData.error ?? "Failed to build transaction");

            setStep("signing");
            const { signTransaction } = await import("@stellar/freighter-api");
            const signResult = await signTransaction(prepareData.xdr, { networkPassphrase: prepareData.network_passphrase });
            if ((signResult as any).error || !(signResult as any).signedTxXdr) throw new Error("Transaction signing cancelled");

            setStep("submitting");
            const submitRes = await fetch("/api/fees", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ signed_xdr: (signResult as any).signedTxXdr, asset: payAsset }),
            });
            const submitData = await submitRes.json();
            if (!submitRes.ok) throw new Error(submitData.error ?? "Fee payment failed");

            setStep("done");
            toast.success(`Platform fee paid: ${submitData.amount} ${submitData.asset}`);
            await load();
            setTimeout(() => setStep("idle"), 3000);
        } catch (e: any) {
            const msg: string = e?.message ?? "";
            if (msg.toLowerCase().includes("cancel") || msg.toLowerCase().includes("reject")) toast.error("Signature cancelled");
            else toast.error(msg || "Fee payment failed");
            setStep("idle");
        }
    }

    const hasAnyEarnings = fees && (fees.xlm.earned > 0 || fees.usdc.earned > 0);
    const hasOwed = fees && (fees.xlm.owed > 0 || fees.usdc.owed > 0);

    if (!hasAnyEarnings) return null;

    const stepLabels: Record<FeePayStep, string> = {
        idle: `Pay ${payAsset} fee with Freighter`,
        connecting: "Connecting wallet…",
        building: "Building transaction…",
        signing: "Sign in wallet…",
        submitting: "Submitting to Stellar…",
        done: "Fee paid!",
    };
    const busy = step !== "idle" && step !== "done";

    return (
        <div className={`mb-4 rounded-lg border ${fees?.blocked ? "border-red-900 bg-red-950/10" : "border-zinc-800"} bg-zinc-900`}>
            <button onClick={() => setOpen(v => !v)} className="flex items-center gap-2 w-full px-4 py-3 text-left cursor-pointer">
                <span className="text-zinc-500 text-xs transition-transform duration-150" style={{ display: "inline-block", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Platform Fees</span>
                {fees?.blocked && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-900/40 text-red-400 border border-red-800/60 font-medium">blocked — fee owed</span>
                )}
                {!fees?.blocked && hasOwed && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-500 border border-zinc-700 font-medium">0.5% of earnings</span>
                )}
            </button>

            {open && fees && (
                <div className="border-t border-zinc-800 px-4 py-4 space-y-4">
                    <p className="text-xs text-zinc-500 leading-relaxed">
                        Stellar Bazgit charges a <span className="text-zinc-300 font-medium">0.5% platform fee</span> on seller earnings.
                        Fees above the threshold must be paid before adding new listings.
                    </p>

                    <div className="rounded-md border border-zinc-800 overflow-hidden">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-zinc-800 bg-zinc-800/40">
                                    <th className="text-left px-3 py-2 text-zinc-500 font-medium">Asset</th>
                                    <th className="text-right px-3 py-2 text-zinc-500 font-medium">Earned</th>
                                    <th className="text-right px-3 py-2 text-zinc-500 font-medium">Fee (0.5%)</th>
                                    <th className="text-right px-3 py-2 text-zinc-500 font-medium">Paid</th>
                                    <th className="text-right px-3 py-2 text-zinc-500 font-medium">Owed</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(["xlm", "usdc"] as const).map(asset => {
                                    const f = fees[asset];
                                    if (f.earned === 0) return null;
                                    const decimals = asset === "xlm" ? 4 : 2;
                                    return (
                                        <tr key={asset} className="border-b border-zinc-800/50 last:border-0">
                                            <td className="px-3 py-2 text-zinc-300 font-medium">{asset.toUpperCase()}</td>
                                            <td className="px-3 py-2 text-right text-zinc-400">{f.earned.toFixed(decimals)}</td>
                                            <td className="px-3 py-2 text-right text-zinc-400">{(f.earned * 0.005).toFixed(decimals)}</td>
                                            <td className="px-3 py-2 text-right text-zinc-400">{f.paid.toFixed(decimals)}</td>
                                            <td className={`px-3 py-2 text-right font-semibold ${f.blocked ? "text-red-400" : f.owed > 0 ? "text-amber-400" : "text-zinc-500"}`}>
                                                {f.owed > 0 ? f.owed.toFixed(decimals) : "—"}
                                                {f.blocked && <span className="ml-1 text-[10px] font-normal">⚠ blocked</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {hasOwed && (
                        <div className="space-y-3">
                            {/* Asset selector — only show assets with owed balance */}
                            {fees.xlm.owed > 0 && fees.usdc.owed > 0 && (
                                <div className="flex rounded-lg bg-zinc-800 p-0.5 gap-0.5 w-fit">
                                    {(["XLM", "USDC"] as const).map(a => (
                                        <button key={a} type="button" onClick={() => setPayAsset(a)}
                                            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${payAsset === a ? "bg-zinc-600 text-white" : "text-zinc-400 hover:text-zinc-200"}`}>
                                            {a}
                                        </button>
                                    ))}
                                </div>
                            )}

                            <button onClick={payWithFreighter} disabled={busy}
                                className="w-full flex items-center justify-center gap-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-semibold text-sm px-4 py-2.5 transition-colors cursor-pointer disabled:cursor-not-allowed">
                                {busy && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />}
                                {step === "done" ? "✓ " : ""}{stepLabels[step]}
                            </button>
                            <p className="text-xs text-zinc-600 text-center">
                                Requires <a href="https://www.freighter.app" target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-cyan-400 underline transition-colors">Freighter</a> — one click, no copy-paste
                            </p>
                        </div>
                    )}

                    {!fees.treasury_address && (
                        <p className="text-xs text-red-400">STELLAR_TREASURY_ADDRESS not configured — contact the platform operator.</p>
                    )}
                </div>
            )}
        </div>
    );
}

type ApiKeyEntry = { key: string; label: string; createdAt: string };

function ApiKeysPanel() {
    const [open, setOpen] = useState(false);
    const [keys, setKeys] = useState<ApiKeyEntry[]>([]);
    const [label, setLabel] = useState("");
    const [creating, setCreating] = useState(false);
    const [newKey, setNewKey] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        fetch("/api/keys").then(r => r.json()).then(setKeys).catch(() => {});
    }, []);

    async function createKey() {
        setCreating(true);
        const res = await fetch("/api/keys", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ label: label || "Agent key" }),
        });
        const data = await res.json();
        setCreating(false);
        if (res.ok) { setNewKey(data.key); setKeys(prev => [...prev, { key: data.key, label: data.label, createdAt: data.createdAt }]); setLabel(""); }
        else toast.error(data.error ?? "Failed to create key");
    }

    async function revokeKey(key: string) {
        if (!confirm("Revoke this key?")) return;
        const res = await fetch("/api/keys", {
            method: "DELETE", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key }),
        });
        if (res.ok) { setKeys(prev => prev.filter(k => k.key !== key)); toast.success("Key revoked"); }
        else toast.error("Failed to revoke key");
    }

    function copyKey(k: string) {
        navigator.clipboard.writeText(k); setCopied(true); setTimeout(() => setCopied(false), 1500); toast.success("Key copied!");
    }

    const snippet = `POST /api/monetize\nAuthorization: Bearer ghp_yourGitHubToken\n\n{ "full_name": "you/repo", "rules": [{ "path": "*", "price": "10", "asset": "XLM" }],\n  "mode": "flat", "stellarAddress": "GYOUR_STELLAR_ADDRESS" }`;

    return (
        <div className="mb-8 rounded-lg border border-zinc-800 bg-zinc-900">
            <button onClick={() => setOpen(v => !v)} className="flex items-center gap-2 w-full px-4 py-3 text-left cursor-pointer">
                <span className="text-zinc-500 text-xs transition-transform duration-150" style={{ display: "inline-block", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">API Keys & Agent Listing</span>
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-900/20 text-indigo-400 border border-indigo-800/40 font-medium">sbz_ keys</span>
            </button>
            {open && (
                <div className="border-t border-zinc-800 px-4 py-4 space-y-4">
                    <div className="flex gap-3 p-3 rounded-md bg-zinc-800/50 border border-zinc-700/50">
                        <span className="text-lg shrink-0">⚡</span>
                        <p className="text-xs text-zinc-400 leading-relaxed">
                            Agents and CI can list repos directly with a GitHub token — no separate registration needed.
                            Pass <code className="text-cyan-400 bg-zinc-800 px-1 py-0.5 rounded">Authorization: Bearer ghp_yourToken</code> on any <code className="text-zinc-300 bg-zinc-800 px-1 py-0.5 rounded">/api/monetize</code> request.
                        </p>
                    </div>
                    <div className="rounded-md bg-zinc-950 border border-zinc-800 overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800">
                            <span className="text-xs text-zinc-600 font-mono">agent listing example (Stellar)</span>
                            <button onClick={() => { navigator.clipboard.writeText(snippet); toast.success("Copied!"); }}
                                className="text-xs text-zinc-600 hover:text-zinc-300 cursor-pointer transition-colors">Copy</button>
                        </div>
                        <pre className="px-3 py-2 text-[11px] text-zinc-400 font-mono leading-relaxed overflow-x-auto whitespace-pre">{snippet}</pre>
                    </div>

                    {newKey && (
                        <div className="rounded-md border border-cyan-800 bg-cyan-950/30 px-3 py-2">
                            <p className="text-xs text-cyan-400 mb-1 font-medium">Key created — copy it now, it won&apos;t be shown again.</p>
                            <div className="flex items-center gap-2">
                                <code className="text-xs text-cyan-300 flex-1 truncate font-mono">{newKey}</code>
                                <button onClick={() => copyKey(newKey)} className="text-xs text-zinc-400 hover:text-white bg-zinc-800 px-2 py-0.5 rounded cursor-pointer shrink-0">{copied ? "Copied!" : "Copy"}</button>
                                <button onClick={() => setNewKey(null)} className="text-zinc-600 hover:text-zinc-400 text-xs cursor-pointer">✕</button>
                            </div>
                        </div>
                    )}

                    {keys.length > 0 && (
                        <ul className="space-y-1">
                            {keys.map(k => (
                                <li key={k.key} className="flex items-center justify-between py-1.5 border-b border-zinc-800 last:border-0">
                                    <div>
                                        <span className="text-sm text-zinc-300">{k.label}</span>
                                        <span className="ml-2 font-mono text-xs text-zinc-600">{k.key.slice(0, 14)}…</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-zinc-600">{new Date(k.createdAt).toLocaleDateString()}</span>
                                        <button onClick={() => revokeKey(k.key)} className="text-xs text-zinc-600 hover:text-red-400 transition-colors cursor-pointer">Revoke</button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}

                    <div className="flex items-center gap-2">
                        <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Key label (e.g. my-agent)"
                            className="flex-1 text-xs bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
                            onKeyDown={e => e.key === "Enter" && createKey()} />
                        <button onClick={createKey} disabled={creating}
                            className="text-xs px-3 py-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 transition-colors cursor-pointer disabled:opacity-50 shrink-0">
                            {creating ? "Creating…" : "Generate key"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
