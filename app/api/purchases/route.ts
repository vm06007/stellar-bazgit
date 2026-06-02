import { NextRequest, NextResponse } from "next/server";
import { getPurchases, initStore } from "@/lib/store";

export async function GET(req: NextRequest) {
    await initStore();
    const repoParam = req.nextUrl.searchParams.get("repo");
    const purchases = getPurchases(repoParam ?? undefined);
    return NextResponse.json(purchases);
}
