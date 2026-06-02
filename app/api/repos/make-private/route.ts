import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getAccessToken } from "@/lib/getAccessToken";

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const accessToken = await getAccessToken(req);
    if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { full_name } = await req.json();
    if (!full_name) return NextResponse.json({ error: "Missing full_name" }, { status: 400 });

    const res = await fetch(`https://api.github.com/repos/${full_name}`, {
        method: "PATCH",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ private: true }),
    });

    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return NextResponse.json(
            { error: body.message ?? "Failed to make repo private" },
            { status: res.status }
        );
    }

    return NextResponse.json({ success: true });
}
