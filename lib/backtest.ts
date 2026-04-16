import type { SmartMoneyWallet } from "./nansen";

export interface BacktestParams {
  investmentUsd: number;
  days: number;
  chain: string;
  strategy: "equal-weight" | "top-performer" | "momentum";
}

export interface WalletResult {
  address: string;
  label: string;
  allocation: number;
  startValue: number;
  endValue: number;
  pnlUsd: number;
  pnlPercent: number;
  topTokens: { symbol: string; allocation: number }[];
}

export interface BacktestResult {
  params: BacktestParams;
  startValue: number;
  endValue: number;
  totalPnlUsd: number;
  totalPnlPercent: number;
  winRate: number;
  maxDrawdown: number;
  sharpeRatio: number;
  walletResults: WalletResult[];
  dailyReturns: { date: string; value: number }[];
  benchmark: { date: string; value: number }[];
  paymentInfo: {
    amountPaid: string;
    txHash: string;
    network: string;
    paidAt: string;
  };
}

function deterministicRandom(seed: number, index: number): number {
  const x = Math.sin(seed + index) * 10000;
  return x - Math.floor(x);
}

function generateDailyReturns(
  startValue: number,
  days: number,
  annualReturn: number,
  volatility: number,
  seed: number
): { date: string; value: number }[] {
  const results: { date: string; value: number }[] = [];
  let value = startValue;
  const dailyReturn = annualReturn / 365;
  const dailyVol = volatility / Math.sqrt(365);
  const now = Date.now();

  for (let i = days; i >= 0; i--) {
    const date = new Date(now - i * 86400_000).toISOString().split("T")[0];
    if (i < days) {
      const rand = deterministicRandom(seed, i);
      const shock = (rand * 2 - 1) * dailyVol;
      value = value * (1 + dailyReturn + shock);
    }
    results.push({ date, value: Math.round(value * 100) / 100 });
  }
  return results;
}

export function runBacktest(
  wallets: SmartMoneyWallet[],
  params: BacktestParams,
  txHash: string
): BacktestResult {
  const { investmentUsd, days, strategy } = params;

  let selectedWallets = [...wallets];
  let allocations: number[];

  if (strategy === "top-performer") {
    selectedWallets = wallets.sort((a, b) => b.pnlPercent30d - a.pnlPercent30d).slice(0, 3);
    allocations = [0.5, 0.3, 0.2];
  } else if (strategy === "momentum") {
    selectedWallets = wallets.filter((w) => w.pnlPercent30d > 0).slice(0, 5);
    const totalPnl = selectedWallets.reduce((s, w) => s + Math.max(0, w.pnlPercent30d), 0);
    allocations = selectedWallets.map((w) => Math.max(0, w.pnlPercent30d) / totalPnl);
  } else {
    const n = Math.min(wallets.length, 5);
    selectedWallets = wallets.slice(0, n);
    allocations = selectedWallets.map(() => 1 / n);
  }

  const walletResults: WalletResult[] = selectedWallets.map((wallet, i) => {
    const alloc = allocations[i] ?? 1 / selectedWallets.length;
    const startValue = investmentUsd * alloc;
    const scaledPnlPercent = (wallet.pnlPercent30d / 30) * days;
    const endValue = startValue * (1 + scaledPnlPercent / 100);
    const pnlUsd = endValue - startValue;

    return {
      address: wallet.address,
      label: wallet.label,
      allocation: alloc,
      startValue,
      endValue,
      pnlUsd,
      pnlPercent: scaledPnlPercent,
      topTokens: wallet.topTokens,
    };
  });

  const endValue = walletResults.reduce((s, r) => s + r.endValue, 0);
  const totalPnlUsd = endValue - investmentUsd;
  const totalPnlPercent = (totalPnlUsd / investmentUsd) * 100;

  const seed = Date.now() % 10000;
  const annualReturn = totalPnlPercent / (days / 365) / 100;
  const dailyReturns = generateDailyReturns(investmentUsd, days, annualReturn, 0.6, seed);

  const drawdowns = dailyReturns.map((d, i) => {
    const peak = Math.max(...dailyReturns.slice(0, i + 1).map((x) => x.value));
    return (d.value - peak) / peak;
  });
  const maxDrawdown = Math.min(...drawdowns) * 100;

  const returns = dailyReturns
    .slice(1)
    .map((d, i) => (d.value - dailyReturns[i].value) / dailyReturns[i].value);
  const avgReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
  const stdReturn = Math.sqrt(
    returns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / returns.length
  );
  const sharpeRatio = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(365) : 0;

  const winRate = walletResults.filter((r) => r.pnlUsd > 0).length / walletResults.length;

  const benchmark = generateDailyReturns(investmentUsd, days, 0.6, 0.8, seed + 1);

  return {
    params,
    startValue: investmentUsd,
    endValue,
    totalPnlUsd,
    totalPnlPercent,
    winRate,
    maxDrawdown,
    sharpeRatio,
    walletResults,
    dailyReturns,
    benchmark,
    paymentInfo: {
      amountPaid: "$0.10 USDC",
      txHash,
      network: "base-sepolia",
      paidAt: new Date().toISOString(),
    },
  };
}
