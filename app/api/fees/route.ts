import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getFeeSummary, addFeePayment, initStore } from "@/lib/store";
import { verifyStellarPayment, STELLAR_NETWORK } from "@/lib/stellar";
import { Horizon, TransactionBuilder, NETWORK_PASSPHRASE, HORIZON_URL } from "@/lib/stellar-server";

export async function GET(req: NextRequest) {
    await initStore();
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const summary = getFeeSummary(session.user.email);
    const treasury = process.env.STELLAR_TREASURY_ADDRESS ?? null;

    return NextResponse.json({ ...summary, treasury_address: treasury });
}

export async function POST(req: NextRequest) {
    await initStore();
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { asset } = body;
    if (!asset || (asset !== "XLM" && asset !== "USDC")) {
        return NextResponse.json({ error: "Missing or invalid asset" }, { status: 400 });
    }

    const treasury = process.env.STELLAR_TREASURY_ADDRESS;
    if (!treasury) return NextResponse.json({ error: "STELLAR_TREASURY_ADDRESS not configured" }, { status: 503 });

    const summary = getFeeSummary(session.user.email);
    const owed = asset === "XLM" ? summary.xlm.owed : summary.usdc.owed;
    if (owed <= 0) return NextResponse.json({ error: "No fees owed in this asset" }, { status: 400 });

    let txHash: string;

    if (body.signed_xdr) {
        // Freighter flow — submit the signed tx ourselves
        try {
            const server = new Horizon.Server(HORIZON_URL);
            const tx = TransactionBuilder.fromXDR(body.signed_xdr, NETWORK_PASSPHRASE);
            txHash = tx.hash().toString("hex");
            await server.submitTransaction(tx);
        } catch (e: any) {
            const codes = e?.response?.data?.extras?.result_codes;
            return NextResponse.json(
                { error: codes?.operations?.[0] ?? codes?.transaction ?? e?.message ?? "Transaction submission failed" },
                { status: 500 }
            );
        }
    } else if (body.tx_hash) {
        // Manual flow — verify an already-submitted tx
        txHash = body.tx_hash;
    } else {
        return NextResponse.json({ error: "Provide signed_xdr or tx_hash" }, { status: 400 });
    }

    const result = await verifyStellarPayment(txHash, treasury, owed.toFixed(asset === "XLM" ? 7 : 2), asset);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 402 });

    addFeePayment({
        id: crypto.randomUUID(),
        owner: session.user.email,
        amount: result.amount,
        asset: result.asset as "XLM" | "USDC",
        transaction: txHash,
        network: STELLAR_NETWORK,
        paid_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, amount: result.amount, asset: result.asset });
}
