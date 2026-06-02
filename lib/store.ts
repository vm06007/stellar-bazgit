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
const REVIEWS_FILE = path.join(DATA_DIR, "reviews.json");

const RK_REPOS = "stellar-bazgit:repos";
const RK_PURCHASES = "stellar-bazgit:purchases";
const RK_KEYS = "stellar-bazgit:api-keys";
const RK_BIDS = "stellar-bazgit:bids";
const RK_FEES = "stellar-bazgit:fee-payments";
const RK_REVIEWS = "stellar-bazgit:reviews";

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

function replaceArray<T>(arr: T[], next: T[] | null | undefined): void {
    arr.length = 0;
    if (next) arr.push(...next);
}

export async function initStore(): Promise<void> {
    const redis = getRedis();

    // Local dev (no Redis): in-memory is backed by .data/*.json files which are
    // stable, so hydrate once.
    if (!redis) {
        _initialized = true;
        (globalThis as any).__storeInitialized = true;
        return;
    }

    // Serverless (Redis configured): each request may run on a different, possibly
    // warm instance with stale in-memory state. Redis is the source of truth, so
    // re-hydrate from it on EVERY request. Combined with awaited writes below, this
    // keeps every instance consistent (no more "listing gone on refresh").
    const [rRepos, rPurchases, rKeys, rBids, rFees, rReviews] = await Promise.all([
        redisGet<MonetizedReposStore>(RK_REPOS),
        redisGet<Purchase[]>(RK_PURCHASES),
        redisGet<ApiKey[]>(RK_KEYS),
        redisGet<Bid[]>(RK_BIDS),
        redisGet<FeePayment[]>(RK_FEES),
        redisGet<Review[]>(RK_REVIEWS),
    ]);

    for (const k of Object.keys(repos)) delete repos[k];
    if (rRepos) Object.assign(repos, rRepos);
    replaceArray(purchases, rPurchases);
    replaceArray(apiKeys, rKeys);
    replaceArray(bids, rBids);
    replaceArray(feePayments, rFees);
    replaceArray(reviews, rReviews);

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

export type Review = {
    id: string;
    full_name: string;
    reviewer: string;      // Stellar address (a verified buyer)
    rating: number;        // 1–5
    comment: string;
    created_at: string;
};

export type Rating = { avg: number; count: number };

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

const reviews: Review[] =
    (globalThis as any).__reviews ??
    ((globalThis as any).__reviews = loadJson<Review[]>(REVIEWS_FILE, []));

// ── Monetized repos ───────────────────────────────────────────────────────────

export function getRepos(): MonetizedReposStore { return repos; }

export async function setRepo(full_name: string, data: MonetizedRepo): Promise<void> {
    repos[full_name] = { ...data, ownerToken: encryptToken(data.ownerToken) };
    persist(REPOS_FILE, repos);
    await redisSet(RK_REPOS, repos);
}

export function getRepoToken(full_name: string): string {
    const entry = repos[full_name];
    if (!entry) return "";
    return decryptToken(entry.ownerToken);
}

export async function deleteRepo(full_name: string): Promise<void> {
    delete repos[full_name];
    persist(REPOS_FILE, repos);
    await redisSet(RK_REPOS, repos);
    // Clear the repo's activity so re-listing starts with a clean slate
    // (purchases + reviews/ratings) — makes test/demo cycles repeatable.
    await clearRepoActivity(full_name);
}

/** Remove all purchases and reviews tied to a repo (used on delist). */
export async function clearRepoActivity(full_name: string): Promise<void> {
    const pBefore = purchases.length;
    for (let i = purchases.length - 1; i >= 0; i--) {
        if (purchases[i].full_name === full_name) purchases.splice(i, 1);
    }
    if (purchases.length !== pBefore) {
        persist(PURCHASES_FILE, purchases);
        await redisSet(RK_PURCHASES, purchases);
    }

    const rBefore = reviews.length;
    for (let i = reviews.length - 1; i >= 0; i--) {
        if (reviews[i].full_name === full_name) reviews.splice(i, 1);
    }
    if (reviews.length !== rBefore) {
        persist(REVIEWS_FILE, reviews);
        await redisSet(RK_REVIEWS, reviews);
    }
}

// ── Purchases ─────────────────────────────────────────────────────────────────

export function getPurchases(full_name?: string): Purchase[] {
    return full_name ? purchases.filter((p) => p.full_name === full_name) : purchases;
}

export async function addPurchase(purchase: Purchase): Promise<void> {
    purchases.unshift(purchase);
    persist(PURCHASES_FILE, purchases);
    await redisSet(RK_PURCHASES, purchases);
}

/** Has this Stellar address purchased this repo? (verified-purchase check) */
export function hasPurchased(full_name: string, address: string): boolean {
    return purchases.some((p) => p.full_name === full_name && p.payer === address);
}

// ── Reviews & Ratings ─────────────────────────────────────────────────────────

function aggregate(list: Review[]): Rating {
    if (list.length === 0) return { avg: 0, count: 0 };
    const sum = list.reduce((s, r) => s + r.rating, 0);
    return { avg: Math.round((sum / list.length) * 10) / 10, count: list.length };
}

export function getReviews(full_name: string): Review[] {
    return reviews.filter((r) => r.full_name === full_name);
}

export function getRepoRating(full_name: string): Rating {
    return aggregate(getReviews(full_name));
}

/** Merchant rating = aggregate across every repo the owner sells (by GitHub login). */
export function getMerchantRating(ownerLogin: string): Rating {
    const prefix = ownerLogin.toLowerCase() + "/";
    return aggregate(reviews.filter((r) => r.full_name.toLowerCase().startsWith(prefix)));
}

/** Add or update a reviewer's review for a repo (one per reviewer per repo). */
export async function upsertReview(input: { full_name: string; reviewer: string; rating: number; comment: string }): Promise<Review> {
    const rating = Math.max(1, Math.min(5, Math.round(input.rating)));
    const existing = reviews.find((r) => r.full_name === input.full_name && r.reviewer === input.reviewer);
    if (existing) {
        existing.rating = rating;
        existing.comment = input.comment;
        existing.created_at = new Date().toISOString();
    } else {
        reviews.unshift({
            id: crypto.randomUUID(),
            full_name: input.full_name,
            reviewer: input.reviewer,
            rating,
            comment: input.comment,
            created_at: new Date().toISOString(),
        });
    }
    persist(REVIEWS_FILE, reviews);
    await redisSet(RK_REVIEWS, reviews);
    return reviews.find((r) => r.full_name === input.full_name && r.reviewer === input.reviewer)!;
}

// ── API Keys ──────────────────────────────────────────────────────────────────

export function getApiKeys(owner?: string): ApiKey[] {
    return owner ? apiKeys.filter((k) => k.owner === owner) : apiKeys;
}

export function getApiKeyByValue(key: string): ApiKey | undefined {
    return apiKeys.find((k) => k.key === key);
}

export async function createApiKey(owner: string, ownerToken: string, label: string): Promise<ApiKey> {
    const key: ApiKey = {
        key: "sbz_" + crypto.randomUUID().replace(/-/g, ""),
        owner,
        ownerToken,
        label,
        createdAt: new Date().toISOString(),
    };
    apiKeys.push(key);
    persist(KEYS_FILE, apiKeys);
    await redisSet(RK_KEYS, apiKeys);
    return key;
}

export async function deleteApiKey(key: string, owner: string): Promise<boolean> {
    const idx = apiKeys.findIndex((k) => k.key === key && k.owner === owner);
    if (idx === -1) return false;
    apiKeys.splice(idx, 1);
    persist(KEYS_FILE, apiKeys);
    await redisSet(RK_KEYS, apiKeys);
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

export async function addBid(bid: Bid): Promise<void> {
    bids.unshift(bid);
    persist(BIDS_FILE, bids);
    await redisSet(RK_BIDS, bids);
}

export async function updateBidStatus(id: string, status: Bid["status"]): Promise<boolean> {
    const bid = bids.find((b) => b.id === id);
    if (!bid) return false;
    bid.status = status;
    persist(BIDS_FILE, bids);
    await redisSet(RK_BIDS, bids);
    return true;
}

// ── Fee Payments ──────────────────────────────────────────────────────────────

const FEE_RATE = 0.005; // 0.5%
const FEE_THRESHOLD_XLM = 1.0;  // block new listings if owed > 1 XLM
const FEE_THRESHOLD_USDC = 0.10; // block new listings if owed > $0.10 USDC

export function getFeePayments(owner?: string): FeePayment[] {
    return owner ? feePayments.filter((f) => f.owner === owner) : feePayments;
}

export async function addFeePayment(payment: FeePayment): Promise<void> {
    feePayments.unshift(payment);
    persist(FEES_FILE, feePayments);
    await redisSet(RK_FEES, feePayments);
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
