"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { isValidStellarAddress, shortStellarAddress } from "@/lib/stellar";

type TreeItem = { path: string; type: "blob" | "tree" };

export type Rule = {
    path: string;
    type: "blob" | "tree";
    price: string;
    asset: "XLM" | "USDC";
};

type TreeNode = {
    name: string;
    path: string;
    type: "blob" | "tree";
    children: TreeNode[];
};

export type ContributorSplit = {
    login: string;
    avatar_url: string;
    stellarAddress: string;
    share: number;
};

export type ExistingEntry = {
    rules: Rule[];
    mode: string;
    stellarAddress?: string;
    paymentSplits?: ContributorSplit[];
    listing?: {
        description?: string;
        use_readme?: boolean;
        images?: string[];
        preview_url?: string;
    };
};

export type MonetizedEntry = ExistingEntry & { full_name: string };

type Props = {
    repo: { full_name: string; name: string };
    existing?: ExistingEntry | null;
    onClose: () => void;
    onSaved?: (entry: MonetizedEntry) => void;
};

function buildTree(items: TreeItem[]): TreeNode[] {
    const root: TreeNode[] = [];
    const map: Record<string, TreeNode> = {};
    for (const item of items) {
        map[item.path] = { name: item.path.split("/").pop()!, path: item.path, type: item.type, children: [] };
    }
    for (const item of items) {
        const parts = item.path.split("/");
        if (parts.length === 1) {
            root.push(map[item.path]);
        } else {
            const parentPath = parts.slice(0, -1).join("/");
            if (map[parentPath]) map[parentPath].children.push(map[item.path]);
        }
    }
    return root;
}

function TreeNodeRow({
    node, rules, onToggle, onSetPrice, filter, coveredByParent = false,
}: {
    node: TreeNode; rules: Rule[]; onToggle: (item: { path: string; type: "blob" | "tree" }) => void;
    onSetPrice: (path: string, price: string) => void; filter: string; coveredByParent?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const isFolder = node.type === "tree";
    const ruled = rules.some((r) => r.path === node.path);
    const rule = rules.find((r) => r.path === node.path);
    const locked = coveredByParent && !ruled;
    const isFiltering = filter.length > 0;
    const effectiveOpen = isFiltering ? true : open;

    function matchesFilter(n: TreeNode): boolean {
        if (n.name.toLowerCase().includes(filter.toLowerCase())) return true;
        return n.children.some(matchesFilter);
    }
    if (isFiltering && !matchesFilter(node)) return null;

    return (
        <div>
            <div
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors group ${
                    locked ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
                } ${ruled ? "bg-cyan-950 border border-cyan-800" : locked ? "border border-transparent" : "hover:bg-zinc-800 border border-transparent"}`}
                onClick={() => {
                    if (locked) return;
                    if (isFolder) setOpen((v) => !v);
                    else onToggle({ path: node.path, type: node.type });
                }}
            >
                {isFolder ? (
                    <span className="text-zinc-500 w-4 text-xs shrink-0 select-none">
                        {effectiveOpen ? "▾" : "▸"}
                    </span>
                ) : <span className="w-4 shrink-0" />}
                <span className="text-sm shrink-0">{isFolder ? "📁" : "📄"}</span>
                <span className="text-sm text-zinc-200 flex-1 truncate font-mono">{node.name}</span>
                {locked ? (
                    <span className="text-xs text-zinc-600 shrink-0">covered by parent</span>
                ) : ruled ? (
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <input
                            type="number" min="0.01" step="0.01" value={rule!.price} placeholder="0.00"
                            autoFocus={rule!.price === ""}
                            onChange={(e) => onSetPrice(node.path, e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                            className="w-16 rounded bg-zinc-700 border border-zinc-600 px-2 py-0.5 text-xs text-white text-right focus:outline-none focus:border-cyan-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <span className="text-xs text-zinc-500">XLM</span>
                        <button
                            onClick={(e) => { e.stopPropagation(); onToggle({ path: node.path, type: node.type }); }}
                            className="ml-1 text-zinc-500 hover:text-red-400 transition-colors cursor-pointer text-sm leading-none"
                        >✕</button>
                    </div>
                ) : (
                    <span
                        className="text-xs text-zinc-500 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity px-2 py-0.5 rounded border border-zinc-700 hover:border-zinc-500 hover:text-zinc-300"
                        onClick={(e) => { e.stopPropagation(); if (!locked) onToggle({ path: node.path, type: node.type }); }}
                    >+ gate</span>
                )}
            </div>
            {isFolder && effectiveOpen && node.children.length > 0 && (
                <div className="ml-5 border-l border-zinc-800 pl-2 mt-0.5 space-y-0.5">
                    {node.children.map((child) => (
                        <TreeNodeRow key={child.path} node={child} rules={rules} onToggle={onToggle} onSetPrice={onSetPrice} filter={filter} coveredByParent={coveredByParent || ruled} />
                    ))}
                </div>
            )}
        </div>
    );
}

type PricingMode = "flat" | "granular";
type AssetType = "XLM" | "USDC";

export default function MonetizeModal({ repo, existing, onClose, onSaved }: Props) {
    const [items, setItems] = useState<TreeItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [truncated, setTruncated] = useState(false);
    const [rules, setRules] = useState<Rule[]>(existing?.mode === "granular" ? existing.rules : []);
    const [filter, setFilter] = useState("");
    const [saving, setSaving] = useState(false);
    const [mode, setMode] = useState<PricingMode>((existing?.mode as PricingMode) ?? "flat");
    const [flatPrice, setFlatPrice] = useState(existing?.mode === "flat" ? (existing.rules[0]?.price ?? "10") : "10");
    const [flatAsset, setFlatAsset] = useState<AssetType>((existing?.rules[0]?.asset as AssetType) ?? "XLM");
    const [stellarAddress, setStellarAddress] = useState(existing?.stellarAddress ?? "");
    const [addressError, setAddressError] = useState("");
    const [gatewayUrl, setGatewayUrl] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<"pricing" | "listing">("pricing");
    const [listingDesc, setListingDesc] = useState(existing?.listing?.description ?? "");
    const [listingImages, setListingImages] = useState<string[]>(existing?.listing?.images ?? []);
    const [listingPreviewUrl, setListingPreviewUrl] = useState(existing?.listing?.preview_url ?? "");
    const [generating, setGenerating] = useState(false);
    const [loadingReadme, setLoadingReadme] = useState(false);
    const [walletMode, setWalletMode] = useState<"single" | "split">(existing?.paymentSplits?.length ? "split" : "single");
    const [splits, setSplits] = useState<ContributorSplit[]>(existing?.paymentSplits ?? []);
    const [loadingContributors, setLoadingContributors] = useState(false);

    useEffect(() => {
        fetch(`/api/repos/tree?full_name=${repo.full_name}`)
            .then((r) => r.json())
            .then((data) => { setItems(data.items ?? []); setTruncated(data.truncated ?? false); setLoading(false); });
    }, [repo.full_name]);

    function toggleRule(item: { path: string; type: "blob" | "tree" }) {
        if (rules.some((r) => r.path === item.path)) {
            setRules((prev) => prev.filter((r) => r.path !== item.path));
        } else {
            setRules((prev) => [...prev, { path: item.path, type: item.type, price: "", asset: flatAsset }]);
        }
    }

    function setPrice(path: string, price: string) {
        setRules((prev) => prev.map((r) => (r.path === path ? { ...r, price } : r)));
    }

    function handleAddressChange(value: string) {
        setStellarAddress(value);
        if (addressError) setAddressError("");
    }

    async function save() {
        if (walletMode === "single") {
            const trimmed = stellarAddress.trim();
            if (!trimmed) { setAddressError("A Stellar payment address is required."); return; }
            if (!isValidStellarAddress(trimmed)) {
                setAddressError("Must be a valid Stellar public key (starts with G, 56 characters)");
                return;
            }
            setAddressError("");
        } else {
            if (splits.length === 0) { toast.error("Load contributors first and assign Stellar addresses."); return; }
            const missing = splits.find((s) => !isValidStellarAddress(s.stellarAddress));
            if (missing) { toast.error(`Enter a valid Stellar address for @${missing.login}`); return; }
            const total = splits.reduce((sum, s) => sum + s.share, 0);
            if (total !== 100) { toast.error(`Shares must total 100% (currently ${total}%)`); return; }
        }

        let payload: Rule[];
        if (mode === "flat") {
            if (!flatPrice || parseFloat(flatPrice) <= 0) { toast.error("Enter a valid price."); return; }
            payload = [{ path: "*", type: "tree", price: flatPrice, asset: flatAsset }];
        } else {
            if (rules.length === 0) { toast.error("Add at least one access rule before saving."); return; }
            const unpriced = rules.find((r) => !r.price || parseFloat(r.price) <= 0);
            if (unpriced) { toast.error(`Set a price for "${unpriced.path.split("/").pop()}"`); return; }
            payload = rules;
        }

        setSaving(true);
        const res = await fetch("/api/monetize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                full_name: repo.full_name,
                rules: payload,
                mode,
                stellarAddress: walletMode === "single" ? stellarAddress.trim() : undefined,
                paymentSplits: walletMode === "split" ? splits : undefined,
                listing: {
                    description: listingDesc.trim() || undefined,
                    images: listingImages.length > 0 ? listingImages : undefined,
                    preview_url: listingPreviewUrl.trim() || undefined,
                },
            }),
        });
        const data = await res.json();
        setSaving(false);
        if (!res.ok) {
            toast.error(data.error ?? "Failed to save");
        } else {
            const desc = mode === "flat" ? `${flatPrice} ${flatAsset} flat access` : `${rules.length} rule${rules.length > 1 ? "s" : ""}`;
            toast.success(`"${repo.name}" is now monetized — ${desc}`);
            setGatewayUrl(`${window.location.origin}/api/access/${repo.full_name}`);
            onSaved?.({ full_name: repo.full_name, rules: payload, mode, stellarAddress: walletMode === "single" ? stellarAddress.trim() : undefined });
        }
    }

    const tree = buildTree(items);

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
            <div className="relative z-10 w-full sm:max-w-2xl bg-zinc-900 border border-zinc-700 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
                    <div>
                        <h2 className="text-base font-semibold text-white">Monetize repository</h2>
                        <p className="text-xs text-zinc-500 mt-0.5">{repo.full_name}</p>
                    </div>
                    <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 text-xl leading-none cursor-pointer">✕</button>
                </div>

                <div className="flex flex-col flex-1 min-h-0 p-5 gap-4 overflow-y-auto">
                    {gatewayUrl ? (
                        <div className="flex flex-col gap-4 py-4">
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">🎉</span>
                                <div>
                                    <p className="text-white font-semibold">Repository is live on Stellar!</p>
                                    <p className="text-zinc-400 text-sm">Share the gateway URL. Buyers pay in XLM/USDC and get the clone URL.</p>
                                </div>
                            </div>
                            <div className="rounded-lg bg-zinc-800 border border-zinc-700 p-4 space-y-3">
                                <p className="text-xs text-zinc-500 uppercase tracking-widest">Gateway URL</p>
                                <div className="flex items-center gap-2">
                                    <code className="text-sm text-cyan-400 flex-1 break-all">{gatewayUrl}</code>
                                    <button
                                        onClick={() => { navigator.clipboard.writeText(gatewayUrl); toast.success("Copied!"); }}
                                        className="text-xs text-zinc-400 hover:text-white bg-zinc-700 hover:bg-zinc-600 px-2 py-1 rounded cursor-pointer transition-colors shrink-0"
                                    >Copy</button>
                                </div>
                            </div>
                            <div className="rounded-lg bg-zinc-800 border border-zinc-700 p-4 space-y-2">
                                <p className="text-xs text-zinc-500 uppercase tracking-widest">How buyers pay</p>
                                <p className="text-xs text-zinc-400 leading-relaxed">
                                    1. Buyer calls <code className="text-cyan-400 bg-zinc-900 px-1 rounded">GET {gatewayUrl}</code> — receives a <span className="text-amber-400">402</span> with Stellar payment details<br />
                                    2. Buyer sends XLM/USDC to your Stellar address with the memo<br />
                                    3. Buyer POSTs the tx hash to <code className="text-cyan-400 bg-zinc-900 px-1 rounded">/api/pay</code> — receives a 1-hour clone token
                                </p>
                            </div>
                            <a href={`/repo/${repo.full_name}`} target="_blank" rel="noopener noreferrer"
                                className="flex items-center justify-center gap-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors">
                                View public page →
                            </a>
                        </div>
                    ) : (
                        <>
                            <div className="sticky top-0 z-10 -mx-5 px-5 pb-3 bg-zinc-900">
                                <div className="flex rounded-lg bg-zinc-800 p-1 gap-1">
                                    {(["pricing", "listing"] as const).map((tab) => (
                                        <button key={tab} onClick={() => setActiveTab(tab)}
                                            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer capitalize ${activeTab === tab ? "bg-zinc-600 text-white" : "text-zinc-400 hover:text-zinc-200"}`}>
                                            {tab === "pricing" ? "Pricing & Payment" : "Description"}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {activeTab === "listing" ? (
                                <div className="flex flex-col gap-5">
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-sm font-medium text-zinc-400">Description</label>
                                            <div className="flex items-center gap-3">
                                                <button type="button" disabled={loadingReadme}
                                                    onClick={async () => {
                                                        setLoadingReadme(true);
                                                        try {
                                                            const res = await fetch(`/api/repos/readme?full_name=${encodeURIComponent(repo.full_name)}`);
                                                            const data = await res.json();
                                                            if (!res.ok) { toast.error(data.error ?? "No README found"); return; }
                                                            setListingDesc(data.content);
                                                        } catch { toast.error("Could not fetch README."); }
                                                        finally { setLoadingReadme(false); }
                                                    }}
                                                    className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
                                                    {loadingReadme ? <><span className="w-2.5 h-2.5 border border-zinc-500 border-t-zinc-200 rounded-full animate-spin shrink-0" /> Loading…</> : <>Use README.md</>}
                                                </button>
                                                <button type="button" disabled={generating}
                                                    onClick={async () => {
                                                        setGenerating(true);
                                                        try {
                                                            const res = await fetch("/api/listing/generate", {
                                                                method: "POST",
                                                                headers: { "Content-Type": "application/json" },
                                                                body: JSON.stringify({ full_name: repo.full_name }),
                                                            });
                                                            const data = await res.json();
                                                            if (!res.ok) { toast.error(data.error ?? "Failed to generate"); }
                                                            else if (data.description) setListingDesc(data.description);
                                                        } catch { toast.error("Network error"); }
                                                        finally { setGenerating(false); }
                                                    }}
                                                    className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
                                                    {generating ? <><span className="w-2.5 h-2.5 border border-zinc-500 border-t-zinc-200 rounded-full animate-spin shrink-0" /> Generating…</> : <>✦ Generate with AI</>}
                                                </button>
                                            </div>
                                        </div>
                                        <textarea rows={8} value={listingDesc} onChange={(e) => setListingDesc(e.target.value)}
                                            placeholder="Describe what this repository offers to buyers… Markdown supported"
                                            className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-y font-mono" />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-sm font-medium text-zinc-400">Live Preview URL</label>
                                            <span className="text-xs text-zinc-600">optional</span>
                                        </div>
                                        <input type="url" value={listingPreviewUrl} onChange={(e) => setListingPreviewUrl(e.target.value)}
                                            placeholder="https://your-demo.vercel.app"
                                            className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 font-mono" />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-medium text-zinc-400">Images <span className="text-zinc-600 font-normal">({listingImages.length}/8)</span></label>
                                        {listingImages.length < 8 && (
                                            <label className="flex items-center justify-center gap-2 rounded-md border border-dashed border-zinc-700 hover:border-zinc-500 px-3 py-3 text-sm text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer">
                                                <span>+ Add images</span>
                                                <input type="file" accept="image/*" multiple className="sr-only"
                                                    onChange={(e) => {
                                                        const files = Array.from(e.target.files ?? []);
                                                        files.slice(0, 8 - listingImages.length).forEach((file) => {
                                                            const reader = new FileReader();
                                                            reader.onload = (ev) => {
                                                                const result = ev.target?.result as string;
                                                                if (result) setListingImages((prev) => prev.length < 8 ? [...prev, result] : prev);
                                                            };
                                                            reader.readAsDataURL(file);
                                                        });
                                                        e.target.value = "";
                                                    }} />
                                            </label>
                                        )}
                                        {listingImages.length > 0 && (
                                            <div className="flex flex-wrap gap-2 mt-1">
                                                {listingImages.map((src, i) => (
                                                    <div key={i} className="relative group shrink-0">
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img src={src} alt="" className="w-16 h-16 object-cover rounded-md border border-zinc-700" />
                                                        <button type="button" onClick={() => setListingImages((prev) => prev.filter((_, idx) => idx !== i))}
                                                            className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center rounded-full bg-zinc-800 border border-zinc-600 text-zinc-400 hover:text-red-400 hover:border-red-500 transition-colors cursor-pointer text-xs leading-none opacity-0 group-hover:opacity-100">×</button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {/* Stellar payment address */}
                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                                            <span>Stellar payment address</span>
                                            <span className="text-zinc-600 font-normal">(required — where XLM/USDC payments land)</span>
                                        </label>

                                        <div className="flex rounded-lg bg-zinc-800 p-0.5 gap-0.5 mb-1">
                                            <button type="button" onClick={() => setWalletMode("single")}
                                                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${walletMode === "single" ? "bg-zinc-600 text-white" : "text-zinc-400 hover:text-zinc-200"}`}>
                                                Single address
                                            </button>
                                            <button type="button" onClick={() => setWalletMode("split")}
                                                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${walletMode === "split" ? "bg-zinc-600 text-white" : "text-zinc-400 hover:text-zinc-200"}`}>
                                                Split by contributors
                                            </button>
                                        </div>

                                        {walletMode === "single" ? (
                                            <>
                                                <input type="text" placeholder="G… your Stellar public key (56 characters)"
                                                    value={stellarAddress} onChange={(e) => handleAddressChange(e.target.value)}
                                                    className={`w-full rounded-md bg-zinc-800 border px-3 py-2.5 text-sm font-mono text-white placeholder-zinc-600 focus:outline-none transition-colors ${addressError ? "border-red-500 focus:border-red-400" : "border-zinc-700 focus:border-zinc-500"}`} />
                                                {isValidStellarAddress(stellarAddress.trim()) && (
                                                    <p className="text-xs text-cyan-400 font-mono flex items-center gap-1.5">
                                                        <span>✓</span> Valid Stellar address — {shortStellarAddress(stellarAddress.trim())}
                                                    </p>
                                                )}
                                                {addressError && <p className="text-xs text-red-400">{addressError}</p>}
                                                {!addressError && !isValidStellarAddress(stellarAddress.trim()) && (
                                                    <p className="text-xs text-zinc-600">
                                                        Stellar public keys start with G and are 56 characters. Generate one at{" "}
                                                        <a href="https://stellar.org/laboratory" target="_blank" rel="noopener noreferrer" className="text-cyan-600 hover:text-cyan-400 underline">stellar.org/laboratory</a>.
                                                    </p>
                                                )}
                                            </>
                                        ) : (
                                            <div className="flex flex-col gap-3">
                                                <div className="flex items-center justify-between">
                                                    <p className="text-xs text-zinc-500">Assign each contributor a Stellar address and share %.</p>
                                                    <button type="button" disabled={loadingContributors}
                                                        onClick={async () => {
                                                            setLoadingContributors(true);
                                                            try {
                                                                const res = await fetch(`/api/repos/contributors?full_name=${encodeURIComponent(repo.full_name)}`);
                                                                const data = await res.json();
                                                                if (!res.ok) { toast.error(data.error ?? "Failed to fetch contributors"); return; }
                                                                const existingMap = splits.reduce<Record<string, ContributorSplit>>((m, s) => { m[s.login] = s; return m; }, {});
                                                                const loaded: ContributorSplit[] = data.contributors.map((c: { login: string; avatar_url: string }) => ({
                                                                    login: c.login, avatar_url: c.avatar_url,
                                                                    stellarAddress: existingMap[c.login]?.stellarAddress ?? "",
                                                                    share: existingMap[c.login]?.share ?? 0,
                                                                }));
                                                                const eq = Math.floor(100 / loaded.length);
                                                                const rem = 100 - eq * loaded.length;
                                                                setSplits(loaded.map((s, i) => ({ ...s, share: existingMap[s.login]?.share ?? (i === 0 ? eq + rem : eq) })));
                                                            } catch { toast.error("Network error fetching contributors"); }
                                                            finally { setLoadingContributors(false); }
                                                        }}
                                                        className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-2.5 py-1.5 rounded-md transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0">
                                                        {loadingContributors ? <><span className="w-3 h-3 border border-zinc-500 border-t-zinc-300 rounded-full animate-spin" />Loading…</> : <>{splits.length > 0 ? "↺ Refresh" : "Load contributors"}</>}
                                                    </button>
                                                </div>
                                                {splits.length > 0 && (
                                                    <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
                                                        {splits.map((s, i) => (
                                                            <div key={s.login} className="flex items-center gap-2 rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2">
                                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                <img src={s.avatar_url} alt={s.login} className="w-6 h-6 rounded-full shrink-0" />
                                                                <span className="text-xs text-zinc-300 font-mono w-24 truncate shrink-0">@{s.login}</span>
                                                                <input type="text" placeholder="G… Stellar address"
                                                                    value={s.stellarAddress}
                                                                    onChange={(e) => setSplits((prev) => prev.map((x, j) => j === i ? { ...x, stellarAddress: e.target.value } : x))}
                                                                    className={`flex-1 min-w-0 rounded bg-zinc-700 border px-2 py-1 text-xs font-mono text-white placeholder-zinc-600 focus:outline-none transition-colors ${isValidStellarAddress(s.stellarAddress) ? "border-cyan-600" : "border-zinc-600 focus:border-zinc-500"}`} />
                                                                <div className="flex items-center gap-1 shrink-0">
                                                                    <input type="number" min={1} max={100} value={s.share}
                                                                        onChange={(e) => setSplits((prev) => prev.map((x, j) => j === i ? { ...x, share: Math.max(1, Math.min(100, parseInt(e.target.value) || 0)) } : x))}
                                                                        className="w-12 rounded bg-zinc-700 border border-zinc-600 px-1.5 py-1 text-xs text-white text-right focus:outline-none focus:border-zinc-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                                                                    <span className="text-xs text-zinc-500">%</span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                        <div className="flex items-center justify-end gap-1.5 pt-1">
                                                            <span className="text-xs text-zinc-500">Total:</span>
                                                            <span className={`text-xs font-mono font-semibold ${splits.reduce((sum, s) => sum + s.share, 0) === 100 ? "text-cyan-400" : "text-red-400"}`}>
                                                                {splits.reduce((sum, s) => sum + s.share, 0)}%
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Asset selector */}
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-xs font-medium text-zinc-400">Payment asset</label>
                                        <div className="flex rounded-lg bg-zinc-800 p-0.5 gap-0.5 w-fit">
                                            {(["XLM", "USDC"] as AssetType[]).map((a) => (
                                                <button key={a} type="button" onClick={() => setFlatAsset(a)}
                                                    className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${flatAsset === a ? "bg-zinc-600 text-white" : "text-zinc-400 hover:text-zinc-200"}`}>
                                                    {a}
                                                </button>
                                            ))}
                                        </div>
                                        {flatAsset === "USDC" && (
                                            <p className="text-xs text-zinc-600">USDC on Stellar (Circle-issued, same ticker as EVM USDC but different network)</p>
                                        )}
                                    </div>

                                    {/* Pricing mode */}
                                    <div className="flex rounded-lg bg-zinc-800 p-1 gap-1">
                                        <button onClick={() => setMode("flat")}
                                            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${mode === "flat" ? "bg-zinc-600 text-white" : "text-zinc-400 hover:text-zinc-200"}`}>
                                            Flat price
                                        </button>
                                        <button onClick={() => setMode("granular")}
                                            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${mode === "granular" ? "bg-zinc-600 text-white" : "text-zinc-400 hover:text-zinc-200"}`}>
                                            Per file / folder
                                        </button>
                                    </div>

                                    {mode === "flat" ? (
                                        <div className="flex flex-col gap-4">
                                            <p className="text-sm text-zinc-400">One price for full repo access.</p>
                                            <div className="flex items-center gap-3 rounded-lg bg-zinc-800 border border-zinc-700 px-4 py-4">
                                                <input type="number" min="0.01" step="0.01" value={flatPrice}
                                                    onChange={(e) => setFlatPrice(e.target.value)}
                                                    className="flex-1 bg-transparent text-3xl font-bold text-white focus:outline-none w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                    placeholder="10" />
                                                <span className="text-zinc-400 text-base font-semibold">{flatAsset}</span>
                                            </div>
                                            <p className="text-xs text-zinc-600">~{flatAsset === "XLM" ? `$${(parseFloat(flatPrice || "0") * 0.10).toFixed(2)} USD at $0.10/XLM` : `$${flatPrice || "0"} USD`} · paid once for a 1-hour clone token</p>
                                        </div>
                                    ) : (
                                        <>
                                            <p className="text-sm text-zinc-400">Gate individual files or folders with separate prices.</p>
                                            {loading ? (
                                                <div className="text-zinc-500 text-sm">Loading file tree...</div>
                                            ) : (
                                                <>
                                                    {truncated && <p className="text-xs text-amber-400">Large repo — tree may be incomplete.</p>}
                                                    <input type="text" placeholder="Filter files..." value={filter}
                                                        onChange={(e) => setFilter(e.target.value)}
                                                        className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500" />
                                                    <div className="flex-1 overflow-y-auto min-h-0 space-y-0.5 pr-1 max-h-64">
                                                        {tree.length === 0 && <p className="text-zinc-600 text-sm">No files found.</p>}
                                                        {tree.map((node) => (
                                                            <TreeNodeRow key={node.path} node={node} rules={rules} onToggle={toggleRule} onSetPrice={setPrice} filter={filter} />
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                        </>
                                    )}
                                </>
                            )}
                        </>
                    )}
                </div>

                <div className="flex items-center justify-between px-5 py-4 border-t border-zinc-800">
                    {gatewayUrl ? (
                        <>
                            <span className="text-xs text-zinc-500">Gateway is live</span>
                            <button onClick={onClose} className="px-4 py-2 rounded-md text-sm font-semibold bg-zinc-700 hover:bg-zinc-600 text-white transition-colors cursor-pointer">Done</button>
                        </>
                    ) : (
                        <>
                            <span className="text-sm text-zinc-500 truncate min-w-0">
                                {mode === "flat" ? `${flatPrice || "0"} ${flatAsset} flat` : rules.length === 0 ? "No rules yet" : `${rules.length} rule${rules.length > 1 ? "s" : ""}`}
                                {stellarAddress && isValidStellarAddress(stellarAddress.trim()) && <span className="text-zinc-600"> · {shortStellarAddress(stellarAddress.trim())}</span>}
                            </span>
                            <div className="flex gap-2 shrink-0">
                                <button onClick={onClose} className="px-4 py-2 rounded-md text-sm text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer">Cancel</button>
                                <button onClick={save} disabled={saving || (mode === "granular" && rules.length === 0)}
                                    className="px-4 py-2 rounded-md text-sm font-semibold bg-cyan-600 hover:bg-cyan-500 text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap">
                                    {saving ? "Saving..." : "Save & activate →"}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
