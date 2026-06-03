// AUTO-GENERATED from README.md — the same diagrams shown in the docs.
export type Diagram = { label: string; chart: string };

export const DIAGRAMS: Diagram[] = [
    {
        "label": "The Big Picture",
        "chart": "flowchart LR\n    subgraph Seller[\"👤 Seller\"]\n        GH[GitHub Account]\n    end\n\n    subgraph Platform[\"🛒 Stellar Bazgit\"]\n        direction TB\n        Dash[Dashboard]\n        Cat[Public Catalog]\n        Gate[Payment Gateway<br/>HTTP 402]\n        Vault[(Encrypted<br/>Token Vault)]\n    end\n\n    subgraph Stellar[\"⭐ Stellar Network\"]\n        Horizon[Horizon API]\n    end\n\n    subgraph Buyer[\"🛒 Buyer / Agent\"]\n        Wallet[Freighter / Agent Wallet]\n    end\n\n    GH -->|OAuth connect| Dash\n    Dash -->|list repo + price| Cat\n    Dash -.->|store encrypted token| Vault\n    Buyer -->|browse| Cat\n    Buyer -->|GET access| Gate\n    Gate -->|402: pay X XLM to G...| Wallet\n    Wallet -->|send payment| Horizon\n    Horizon -->|verify tx| Gate\n    Gate -->|mint clone URL| Vault\n    Vault -->|authenticated git URL| Buyer"
    },
    {
        "label": "Selling a repo",
        "chart": "sequenceDiagram\n    actor S as Seller\n    participant UI as Dashboard\n    participant API as /api/monetize\n    participant Store as Encrypted Store\n\n    S->>UI: Sign in with GitHub (OAuth)\n    UI->>S: List of repos (private + public)\n    S->>UI: Pick repo, set price (XLM/USDC),<br/>set Stellar payout address\n    UI->>API: POST { full_name, price, asset, stellarAddress }\n    API->>API: Validate Stellar address (G..., 56 chars)\n    API->>API: Check outstanding platform fees\n    API->>Store: Save listing + AES-256-GCM<br/>encrypted GitHub token\n    API->>UI: gateway_url\n    UI->>S: 🎉 Repo is live in the catalog"
    },
    {
        "label": "Buying a repo",
        "chart": "sequenceDiagram\n    actor B as Buyer\n    participant UI as Repo Page\n    participant FR as Freighter Wallet\n    participant SRV as Server\n    participant H as Stellar Horizon\n\n    B->>UI: Click \"Pay with Freighter\"\n    UI->>FR: Connect & request access\n    FR->>B: Approve connection\n    UI->>SRV: POST /api/stellar/prepare<br/>{ repo, buyer_address }\n    SRV->>H: Load buyer account\n    SRV->>UI: Unsigned transaction (XDR)\n    UI->>FR: signTransaction(XDR)\n    FR->>B: Review payment → approve\n    FR->>UI: Signed XDR\n    UI->>SRV: POST /api/stellar/submit { signed_xdr }\n    SRV->>H: Submit transaction\n    H->>SRV: Confirmed ✓\n    SRV->>SRV: Verify payment (amount, dest, asset)\n    SRV->>SRV: Mint 1-hour access token\n    SRV->>UI: { token }\n    UI->>SRV: GET /api/access/repo?token=...\n    SRV->>UI: git clone URL + tarball URL\n    UI->>B: 📦 git clone \"https://...@github.com/owner/repo.git\""
    },
    {
        "label": "Payment gateway (402)",
        "chart": "flowchart TD\n    Start([GET /api/access/owner/repo]) --> HasToken{Has valid<br/>token?}\n    HasToken -->|No| Resp402[402 Payment Required<br/>JSON: stellar_address, amount,<br/>asset, memo, network]\n    HasToken -->|Yes| CheckToken{Token valid<br/>& not expired?}\n    CheckToken -->|No| Reject[401 Unauthorized]\n    CheckToken -->|Yes| Clone[200 OK<br/>clone_url + tarball_url]\n\n    Resp402 -.->|buyer pays on Stellar| Pay[POST /api/pay<br/>tx_hash]\n    Pay --> Verify{Payment<br/>verified on<br/>Horizon?}\n    Verify -->|No| Fail[402 error]\n    Verify -->|Yes| Mint[Mint UUID token<br/>1-hour TTL]\n    Mint -.->|use token| Start"
    },
    {
        "label": "Two payment paths",
        "chart": "flowchart TD\n    subgraph Listing[\"📦 One repo listing (one Stellar payout address)\"]\n        L[alice/my-toolkit · 5 USDC]\n    end\n\n    L --> Native[\"🟢 Native path<br/>/api/access/* + /api/pay<br/>XLM & USDC · our JSON · Horizon-verified\"]\n    L --> X402[\"🔵 x402 path<br/>/api/x402/*<br/>USDC · official wire format · Horizon-verified\"]\n\n    Native --> UI[Our UI, our TEE Agent,<br/>any custom client]\n    X402 --> Agents[Any x402-aware agent<br/>in the Stellar ecosystem]"
    },
    {
        "label": "x402 sequence",
        "chart": "sequenceDiagram\n    actor A as x402 Agent\n    participant GW as /api/x402/*\n    participant H as Stellar Horizon\n\n    A->>GW: GET (no payment)\n    GW->>A: 402 + { x402Version, accepts: [PaymentRequirements] }\n    Note over A: scheme \"exact\", network \"stellar:testnet\",<br/>asset, payTo, amount, memo\n    A->>A: Build & sign Stellar tx, base64-encode\n    A->>GW: GET with X-PAYMENT header\n    GW->>H: Submit + verify payment\n    H->>GW: Confirmed ✓\n    GW->>A: 200 + clone URL<br/>+ X-PAYMENT-RESPONSE header"
    },
    {
        "label": "TEE Agent",
        "chart": "flowchart TD\n    User([User chats with TEE Agent]) --> LLM[Claude via OpenRouter/Anthropic]\n    LLM --> Decide{Needs a<br/>tool?}\n    Decide -->|No| Reply[Plain-text reply]\n    Decide -->|Yes| Tools\n\n    subgraph Tools[\"🛠️ Agent Tools\"]\n        T1[get_agent_wallet]\n        T2[get_catalog]\n        T3[purchase_repo]\n        T4[monetize_repo]\n        T5[delist_repo]\n        T6[make_repo_private]\n        T7[get_purchases]\n        T8[rate_repo]\n    end\n\n    T3 -->|sign with agent's<br/>Stellar keypair| AgentWallet[(Agent Wallet<br/>secret key)]\n    AgentWallet -->|submit tx| Horizon[Stellar Horizon]\n    Horizon -->|clone URL| Reply\n    Tools --> LLM"
    },
    {
        "label": "Platform fees",
        "chart": "flowchart TD\n    Sale[Buyer pays seller directly] --> Track[Platform tracks:<br/>earned += amount]\n    Track --> Calc[\"owed = earned × 0.5% − already paid\"]\n    Calc --> List{Seller tries to<br/>list a NEW repo}\n    List --> Check{owed > threshold?<br/>1 XLM / 0.10 USDC}\n    Check -->|No| Allow[✅ Listing allowed]\n    Check -->|Yes| Block[🚫 Blocked until fee paid]\n    Block --> PayFee[Seller clicks<br/>'Pay fee with Freighter']\n    PayFee --> Settle[Fee sent to treasury<br/>on Stellar]\n    Settle --> Allow"
    },
    {
        "label": "Reviews & ratings",
        "chart": "flowchart TD\n    Buy[Buyer pays for repo<br/>payer = Stellar address] --> Rec[(Purchase record)]\n    Rec --> Gate{Address has<br/>a purchase?}\n    Review[POST /api/reviews<br/>rating + comment] --> Gate\n    Gate -->|no| Reject[403 — not a verified buyer]\n    Gate -->|yes| Save[(Save review)]\n    Save --> RepoR[⭐ Repo rating<br/>avg of its reviews]\n    Save --> MerchR[⭐ Merchant rating<br/>avg across all their repos]\n    RepoR --> Cat[Shown on catalog cards,<br/>repo page]\n    MerchR --> Pub[Shown on publisher profile]"
    },
    {
        "label": "Architecture",
        "chart": "flowchart TB\n    subgraph Client[\"🖥️ Browser (Next.js App Router)\"]\n        Pages[\"Pages: /, /dashboard, /catalog,<br/>/repo/[owner]/[repo], /publisher/[owner]\"]\n        Comps[\"Components: BuyButton, MonetizeModal,<br/>AgentPanel, SiteHeader\"]\n        Freighter[\"@stellar/freighter-api<br/>(client-side signing only)\"]\n    end\n\n    subgraph Server[\"⚙️ Next.js API Routes (server)\"]\n        Auth[\"/api/auth — NextAuth GitHub OAuth\"]\n        Monet[\"/api/monetize — list/delist\"]\n        Access[\"/api/access — native 402 gateway\"]\n        X402R[\"/api/x402 — standard x402 gateway\"]\n        StellarTx[\"/api/stellar/prepare + submit\"]\n        Pay[\"/api/pay — verify payment\"]\n        Fees[\"/api/fees — platform fees\"]\n        Agent[\"/api/agent/chat + wallet\"]\n        Repos[\"/api/repos/* — GitHub proxy\"]\n    end\n\n    subgraph Libs[\"📚 lib/\"]\n        StoreLib[\"store.ts — listings, purchases,<br/>fees, bids, API keys\"]\n        Crypto[\"store-crypto.ts — AES-256-GCM\"]\n        StellarLib[\"stellar.ts / stellar-server.ts —<br/>SDK, verification, constants\"]\n    end\n\n    subgraph External[\"🌐 External\"]\n        GitHub[\"GitHub API\"]\n        Horizon[\"Stellar Horizon\"]\n        LLM[\"Claude (OpenRouter/Anthropic)\"]\n        Redis[\"Upstash Redis (optional)\"]\n    end\n\n    Pages --> Comps\n    Comps --> Freighter\n    Comps -->|fetch| Server\n    Server --> Libs\n    Auth --> GitHub\n    Repos --> GitHub\n    Access --> Horizon\n    X402R --> Horizon\n    StellarTx --> Horizon\n    Pay --> Horizon\n    Fees --> Horizon\n    Agent --> LLM\n    Agent --> Horizon\n    StoreLib --> Redis\n    StoreLib --> Crypto"
    },
    {
        "label": "TEE / Confidential",
        "chart": "flowchart LR\n    subgraph Host[\"⚙️ App Server (untrusted)\"]\n        App[Next.js API routes]\n    end\n\n    subgraph TEE[\"🔒 Trusted Execution Environment\"]\n        direction TB\n        K1[GitHub token<br/>encryption key]\n        K2[Agent Stellar<br/>secret key]\n        Sign[Sign / decrypt<br/>inside enclave]\n    end\n\n    App -->|\"encrypt(token) / sign(xdr)\"| Sign\n    Sign -->|ciphertext / signed tx only| App\n    TEE -->|remote attestation| Verifier[Anyone can verify<br/>the agent's code + keys]"
    },
    {
        "label": "Security Model",
        "chart": "flowchart LR\n    Token[GitHub OAuth Token] -->|AES-256-GCM| Enc[Encrypted at rest<br/>iv:tag:ciphertext]\n    Enc --> Store[(.data / Redis)]\n    Store -->|decrypt on demand| Mint[Mint clone URL]\n    Mint --> TTL[1-hour expiry]\n    TTL --> Gone[Token auto-expires]"
    }
];
