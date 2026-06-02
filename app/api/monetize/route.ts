import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getRepos, setRepo, deleteRepo, getApiKeyByValue, initStore, getFeeSummary } from "@/lib/store";
import { getAccessToken } from "@/lib/getAccessToken";
import { isValidStellarAddress } from "@/lib/stellar";

async function resolveAuth(req: NextRequest): Promise<
    { owner: string; ownerToken: string } | NextResponse
> {
    const session = await getServerSession(authOptions);
    if (session?.user?.email) {
        const ownerToken = await getAccessToken(req) ?? "";
        return { owner: session.user.email, ownerToken };
    }

    const authHeader = req.headers.get("authorization") ?? "";

    if (authHeader.startsWith("Bearer sbz_")) {
        const apiKey = getApiKeyByValue(authHeader.slice(7));
        if (!apiKey) return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
        return { owner: apiKey.owner, ownerToken: apiKey.ownerToken };
    }

    if (authHeader.startsWith("Bearer ")) {
        const ghToken = authHeader.slice(7);
        try {
            const ghRes = await fetch("https://api.github.com/user", {
                headers: { Authorization: `Bearer ${ghToken}`, Accept: "application/vnd.github+json" },
            });
            if (ghRes.ok) {
                const user = await ghRes.json();
                const owner = user.email ?? `${user.login}@github`;
                return { owner, ownerToken: ghToken };
            }
        } catch {
            // fall through to 401
        }
    }

    return NextResponse.json(
        { error: "Unauthorized — sign in via dashboard, or pass a GitHub token as Authorization: Bearer <token>" },
        { status: 401 }
    );
}

export async function POST(req: NextRequest) {
    await initStore();
    const auth = await resolveAuth(req);
    if (auth instanceof NextResponse) return auth;

    const { full_name, rules, mode, stellarAddress, paymentSplits, listing } = await req.json();
    if (!full_name || !rules?.length) {
        return NextResponse.json({ error: "Missing full_name or rules" }, { status: 400 });
    }

    // Block new listings if seller has outstanding fees above threshold
    const isNewListing = !getRepos()[full_name];
    if (isNewListing) {
        const fees = getFeeSummary(auth.owner);
        if (fees.blocked) {
            const parts: string[] = [];
            if (fees.xlm.blocked) parts.push(`${fees.xlm.owed.toFixed(4)} XLM`);
            if (fees.usdc.blocked) parts.push(`${fees.usdc.owed.toFixed(2)} USDC`);
            return NextResponse.json(
                {
                    error: `Outstanding platform fee of ${parts.join(" and ")} must be paid before adding new listings.`,
                    fee_owed: { xlm: fees.xlm.owed, usdc: fees.usdc.owed },
                    treasury_address: process.env.STELLAR_TREASURY_ADDRESS ?? null,
                },
                { status: 402 }
            );
        }
    }

    if (paymentSplits?.length) {
        for (const s of paymentSplits) {
            if (!isValidStellarAddress(s.stellarAddress)) {
                return NextResponse.json(
                    { error: `Invalid Stellar address for contributor @${s.login}` },
                    { status: 400 }
                );
            }
        }
        const total = paymentSplits.reduce((sum: number, s: { share: number }) => sum + s.share, 0);
        if (total !== 100) {
            return NextResponse.json(
                { error: `Splits must total 100% (currently ${total}%)` },
                { status: 400 }
            );
        }
    } else {
        if (!stellarAddress || !isValidStellarAddress(stellarAddress)) {
            return NextResponse.json(
                { error: "A valid Stellar public key (G…, 56 chars) is required." },
                { status: 400 }
            );
        }
    }

    setRepo(full_name, {
        rules,
        mode: mode ?? "flat",
        owner: auth.owner,
        ownerToken: auth.ownerToken,
        stellarAddress: paymentSplits?.length ? undefined : stellarAddress,
        paymentSplits: paymentSplits?.length ? paymentSplits : undefined,
        listing: listing ?? undefined,
    });

    return NextResponse.json({ success: true, gateway_url: `/api/access/${full_name}` });
}

export async function DELETE(req: NextRequest) {
    await initStore();
    const auth = await resolveAuth(req);
    if (auth instanceof NextResponse) return auth;

    const { full_name } = await req.json();
    if (!full_name) return NextResponse.json({ error: "Missing full_name" }, { status: 400 });

    const entry = getRepos()[full_name];
    if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (entry.owner !== auth.owner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    deleteRepo(full_name);
    return NextResponse.json({ success: true });
}

export async function GET(req: NextRequest) {
    await initStore();
    const auth = await resolveAuth(req);
    if (auth instanceof NextResponse) return auth;

    const owned = Object.entries(getRepos())
        .filter(([, v]) => v.owner === auth.owner)
        .map(([full_name, v]) => ({
            full_name,
            rules: v.rules,
            mode: v.mode,
            stellarAddress: v.stellarAddress,
            listing: v.listing,
        }));

    return NextResponse.json(owned);
}
