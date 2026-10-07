interface SvgMetrics {
  width: number;
  height: number;
  viewBox: string;
  minX: number;
  minY: number;
  body: string;
  mmPerUnitX?: number;
  mmPerUnitY?: number;
}

export function composeSvgGrid(items: { svg: string }[], columns = Math.min(5, Math.max(1, Math.ceil(Math.sqrt(items.length)))), gap = 24): string {
  if (!items.length) throw new Error("没有可复制的批量结果。");
  const metrics = items.map((item) => parseSvgMetrics(item.svg));
  const cellWidth = Math.max(...metrics.map((item) => item.width));
  const cellHeight = Math.max(...metrics.map((item) => item.height));
  const width = columns * cellWidth + (columns - 1) * gap;
  const height = Math.ceil(items.length / columns) * (cellHeight + gap) - gap;
  const body = metrics.map((item, index) => {
    const x = (index % columns) * (cellWidth + gap) + (cellWidth - item.width) / 2;
    const y = Math.floor(index / columns) * (cellHeight + gap) + (cellHeight - item.height) / 2;
    return '<g transform="translate(' + round(x) + ' ' + round(y) + ') translate(' + round(-item.minX) + ' ' + round(-item.minY) + ')">' + item.body + '</g>';
  }).join("");
  const first = metrics[0];
  const physical = first.mmPerUnitX && first.mmPerUnitY && metrics.every((item) =>
    item.mmPerUnitX && item.mmPerUnitY && Math.abs(item.mmPerUnitX - first.mmPerUnitX!) < 1e-4 && Math.abs(item.mmPerUnitY - first.mmPerUnitY!) < 1e-4);
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + (physical ? round(width * first.mmPerUnitX!) + "mm" : round(width)) +
    '" height="' + (physical ? round(height * first.mmPerUnitY!) + "mm" : round(height)) + '" viewBox="0 0 ' + round(width) + ' ' + round(height) + '">' + body + '</svg>';
}

// Keep the deployed app's clipboard units: Illustrator uses points, generic SVG uses 10 units/mm.
export function prepareSvgForClipboard(svg: string, target: "svg" | "illustrator"): string {
  const metric = parseSvgMetrics(svg);
  if (!metric.mmPerUnitX || !metric.mmPerUnitY) return svg;
  const units = target === "illustrator" ? 72 / 25.4 : 10;
  const xScale = metric.mmPerUnitX * units;
  const yScale = metric.mmPerUnitY * units;
  const width = metric.width * xScale;
  const height = metric.height * yScale;
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + round(width) + '" height="' + round(height) + '" viewBox="0 0 ' + round(width) + ' ' + round(height) +
    '"><g transform="scale(' + round(xScale, 6) + ' ' + round(yScale, 6) + ')"><g transform="translate(' + round(-metric.minX) + ' ' + round(-metric.minY) + ')">' + metric.body + '</g></g></svg>';
}

export function parseSvgMetrics(svg: string): SvgMetrics {
  const tag = svg.match(/<svg\b([^>]*)>/i);
  if (!tag) throw new Error("SVG 内容无效。");
  const read = (name: string) => tag[1].match(new RegExp(name + "=[\"']([^\"']+)[\"']", "i"))?.[1];
  const viewBox = read("viewBox");
  const parts = viewBox?.split(/\s+/).map(Number);
  const hasViewBox = parts?.length === 4 && parts.every(Number.isFinite);
  const widthMm = physicalMm(read("width"));
  const heightMm = physicalMm(read("height"));
  const width = hasViewBox && (widthMm || heightMm) ? parts[2] : parseFloat(read("width") ?? "") || (hasViewBox ? parts[2] : 0);
  const height = hasViewBox && (widthMm || heightMm) ? parts[3] : parseFloat(read("height") ?? "") || (hasViewBox ? parts[3] : 0);
  if (!(width > 0) || !(height > 0)) throw new Error("无法读取 SVG 尺寸。");
  const x = widthMm ? widthMm / width : undefined;
  const y = heightMm ? heightMm / height : undefined;
  return { width, height, viewBox: viewBox ?? '0 0 ' + width + ' ' + height,
    minX: hasViewBox ? parts[0] : 0, minY: hasViewBox ? parts[1] : 0,
    body: svg.replace(/^[\s\S]*?<svg\b[^>]*>/i, "").replace(/<\/svg>\s*$/i, ""),
    mmPerUnitX: x ?? y, mmPerUnitY: y ?? x };
}

function physicalMm(value?: string): number | undefined {
  const match = value?.match(/^([\d.]+)(mm|cm|in|pt|pc)$/i);
  if (!match) return;
  const factors: Record<string, number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6 };
  return Number(match[1]) * factors[match[2].toLowerCase()];
}
function round(value: number, places = 3): string { return Number(value.toFixed(places)).toString(); }
