import { NextRequest, NextResponse } from "next/server";
import { getRepos, addPurchase, initStore } from "@/lib/store";
import { verifyStellarPayment, STELLAR_NETWORK } from "@/lib/stellar";

type IssuedToken = { full_name: string; expires: number };
declare const globalThis: { __issuedTokens?: Map<string, IssuedToken> } & typeof global;

function getTokenMap(): Map<string, IssuedToken> {
    if (!globalThis.__issuedTokens) globalThis.__issuedTokens = new Map();
    return globalThis.__issuedTokens;
}

export async function POST(req: NextRequest) {
    await initStore();
    const { full_name, tx_hash } = await req.json();

    if (!full_name || !tx_hash) {
        return NextResponse.json({ error: "Missing full_name or tx_hash" }, { status: 400 });
    }

    const repos = getRepos();
    const entry = repos[full_name];
    if (!entry) return NextResponse.json({ error: "Repo not found in catalog" }, { status: 404 });

    const stellarAddress = entry.stellarAddress ??
        entry.paymentSplits?.sort((a, b) => b.share - a.share)[0]?.stellarAddress ?? "";
    const price = entry.mode === "flat"
        ? entry.rules.find((r) => r.path === "*")?.price ?? entry.rules[0]?.price ?? "1.00"
        : entry.rules[0]?.price ?? "1.00";
    const asset = entry.rules[0]?.asset ?? "XLM";
    const memo = full_name.slice(0, 28);

    const result = await verifyStellarPayment(tx_hash, stellarAddress, price, asset, memo);
    if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 402 });
    }

    await addPurchase({
        id: crypto.randomUUID(),
        full_name,
        path: null,
        payer: result.from,
        transaction: tx_hash,
        network: STELLAR_NETWORK,
        amount: result.amount,
        asset: result.asset as "XLM" | "USDC",
        paid_at: new Date().toISOString(),
    });

    const token = crypto.randomUUID();
    const tokenMap = getTokenMap();
    tokenMap.set(token, { full_name, expires: Date.now() + 3600000 });

    return NextResponse.json({ success: true, token, expires_in: 3600 });
}
