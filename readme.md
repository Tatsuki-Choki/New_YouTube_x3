# YouTube運用支援Webアプリ（MVP）README

最終更新: 2025-08-13（JST）

## 概要
YouTube運用者向けの調査を高速化するWebアプリのMVPです。指定キーワードと各種条件で動画を検索し、**直近期間内**に公開された動画から、
- **登録者比（1x/2x/3x）**: 再生数がチャンネル登録者数の何倍以上か（既定=3x）
- **最低再生数（既定=10,000）**
- **国指定（JP/US/IN/GB/DE/FR/BR/KR/指定なし）**
- **ショート動画の扱い（含めない/含める/のみ、既定=含めない）**
- **対象期間（3年/2年/1年/半年、既定=3年）**

でフィルタして一覧表示します。各動画のコメントは**全件取得**が可能で、一覧とコメントは**CSVエクスポート**できます。

> **MVP実装方針**: クライアントのみ（ブラウザ）でYouTube Data API v3に直接アクセス。APIキーはローカル（localStorage）に保存します。将来的にサーバープロキシへ移行可能です。

---

## 主な機能
- **APIキー管理**: ヘッダーで入力→疎通確認→有効化表示
- **検索条件**:
  - キーワード（空時は `薄毛 対策 シャンプー` を既定で使用）
  - 最低再生数（既定 10,000）
  - 国指定（検索は `regionCode`、表示フィルタは**チャンネル国**）
  - 対象期間（3年/2年/1年/半年）
  - 取得件数（50/20/10、既定 50）
  - ショートの扱い（含めない/含める/のみ。**強化判定**: 60s以下 or `#shorts`/タグ）
  - 登録者比しきい値（**1x/2x/3x**、既定 3x）
  - 登録者数非公開チャンネルの扱い（ON時は最低再生数で判定）
- **一覧表示**: サムネ（16:9固定）、タイトル、チャンネル、再生数、登録者数、高評価、公開日、国、操作
- **チェックボックス選択**: 各行の**左端**（サムネ左）に配置、縦位置はサムネ中央揃え
- **コメント取得**: 動画ごとに全件取得、**行直下にスクロール表示**
- **CSV出力**: 一覧CSV、動画ごとのコメントCSV、**選択した複数動画のコメントCSV**
- **セルフテスト**: フッター「Diagnostics」に内部テスト結果を表示（CSV生成・Shorts判定・期間計算・登録者比判定）

---

## 技術スタック
- **フロント**: React + TypeScript（コンポーネント単一ファイル）
- **UI**: Tailwind（キャンバス上のプレビューは内蔵）、アイコン: `lucide-react`
- **外部API**: YouTube Data API v3（`search.list` / `videos.list` / `channels.list` / `commentThreads.list`）

---

## 動かし方
### A. Next.js（推奨）
1) プロジェクト作成
```bash
npx create-next-app@latest yt-research --ts --eslint --tailwind --app --import-alias "@/*"
cd yt-research
npm i lucide-react
```
2) キャンバスの **React単一ファイル**（`YouTube運用支援Webアプリ MVP（React単一ファイル）`）のコードを、`app/page.tsx` に貼り付け。
   - 先頭に `"use client";` を付与してください。
3) 開発起動
```bash
npm run dev
```
4) ブラウザで `http://localhost:3000` を開く → ヘッダーにAPIキーを入力 → 「保存/疎通」。

### B. Vite（軽量）
```bash
npm create vite@latest yt-research -- --template react-ts
cd yt-research
npm i
npm i lucide-react
# Tailwind を利用する場合は公式手順に従って設定
npm run dev
```
`src/App.tsx` をキャンバスのコンポーネントで置き換えます。

> **APIキー**はブラウザに保存（localStorage）します。チーム共有や秘匿が必要な場合は、サーバープロキシ（後述）をご利用ください。

---

## 設定と仕様詳細
### 1) 国指定
- UIの選択肢: 指定なし / 日本(JP) / アメリカ(US) / インド(IN) / イギリス(GB) / ドイツ(DE) / フランス(FR) / ブラジル(BR) / 韓国(KR)
- **検索**: `search.list` の `regionCode` に付与（地域関連性の向上）
- **表示フィルタ**: `channels.snippet.country`（チャンネル国）で厳密一致

### 2) ショート動画の判定
- **強化ヒューリスティック**（いずれかを満たすとShorts）
  - `videos.contentDetails.duration` ≤ **61秒**（1秒のバッファ）
  - タイトル/説明文に **`#shorts`** を含む、または `snippet.tags` に `shorts` を含む
- 検索条件で**含めない/含める/のみ**を選択可能（既定=含めない）

### 3) 登録者比しきい値
- **1x / 2x / 3x**（既定=3x）
- `includeHidden` がOFFのとき → 選択しきい値で判定
- `includeHidden` がONのとき → 登録者数非公開チャンネルも対象、**最低再生数**のみで判定

### 4) 期間と件数
- 期間: 直近 **3年/2年/1年/半年**（ISO8601で `publishedAfter` を算出）
- 取得件数: **50（既定）/20/10**（ページングはMVPでは1ページ分のみ）

### 5) CSV仕様
- **一覧CSV**: `videoId,title,channelId,channelTitle,publishedAt,viewCount,subscriberCount,likeCount,country,videoUrl,thumbnailUrl,matchedRule,keywords,searchedAt`
- **コメントCSV**: `videoId,commentId,parentId,authorDisplayName,textOriginal,likeCount,publishedAt,updatedAt`
- 文字コード: UTF-8（BOM付与は必要に応じて拡張）

---

## セキュリティとプライバシー
- APIキーは**ブラウザのlocalStorage**に保存（MVP）。実運用では**サーバープロキシ**（KMSで暗号化保管、レート制限）への移行を推奨。
- 取得データにPIIが含まれる可能性があるため、エクスポートや共有時の取り扱いに注意してください。

---

## 既知の制約（MVP）
- `search.list` は最大50件を1回のみ取得（次ページ取得は未実装）
- コメント取得は動画ごとにオンデマンド（一覧一括取得は未実装）
- 「投稿国」はAPIが持たないため**チャンネル国**を代理指標として使用

---

## よくあるエラーと対処
- **`400 invalidKey`**: APIキーが誤っています → キーを再確認
- **`403 quotaExceeded`**: クォータ超過 → 翌日待機 or プロジェクトの割当を増加
- **`403 commentsDisabled`**: コメントが無効 → 当該動画は取得不可
- **`403 accessNotConfigured`**: APIが有効化されていない → GCPコンソールで YouTube Data API v3 を有効化

---

## 発展アイデア（ロードマップ）
- **サーバープロキシ**: APIキーのサーバ保管、キャッシュ、レート制限、監査ログ
- **並び替え強化**: 公開日/高評価/3x成立優先など
- **一括コメント取得**: 選択行に対するバッチ取得
- **保存検索/定期実行**: 差分検知と通知
- **分析**: コメント感情分析、タグ/キーワード抽出、スプレッドシート連携

---

## ライセンス
社内利用/クライアント案件前提。オープンソース化する場合は別途ライセンスファイルを追加してください。

---

## メンテナンス
- 依存更新: 半年ごとにライブラリの更新確認
- YouTube APIの仕様変更時は`part`/レスポンス項目の追従が必要

---

## 連絡先
不具合/要望はプロジェクトのIssueトラッカー、または担当エンジニア宛に連絡してください。

