import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getAccessToken } from "@/lib/getAccessToken";

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Prefer Anthropic if configured, otherwise fall back to OpenRouter
    // (same key the TEE Agent uses) — so one key powers everything.
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    if (!anthropicKey && !openrouterKey) {
        return NextResponse.json({ error: "No AI key configured (set OPENROUTER_API_KEY or ANTHROPIC_API_KEY)" }, { status: 503 });
    }

    const { full_name } = await req.json();
    if (!full_name) return NextResponse.json({ error: "Missing full_name" }, { status: 400 });

    const accessToken = await getAccessToken(req);

    let readme = "";
    if (accessToken) {
        try {
            const res = await fetch(`https://api.github.com/repos/${full_name}/readme`, {
                headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github.raw+json" },
            });
            if (res.ok) readme = (await res.text()).slice(0, 3000);
        } catch { /* ignore */ }
    }

    const prompt = readme
        ? `Write a concise, appealing marketplace listing description for the GitHub repository "${full_name}". Use the README below as context. Max 3 paragraphs, Markdown supported. Focus on what makes it valuable to buyers.\n\nREADME:\n${readme}`
        : `Write a concise, appealing marketplace listing description for the GitHub repository "${full_name}". Max 3 paragraphs, Markdown supported. Focus on what makes it valuable to buyers.`;

    try {
        let description = "";

        if (anthropicKey) {
            const res = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": anthropicKey,
                    "anthropic-version": "2023-06-01",
                },
                body: JSON.stringify({
                    model: "claude-haiku-4-5-20251001",
                    max_tokens: 512,
                    messages: [{ role: "user", content: prompt }],
                }),
            });
            if (!res.ok) {
                const err = await res.text();
                return NextResponse.json({ error: `AI generation failed: ${err.slice(0, 150)}` }, { status: 500 });
            }
            const data = await res.json();
            description = data.content?.[0]?.text ?? "";
        } else {
            const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${openrouterKey}`,
                    "Content-Type": "application/json",
                    "X-Title": "Stellar Bazgit",
                },
                body: JSON.stringify({
                    model: "anthropic/claude-3.5-haiku",
                    max_tokens: 512,
                    messages: [{ role: "user", content: prompt }],
                }),
            });
            if (!res.ok) {
                const err = await res.text();
                return NextResponse.json({ error: `AI generation failed: ${err.slice(0, 150)}` }, { status: 500 });
            }
            const data = await res.json();
            description = data.choices?.[0]?.message?.content ?? "";
        }

        return NextResponse.json({ description });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message ?? "AI generation failed" }, { status: 500 });
    }
}
