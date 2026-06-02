import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getAccessToken } from "@/lib/getAccessToken";

export async function GET(req: NextRequest) {
    let accessToken: string | undefined;

    const session = await getServerSession(authOptions);
    if (session) {
        accessToken = await getAccessToken(req);
    } else {
        const authHeader = req.headers.get("authorization") ?? "";
        if (authHeader.startsWith("Bearer ")) {
            const ghToken = authHeader.slice(7);
            const ghRes = await fetch("https://api.github.com/user", {
                headers: { Authorization: `Bearer ${ghToken}`, Accept: "application/vnd.github+json" },
            });
            if (!ghRes.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
            accessToken = ghToken;
        } else {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
    }

    if (!accessToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const res = await fetch(
        "https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner",
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/vnd.github+json",
            },
        }
    );

    if (!res.ok) {
        const body = await res.text();
        return NextResponse.json(
            { error: "Failed to fetch repos", detail: body },
            { status: res.status }
        );
    }

    const repos = await res.json();
    const mapped = repos.map((r: any) => ({
        id: r.id,
        name: r.name,
        full_name: r.full_name,
        private: r.private,
        description: r.description,
        updated_at: r.updated_at,
        language: r.language,
        stargazers_count: r.stargazers_count,
    }));

    return NextResponse.json(mapped);
}
