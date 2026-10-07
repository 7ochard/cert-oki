import JSZip from "jszip";
import { jsPDF } from "jspdf";
import { svgToDataUrl } from "./certificate";
import { composeSvgGrid, parseSvgMetrics } from "./svg";
import type { PreviewItem } from "../usePreview";

export async function createOutput(items: PreviewItem[], format: "svg" | "jpg" | "pdf", name: string): Promise<{ blob: Blob; filename: string }> {
  if (!items.length) throw new Error("没有可输出的记录。");
  const basename = (name.trim() || "Cert-oki").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
  const filename = `${basename}_${items.length}张`;
  if (format === "svg") return { blob: new Blob([items.length === 1 ? items[0].svg : composeSvgGrid(items)], { type: "image/svg+xml" }), filename: `${filename}.svg` };
  // Render the exact accepted preview snapshot, never regenerate from mutable form state.
  const jpgs: string[] = [];
  for (const item of items) jpgs.push(await svgToDataUrl(item.svg, 1600));
  if (format === "jpg") {
    if (items.length === 1) return { blob: await (await fetch(jpgs[0])).blob(), filename: `${filename}.jpg` };
    const zip = new JSZip();
    items.forEach((item, index) => zip.file(item.filename.replace(/\.svg$/i, ".jpg"), jpgs[index].split(",")[1], { base64: true }));
    return { blob: await zip.generateAsync({ type: "blob" }), filename: `${filename}_JPG.zip` };
  }
  const sizes = items.map((item) => {
    const metrics = parseSvgMetrics(item.svg);
    return { width: metrics.width * (metrics.mmPerUnitX ?? 25.4 / 96), height: metrics.height * (metrics.mmPerUnitY ?? 25.4 / 96) };
  });
  const first = sizes[0];
  const pdf = new jsPDF({ unit: "mm", orientation: first.width > first.height ? "landscape" : "portrait", format: [first.width, first.height] });
  sizes.forEach((size, index) => {
    if (index) pdf.addPage([size.width, size.height], size.width > size.height ? "landscape" : "portrait");
    pdf.addImage(jpgs[index], "JPEG", 0, 0, size.width, size.height);
  });
  return { blob: pdf.output("blob"), filename: `${filename}.pdf` };
}
