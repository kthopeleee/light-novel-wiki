import { useMemo, useState } from "react";
import type { Character, NovelWiki } from "@lnw/schema";
import { href } from "../router";
import { useSpoilers } from "../spoilers";
import { ROLE_LABEL, ROLE_ORDER } from "../wiki";

const WIDTH = 800;
const HEIGHT = 560;
const MARGIN = 60;

type Edge = { a: string; b: string; labels: string[] };
type Point = { x: number; y: number };

export function RelationshipMap({ wiki }: { wiki: NovelWiki }) {
  const { revealAll } = useSpoilers();
  const [showMinor, setShowMinor] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  const { nodes, edges, hiddenSpoilers } = useMemo(
    () => buildGraph(wiki.characters, showMinor, revealAll),
    [wiki.characters, showMinor, revealAll],
  );
  const positions = useMemo(() => layout(nodes.map((n) => n.id), edges), [nodes, edges]);

  const neighbors = useMemo(() => {
    const set = new Set<string>();
    for (const e of edges) {
      if (e.a === hovered) set.add(e.b);
      if (e.b === hovered) set.add(e.a);
    }
    return set;
  }, [edges, hovered]);

  // With a busy map, labels only show for the hovered character's links.
  const alwaysLabel = edges.length <= 12;
  const hasMinor = wiki.characters.some((c) => c.role === "minor");

  return (
    <figure className="relmap">
      <div className="relmap__controls">
        <ul className="legend">
          {ROLE_ORDER.filter((role) => nodes.some((n) => n.role === role)).map((role) => (
            <li key={role}>
              <span className={`role-dot role-${role}`} aria-hidden="true" />
              {ROLE_LABEL[role].one}
            </li>
          ))}
        </ul>
        {hasMinor && (
          <label className="checkbox">
            <input type="checkbox" checked={showMinor} onChange={(e) => setShowMinor(e.target.checked)} />
            Show minor characters
          </label>
        )}
      </div>
      <div className="relmap__scroll">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={`Relationship map of ${nodes.length} characters. The full list is below.`}
        >
          <g>
            {edges.map((e) => {
              const p = positions.get(e.a)!;
              const q = positions.get(e.b)!;
              const active = hovered !== null && (e.a === hovered || e.b === hovered);
              const state = hovered === null ? "" : active ? " edge--active" : " edge--dim";
              return (
                <g key={`${e.a}|${e.b}`} className={`edge${state}`}>
                  <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} />
                  {(active || (hovered === null && alwaysLabel)) && (
                    <text x={(p.x + q.x) / 2} y={(p.y + q.y) / 2 - 6} textAnchor="middle" className="edge__label">
                      {e.labels.join(" / ")}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
          <g>
            {nodes.map((c) => {
              const p = positions.get(c.id)!;
              const r = c.role === "protagonist" ? 22 : c.role === "minor" ? 12 : 17;
              const dim = hovered !== null && hovered !== c.id && !neighbors.has(c.id);
              return (
                <a
                  key={c.id}
                  href={href("n", wiki.id, "characters", c.id)}
                  className={`node role-${c.role}${dim ? " node--dim" : ""}`}
                  onMouseEnter={() => setHovered(c.id)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(c.id)}
                  onBlur={() => setHovered(null)}
                >
                  <circle cx={p.x} cy={p.y} r={r} />
                  <text x={p.x} y={p.y + r + 16} textAnchor="middle" className="node__label">
                    {c.name}
                  </text>
                </a>
              );
            })}
          </g>
        </svg>
      </div>
      {hiddenSpoilers > 0 && (
        <figcaption className="muted small">
          {hiddenSpoilers} spoiler relationship{hiddenSpoilers === 1 ? " is" : "s are"} hidden. Turn on “Show all
          spoilers” to include {hiddenSpoilers === 1 ? "it" : "them"}.
        </figcaption>
      )}
    </figure>
  );
}

function buildGraph(characters: Character[], includeMinor: boolean, includeSpoilers: boolean) {
  const nodes = characters.filter((c) => includeMinor || c.role !== "minor");
  const ids = new Set(nodes.map((n) => n.id));
  const byPair = new Map<string, Edge>();
  let hiddenSpoilers = 0;

  for (const c of nodes) {
    for (const rel of c.relationships) {
      if (!ids.has(rel.target) || rel.target === c.id) continue;
      if (rel.spoiler && !includeSpoilers) {
        hiddenSpoilers++;
        continue;
      }
      // One line per pair of characters, carrying every label from both directions.
      const [a, b] = [c.id, rel.target].sort() as [string, string];
      const key = `${a}|${b}`;
      const edge = byPair.get(key) ?? { a, b, labels: [] };
      if (!edge.labels.includes(rel.type)) edge.labels.push(rel.type);
      byPair.set(key, edge);
    }
  }
  return { nodes, edges: [...byPair.values()], hiddenSpoilers };
}

function layout(ids: string[], edges: Edge[]): Map<string, Point> {
  const linked = new Set(edges.flatMap((e) => [e.a, e.b]));
  const connected = ids.filter((id) => linked.has(id));
  const loose = ids.filter((id) => !linked.has(id));
  const result = new Map<string, Point>();

  // Characters with no visible links sit in a row along the bottom instead of
  // being pushed into the corners by everyone else.
  loose.forEach((id, i) => {
    result.set(id, { x: MARGIN + ((i + 0.5) * (WIDTH - 2 * MARGIN)) / loose.length, y: HEIGHT - 60 });
  });

  const points = forceLayout(connected, edges);
  fitToFrame(points, MARGIN, MARGIN, WIDTH - MARGIN, loose.length > 0 ? HEIGHT - 140 : HEIGHT - MARGIN);
  connected.forEach((id, i) => result.set(id, points[i]));
  return result;
}

/**
 * Small force-directed layout (Fruchterman–Reingold). It starts from a circle instead
 * of random positions so the map looks the same every time it's opened.
 */
function forceLayout(ids: string[], edges: Edge[]): Point[] {
  const n = Math.max(ids.length, 1);
  const pos: Point[] = ids.map((_, i) => {
    const angle = (2 * Math.PI * i) / n;
    return { x: WIDTH / 2 + (WIDTH / 3) * Math.cos(angle), y: HEIGHT / 2 + (HEIGHT / 3) * Math.sin(angle) };
  });
  const index = new Map(ids.map((id, i) => [id, i]));
  const k = 0.7 * Math.sqrt(((WIDTH - 2 * MARGIN) * (HEIGHT - 2 * MARGIN)) / n);
  let temperature = WIDTH / 10;

  for (let iter = 0; iter < 300; iter++) {
    const disp = pos.map(() => ({ x: 0, y: 0 }));

    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const dx = pos[i].x - pos[j].x;
        const dy = pos[i].y - pos[j].y;
        const dist = Math.max(Math.hypot(dx, dy), 0.01);
        const force = (k * k) / dist;
        disp[i].x += (dx / dist) * force;
        disp[i].y += (dy / dist) * force;
        disp[j].x -= (dx / dist) * force;
        disp[j].y -= (dy / dist) * force;
      }
    }

    for (const e of edges) {
      const i = index.get(e.a)!;
      const j = index.get(e.b)!;
      const dx = pos[i].x - pos[j].x;
      const dy = pos[i].y - pos[j].y;
      const dist = Math.max(Math.hypot(dx, dy), 0.01);
      const force = (dist * dist) / k;
      disp[i].x -= (dx / dist) * force;
      disp[i].y -= (dy / dist) * force;
      disp[j].x += (dx / dist) * force;
      disp[j].y += (dy / dist) * force;
    }

    for (let i = 0; i < pos.length; i++) {
      // A gentle pull toward the middle keeps separate groups from drifting apart.
      disp[i].x += (WIDTH / 2 - pos[i].x) * 0.1;
      disp[i].y += (HEIGHT / 2 - pos[i].y) * 0.1;
      const length = Math.max(Math.hypot(disp[i].x, disp[i].y), 0.01);
      const step = Math.min(length, temperature);
      pos[i].x += (disp[i].x / length) * step;
      pos[i].y += (disp[i].y / length) * step;
    }
    temperature = Math.max(temperature * 0.97, 0.5);
  }
  return pos;
}

/** Centers the layout in the frame and scales it to fill, without spreading small maps too far. */
function fitToFrame(points: Point[], left: number, top: number, right: number, bottom: number) {
  if (points.length === 0) return;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = Math.min((right - left) / Math.max(maxX - minX, 1), (bottom - top) / Math.max(maxY - minY, 1), 2.5);
  const [fromX, fromY] = [(minX + maxX) / 2, (minY + maxY) / 2];
  const [toX, toY] = [(left + right) / 2, (top + bottom) / 2];
  for (const p of points) {
    p.x = toX + (p.x - fromX) * scale;
    p.y = toY + (p.y - fromY) * scale;
  }
}
