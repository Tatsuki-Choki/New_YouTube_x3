# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a YouTube Analytics Support Tool (YouTube運用支援webアプリ) built as a single-file React application. It helps users search YouTube videos based on specific criteria and analyze engagement metrics relative to channel subscriber counts.

## 現在の作業状況

### 2025年8月13日 実施内容
- プロジェクトの大規模クリーンアップを実施
- 不要ファイル25個以上を削除（スクリーンショット、デバッグスクリプト、重複ファイル等）
- TypeScript型注釈を完全に削除してJavaScriptに変換
- JSX構造の修復とHTML要素の整合性確保
- Vercelへのデプロイ成功

### 既知の問題
- ローカル環境でBabelトランスパイラエラーが発生中
- JSX閉じタグの不整合によるパースエラー
- React.Fragmentの使用に関する互換性問題

## TODO リスト

### 緊急度：高
- [ ] JSX構文エラーの完全修正（特にsectionタグの閉じタグ問題）
- [ ] Babelトランスパイラの警告対応
- [ ] favicon.icoファイルの追加

### 緊急度：中
- [ ] プロダクション用のビルドプロセス構築
- [ ] エラーハンドリングの改善
- [ ] APIキー管理のセキュリティ強化

### 緊急度：低
- [ ] パフォーマンス最適化
- [ ] アクセシビリティ改善
- [ ] レスポンシブデザインの最適化

## Architecture

### Single-File React Application
- **File**: `youtube-analytics-app.jsx`
- Self-contained React component with all logic, state management, and UI in one file
- Uses React hooks (useState, useEffect, useMemo) for state management
- No external build system required - designed to work with basic React setup

### Key Features
1. **Video Search**: Search YouTube videos with customizable filters (keywords, minimum views, country, time period)
2. **Engagement Analysis**: Identifies videos with views exceeding subscriber count by configurable ratios (1x, 2x, 3x)
3. **Shorts Filtering**: Can exclude, include, or show only YouTube Shorts
4. **Comment Extraction**: Fetches all comments for selected videos
5. **CSV Export**: Exports video lists and comments to CSV format

### YouTube API Integration
- Uses YouTube Data API v3
- Endpoints used:
  - `/search` - Find videos by keywords
  - `/videos` - Get video statistics and details
  - `/channels` - Get channel subscriber counts
  - `/commentThreads` - Fetch video comments
- API key stored in localStorage for persistence

### Data Processing
- **Shorts Detection**: Videos ≤60 seconds or containing #shorts tag
- **Ratio Calculation**: Compares view count to subscriber count
- **CSV Generation**: Custom implementation with proper escaping for commas and quotes

## 開発コマンド

### ローカル開発サーバー起動
```bash
# Python HTTPサーバーを使用
python3 -m http.server 8000

# ブラウザで以下にアクセス
# http://localhost:8000
```

### Vercelデプロイ
```bash
# プロダクション環境へデプロイ
vercel --prod

# プレビューデプロイ
vercel
```

### ファイル構成確認
```bash
# プロジェクト内のファイル一覧
ls -la

# 不要ファイルの確認
git status
```

## テスト方法

### Playwright MCPを使用したブラウザテスト
```bash
# ローカルサーバー起動後
# Playwright MCPでブラウザを開いて動作確認
mcp__playwright__browser_navigate
```

### 自動テスト機能
アプリケーション起動時に以下の自動テストが実行されます：
- CSV生成とエスケープ処理のテスト
- 動画時間のパースとショート動画判定のテスト
- 再生数比率しきい値の計算テスト
- 結果はフッター診断セクションに表示

## 重要な実装メモ

### 状態管理
- すべての状態管理はReact Hooksで実装
- useStateで検索条件と結果を管理
- useEffectでAPIキーの復元処理
- useMemoでパフォーマンス最適化

### エラーハンドリング
- APIエラーは日本語でユーザーフレンドリーに表示
- ネットワークエラーの適切な処理
- APIキー検証機能の実装

### データ処理
- コメント取得は100件ずつページネーション
- 国フィルタリングはYouTube API regionCodeパラメータを使用
- CSV出力は純粋関数として実装（テスト可能）

## プロジェクトファイル構成

```
/Users/tatsuki/Documents/Workspace/New_YouTube_x3/
├── index.html                    # エントリーポイント
├── youtube-analytics-app.jsx     # メインアプリケーション
├── vercel.json                   # Vercel設定
├── .gitignore                    # Git除外設定
└── CLAUDE.md                     # このドキュメント
```

## デプロイ情報

- **本番環境URL**: https://youtube-analytics-tool-black.vercel.app/
- **最新デプロイURL**: https://youtube-analytics-tool-dvy6hz1ta-tatsuki-chokis-projects.vercel.app/
- **デプロイプラットフォーム**: Vercel
- **ビルドコマンド**: なし（静的ファイル）
- **出力ディレクトリ**: ルート

## トラブルシューティング

### Babelトランスパイラ警告
```
You are using the in-browser Babel transformer.
```
**対処法**: プロダクション環境ではビルド済みのJSファイルを使用することを推奨

### JSX構文エラー
```
Expected corresponding JSX closing tag for <section>
```
**対処法**: HTMLタグの開始と終了が正しく対応しているか確認

### favicon.ico 404エラー
**対処法**: favicon.icoファイルをプロジェクトルートに追加