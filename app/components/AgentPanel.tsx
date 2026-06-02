"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AgentWalletWidget } from "./AgentWalletWidget";
import { SITE_HEADER_STYLE } from "@/app/components/AppLogo";

type ChatMessage = { role: "user" | "assistant"; content: string };

const TEE_ICON_PATH = "/tee.png";

function TeeAgentIcon({ className = "w-8 h-8" }: { className?: string }) {
    return (
        <Image
            src={TEE_ICON_PATH}
            width={300}
            height={288}
            alt="TEE Agent"
            unoptimized
            className={`shrink-0 rounded-full object-cover ${className}`.trim()}
        />
    );
}

export const CATALOG_AGENT_SUGGESTIONS = [
    "Find repos under 10 XLM",
    "Buy a repo from the bazaar",
    "What can you help with?",
];

export const DASHBOARD_AGENT_SUGGESTIONS = [
    "List one of my private repos",
    "Delist a repo I'm selling",
    "Which repos am I already selling?",
];

export function getRepoAgentSuggestions(repoName: string) {
    return [
        `Buy ${repoName}`,
        "What's included in this listing?",
        "Find repos under 10 XLM",
    ];
}

export const CATALOG_AGENT_GREETING =
    "Hi! I'm TEE Agent — I can help you browse the bazaar, find repos by price, and purchase them with XLM or USDC.";

export const DASHBOARD_AGENT_GREETING =
    "Hi! I'm TEE Agent — I can help you list or delist repos, set prices, and manage your Stellar Bazgit bazaar.";

export function getRepoAgentGreeting(repoName: string) {
    return `Hi! I'm TEE Agent — I can help you buy ${repoName}, explain the listing, or find similar repos in the bazaar.`;
}

const CLONE_REGEX = /(GIT_TERMINAL_PROMPT=0 git clone "[^"]*"|git clone '[^']*')/g;

function CopyBlock({ command }: { command: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <span className="block my-2 rounded-lg bg-zinc-950 border border-zinc-700 overflow-hidden">
            <span className="block px-3 py-2 font-mono text-xs text-cyan-400 break-all leading-relaxed">{command}</span>
            <button
                onClick={() => { navigator.clipboard.writeText(command); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                className="w-full text-xs text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer px-3 py-1.5 text-left border-t border-zinc-700/50">
                {copied ? "✓ Copied!" : "Copy command"}
            </button>
        </span>
    );
}

function renderMessage(text: string) {
    const urlRegex = /(https?:\/\/[^\s"]+)/g;
    const segments = text.split(CLONE_REGEX);
    return segments.map((seg, i) => {
        if (CLONE_REGEX.test(seg)) { CLONE_REGEX.lastIndex = 0; return <CopyBlock key={i} command={seg} />; }
        CLONE_REGEX.lastIndex = 0;
        const parts = seg.split(urlRegex);
        return (
            <span key={i}>
                {parts.map((part, j) =>
                    urlRegex.test(part) ? (
                        <a key={j} href={part} target="_blank" rel="noopener noreferrer"
                            className="underline underline-offset-2 text-cyan-400 hover:text-white break-all transition-colors">
                            {part}
                        </a>
                    ) : part
                )}
            </span>
        );
    });
}

export function AgentPanel({
    onClose,
    context,
    onRefresh,
    suggestions = CATALOG_AGENT_SUGGESTIONS,
    initialMessage = CATALOG_AGENT_GREETING,
    inputPlaceholder = "Ask about repos, pricing, or bazaar…",
}: {
    onClose: () => void;
    context?: Record<string, unknown>;
    onRefresh?: () => void;
    suggestions?: string[];
    initialMessage?: string;
    inputPlaceholder?: string;
}) {
    const [messages, setMessages] = useState<ChatMessage[]>([
        { role: "assistant", content: initialMessage },
    ]);
    const [input, setInput] = useState("");
    const [thinking, setThinking] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, thinking]);
    useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50); }, []);
    useEffect(() => {
        function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    async function send(text?: string) {
        const content = (text ?? input).trim();
        if (!content || thinking) return;
        setInput("");
        const next: ChatMessage[] = [...messages, { role: "user", content }];
        setMessages(next);
        setThinking(true);
        try {
            const res = await fetch("/api/agent/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages: next, context: context ?? {} }),
            });
            const data = await res.json();
            setMessages(prev => [...prev, { role: "assistant", content: data.reply ?? "Sorry, something went wrong." }]);
            onRefresh?.();
        } catch {
            setMessages(prev => [...prev, { role: "assistant", content: "Network error — please try again." }]);
        } finally {
            setThinking(false);
            inputRef.current?.focus();
        }
    }

    return (
        <aside className="w-[450px] flex flex-col border-l border-zinc-800 bg-zinc-950 shrink-0">
            {/* Header */}
            <div
                className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-4 overflow-hidden"
                style={SITE_HEADER_STYLE}
            >
                <div className="flex items-center gap-2.5">
                    <TeeAgentIcon className="w-16 h-16" />
                    <span className="text-[17px] font-bold text-zinc-200">TEE Agent</span>
                    <span className="text-xs px-2 py-0.5 rounded-full border font-medium bg-cyan-900/20 text-cyan-400 border-cyan-800/40">
                        Stellar Testnet
                    </span>
                </div>
                <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors cursor-pointer text-lg leading-none">✕</button>
            </div>

            <AgentWalletWidget />

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        {msg.role === "assistant" && (
                            <TeeAgentIcon className="w-8 h-8 mt-0.5 mr-2" />
                        )}
                        <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm leading-relaxed break-words ${
                            msg.role === "user"
                                ? "bg-cyan-600 text-white"
                                : "bg-zinc-800/80 text-zinc-200 border border-zinc-700/50"
                        }`}>
                            {msg.role === "assistant" ? renderMessage(msg.content) : msg.content}
                        </div>
                    </div>
                ))}

                {thinking && (
                    <div className="flex justify-start">
                        <TeeAgentIcon className="w-8 h-8 mt-0.5 mr-2" />
                        <div className="bg-zinc-800/80 border border-zinc-700/50 rounded-xl px-4 py-2.5 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                            <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                            <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                    </div>
                )}
                <div ref={bottomRef} />
            </div>

            {/* Suggestion chips */}
            {messages.length <= 1 && (
                <div className="px-4 pb-3 flex flex-wrap gap-2">
                    {suggestions.map(s => (
                        <button key={s} onClick={() => send(s)}
                            className="text-xs px-3 py-1.5 rounded-full border border-zinc-700 bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors cursor-pointer">
                            {s}
                        </button>
                    ))}
                </div>
            )}

            {/* Input */}
            <div className="border-t border-zinc-800 px-4 py-3 shrink-0">
                <div className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 focus-within:border-cyan-500/50 transition-colors">
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                        placeholder={inputPlaceholder}
                        rows={1}
                        className="flex-1 resize-none bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none max-h-32"
                        style={{ fieldSizing: "content" } as React.CSSProperties}
                    />
                    <button onClick={() => send()} disabled={!input.trim() || thinking}
                        className="shrink-0 w-7 h-7 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-700 disabled:text-zinc-600 text-white flex items-center justify-center transition-colors cursor-pointer disabled:cursor-not-allowed">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />
                        </svg>
                    </button>
                </div>
                <p className="text-[10px] text-zinc-700 mt-1.5 text-center">Enter to send · Shift+Enter for newline · Esc to close</p>
            </div>
        </aside>
    );
}

export function AgentFAB({ onClick }: { onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-full bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold shadow-[0_0_24px_rgba(6,182,212,0.35)] hover:shadow-[0_0_32px_rgba(6,182,212,0.5)] transition-all cursor-pointer"
        >
            <TeeAgentIcon className="w-7 h-7" />
            TEE Agent
        </button>
    );
}
