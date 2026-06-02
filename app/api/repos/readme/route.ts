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

    const res = await fetch(`https://api.github.com/repos/${full_name}/readme`, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github.raw+json",
        },
    });

    if (!res.ok) return NextResponse.json({ error: "No README found" }, { status: 404 });

    const content = await res.text();
    return NextResponse.json({ content });
}
