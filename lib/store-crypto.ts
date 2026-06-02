import crypto from "crypto";

function getKey(): Buffer {
    const hex = process.env.TOKEN_ENCRYPTION_KEY;
    if (!hex || hex.length !== 64) {
        throw new Error("TOKEN_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)");
    }
    return Buffer.from(hex, "hex");
}

export function encryptToken(plain: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
    const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decryptToken(stored: string): string {
    if (!stored.includes(":")) return stored;
    const [ivHex, tagHex, encHex] = stored.split(":");
    const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return (
        decipher.update(Buffer.from(encHex, "hex")).toString("utf8") +
        decipher.final("utf8")
    );
}
