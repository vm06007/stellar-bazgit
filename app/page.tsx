"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { AppLogo } from "@/app/components/AppLogo";

export default function Home() {
    const { data: session, status } = useSession();

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4">
            <div className="w-full max-w-md space-y-8 text-center">
                <div className="space-y-4">
                    <div className="flex flex-col items-center mt-8 gap-1">
                        <AppLogo size="hero" priority />
                        <h1 className="text-[48px] font-bold tracking-tight text-white">
                            Stellar Bazgit
                        </h1>
                    </div>
                    <p className="text-zinc-400 text-lg leading-relaxed">
                        A bazaar for private GitHub repositories — buy and sell clone access, settled in XLM or USDC on Stellar chain.
                    </p>
                </div>

                <ul className="w-full space-y-2 text-sm text-zinc-500 text-left">
                    <li className="flex items-start gap-2">
                        <span className="text-cyan-500">→</span>
                        Connect GitHub, pick a repo to monetize
                    </li>
                    <li className="flex items-start gap-2">
                        <span className="text-cyan-500">→</span>
                        Set a price in XLM or USDC on Stellar
                    </li>
                    <li className="flex items-start gap-2">
                        <span className="text-cyan-500">→</span>
                        Buyers pay with any Stellar wallet — you get the clone URL
                    </li>
                </ul>

                {status === "authenticated" ? (
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-3 rounded-lg border border-zinc-700 px-4 py-3">
                            {session.user?.image && (
                                <Image
                                    src={session.user.image}
                                    width={32}
                                    height={32}
                                    alt={session.user.name ?? ""}
                                    className="rounded-full"
                                />
                            )}
                            <div className="text-left flex-1">
                                <p className="text-sm font-medium text-white">{session.user?.name}</p>
                                <p className="text-xs text-zinc-500">{session.user?.email}</p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                                <span className="text-xs text-cyan-400 font-medium">Connected</span>
                                <button
                                    onClick={() => signOut()}
                                    className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                                >
                                    Sign out
                                </button>
                            </div>
                        </div>
                        <Link
                            href="/dashboard"
                            className="flex w-full items-center justify-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-zinc-900 shadow-sm transition-all hover:bg-zinc-100 active:scale-95"
                        >
                            Go to Dashboard
                        </Link>
                        <Link
                            href="/bazaar"
                            className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-700 px-6 py-3 text-sm font-semibold text-zinc-300 transition-all hover:border-zinc-500 hover:text-white active:scale-95"
                        >
                            Browse Bazaar
                        </Link>
                    </div>
                ) : (
                    <button
                        onClick={() => signIn("github", { callbackUrl: "/dashboard" })}
                        disabled={status === "loading"}
                        className="flex w-full items-center justify-center gap-3 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-zinc-900 shadow-sm transition-all hover:bg-zinc-100 active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12" />
                        </svg>
                        {status === "loading" ? "Loading..." : "Connect with GitHub"}
                    </button>
                )}
                <div className="flex items-center justify-center gap-2 text-xs text-zinc-600">
                    <svg className="w-4 h-4 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                    <span>Powered by the Stellar network · 2-5s settlement · &lt;0.001 XLM fees</span>
                </div>
                <p className="text-xs text-zinc-600 hidden">
                    We only request access to repos you explicitly choose to monetize.
                </p>
            </div>
        </div>
    );
}
