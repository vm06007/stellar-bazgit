import { NextRequest, NextResponse } from "next/server";
import { initStore, getRepoToken } from "@/lib/store";
import { HORIZON_URL, NETWORK_PASSPHRASE, USDC_ISSUER, STELLAR_NETWORK } from "@/lib/stellar-server";
import { Keypair, Horizon, TransactionBuilder, Asset, Operation, Memo, BASE_FEE } from "@stellar/stellar-sdk";
import fs from "fs";
import path from "path";
import { Redis } from "@upstash/redis";

const WALLET_FILE = path.join(process.cwd(), ".data", "agent-wallet.json");
const RK_WALLET = "stellar-bazgit:agent-wallet";

function getRedis(): Redis | null {
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;
    if (url && token) return new Redis({ url, token });
    return null;
}

async function getAgentWallet(): Promise<{ secretKey: string } | null> {
    const redis = getRedis();
    if (redis) {
        try { const val = await redis.get<{ secretKey: string }>(RK_WALLET); if (val) return val; } catch {}
    }
    try {
        if (fs.existsSync(WALLET_FILE)) return JSON.parse(fs.readFileSync(WALLET_FILE, "utf8"));
    } catch {}
    return null;
}

const TOOLS = [
    {
        type: "function",
        function: {
            name: "get_agent_wallet",
            description: "Get the agent's Stellar wallet address, XLM and USDC balances. Call when user asks about wallet, balance, or whether agent can purchase.",
            parameters: { type: "object", properties: {}, required: [] },
        },
    },
    {
        type: "function",
        function: {
            name: "purchase_repo",
            description: "Purchase a repo from the Stellar Bazgit catalog using the agent's Stellar wallet. Confirm with user first. Verify the wallet has enough XLM or USDC.",
            parameters: {
                type: "object",
                properties: {
                    full_name: { type: "string", description: "owner/repo to purchase, e.g. alice/my-toolkit" },
                },
                required: ["full_name"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "monetize_repo",
            description: "List a private GitHub repo for sale at an XLM or USDC price on Stellar.",
            parameters: {
                type: "object",
                properties: {
                    full_name: { type: "string", description: "owner/repo" },
                    price: { type: "string", description: "price as a number string, e.g. '10'" },
                    asset: { type: "string", description: "'XLM' or 'USDC'" },
                    stellar_address: { type: "string", description: "G... Stellar public key to receive payments" },
                },
                required: ["full_name", "price", "asset", "stellar_address"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "delist_repo",
            description: "Remove a repo listing from the Stellar Bazgit catalog.",
            parameters: {
                type: "object",
                properties: { full_name: { type: "string" } },
                required: ["full_name"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "make_repo_private",
            description: "Convert a public GitHub repo to private so it can be listed for sale.",
            parameters: {
                type: "object",
                properties: { full_name: { type: "string" } },
                required: ["full_name"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "get_purchases",
            description: "Get past purchases made through Stellar Bazgit.",
            parameters: {
                type: "object",
                properties: { full_name: { type: "string", description: "optional owner/repo filter" } },
                required: [],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "get_catalog",
            description: "Browse the public catalog of repos for sale on Stellar Bazgit.",
            parameters: {
                type: "object",
                properties: { search: { type: "string", description: "optional search term" } },
                required: [],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "rate_repo",
            description: "Leave a star rating and optional review for a repo the agent has purchased. Only works for repos bought with the agent's own Stellar wallet (verified purchase). Use when the user asks to rate, review, or leave stars on a repo.",
            parameters: {
                type: "object",
                properties: {
                    full_name: { type: "string", description: "owner/repo to rate, e.g. alice/my-toolkit" },
                    rating: { type: "number", description: "star rating from 1 to 5" },
                    comment: { type: "string", description: "optional short review text" },
                },
                required: ["full_name", "rating"],
            },
        },
    },
];

async function executeTool(
    name: string,
    args: Record<string, string>,
    baseUrl: string,
    cookie: string,
): Promise<string> {
    const explorerBase = STELLAR_NETWORK === "mainnet"
        ? "https://stellar.expert/explorer/public/tx"
        : "https://stellar.expert/explorer/testnet/tx";

    try {
        if (name === "get_agent_wallet") {
            const res = await fetch(`${baseUrl}/api/agent/wallet`);
            const data = await res.json();
            if (!data.exists) return "No agent wallet configured. The user can generate one from the agent panel.";
            return `Agent Stellar wallet: ${data.publicKey}\nNetwork: ${data.network}\nXLM: ${data.xlm}\nUSDC: ${data.usdc}`;
        }

        if (name === "purchase_repo") {
            const { full_name } = args;
            const stored = await getAgentWallet();
            if (!stored) return "No agent wallet configured. Ask the user to generate one from the agent panel.";

            const keypair = Keypair.fromSecret(stored.secretKey);
            const publicKey = keypair.publicKey();

            // Get payment details from gateway
            const gatewayRes = await fetch(`${baseUrl}/api/access/${full_name}`);
            if (gatewayRes.status !== 402) return `Unexpected gateway response for ${full_name}`;
            const gateway = await gatewayRes.json();

            // Build transaction
            const server = new Horizon.Server(HORIZON_URL);
            let account;
            try { account = await server.loadAccount(publicKey); }
            catch { return `Agent wallet ${publicKey.slice(0, 8)}… has not been activated on Stellar. Fund it with at least 1 XLM first.`; }

            const paymentAsset = gateway.asset === "XLM"
                ? Asset.native()
                : new Asset("USDC", USDC_ISSUER);

            const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
                .addOperation(Operation.payment({ destination: gateway.stellar_address, asset: paymentAsset, amount: gateway.amount }))
                .addMemo(Memo.text(full_name.slice(0, 28)))
                .setTimeout(300)
                .build();

            tx.sign(keypair);
            const txHash = tx.hash().toString("hex");

            let submitted = false;
            try {
                await server.submitTransaction(tx);
                submitted = true;
            } catch (e: any) {
                const codes = e?.response?.data?.extras?.result_codes;
                return `Transaction failed: ${codes?.operations?.[0] ?? codes?.transaction ?? e?.message ?? "unknown error"}`;
            }

            if (!submitted) return "Transaction submission failed.";

            // Verify and get access token
            const payRes = await fetch(`${baseUrl}/api/pay`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ full_name, tx_hash: txHash }),
            });
            const payData = await payRes.json().catch(() => ({}));
            if (!payRes.ok) return `Payment verified on-chain but server verification failed: ${payData.error ?? "unknown"}`;

            await initStore();
            const githubToken = getRepoToken(full_name);
            const cloneUrl = githubToken
                ? `GIT_TERMINAL_PROMPT=0 git clone "https://${githubToken}@github.com/${full_name}.git"`
                : `git clone "${baseUrl}/api/access/${full_name}?token=${payData.token}"`;

            return [
                `Purchased ${full_name}!`,
                `Transaction: ${explorerBase}/${txHash}`,
                cloneUrl,
                `Token expires in ~1 hour.`,
            ].join("\n");
        }

        if (name === "monetize_repo") {
            const { full_name, price, asset = "XLM", stellar_address } = args;
            const res = await fetch(`${baseUrl}/api/monetize`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Cookie: cookie },
                body: JSON.stringify({
                    full_name,
                    mode: "flat",
                    rules: [{ path: "*", price, asset }],
                    stellarAddress: stellar_address,
                }),
            });
            const data = await res.json();
            if (!res.ok) return `Error: ${data.error ?? res.statusText}`;
            return `Listed ${full_name} at ${price} ${asset}.\nPublic page: ${baseUrl}/repo/${full_name}\nGateway: ${baseUrl}/api/access/${full_name}`;
        }

        if (name === "delist_repo") {
            const { full_name } = args;
            const res = await fetch(`${baseUrl}/api/monetize`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json", Cookie: cookie },
                body: JSON.stringify({ full_name }),
            });
            if (!res.ok) { const d = await res.json().catch(() => ({})); return `Error: ${d.error ?? res.statusText}`; }
            return `Removed listing for ${full_name}.`;
        }

        if (name === "make_repo_private") {
            const { full_name } = args;
            const res = await fetch(`${baseUrl}/api/repos/make-private`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Cookie: cookie },
                body: JSON.stringify({ full_name }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) return `Error: ${data.error ?? res.statusText}`;
            return `${full_name} is now private and ready to be listed.`;
        }

        if (name === "get_purchases") {
            const url = new URL(`${baseUrl}/api/purchases`);
            if (args.full_name) url.searchParams.set("repo", args.full_name);
            const res = await fetch(url.toString(), { headers: { Cookie: cookie } });
            const data = await res.json();
            const items: any[] = Array.isArray(data) ? data : [];
            if (!items.length) return "No purchases found.";
            return items.slice(0, 10).map((p: any) => {
                const short = p.transaction ? `${p.transaction.slice(0, 8)}…${p.transaction.slice(-6)}` : null;
                return `${p.full_name} — ${p.amount} ${p.asset} — ${new Date(p.paid_at).toLocaleString()}\n${short ? `${explorerBase}/${p.transaction}` : "no tx hash"}`;
            }).join("\n\n");
        }

        if (name === "get_catalog") {
            const res = await fetch(`${baseUrl}/api/catalog`);
            const data = await res.json();
            const items = Array.isArray(data) ? data : [];
            if (!items.length) return "No repos found in catalog.";
            return items.slice(0, 8).map((r: any) => {
                const price = r.rules?.[0]?.price ?? "?";
                const asset = r.rules?.[0]?.asset ?? "XLM";
                const stars = r.rating?.count ? ` — ★${r.rating.avg} (${r.rating.count})` : "";
                return `- ${r.full_name}: ${price} ${asset}${stars} — ${baseUrl}/repo/${r.full_name}`;
            }).join("\n");
        }

        if (name === "rate_repo") {
            const { full_name, rating, comment } = args as any;
            const stored = await getAgentWallet();
            if (!stored) return "No agent wallet configured, so the agent hasn't purchased anything to review.";
            const reviewer = Keypair.fromSecret(stored.secretKey).publicKey();

            const res = await fetch(`${baseUrl}/api/reviews`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ full_name, reviewer, rating, comment: comment ?? "" }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) return `Could not rate ${full_name}: ${data.error ?? res.statusText}`;
            return `Left a ${data.review?.rating ?? rating}-star review on ${full_name}. New average: ${data.rating?.avg} from ${data.rating?.count} review(s). See ${baseUrl}/repo/${full_name}`;
        }

        return `Unknown tool: ${name}`;
    } catch (e: any) {
        return `Tool error: ${e?.message ?? "unknown"}`;
    }
}

export async function POST(req: NextRequest) {
    await initStore();
    const { messages, context } = await req.json();
    const cookie = req.headers.get("cookie") ?? "";
    const baseUrl = req.nextUrl.origin;

    const systemPrompt = `You are TEE Agent — the AI assistant for Stellar Bazgit — a marketplace for private GitHub repos paid with XLM or USDC on the Stellar blockchain.

User's repos:
${context?.repos?.map((r: any) => `- ${r.full_name} (${r.private ? "private" : "public"})`).join("\n") ?? "none"}

Active listings:
${context?.listings?.length
    ? context.listings.map((l: any) => `- ${l.full_name}: ${l.rules?.[0]?.price ?? "?"} ${l.rules?.[0]?.asset ?? "XLM"} — public page: ${baseUrl}/repo/${l.full_name}`).join("\n")
    : "none"}

URL patterns:
- Public listing page: ${baseUrl}/repo/{owner}/{repo}
- Payment gateway: ${baseUrl}/api/access/{owner}/{repo}

Rules:
- Only private repos can be listed. If the user wants to list a public repo, call make_repo_private first (confirm before doing so), then monetize_repo.
- Always confirm the exact repo, price, asset, and Stellar address with the user BEFORE calling monetize_repo.
- After a successful listing, share the public page URL.
- For purchases: confirm first, then call purchase_repo. If the wallet lacks funds, tell the user to send XLM or USDC to the wallet address.
- Stellar payments settle in 2-5 seconds with sub-cent fees.
- To rate or review a repo the agent bought, call rate_repo with a 1-5 rating (only works for repos purchased with the agent wallet).
- Be concise. No markdown formatting (no backticks, bold, or bullet dashes). Plain text only.
- When tool results contain URLs, output them as bare URLs so they become clickable links.`;

    const apiKey = process.env.ANTHROPIC_API_KEY ?? process.env.OPENROUTER_API_KEY;
    const useOpenRouter = !process.env.ANTHROPIC_API_KEY && !!process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
        return NextResponse.json({ reply: "No AI API key configured. Set ANTHROPIC_API_KEY or OPENROUTER_API_KEY." });
    }

    const llmMessages: any[] = [
        { role: "user", content: systemPrompt + "\n\n(System context above. Now respond to the user.)" },
        { role: "assistant", content: "Understood. Ready to help." },
        ...messages.filter((m: any) => m.role !== "system"),
    ];

    const endpoint = useOpenRouter
        ? "https://openrouter.ai/api/v1/chat/completions"
        : "https://api.anthropic.com/v1/messages";

    for (let i = 0; i < 5; i++) {
        let res: Response;
        if (useOpenRouter) {
            res = await fetch(endpoint, {
                method: "POST",
                headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Title": "Stellar Bazgit Agent" },
                body: JSON.stringify({ model: "anthropic/claude-sonnet-4-5", messages: llmMessages, tools: TOOLS, tool_choice: "auto", max_tokens: 1024 }),
            });
        } else {
            // Anthropic native API
            const [systemMsg, ...rest] = llmMessages;
            res = await fetch(endpoint, {
                method: "POST",
                headers: { "x-api-key": apiKey, "Content-Type": "application/json", "anthropic-version": "2023-06-01" },
                body: JSON.stringify({
                    model: "claude-sonnet-4-6",
                    system: systemMsg.content,
                    messages: rest,
                    tools: TOOLS.map(t => ({ name: t.function.name, description: t.function.description, input_schema: t.function.parameters })),
                    max_tokens: 1024,
                }),
            });
        }

        if (!res.ok) {
            const err = await res.text();
            return NextResponse.json({ reply: `AI error: ${err.slice(0, 200)}` });
        }

        const data = await res.json();

        if (useOpenRouter) {
            const msg = data.choices?.[0]?.message;
            if (!msg?.tool_calls?.length) return NextResponse.json({ reply: msg?.content ?? "No response." });
            llmMessages.push(msg);
            for (const tc of msg.tool_calls) {
                let args: Record<string, string> = {};
                try { args = JSON.parse(tc.function.arguments ?? "{}"); } catch { /**/ }
                const result = await executeTool(tc.function.name, args, baseUrl, cookie);
                llmMessages.push({ role: "tool", tool_call_id: tc.id, content: result });
            }
        } else {
            // Anthropic
            const stopReason = data.stop_reason;
            if (stopReason !== "tool_use") {
                const text = data.content?.find((b: any) => b.type === "text")?.text ?? "No response.";
                return NextResponse.json({ reply: text });
            }
            const toolUses = data.content?.filter((b: any) => b.type === "tool_use") ?? [];
            llmMessages.push({ role: "assistant", content: data.content });
            const toolResults: any[] = [];
            for (const tu of toolUses) {
                const result = await executeTool(tu.name, tu.input ?? {}, baseUrl, cookie);
                toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: result });
            }
            llmMessages.push({ role: "user", content: toolResults });
        }
    }

    return NextResponse.json({ reply: "Could not complete the request after multiple steps." });
}
