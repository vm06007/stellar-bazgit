import { NextRequest, NextResponse } from "next/server";
import { initStore, addPurchase } from "@/lib/store";
import {
    Horizon,
    TransactionBuilder,
    NETWORK_PASSPHRASE,
    HORIZON_URL,
    STELLAR_NETWORK,
} from "@/lib/stellar-server";
import { verifyStellarPayment } from "@/lib/stellar";

type IssuedToken = { full_name: string; expires: number };
declare const globalThis: { __issuedTokens?: Map<string, IssuedToken> } & typeof global;
function getTokenMap(): Map<string, IssuedToken> {
    if (!globalThis.__issuedTokens) globalThis.__issuedTokens = new Map();
    return globalThis.__issuedTokens;
}

export async function POST(req: NextRequest) {
    await initStore();
    const { full_name, signed_xdr } = await req.json();

    if (!full_name || !signed_xdr) {
        return NextResponse.json({ error: "Missing full_name or signed_xdr" }, { status: 400 });
    }

    try {
        const server = new Horizon.Server(HORIZON_URL);
        const tx = TransactionBuilder.fromXDR(signed_xdr, NETWORK_PASSPHRASE);
        const txHash = tx.hash().toString("hex");

        const result = await server.submitTransaction(tx);
        if (!result.hash) throw new Error("Transaction submission failed");

        // Verify the payment on Horizon
        const { getRepos } = await import("@/lib/store");
        const repos = getRepos();
        const entry = repos[full_name];
        const stellarAddress = entry?.stellarAddress ??
            entry?.paymentSplits?.sort((a: any, b: any) => b.share - a.share)[0]?.stellarAddress ?? "";
        const price = entry?.mode === "flat"
            ? entry.rules.find((r: any) => r.path === "*")?.price ?? entry.rules[0]?.price ?? "1"
            : entry?.rules[0]?.price ?? "1";
        const assetType = entry?.rules[0]?.asset ?? "XLM";

        // Skip memo check — we built the tx so address+amount+success is sufficient
        const verification = await verifyStellarPayment(txHash, stellarAddress, price, assetType);
        if (!verification.success) {
            return NextResponse.json({ error: verification.error }, { status: 402 });
        }

        await addPurchase({
            id: crypto.randomUUID(),
            full_name,
            path: null,
            payer: verification.from,
            transaction: txHash,
            network: STELLAR_NETWORK,
            amount: verification.amount,
            asset: verification.asset as "XLM" | "USDC",
            paid_at: new Date().toISOString(),
        });

        const token = crypto.randomUUID();
        getTokenMap().set(token, { full_name, expires: Date.now() + 3600000 });

        return NextResponse.json({ success: true, token, tx_hash: txHash, expires_in: 3600 });
    } catch (e: any) {
        const msg: string = e?.response?.data?.extras?.result_codes?.transaction
            ?? e?.response?.data?.title
            ?? e?.message
            ?? "Transaction submission failed";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
