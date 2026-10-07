import type { Anchor } from "@/lib/types";

/** A crop of the real page around one cell, with the field's label chip. Server-safe. */
export function DocCrop({
  scenario,
  anchor,
  pages,
  label,
  className,
}: {
  scenario: string;
  anchor: Anchor;
  pages: [number, number][];
  label: string;
  className?: string;
}) {
  const [pw, ph] = pages[anchor.page];
  const [x0, y0, x1, y1] = anchor.bbox;
  const rx = Math.min(36, x0 - 8);
  const W = Math.min(pw - rx, x1 + 70 - rx);
  const H = 150;
  const ry = Math.min(Math.max((y0 + y1) / 2 - H / 2, 0), ph - H);
  const p = (v: number, d: number) => `${(v / d) * 100}%`;
  return (
    <div className={`relative overflow-hidden bg-white ${className ?? ""}`} style={{ aspectRatio: `${W / H}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/data/pages/${scenario}/${anchor.doc}-p${anchor.page}.png`}
        alt=""
        className="absolute max-w-none select-none"
        style={{ width: p(pw, W), left: `-${p(rx, W)}`, top: `-${p(ry, H)}` }}
      />
      <span
        className="absolute rounded-[3px] bg-highlight ring-2 ring-chip"
        style={{ left: p(x0 - rx - 3, W), top: p(y0 - ry - 2, H), width: p(x1 - x0 + 6, W), height: p(y1 - y0 + 4, H) }}
      />
      <span
        className="absolute -translate-y-full rounded-t-[4px] bg-chip px-1.5 py-px text-[10px] font-medium whitespace-nowrap text-white"
        style={{ left: p(x0 - rx - 3, W), top: p(y0 - ry - 2, H) }}
      >
        {label}
      </span>
    </div>
  );
}
