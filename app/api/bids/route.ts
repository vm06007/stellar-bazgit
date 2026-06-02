import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getBids, getBidsByOwner, addBid, updateBidStatus, getRepos, initStore } from "@/lib/store";
import { getAccessToken } from "@/lib/getAccessToken";

export async function GET(req: NextRequest) {
    await initStore();
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const bids = getBidsByOwner(session.user.email);
    return NextResponse.json(bids);
}

export async function POST(req: NextRequest) {
    await initStore();
    const { full_name, amount, asset, message, bidder } = await req.json();

    if (!full_name || !amount || !bidder) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!getRepos()[full_name]) {
        return NextResponse.json({ error: "Repo not in catalog" }, { status: 404 });
    }

    const bid = {
        id: crypto.randomUUID(),
        full_name,
        amount,
        asset: (asset ?? "XLM") as "XLM" | "USDC",
        message: message ?? "",
        bidder,
        status: "pending" as const,
        submitted_at: new Date().toISOString(),
    };

    addBid(bid);
    return NextResponse.json({ success: true, id: bid.id });
}

export async function PATCH(req: NextRequest) {
    await initStore();
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id, status } = await req.json();
    if (!id || !["accepted", "rejected"].includes(status)) {
        return NextResponse.json({ error: "Missing id or invalid status" }, { status: 400 });
    }

    const allBids = getBids();
    const bid = allBids.find((b) => b.id === id);
    if (!bid) return NextResponse.json({ error: "Bid not found" }, { status: 404 });

    const repos = getRepos();
    const entry = repos[bid.full_name];
    if (!entry || entry.owner !== session.user.email) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    updateBidStatus(id, status);
    return NextResponse.json({ success: true });
}
