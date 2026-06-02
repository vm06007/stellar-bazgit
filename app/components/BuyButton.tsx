"use client";

import { useState } from "react";
import { toast } from "sonner";

type State =
    | { status: "idle" }
    | { status: "connecting" }
    | { status: "building" }
    | { status: "signing" }
    | { status: "submitting" }
    | { status: "verifying" }
    | { status: "done"; cloneUrl: string; tarballUrl: string; txHash: string };

type Props = {
    fullName: string;
    onSuccess?: () => void;
};

export default function BuyButton({ fullName, onSuccess }: Props) {
    const [state, setState] = useState<State>({ status: "idle" });

    async function handleBuy() {
        try {
            // 1. Check Freighter is installed
            setState({ status: "connecting" });
            const { isConnected, requestAccess } = await import("@stellar/freighter-api");

            const { isConnected: connected } = await isConnected();
            if (!connected) {
                toast.error("Freighter wallet not installed — get it at freighter.app", { duration: 7000 });
                setState({ status: "idle" });
                return;
            }

            // Request access — opens Freighter connect popup if not already approved
            const { address: publicKey, error: accessError } = await requestAccess();
            if (accessError || !publicKey) {
                throw new Error("Wallet connection rejected");
            }

            // 2. Build unsigned transaction on server (avoids bundling Stellar SDK in browser)
            setState({ status: "building" });
            const prepareRes = await fetch("/api/stellar/prepare", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ full_name: fullName, buyer_address: publicKey }),
            });
            const prepareData = await prepareRes.json();
            if (!prepareRes.ok) throw new Error(prepareData.error ?? "Failed to build transaction");

            const { xdr, network_passphrase } = prepareData;

            // 3. Sign with Freighter (shows Freighter popup with tx details)
            setState({ status: "signing" });
            const { signTransaction } = await import("@stellar/freighter-api");
            const signResult = await signTransaction(xdr, { networkPassphrase: network_passphrase });

            if ((signResult as any).error || !(signResult as any).signedTxXdr) {
                throw new Error("Transaction signing cancelled");
            }
            const signedXdr: string = (signResult as any).signedTxXdr;

            // 4. Submit signed XDR to server → Horizon → verify → issue token
            setState({ status: "submitting" });
            const submitRes = await fetch("/api/stellar/submit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ full_name: fullName, signed_xdr: signedXdr }),
            });
            const submitData = await submitRes.json();
            if (!submitRes.ok) throw new Error(submitData.error ?? "Transaction submission failed");

            // 5. Fetch clone URL
            setState({ status: "verifying" });
            const accessRes = await fetch(`/api/access/${fullName}?token=${submitData.token}`);
            const accessData = await accessRes.json();
            if (!accessRes.ok) throw new Error("Failed to retrieve clone URL");

            setState({
                status: "done",
                cloneUrl: accessData.clone_url,
                tarballUrl: accessData.tarball_url ?? "",
                txHash: submitData.tx_hash,
            });
            toast.success("Payment confirmed! Clone URL ready.");
            onSuccess?.();
        } catch (e: any) {
            const msg: string = e?.message ?? "";
            if (msg.toLowerCase().includes("cancel") || msg.toLowerCase().includes("reject") || msg.toLowerCase().includes("denied")) {
                toast.error("Wallet signature cancelled");
            } else {
                toast.error(msg || "Payment failed");
            }
            setState({ status: "idle" });
        }
    }

    function reset() {
        setState({ status: "idle" });
    }

    if (state.status === "done") {
        const repoName = fullName.split("/")[1] ?? fullName;
        const cloneCmd = `GIT_TERMINAL_PROMPT=0 git clone "${state.cloneUrl}"`;
        const network = process.env.NEXT_PUBLIC_STELLAR_NETWORK === "mainnet" ? "public" : "testnet";
        const explorerUrl = `https://stellar.expert/explorer/${network}/tx/${state.txHash}`;

        return (
            <div className="rounded-lg border border-cyan-800 bg-cyan-950/30 p-4 space-y-3">
                <div className="flex items-center gap-2">
                    <span className="text-cyan-400 text-sm font-semibold">✓ Payment confirmed</span>
                    <a href={explorerUrl} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                        {state.txHash.slice(0, 8)}…{state.txHash.slice(-6)} ↗
                    </a>
                </div>
                <p className="text-xs text-zinc-400">Run this in your terminal to clone:</p>
                <div className="flex items-start gap-2 bg-zinc-950 rounded-md px-3 py-2 border border-zinc-700">
                    <code className="text-xs text-cyan-400 flex-1 break-all">{cloneCmd}</code>
                    <button
                        onClick={() => { navigator.clipboard.writeText(cloneCmd); toast.success("Copied!"); }}
                        className="text-xs text-zinc-400 hover:text-white bg-zinc-700 hover:bg-zinc-600 px-2 py-1 rounded transition-colors shrink-0 cursor-pointer mt-0.5">
                        Copy
                    </button>
                </div>
                {state.tarballUrl && (
                    <a href={state.tarballUrl} download={`${repoName}.tar.gz`}
                        className="flex items-center justify-center gap-2 w-full rounded-md border border-cyan-700 text-cyan-400 hover:text-cyan-300 hover:border-cyan-500 text-xs font-medium px-3 py-2 transition-colors">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                        Download as .tar.gz
                    </a>
                )}
                <p className="text-xs text-zinc-600">Expires in ~1 hour.</p>
                <button onClick={reset} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors cursor-pointer">
                    ← Buy again
                </button>
            </div>
        );
    }

    const labels: Record<string, string> = {
        idle:       "Pay with Freighter →",
        connecting: "Connecting wallet…",
        building:   "Building transaction…",
        signing:    "Sign in wallet…",
        submitting: "Submitting to Stellar…",
        verifying:  "Fetching clone URL…",
    };
    const busy = state.status !== "idle";

    return (
        <div className="space-y-2">
            <button
                onClick={handleBuy}
                disabled={busy}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-semibold text-sm px-4 py-3 transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
                {busy && (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
                )}
                {labels[state.status]}
            </button>
            {!busy && (
                <p className="text-xs text-zinc-600 text-center">
                    Requires{" "}
                    <a href="https://www.freighter.app" target="_blank" rel="noopener noreferrer"
                        className="text-zinc-500 hover:text-cyan-400 underline transition-colors">
                        Freighter
                    </a>{" "}
                    — Stellar&apos;s browser wallet
                </p>
            )}
        </div>
    );
}
