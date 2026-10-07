"use client";

import "@xyflow/react/dist/base.css";

import { Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps, type ReactFlowInstance } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";
import { EDGES, LANES, PARTS, type Part } from "@/lib/architecture";
import { cn } from "@/lib/utils";

const NODE = { width: 172, height: 74 };
const COL = 200; // lane pitch
const ROW = 92; // row pitch inside a lane
const HEAD = 44; // lane title height
const PAD = 12;
const ROWS = Math.max(...LANES.map((l) => l.ids.length));
const WIDTH = LANES.length * COL;
const HEIGHT = HEAD + ROWS * ROW + PAD;

const place = new Map<string, { col: number; row: number }>();
LANES.forEach((l, col) => l.ids.forEach((id, row) => place.set(id, { col, row })));

type PartNode = Node<{ part: Part; selected: boolean }, "part">;
type LaneNode = Node<{ title: string; n: number }, "lane">;

const SIDES = [
  ["l", Position.Left],
  ["r", Position.Right],
  ["t", Position.Top],
  ["b", Position.Bottom],
] as const;

function PartBox({ data }: NodeProps<PartNode>) {
  const { part, selected } = data;
  const designed = part.status === "designed";
  return (
    <div
      className={cn(
        "flex size-full cursor-pointer flex-col justify-center rounded-xl px-3 transition-shadow hover:shadow-md",
        designed ? "border border-dashed border-muted-foreground/45 bg-background/70" : "border bg-card shadow-xs",
        selected && "ring-2 ring-brand",
      )}
    >
      <span className={cn("text-[13.5px] leading-tight font-semibold", designed && "text-muted-foreground")}>{part.name}</span>
      <span className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{part.short}</span>
      {SIDES.map(([id, pos]) => (
        <span key={id}>
          <Handle id={`s${id}`} type="source" position={pos} className="invisible" />
          <Handle id={`t${id}`} type="target" position={pos} className="invisible" />
        </span>
      ))}
    </div>
  );
}

function LaneBox({ data }: NodeProps<LaneNode>) {
  return (
    <div className="size-full rounded-2xl bg-background/60">
      <div className="flex items-baseline gap-1.5 px-3 pt-3">
        <span className="tabular font-mono text-[11px] text-faint">{data.n}</span>
        <span className="text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">{data.title}</span>
      </div>
    </div>
  );
}

const nodeTypes = { part: PartBox, lane: LaneBox };

/** Same lane: connect vertically. Different lanes: right side to left side. */
function handles(a: string, b: string) {
  const s = place.get(a)!;
  const t = place.get(b)!;
  if (s.col === t.col) return s.row < t.row ? { sourceHandle: "sb", targetHandle: "tt" } : { sourceHandle: "st", targetHandle: "tb" };
  return s.col < t.col ? { sourceHandle: "sr", targetHandle: "tl" } : { sourceHandle: "sl", targetHandle: "tr" };
}

export function ArchDiagram({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  const lanes: LaneNode[] = LANES.map((l, i) => ({
    id: `lane:${l.title}`,
    type: "lane",
    position: { x: i * COL, y: 0 },
    width: COL - 12,
    height: HEIGHT,
    selectable: false,
    zIndex: -1,
    data: { title: l.title, n: i + 1 },
  }));
  const parts: PartNode[] = PARTS.map((p) => {
    const { col, row } = place.get(p.id)!;
    return {
      id: p.id,
      type: "part",
      position: { x: col * COL + (COL - 12 - NODE.width) / 2, y: HEAD + row * ROW },
      ...NODE,
      data: { part: p, selected: p.id === selected },
    };
  });
  const edges: Edge[] = EDGES.map(([a, b]) => {
    const designed = PARTS.find((p) => p.id === a)?.status === "designed" || PARTS.find((p) => p.id === b)?.status === "designed";
    const color = designed ? "var(--muted-foreground)" : "var(--foreground)";
    const on = a === selected || b === selected;
    return {
      id: `${a}-${b}`,
      source: a,
      target: b,
      ...handles(a, b),
      type: "smoothstep",
      pathOptions: { borderRadius: 10 },
      markerEnd: { type: MarkerType.ArrowClosed, color: on ? "var(--brand)" : color, width: 14, height: 14 },
      style: {
        stroke: on ? "var(--brand)" : color,
        strokeOpacity: on ? 1 : designed ? 0.4 : 0.55,
        strokeWidth: on ? 2 : 1.25,
        strokeDasharray: designed ? "4 4" : undefined,
      },
      zIndex: on ? 1 : 0,
    };
  });

  const box = useRef<HTMLDivElement>(null);
  const [flow, setFlow] = useState<ReactFlowInstance<PartNode | LaneNode> | null>(null);
  useEffect(() => {
    if (!flow || !box.current) return;
    const o = new ResizeObserver(() => flow.fitView({ padding: 0.02 }));
    o.observe(box.current);
    return () => o.disconnect();
  }, [flow]);

  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div
        ref={box}
        className="min-w-[960px] overflow-hidden rounded-2xl border bg-subtle p-2"
        style={{ aspectRatio: `${WIDTH + 24} / ${HEIGHT + 24}` }}
      >
        <ReactFlow
          onInit={setFlow}
          nodes={[...lanes, ...parts]}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={(_, n) => n.type === "part" && onSelect(n.id)}
          fitView
          fitViewOptions={{ padding: 0.02 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
        />
      </div>
    </div>
  );
}
