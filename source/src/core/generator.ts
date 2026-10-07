import bwipjs from "@bwip-js/browser";
import QRCode from "qrcode";
import { buildBatchInputs } from "./batch";
import { normalizeAndApplyCheckDigit } from "./checkDigits";
import { PRESET_BY_KIND } from "./presets";
import type { BarcodeKind, BatchOptions, GeneratedCode, GenerateOptions } from "./types";

const BWIP_BCID: Partial<Record<BarcodeKind, string>> = {
  ean8: "ean8",
  ean13: "ean13",
  ean128: "gs1-128",
  upca: "upca",
  upce: "upce",
  code39: "code39",
  code93: "code93",
  code128: "code128",
  code128a: "code128",
  code128b: "code128",
  code128c: "code128",
  itf14: "itf14",
  itf25: "interleaved2of5"
};

export async function generateCode(options: GenerateOptions): Promise<GeneratedCode> {
  const encoded = normalizeInput(options.kind, options.data);
  const preset = PRESET_BY_KIND[options.kind];
  const warnings = collectWarnings(options.kind, encoded);
  const heightMm = options.heightMm ?? preset.defaultHeightMm;
  const scale = options.scale ?? 2;
  const includeText = options.includeText ?? preset.supportsText;
  const fontFamily = options.fontFamily ?? "Arial, Helvetica, sans-serif";
  const svg = options.kind === "qrcode"
    ? await generateQrSvg(encoded, heightMm, scale)
    : generateLinearSvg(options.kind, encoded, heightMm, scale, includeText, fontFamily);

  return {
    kind: options.kind,
    input: options.data,
    encoded,
    svg,
    filename: buildFilename(options.kind, encoded),
    warnings
  };
}

export async function generateBatch(options: BatchOptions): Promise<GeneratedCode[]> {
  const inputs = buildBatchInputs(options.kind, options.data.trim(), options.count);
  const generated = await Promise.all(
    inputs.map((data) => generateCode({ ...options, data }))
  );

  return generated.map((item, index) => ({
    ...item,
    filename: `${String(index + 1).padStart(3, "0")}_${item.filename}`
  }));
}

function normalizeInput(kind: BarcodeKind, data: string): string {
  const trimmed = data.trim();
  if (!trimmed) {
    throw new Error("请输入要生成的数据。");
  }

  if (kind === "qrcode") {
    return trimmed;
  }
  if (kind === "code128c" && !/^\d+$/.test(trimmed)) {
    throw new Error("CODE 128C 只能包含数字。");
  }
  if (kind === "itf25" && !/^\d+$/.test(trimmed)) {
    throw new Error("ITF-25 只能包含数字。");
  }
  if (kind === "code39" && !/^[0-9A-Z .$/+%-]+$/.test(trimmed)) {
    throw new Error("CODE 39 仅支持大写字母、数字、空格和 .$/+%-。");
  }

  return normalizeAndApplyCheckDigit(kind, trimmed);
}

function generateLinearSvg(
  kind: BarcodeKind,
  text: string,
  heightMm: number,
  scale: number,
  includeText: boolean,
  fontFamily: string
): string {
  const bcid = BWIP_BCID[kind];
  if (!bcid) {
    throw new Error(`不支持的条码类型：${kind}`);
  }

  const options: Parameters<typeof bwipjs.toSVG>[0] & { bearerbars?: boolean } = {
    bcid,
    text,
    scale,
    height: heightMm,
    includetext: includeText,
    textxalign: "center",
    barcolor: "000000",
    textcolor: "000000",
    textfont: getBwipTextFont(fontFamily)
  };

  if (kind === "ean128") {
    options.parsefnc = true;
  }
  if (kind === "itf14") {
    options.bearerbars = true;
  }

  const svg = bwipjs.toSVG(options);
  if (kind === "ean13" && includeText) {
    return formatEan13ReadableText(svg, text, fontFamily);
  }

  return svg;
}

async function generateQrSvg(text: string, heightMm: number, scale: number): Promise<string> {
  const pixels = Math.max(80, Math.round(heightMm * 2.835 * scale));
  const svg = await QRCode.toString(text, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    width: pixels,
    color: {
      dark: "#000000",
      light: "#00000000"
    }
  });
  return stripTransparentBackground(svg);
}

function collectWarnings(kind: BarcodeKind, encoded: string): string[] {
  const warnings: string[] = [];
  if (kind === "code128a" || kind === "code128b") {
    warnings.push("CODE 128A/B 在网页版中使用 CODE 128 标准编码器生成，输出仍为 CODE 128 可扫码条码。");
  }
  if (kind === "code128c" && encoded.length % 2 !== 0) {
    warnings.push("CODE 128C 建议使用偶数位数字，编码器可能回退到混合编码。");
  }
  return warnings;
}

function buildFilename(kind: BarcodeKind, encoded: string): string {
  const clean = encoded.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "code";
  return `${kind}_${clean}.svg`;
}

function formatEan13ReadableText(svg: string, encoded: string, fontFamily: string): string {
  if (!/^\d{13}$/.test(encoded)) {
    return svg;
  }

  const viewBoxMatch = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  if (!viewBoxMatch) {
    return svg;
  }

  const baseWidth = Number(viewBoxMatch[1]);
  const baseHeight = Number(viewBoxMatch[2]);
  if (!Number.isFinite(baseWidth) || !Number.isFinite(baseHeight)) {
    return svg;
  }

  const moduleWidth = baseWidth / 95;
  const quietZone = 9 * moduleWidth;
  const nextWidth = baseWidth + quietZone * 2;
  const barOnly = svg.replace(/\n<path\b(?=[^>]*\bd=)(?![^>]*\bstroke=)[^>]*\/>/gi, "");
  const barPaths = Array.from(barOnly.matchAll(/\n<path\b[^>]*\/>/gi), (match) => match[0]).join("");
  if (!barPaths) {
    return svg;
  }

  const withoutPaths = barOnly
    .replace(/viewBox="0 0 ([\d.]+) ([\d.]+)"/, `viewBox="0 0 ${nextWidth} ${baseHeight}"`)
    .replace(/\n<path\b[^>]*\/>/gi, "");

  const first = encoded.slice(0, 1);
  const left = encoded.slice(1, 7);
  const right = encoded.slice(7);
  const baseline = baseHeight - 1;
  const fontSize = 10 * moduleWidth;
  const groupTextLength = 35 * moduleWidth;
  const textLayer = [
    `<g fill="#000000" font-family="${escapeSvgAttribute(fontFamily)}" font-size="${svgNumber(fontSize)}" font-weight="400" letter-spacing="0" text-anchor="middle">`,
    `<text x="${svgNumber(4.75 * moduleWidth)}" y="${svgNumber(baseline)}">${first}</text>`,
    `<text x="${svgNumber(quietZone + 25.5 * moduleWidth)}" y="${svgNumber(baseline)}" textLength="${svgNumber(groupTextLength)}" lengthAdjust="spacing">${left}</text>`,
    `<text x="${svgNumber(quietZone + 69.5 * moduleWidth)}" y="${svgNumber(baseline)}" textLength="${svgNumber(groupTextLength)}" lengthAdjust="spacing">${right}</text>`,
    `</g>`
  ].join("");

  return withoutPaths.replace(
    "</svg>",
    `<g transform="translate(${svgNumber(quietZone)} 0) scale(1 0.82)">${barPaths}\n</g>\n${textLayer}\n</svg>`
  );
}

function svgNumber(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function getBwipTextFont(fontFamily: string): string {
  return fontFamily.split(",")[0].trim().replace(/^["']|["']$/g, "") || "Arial";
}

function escapeSvgAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function stripTransparentBackground(svg: string): string {
  return svg.replace(/<path\b(?=[^>]*\bfill=["']#(?:0000|00000000)["'])(?=[^>]*\bd=["']M0 0h)[^>]*\/>/i, "");
}
