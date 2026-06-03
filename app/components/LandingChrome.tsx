"use client";

import { useEffect, useRef, useState } from "react";
import { MermaidDiagram } from "@/app/components/MermaidDiagram";
import { DIAGRAMS } from "@/app/components/diagrams";

type ModalKey = "quickstart" | "how" | "agents" | "faq" | "about" | "slides" | null;

// ─── Modal content ────────────────────────────────────────────────────────────

type Lang = "skill" | "typescript" | "curl";
const LANG_LABELS: Record<Lang, string> = { skill: "Agent skills", typescript: "TypeScript", curl: "cURL" };

function quickStartCode(origin: string): Record<Lang, string> {
    return {
        skill: `npx skills add stellar-bazgit/stellar-bazgit --skill repo-marketplace`,

        typescript: `import { Keypair, Horizon, TransactionBuilder,
  Operation, Asset, BASE_FEE } from "@stellar/stellar-sdk";

const kp = Keypair.fromSecret(process.env.AGENT_SECRET!);
const server = new Horizon.Server("https://horizon-testnet.stellar.org");

// 1. Discover payment requirements (HTTP 402)
const r1 = await fetch("${origin}/api/x402/owner/repo");
const { accepts } = await r1.json();
const need = accepts[0]; // { payTo, amount, asset }

// 2. Build, sign & base64-encode the Stellar payment
const acct = await server.loadAccount(kp.publicKey());
const tx = new TransactionBuilder(acct, { fee: BASE_FEE,
  networkPassphrase: "Test SDF Network ; September 2015" })
  .addOperation(Operation.payment({ destination: need.payTo,
    asset: Asset.native(), amount: need.amount }))
  .setTimeout(120).build();
tx.sign(kp);
const xPayment = btoa(JSON.stringify({ transaction: tx.toXDR() }));

// 3. Retry with X-PAYMENT → 200 + clone URL
const r2 = await fetch("${origin}/api/x402/owner/repo", {
  headers: { "X-PAYMENT": xPayment },
});
const { clone_url } = await r2.json();`,

        curl: `# Discover payment requirements (returns 402)
curl -i ${origin}/api/x402/owner/repo

# List a repo as an agent (just a GitHub token)
curl -X POST ${origin}/api/monetize \\
  -H "Authorization: Bearer ghp_yourGitHubToken" \\
  -H "Content-Type: application/json" \\
  -d '{"full_name":"you/repo",
       "rules":[{"path":"*","price":"10","asset":"XLM"}],
       "mode":"flat",
       "stellarAddress":"GYOUR_STELLAR_ADDRESS"}'`,
    };
}

function SkillHighlight() {
    return (
        <span className="font-mono">
            <span className="text-[#C678DD]">npx</span>{" "}
            <span className="text-[#61AFEF]">skills</span>{" "}
            <span className="text-[#61AFEF]">add</span>{" "}
            <span className="text-[#E5C07B]">stellar-bazgit/stellar-bazgit</span>{" "}
            <span className="text-[#ABB2BF]">--skill</span>{" "}
            <span className="text-[#98C379]">repo-marketplace</span>
        </span>
    );
}

function CodeLines({ code }: { code: string }) {
    return (
        <>
            {code.split("\n").map((line, i) => {
                const t = line.trimStart();
                const isComment = t.startsWith("//") || t.startsWith("#");
                return (
                    <span key={i} className="block">
                        <span className={isComment ? "text-[#5C6370]" : "text-[#ABB2BF]"}>{line || " "}</span>
                    </span>
                );
            })}
        </>
    );
}

function QuickStart() {
    const [lang, setLang] = useState<Lang>("skill");
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const origin = typeof window !== "undefined" ? window.location.origin : "https://stellar-bazgit.vercel.app";
    const code = quickStartCode(origin);

    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    function copy() {
        navigator.clipboard.writeText(code[lang]);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    }

    return (
        <div className="flex flex-col gap-6">
            {/* Heading block */}
            <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-400 text-xs font-medium mb-4 border border-cyan-500/20">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" /><path d="M12 7v4" /><line x1="8" y1="16" x2="8" y2="16" /><line x1="16" y1="16" x2="16" y2="16" />
                    </svg>
                    Agent Skills
                </div>
                <p className="text-sm text-zinc-400 leading-relaxed mb-3">
                    Give your agent the Stellar Bazgit skill file. It covers discovery, buying with XLM or USDC, and listing repos with just a GitHub token. No extra credentials required.
                </p>
                <a href="/SKILL.md" target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-cyan-400 hover:text-cyan-300 transition-colors font-medium">
                    View full skill file →
                </a>
            </div>

            {/* Code card */}
            <div className="rounded-2xl border border-zinc-800 bg-[#111216] shadow-2xl ring-1 ring-white/5">
                <div className="relative z-20 flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-[#14151A] rounded-t-2xl">
                    <span className="text-white font-semibold text-sm">Quick Start</span>
                    <div className="flex items-center gap-3">
                        <div className="relative" ref={dropdownRef}>
                            <button onClick={() => setOpen(v => !v)}
                                className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer font-medium">
                                {LANG_LABELS[lang]}
                                <svg className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                            </button>
                            {open && (
                                <div className="absolute right-0 top-7 z-50 min-w-[150px] rounded-xl border border-zinc-800 bg-[#1A1B20] shadow-2xl shadow-black/60 overflow-hidden">
                                    {(["skill", "typescript", "curl"] as Lang[]).map(l => (
                                        <button key={l} onClick={() => { setLang(l); setOpen(false); }}
                                            className={`w-full flex items-center justify-between px-4 py-2.5 text-xs transition-colors cursor-pointer text-left ${l === lang ? "text-white bg-zinc-800" : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"}`}>
                                            {LANG_LABELS[l]}{l === lang && <span className="text-cyan-400">✓</span>}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <button onClick={copy} className="text-zinc-600 hover:text-white transition-colors cursor-pointer" title="Copy">
                            {copied ? (
                                <svg className="w-4 h-4 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                            ) : (
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                            )}
                        </button>
                    </div>
                </div>
                <div className="px-5 py-4 overflow-x-auto rounded-b-2xl">
                    <pre className="font-mono text-[12px] leading-relaxed min-h-[40px] whitespace-pre">
                        {lang === "skill" ? <SkillHighlight /> : <CodeLines code={code[lang]} />}
                    </pre>
                </div>
            </div>
        </div>
    );
}

const GITHUB_README = "https://github.com/vm06007/stellar-bazgit#readme";

function HowItWorks() {
    const [active, setActive] = useState(0);
    const [fullscreen, setFullscreen] = useState(false);
    const current = DIAGRAMS[active] ?? DIAGRAMS[0];

    useEffect(() => {
        function onKey(e: KeyboardEvent) { if (e.key === "Escape" && fullscreen) { e.stopPropagation(); setFullscreen(false); } }
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [fullscreen]);

    return (
        <div className="space-y-5">
            <div>
                <p className="text-sm text-zinc-400 leading-relaxed">
                    GitHub gives you visibility, not a price tag. Stellar Bazgit adds a third path next to public and private: <span className="text-zinc-200 font-medium">sell authenticated clone access, peer-to-peer.</span> Money moves on Stellar; access is bridged by the gateway; code stays on GitHub.
                </p>
                <a href={GITHUB_README} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-cyan-400 hover:text-cyan-300 transition-colors font-medium mt-3">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.73.083-.73 1.205.084 1.84 1.236 1.84 1.236 1.07 1.835 2.807 1.305 3.492.997.108-.776.418-1.305.762-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.467-2.38 1.235-3.22-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.3 1.23.957-.266 1.983-.4 3.003-.404 1.02.004 2.047.138 3.006.404 2.29-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.234 1.91 1.234 3.22 0 4.61-2.805 5.625-5.475 5.92.43.372.823 1.102.823 2.222 0 1.606-.015 2.898-.015 3.293 0 .322.216.694.825.576C20.565 21.795 24 17.297 24 12c0-6.63-5.373-12-12-12" /></svg>
                    Full README & diagrams on GitHub →
                </a>
            </div>

            {/* Diagram explorer: sidebar + canvas */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
                <div className="flex flex-col sm:flex-row">
                    <div className="sm:w-44 shrink-0 border-b sm:border-b-0 sm:border-r border-zinc-800 p-2 flex sm:flex-col gap-1 overflow-x-auto sm:max-h-[420px] sm:overflow-y-auto">
                        {DIAGRAMS.map((d, idx) => (
                            <button key={d.label} onClick={() => setActive(idx)}
                                className={`text-left text-xs px-3 py-2 rounded-md whitespace-nowrap transition-colors cursor-pointer shrink-0 ${active === idx ? "bg-cyan-600/20 text-cyan-300 border border-cyan-800/50" : "text-zinc-400 hover:text-white hover:bg-zinc-800/60 border border-transparent"}`}>
                                {d.label}
                            </button>
                        ))}
                    </div>
                    <div className="flex-1 min-w-0 p-4 bg-zinc-950/40">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">{current.label}</p>
                            <button onClick={() => setFullscreen(true)}
                                className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-cyan-400 transition-colors cursor-pointer" title="Open fullscreen">
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" />
                                </svg>
                                Fullscreen
                            </button>
                        </div>
                        <div className="overflow-x-auto"><MermaidDiagram chart={current.chart} /></div>
                    </div>
                </div>
            </div>

            {/* Fullscreen overlay */}
            {fullscreen && (
                <div className="fixed inset-0 z-[60] bg-zinc-950/98 backdrop-blur-sm flex flex-col" onClick={() => setFullscreen(false)}>
                    <div className="flex items-center justify-between px-6 h-14 border-b border-zinc-800 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2 overflow-x-auto">
                            {DIAGRAMS.map((d, idx) => (
                                <button key={d.label} onClick={() => setActive(idx)}
                                    className={`text-xs px-3 py-1.5 rounded-md whitespace-nowrap transition-colors cursor-pointer shrink-0 ${active === idx ? "bg-cyan-600/20 text-cyan-300 border border-cyan-800/50" : "text-zinc-400 hover:text-white hover:bg-zinc-800/60 border border-transparent"}`}>
                                    {d.label}
                                </button>
                            ))}
                        </div>
                        <button onClick={() => setFullscreen(false)} className="text-zinc-400 hover:text-white text-xl leading-none cursor-pointer shrink-0 ml-4">✕</button>
                    </div>
                    <div className="flex-1 min-h-0 p-8" onClick={(e) => e.stopPropagation()}>
                        <MermaidDiagram key={`fs-${active}`} chart={current.chart} fit />
                    </div>
                </div>
            )}
        </div>
    );
}

function ForAgents() {
    const items = [
        { title: "Public catalog API", body: "GET /api/catalog returns every listing — prices, assets, Stellar payout addresses — with no auth. Agents discover what's for sale and how to pay." },
        { title: "x402 gateway", body: "GET /api/x402/{owner}/{repo} returns a spec-compliant 402 with accepts requirements. Retry with the base64 X-PAYMENT header to settle and receive the clone URL." },
        { title: "Native gateway", body: "GET /api/access/{owner}/{repo} returns Stellar payment details; POST the tx hash to /api/pay for a 1-hour clone token. Works for XLM and USDC." },
        { title: "MCP server", body: "Connect Stellar Bazgit to Claude Desktop: browse_catalog, get_repo, monetize_repo, delist_repo and more — manage the marketplace from chat." },
        { title: "Autonomous wallet", body: "The TEE Agent owns a server-side Stellar keypair. Fund it and it can buy repos and leave verified reviews on command — a real agent-to-agent buyer." },
    ];
    return (
        <div className="space-y-3">
            <p className="text-sm text-zinc-400 leading-relaxed">
                Stellar Bazgit is built for machine-to-machine commerce. Agents can discover, pay for, and clone repos with no browser and no human checkout.
            </p>
            {items.map((i) => (
                <div key={i.title} className="rounded-lg bg-zinc-900 border border-zinc-800 p-4">
                    <h3 className="text-sm font-semibold text-white mb-1">{i.title}</h3>
                    <p className="text-sm text-zinc-400 leading-relaxed">{i.body}</p>
                </div>
            ))}
        </div>
    );
}

function Faq() {
    const qas = [
        { q: "Do buyers need a GitHub account?", a: "No. Buying only needs a Stellar wallet (Freighter). GitHub is only required to sell — so the gateway can mint clone URLs against your repo." },
        { q: "Where does my money go?", a: "Directly to your Stellar address. Stellar Bazgit never holds funds. We only verify the on-chain payment and return the clone credential." },
        { q: "What's the platform fee?", a: "0.5% of seller earnings, tracked per asset. It's deferred — you only settle it (one click, Freighter) before adding new listings once it crosses a small threshold." },
        { q: "How do reviews work?", a: "Only verified buyers can review. The server checks your Stellar address against on-chain purchases before accepting a rating. A merchant's rating aggregates across all their repos." },
        { q: "XLM or USDC?", a: "Both. Sellers price in either; buyers pay in the listed asset. USDC on Stellar is Circle-issued (different from EVM USDC)." },
        { q: "How long does a clone link last?", a: "The authenticated clone URL is valid for about one hour after payment. Clone once and you have the full repo with history." },
    ];
    return (
        <div className="space-y-3">
            {qas.map((x) => (
                <div key={x.q} className="rounded-lg bg-zinc-900 border border-zinc-800 p-4">
                    <h3 className="text-sm font-semibold text-white mb-1">{x.q}</h3>
                    <p className="text-sm text-zinc-400 leading-relaxed">{x.a}</p>
                </div>
            ))}
        </div>
    );
}

const SLIDES = ["/slides/slide1.jpg", "/slides/slide2.jpg", "/slides/slide3.jpg", "/slides/slide4.jpg", "/slides/slide5.jpg"];

function Slides() {
    const [i, setI] = useState(0);
    const prev = () => setI((n) => (n - 1 + SLIDES.length) % SLIDES.length);
    const next = () => setI((n) => (n + 1) % SLIDES.length);

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === "ArrowLeft") prev();
            if (e.key === "ArrowRight") next();
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    return (
        <div className="space-y-4">
            <div className="relative rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={SLIDES[i]} alt={`Slide ${i + 1}`} className="w-full h-auto object-contain" />
                <button onClick={prev} aria-label="Previous"
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center cursor-pointer transition-colors">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                </button>
                <button onClick={next} aria-label="Next"
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center cursor-pointer transition-colors">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                </button>
                <div className="absolute top-2 right-3 text-xs text-zinc-300 bg-black/60 rounded-full px-2 py-0.5">{i + 1} / {SLIDES.length}</div>
            </div>
            <div className="flex items-center justify-center gap-2">
                {SLIDES.map((_, n) => (
                    <button key={n} onClick={() => setI(n)} aria-label={`Go to slide ${n + 1}`}
                        className={`h-2 rounded-full transition-all cursor-pointer ${n === i ? "w-6 bg-cyan-400" : "w-2 bg-zinc-600 hover:bg-zinc-500"}`} />
                ))}
            </div>
            <p className="text-xs text-zinc-600 text-center">← → to navigate · <a href="/stellar_bazgit_pitchdeck.pdf" target="_blank" rel="noopener noreferrer" className="text-cyan-500 hover:text-cyan-300 underline">Open full pitch deck (PDF) ↗</a></p>
        </div>
    );
}

function About() {
    return (
        <div className="space-y-4 text-sm text-zinc-400 leading-relaxed">
            <p><span className="text-zinc-200 font-medium">Stellar Bazgit</span> — <span className="text-zinc-300">Baz</span> (bazaar / basket) + <span className="text-zinc-300">git</span> — is a marketplace for private GitHub repositories, settled on the Stellar network.</p>
            <p>GitHub repos are either public (free) or private (locked). There's no native way to charge for clone access. Stellar Bazgit is the bridge: sellers list a private repo at a price, buyers pay in XLM or USDC, and the gateway hands back an authenticated git clone URL.</p>
            <p>Payments are peer-to-peer on Stellar with 2–5 second settlement and sub-cent fees — cheap enough for micropayments and fast enough for autonomous agents. The marketplace is staffed by the <span className="text-zinc-300">🫖 TEE Agent</span>, which can shop, buy, and review on your behalf.</p>
            <div className="flex flex-wrap gap-2 pt-1">
                <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300">Stellar testnet</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300">XLM · USDC</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300">x402 compatible</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300">MCP ready</span>
            </div>
        </div>
    );
}

const MODALS: Record<Exclude<ModalKey, null>, { title: string; subtitle: string; body: React.ReactNode; wide?: boolean }> = {
    quickstart: { title: "Quick Start", subtitle: "Give your agent the skill file", body: <QuickStart /> },
    how: { title: "How it works", subtitle: "P2P payments, oracle access, code on GitHub", body: <HowItWorks />, wide: true },
    agents: { title: "For Agents", subtitle: "Machine-to-machine commerce on Stellar", body: <ForAgents /> },
    faq: { title: "FAQ", subtitle: "Common questions", body: <Faq /> },
    about: { title: "About Stellar Bazgit", subtitle: "A bazaar for git repositories", body: <About /> },
    slides: { title: "Slides", subtitle: "Pitch deck walkthrough", body: <Slides />, wide: true },
};

const NAV: { key: Exclude<ModalKey, null>; label: string }[] = [
    { key: "quickstart", label: "Quick Start" },
    { key: "how", label: "How it works" },
    { key: "agents", label: "For Agents" },
    { key: "slides", label: "Slides" },
    { key: "faq", label: "FAQ" },
];

// ─── Chrome ─────────────────────────────────────────────────────────────────

export function LandingChrome({ children }: { children: React.ReactNode }) {
    const [modal, setModal] = useState<ModalKey>(null);

    useEffect(() => {
        function onKey(e: KeyboardEvent) { if (e.key === "Escape") setModal(null); }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    return (
        <div className="min-h-screen flex flex-col bg-zinc-950">
            {/* Header — centered nav links only */}
            <header className="flex items-center justify-center px-6 h-16 border-b border-zinc-900">
                <nav className="flex items-center gap-1">
                    {[...NAV, { key: "about" as const, label: "About" }].map((n) => (
                        <button key={n.key} onClick={() => setModal(n.key)}
                            className="text-sm text-zinc-400 hover:text-white px-3 py-1.5 rounded-md hover:bg-zinc-900 transition-colors cursor-pointer">
                            {n.label}
                        </button>
                    ))}
                </nav>
            </header>

            {/* Hero / page content */}
            <main className="flex-1 flex items-center justify-center px-4 py-10">{children}</main>

            {/* Modal */}
            {modal && (
                <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setModal(null)} />
                    <div className={`relative z-10 w-full ${MODALS[modal].wide ? "max-w-4xl" : "max-w-2xl"} my-8 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl`}>
                        <div className="flex items-start justify-between px-6 py-4 border-b border-zinc-800 sticky top-0 bg-zinc-950 rounded-t-2xl">
                            <div>
                                <h2 className="text-lg font-bold text-white">{MODALS[modal].title}</h2>
                                <p className="text-xs text-zinc-500 mt-0.5">{MODALS[modal].subtitle}</p>
                            </div>
                            <button onClick={() => setModal(null)} className="text-zinc-500 hover:text-zinc-200 text-xl leading-none cursor-pointer">✕</button>
                        </div>
                        <div className="px-6 py-5">{MODALS[modal].body}</div>
                    </div>
                </div>
            )}
        </div>
    );
}
