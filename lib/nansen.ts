const NANSEN_API_BASE = "https://api.nansen.ai";
const NANSEN_API_KEY = process.env.NANSEN_API_KEY ?? "";

export interface SmartMoneyWallet {
  address: string;
  label: string;
  chain: string;
  totalValueUsd: number;
  pnl30d: number;
  pnlPercent30d: number;
  topTokens: { symbol: string; allocation: number }[];
}

export interface PortfolioSnapshot {
  address: string;
  timestamp: number;
  totalValueUsd: number;
  tokens: {
    symbol: string;
    address: string;
    valueUsd: number;
    amount: number;
  }[];
}

async function nansenFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${NANSEN_API_BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const res = await fetch(url.toString(), {
    headers: {
      "apikey": NANSEN_API_KEY,
      "Content-Type": "application/json",
    },
    next: { revalidate: 300 },
  });

  if (!res.ok) {
    throw new Error(`Nansen API error: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

export async function getSmartMoneyWallets(
  chain: string,
  limit = 10
): Promise<SmartMoneyWallet[]> {
  try {
    const data = await nansenFetch<{ wallets: SmartMoneyWallet[] }>(
      "/api/v1/addresses/smart-money",
      { chain, limit: String(limit) }
    );
    return data.wallets ?? [];
  } catch {
    return getMockSmartMoneyWallets(chain, limit);
  }
}

export async function getWalletPortfolio(
  address: string,
  chain: string
): Promise<PortfolioSnapshot> {
  try {
    const data = await nansenFetch<PortfolioSnapshot>(
      `/api/v1/addresses/${address}/portfolio`,
      { chain }
    );
    return data;
  } catch {
    return getMockPortfolio(address, chain);
  }
}

export async function getWalletPnlHistory(
  address: string,
  chain: string,
  days: number
): Promise<{ date: string; valueUsd: number }[]> {
  try {
    const data = await nansenFetch<{ history: { date: string; valueUsd: number }[] }>(
      `/api/v1/addresses/${address}/pnl`,
      { chain, days: String(days) }
    );
    return data.history ?? [];
  } catch {
    return getMockPnlHistory(days);
  }
}

// --- Mock data (used when Nansen API key is not set or returns error) ---

function getMockSmartMoneyWallets(chain: string, limit: number): SmartMoneyWallet[] {
  const wallets: SmartMoneyWallet[] = [
    {
      address: "0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE",
      label: "Smart Money Alpha",
      chain,
      totalValueUsd: 4_250_000,
      pnl30d: 892_000,
      pnlPercent30d: 26.5,
      topTokens: [
        { symbol: "ETH", allocation: 0.42 },
        { symbol: "USDC", allocation: 0.28 },
        { symbol: "ARB", allocation: 0.15 },
        { symbol: "OP", allocation: 0.08 },
        { symbol: "LINK", allocation: 0.07 },
      ],
    },
    {
      address: "0x28C6c06298d514Db089934071355E5743bf21d60",
      label: "DeFi Whale Beta",
      chain,
      totalValueUsd: 12_800_000,
      pnl30d: 3_200_000,
      pnlPercent30d: 33.3,
      topTokens: [
        { symbol: "ETH", allocation: 0.35 },
        { symbol: "BTC", allocation: 0.3 },
        { symbol: "SOL", allocation: 0.2 },
        { symbol: "AVAX", allocation: 0.1 },
        { symbol: "MATIC", allocation: 0.05 },
      ],
    },
    {
      address: "0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8",
      label: "Accumulator Gamma",
      chain,
      totalValueUsd: 7_100_000,
      pnl30d: 1_065_000,
      pnlPercent30d: 17.6,
      topTokens: [
        { symbol: "BTC", allocation: 0.5 },
        { symbol: "ETH", allocation: 0.3 },
        { symbol: "USDT", allocation: 0.12 },
        { symbol: "BNB", allocation: 0.08 },
      ],
    },
    {
      address: "0x4E9ce36E442e55EcD9025B9a6E0D88485d628A67",
      label: "Momentum Delta",
      chain,
      totalValueUsd: 2_900_000,
      pnl30d: 812_000,
      pnlPercent30d: 38.9,
      topTokens: [
        { symbol: "SOL", allocation: 0.45 },
        { symbol: "JTO", allocation: 0.2 },
        { symbol: "WIF", allocation: 0.15 },
        { symbol: "BONK", allocation: 0.12 },
        { symbol: "USDC", allocation: 0.08 },
      ],
    },
    {
      address: "0x1Da5821544e25C636c1417Ba96Ade4Cf6D2f9B5A",
      label: "Value Seeker Epsilon",
      chain,
      totalValueUsd: 5_500_000,
      pnl30d: -275_000,
      pnlPercent30d: -4.8,
      topTokens: [
        { symbol: "ETH", allocation: 0.6 },
        { symbol: "STETH", allocation: 0.25 },
        { symbol: "USDC", allocation: 0.15 },
      ],
    },
  ];
  return wallets.slice(0, limit);
}

function getMockPortfolio(address: string, chain: string): PortfolioSnapshot {
  const seed = parseInt(address.slice(2, 10), 16) % 1000;
  return {
    address,
    timestamp: Date.now(),
    totalValueUsd: 1_000_000 + seed * 5000,
    tokens: [
      { symbol: "ETH", address: "0x0", valueUsd: 400_000 + seed * 1000, amount: 120 + seed },
      { symbol: "USDC", address: "0x1", valueUsd: 250_000, amount: 250_000 },
      { symbol: "ARB", address: "0x2", valueUsd: 180_000 + seed * 500, amount: 300_000 },
    ],
  };
}

function getMockPnlHistory(days: number): { date: string; valueUsd: number }[] {
  const history: { date: string; valueUsd: number }[] = [];
  let value = 1_000_000;
  const now = Date.now();
  for (let i = days; i >= 0; i--) {
    const date = new Date(now - i * 86400_000).toISOString().split("T")[0];
    const change = (Math.random() - 0.45) * 0.04;
    value = value * (1 + change);
    history.push({ date, valueUsd: Math.round(value) });
  }
  return history;
}
