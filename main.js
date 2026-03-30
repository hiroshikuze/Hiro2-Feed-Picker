"use strict";

/*
 * Hiro2 Feed Picker
 * 定期的にLINEにスプレッドシートに指定されたネタを提供します
 */

/**
 * LINE Messaging APIのエンドポイントURL。
 * @type {string}
 */
const LINE_API_URL = 'https://api.line.me/v2/bot/message/multicast';

/**
 * プロジェクトの設定（スクリプトプロパティ）から指定されたキーの値を取得する。
 * @param {string} key - 取得したいプロパティのキー。
 * @returns {string} 取得したプロパティの値。
 */
const getProperty = (key) => {
  return PropertiesService.getScriptProperties().getProperty(key);
};

/**
 * メイン関数、RSSフィードから記事を取得し、フィルタリング、要約、LINE通知までの一連の処理を実行する
 */
const main = () => {
  try {
    // 1. スプレッドシートから設定を読み込み
    const rssUrls = getRssUrlFromSheet();
    const targetKeywords = getKeywordsFromSheet();

    if (rssUrls.length === 0) {
      // URLがない場合は処理を中断
      sendOwnerNotification('「RSS」シートにURLが設定されていません。処理を中断します。');
      return;
    }
    if (targetKeywords.length === 0) {
      // キーワードがない場合は処理を中断
      sendOwnerNotification('「キーワード」シートに通知キーワードが設定されていません。処理を中断します。');
      return;
    }
    Logger.log("1:OK");

    // 2. RSSフィードの取得とフィルタリング
    const filteredArticles = fetchAndFilterRss(rssUrls, targetKeywords);

    if (filteredArticles.length === 0) {
      // sendOwnerNotification('該当する新しい記事はありませんでした。');
      Logger.log('該当する新しい記事はありませんでした。');
      return;
    }
    Logger.log("2:OK");

    // 3. 記事の要約と通知メッセージの作成
    const notifications = [];
    notifications.push(`📰 今日のネタ 📰\n\n${getGeminiSummaryOfArticles(filteredArticles)}`);
    Logger.log("3:OK");

    // 4. 通知先IDをシートから取得
    const userIds = getUserIdsFromSheet();
    Logger.log("4:OK");

    // 5. LINEへの通知送信
    if (notifications.length > 0) {
      notifications.forEach(msg => {
        sendLineNotification(userIds, msg);
      });
      sendOwnerNotification(`${filteredArticles.length}件、${userIds.length}名に送信しました。`);
    }
    Logger.log("5:OK");
  } catch (error) {
    const message = 'メイン処理中にエラーが発生しました: ' + error.toString();
    sendOwnerNotification(message);
  }
};

/**
 * Webhookイベント（LINEからメッセージが送られたとき）を受け取る関数
 */
const doPost = (e) => {
  const json = JSON.parse(e.postData.contents);
  const reply_token = json.events[0].replyToken;
  const userId = json.events[0].source.userId;

  // 検証で200を返すための取り組み
  if (typeof reply_token === 'underfined') {
    return;
  }

  sendOwnerNotification(JSON.stringify(e));
  // sendOwnerNotification(`reply_token:${reply_token}\nmessageId:${messageId}\nmessageType:${messageType}\nmessageText:${messageText}\userId:${userId}\n`);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("userId");
  if (!sheet) {
    throw new Error('「userId」シートが見つかりません。');
  }
  const values = sheet.getRange("A:A").getValues();
  var isDuplicate = false;

  // 既存の値と重複するか確認
  for (var i = 0; i < values.length; i++) {
    if (values[i][0] === userId) {
      isDuplicate = true;
      break;
    }
  }

  // 重複しない場合のみ追加
  if (!isDuplicate) {
    sheet.appendRow([userId]); // 末尾に新しい行として追加
    sendOwnerNotification(`新ユーザー追加しました:${userId}`);
    sendLineNotification([userId], "はじめまして、新規ユーザー登録を行いました。よろしくお願いいたします。");
  } else {
    sendLineNotification([userId], "既に登録済みです。");
  }
}

/**
 * スプレッドシートからRSS URLを取得する。
 * @returns {string[]} RSSフィードのURL配列。
 * @throws {Error} URLが空の場合にスローされる。
 */
const getRssUrlFromSheet = () => {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('RSS');
  if (!sheet) {
    throw new Error('「RSS」シートが見つかりません。');
  }

  // B列のデータ（空行を除く）を取得
  const values = sheet.getRange('B:B').getValues();
  // 値（url）のみを抽出し、空の行と重複を削除
  const rssUrls = values
    .map(row => String(row[0]).trim()) // 文字列に変換し、前後の空白を削除
    .filter(url => url !== ''); // 空のurlを除外
  if (!rssUrls.length === 0) {
    throw new Error('「RSS」シートにRSS URLが設定されていません。');
  }
  return rssUrls;
};

/**
 * スプレッドシートから通知キーワードの配列を取得する。
 * @returns {string[]} キーワードの配列。
 */
const getKeywordsFromSheet = () => {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('keywords');
  if (!sheet) {
    sendOwnerNotification('「keywords」シートが見つかりません。キーワードなしで続行します。');
    return [];
  }

  // A列のデータ（空行を除く）を取得
  const values = sheet.getRange('A:A').getValues();

  // 1列目の値（キーワード）のみを抽出し、空の行と重複を削除
  const keywords = values
    .map(row => String(row[0]).trim()) // 文字列に変換し、前後の空白を削除
    .filter(keyword => keyword !== ''); // 空のキーワードを除外

  // 重複を排除してから返す
  return [...new Set(keywords)];
};

/**
 * スプレッドシートの「userID」シートから通知ユーザーIDの配列を取得する。
 * @returns {string[]} 有効なユーザーIDの配列。
 */
const getUserIdsFromSheet = () => {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('userId');
  if (!sheet) {
    throw new Error('通知先リスト「userId」シートが見つかりません。');
  }

  // A列のデータ（空行を除く）を取得
  const range = sheet.getRange('A:A');
  const values = range.getValues();

  // 1列目の値（ユーザーID）のみを抽出し、空の行と重複を削除
  const userIds = values
    .map(row => String(row[0]).trim()) // 文字列に変換し、前後の空白を削除
    .filter(id => id.startsWith('U')); // Uから始まる有効なユーザーIDのみを抽出

  // 重複を排除してから返す
  const uniqueUserIds = [...new Set(userIds)];

  if (uniqueUserIds.length === 0) {
    throw new Error('「userId」シートに有効なユーザーIDが一つも設定されていません。');
  }

  return uniqueUserIds;
};

/**
 * 指定されたRSSフィードから記事を取得し、キーワードでフィルタリングする。
 * @param {string[]} urls - RSSフィードのURLの配列。
 * @param {string[]} keywords - フィルタリングに使用するキーワードの配列。
 *   先頭が `-` のキーワードはマイナスキーワード（除外条件）として扱われる。
 *   例: `["ケーキ", "-バナナ"]` → 「ケーキ」を含み、かつ「バナナ」を含まない記事のみ抽出。
 *   `-` 単体（スライス後に空文字になるもの）は無視する。
 * @returns {Array<{title: string, description: string, link: string}>} フィルタリングされた記事の配列。
 */
const fetchAndFilterRss = (urls, keywords) => {
  const filtered = [];

  // キーワードを正（含む）と負（除外）に分類する
  // "-" 単体（スライス後に空文字になるもの）は無視する
  const positiveKeywords = keywords.filter(k => !k.startsWith('-'));
  const negativeKeywords = keywords
    .filter(k => k.startsWith('-'))
    .map(k => k.slice(1))
    .filter(k => k.length > 0);

  if (positiveKeywords.length === 0) {
    sendOwnerNotification('keywordsシートに正のキーワードがありません');
    return filtered;
  }

  urls.forEach(url => {
    try {
      Logger.log(`${url}:${keywords}`);
      const feedText = UrlFetchApp.fetch(url).getContentText().trim();
      Logger.log("a");
      Logger.log(feedText);
      const document = XmlService.parse(feedText); // 修正後のテキストをパース
      const root = document.getRootElement();
      const channel = root.getChild('channel');

      Logger.log("b");
      if(channel === null) return;
      const items = channel.getChildren('item');

      Logger.log("c");
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1); // 過去24時間以内の記事のみを対象

      Logger.log("d");
      items.forEach(item => {
        const title = item.getChildText('title');
        const description = item.getChildText('description');
        const link = item.getChildText('link');
        const pubDate = new Date(item.getChildText('pubDate'));

        // 1. 公開日が過去24時間以内であること
        if (pubDate < oneDayAgo) return;

        // 2. キーワードに一致すること（正キーワードが1つ以上含まれ、マイナスキーワードを含まない）
        const content = (title + description).toLowerCase();
        const isMatch = positiveKeywords.some(keyword => content.includes(keyword.toLowerCase()));
        const isExcluded = negativeKeywords.some(keyword => content.includes(keyword.toLowerCase()));

        if (isMatch && !isExcluded) {
          filtered.push({ title, description, link });
        }
      });
      Logger.log("e");
    } catch (error) {
      const message = 'fetchAndFilterRssでエラーが発生しました: ' + error.toString();
      Logger.log(message);
    }
  });

  return filtered;
};

/**
 * Gemini APIを使用して記事をいい感じにまとめる。
 * @param {Array<{title: string, description: string, link: string}>} - フィルタリングされた記事の配列。
 * @returns {string} Geminiによってまとめた内容。
 */
const getGeminiSummaryOfArticles = (articles) => {
  const GEMINI_API_KEY = getProperty('GEMINI_API_KEY');
  const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + GEMINI_API_KEY;
  const DAYS = ["日", "月", "火", "水", "木", "金", "土"];

  let lineOfArticles = "";
  articles.forEach(article => {
    lineOfArticles += (lineOfArticles.length > 0 ? ", ":"") + `${article.title}|${article.description}|${article.link}`;
  });
  const today = new Date();
  const prompt = `これからいくつかの「URL|URL先のタイトル|URL先の概要, 」からなる情報を提供します。この情報を元としてLINE Messaging APIへ出力するのでMarkdown記法を使わず親しみやすく読みやすいよう加工してください。ただしURLは決して改変してはいけません。読まれる時間帯は本日${today.getFullYear()}年${today.getMonth()+1}月${today.getDate()}日（${DAYS[today.getDay()]}）。${getProperty('GEMINI_PROMPT')} ${lineOfArticles}`;
  Logger.log(prompt);

  const payload = {
    contents: [
      {
        parts: [
          { text: prompt }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.5
    }
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(API_URL, options);
  const json = JSON.parse(response.getContentText());

  if (json.candidates && json.candidates[0] && json.candidates[0].content) {
    return json.candidates[0].content.parts[0].text.trim().replace(/\*\*/g, '"').replace(/###/g, '■').replace(/`(https?:\/\/[^\s`]+)`/g, '$1');
  } else if (json.error) {
    sendOwnerNotification('Gemini APIエラー: ' + json.error.message);
    return '（要約エラーが発生しました。）';
  } else {
    sendOwnerNotification('Gemini APIから予期しない応答: ' + response.getContentText());
    return '（要約できませんでした。）';
  }
};

/**
 * LINE Messaging APIのmulticastエンドポイントを使用して複数ユーザーにメッセージを送信する。
 * @param {string[]} userIds - 通知を送信するユーザーIDの配列。
 * @param {string} message - 送信するテキストメッセージ。
 */
const sendLineNotification = (userIds, message) => {
  const LINE_ACCESS_TOKEN = getProperty('LINE_ACCESS_TOKEN');

  const payload = {
    to: userIds,
    messages: [
      {
        type: 'text',
        text: message
      }
    ]
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  Logger.log(options)
  UrlFetchApp.fetch(LINE_API_URL, options);
};

/**
 * 管理者向けにメッセージを送信しログに記録
 * @param {string} message - 送信するテキストメッセージ。
 */
const sendOwnerNotification = (message) => {
  const LINE_OWNER_USER_ID = [getProperty('LINE_OWNER_USER_ID')];

  Logger.log(message);
  sendLineNotification(LINE_OWNER_USER_ID, `🚨 Bot: ${message}`);
}