import fs from "fs";
import path from "path";
import { Redis } from "@upstash/redis";
import { encryptToken, decryptToken } from "./store-crypto";

export { encryptToken, decryptToken };

const DATA_DIR = path.join(process.cwd(), ".data");
const REPOS_FILE = path.join(DATA_DIR, "monetized-repos.json");
const PURCHASES_FILE = path.join(DATA_DIR, "purchases.json");
const KEYS_FILE = path.join(DATA_DIR, "api-keys.json");
const BIDS_FILE = path.join(DATA_DIR, "bids.json");
const FEES_FILE = path.join(DATA_DIR, "fee-payments.json");

const RK_REPOS = "stellar-bazgit:repos";
const RK_PURCHASES = "stellar-bazgit:purchases";
const RK_KEYS = "stellar-bazgit:api-keys";
const RK_BIDS = "stellar-bazgit:bids";
const RK_FEES = "stellar-bazgit:fee-payments";

let _redis: Redis | null = null;
function getRedis(): Redis | null {
    if (_redis) return _redis;
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;
    if (url && token) _redis = new Redis({ url, token });
    return _redis;
}

async function redisGet<T>(key: string): Promise<T | null> {
    try {
        return await getRedis()?.get<T>(key) ?? null;
    } catch (e) {
        console.error("[store] Redis GET failed:", e);
        return null;
    }
}

async function redisSet(key: string, value: unknown): Promise<void> {
    try {
        await getRedis()?.set(key, value);
    } catch (e) {
        console.error("[store] Redis SET failed:", e);
    }
}

let _initialized = false;

export async function initStore(): Promise<void> {
    if (_initialized || (globalThis as any).__storeInitialized) {
        _initialized = true;
        return;
    }

    const redis = getRedis();
    if (!redis) {
        _initialized = true;
        (globalThis as any).__storeInitialized = true;
        return;
    }

    const [rRepos, rPurchases, rKeys, rBids, rFees] = await Promise.all([
        redisGet<MonetizedReposStore>(RK_REPOS),
        redisGet<Purchase[]>(RK_PURCHASES),
        redisGet<ApiKey[]>(RK_KEYS),
        redisGet<Bid[]>(RK_BIDS),
        redisGet<FeePayment[]>(RK_FEES),
    ]);

    if (rRepos && Object.keys(repos).length === 0) Object.assign(repos, rRepos);
    if (rPurchases && purchases.length === 0) purchases.push(...rPurchases);
    if (rKeys && apiKeys.length === 0) apiKeys.push(...rKeys);
    if (rBids && bids.length === 0) bids.push(...rBids);
    if (rFees && feePayments.length === 0) feePayments.push(...rFees);

    _initialized = true;
    (globalThis as any).__storeInitialized = true;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type ContributorSplit = {
    login: string;
    avatar_url: string;
    stellarAddress: string;
    share: number;
};

export type MonetizedRepo = {
    rules: { path: string; price: string; asset: "XLM" | "USDC" }[];
    mode: string;
    owner: string;
    ownerToken: string;
    stellarAddress?: string;
    paymentSplits?: ContributorSplit[];
    listing?: {
        description?: string;
        use_readme?: boolean;
        highlights?: string[];
        images?: string[];
        preview_url?: string;
    };
};

export type MonetizedReposStore = Record<string, MonetizedRepo>;

export type Purchase = {
    id: string;
    full_name: string;
    path: string | null;
    payer: string;
    transaction: string;
    network: string;
    amount: string;
    asset: "XLM" | "USDC";
    paid_at: string;
};

export type ApiKey = {
    key: string;
    owner: string;
    ownerToken: string;
    label: string;
    createdAt: string;
};

export type FeePayment = {
    id: string;
    owner: string;
    amount: string;
    asset: "XLM" | "USDC";
    transaction: string;
    network: string;
    paid_at: string;
};

export type FeeSummaryAsset = {
    earned: number;
    paid: number;
    owed: number;
    threshold: number;
    blocked: boolean;
};

export type FeeSummary = {
    xlm: FeeSummaryAsset;
    usdc: FeeSummaryAsset;
    blocked: boolean;
};

export type Bid = {
    id: string;
    full_name: string;
    amount: string;
    asset: "XLM" | "USDC";
    message: string;
    bidder: string;
    status: "pending" | "accepted" | "rejected";
    submitted_at: string;
};

// ── In-memory stores ──────────────────────────────────────────────────────────

const repos: MonetizedReposStore =
    (globalThis as any).__monetizedRepos ??
    ((globalThis as any).__monetizedRepos = loadJson<MonetizedReposStore>(REPOS_FILE, {}));

const purchases: Purchase[] =
    (globalThis as any).__purchases ??
    ((globalThis as any).__purchases = loadJson<Purchase[]>(PURCHASES_FILE, []));

const apiKeys: ApiKey[] =
    (globalThis as any).__apiKeys ??
    ((globalThis as any).__apiKeys = loadJson<ApiKey[]>(KEYS_FILE, []));

const bids: Bid[] =
    (globalThis as any).__bids ??
    ((globalThis as any).__bids = loadJson<Bid[]>(BIDS_FILE, []));

const feePayments: FeePayment[] =
    (globalThis as any).__feePayments ??
    ((globalThis as any).__feePayments = loadJson<FeePayment[]>(FEES_FILE, []));

// ── Monetized repos ───────────────────────────────────────────────────────────

export function getRepos(): MonetizedReposStore { return repos; }

export function setRepo(full_name: string, data: MonetizedRepo): void {
    repos[full_name] = { ...data, ownerToken: encryptToken(data.ownerToken) };
    persist(REPOS_FILE, repos);
    redisSet(RK_REPOS, repos);
}

export function getRepoToken(full_name: string): string {
    const entry = repos[full_name];
    if (!entry) return "";
    return decryptToken(entry.ownerToken);
}

export function deleteRepo(full_name: string): void {
    delete repos[full_name];
    persist(REPOS_FILE, repos);
    redisSet(RK_REPOS, repos);
}

// ── Purchases ─────────────────────────────────────────────────────────────────

export function getPurchases(full_name?: string): Purchase[] {
    return full_name ? purchases.filter((p) => p.full_name === full_name) : purchases;
}

export function addPurchase(purchase: Purchase): void {
    purchases.unshift(purchase);
    persist(PURCHASES_FILE, purchases);
    redisSet(RK_PURCHASES, purchases);
}

// ── API Keys ──────────────────────────────────────────────────────────────────

export function getApiKeys(owner?: string): ApiKey[] {
    return owner ? apiKeys.filter((k) => k.owner === owner) : apiKeys;
}

export function getApiKeyByValue(key: string): ApiKey | undefined {
    return apiKeys.find((k) => k.key === key);
}

export function createApiKey(owner: string, ownerToken: string, label: string): ApiKey {
    const key: ApiKey = {
        key: "sbz_" + crypto.randomUUID().replace(/-/g, ""),
        owner,
        ownerToken,
        label,
        createdAt: new Date().toISOString(),
    };
    apiKeys.push(key);
    persist(KEYS_FILE, apiKeys);
    redisSet(RK_KEYS, apiKeys);
    return key;
}

export function deleteApiKey(key: string, owner: string): boolean {
    const idx = apiKeys.findIndex((k) => k.key === key && k.owner === owner);
    if (idx === -1) return false;
    apiKeys.splice(idx, 1);
    persist(KEYS_FILE, apiKeys);
    redisSet(RK_KEYS, apiKeys);
    return true;
}

// ── Bids ──────────────────────────────────────────────────────────────────────

export function getBids(full_name?: string): Bid[] {
    return full_name ? bids.filter((b) => b.full_name === full_name) : bids;
}

export function getBidsByOwner(ownerEmail: string): Bid[] {
    const ownerRepos = new Set(
        Object.entries(repos)
            .filter(([, v]) => v.owner === ownerEmail)
            .map(([k]) => k)
    );
    return bids.filter((b) => ownerRepos.has(b.full_name));
}

export function addBid(bid: Bid): void {
    bids.unshift(bid);
    persist(BIDS_FILE, bids);
    redisSet(RK_BIDS, bids);
}

export function updateBidStatus(id: string, status: Bid["status"]): boolean {
    const bid = bids.find((b) => b.id === id);
    if (!bid) return false;
    bid.status = status;
    persist(BIDS_FILE, bids);
    redisSet(RK_BIDS, bids);
    return true;
}

// ── Fee Payments ──────────────────────────────────────────────────────────────

const FEE_RATE = 0.005; // 0.5%
const FEE_THRESHOLD_XLM = 1.0;  // block new listings if owed > 1 XLM
const FEE_THRESHOLD_USDC = 0.10; // block new listings if owed > $0.10 USDC

export function getFeePayments(owner?: string): FeePayment[] {
    return owner ? feePayments.filter((f) => f.owner === owner) : feePayments;
}

export function addFeePayment(payment: FeePayment): void {
    feePayments.unshift(payment);
    persist(FEES_FILE, feePayments);
    redisSet(RK_FEES, feePayments);
}

export function getFeeSummary(owner: string): FeeSummary {
    const ownerRepos = new Set(
        Object.entries(repos)
            .filter(([, v]) => v.owner === owner)
            .map(([k]) => k)
    );

    const ownerPurchases = getPurchases().filter((p) => ownerRepos.has(p.full_name));
    const ownerFees = getFeePayments(owner);

    const earnedXLM = ownerPurchases.filter(p => p.asset === "XLM").reduce((s, p) => s + parseFloat(p.amount), 0);
    const earnedUSDC = ownerPurchases.filter(p => p.asset === "USDC").reduce((s, p) => s + parseFloat(p.amount), 0);
    const paidXLM = ownerFees.filter(f => f.asset === "XLM").reduce((s, f) => s + parseFloat(f.amount), 0);
    const paidUSDC = ownerFees.filter(f => f.asset === "USDC").reduce((s, f) => s + parseFloat(f.amount), 0);

    const owedXLM = Math.max(0, Math.round((earnedXLM * FEE_RATE - paidXLM) * 10000) / 10000);
    const owedUSDC = Math.max(0, Math.round((earnedUSDC * FEE_RATE - paidUSDC) * 100) / 100);

    const xlm: FeeSummaryAsset = { earned: earnedXLM, paid: paidXLM, owed: owedXLM, threshold: FEE_THRESHOLD_XLM, blocked: owedXLM > FEE_THRESHOLD_XLM };
    const usdc: FeeSummaryAsset = { earned: earnedUSDC, paid: paidUSDC, owed: owedUSDC, threshold: FEE_THRESHOLD_USDC, blocked: owedUSDC > FEE_THRESHOLD_USDC };

    return { xlm, usdc, blocked: xlm.blocked || usdc.blocked };
}

// ── Shared utils ──────────────────────────────────────────────────────────────

function loadJson<T>(file: string, fallback: T): T {
    try {
        if (fs.existsSync(file))
            return JSON.parse(fs.readFileSync(file, "utf-8"));
    } catch (e) {
        console.error("[store] Failed to load:", file, e);
    }
    return fallback;
}

function persist(file: string, data: unknown): void {
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        const tmp = file + ".tmp";
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
        fs.renameSync(tmp, file);
    } catch {
        // silently skip on read-only filesystems (Vercel)
    }
}
