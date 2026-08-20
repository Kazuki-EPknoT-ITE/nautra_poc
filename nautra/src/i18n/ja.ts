/**
 * i18n リソース（日本語）。
 * 製品名はこの PRODUCT_NAME キーからのみ参照する（基本設計書 1.6 / ガードレール⑨）。
 * 画面・コンポーネントへの製品名ハードコードは禁止。
 */
export const PRODUCT_NAME = "Nautra";
export const PRODUCT_NAME_KANA = "ノートラ";

export const t = {
  appSubtitle: "船員業務管理アプリケーション（PoC）",
  vesselApp: "船内アプリ",
  shoreApp: "陸上アプリ",

  workCategory: {
    navigation_watch: "航海当直",
    cargo: "荷役",
    standby: "スタンバイ（待機）",
    maintenance: "保守整備",
    other: "その他作業",
  } as Record<string, string>,

  action: {
    start: "開始",
    end: "終了",
  } as Record<string, string>,

  entryType: {
    realtime: "即時打刻",
    after: "後から打刻",
    resubmit: "差戻し再入力",
  } as Record<string, string>,

  level: {
    ok: "適合",
    caution: "注意",
    violation: "警告",
    none: "記録なし",
  } as Record<string, string>,

  check: {
    daily_max: "1日の労働時間上限",
    weekly_max: "連続1週間の労働時間上限",
    rest_total: "1日の休息時間合計",
    rest_split: "休息時間の分割回数",
    rest_longest: "最長休息時間",
  } as Record<string, string>,

  approval: {
    approved: "承認済",
    remanded: "差戻し",
    pending: "承認待ち",
  } as Record<string, string>,
} as const;
