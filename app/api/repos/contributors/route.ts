import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getAccessToken } from "@/lib/getAccessToken";

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const accessToken = await getAccessToken(req);
    if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const full_name = req.nextUrl.searchParams.get("full_name");
    if (!full_name) return NextResponse.json({ error: "Missing full_name" }, { status: 400 });

    const res = await fetch(
        `https://api.github.com/repos/${full_name}/contributors?per_page=20`,
        {
            headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json" },
        }
    );

    if (!res.ok) return NextResponse.json({ error: "Failed to fetch contributors" }, { status: res.status });

    const data = await res.json();
    const contributors = (Array.isArray(data) ? data : []).map((c: any) => ({
        login: c.login,
        avatar_url: c.avatar_url,
        contributions: c.contributions,
    }));

    return NextResponse.json({ contributors });
}
