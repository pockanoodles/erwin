// Every string on the landing page, both languages, behind one Dict, so a
// missing translation is a type error instead of English on /erwin/ja.
// Claims here describe what the product does today; check the code before
// adding one.

export type Locale = "en" | "ja";

export type ShotId = "today" | "focus" | "calendar" | "tasks";

export interface Dict {
  meta: { title: string; description: string };
  nav: { how: string; app: string; data: string; install: string; github: string; label: string };
  hero: {
    label: string;
    statement: string;
    sub: string;
    cta: { mac: string; windows: string; linux: string; other: string };
    more: string;
    dial: { caption: string; now: string; next: string; free: string };
  };
  how: { eyebrow: string; title: string; steps: { title: string; body: string }[] };
  app: { eyebrow: string; title: string; note: string; shots: Record<ShotId, { tab: string; caption: string; alt: string }> };
  data: { eyebrow: string; title: string; body: string; points: string[] };
  install: {
    eyebrow: string;
    title: string;
    sub: string;
    soon: string;
    live: string;
    copy: string;
    copied: string;
    groups: Record<"mac" | "windows" | "linux" | "server", string>;
  };
  open: { eyebrow: string; title: string; body: string; cta: string; by: string; more: string };
  footer: { rights: string; license: string; source: string; privacy: string; portfolio: string; product: string; maker: string };
  menu: { menu: string; close: string; items: { href: string; label: string }[] };
}

const en: Dict = {
  meta: {
    title: "Erwin: the one thing to do next",
    description:
      "Erwin reads your calendar, your Canvas courses and your goals, then tells you the one thing to do next. It is free, open source and keeps your data on your machine.",
  },
  nav: { how: "How it works", app: "The app", data: "Your data", install: "Download", github: "GitHub", label: "Erwin" },
  hero: {
    label: "Open source · MIT",
    statement: "What should I do right now?",
    sub: "Erwin reads your calendar, your Canvas courses and your goals, then names the one thing to do next.",
    cta: { mac: "Download for macOS", windows: "Download for Windows", linux: "Download for Linux", other: "Download Erwin" },
    more: "or see every way to install",
    dial: { caption: "Example day", now: "Now", next: "Next", free: "Free until" },
  },
  how: {
    eyebrow: "How it works",
    title: "Erwin does three things before it shows you anything.",
    steps: [
      {
        title: "It reads what you already use.",
        body: "It connects to Google, Outlook and CalDAV calendars, to Canvas with each assignment's grade weight, and to the goals you set for the next two months.",
      },
      {
        title: "It ranks by what is at stake.",
        body: "Due dates, grade weight and goal importance go into a fixed formula you can read, so the order never changes for a reason you cannot see.",
      },
      {
        title: "It shows you one thing.",
        body: "Focus mode puts the next task, its course materials and its deadline on one screen, with done, skip and later one key away.",
      },
    ],
  },
  app: {
    eyebrow: "The app",
    title: "Every screen answers the same question.",
    note: "Example data",
    shots: {
      today: { tab: "Today", caption: "Today ranks everything open, so the top row is always the one to start.", alt: "The Today screen: a ranked list of open tasks with the overdue one first." },
      focus: { tab: "Focus", caption: "Focus clears the screen down to one task and the deadline it is racing.", alt: "The Focus screen: one task with its course, its materials and a countdown." },
      calendar: { tab: "Calendar", caption: "The calendar holds your classes and meetings, and tasks drag into the open time.", alt: "The Calendar week view with classes and scheduled tasks." },
      tasks: { tab: "Tasks", caption: "Tasks read like a spreadsheet, with dense rows and a bar that shows the whole cell.", alt: "The Tasks list in dense rows with due dates and estimates." },
    },
  },
  data: {
    eyebrow: "Your data",
    title: "Your data stays on your machine.",
    body: "The desktop app runs its own database inside the app, so there is no account to make and no server to trust. Erwin only talks to the services you connect, such as Canvas and your calendars.",
    points: [
      "There is no account, because the app signs you in by itself.",
      "Nothing reports back, since Erwin has no analytics and no tracking.",
      "Connected accounts are stored encrypted on disk with AES-256-GCM.",
      "Self-host the server with Docker to reach the same data from every device.",
    ],
  },
  install: {
    eyebrow: "Download",
    title: "Get Erwin wherever you work.",
    sub: "Every channel ships the same build from the same GitHub release.",
    soon: "Soon",
    live: "Available",
    copy: "Copy",
    copied: "Copied",
    groups: { mac: "macOS", windows: "Windows", linux: "Linux", server: "Self-host" },
  },
  open: {
    eyebrow: "Open source",
    title: "Erwin is free and open source.",
    body: "The code is MIT licensed on GitHub.",
    cta: "View the source on GitHub",
    by: "Made by Kaito Soeno.",
    more: "See more of my work",
  },
  footer: { rights: "© 2026 Kaito Soeno", license: "MIT License", source: "Source", privacy: "Privacy", portfolio: "Portfolio", product: "Erwin", maker: "Kaito Soeno" },
  menu: {
    menu: "Menu",
    close: "Close",
    items: [
      { href: "/", label: "Contact" },
      { href: "/portfolio", label: "Portfolio" },
      { href: "/experience", label: "Experience" },
      { href: "/about", label: "About" },
    ],
  },
};

const ja: Dict = {
  meta: {
    title: "Erwin｜次にやるべきことを、ひとつだけ",
    description:
      "Erwin はカレンダー、Canvas の課題、目標を読み取り、次にやるべきことをひとつだけ示します。無料のオープンソースで、データはあなたのマシンに残ります。",
  },
  nav: { how: "しくみ", app: "アプリ", data: "データ", install: "ダウンロード", github: "GitHub", label: "Erwin" },
  hero: {
    label: "オープンソース · MIT",
    statement: "今、何をやるべきか。",
    sub: "Erwin はカレンダー、Canvas の課題、目標を読み取り、次にやるべきことをひとつだけ示します。",
    cta: { mac: "macOS 版をダウンロード", windows: "Windows 版をダウンロード", linux: "Linux 版をダウンロード", other: "Erwin をダウンロード" },
    more: "インストール方法をすべて見る",
    dial: { caption: "1 日の例", now: "今", next: "次", free: "空き時間" },
  },
  how: {
    eyebrow: "しくみ",
    title: "画面に出す前に、Erwin は 3 つのことをします。",
    steps: [
      {
        title: "いつものツールを読み取ります。",
        body: "Google・Outlook・CalDAV のカレンダー、成績の配分つきの Canvas の課題、そしてこれからの 2 か月の目標を読み込みます。",
      },
      {
        title: "かかっているものの大きさで並べます。",
        body: "締め切り、成績への影響、目標の重要度を、誰でも読める固定の式で計算するので、見えない理由で順番が変わることはありません。",
      },
      {
        title: "ひとつだけ見せます。",
        body: "フォーカスモードでは、次のタスクと授業資料と締め切りが 1 画面に並び、完了・スキップ・あとでがキーひとつで選べます。",
      },
    ],
  },
  app: {
    eyebrow: "アプリ",
    title: "どの画面も、同じ問いに答えます。",
    note: "サンプルデータ",
    shots: {
      today: { tab: "今日", caption: "未完了のタスクをすべて順位づけするので、いちばん上の行から始めれば大丈夫です。", alt: "今日の画面。期限切れのタスクを先頭に、未完了のタスクが順位順に並んでいる。" },
      focus: { tab: "フォーカス", caption: "画面をひとつのタスクと、その締め切りまでの時間だけにします。", alt: "フォーカス画面。ひとつのタスクと授業、資料、残り時間が表示されている。" },
      calendar: { tab: "カレンダー", caption: "授業や予定が並び、空いた時間にタスクをドラッグできます。", alt: "授業と予定のタスクが入った週表示のカレンダー。" },
      tasks: { tab: "タスク", caption: "スプレッドシートのような密な行と、セルの全文を見せるバーで読めます。", alt: "締め切りと所要時間つきの密な行で並ぶタスク一覧。" },
    },
  },
  data: {
    eyebrow: "データ",
    title: "データは、あなたのマシンの中に。",
    body: "デスクトップ版はアプリの中で自前のデータベースを動かすので、作るべきアカウントも信頼すべきサーバーもありません。Erwin が通信するのは、Canvas やカレンダーなど、あなたが接続したサービスだけです。",
    points: [
      "アプリが自動でサインインするので、アカウントは不要です。",
      "解析やトラッキングはなく、どこにもデータを送り返しません。",
      "接続したアカウントの情報は、AES-256-GCM で暗号化して保存します。",
      "Docker でサーバーをセルフホストすれば、どのデバイスからも同じデータを使えます。",
    ],
  },
  install: {
    eyebrow: "ダウンロード",
    title: "使う場所で、Erwin を。",
    sub: "どの配布先にも、同じ GitHub リリースから同じビルドを届けます。",
    soon: "準備中",
    live: "公開中",
    copy: "コピー",
    copied: "コピーしました",
    groups: { mac: "macOS", windows: "Windows", linux: "Linux", server: "セルフホスト" },
  },
  open: {
    eyebrow: "オープンソース",
    title: "Erwin は無料のオープンソースです。",
    body: "コードは MIT ライセンスで GitHub に公開しています。",
    cta: "GitHub でソースを見る",
    by: "制作は Kaito Soeno です。",
    more: "ほかの作品を見る",
  },
  footer: { rights: "© 2026 Kaito Soeno", license: "MIT License", source: "ソース", privacy: "プライバシー", portfolio: "作品", product: "Erwin", maker: "Kaito Soeno" },
  menu: {
    menu: "メニュー",
    close: "閉じる",
    items: [
      { href: "/ja", label: "お問い合わせ" },
      { href: "/ja/portfolio", label: "作品" },
      { href: "/ja/experience", label: "経歴" },
      { href: "/ja/about", label: "プロフィール" },
    ],
  },
};

export const copy: Record<Locale, Dict> = { en, ja };
