"use client";

import { useEffect, useRef, useState } from "react";

let _seq = 0;

export function MermaidDiagram({ chart, fit = false }: { chart: string; fit?: boolean }) {
    const ref = useRef<HTMLDivElement>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setError(false);
        (async () => {
            try {
                const mermaid = (await import("mermaid")).default;
                mermaid.initialize({
                    startOnLoad: false,
                    theme: "dark",
                    securityLevel: "loose",
                    themeVariables: {
                        background: "#09090b",
                        primaryColor: "#0e7490",
                        primaryTextColor: "#e4e4e7",
                        primaryBorderColor: "#155e75",
                        lineColor: "#52525b",
                        fontSize: "14px",
                    },
                });
                const id = `mmd-${_seq++}`;
                const { svg } = await mermaid.render(id, chart);
                if (cancelled || !ref.current) return;
                ref.current.innerHTML = svg;
                const el = ref.current.querySelector("svg");
                if (el) {
                    // Mermaid sets an inline max-width that pins the diagram to its
                    // small natural size — strip it so the SVG can scale up.
                    el.style.maxWidth = "none";
                    if (fit) {
                        el.removeAttribute("width");
                        el.removeAttribute("height");
                        el.style.width = "100%";
                        el.style.height = "100%";
                    }
                }
            } catch {
                if (!cancelled) setError(true);
            }
        })();
        return () => { cancelled = true; };
    }, [chart, fit]);

    if (error) {
        return (
            <pre className="text-[11px] text-zinc-500 font-mono whitespace-pre-wrap bg-zinc-950 border border-zinc-800 rounded-lg p-3 overflow-x-auto">
                {chart}
            </pre>
        );
    }

    return (
        <div
            ref={ref}
            className={fit
                ? "w-full h-full flex items-center justify-center"
                : "[&_svg]:max-w-full [&_svg]:h-auto flex justify-center"}
        />
    );
}
