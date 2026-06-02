# 🛒 Stellar Bazgit

**The Stellar-native marketplace for private GitHub repositories.**

Sell access to your private repos. Get paid in **XLM** or **USDC** on the [Stellar](https://stellar.org) network. Buyers pay once, get a time-limited `git clone` URL. AI agents can browse, buy, and list repos autonomously.

> Think of it as a paywall gateway in front of any private GitHub repo — settlement in 2–5 seconds, sub-cent fees, no credit cards, no middlemen holding your money.

### What's in a name?

**Bazgit** = **Baz** (🛒 _basket_ / _bazaar_) + **git**. A bazaar — an open marketplace — for git repositories, where every repo is an item you can drop in the basket and check out with crypto. Pair it with **Stellar**, the network that settles every sale.

The marketplace is staffed by the **🫖 TEE Agent** — your AI shopkeeper. "TEE" is a double play: it's served like a glass of Turkish _çay_ (tea), and it points at the **Trusted Execution Environment** where an agent's keys and signing can be hardware-isolated (see [TEE & Confidential Compute](#tee--confidential-compute)).

---

## Table of Contents

- [What is this?](#what-is-this)
- [The Big Picture](#the-big-picture)
- [How It Works](#how-it-works)
  - [1. Selling a repo](#1-selling-a-repo)
  - [2. Buying a repo](#2-buying-a-repo)
  - [3. The payment gateway (HTTP 402)](#3-the-payment-gateway-http-402)
  - [3b. Two payment paths: native + x402](#3b-two-payment-paths-native--standard-x402)
  - [4. The TEE Agent](#4-the-tee-agent)
  - [5. Platform fees](#5-platform-fees)
  - [6. Reviews & merchant ratings](#6-reviews--merchant-ratings)
- [Architecture](#architecture)
- [TEE & Confidential Compute](#tee--confidential-compute)
- [Tech Stack](#tech-stack)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Security Model](#security-model)

---

## What is this?

GitHub has no native way to **sell** access to a private repository. You either add someone as a collaborator (manual, free) or you don't.

Stellar Bazgit turns any private repo into a **pay-to-clone product**:

| Role | What they do |
|------|--------------|
| **Seller** | Connects GitHub, picks a private repo, sets a price in XLM/USDC, gets a shareable gateway URL |
| **Buyer** | Visits the listing, pays with a Stellar wallet, instantly receives an authenticated `git clone` URL |
| **AI Agent** | Discovers repos via a public API, pays autonomously from its own Stellar wallet, clones the code |

The seller's GitHub token is encrypted at rest. When a buyer pays, the server mints a short-lived clone URL using that token — the buyer never sees the raw credential, and access expires after 1 hour.

---

## The Big Picture

```mermaid
flowchart LR
    subgraph Seller["👤 Seller"]
        GH[GitHub Account]
    end

    subgraph Platform["🛒 Stellar Bazgit"]
        direction TB
        Dash[Dashboard]
        Cat[Public Catalog]
        Gate[Payment Gateway<br/>HTTP 402]
        Vault[(Encrypted<br/>Token Vault)]
    end

    subgraph Stellar["⭐ Stellar Network"]
        Horizon[Horizon API]
    end

    subgraph Buyer["🛒 Buyer / Agent"]
        Wallet[Freighter / Agent Wallet]
    end

    GH -->|OAuth connect| Dash
    Dash -->|list repo + price| Cat
    Dash -.->|store encrypted token| Vault
    Buyer -->|browse| Cat
    Buyer -->|GET access| Gate
    Gate -->|402: pay X XLM to G...| Wallet
    Wallet -->|send payment| Horizon
    Horizon -->|verify tx| Gate
    Gate -->|mint clone URL| Vault
    Vault -->|authenticated git URL| Buyer
```

---

## How It Works

### 1. Selling a repo

A seller authenticates with GitHub (OAuth, scoped to `repo` access), then picks a repository to monetize.

```mermaid
sequenceDiagram
    actor S as Seller
    participant UI as Dashboard
    participant API as /api/monetize
    participant Store as Encrypted Store

    S->>UI: Sign in with GitHub (OAuth)
    UI->>S: List of repos (private + public)
    S->>UI: Pick repo, set price (XLM/USDC),<br/>set Stellar payout address
    UI->>API: POST { full_name, price, asset, stellarAddress }
    API->>API: Validate Stellar address (G..., 56 chars)
    API->>API: Check outstanding platform fees
    API->>Store: Save listing + AES-256-GCM<br/>encrypted GitHub token
    API->>UI: gateway_url
    UI->>S: 🎉 Repo is live in the catalog
```

**Pricing modes:**
- **Flat** — one price unlocks the whole repo
- **Per-file / per-folder** — granular rules, each path priced independently

**Payout options:**
- **Single address** — all payments to one Stellar account
- **Split by contributors** — define shares per GitHub contributor (each with their own Stellar address)

### 2. Buying a repo

The buyer pays directly to the seller's Stellar address using the **Freighter** browser wallet. The whole flow is one button click.

```mermaid
sequenceDiagram
    actor B as Buyer
    participant UI as Repo Page
    participant FR as Freighter Wallet
    participant SRV as Server
    participant H as Stellar Horizon

    B->>UI: Click "Pay with Freighter"
    UI->>FR: Connect & request access
    FR->>B: Approve connection
    UI->>SRV: POST /api/stellar/prepare<br/>{ repo, buyer_address }
    SRV->>H: Load buyer account
    SRV->>UI: Unsigned transaction (XDR)
    UI->>FR: signTransaction(XDR)
    FR->>B: Review payment → approve
    FR->>UI: Signed XDR
    UI->>SRV: POST /api/stellar/submit { signed_xdr }
    SRV->>H: Submit transaction
    H->>SRV: Confirmed ✓
    SRV->>SRV: Verify payment (amount, dest, asset)
    SRV->>SRV: Mint 1-hour access token
    SRV->>UI: { token }
    UI->>SRV: GET /api/access/repo?token=...
    SRV->>UI: git clone URL + tarball URL
    UI->>B: 📦 git clone "https://...@github.com/owner/repo.git"
```

> **Why build the transaction on the server?** The Stellar SDK pulls in Node.js-only modules that don't bundle for the browser. So the server constructs the unsigned transaction; the browser only signs it via Freighter. The buyer's secret key never leaves their wallet.

### 3. The payment gateway (HTTP 402)

The gateway speaks the standard **`402 Payment Required`** status code. Hit any monetized repo's access endpoint without a token, and you get back machine-readable payment instructions — perfect for scripts and agents.

```mermaid
flowchart TD
    Start([GET /api/access/owner/repo]) --> HasToken{Has valid<br/>token?}
    HasToken -->|No| Resp402[402 Payment Required<br/>JSON: stellar_address, amount,<br/>asset, memo, network]
    HasToken -->|Yes| CheckToken{Token valid<br/>& not expired?}
    CheckToken -->|No| Reject[401 Unauthorized]
    CheckToken -->|Yes| Clone[200 OK<br/>clone_url + tarball_url]

    Resp402 -.->|buyer pays on Stellar| Pay[POST /api/pay<br/>tx_hash]
    Pay --> Verify{Payment<br/>verified on<br/>Horizon?}
    Verify -->|No| Fail[402 error]
    Verify -->|Yes| Mint[Mint UUID token<br/>1-hour TTL]
    Mint -.->|use token| Start
```

A real `402` response looks like:

```json
{
  "payment_required": true,
  "full_name": "alice/my-toolkit",
  "stellar_address": "GDCD2H...RB3F",
  "amount": "10.00",
  "asset": "XLM",
  "network": "testnet",
  "memo": "alice/my-toolkit",
  "verify_url": "https://.../api/pay"
}
```

### 3b. Two payment paths: native + standard x402

The gateway above is our **native** flow — simple, works for both XLM and USDC, no external dependencies. Alongside it we expose a **second, standards-compliant path** that speaks the official [Stellar x402](https://developers.stellar.org/docs/build/agentic-payments/x402/quickstart-guide) wire format, so any x402-aware agent in the ecosystem can discover and pay for a repo with zero custom integration.

```mermaid
flowchart TD
    subgraph Listing["📦 One repo listing (one Stellar payout address)"]
        L[alice/my-toolkit · 5 USDC]
    end

    L --> Native["🟢 Native path<br/>/api/access/* + /api/pay<br/>XLM & USDC · our JSON · Horizon-verified"]
    L --> X402["🔵 x402 path<br/>/api/x402/*<br/>USDC · official wire format · Horizon-verified"]

    Native --> UI[Our UI, our TEE Agent,<br/>any custom client]
    X402 --> Agents[Any x402-aware agent<br/>in the Stellar ecosystem]
```

Both doors lead to the same listing and the same payout address. The native path stays the default for the UI (so XLM keeps working and the demo can't break); the x402 path is **purely additive** interoperability.

**How the x402 path works** (`GET /api/x402/{owner}/{repo}`):

```mermaid
sequenceDiagram
    actor A as x402 Agent
    participant GW as /api/x402/*
    participant H as Stellar Horizon

    A->>GW: GET (no payment)
    GW->>A: 402 + { x402Version, accepts: [PaymentRequirements] }
    Note over A: scheme "exact", network "stellar:testnet",<br/>asset, payTo, amount, memo
    A->>A: Build & sign Stellar tx, base64-encode
    A->>GW: GET with X-PAYMENT header
    GW->>H: Submit + verify payment
    H->>GW: Confirmed ✓
    GW->>A: 200 + clone URL<br/>+ X-PAYMENT-RESPONSE header
```

| | Native path | x402 path |
|---|---|---|
| Routes | `/api/access/*`, `/api/pay`, `/api/stellar/*` | `/api/x402/[...path]` |
| Assets | XLM **and** USDC | USDC (XLM also accepted) |
| Wire format | custom JSON | official x402 (`accepts`, `X-PAYMENT`) |
| Types | ours | `@x402/core` (`PaymentRequired`, `PaymentPayload`) |
| Verification | Horizon | Horizon (no external facilitator) |
| Used by | UI, TEE Agent, our clients | any x402-aware agent |

**Design choices that keep it safe:**
- We use the canonical `@x402/core` **types** and base64 header helpers, so the wire shape is the real spec — not an invented one.
- We **verify settlement on Horizon ourselves** rather than depending on a live facilitator, so the path works on testnet standalone and can't be broken by an external outage.
- It's a separate route group — if anything misbehaves, the native flow is untouched and remains the default. Full Soroban-SAC settlement via the official `x402.org` facilitator is a documented drop-in upgrade.

### 4. The TEE Agent

Every page has a floating **TEE Agent** (🫖) panel. It's an LLM with tools that can browse the catalog, list/delist repos, and **purchase repos autonomously** using its own server-side Stellar wallet.

```mermaid
flowchart TD
    User([User chats with TEE Agent]) --> LLM[Claude via OpenRouter/Anthropic]
    LLM --> Decide{Needs a<br/>tool?}
    Decide -->|No| Reply[Plain-text reply]
    Decide -->|Yes| Tools

    subgraph Tools["🛠️ Agent Tools"]
        T1[get_agent_wallet]
        T2[get_catalog]
        T3[purchase_repo]
        T4[monetize_repo]
        T5[delist_repo]
        T6[make_repo_private]
        T7[get_purchases]
        T8[rate_repo]
    end

    T3 -->|sign with agent's<br/>Stellar keypair| AgentWallet[(Agent Wallet<br/>secret key)]
    AgentWallet -->|submit tx| Horizon[Stellar Horizon]
    Horizon -->|clone URL| Reply
    Tools --> LLM
```

The agent wallet is a **real Stellar keypair** generated server-side. Fund it with XLM/USDC and the agent can buy repos on command — no human signature needed.

### 5. Platform fees

Stellar Bazgit charges a **0.5% deferred fee** on seller earnings. The key idea: **fees never touch the buyer's payment** — money goes straight to the seller. The fee is enforced socially at listing time.

```mermaid
flowchart TD
    Sale[Buyer pays seller directly] --> Track[Platform tracks:<br/>earned += amount]
    Track --> Calc["owed = earned × 0.5% − already paid"]
    Calc --> List{Seller tries to<br/>list a NEW repo}
    List --> Check{owed > threshold?<br/>1 XLM / 0.10 USDC}
    Check -->|No| Allow[✅ Listing allowed]
    Check -->|Yes| Block[🚫 Blocked until fee paid]
    Block --> PayFee[Seller clicks<br/>'Pay fee with Freighter']
    PayFee --> Settle[Fee sent to treasury<br/>on Stellar]
    Settle --> Allow
```

| Property | Value |
|----------|-------|
| Fee rate | 0.5% of seller earnings |
| XLM threshold | 1 XLM owed before listings blocked |
| USDC threshold | 0.10 USDC owed before listings blocked |
| Tracked per asset | XLM and USDC accounted separately |
| Collection | One-click Freighter payment to treasury address |

Existing listings keep working — only **new** listings are gated. Fees are paid via the same one-click Freighter flow as purchases.

### 6. Reviews & merchant ratings

Buyers rate repos 1–5 stars. Crucially, **only verified buyers can review** — the server checks the reviewer's Stellar address against on-chain purchase records before accepting a rating. A **merchant's** overall rating is the aggregate of reviews across all the repos they sell.

```mermaid
flowchart TD
    Buy[Buyer pays for repo<br/>payer = Stellar address] --> Rec[(Purchase record)]
    Rec --> Gate{Address has<br/>a purchase?}
    Review[POST /api/reviews<br/>rating + comment] --> Gate
    Gate -->|no| Reject[403 — not a verified buyer]
    Gate -->|yes| Save[(Save review)]
    Save --> RepoR[⭐ Repo rating<br/>avg of its reviews]
    Save --> MerchR[⭐ Merchant rating<br/>avg across all their repos]
    RepoR --> Cat[Shown on catalog cards,<br/>repo page]
    MerchR --> Pub[Shown on publisher profile]
```

Two ways to leave a review:
- **In the UI** — on a repo page, connect Freighter and submit; your address proves you bought it.
- **Via the TEE Agent** — after the agent buys a repo for you, just say *"leave 5 stars"*. The agent calls `rate_repo`, signing the review with the same wallet that made the purchase, and the new rating appears in the catalog.

Ratings surface everywhere: **catalog cards**, the **repo detail page**, and the **publisher profile** (as the merchant's reputation).

---

## Architecture

```mermaid
flowchart TB
    subgraph Client["🖥️ Browser (Next.js App Router)"]
        Pages["Pages: /, /dashboard, /catalog,<br/>/repo/[owner]/[repo], /publisher/[owner]"]
        Comps["Components: BuyButton, MonetizeModal,<br/>AgentPanel, SiteHeader"]
        Freighter["@stellar/freighter-api<br/>(client-side signing only)"]
    end

    subgraph Server["⚙️ Next.js API Routes (server)"]
        Auth["/api/auth — NextAuth GitHub OAuth"]
        Monet["/api/monetize — list/delist"]
        Access["/api/access — native 402 gateway"]
        X402R["/api/x402 — standard x402 gateway"]
        StellarTx["/api/stellar/prepare + submit"]
        Pay["/api/pay — verify payment"]
        Fees["/api/fees — platform fees"]
        Agent["/api/agent/chat + wallet"]
        Repos["/api/repos/* — GitHub proxy"]
    end

    subgraph Libs["📚 lib/"]
        StoreLib["store.ts — listings, purchases,<br/>fees, bids, API keys"]
        Crypto["store-crypto.ts — AES-256-GCM"]
        StellarLib["stellar.ts / stellar-server.ts —<br/>SDK, verification, constants"]
    end

    subgraph External["🌐 External"]
        GitHub["GitHub API"]
        Horizon["Stellar Horizon"]
        LLM["Claude (OpenRouter/Anthropic)"]
        Redis["Upstash Redis (optional)"]
    end

    Pages --> Comps
    Comps --> Freighter
    Comps -->|fetch| Server
    Server --> Libs
    Auth --> GitHub
    Repos --> GitHub
    Access --> Horizon
    X402R --> Horizon
    StellarTx --> Horizon
    Pay --> Horizon
    Fees --> Horizon
    Agent --> LLM
    Agent --> Horizon
    StoreLib --> Redis
    StoreLib --> Crypto
```

**State persistence:** File-based JSON in `.data/` (dev) with optional Upstash Redis mirror (production). No SQL database required.

---

## TEE & Confidential Compute

The agent is called the **🫖 TEE Agent** for a reason. A **Trusted Execution Environment** is a hardware-isolated enclave where code runs and keys live such that *even the machine's operator cannot read them*. The CPU can produce a signed **attestation** proving exactly which code is running over which secrets.

Stellar itself has **no native TEE** — it's a settlement and DEX layer, not a confidential-compute platform. So the TEE lives on the **operator side**, around the secrets this app must hold:

```mermaid
flowchart LR
    subgraph Host["⚙️ App Server (untrusted)"]
        App[Next.js API routes]
    end

    subgraph TEE["🔒 Trusted Execution Environment"]
        direction TB
        K1[GitHub token<br/>encryption key]
        K2[Agent Stellar<br/>secret key]
        Sign[Sign / decrypt<br/>inside enclave]
    end

    App -->|"encrypt(token) / sign(xdr)"| Sign
    Sign -->|ciphertext / signed tx only| App
    TEE -->|remote attestation| Verifier[Anyone can verify<br/>the agent's code + keys]
```

**What we'd protect:**

| Secret | Today | With a TEE |
|--------|-------|------------|
| `TOKEN_ENCRYPTION_KEY` (decrypts GitHub tokens) | env var on the server | sealed in the enclave; host can't read it |
| Agent's Stellar secret key | `.data/agent-wallet.json` | generated & signs **only** inside the enclave |
| Treasury signing | manual | attested, autonomous payouts |

**The pitch:** a TEE Agent can prove — via remote attestation — that the Stellar account it controls is operated *only* by audited code, with a key no human can exfiltrate. That's a genuinely trustless autonomous buyer/seller.

**Implementation options (provider-agnostic):**

- **AWS Nitro Enclaves** — what the original EVM prototype used. KMS-sealed key, PCR0 attestation, vsock channel between host and enclave. Cloud-centralized but battle-tested.
- **Phala Network / Dstack** — decentralized TEE compute (Intel TDX/SGX) purpose-built for hosting AI agents and crypto key custody, with on-chain attestation. The most natural "Web3 TEE agent" fit.
- **Marlin Oyster** — decentralized TEE coprocessor for serverless confidential workloads.
- **Intel TDX / SGX directly** — roll your own enclave if you control the hardware.

**Stellar-native angle:** while Stellar has no enclave primitive, a Soroban contract _could_ gate actions on a published TEE attestation hash — so the on-chain treasury only honours payouts from the attested agent identity. That ties the off-chain TEE guarantee to on-chain enforcement.

> Status: the current build keeps keys in env/`.data` (standard for a hackathon). The architecture is deliberately shaped so the encrypt/sign operations are the *only* things touching secrets — making them a clean drop-in for any of the enclaves above.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19, Tailwind CSS v4 |
| Auth | NextAuth v4 + GitHub OAuth |
| Blockchain | Stellar (`@stellar/stellar-sdk`) |
| Agentic payments | x402 standard (`@x402/core`, `@x402/stellar`) |
| Wallet | Freighter (`@stellar/freighter-api`) |
| Payments | XLM + USDC on Stellar, verified via Horizon |
| Token encryption | AES-256-GCM (Node `crypto`) |
| AI Agent | Claude via OpenRouter / Anthropic API |
| Storage | File JSON + optional Upstash Redis |
| Runtime | Bun |

---

## API Reference

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/auth/[...nextauth]` | GET/POST | — | GitHub OAuth |
| `/api/repos` | GET | Session/PAT | List user's GitHub repos |
| `/api/repos/tree` | GET | Session | File tree for granular pricing |
| `/api/repos/readme` | GET | Session | Fetch README for listing |
| `/api/repos/contributors` | GET | Session | Contributors for payout splits |
| `/api/repos/make-private` | POST | Session | Convert public → private |
| `/api/monetize` | GET/POST/DELETE | Session/PAT/Key | Manage listings (fee-gated) |
| `/api/catalog` | GET | Public | Browse all listed repos |
| `/api/access/[...path]` | GET/POST | Token | **402 payment gateway** |
| `/api/stellar/prepare` | POST | Public | Build unsigned purchase tx |
| `/api/stellar/submit` | POST | Public | Submit signed tx, mint token |
| `/api/pay` | POST | Public | Verify a tx hash, mint token |
| `/api/x402/[...path]` | GET | Public | **Standards-compliant x402 gateway** (402 + `X-PAYMENT`) |
| `/api/purchases` | GET | Public | Purchase history per repo |
| `/api/reviews` | GET/POST | Public | Verified-purchase reviews + ratings |
| `/api/bids` | GET/POST/PATCH | Mixed | Make/manage offers |
| `/api/fees` | GET/POST | Session | Fee summary + pay fee |
| `/api/fees/prepare` | POST | Session | Build unsigned fee tx |
| `/api/keys` | GET/POST/DELETE | Session | API keys (`sbz_...`) for agents |
| `/api/agent/chat` | POST | Public | TEE Agent conversation loop |
| `/api/agent/wallet` | GET/POST/DELETE | Public | Agent Stellar wallet |
| `/api/listing/generate` | POST | Session | AI-generated listing copy |

---

## Project Structure

```
stellar-bazgit-hack/
├── app/
│   ├── page.tsx                    # Landing / sign-in
│   ├── dashboard/page.tsx          # Seller dashboard (+ fees, API keys, bids)
│   ├── catalog/page.tsx            # Public catalog browser
│   ├── repo/[owner]/[repo]/        # Repo detail + buy flow
│   ├── publisher/[owner]/          # Seller profile + their repos
│   ├── components/
│   │   ├── BuyButton.tsx           # Freighter purchase flow
│   │   ├── MonetizeModal.tsx       # List/edit a repo
│   │   ├── AgentPanel.tsx          # TEE Agent chat sidebar + FAB
│   │   ├── AgentWalletWidget.tsx   # Agent wallet status
│   │   └── SiteHeader.tsx          # Shared header
│   └── api/                        # All API routes (see table above)
├── lib/
│   ├── auth.ts                     # NextAuth config
│   ├── store.ts                    # State: listings, purchases, fees, bids
│   ├── store-crypto.ts             # AES-256-GCM token encryption
│   ├── stellar.ts                  # Client-safe Stellar helpers + verification
│   ├── stellar-server.ts           # Server-only SDK re-exports
│   └── x402.ts                     # x402 wire-format helpers (@x402/core types)
├── mcp/
│   └── server.ts                   # MCP server for Claude Desktop (stdio)
└── .data/                          # JSON persistence (gitignored)
```

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh)
- A [GitHub OAuth App](https://github.com/settings/developers)
- A Stellar account (testnet works — fund it at [friendbot](https://friendbot.stellar.org))
- The [Freighter](https://www.freighter.app) browser extension

### Setup

```bash
# Install dependencies
bun install

# Configure environment
cp .env.local.example .env.local
# Fill in the values below
```

### Environment variables

```bash
# NextAuth — openssl rand -hex 32
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000

# GitHub OAuth App
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...

# AES-256-GCM key for GitHub token encryption — openssl rand -hex 32
TOKEN_ENCRYPTION_KEY=...

# Stellar network: "testnet" or "mainnet"
STELLAR_NETWORK=testnet
NEXT_PUBLIC_STELLAR_NETWORK=testnet

# Treasury address that collects platform fees
STELLAR_TREASURY_ADDRESS=G...

# AI agent (one of these)
OPENROUTER_API_KEY=...          # or ANTHROPIC_API_KEY

# Optional: persistent storage
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
```

### Run

```bash
bun run dev      # http://localhost:3000
bun run build    # production build
bun run start    # serve production build
```

---

## Deploying to Production

See `.env.production.example` for the full template. Production differs from dev in three important ways:

**1. A separate GitHub OAuth App.** Create a *new* app (don't reuse the dev one) at [github.com/settings/developers](https://github.com/settings/developers):

| Field | Value |
|-------|-------|
| Homepage URL | `https://your-domain.com` |
| Authorization callback URL | `https://your-domain.com/api/auth/callback/github` |

Then *Generate a new client secret* and set `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`.

**2. Fresh secrets** (never reuse dev values):

```bash
openssl rand -base64 32   # → NEXTAUTH_SECRET
openssl rand -hex 32      # → TOKEN_ENCRYPTION_KEY  (64 hex chars)
```

`NEXTAUTH_URL` must be the exact public URL (`https://your-domain.com`). Changing `TOKEN_ENCRYPTION_KEY` later makes already-stored GitHub tokens unreadable.

**3. Redis is required.** Serverless filesystems are ephemeral, so the `.data/*.json` fallback won't persist between requests. Create a free [Upstash](https://console.upstash.com) database and set `KV_REST_API_URL` + `KV_REST_API_TOKEN`. All state (listings, purchases, reviews, fees, API keys, agent wallet) then lives in Redis.

Set `STELLAR_NETWORK` / `NEXT_PUBLIC_STELLAR_NETWORK` to `mainnet` for real payments, and point `STELLAR_TREASURY_ADDRESS` at your fee-collection account. The full production checklist lives in `.env.production.example`.

---

## Security Model

```mermaid
flowchart LR
    Token[GitHub OAuth Token] -->|AES-256-GCM| Enc[Encrypted at rest<br/>iv:tag:ciphertext]
    Enc --> Store[(.data / Redis)]
    Store -->|decrypt on demand| Mint[Mint clone URL]
    Mint --> TTL[1-hour expiry]
    TTL --> Gone[Token auto-expires]
```

- **GitHub tokens** are encrypted with AES-256-GCM before storage; the key lives only in `TOKEN_ENCRYPTION_KEY`.
- **Clone URLs** embed the token but expire after 1 hour — buyers clone once, then the link dies.
- **Buyer keys never leave Freighter** — the server only ever handles unsigned and signed XDR, never secret keys.
- **Payments are verified on-chain** — the server checks the actual Horizon transaction (destination, amount, asset) before granting access. No trust in client claims.
- **Agent wallet** secret key is stored server-side; fund it only with what you're willing to let the agent spend.

---

<div align="center">

**Built on ⭐ Stellar** · 2–5s settlement · sub-cent fees · powered by the 🫖 TEE Agent

</div>
