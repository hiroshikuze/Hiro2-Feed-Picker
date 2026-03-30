# コーディング規約

GAS（Google Apps Script）環境固有の制約と、このプロジェクトの規約を Yes/No で判定できる形で記述する。

## 関数・コード構造

- 関数は単一責務か？（1関数＝1つの役割）
- 関数本体は50行以内か？
- `const` で宣言されたアロー関数を使っているか？（`function` 宣言は使わない）
- ループ・条件分岐はネストが3段階以内か？

## エラー処理

- GASの外部API呼び出し（`UrlFetchApp.fetch`）は `try/catch` で囲んでいるか？
- エラー発生時は `sendOwnerNotification()` でオーナーに通知しているか？
- ユーザーに見せるべきでない内部エラーを LINE に直接送っていないか？

## スプレッドシート操作

- シート取得後に `null` チェックをしているか？（`if (!sheet) throw new Error(...)`）
- 範囲取得は列全体（`A:A`）を使い、固定行数に依存していないか？
- 取得した値は `.trim()` で前後空白を除去しているか？
- 重複除去に `Set` を使っているか？

## キーワードフィルタリング

- マイナスキーワード（`-`プレフィックス）を正キーワードと混在して処理していないか？
- `content.includes(keyword)` の前に `toLowerCase()` を両辺に適用しているか？
- 空文字キーワード（`-` 単体のスライス後）を除去しているか？

## GAS 固有

- `PropertiesService.getScriptProperties().getProperty(key)` を直接呼ばず `getProperty()` ラッパーを使っているか？
- `UrlFetchApp.fetch` の `muteHttpExceptions: true` を設定し、HTTPエラーをコードで処理しているか？
- `SpreadsheetApp.getActiveSpreadsheet()` は関数の先頭で1回だけ呼んでいるか？（ループ内で呼ばない）

## 追加・削除しない原則

- 依頼されていない機能・リファクタリング・コメントを追加していないか？
- 既存の動作を変えずに済む修正で、既存コードを削除していないか？
