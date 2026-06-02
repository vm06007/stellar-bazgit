import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getAccessToken } from "@/lib/getAccessToken";
import { getRepos, deleteRepo, getApiKeys, deleteApiKey, initStore } from "@/lib/store";

export async function POST(req: NextRequest) {
    await initStore();
    const session = await getServerSession(authOptions);
    const accessToken = await getAccessToken(req);

    if (!accessToken) {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        return NextResponse.json({ error: "GitHub credentials not configured" }, { status: 500 });
    }

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const headers = {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github+json",
    };
    const body = JSON.stringify({ access_token: accessToken });

    // DELETE /grant removes the entire OAuth app authorization, forcing the
    // GitHub consent screen again on the next sign-in (true "revoke + relogin").
    // DELETE /token would only invalidate the token while the app stays
    // authorized — GitHub then silently re-issues a token, so it feels like a no-op.
    const res = await fetch(`https://api.github.com/applications/${clientId}/grant`, {
        method: "DELETE",
        headers,
        body,
    });

    if (!res.ok && res.status !== 204) {
        const text = await res.text();
        console.error("GitHub revoke grant failed:", res.status, text);
        return NextResponse.json({ error: text || "Failed to revoke GitHub authorization" }, { status: res.status });
    }

    // The seller's GitHub token is now dead — unlist their repos (so buyers
    // don't hit broken clone URLs) and delete their API keys.
    const owner = session?.user?.email;
    if (owner) {
        for (const [full_name, entry] of Object.entries(getRepos())) {
            if (entry.owner === owner) deleteRepo(full_name);
        }
        for (const key of getApiKeys(owner)) {
            deleteApiKey(key.key, owner);
        }
    }

    return NextResponse.json({ ok: true });
}
