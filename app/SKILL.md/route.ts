import { NextRequest } from "next/server";
import { STELLAR_NETWORK, USDC_ISSUER, HORIZON_URL, NETWORK_PASSPHRASE } from "@/lib/stellar";

export async function GET(req: NextRequest) {
    const origin = req.nextUrl.origin;
    const body = buildSkillMarkdown(origin);
    return new Response(body, {
        headers: {
            "Content-Type": "text/markdown; charset=utf-8",
            "Cache-Control": "public, max-age=300",
            "Access-Control-Allow-Origin": "*",
        },
    });
}

function buildSkillMarkdown(api: string): string {
    return `# Stellar Bazgit Agent Skill

Stellar Bazgit is a marketplace for private GitHub repositories, settled on the **Stellar** network. Agents can discover, buy, list, and review repos with no browser and no human checkout. Buying needs only a Stellar wallet; selling needs only a GitHub token — no Stellar Bazgit account.

Network: **${STELLAR_NETWORK}** · Horizon: \`${HORIZON_URL}\`

---

## Quick Reference

| Action | Endpoint |
|--------|----------|
| Browse catalog | \`GET ${api}/api/catalog\` |
| Filter by seller | \`GET ${api}/api/catalog?owner={login}\` |
| Single repo | \`GET ${api}/api/catalog?repo={owner}/{repo}\` |
| x402 gateway (discover + pay) | \`GET ${api}/api/x402/{owner}/{repo}\` |
| Native gateway (402 details) | \`GET ${api}/api/access/{owner}/{repo}\` |
| Verify native payment | \`POST ${api}/api/pay\` |
| Clone URL (with token) | \`GET ${api}/api/access/{owner}/{repo}?token=...\` |
| List a repo | \`POST ${api}/api/monetize\` |
| Your listings | \`GET ${api}/api/monetize\` |
| Remove listing | \`DELETE ${api}/api/monetize\` |
| Leave a review | \`POST ${api}/api/reviews\` |
| Purchase history | \`GET ${api}/api/purchases?repo={owner}/{repo}\` |

---

## Flow — Buy a repository (x402, recommended for agents)

The x402 gateway speaks the official Stellar x402 wire format.

### 1. Discover payment requirements

\`\`\`http
GET ${api}/api/x402/owner/repo
\`\`\`

Response: **402** with a spec body:

\`\`\`json
{
  "x402Version": 1,
  "accepts": [{
    "scheme": "exact",
    "network": "${STELLAR_NETWORK === "mainnet" ? "stellar:pubnet" : "stellar:testnet"}",
    "asset": "USDC:${USDC_ISSUER}",   // or "native" for XLM
    "amount": "10.00",
    "payTo": "GSELLER...ADDRESS",
    "maxTimeoutSeconds": 300,
    "extra": { "memo": "owner/repo", "memoType": "text" }
  }]
}
\`\`\`

### 2. Build, sign & base64-encode a Stellar payment

Use \`@stellar/stellar-sdk\`. Network passphrase: \`${NETWORK_PASSPHRASE}\`.
Send \`amount\` of the \`asset\` to \`payTo\`. Encode the signed tx as
\`base64(JSON.stringify({ transaction: signedXDR }))\`.

### 3. Retry with the X-PAYMENT header

\`\`\`http
GET ${api}/api/x402/owner/repo
X-PAYMENT: <base64 payload>
\`\`\`

Response: **200** with \`clone_url\`, \`tarball_url\`, \`transaction\` and an
\`X-PAYMENT-RESPONSE\` header.

---

## Flow — Buy a repository (native, XLM or USDC)

1. \`GET ${api}/api/access/owner/repo\` → **402** with \`stellar_address\`, \`amount\`, \`asset\`, \`memo\`.
2. Send the payment on Stellar (any wallet/SDK) with the given memo.
3. \`POST ${api}/api/pay\` with \`{ "full_name": "owner/repo", "tx_hash": "<hash>" }\` → \`{ token }\`.
4. \`GET ${api}/api/access/owner/repo?token=<token>\` → \`{ clone_url }\` (valid ~1 hour).

---

## Flow — Sell a repository

No Stellar Bazgit account required — a GitHub token is enough.

\`\`\`http
POST ${api}/api/monetize
Authorization: Bearer ghp_yourGitHubToken
Content-Type: application/json

{
  "full_name": "you/private-repo",
  "rules": [{ "path": "*", "price": "10", "asset": "XLM" }],
  "mode": "flat",
  "stellarAddress": "GYOUR_STELLAR_ADDRESS"
}
\`\`\`

Response: \`{ "success": true, "gateway_url": "/api/access/you/private-repo" }\`.
Use \`"asset": "USDC"\` to price in USDC instead of XLM.

---

## Flow — Review a repository (verified buyers only)

\`\`\`http
POST ${api}/api/reviews
Content-Type: application/json

{ "full_name": "owner/repo", "reviewer": "GYOUR_STELLAR_ADDRESS", "rating": 5, "comment": "great repo" }
\`\`\`

The \`reviewer\` address must have an on-chain purchase of the repo, or the review is rejected (403).

---

## Networks & assets

| Network | Passphrase | USDC issuer |
|---------|------------|-------------|
| testnet | \`Test SDF Network ; September 2015\` | \`GBBD47IF6LWK7P7MLAEGMLNB2BKVEN94I5OOZF3LQR5ALPZDVKFAVAR\` |
| mainnet | \`Public Global Stellar Network ; September 2015\` | \`GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN\` |

XLM uses the native asset (no issuer).

---

## Base URLs

- App & API: ${api}
- Human UI (bazaar): ${api}/bazaar
- This skill file: ${api}/SKILL.md

Install for Claude Code / agents:

\`\`\`bash
curl ${api}/SKILL.md
\`\`\`

Use with Claude Desktop via MCP — see \`mcp/server.ts\` in the repo
(tools: browse_catalog, get_repo, list_my_repos, get_my_listings, monetize_repo, delist_repo).
`;
}
