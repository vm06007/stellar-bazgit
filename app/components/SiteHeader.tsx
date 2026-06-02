"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";

function Logo() {
    return (
        <Link href="/" className="group/logo flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-400 shadow-md shadow-indigo-500/20">
                <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                    <line x1="9" y1="9" x2="9.01" y2="9" />
                    <line x1="15" y1="9" x2="15.01" y2="9" />
                </svg>
            </div>
            <span className="text-lg font-bold tracking-tight text-white group-hover/logo:opacity-70 transition-opacity">
                Stellar Bazgit
            </span>
        </Link>
    );
}

function ProfileDropdown() {
    const { data: session } = useSession();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const githubLogin = (session as any)?.login ?? session?.user?.name ?? "";

    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    if (!session) return null;

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen((o) => !o)}
                className="group flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
            >
                {session.user?.image && (
                    <Image src={session.user.image} alt={session.user.name ?? "avatar"} width={28} height={28}
                        className="rounded-full border border-zinc-700" />
                )}
                <span className="text-sm font-medium text-zinc-300 group-hover:text-white transition-colors hidden sm:block">
                    {session.user?.name}
                </span>
                <svg xmlns="http://www.w3.org/2000/svg" className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>

            {open && (
                <div className="absolute right-0 mt-1 w-52 rounded-xl border border-zinc-800 bg-zinc-900 shadow-xl py-1 z-50">
                    <div className="px-4 py-2.5 border-b border-zinc-800">
                        <p className="text-xs text-zinc-500">Signed in as</p>
                        <p className="text-sm font-medium text-zinc-200 truncate">{session.user?.email ?? session.user?.name}</p>
                    </div>
                    <div className="py-1">
                        <a href={`https://github.com/${githubLogin}`} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-3 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12" />
                            </svg>
                            GitHub profile
                        </a>
                        <Link href="/dashboard" onClick={() => setOpen(false)}
                            className="flex items-center gap-3 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                                <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
                            </svg>
                            Dashboard
                        </Link>
                        <button onClick={() => { setOpen(false); signOut({ callbackUrl: "/" }); }}
                            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-red-400 transition-colors cursor-pointer">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                            </svg>
                            Sign out
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export function SiteHeader({ right }: { right?: React.ReactNode }) {
    const { data: session } = useSession();
    return (
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-zinc-800 px-6 bg-zinc-950/95 backdrop-blur-sm" style={{ height: '73px', minHeight: '73px', maxHeight: '73px' }}>
            <Logo />
            <div className="flex items-center gap-3">
                {right}
                {session ? <ProfileDropdown /> : (
                    <Link href="/dashboard"
                        className="text-sm text-zinc-400 hover:text-white transition-colors px-3 py-1.5 rounded-md border border-zinc-700 hover:border-zinc-500">
                        List your repo →
                    </Link>
                )}
            </div>
        </header>
    );
}
