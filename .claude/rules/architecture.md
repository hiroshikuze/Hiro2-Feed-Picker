# アーキテクチャ・処理フロー

## 処理フロー（`main.js`）

```
main()
  ├── getRssUrlFromSheet()          // 「RSS」シートのB列からURL取得
  ├── getKeywordsFromSheet()        // 「keywords」シートのA列からキーワード取得
  ├── fetchAndFilterRss()           // RSSフェッチ（並列）＋キーワードフィルタリング
  │     ├── fetchAllWithRetry()    // 並列フェッチ＋失敗分1回リトライ
  │     └── filterRssItems()       // XMLパース＋キーワード/日付フィルタ
  │           └── resolveRedirectUrl()  // Google News等のリダイレクトURLを実URLに解決
  │                 └── fetchGoogleNewsActualUrl()  // batchexecute APIで実URLを取得（AU_yqL形式）
  ├── getSentArticleUrls()          // 送信済みURLをスクリプトプロパティから取得し重複除外
  ├── getGeminiSummaryOfArticles()  // Gemini APIで記事を要約（失敗時リトライあり）
  ├── getUserIdsFromSheet()         // 「userId」シートのA列からLINEユーザーID取得
  ├── sendLineNotification()        // LINE Messaging API multicastで一斉送信（失敗時リトライあり）
  └── saveSentArticleUrls()         // 送信済みURLをスクリプトプロパティに保存
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
| `SENT_ARTICLE_URLS` | 送信済み記事URLのJSON配列（ボットが自動管理・手動設定不要） |

## Webhookエントリポイント

`doPost(e)` がLINEからのWebhookを受け取る。イベント種別に関わらずすべてのWebhookイベントでuserIdを `userId` シートへ自動登録する（重複チェックあり）。`appsscript.json` でウェブアプリとして `ANYONE_ANONYMOUS` 公開設定済み。

## 重複排除

同一記事が複数日にわたって送信されるのを防ぐ仕組み。

- `getSentArticleUrls()` でスクリプトプロパティ `SENT_ARTICLE_URLS` からURL配列を取得
- `fetchAndFilterRss()` 後に送信済みURLを除外してから Gemini に渡す
- 送信後に `saveSentArticleUrls()` で新URLを追記・保存（上限 `SENT_ARTICLE_URL_LIMIT` = 100件、超過分は古い順に削除）
- 読み書き失敗時は `sendOwnerNotification()` でオーナーに通知

## リダイレクトURL解決

`REDIRECT_URL_PATTERNS`（正規表現の配列）に一致するURLを `resolveRedirectUrl()` で実URLに解決してからLINEに送信する。

- 現在の対象: `news.google.com`（Google News RSSの `<link>` は有効期限付きリダイレクトURLのため）
- 解決失敗時は元のURLにフォールバック（処理は続行）
- 新しいドメインを追加する場合は `REDIRECT_URL_PATTERNS` に正規表現を追加する

### Google News URL の解決手順

1. URLパスから記事ID（`CBMi...` 部分）を抽出
2. Base64デコードして内部バイト列を解析
   - 旧形式：デコード結果に実URLが含まれる → そのまま返す
   - 新形式（`AU_yqL` プレフィックス）：`fetchGoogleNewsActualUrl()` で batchexecute API を呼び出す
3. `fetchGoogleNewsActualUrl()`:
   1. `https://news.google.com/articles/{articleId}` を GET して HTML を取得
   2. `data-n-a-sg`（signature）・`data-n-a-ts`（timestamp）を正規表現で抽出
   3. `/_/DotsSplashUi/data/batchexecute` に signature・timestamp・articleId を含む POST リクエスト
   4. レスポンス JSON から実URLを取得

> **注意**: batchexecute はドキュメント化されていない内部 API のため、Google の仕様変更で動作しなくなる可能性がある。その場合はフォールバックにより元の Google News URL が送信される。

## 外部通信のリトライ

ネットワーク瞬断・5xxエラー時のリトライ方針：

| 通信種別 | リトライ方式 |
|----------|------------|
| Gemini API | `fetchWithRetry()` で最大3回、1秒→2秒の指数バックオフ |
| LINE送信 | `fetchWithRetry()` で最大3回、1秒→2秒の指数バックオフ（二重送信の可能性あり） |
| RSSフィード取得 | `fetchAllWithRetry()` で並列フェッチ後、失敗分だけ1秒待ちで1回リトライ |
| リダイレクト解決（batchexecute） | リトライなし（失敗時は元URLにフォールバック） |

## LINE出力のテキスト整形

Geminiのレスポンスに含まれるMarkdown記法をLINE向けに変換している（`getGeminiSummaryOfArticles` 末尾）：
- `**bold**` → `"bold"`
- `###` → `■`
- `` `https://...` `` → `https://...`
- `[text](https://...)` → `text\nhttps://...`（テキスト≠URLのとき2行に分けて出力。LINEはMarkdown非対応で裸のURLのみ自動リンク化されるため）
- `[https://...](https://...)` → `https://...`（テキスト＝URLのとき重複を避けURLのみ出力）
