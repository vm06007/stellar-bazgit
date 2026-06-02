/**
 * x402-compliant payment gateway (parallel path to /api/access).
 *
 *   GET /api/x402/{owner}/{repo}
 *     · no  X-PAYMENT header → 402 Payment Required + spec `accepts` body
 *     · with X-PAYMENT header → submit & verify on Horizon → 200 + clone URL
 *
 * Wire format follows the official x402 spec (HTTP 402, `accepts`
 * PaymentRequirements, base64 `X-PAYMENT` / `X-PAYMENT-RESPONSE` headers).
 * Settlement is verified directly on Stellar Horizon — no external facilitator.
 */
import { NextRequest, NextResponse } from "next/server";
import { getRepos, getRepoToken, addPurchase, initStore } from "@/lib/store";
import { verifyStellarPayment, STELLAR_NETWORK } from "@/lib/stellar";
import { Horizon, TransactionBuilder, NETWORK_PASSPHRASE, HORIZON_URL } from "@/lib/stellar-server";
import {
    buildPaymentRequired,
    resolveListing,
    decodePaymentHeader,
    encodeSettlementResponse,
} from "@/lib/x402";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    await initStore();
    const { path } = await params;
    if (path.length < 2) {
        return NextResponse.json({ error: "Invalid path — expected /owner/repo" }, { status: 400 });
    }

    const full_name = `${path[0]}/${path[1]}`;
    const entry = getRepos()[full_name];
    if (!entry) {
        return NextResponse.json({ error: "Repo not found in catalog" }, { status: 404 });
    }

    const listing = resolveListing(entry);
    if (!listing) {
        return NextResponse.json({ error: "Listing has no payout address" }, { status: 400 });
    }

    const resourceUrl = `${req.nextUrl.origin}/api/x402/${full_name}`;
    const paymentHeader = req.headers.get("x-payment");

    // ── Discovery: no payment yet → 402 with spec-compliant requirements ──────
    if (!paymentHeader) {
        const body = buildPaymentRequired(full_name, listing, resourceUrl);
        return NextResponse.json(body, { status: 402 });
    }

    // ── Settlement: verify the X-PAYMENT and release the resource ─────────────
    const decoded = decodePaymentHeader(paymentHeader);
    if (!decoded) {
        return NextResponse.json({ error: "Malformed X-PAYMENT header" }, { status: 400 });
    }

    let txHash: string;
    try {
        const tx = TransactionBuilder.fromXDR(decoded.transaction, NETWORK_PASSPHRASE);
        txHash = tx.hash().toString("hex");
        const server = new Horizon.Server(HORIZON_URL);
        try {
            await server.submitTransaction(tx as any);
        } catch (e: any) {
            // If the client already submitted it, that's fine — we verify by hash below.
            const codes = e?.response?.data?.extras?.result_codes;
            const dup = codes?.transaction === "tx_bad_seq" || e?.response?.status === 400;
            if (!dup) {
                return NextResponse.json(
                    { error: codes?.operations?.[0] ?? codes?.transaction ?? e?.message ?? "Submission failed" },
                    { status: 402 }
                );
            }
        }
    } catch {
        return NextResponse.json({ error: "Invalid transaction XDR in payment" }, { status: 400 });
    }

    const result = await verifyStellarPayment(txHash, listing.payTo, listing.amount, listing.asset);
    if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 402 });
    }

    await addPurchase({
        id: crypto.randomUUID(),
        full_name,
        path: null,
        payer: result.from,
        transaction: txHash,
        network: STELLAR_NETWORK,
        amount: result.amount,
        asset: result.asset as "XLM" | "USDC",
        paid_at: new Date().toISOString(),
    });

    const githubToken = getRepoToken(full_name);
    if (!githubToken) {
        return NextResponse.json({ error: "Seller credentials unavailable" }, { status: 500 });
    }

    const settlement = encodeSettlementResponse({
        success: true,
        transaction: txHash,
        network: STELLAR_NETWORK,
        payer: result.from,
    });

    return NextResponse.json(
        {
            full_name,
            clone_url: `https://${githubToken}@github.com/${full_name}.git`,
            tarball_url: `https://api.github.com/repos/${full_name}/tarball`,
            transaction: txHash,
        },
        { status: 200, headers: { "X-PAYMENT-RESPONSE": settlement } }
    );
}
