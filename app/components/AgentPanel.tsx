"use client";

import { useEffect, useRef, useState } from "react";
import { AgentWalletWidget } from "./AgentWalletWidget";

type ChatMessage = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
    "Browse the catalog",
    "What can you help with?",
    "How do I sell a repo?",
];

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
}: {
    onClose: () => void;
    context?: Record<string, unknown>;
    onRefresh?: () => void;
}) {
    const [messages, setMessages] = useState<ChatMessage[]>([
        { role: "assistant", content: "Hi! I'm TEE Agent — I can help you browse the catalog, find repos, purchase them with XLM or USDC, or answer questions about Stellar Bazgit." },
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
        <aside className="w-[360px] flex flex-col border-l border-zinc-800 bg-zinc-950 shrink-0">
            {/* Header */}
            <div className="flex items-center justify-between px-4 border-b border-zinc-800 shrink-0" style={{ height: '73px', minHeight: '73px', maxHeight: '73px' }}>
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center shrink-0">
                        <svg className="w-4 h-4 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M7 3h10l-2 6H9L7 3z" /><path d="M9 9h6l2 8H7l2-8z" /><path d="M5 20h14" />
                        </svg>
                    </div>
                    <span className="text-sm font-medium text-zinc-200">TEE Agent</span>
                    <span className="text-xs px-2 py-0.5 rounded-full border font-medium bg-cyan-900/20 text-cyan-400 border-cyan-800/40">
                        Stellar
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
                            <div className="w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center shrink-0 mt-0.5 mr-2">
                                <svg className="w-3.5 h-3.5 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M7 3h10l-2 6H9L7 3z" /><path d="M9 9h6l2 8H7l2-8z" /><path d="M5 20h14" />
                                </svg>
                            </div>
                        )}
                        <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
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
                        <div className="w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center shrink-0 mt-0.5 mr-2">
                            <svg className="w-3.5 h-3.5 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M7 3h10l-2 6H9L7 3z" /><path d="M9 9h6l2 8H7l2-8z" /><path d="M5 20h14" />
                            </svg>
                        </div>
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
                    {SUGGESTIONS.map(s => (
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
                        placeholder="Ask about repos, pricing, or catalog…"
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
            <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 3h10l-2 6H9L7 3z" /><path d="M9 9h6l2 8H7l2-8z" /><path d="M5 20h14" />
                </svg>
            </div>
            TEE Agent
        </button>
    );
}
