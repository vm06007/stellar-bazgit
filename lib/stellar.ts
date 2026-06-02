import { StrKey } from "@stellar/stellar-sdk";

export const STELLAR_NETWORK = process.env.STELLAR_NETWORK ?? "testnet";

export const HORIZON_URL =
    STELLAR_NETWORK === "mainnet"
        ? "https://horizon.stellar.org"
        : "https://horizon-testnet.stellar.org";

export const NETWORK_PASSPHRASE =
    STELLAR_NETWORK === "mainnet"
        ? "Public Global Stellar Network ; September 2015"
        : "Test SDF Network ; September 2015";

export const USDC_ISSUER_MAINNET = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
export const USDC_ISSUER_TESTNET = "GBBD47IF6LWK7P7MLAEGMLNB2BKVEN94I5OOZF3LQR5ALPZDVKFAVAR";

export const USDC_ISSUER =
    STELLAR_NETWORK === "mainnet" ? USDC_ISSUER_MAINNET : USDC_ISSUER_TESTNET;

export function isValidStellarAddress(address: string): boolean {
    try {
        return StrKey.isValidEd25519PublicKey(address);
    } catch {
        return false;
    }
}

export function shortStellarAddress(address: string): string {
    if (address.length < 12) return address;
    return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export type StellarAsset =
    | { type: "native" }
    | { type: "credit_alphanum4" | "credit_alphanum12"; code: string; issuer: string };

export const XLM_ASSET: StellarAsset = { type: "native" };
export const USDC_ASSET: StellarAsset = {
    type: "credit_alphanum4",
    code: "USDC",
    issuer: USDC_ISSUER,
};

export type PaymentVerificationResult =
    | { success: true; amount: string; asset: string; from: string; memo?: string }
    | { success: false; error: string };

export async function verifyStellarPayment(
    txHash: string,
    expectedTo: string,
    expectedMinAmount: string,
    expectedAsset: "XLM" | "USDC",
    expectedMemo?: string
): Promise<PaymentVerificationResult> {
    try {
        const url = `${HORIZON_URL}/transactions/${txHash}`;
        const res = await fetch(url);
        if (!res.ok) return { success: false, error: "Transaction not found on Stellar network" };

        const tx = await res.json();

        if (tx.successful !== true) {
            return { success: false, error: "Transaction did not succeed on-chain" };
        }

        if (expectedMemo && tx.memo !== expectedMemo) {
            return { success: false, error: `Memo mismatch: expected "${expectedMemo}", got "${tx.memo}"` };
        }

        const opsUrl = `${HORIZON_URL}/transactions/${txHash}/operations`;
        const opsRes = await fetch(opsUrl);
        if (!opsRes.ok) return { success: false, error: "Could not fetch transaction operations" };
        const opsData = await opsRes.json();
        const ops = opsData._embedded?.records ?? [];

        for (const op of ops) {
            if (op.type !== "payment") continue;
            if (op.to !== expectedTo) continue;

            const isXlm = expectedAsset === "XLM" && op.asset_type === "native";
            const isUsdc =
                expectedAsset === "USDC" &&
                op.asset_code === "USDC" &&
                op.asset_issuer === USDC_ISSUER;

            if (!isXlm && !isUsdc) continue;

            const paid = parseFloat(op.amount);
            const required = parseFloat(expectedMinAmount);
            if (paid < required) {
                return { success: false, error: `Insufficient payment: sent ${op.amount}, need ${expectedMinAmount}` };
            }

            return {
                success: true,
                amount: op.amount,
                asset: isXlm ? "XLM" : "USDC",
                from: op.from,
                memo: tx.memo,
            };
        }

        return { success: false, error: "No matching payment operation found in transaction" };
    } catch (e: any) {
        return { success: false, error: e?.message ?? "Unknown error verifying payment" };
    }
}
