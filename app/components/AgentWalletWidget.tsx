"use client";

import { useEffect, useState } from "react";

type WalletInfo =
    | { exists: false }
    | { exists: true; publicKey: string; network: string; xlm: string; usdc: string };

export function AgentWalletWidget() {
    const [wallet, setWallet] = useState<WalletInfo | null>(null);
    const [generating, setGenerating] = useState(false);
    const [dissolving, setDissolving] = useState(false);
    const [copied, setCopied] = useState(false);

    async function load() {
        const res = await fetch("/api/agent/wallet");
        const data = await res.json();
        setWallet(data);
    }

    useEffect(() => { load(); }, []);

    async function generate() {
        setGenerating(true);
        await fetch("/api/agent/wallet", { method: "POST" });
        await load();
        setGenerating(false);
    }

    async function dissolve() {
        if (!confirm("Dissolve this agent wallet? Any remaining funds will be inaccessible unless you saved the secret key.")) return;
        setDissolving(true);
        await fetch("/api/agent/wallet", { method: "DELETE" });
        await load();
        setDissolving(false);
    }

    function copy(text: string) {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    }

    if (!wallet) return null;

    if (!wallet.exists) {
        return (
            <div className="mx-4 mt-3 mb-1 rounded-lg border border-zinc-700/50 bg-zinc-900 px-3 py-2.5 flex items-center justify-between gap-3">
                <div>
                    <p className="text-xs font-medium text-zinc-400">Agent Wallet</p>
                    <p className="text-[11px] text-zinc-600 mt-0.5">No wallet — agent can&apos;t purchase repos yet</p>
                </div>
                <button onClick={generate} disabled={generating}
                    className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium transition-colors cursor-pointer disabled:cursor-not-allowed">
                    {generating ? "Generating…" : "Generate"}
                </button>
            </div>
        );
    }

    const short = `${wallet.publicKey.slice(0, 6)}…${wallet.publicKey.slice(-4)}`;
    const xlmNum = parseFloat(wallet.xlm);
    const usdcNum = parseFloat(wallet.usdc);
    const funded = xlmNum > 0 || usdcNum > 0;
    const explorerBase = wallet.network === "mainnet"
        ? "https://stellar.expert/explorer/public/account"
        : "https://stellar.expert/explorer/testnet/account";

    return (
        <div className="mx-4 mt-3 mb-1 rounded-lg border border-zinc-700/50 bg-zinc-900 px-3 py-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-zinc-400">Agent Wallet</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border ${
                        funded
                            ? "bg-cyan-950/50 text-cyan-400 border-cyan-800/60"
                            : "bg-amber-950/50 text-amber-400 border-amber-800/60"
                    }`}>
                        {funded ? "funded" : "unfunded"}
                    </span>
                </div>
                <button onClick={load} className="text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer text-base px-1" title="Refresh">
                    ↻
                </button>
            </div>

            <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-zinc-500">{short}</span>
                <button onClick={() => copy(wallet.publicKey)}
                    className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer font-medium">
                    {copied ? "Copied!" : "Copy address"}
                </button>
            </div>

            <div className="flex items-center gap-3 pt-0.5">
                <span className="text-xs text-zinc-500">
                    <span className="text-zinc-300 font-medium">{parseFloat(wallet.xlm).toFixed(4)}</span>{" "}XLM
                </span>
                <span className="text-xs text-zinc-500">
                    <span className="text-zinc-400">{parseFloat(wallet.usdc).toFixed(2)}</span>{" "}USDC
                </span>
                <span className="text-[10px] text-zinc-700 ml-auto">{wallet.network}</span>
            </div>

            {!funded && (
                <p className="text-[11px] text-amber-500/80 pt-0.5">
                    Send XLM or USDC to this Stellar address to enable agent purchases.
                </p>
            )}

            <div className="pt-1 border-t border-zinc-800/60 flex items-center justify-between">
                <button onClick={dissolve} disabled={dissolving}
                    className="text-[11px] text-zinc-600 hover:text-red-400 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50">
                    {dissolving ? "Dissolving…" : "Dissolve agent"}
                </button>
                <a href={`${explorerBase}/${wallet.publicKey}`} target="_blank" rel="noopener noreferrer"
                    className="text-[11px] text-zinc-600 hover:text-cyan-400 transition-colors">
                    Stellar Expert ↗
                </a>
            </div>
        </div>
    );
}
