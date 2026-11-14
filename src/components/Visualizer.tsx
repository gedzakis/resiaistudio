import * as math from 'mathjs';
import { useMemo, useState } from 'react';
import { tr } from '../i18n/serbian.ts';
import type {
  ChemistryDiagramData,
  FunctionPlotData,
  GeometryDiagramData,
  PhysicsDiagramData,
  ScriptMode,
  VisualizationData,
} from '../types/resi.ts';

const SVG_W = 640;
const SVG_H = 360;
const PAD = 44;

const CURVE_COLORS = ['#1D4ED8', '#059669', '#D97706', '#DC2626'];

function FunctionPlotView({ data, script }: { data: FunctionPlotData; script: ScriptMode }) {
  const [hoverX, setHoverX] = useState<number | null>(null);

  const xMin = Number.isFinite(data.xMin) ? data.xMin : -6;
  const xMax = Number.isFinite(data.xMax) && data.xMax > xMin ? data.xMax : xMin + 12;
  const yMin = Number.isFinite(data.yMin) ? data.yMin : -6;
  const yMax = Number.isFinite(data.yMax) && data.yMax > yMin ? data.yMax : yMin + 12;

  const toSvgX = (x: number) => PAD + ((x - xMin) / (xMax - xMin)) * (SVG_W - PAD * 2);
  const toSvgY = (y: number) => SVG_H - PAD - ((y - yMin) / (yMax - yMin)) * (SVG_H - PAD * 2);

  const compiledCurves = useMemo(() => {
    return (data.expressions || []).map((item, idx) => {
      let fn: ((scope: { x: number }) => number) | null = null;
      try {
        const node = math.compile(item.expr.replace(/\^/g, '^'));
        fn = (scope) => Number(node.evaluate(scope));
      } catch {
        fn = null;
      }

      const paths: string[] = [];
      if (fn) {
        const samples = 220;
        let currentSegment: string[] = [];
        for (let i = 0; i <= samples; i++) {
          const x = xMin + (i / samples) * (xMax - xMin);
          let y = NaN;
          try {
            y = fn({ x });
          } catch {
            y = NaN;
          }
          if (Number.isFinite(y) && y >= yMin - (yMax - yMin) * 0.5 && y <= yMax + (yMax - yMin) * 0.5) {
            const sx = toSvgX(x).toFixed(1);
            const sy = toSvgY(Math.max(yMin, Math.min(yMax, y))).toFixed(1);
            currentSegment.push(`${currentSegment.length === 0 ? 'M' : 'L'}${sx},${sy}`);
          } else if (currentSegment.length > 0) {
            paths.push(currentSegment.join(' '));
            currentSegment = [];
          }
        }
        if (currentSegment.length > 0) {
          paths.push(currentSegment.join(' '));
        }
      }

      return {
        label: item.label,
        expr: item.expr,
        color: item.color || CURVE_COLORS[idx % CURVE_COLORS.length],
        paths,
        fn,
      };
    });
  }, [data.expressions, xMin, xMax, yMin, yMax]);

  const axisX = yMin <= 0 && yMax >= 0 ? toSvgY(0) : SVG_H - PAD;
  const axisY = xMin <= 0 && xMax >= 0 ? toSvgX(0) : PAD;

  const gridLines = 6;
  const xTicks = Array.from({ length: gridLines + 1 }, (_, i) => xMin + (i / gridLines) * (xMax - xMin));
  const yTicks = Array.from({ length: gridLines + 1 }, (_, i) => yMin + (i / gridLines) * (yMax - yMin));

  const hoverValues = useMemo(() => {
    if (hoverX === null) return [];
    return compiledCurves.map((c) => {
      let y = NaN;
      if (c.fn) {
        try {
          y = c.fn({ x: hoverX });
        } catch {
          y = NaN;
        }
      }
      return { label: c.label, color: c.color, y };
    });
  }, [hoverX, compiledCurves]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
          {tr(data.title, script)}
        </h4>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
          {compiledCurves.map((c) => (
            <span key={c.label} className="inline-flex items-center gap-1.5 font-mono">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: c.color }} />
              {c.label}
            </span>
          ))}
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="h-auto w-full touch-none select-none"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const relX = ((e.clientX - rect.left) / rect.width) * SVG_W;
            const domainX = xMin + ((relX - PAD) / (SVG_W - PAD * 2)) * (xMax - xMin);
            if (domainX >= xMin && domainX <= xMax) {
              setHoverX(domainX);
            } else {
              setHoverX(null);
            }
          }}
          onMouseLeave={() => setHoverX(null)}
        >
          {/* Gridlines */}
          {xTicks.map((xv, i) => {
            const sx = toSvgX(xv);
            return (
              <g key={`xt-${i}`}>
                <line
                  x1={sx}
                  y1={PAD}
                  x2={sx}
                  y2={SVG_H - PAD}
                  className="stroke-slate-100 dark:stroke-slate-800/80"
                  strokeWidth={1}
                />
                <text
                  x={sx}
                  y={SVG_H - PAD + 16}
                  textAnchor="middle"
                  className="fill-slate-500 font-mono text-[10px] dark:fill-slate-400"
                >
                  {Number(xv.toFixed(1))}
                </text>
              </g>
            );
          })}
          {yTicks.map((yv, i) => {
            const sy = toSvgY(yv);
            return (
              <g key={`yt-${i}`}>
                <line
                  x1={PAD}
                  y1={sy}
                  x2={SVG_W - PAD}
                  y2={sy}
                  className="stroke-slate-100 dark:stroke-slate-800/80"
                  strokeWidth={1}
                />
                <text
                  x={PAD - 8}
                  y={sy + 3}
                  textAnchor="end"
                  className="fill-slate-500 font-mono text-[10px] dark:fill-slate-400"
                >
                  {Number(yv.toFixed(1))}
                </text>
              </g>
            );
          })}

          {/* Primary Axes */}
          <line
            x1={PAD}
            y1={axisX}
            x2={SVG_W - PAD}
            y2={axisX}
            className="stroke-slate-400 dark:stroke-slate-600"
            strokeWidth={1.5}
          />
          <line
            x1={axisY}
            y1={PAD}
            x2={axisY}
            y2={SVG_H - PAD}
            className="stroke-slate-400 dark:stroke-slate-600"
            strokeWidth={1.5}
          />

          {/* Function Curves */}
          {compiledCurves.map((c, idx) =>
            c.paths.map((d, pIdx) => (
              <path
                key={`curve-${idx}-${pIdx}`}
                d={d}
                fill="none"
                stroke={c.color}
                strokeWidth={2.5}
                strokeLinecap="round"
              />
            )),
          )}

          {/* Marked Points */}
          {(data.points || []).map((pt, idx) => {
            if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return null;
            const px = toSvgX(pt.x);
            const py = toSvgY(pt.y);
            if (px < PAD || px > SVG_W - PAD || py < PAD || py > SVG_H - PAD) return null;
            return (
              <g key={`pt-${idx}`}>
                <circle cx={px} cy={py} r={5} className="fill-blue-600 stroke-white dark:stroke-slate-950" strokeWidth={2} />
                <text
                  x={px + 8}
                  y={py - 8}
                  className="fill-slate-900 font-mono text-[11px] font-semibold dark:fill-slate-100"
                >
                  {pt.label}
                </text>
              </g>
            );
          })}

          {/* Hover Crosshair */}
          {hoverX !== null && (
            <g>
              <line
                x1={toSvgX(hoverX)}
                y1={PAD}
                x2={toSvgX(hoverX)}
                y2={SVG_H - PAD}
                className="stroke-blue-500/60"
                strokeDasharray="4 4"
                strokeWidth={1}
              />
              {hoverValues.map((hv, idx) =>
                Number.isFinite(hv.y) && hv.y >= yMin && hv.y <= yMax ? (
                  <circle
                    key={`hv-${idx}`}
                    cx={toSvgX(hoverX)}
                    cy={toSvgY(hv.y)}
                    r={4.5}
                    fill={hv.color}
                    stroke="#ffffff"
                    strokeWidth={1.5}
                  />
                ) : null,
              )}
            </g>
          )}
        </svg>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/80 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
          <span className="font-mono tabular-nums">
            {hoverX !== null
              ? `x = ${hoverX.toFixed(2)}  ${hoverValues
                  .filter((v) => Number.isFinite(v.y))
                  .map((v) => `| ${v.label}: y = ${v.y.toFixed(2)}`)
                  .join(' ')}`
              : tr('Pređi mišem preko grafika za očitavanje tačnih koordinata.', script)}
          </span>
          <span className="text-slate-500 dark:text-slate-400">
            {data.xLabel || 'x'} / {data.yLabel || 'y'}
          </span>
        </div>
      </div>
    </div>
  );
}

function GeometryView({ data, script }: { data: GeometryDiagramData; script: ScriptMode }) {
  const allPoints: Array<{ x: number; y: number }> = [];
  for (const s of data.shapes || []) {
    if (s.points) allPoints.push(...s.points);
    if (s.center) {
      const r = s.radius || 1;
      allPoints.push({ x: s.center.x - r, y: s.center.y - r });
      allPoints.push({ x: s.center.x + r, y: s.center.y + r });
    }
  }
  const xs = allPoints.map((p) => p.x);
  const ys = allPoints.map((p) => p.y);
  const minX = xs.length ? Math.min(...xs) - 1 : -5;
  const maxX = xs.length ? Math.max(...xs) + 1 : 5;
  const minY = ys.length ? Math.min(...ys) - 1 : -5;
  const maxY = ys.length ? Math.max(...ys) + 1 : 5;
  const span = Math.max(maxX - minX, maxY - minY, 2);
  const scale = (Math.min(SVG_W, SVG_H) - PAD * 2) / span;
  const cxOffset = (SVG_W - (maxX - minX) * scale) / 2;
  const cyOffset = (SVG_H - (maxY - minY) * scale) / 2;

  const mapX = (x: number) => cxOffset + (x - minX) * scale;
  const mapY = (y: number) => SVG_H - cyOffset - (y - minY) * scale;

  return (
    <div className="space-y-3">
      <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
        {tr(data.title, script)}
      </h4>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="h-auto w-full">
          {(data.shapes || []).map((shape, idx) => {
            if (shape.type === 'circle' && shape.center && shape.radius) {
              return (
                <g key={`sh-${idx}`}>
                  <circle
                    cx={mapX(shape.center.x)}
                    cy={mapY(shape.center.y)}
                    r={shape.radius * scale}
                    className="fill-blue-500/10 stroke-blue-600 dark:stroke-blue-400"
                    strokeWidth={2.2}
                  />
                  {shape.label && (
                    <text
                      x={mapX(shape.center.x)}
                      y={mapY(shape.center.y) - 6}
                      textAnchor="middle"
                      className="fill-slate-800 font-mono text-xs font-semibold dark:fill-slate-200"
                    >
                      {shape.label}
                    </text>
                  )}
                </g>
              );
            }
            if (shape.points && shape.points.length >= 2) {
              const ptsAttr = shape.points.map((p) => `${mapX(p.x)},${mapY(p.y)}`).join(' ');
              return (
                <g key={`sh-${idx}`}>
                  {shape.type === 'polygon' ? (
                    <polygon
                      points={ptsAttr}
                      className="fill-blue-600/10 stroke-blue-600 dark:stroke-blue-400"
                      strokeWidth={2.2}
                    />
                  ) : (
                    <polyline
                      points={ptsAttr}
                      fill="none"
                      className="stroke-blue-600 dark:stroke-blue-400"
                      strokeWidth={2.2}
                    />
                  )}
                  {shape.points.map((pt, pIdx) => (
                    <g key={`vp-${pIdx}`}>
                      <circle cx={mapX(pt.x)} cy={mapY(pt.y)} r={4} className="fill-blue-700 dark:fill-blue-300" />
                      {pt.name && (
                        <text
                          x={mapX(pt.x) + 8}
                          y={mapY(pt.y) - 8}
                          className="fill-slate-900 font-mono text-xs font-bold dark:fill-slate-100"
                        >
                          {pt.name}
                        </text>
                      )}
                    </g>
                  ))}
                </g>
              );
            }
            return null;
          })}
        </svg>
      </div>
    </div>
  );
}

function PhysicsDiagramView({ data, script }: { data: PhysicsDiagramData; script: ScriptMode }) {
  const cx = SVG_W / 2;
  const cy = SVG_H / 2;
  const unit = 28;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
          {tr(data.title, script)}
        </h4>
        {data.subtitle && (
          <span className="text-xs text-slate-500 dark:text-slate-400">{tr(data.subtitle, script)}</span>
        )}
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="h-auto w-full">
          <defs>
            <marker id="resi-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="currentColor" className="text-blue-600 dark:text-blue-400" />
            </marker>
          </defs>
          {/* Reference Surface */}
          <line x1={60} y1={cy + 34} x2={SVG_W - 60} y2={cy + 34} className="stroke-slate-300 dark:stroke-slate-700" strokeWidth={2} />
          {/* Body Box */}
          <rect
            x={cx - 34}
            y={cy - 34}
            width={68}
            height={68}
            rx={8}
            className="fill-slate-100 stroke-slate-400 dark:fill-slate-800 dark:stroke-slate-600"
            strokeWidth={1.8}
          />
          <text x={cx} y={cy + 4} textAnchor="middle" className="fill-slate-800 font-mono text-xs font-bold dark:fill-slate-100">
            {data.bodyLabel || 'm'}
          </text>

          {/* Vectors */}
          {(data.vectors || []).map((vec, idx) => {
            const x1 = cx + vec.fromX * unit;
            const y1 = cy - vec.fromY * unit;
            const x2 = cx + vec.toX * unit;
            const y2 = cy - vec.toY * unit;
            const color = vec.color || CURVE_COLORS[idx % CURVE_COLORS.length];
            return (
              <g key={`vec-${idx}`} style={{ color }}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={color}
                  strokeWidth={2.8}
                  markerEnd="url(#resi-arrow)"
                />
                <text
                  x={x2 + (x2 >= x1 ? 10 : -10)}
                  y={y2 + (y2 >= y1 ? 14 : -8)}
                  textAnchor={x2 >= x1 ? 'start' : 'end'}
                  fill={color}
                  className="font-mono text-xs font-bold"
                >
                  {tr(vec.label, script)}
                </text>
              </g>
            );
          })}
        </svg>
        {data.caption && (
          <div className="border-t border-slate-100 bg-slate-50/80 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
            {tr(data.caption, script)}
          </div>
        )}
      </div>
    </div>
  );
}

function ChemistryDiagramView({ data, script }: { data: ChemistryDiagramData; script: ScriptMode }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
          {tr(data.title, script)}
        </h4>
        {data.enthalpyChange && (
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
            {tr(`Tip reakcije: ${data.enthalpyChange}`, script)}
          </span>
        )}
      </div>
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-wrap items-center justify-center gap-2">
          {(data.reactants || []).map((r, i) => (
            <div key={`r-${i}`} className="flex items-center gap-2">
              {i > 0 && <span className="font-mono text-base font-bold text-slate-400">+</span>}
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 font-mono text-sm font-semibold text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/60 dark:text-blue-200">
                {r}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center">
          {data.conditions && (
            <span className="mb-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {tr(data.conditions, script)}
            </span>
          )}
          <div className="flex items-center">
            <div className="h-0.5 w-12 bg-blue-600 dark:bg-blue-400" />
            <div className="h-0 w-0 border-y-4 border-l-8 border-y-transparent border-l-blue-600 dark:border-l-blue-400" />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          {(data.products || []).map((p, i) => (
            <div key={`p-${i}`} className="flex items-center gap-2">
              {i > 0 && <span className="font-mono text-base font-bold text-slate-400">+</span>}
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 font-mono text-sm font-semibold text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/60 dark:text-emerald-200">
                {p}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Visualizer({ data, script }: { data: VisualizationData; script: ScriptMode }) {
  if (!data) return null;
  if (data.kind === 'function_plot') {
    return <FunctionPlotView data={data} script={script} />;
  }
  if (data.kind === 'geometry') {
    return <GeometryView data={data} script={script} />;
  }
  if (data.kind === 'physics_diagram') {
    return <PhysicsDiagramView data={data} script={script} />;
  }
  if (data.kind === 'chemistry_diagram') {
    return <ChemistryDiagramView data={data} script={script} />;
  }
  return null;
}
