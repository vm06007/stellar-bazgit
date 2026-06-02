import { NextRequest, NextResponse } from "next/server";
import { getRepos, initStore } from "@/lib/store";

export async function GET(req: NextRequest) {
    await initStore();
    const repos = getRepos();
    const repoParam = req.nextUrl.searchParams.get("repo");
    const ownerParam = req.nextUrl.searchParams.get("owner");

    const entries = Object.entries(repos)
        .filter(([full_name]) => {
            if (repoParam && full_name !== repoParam) return false;
            if (ownerParam && !full_name.startsWith(ownerParam + "/")) return false;
            return true;
        })
        .map(([full_name, v]) => ({
            full_name,
            rules: v.rules,
            mode: v.mode,
            stellarAddress: v.stellarAddress,
            listing: v.listing,
        }));

    const enriched = await Promise.all(
        entries.map(async (entry) => {
            try {
                const res = await fetch(
                    `https://api.github.com/repos/${entry.full_name}`,
                    { headers: { Accept: "application/vnd.github+json" } }
                );
                if (!res.ok) return entry;
                const gh = await res.json();
                return {
                    ...entry,
                    description: gh.description,
                    language: gh.language,
                    stars: gh.stargazers_count,
                    pushed_at: gh.pushed_at,
                    topics: gh.topics ?? [],
                };
            } catch {
                return entry;
            }
        })
    );

    return NextResponse.json(enriched);
}
