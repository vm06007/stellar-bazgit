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

    const repoRes = await fetch(`https://api.github.com/repos/${full_name}`, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json" },
    });
    if (!repoRes.ok) return NextResponse.json({ error: "Repo not found" }, { status: 404 });
    const repoData = await repoRes.json();
    const branch = repoData.default_branch ?? "main";

    const treeRes = await fetch(
        `https://api.github.com/repos/${full_name}/git/trees/${branch}?recursive=1`,
        {
            headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json" },
        }
    );

    if (!treeRes.ok) {
        return NextResponse.json({ error: "Failed to fetch tree" }, { status: treeRes.status });
    }

    const treeData = await treeRes.json();
    const items = (treeData.tree ?? []).map((item: any) => ({
        path: item.path,
        type: item.type === "blob" ? "blob" : "tree",
    }));

    return NextResponse.json({ items, truncated: treeData.truncated ?? false });
}
