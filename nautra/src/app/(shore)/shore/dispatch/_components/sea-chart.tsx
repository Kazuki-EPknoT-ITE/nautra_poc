import {
  CHART_BOUNDS,
  CHART_SIZE,
  chartLatLines,
  chartLonLines,
  MAJOR_PORTS,
  projectToChart,
} from "@/lib/position-plain";

export interface ChartVessel {
  vesselId: string;
  vesselName: string;
  lat: number;
  lon: number;
  courseDeg?: number;
  /** 航跡（古い順） */
  track: { lat: number; lon: number }[];
  /** 観測が古いか（古いものは輪郭だけで描き、注記を添える） */
  stale: boolean;
}

/**
 * 簡易海図（要件定義書 3.7.1 の「地図上での一覧表示」の PoC 実装）。
 *
 * 外部の地図ライブラリ・タイルは使わない（オフライン前提・CSP）。
 * 日本近海の矩形（北緯30〜46度 / 東経128〜146度）に緯度経度を線形写像した inline SVG で、
 * 現在地を点、航跡を線で描く。海岸線は描かず、緯度経度のグリッドと主要港のラベルを
 * 位置を読む手がかりにする。
 *
 * **色で意味を作らない**（白黒 + 形で船を区別する）。座標の計算は position-plain.ts の純関数。
 */
const SHAPES = ["circle", "square", "triangle"] as const;

export function SeaChart({ vessels }: { vessels: ChartVessel[] }) {
  const latLines = chartLatLines();
  const lonLines = chartLonLines();

  return (
    <figure className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${CHART_SIZE.width} ${CHART_SIZE.height}`}
        className="h-auto w-full max-w-3xl text-foreground"
        role="img"
        aria-label={`日本近海の簡易海図。${vessels
          .map((v) => `${v.vesselName} は 北緯${v.lat.toFixed(2)}度 東経${v.lon.toFixed(2)}度`)
          .join("、")}`}
      >
        <rect
          x={0}
          y={0}
          width={CHART_SIZE.width}
          height={CHART_SIZE.height}
          fill="currentColor"
          fillOpacity={0.04}
          stroke="currentColor"
          strokeOpacity={0.35}
        />

        {/* 緯度・経度のグリッド（2度おき） */}
        {latLines.map((lat) => {
          const { y } = projectToChart(lat, CHART_BOUNDS.minLon);
          return (
            <g key={`lat-${lat}`}>
              <line
                x1={0}
                y1={y}
                x2={CHART_SIZE.width}
                y2={y}
                stroke="currentColor"
                strokeOpacity={0.14}
              />
              <text x={6} y={y - 6} fontSize={16} fill="currentColor" fillOpacity={0.55}>
                北緯{lat}度
              </text>
            </g>
          );
        })}
        {lonLines.map((lon) => {
          const { x } = projectToChart(CHART_BOUNDS.maxLat, lon);
          return (
            <g key={`lon-${lon}`}>
              <line
                x1={x}
                y1={0}
                x2={x}
                y2={CHART_SIZE.height}
                stroke="currentColor"
                strokeOpacity={0.14}
              />
              <text
                x={x + 4}
                y={CHART_SIZE.height - 8}
                fontSize={16}
                fill="currentColor"
                fillOpacity={0.55}
              >
                東経{lon}度
              </text>
            </g>
          );
        })}

        {/* 主要港（現在地を読む目印） */}
        {MAJOR_PORTS.map((p) => {
          const { x, y } = projectToChart(p.lat, p.lon);
          return (
            <g key={p.name}>
              <line x1={x - 7} y1={y} x2={x + 7} y2={y} stroke="currentColor" strokeOpacity={0.7} />
              <line x1={x} y1={y - 7} x2={x} y2={y + 7} stroke="currentColor" strokeOpacity={0.7} />
              <text x={x + 10} y={y + 20} fontSize={19} fill="currentColor" fillOpacity={0.8}>
                {p.name}
              </text>
            </g>
          );
        })}

        {/* 航跡と現在地 */}
        {vessels.map((v, i) => {
          const shape = SHAPES[i % SHAPES.length];
          const pts = v.track.map((t) => projectToChart(t.lat, t.lon));
          const here = projectToChart(v.lat, v.lon);
          const rad = ((v.courseDeg ?? 0) - 90) * (Math.PI / 180);
          return (
            <g key={v.vesselId}>
              {pts.length > 1 ? (
                <polyline
                  points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeDasharray="10 8"
                  strokeOpacity={0.65}
                />
              ) : null}
              {pts.slice(0, -1).map((p, j) => (
                <circle
                  key={`${v.vesselId}-t${j}`}
                  cx={p.x}
                  cy={p.y}
                  r={4}
                  fill="currentColor"
                  fillOpacity={0.4}
                />
              ))}
              {v.courseDeg !== undefined ? (
                <line
                  x1={here.x}
                  y1={here.y}
                  x2={here.x + Math.cos(rad) * 42}
                  y2={here.y + Math.sin(rad) * 42}
                  stroke="currentColor"
                  strokeWidth={3}
                />
              ) : null}
              <VesselMark shape={shape} x={here.x} y={here.y} hollow={v.stale} />
              <text x={here.x + 18} y={here.y - 12} fontSize={22} fontWeight="bold" fill="currentColor">
                {v.vesselName}
                {v.stale ? "（古い情報）" : ""}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="text-xs text-foreground-500">
        図の印: {vessels.map((v, i) => `${SHAPE_LABEL[i % SHAPES.length]} = ${v.vesselName}`).join(" / ")}
        。十字は主要港、点線は通ってきた航跡、現在地から伸びる線は針路です。輪郭だけの印は観測が古いことを表します。
      </figcaption>
    </figure>
  );
}

const SHAPE_LABEL = ["●（丸）", "■（四角）", "▲（三角）"];

function VesselMark({
  shape,
  x,
  y,
  hollow,
}: {
  shape: (typeof SHAPES)[number];
  x: number;
  y: number;
  hollow: boolean;
}) {
  const common = {
    fill: hollow ? "none" : "currentColor",
    stroke: "currentColor",
    strokeWidth: 3,
  };
  if (shape === "square") return <rect x={x - 10} y={y - 10} width={20} height={20} {...common} />;
  if (shape === "triangle") {
    return <polygon points={`${x},${y - 12} ${x + 11},${y + 9} ${x - 11},${y + 9}`} {...common} />;
  }
  return <circle cx={x} cy={y} r={11} {...common} />;
}
