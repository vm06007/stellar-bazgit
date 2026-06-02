import { NextRequest, NextResponse } from "next/server";
import { getReviews, getRepoRating, getMerchantRating, upsertReview, hasPurchased, initStore } from "@/lib/store";

export async function GET(req: NextRequest) {
    await initStore();
    const repo = req.nextUrl.searchParams.get("repo");
    const owner = req.nextUrl.searchParams.get("owner");

    if (owner) {
        return NextResponse.json({ rating: getMerchantRating(owner) });
    }

    if (repo) {
        return NextResponse.json({
            rating: getRepoRating(repo),
            reviews: getReviews(repo),
        });
    }

    return NextResponse.json({ error: "Provide ?repo= or ?owner=" }, { status: 400 });
}

export async function POST(req: NextRequest) {
    await initStore();
    const { full_name, reviewer, rating, comment } = await req.json();

    if (!full_name || !reviewer || rating == null) {
        return NextResponse.json({ error: "Missing full_name, reviewer, or rating" }, { status: 400 });
    }

    const r = Number(rating);
    if (!Number.isFinite(r) || r < 1 || r > 5) {
        return NextResponse.json({ error: "Rating must be between 1 and 5" }, { status: 400 });
    }

    // Verified-purchase gate: only buyers who paid for this repo can review it.
    if (!hasPurchased(full_name, reviewer)) {
        return NextResponse.json(
            { error: "Only verified buyers can review. No purchase found for this Stellar address." },
            { status: 403 }
        );
    }

    const review = upsertReview({ full_name, reviewer, rating: r, comment: (comment ?? "").toString().slice(0, 1000) });
    return NextResponse.json({ success: true, review, rating: getRepoRating(full_name) });
}
