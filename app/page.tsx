"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Wallet,
  Zap,
  CheckCircle,
  ExternalLink,
  AlertCircle,
  LogOut,
} from "lucide-react";
import { useAccount, useConnect, useDisconnect, useWalletClient } from "wagmi";
import { publicActions } from "viem";
import { createPaymentHeader, selectPaymentRequirements } from "x402/client";
import type { BacktestResult } from "@/lib/backtest";
import type { PaymentRequirements } from "x402/types";

type FlowStep = "idle" | "requesting" | "payment-required" | "paying" | "verifying" | "complete";

const CHAINS = ["ethereum", "base", "solana", "arbitrum", "optimism"];
const STRATEGIES = [
  { value: "equal-weight", label: "Equal Weight" },
  { value: "top-performer", label: "Top Performer" },
  { value: "momentum", label: "Momentum" },
];

function fmt(n: number, decimals = 2): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function FlowIndicator({ step }: { step: FlowStep }) {
  const steps: { key: FlowStep; label: string }[] = [
    { key: "requesting", label: "① GET /api/backtest" },
    { key: "payment-required", label: "② 402 Payment Required" },
    { key: "paying", label: "③ USDC 送金中" },
    { key: "verifying", label: "④ 支払い検証" },
    { key: "complete", label: "⑤ 200 OK + データ" },
  ];

  const activeIdx = steps.findIndex((s) => s.key === step);

  return (
    <div className="bg-gray-900 rounded-xl p-5 border border-gray-700">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
        x402 Payment Flow
      </h3>
      <div className="space-y-2">
        {steps.map((s, i) => {
          const done = activeIdx > i;
          const active = activeIdx === i;
          return (
            <div
              key={s.key}
              className={`flex items-center gap-3 py-2 px-3 rounded-lg text-sm transition-all duration-300 ${
                active
                  ? "bg-blue-500/20 border border-blue-500/40 text-blue-300"
                  : done
                  ? "text-green-400"
                  : "text-gray-600"
              }`}
            >
              {done ? (
                <CheckCircle className="w-4 h-4 shrink-0" />
              ) : active ? (
                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
              ) : (
                <div className="w-4 h-4 rounded-full border border-gray-700 shrink-0" />
              )}
              <span className="font-mono">{s.label}</span>
            </div>
          );
        })}
      </div>
      {step === "payment-required" && (
        <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-xs text-yellow-300 font-mono">
          <div className="text-yellow-400 font-semibold mb-1">HTTP 402</div>
          <div>price: $0.10 USDC</div>
          <div>network: base-sepolia</div>
          <div>payTo: 0x3f5C…0bE</div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  positive,
}: {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
}) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div
        className={`text-2xl font-bold ${
          positive === undefined ? "text-white" : positive ? "text-green-400" : "text-red-400"
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

export default function Home() {
  const [investment, setInvestment] = useState(1000);
  const [days, setDays] = useState(30);
  const [chain, setChain] = useState("ethereum");
  const [strategy, setStrategy] = useState("equal-weight");
  const [flowStep, setFlowStep] = useState<FlowStep>("idle");
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: walletClient } = useWalletClient();

  async function runBacktest() {
    setResult(null);
    setError(null);
    setFlowStep("requesting");

    try {
      const url = `/api/backtest?investment=${investment}&days=${days}&chain=${chain}&strategy=${strategy}`;

      // ① 最初のリクエスト
      const res = await fetch(url);

      if (res.status === 402) {
        // ② 402受信 → 支払い要求をパース
        const body = await res.json();
        setFlowStep("payment-required");

        if (!walletClient || !isConnected) {
          setError("ウォレットを接続してから再度お試しください。");
          setFlowStep("idle");
          return;
        }

        const requirements: PaymentRequirements[] = body.accepts ?? [];
        if (requirements.length === 0) {
          setError("支払い情報が取得できませんでした。");
          setFlowStep("idle");
          return;
        }

        const selected = selectPaymentRequirements(requirements, "base-sepolia");

        // ③ ウォレットで署名（EIP-3009 USDC authorization）
        setFlowStep("paying");
        const signer = walletClient.extend(publicActions);
        const paymentHeader = await createPaymentHeader(signer, body.x402Version ?? 1, selected);

        // ④ X-PAYMENT ヘッダーを付けてリトライ
        setFlowStep("verifying");
        const retryRes = await fetch(url, {
          headers: { "X-PAYMENT": paymentHeader },
        });

        if (!retryRes.ok) {
          const errBody = await retryRes.json().catch(() => ({ error: retryRes.statusText }));
          setError((errBody as { error?: string }).error ?? retryRes.statusText);
          setFlowStep("idle");
          return;
        }

        const data: BacktestResult = await retryRes.json();
        setFlowStep("complete");
        setResult(data);
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        setError((body as { error?: string }).error ?? res.statusText);
        setFlowStep("idle");
        return;
      }

      // PAYMENT_RECIPIENT_ADDRESS未設定の場合は直接200が返る（開発時）
      const data: BacktestResult = await res.json();
      setFlowStep("complete");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setFlowStep("idle");
    }
  }

  const chartData = result?.dailyReturns.map((d, i) => ({
    date: d.date,
    portfolio: Math.round(d.value * 100) / 100,
    benchmark: result.benchmark[i]?.value ?? 0,
  }));

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-white">Smart Money Backtest</span>
              <span className="text-gray-500 text-sm ml-2">powered by Nansen × x402</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs bg-green-500/10 border border-green-500/30 text-green-400 px-3 py-1.5 rounded-full">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              $0.10 USDC / query
            </div>
            {isConnected && address ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 font-mono hidden sm:block">
                  {address.slice(0, 6)}…{address.slice(-4)}
                </span>
                <button
                  onClick={() => disconnect()}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 border border-gray-700 px-2 py-1.5 rounded-lg"
                >
                  <LogOut className="w-3 h-3" />
                  切断
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {connectors.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => connect({ connector: c })}
                    className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {c.name === "Coinbase Wallet" ? "Coinbase Wallet" : c.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Controls + Flow */}
        <div className="lg:col-span-1 space-y-6">
          {/* Parameters */}
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-5">
            <h2 className="font-semibold text-white">バックテスト設定</h2>

            <div>
              <label className="text-xs text-gray-400 block mb-2">投資額 (USDC)</label>
              <input
                type="number"
                min={1}
                max={1000000}
                value={investment}
                onChange={(e) => setInvestment(Number(e.target.value))}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
              <div className="flex gap-2 mt-2">
                {[100, 1000, 10000].map((v) => (
                  <button
                    key={v}
                    onClick={() => setInvestment(v)}
                    className={`text-xs px-2 py-1 rounded ${
                      investment === v
                        ? "bg-blue-600 text-white"
                        : "bg-gray-800 text-gray-400 hover:text-white"
                    }`}
                  >
                    ${v.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-400 block mb-2">期間: {days}日</label>
              <input
                type="range"
                min={7}
                max={365}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="w-full accent-blue-500"
              />
              <div className="flex justify-between text-xs text-gray-600 mt-1">
                <span>7日</span>
                <span>90日</span>
                <span>180日</span>
                <span>365日</span>
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-400 block mb-2">チェーン</label>
              <select
                value={chain}
                onChange={(e) => setChain(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              >
                {CHAINS.map((c) => (
                  <option key={c} value={c}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-400 block mb-2">戦略</label>
              <div className="space-y-1">
                {STRATEGIES.map((s) => (
                  <label key={s.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="strategy"
                      value={s.value}
                      checked={strategy === s.value}
                      onChange={() => setStrategy(s.value)}
                      className="accent-blue-500"
                    />
                    <span className="text-sm text-gray-300">{s.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <button
              onClick={runBacktest}
              disabled={flowStep !== "idle" && flowStep !== "complete"}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {flowStep === "idle" || flowStep === "complete" ? (
                <>
                  <Zap className="w-4 h-4" />
                  バックテスト実行 ($0.10)
                </>
              ) : (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  処理中...
                </>
              )}
            </button>
          </div>

          {/* x402 Flow */}
          {flowStep !== "idle" && <FlowIndicator step={flowStep} />}

          {/* Payment receipt */}
          {result?.paymentInfo && (
            <div className="bg-gray-900 border border-green-500/30 rounded-xl p-4 text-xs space-y-2">
              <div className="flex items-center gap-2 text-green-400 font-semibold">
                <CheckCircle className="w-4 h-4" />
                支払い完了
              </div>
              <div className="text-gray-400">金額: {result.paymentInfo.amountPaid}</div>
              <div className="text-gray-400">Network: {result.paymentInfo.network}</div>
              <div className="font-mono text-gray-500 break-all">
                Tx: {result.paymentInfo.txHash.slice(0, 20)}...
              </div>
              <div className="text-gray-500">
                {new Date(result.paymentInfo.paidAt).toLocaleString("ja-JP")}
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-xs text-red-400">
              <div className="flex items-center gap-2 font-semibold mb-2">
                <AlertCircle className="w-4 h-4" />
                エラー
              </div>
              <pre className="whitespace-pre-wrap break-all">{error}</pre>
            </div>
          )}
        </div>

        {/* Right: Results */}
        <div className="lg:col-span-2 space-y-6">
          {!result && flowStep === "idle" && (
            <div className="h-64 flex flex-col items-center justify-center text-gray-600 border border-gray-800 rounded-xl">
              <Wallet className="w-12 h-12 mb-4 opacity-30" />
              <p className="text-sm">設定を入力して「バックテスト実行」を押してください</p>
              <p className="text-xs mt-2 text-gray-700">
                Nansen Smart Moneyウォレットをコピーした場合の収益をシミュレーション
              </p>
            </div>
          )}

          {result && (
            <>
              {/* KPI cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard
                  label="最終残高"
                  value={fmtUsd(result.endValue)}
                  sub={`開始: ${fmtUsd(result.startValue)}`}
                />
                <StatCard
                  label="総損益"
                  value={`${result.totalPnlUsd >= 0 ? "+" : ""}${fmtUsd(result.totalPnlUsd)}`}
                  sub={`${result.totalPnlPercent >= 0 ? "+" : ""}${fmt(result.totalPnlPercent)}%`}
                  positive={result.totalPnlUsd >= 0}
                />
                <StatCard
                  label="勝率"
                  value={`${fmt(result.winRate * 100, 0)}%`}
                  sub={`${result.walletResults.filter((w) => w.pnlUsd > 0).length}/${result.walletResults.length} wallets`}
                />
                <StatCard
                  label="シャープレシオ"
                  value={fmt(result.sharpeRatio)}
                  sub={`最大DD: ${fmt(result.maxDrawdown)}%`}
                />
              </div>

              {/* Chart */}
              <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
                <h3 className="font-semibold text-white mb-4">累積リターン</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "#6B7280", fontSize: 11 }}
                      tickFormatter={(v: string) => v.slice(5)}
                    />
                    <YAxis
                      tick={{ fill: "#6B7280", fontSize: 11 }}
                      tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      contentStyle={{ background: "#111827", border: "1px solid #374151" }}
                      formatter={(v) => [fmtUsd(Number(v)), ""]}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="portfolio"
                      name="Smart Money Copy"
                      stroke="#3B82F6"
                      dot={false}
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="benchmark"
                      name="BTC Benchmark"
                      stroke="#6B7280"
                      dot={false}
                      strokeWidth={1}
                      strokeDasharray="4 2"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Wallet breakdown */}
              <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
                <h3 className="font-semibold text-white mb-4">Smart Money Wallet 内訳</h3>
                <div className="space-y-3">
                  {result.walletResults.map((w) => (
                    <div key={w.address} className="border border-gray-800 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <div className="text-sm font-medium text-white">{w.label}</div>
                          <div className="font-mono text-xs text-gray-500">
                            {w.address.slice(0, 10)}…{w.address.slice(-6)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div
                            className={`text-sm font-bold ${
                              w.pnlUsd >= 0 ? "text-green-400" : "text-red-400"
                            }`}
                          >
                            {w.pnlUsd >= 0 ? "+" : ""}
                            {fmtUsd(w.pnlUsd)}
                          </div>
                          <div className="text-xs text-gray-500">
                            {fmt(w.allocation * 100, 0)}% alloc ·{" "}
                            {w.pnlPercent >= 0 ? "+" : ""}
                            {fmt(w.pnlPercent)}%
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        {w.topTokens.map((t) => (
                          <span
                            key={t.symbol}
                            className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded"
                          >
                            {t.symbol} {fmt(t.allocation * 100, 0)}%
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      <footer className="border-t border-gray-800 px-6 py-6 mt-4">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-gray-600">
          <div>Smart Money Backtest · Powered by Nansen API + x402 Protocol</div>
          <div className="flex items-center gap-4">
            <span>No login · No subscription · Pay-per-query</span>
            <a
              href="https://docs.x402.org"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-gray-400"
            >
              x402 docs <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
