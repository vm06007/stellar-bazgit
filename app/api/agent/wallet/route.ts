import { NextResponse } from "next/server";
import { Keypair, Horizon, Asset } from "@stellar/stellar-sdk";
import { Redis } from "@upstash/redis";
import { HORIZON_URL, STELLAR_NETWORK, USDC_ISSUER } from "@/lib/stellar-server";
import fs from "fs";
import path from "path";

const WALLET_FILE = path.join(process.cwd(), ".data", "agent-wallet.json");
const RK_WALLET = "stellar-bazgit:agent-wallet";

function getRedis(): Redis | null {
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;
    if (url && token) return new Redis({ url, token });
    return null;
}

async function getWallet(): Promise<{ secretKey: string } | null> {
    const redis = getRedis();
    if (redis) {
        try {
            const val = await redis.get<{ secretKey: string }>(RK_WALLET);
            if (val) return val;
        } catch {}
    }
    try {
        if (fs.existsSync(WALLET_FILE))
            return JSON.parse(fs.readFileSync(WALLET_FILE, "utf8"));
    } catch {}
    return null;
}

async function saveWallet(secretKey: string) {
    const redis = getRedis();
    if (redis) { try { await redis.set(RK_WALLET, { secretKey }); } catch {} }
    try {
        fs.mkdirSync(path.dirname(WALLET_FILE), { recursive: true });
        fs.writeFileSync(WALLET_FILE, JSON.stringify({ secretKey }), "utf8");
    } catch {}
}

async function deleteWallet() {
    const redis = getRedis();
    if (redis) { try { await redis.del(RK_WALLET); } catch {} }
    try { if (fs.existsSync(WALLET_FILE)) fs.unlinkSync(WALLET_FILE); } catch {}
}

export async function GET() {
    const stored = await getWallet();
    if (!stored) return NextResponse.json({ exists: false });

    const keypair = Keypair.fromSecret(stored.secretKey);
    const publicKey = keypair.publicKey();

    let xlm = "0";
    let usdc = "0";
    try {
        const server = new Horizon.Server(HORIZON_URL);
        const account = await server.loadAccount(publicKey);
        for (const b of account.balances) {
            if (b.asset_type === "native") xlm = parseFloat(b.balance).toFixed(4);
            if (b.asset_type !== "native" && (b as any).asset_code === "USDC" && (b as any).asset_issuer === USDC_ISSUER) {
                usdc = parseFloat(b.balance).toFixed(2);
            }
        }
    } catch {
        // Account not yet funded on Stellar — show zero balances
    }

    return NextResponse.json({
        exists: true,
        publicKey,
        network: STELLAR_NETWORK,
        xlm,
        usdc,
    });
}

export async function POST() {
    const existing = await getWallet();
    if (existing) return NextResponse.json({ error: "Wallet already exists" }, { status: 400 });

    const keypair = Keypair.random();
    await saveWallet(keypair.secret());
    return NextResponse.json({ publicKey: keypair.publicKey() });
}

export async function DELETE() {
    await deleteWallet();
    return NextResponse.json({ success: true });
}

export { getWallet as getAgentWallet };
