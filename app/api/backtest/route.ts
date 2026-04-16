import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "x402-next";
import { getSmartMoneyWallets } from "@/lib/nansen";
import { runBacktest } from "@/lib/backtest";
import type { BacktestParams } from "@/lib/backtest";

const PAYMENT_ADDRESS = (process.env.PAYMENT_RECIPIENT_ADDRESS ?? "0x0000000000000000000000000000000000000000") as `0x${string}`;

async function handler(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const investmentUsd = Number(searchParams.get("investment") ?? "1000");
  const days = Number(searchParams.get("days") ?? "30");
  const chain = searchParams.get("chain") ?? "ethereum";
  const strategy = (searchParams.get("strategy") ?? "equal-weight") as BacktestParams["strategy"];

  if (investmentUsd < 1 || investmentUsd > 1_000_000) {
    return NextResponse.json({ error: "Investment must be between $1 and $1,000,000" }, { status: 400 });
  }
  if (days < 7 || days > 365) {
    return NextResponse.json({ error: "Days must be between 7 and 365" }, { status: 400 });
  }

  const wallets = await getSmartMoneyWallets(chain, 10);

  // Extract tx hash from x402 payment header for the receipt
  const txHash = req.headers.get("x-payment-tx-hash") ?? `0x${Math.random().toString(16).slice(2)}${"0".repeat(56)}`;

  const result = runBacktest(wallets, { investmentUsd, days, chain, strategy }, txHash);

  return NextResponse.json(result);
}

export const GET = withX402(
  handler,
  PAYMENT_ADDRESS,
  {
    price: "$0.10",
    network: "base-sepolia",
    config: {
      description: "Nansen Smart Money Backtest — $0.10 USDC per query",
    },
  }
);
