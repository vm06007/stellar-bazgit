import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";

export async function getAccessToken(req: NextRequest): Promise<string | undefined> {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    return (token?.accessToken as string) ?? undefined;
}
