import Image from "next/image";
import Link from "next/link";

export const LOGO_PATH = "/logo.png";
export const LOGO_WIDTH = 662;
export const LOGO_HEIGHT = 700;

export const SITE_HEADER_HEIGHT_PX = 90;
export const SITE_HEADER_STYLE = {
    height: `${SITE_HEADER_HEIGHT_PX}px`,
    minHeight: `${SITE_HEADER_HEIGHT_PX}px`,
    maxHeight: `${SITE_HEADER_HEIGHT_PX}px`,
} as const;

const HEADER_LOGO_CLASS =
    "mt-[3px] max-h-[65px] w-auto h-auto object-contain transition-transform duration-300 group-hover/logo:scale-110";

export const HEADER_TITLE_CLASS =
    "text-[32px] font-bold tracking-tight text-white group-hover/logo:opacity-70 transition-opacity";

const LOGO_SIZES = {
    hero: {
        width: LOGO_WIDTH,
        height: LOGO_HEIGHT,
        className: "h-[151px] w-auto object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.5)]",
        quality: 100,
        unoptimized: true,
    },
    md: {
        width: LOGO_WIDTH,
        height: LOGO_HEIGHT,
        className: HEADER_LOGO_CLASS,
        quality: 100,
        unoptimized: true,
    },
    sm: {
        width: LOGO_WIDTH,
        height: LOGO_HEIGHT,
        className: HEADER_LOGO_CLASS,
        quality: 100,
        unoptimized: true,
    },
} as const;

export type AppLogoSize = keyof typeof LOGO_SIZES;

export function AppLogo({
    size = "sm",
    priority = false,
    className = "",
}: {
    size?: AppLogoSize;
    priority?: boolean;
    className?: string;
}) {
    const { width, height, className: sizeClassName, quality, unoptimized } = LOGO_SIZES[size];

    return (
        <Image
            src={LOGO_PATH}
            width={width}
            height={height}
            alt="Stellar Bazgit"
            priority={priority}
            quality={quality}
            unoptimized={unoptimized}
            className={`${sizeClassName} ${className}`.trim()}
        />
    );
}

export function BrandLink({
    logoSize = "sm",
    titleClassName = HEADER_TITLE_CLASS,
    linkClassName = "group/logo flex items-center gap-2.5",
}: {
    logoSize?: AppLogoSize;
    titleClassName?: string;
    linkClassName?: string;
}) {
    return (
        <Link href="/" className={linkClassName}>
            <AppLogo size={logoSize} />
            <span className={titleClassName}>Stellar Bazgit</span>
        </Link>
    );
}
