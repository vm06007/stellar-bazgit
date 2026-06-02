import { NextRequest, NextResponse } from "next/server";
import { getRepos, getRepoToken, initStore } from "@/lib/store";

export async function GET(req: NextRequest) {
    await initStore();
    const repoParam = req.nextUrl.searchParams.get("repo");
    const ownerParam = req.nextUrl.searchParams.get("owner");

    const entries = Object.entries(getRepos());
    const filtered = repoParam
        ? entries.filter(([full_name]) => full_name === repoParam)
        : ownerParam
        ? entries.filter(([full_name]) => full_name.split("/")[0] === ownerParam)
        : entries;

    const results = await Promise.all(
        filtered.map(async ([full_name, v]) => {
            const base = {
                full_name,
                name: full_name.split("/")[1] ?? full_name,
                description: null as string | null,
                language: null as string | null,
                stars: 0,
                mode: v.mode as "flat" | "granular",
                rules: v.rules.map((r: any) => ({
                    path: r.path as string,
                    price: r.price as string,
                    asset: (r.asset ?? "XLM") as "XLM" | "USDC",
                })),
                gateway_url: `/api/access/${full_name}`,
                page_url: `/repo/${full_name}`,
                stellarAddress: v.stellarAddress ?? null,
                listing: v.listing ?? null,
            };

            const ownerToken = getRepoToken(full_name);
            if (ownerToken) {
                try {
                    const ghRes = await fetch(
                        `https://api.github.com/repos/${full_name}`,
                        {
                            headers: {
                                Authorization: `Bearer ${ownerToken}`,
                                Accept: "application/vnd.github+json",
                            },
                            next: { revalidate: 300 },
                        }
                    );
                    if (ghRes.ok) {
                        const ghData = await ghRes.json();
                        base.description = ghData.description ?? null;
                        base.language = ghData.language ?? null;
                        base.stars = ghData.stargazers_count ?? 0;
                    }
                } catch {
                    // silently ignore
                }
            }

            return base;
        })
    );

    if (repoParam) {
        if (results.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
        return NextResponse.json(results[0]);
    }

    return NextResponse.json(results);
}
