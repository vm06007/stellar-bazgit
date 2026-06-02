#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BAZGIT_URL = process.env.BAZGIT_URL ?? "http://localhost:3000";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? "";

function authHeaders(): Record<string, string> {
    if (!GITHUB_TOKEN) return {};
    return { Authorization: `Bearer ${GITHUB_TOKEN}` };
}

async function apiFetch(path: string, init?: RequestInit) {
    const res = await fetch(`${BAZGIT_URL}${path}`, {
        ...init,
        headers: {
            "Content-Type": "application/json",
            ...authHeaders(),
            ...(init?.headers as Record<string, string> ?? {}),
        },
    });
    const text = await res.text();
    try {
        return { ok: res.ok, status: res.status, data: JSON.parse(text) };
    } catch {
        return { ok: res.ok, status: res.status, data: text };
    }
}

const server = new McpServer({
    name: "stellar-bazgit",
    version: "1.0.0",
});

server.tool(
    "browse_catalog",
    "List all repos available for sale on Stellar Bazgit (paid in XLM or USDC on Stellar)",
    {},
    async () => {
        const { ok, data } = await apiFetch("/api/catalog");
        if (!ok) return { content: [{ type: "text", text: `Error: ${JSON.stringify(data)}` }] };
        const repos = Array.isArray(data) ? data : [];
        const summary = repos.map((r: any) => {
            const rule = r.rules?.[0];
            return `• ${r.full_name} — ${r.description ?? "no description"} | ${r.language ?? "?"} | ${rule?.price ?? "?"} ${rule?.asset ?? "XLM"} | pays: ${r.stellarAddress ?? "none"}`;
        }).join("\n");
        return {
            content: [{
                type: "text",
                text: repos.length === 0
                    ? "No repos listed for sale yet."
                    : `${repos.length} repo(s) for sale:\n\n${summary}`,
            }],
        };
    }
);

server.tool(
    "get_repo",
    "Get details about a specific repo listing on Stellar Bazgit, including its Stellar payment address and x402 gateway",
    { full_name: z.string().describe("owner/repo, e.g. acme/my-project") },
    async ({ full_name }) => {
        const { ok, data } = await apiFetch(`/api/catalog?repo=${encodeURIComponent(full_name)}`);
        if (!ok) return { content: [{ type: "text", text: `Error: ${JSON.stringify(data)}` }] };
        const enriched = {
            ...data,
            native_gateway: `${BAZGIT_URL}/api/access/${full_name}`,
            x402_gateway: `${BAZGIT_URL}/api/x402/${full_name}`,
        };
        return { content: [{ type: "text", text: JSON.stringify(enriched, null, 2) }] };
    }
);

server.tool(
    "list_my_repos",
    "List your GitHub repositories (requires GITHUB_TOKEN)",
    {},
    async () => {
        if (!GITHUB_TOKEN) {
            return { content: [{ type: "text", text: "GITHUB_TOKEN is not set. Add it to your Claude Desktop MCP config." }] };
        }
        const { ok, data } = await apiFetch("/api/repos");
        if (!ok) return { content: [{ type: "text", text: `Error: ${JSON.stringify(data)}` }] };
        const repos = Array.isArray(data) ? data : [];
        const summary = repos.map((r: any) =>
            `• ${r.full_name}${r.private ? " [private]" : ""} — ${r.description ?? "no description"} | ${r.language ?? "?"}`
        ).join("\n");
        return {
            content: [{
                type: "text",
                text: repos.length === 0 ? "No repos found." : `${repos.length} repo(s):\n\n${summary}`,
            }],
        };
    }
);

server.tool(
    "get_my_listings",
    "List repos you have already listed for sale on Stellar Bazgit (requires GITHUB_TOKEN)",
    {},
    async () => {
        if (!GITHUB_TOKEN) {
            return { content: [{ type: "text", text: "GITHUB_TOKEN is not set." }] };
        }
        const { ok, data } = await apiFetch("/api/monetize");
        if (!ok) return { content: [{ type: "text", text: `Error: ${JSON.stringify(data)}` }] };
        const listings = Array.isArray(data) ? data : [];
        if (listings.length === 0) return { content: [{ type: "text", text: "You have no active listings." }] };
        const summary = listings.map((l: any) => {
            const rule = l.rules?.[0];
            return `• ${l.full_name} — ${rule?.price ?? "?"} ${rule?.asset ?? "XLM"} | pays: ${l.stellarAddress ?? "none"}`;
        }).join("\n");
        return { content: [{ type: "text", text: `Your listings:\n\n${summary}` }] };
    }
);

server.tool(
    "monetize_repo",
    "List a GitHub repo for sale on Stellar Bazgit, priced in XLM or USDC (requires GITHUB_TOKEN)",
    {
        full_name: z.string().describe("owner/repo to list, e.g. acme/my-project"),
        price: z.string().describe("Price as a number string, e.g. '10'"),
        asset: z.enum(["XLM", "USDC"]).describe("Payment asset on Stellar"),
        stellar_address: z.string().describe("Your Stellar public key (G…, 56 chars) to receive payments"),
        description: z.string().optional().describe("Listing description (markdown supported)"),
    },
    async ({ full_name, price, asset, stellar_address, description }) => {
        if (!GITHUB_TOKEN) {
            return { content: [{ type: "text", text: "GITHUB_TOKEN is not set." }] };
        }
        const body = {
            full_name,
            mode: "flat",
            rules: [{ path: "*", price, asset }],
            stellarAddress: stellar_address,
            listing: description ? { description } : undefined,
        };
        const { ok, data } = await apiFetch("/api/monetize", {
            method: "POST",
            body: JSON.stringify(body),
        });
        if (!ok) return { content: [{ type: "text", text: `Error: ${JSON.stringify(data)}` }] };
        return {
            content: [{
                type: "text",
                text: `Listed ${full_name} at ${price} ${asset}!\nRepo page: ${BAZGIT_URL}/repo/${full_name}\nNative gateway: ${BAZGIT_URL}/api/access/${full_name}\nx402 gateway: ${BAZGIT_URL}/api/x402/${full_name}`,
            }],
        };
    }
);

server.tool(
    "delist_repo",
    "Remove a repo listing from Stellar Bazgit (requires GITHUB_TOKEN)",
    { full_name: z.string().describe("owner/repo to delist") },
    async ({ full_name }) => {
        if (!GITHUB_TOKEN) {
            return { content: [{ type: "text", text: "GITHUB_TOKEN is not set." }] };
        }
        const { ok, data } = await apiFetch("/api/monetize", {
            method: "DELETE",
            body: JSON.stringify({ full_name }),
        });
        if (!ok) return { content: [{ type: "text", text: `Error: ${JSON.stringify(data)}` }] };
        return { content: [{ type: "text", text: `${full_name} has been delisted.` }] };
    }
);

const transport = new StdioServerTransport();
await server.connect(transport);
