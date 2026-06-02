import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getApiKeys, createApiKey, deleteApiKey, initStore } from "@/lib/store";
import { getAccessToken } from "@/lib/getAccessToken";

export async function GET(req: NextRequest) {
    await initStore();
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const keys = getApiKeys(session.user.email).map((k) => ({
        key: k.key,
        label: k.label,
        createdAt: k.createdAt,
    }));

    return NextResponse.json(keys);
}

export async function POST(req: NextRequest) {
    await initStore();
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const accessToken = await getAccessToken(req) ?? "";
    const { label } = await req.json();

    const key = createApiKey(session.user.email, accessToken, label ?? "API key");
    return NextResponse.json({ key: key.key, label: key.label, createdAt: key.createdAt });
}

export async function DELETE(req: NextRequest) {
    await initStore();
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { key } = await req.json();
    if (!key) return NextResponse.json({ error: "Missing key" }, { status: 400 });

    const deleted = deleteApiKey(key, session.user.email);
    if (!deleted) return NextResponse.json({ error: "Key not found" }, { status: 404 });

    return NextResponse.json({ success: true });
}
