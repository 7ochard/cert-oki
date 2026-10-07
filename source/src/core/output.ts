import JSZip from "jszip";
import type { GeneratedCode } from "./types";

export async function copySvg(svg: string): Promise<void> {
  const clipboard = navigator.clipboard as Clipboard & {
    write?: (items: ClipboardItem[]) => Promise<void>;
  } | undefined;

  if (clipboard?.write && "ClipboardItem" in window) {
    try {
      const item = new ClipboardItem({
        "image/svg+xml": new Blob([svg], { type: "image/svg+xml" }),
        "text/html": new Blob([svg], { type: "text/html" }),
        "text/plain": new Blob([svg], { type: "text/plain" })
      });
      await clipboard.write([item]);
      return;
    } catch {
      copySvgWithExecCommand(svg);
      return;
    }
  }

  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(svg);
      return;
    } catch {
      copySvgWithExecCommand(svg);
      return;
    }
  }

  copySvgWithExecCommand(svg);
}

function copySvgWithExecCommand(svg: string): void {
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const textarea = document.createElement("textarea");
  textarea.value = svg;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  const onCopy = (event: ClipboardEvent) => {
    event.preventDefault();
    event.clipboardData?.setData("text/plain", svg);
    event.clipboardData?.setData("text/html", svg);
    event.clipboardData?.setData("image/svg+xml", svg);
  };

  document.addEventListener("copy", onCopy);
  try {
    if (!document.execCommand("copy")) {
      throw new Error("当前浏览器禁止自动复制，请手动复制 SVG。");
    }
  } finally {
    document.removeEventListener("copy", onCopy);
    textarea.remove();
    previousFocus?.focus();
  }
}

export async function exportZip(items: GeneratedCode[]): Promise<Blob> {
  if (items.length === 0) {
    throw new Error("没有可导出的批量结果。");
  }

  const zip = new JSZip();
  for (const item of items) {
    zip.file(item.filename, item.svg);
  }
  return zip.generateAsync({ type: "blob" });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
