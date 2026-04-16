# Smart Money Backtest — Nansen × x402

> **ログイン不要・サブスク不要。$0.10 USDC を払うだけで、Nansen Smart Money ウォレットのコピートレード成績をシミュレーションできる Web アプリ。**

---

## これは何？

[Nansen](https://nansen.ai) が提供する「Smart Money」ウォレットデータと、HTTP レベルで暗号通貨決済を実現する **x402 プロトコル** を組み合わせたプロダクトのデモ実装です。

「1,000 USDC を持っていて、30日前に Smart Money ウォレットをコピーしていたら今いくらになっていたか？」を、ウォレット接続 → $0.10 USDC 支払い → 結果表示、という流れで体験できます。

---

## x402 とは

x402 は HTTP の 402 ステータスコード（"Payment Required"）を拡張した決済プロトコルです。

```
① クライアント → GET /api/backtest
② サーバー    ← 402 Payment Required
               { price: "$0.10", network: "base-sepolia", payTo: "0x..." }
③ ウォレット  → USDC を Facilitator へ送金
④ Facilitator → 支払い証明をサーバーへ
⑤ サーバー    ← 200 OK + バックテスト結果
```

**従来方式との違い**

| | 従来（API キー） | x402 |
|---|---|---|
| 登録 | メール登録 + クレカ登録 | 不要 |
| 認証 | API キーをヘッダーに付与 | 自動支払い |
| 課金 | 月額サブスク | クエリごと従量 |
| AI エージェント対応 | 人間が事前設定必須 | 完全自律 |

---

## 機能

- **バックテストエンジン** — Equal Weight / Top Performer / Momentum の 3 戦略
- **累積リターングラフ** — Smart Money Copy vs BTC ベンチマーク
- **KPI カード** — 最終残高・総損益・勝率・シャープレシオ・最大ドローダウン
- **Wallet 内訳** — ウォレット別 PnL とトークンアロケーション
- **x402 フロービジュアライザー** — 支払いフローをリアルタイムでアニメーション表示
- **支払いレシート** — tx ハッシュ付きで $0.10 支払い記録を表示

---

## 技術スタック

| 役割 | 技術 |
|---|---|
| フレームワーク | Next.js 16 App Router |
| 言語 | TypeScript |
| スタイル | Tailwind CSS |
| チャート | Recharts |
| 決済 | x402-next (`withX402`) |
| データ | Nansen API（未設定時はモックデータ） |
| ウォレット | Coinbase CDP（Onramp 連携） |

---

## ディレクトリ構成

```
├── app/
│   ├── page.tsx                    # メイン UI
│   └── api/
│       ├── backtest/route.ts       # x402 課金ゲート付きエンドポイント
│       └── x402/session-token/     # CDP Onramp 連携
├── lib/
│   ├── nansen.ts                   # Nansen API クライアント（mock フォールバック付き）
│   └── backtest.ts                 # バックテスト計算ロジック
└── .env.local.example              # 環境変数テンプレート
```

---

## セットアップ

### 1. リポジトリをクローン

```bash
git clone https://github.com/kato9292929/nansen_x402.git
cd nansen_x402
npm install
```

### 2. 環境変数を設定

```bash
cp .env.local.example .env.local
```

`.env.local` を編集：

```env
# Nansen API キー — https://nansen.ai/api
NANSEN_API_KEY=your_nansen_api_key_here

# 支払い受取アドレス（自分のウォレットアドレス）
PAYMENT_RECIPIENT_ADDRESS=0xYourWalletAddressHere

# Coinbase CDP（Onramp 連携・任意）
CDP_API_KEY_ID=
CDP_API_KEY_SECRET=
```

> **Nansen API キーがなくても動きます。** モックデータで全機能（x402 フロー可視化・グラフ・Wallet 内訳）を確認できます。

### 3. 起動

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) を開いてください。

---

## x402 の実装ポイント

バックエンドは `withX402` を被せるだけで課金保護できます：

```ts
// app/api/backtest/route.ts
import { withX402 } from "x402-next";

async function handler(req: NextRequest) {
  // ここに来た時点で支払い済み
  const data = await getNansenData();
  return NextResponse.json(data);
}

export const GET = withX402(
  handler,
  "0xYourAddress",
  {
    price: "$0.10",
    network: "base-sepolia",
  }
);
```

支払いが完了するまでサーバーは 402 を返し続けます。検証が通った瞬間に `handler` が呼ばれ、Nansen API を叩いて結果を返します。

---

## Vercel へのデプロイ

```bash
npx vercel --prod
```

デプロイ後、Vercel の Environment Variables に `.env.local` の内容を設定してください。

[x402 Bazaar](https://x402.org/bazaar) にエンドポイントを登録すると、AI エージェントからも自律的にアクセスされるようになります。

---

## ライセンス

MIT
