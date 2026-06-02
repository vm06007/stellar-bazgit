import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getFeeSummary, initStore } from "@/lib/store";
import {
    Horizon,
    TransactionBuilder,
    Asset,
    Operation,
    Memo,
    BASE_FEE,
    NETWORK_PASSPHRASE,
    USDC_ISSUER,
    HORIZON_URL,
} from "@/lib/stellar-server";

export async function POST(req: NextRequest) {
    await initStore();
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { buyer_address, asset } = await req.json();
    if (!buyer_address || !asset) return NextResponse.json({ error: "Missing buyer_address or asset" }, { status: 400 });

    const treasury = process.env.STELLAR_TREASURY_ADDRESS;
    if (!treasury) return NextResponse.json({ error: "Treasury address not configured" }, { status: 503 });

    const fees = getFeeSummary(session.user.email);
    const owed = asset === "XLM" ? fees.xlm.owed : fees.usdc.owed;
    if (owed <= 0) return NextResponse.json({ error: "No fees owed in this asset" }, { status: 400 });

    const amount = owed.toFixed(asset === "XLM" ? 7 : 2);

    try {
        const server = new Horizon.Server(HORIZON_URL);
        const account = await server.loadAccount(buyer_address);

        const paymentAsset = asset === "XLM" ? Asset.native() : new Asset("USDC", USDC_ISSUER);

        const tx = new TransactionBuilder(account, {
            fee: BASE_FEE,
            networkPassphrase: NETWORK_PASSPHRASE,
        })
            .addOperation(Operation.payment({ destination: treasury, asset: paymentAsset, amount }))
            .addMemo(Memo.text("sbz:fee"))
            .setTimeout(300)
            .build();

        return NextResponse.json({
            xdr: tx.toXDR(),
            network_passphrase: NETWORK_PASSPHRASE,
            amount,
            asset,
            destination: treasury,
        });
    } catch (e: any) {
        const msg = e?.response?.data?.title ?? e?.message ?? "Failed to build transaction";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
