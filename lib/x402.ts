/**
 * x402 protocol helpers — Stellar Bazgit's standards-compliant payment path.
 *
 * This implements the official x402 *wire format* (HTTP 402 + `accepts`
 * PaymentRequirements + base64 `X-PAYMENT` header carrying a PaymentPayload),
 * using the canonical `@x402/core` types and base64 helpers.
 *
 * Settlement is verified on Stellar Horizon directly (no external facilitator),
 * so it works on testnet out of the box and falls back to the native flow.
 */
import type { PaymentRequired, PaymentRequirements, PaymentPayload } from "@x402/core/types";
import { safeBase64Encode, safeBase64Decode } from "@x402/core/utils";
import { STELLAR_NETWORK, USDC_ISSUER } from "./stellar";
import type { MonetizedRepo } from "./store";

export const X402_VERSION = 1;

/** CAIP-2 network identifier per the x402 Stellar spec. */
export const X402_NETWORK = STELLAR_NETWORK === "mainnet" ? "stellar:pubnet" : "stellar:testnet";

export type ResolvedListing = {
    payTo: string;
    amount: string;
    asset: "XLM" | "USDC";
};

/** Resolve a listing's flat price + payout address into x402 terms. */
export function resolveListing(entry: MonetizedRepo): ResolvedListing | null {
    const payTo =
        entry.stellarAddress ??
        entry.paymentSplits?.slice().sort((a, b) => b.share - a.share)[0]?.stellarAddress ??
        "";
    if (!payTo) return null;
    const rule = entry.rules.find((r) => r.path === "*") ?? entry.rules[0];
    if (!rule) return null;
    return { payTo, amount: rule.price, asset: rule.asset ?? "XLM" };
}

/** The `asset` string used in PaymentRequirements (classic-asset notation). */
export function assetId(asset: "XLM" | "USDC"): string {
    return asset === "XLM" ? "native" : `USDC:${USDC_ISSUER}`;
}

/** Build a spec-compliant 402 PaymentRequired body for a listing. */
export function buildPaymentRequired(
    fullName: string,
    listing: ResolvedListing,
    resourceUrl: string
): PaymentRequired {
    const requirements: PaymentRequirements = {
        scheme: "exact",
        network: X402_NETWORK as PaymentRequirements["network"],
        asset: assetId(listing.asset),
        amount: listing.amount,
        payTo: listing.payTo,
        maxTimeoutSeconds: 300,
        extra: {
            assetCode: listing.asset,
            issuer: listing.asset === "USDC" ? USDC_ISSUER : null,
            memo: fullName.slice(0, 28),
            memoType: "text",
            horizon: STELLAR_NETWORK === "mainnet"
                ? "https://horizon.stellar.org"
                : "https://horizon-testnet.stellar.org",
            settlement: "horizon-classic",
        },
    };

    return {
        x402Version: X402_VERSION,
        error: "Payment required to access this repository.",
        resource: { url: resourceUrl } as PaymentRequired["resource"],
        accepts: [requirements],
    };
}

/**
 * Decode the base64 `X-PAYMENT` header into a PaymentPayload and pull out the
 * signed Stellar transaction XDR. Tolerant of both flat `{ transaction }` and
 * nested `{ payload: { transaction } }` shapes.
 */
export function decodePaymentHeader(header: string): { payload: PaymentPayload; transaction: string } | null {
    try {
        const json = safeBase64Decode(header);
        const payload = JSON.parse(json) as PaymentPayload & { payload?: any; transaction?: string };
        const transaction =
            (payload as any)?.payload?.transaction ??
            (payload as any)?.transaction ??
            null;
        if (!transaction || typeof transaction !== "string") return null;
        return { payload: payload as PaymentPayload, transaction };
    } catch {
        return null;
    }
}

/** Encode a settlement result for the `X-PAYMENT-RESPONSE` header. */
export function encodeSettlementResponse(result: {
    success: boolean;
    transaction: string;
    network: string;
    payer?: string;
}): string {
    return safeBase64Encode(JSON.stringify({ x402Version: X402_VERSION, ...result }));
}
