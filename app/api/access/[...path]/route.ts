import { NextRequest, NextResponse } from "next/server";
import { getRepos, getRepoToken, initStore } from "@/lib/store";
import { HORIZON_URL, STELLAR_NETWORK } from "@/lib/stellar";

type IssuedToken = { full_name: string; expires: number };
declare const globalThis: { __issuedTokens?: Map<string, IssuedToken> } & typeof global;

function getTokenMap(): Map<string, IssuedToken> {
    if (!globalThis.__issuedTokens) globalThis.__issuedTokens = new Map();
    return globalThis.__issuedTokens;
}

function resolvePrice(repos: ReturnType<typeof getRepos>, full_name: string, filePath: string | null): string {
    const entry = repos[full_name];
    if (!entry) return "1.00";
    if (entry.mode === "flat" || !filePath) {
        return entry.rules.find((r) => r.path === "*")?.price ?? entry.rules[0]?.price ?? "1.00";
    }
    const parts = filePath.split("/");
    for (let i = parts.length; i > 0; i--) {
        const candidate = parts.slice(0, i).join("/");
        const rule = entry.rules.find((r) => r.path === candidate);
        if (rule) return rule.price;
    }
    return entry.rules.find((r) => r.path === "*")?.price ?? "1.00";
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    await initStore();
    const { path } = await params;
    if (path.length < 2) return NextResponse.json({ error: "Invalid path" }, { status: 400 });

    const owner = path[0];
    const repo = path[1];
    const full_name = `${owner}/${repo}`;
    const filePath = path.length > 2 ? path.slice(2).join("/") : null;

    const repos = getRepos();
    const entry = repos[full_name];
    if (!entry) return NextResponse.json({ error: "Repo not found in catalog" }, { status: 404 });

    const token = req.nextUrl.searchParams.get("token");
    if (token) {
        const tokenMap = getTokenMap();
        const issued = tokenMap.get(token);
        if (!issued || issued.full_name !== full_name || issued.expires < Date.now()) {
            tokenMap.delete(token);
            return NextResponse.json({ error: "Access token invalid or expired" }, { status: 401 });
        }

        const githubToken = getRepoToken(full_name);
        if (!githubToken) return NextResponse.json({ error: "Seller credentials unavailable" }, { status: 500 });

        return NextResponse.json({
            clone_url: `https://${githubToken}@github.com/${full_name}.git`,
            tarball_url: `https://api.github.com/repos/${full_name}/tarball?access_token=${githubToken}`,
            full_name,
            expires_at: new Date(issued.expires).toISOString(),
        });
    }

    const stellarAddress = entry.stellarAddress ??
        entry.paymentSplits?.sort((a, b) => b.share - a.share)[0]?.stellarAddress ?? "";
    const price = resolvePrice(repos, full_name, filePath);
    const asset = entry.rules[0]?.asset ?? "XLM";
    const memo = full_name.slice(0, 28);

    return NextResponse.json(
        {
            payment_required: true,
            full_name,
            file_path: filePath,
            stellar_address: stellarAddress,
            amount: price,
            asset,
            network: STELLAR_NETWORK,
            horizon_url: HORIZON_URL,
            memo,
            memo_type: "text",
            verify_url: `${req.nextUrl.origin}/api/pay`,
            message: `Send ${price} ${asset} to ${stellarAddress} with memo "${memo}", then POST the tx hash to ${req.nextUrl.origin}/api/pay`,
        },
        { status: 402 }
    );
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    await initStore();
    const { path } = await params;
    if (path.length < 2) return NextResponse.json({ error: "Invalid path" }, { status: 400 });

    const owner = path[0];
    const repo = path[1];
    const full_name = `${owner}/${repo}`;

    const repos = getRepos();
    if (!repos[full_name]) return NextResponse.json({ error: "Repo not found" }, { status: 404 });

    const { tx_hash } = await req.json();
    if (!tx_hash) return NextResponse.json({ error: "Missing tx_hash" }, { status: 400 });

    const { verifyStellarPayment } = await import("@/lib/stellar");
    const entry = repos[full_name];
    const stellarAddress = entry.stellarAddress ??
        entry.paymentSplits?.sort((a, b) => b.share - a.share)[0]?.stellarAddress ?? "";
    const price = resolvePrice(repos, full_name, null);
    const asset = entry.rules[0]?.asset ?? "XLM";
    const memo = full_name.slice(0, 28);

    const result = await verifyStellarPayment(tx_hash, stellarAddress, price, asset, memo);
    if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 402 });
    }

    const token = crypto.randomUUID();
    const tokenMap = getTokenMap();
    tokenMap.set(token, { full_name, expires: Date.now() + 3600000 });

    return NextResponse.json({ success: true, token, expires_in: 3600 });
}
