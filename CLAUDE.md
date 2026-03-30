# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## セッション開始時の必須確認

`.claude/revision_log.md` を読み、過去のミスパターンを把握してから作業を始める。

## 最重要原則

### 1. Plan Mode Default

3ステップ以上のタスクは実装前に計画を提示し、承認を得てから進む。

- **判定**: 変更ファイルが2つ以上or関数を新規追加する場合 → 計画を先に提示したか？

### 2. Self-Improvement Loop

ミスのパターンを `.claude/revision_log.md` に記録し、毎セッション冒頭で読み返す。

- **判定**: 誤った実装・誤解釈・見落としが発生した → revision_log.mdに追記したか？

### 3. Verification Before Done

完了前に「スタッフエンジニアが承認するレベルか」を自問する。

- **判定**: 変更後に自分でコードを読み直し、意図しない副作用がないことを確認したか？

### 4. Subagent Strategy

リサーチ・分析はサブエージェントに委譲し、メインコンテキストを保全する。

- **判定**: 調査対象が3ファイル以上or横断的な検索が必要 → Explore/Planサブエージェントを使ったか？

### 5. Demand Elegance

設計判断を含む変更では、力技の前に2〜3のアプローチを比較検討する（細かい修正は除く）。

- **判定**: 新機能・アーキテクチャ変更のとき → 複数案を提示したか？

### 6. Autonomous Bug Fixing

バグ報告時はまず自律的に調査・修正し、設計判断のみ確認を取る。

- **判定**: バグ修正で「どうすればいいですか？」と聞く前に、原因を特定して修正案を持っているか？

---

## プロジェクト概要

Google Apps Script (GAS) で動作するRSSキュレーションツール。スプレッドシートの設定に基づき、RSSフィードからキーワードにマッチする記事を抽出し、Gemini APIで要約してLINE Messaging APIで通知する。

ファイルは `main.js` と `appsscript.json` の2つのみ。

## デプロイ

```bash
npx clasp push
```

ローカルでテストを実行する仕組みは存在しない。テストはGASエディター上で `main` 関数を手動実行する。`.clasp.json`・`.clasprc.json` は `.gitignore` 対象。

## 詳細ルール

- アーキテクチャ・処理フロー → `.claude/rules/architecture.md`
- コーディング規約 → `.claude/rules/coding.md`
- Gitワークフロー → `.claude/rules/git.md`
