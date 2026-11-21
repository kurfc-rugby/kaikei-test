// 会計アプリの入口の設定（画面と Service Worker の両方が読む）— テスト環境（練習データ）用
//   APP：画面に表示する会計アプリ（Apps Script のWebアプリ）。/a/~/ は、複数のGoogleアカウントでログイン中でも開けるようにするため
//   API：同じWebアプリ（ログインなしで呼べる形）。画面のファイルの受け取り（doGet ?raw=）・画面からの呼び出し（doPost {rpc}）・
//        Service Worker が通知の中身を取りに行く先（doPost pushInbox）
//   APP_ORIGIN：会計アプリの画面が動く場所（この場所からのメッセージだけを受け付ける）
self.KAIKEI = {
  APP: 'https://script.google.com/a/~/macros/s/AKfycbzgbQ-vzL__7ypAaGkwarred1OK0d42Bli5TTIZR8Cp6Fv4r6VULLgfICdopVilCXQ2/exec',
  API: 'https://script.google.com/macros/s/AKfycbzgbQ-vzL__7ypAaGkwarred1OK0d42Bli5TTIZR8Cp6Fv4r6VULLgfICdopVilCXQ2/exec',
  // NS：端末に残すもの（ログインなど）を本番と分ける名前。本番の入口では付けない
  NS: 'test',
  APP_ORIGIN: /^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/,
};
