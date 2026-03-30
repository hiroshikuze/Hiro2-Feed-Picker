# アーキテクチャ・処理フロー

## 処理フロー（`main.js`）

```
main()
  ├── getRssUrlFromSheet()          // 「RSS」シートのB列からURL取得
  ├── getKeywordsFromSheet()        // 「keywords」シートのA列からキーワード取得
  ├── fetchAndFilterRss()           // RSSフェッチ＋キーワードフィルタリング
  ├── getGeminiSummaryOfArticles()  // Gemini APIで記事を要約
  ├── getUserIdsFromSheet()         // 「userId」シートのA列からLINEユーザーID取得
  └── sendLineNotification()        // LINE Messaging API multicastで一斉送信
```

エラーは `sendOwnerNotification()` でオーナーのLINEに通知する。

## スプレッドシートのシート構成

| シート名 | 用途 |
|----------|------|
| `RSS` | B列にRSSフィードURL（A列はラベル任意） |
| `keywords` | A列にキーワード。先頭 `-` でマイナスキーワード（除外） |
| `userId` | A列にLINEユーザーID。Webhook経由で自動追加 |

## キーワードフィルタリングのルール

- 正キーワード：記事タイトル＋説明のいずれかに1つでも含まれればマッチ（OR条件）
- マイナスキーワード（`-`プレフィックス）：含まれる記事を除外
- `-` 単体は無視される
- 正キーワードが0件の場合、`sendOwnerNotification('keywordsシートに正のキーワードがありません')` を送信して処理を終了

## スクリプトプロパティ（GAS管理画面で設定）

| キー | 内容 |
|------|------|
| `GEMINI_API_KEY` | Google Gemini APIキー |
| `GEMINI_PROMPT` | Geminiへの追加プロンプト（読者属性・関心など） |
| `LINE_ACCESS_TOKEN` | LINEチャネルアクセストークン |
| `LINE_OWNER_USER_ID` | 管理者のLINEユーザーID |

## Webhookエントリポイント

`doPost(e)` がLINEからのWebhookを受け取る。友だち追加イベント時にユーザーIDを `userId` シートへ自動登録する。`appsscript.json` でウェブアプリとして `ANYONE_ANONYMOUS` 公開設定済み。

## LINE出力のテキスト整形

Geminiのレスポンスに含まれるMarkdown記法をLINE向けに変換している（`getGeminiSummaryOfArticles` 末尾）：
- `**bold**` → `"bold"`
- `###` → `■`
- `` `https://...` `` → `https://...`
