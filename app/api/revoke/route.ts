import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getAccessToken } from "@/lib/getAccessToken";

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const accessToken = await getAccessToken(req);
    if (!accessToken) return NextResponse.json({ error: "No token" }, { status: 400 });

    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        return NextResponse.json({ error: "GitHub credentials not configured" }, { status: 500 });
    }

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    try {
        await fetch(
            `https://api.github.com/applications/${clientId}/token`,
            {
                method: "DELETE",
                headers: {
                    Authorization: `Basic ${credentials}`,
                    Accept: "application/vnd.github+json",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ access_token: accessToken }),
            }
        );
    } catch {
        // non-fatal — user session is still cleared client-side
    }

    return NextResponse.json({ success: true });
}
