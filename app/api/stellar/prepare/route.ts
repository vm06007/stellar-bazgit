import { NextRequest, NextResponse } from "next/server";
import { getRepos, initStore } from "@/lib/store";
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
    STELLAR_NETWORK,
} from "@/lib/stellar-server";

export async function POST(req: NextRequest) {
    await initStore();
    const { full_name, buyer_address } = await req.json();

    if (!full_name || !buyer_address) {
        return NextResponse.json({ error: "Missing full_name or buyer_address" }, { status: 400 });
    }

    const repos = getRepos();
    const entry = repos[full_name];
    if (!entry) return NextResponse.json({ error: "Repo not found in catalog" }, { status: 404 });

    const stellarAddress = entry.stellarAddress ??
        entry.paymentSplits?.sort((a, b) => b.share - a.share)[0]?.stellarAddress ?? "";
    if (!stellarAddress) return NextResponse.json({ error: "No Stellar payment address configured" }, { status: 400 });

    const price = entry.mode === "flat"
        ? entry.rules.find(r => r.path === "*")?.price ?? entry.rules[0]?.price ?? "1"
        : entry.rules[0]?.price ?? "1";
    const assetType = entry.rules[0]?.asset ?? "XLM";
    const memo = full_name.slice(0, 28);

    try {
        const server = new Horizon.Server(HORIZON_URL);
        const account = await server.loadAccount(buyer_address);

        const paymentAsset = assetType === "XLM"
            ? Asset.native()
            : new Asset("USDC", USDC_ISSUER);

        const tx = new TransactionBuilder(account, {
            fee: BASE_FEE,
            networkPassphrase: NETWORK_PASSPHRASE,
        })
            .addOperation(Operation.payment({
                destination: stellarAddress,
                asset: paymentAsset,
                amount: price,
            }))
            .addMemo(Memo.text(memo))
            .setTimeout(300)
            .build();

        return NextResponse.json({
            xdr: tx.toXDR(),
            network_passphrase: NETWORK_PASSPHRASE,
            network: STELLAR_NETWORK,
            amount: price,
            asset: assetType,
            destination: stellarAddress,
            memo,
        });
    } catch (e: any) {
        const msg: string = e?.response?.data?.title ?? e?.message ?? "Failed to build transaction";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
