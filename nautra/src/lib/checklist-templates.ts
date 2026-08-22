import type { ChecklistTemplateId } from "@/sync-protocol/records";

/**
 * チェックリストテンプレート（checklist_templates 相当。PoC では定数）。
 * 本番ではテナントごとにテンプレートを定義し、版（version）を結果に保持して
 * テンプレート改定後も結果の意味が追えるようにする（基本設計書 5.2「船内記録」）。
 */
export interface ChecklistTemplateItem {
  key: string;
  group: string;
  label: string;
}

export interface ChecklistTemplate {
  id: ChecklistTemplateId;
  version: string;
  name: string;
  description: string;
  items: ChecklistTemplateItem[];
}

export const CHECKLIST_TEMPLATES: Record<ChecklistTemplateId, ChecklistTemplate> = {
  pre_departure: {
    id: "pre_departure",
    version: "2026-04.1",
    name: "出港前点検",
    description: "船体・機関・航海計器・救命設備の出港前チェック（要件定義書 3.3.2）",
    items: [
      { key: "hull_exterior", group: "船体", label: "船体外観・喫水・水密扉/ハッチの閉鎖" },
      { key: "mooring", group: "船体", label: "係船索・揚錨機・舷梯の状態" },
      { key: "bilge", group: "船体", label: "ビルジ量・排水設備" },
      { key: "me_prestart", group: "機関", label: "主機 始動前確認（潤滑油・冷却水・燃料）" },
      { key: "generator", group: "機関", label: "発電機・配電盤の異常なし" },
      { key: "steering_test", group: "機関", label: "操舵装置の作動試験" },
      { key: "radar", group: "航海計器", label: "レーダー・ECDIS/GPS・AIS の作動" },
      { key: "compass", group: "航海計器", label: "コンパス・舵角指示器・速力計" },
      { key: "nav_lights", group: "航海計器", label: "航海灯・信号灯・汽笛" },
      { key: "radio", group: "航海計器", label: "VHF 無線・非常通信設備" },
      { key: "lifejackets", group: "救命設備", label: "救命胴衣・救命浮環（数量・位置）" },
      { key: "liferaft", group: "救命設備", label: "救命いかだ/艇・離脱装置" },
      { key: "fire_ext", group: "救命設備", label: "消火器・消火ホース・火災探知装置" },
      { key: "emergency_light", group: "救命設備", label: "非常照明・非常脱出経路の表示" },
    ],
  },
  safety_patrol: {
    id: "safety_patrol",
    version: "2026-04.1",
    name: "安全パトロール",
    description: "船内巡視による安全状態の確認（要件定義書 3.3.2）",
    items: [
      { key: "passage", group: "船内", label: "通路・階段の整理整頓・滑り止め" },
      { key: "handrail", group: "船内", label: "手すり・作業灯・足場の状態" },
      { key: "hazmat", group: "船内", label: "危険物・塗料・ガスボンベの保管" },
      { key: "fire_equipment", group: "防火", label: "消火設備の位置表示・点検票" },
      { key: "smoking", group: "防火", label: "喫煙場所の遵守・火気管理" },
      { key: "galley", group: "居住区", label: "調理室の火気・換気・衛生" },
      { key: "ppe", group: "作業", label: "保護具（ヘルメット・安全帯・救命胴衣）の着用" },
    ],
  },
};
