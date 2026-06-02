# 🫖 Stellar Bazgit

**The Stellar-native marketplace for private GitHub repositories.**

Sell access to your private repos. Get paid in **XLM** or **USDC** on the [Stellar](https://stellar.org) network. Buyers pay once, get a time-limited `git clone` URL. AI agents can browse, buy, and list repos autonomously.

> Think of it as a paywall gateway in front of any private GitHub repo — settlement in 2–5 seconds, sub-cent fees, no credit cards, no middlemen holding your money.

---

## Table of Contents

- [What is this?](#what-is-this)
- [The Big Picture](#the-big-picture)
- [How It Works](#how-it-works)
  - [1. Selling a repo](#1-selling-a-repo)
  - [2. Buying a repo](#2-buying-a-repo)
  - [3. The payment gateway (HTTP 402)](#3-the-payment-gateway-http-402)
  - [4. The TEE Agent](#4-the-tee-agent)
  - [5. Platform fees](#5-platform-fees)
- [Architecture](#architecture)
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

    subgraph Platform["🫖 Stellar Bazgit"]
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
        Access["/api/access — 402 gateway"]
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

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19, Tailwind CSS v4 |
| Auth | NextAuth v4 + GitHub OAuth |
| Blockchain | Stellar (`@stellar/stellar-sdk`) |
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
| `/api/purchases` | GET | Public | Purchase history per repo |
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
│   └── stellar-server.ts           # Server-only SDK re-exports
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
