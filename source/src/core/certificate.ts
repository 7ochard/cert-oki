import JSZip from "jszip";
import { jsPDF } from "jspdf";
import { buildBatchInputs } from "./batch";
import { generateCode } from "./generator";
import { parseSvgMetrics } from "./svg";
import type { CertificateCustomBlock, CertificateExportOptions, CertificateItem, CertificateTemplate, GeneratedCertificate } from "./types";

export const DEFAULT_CERTIFICATE_TEMPLATE: CertificateTemplate = {
  canvasWidth: 800,
  canvasHeight: 1200,
  eanBox: { x: 80.75, y: 776, width: 538.5, height: 150 }
};

const FIELD_DEFAULT_STEP = 80;
const FIELD_MIN_STEP = 44;
const FIELD_TO_EAN_GAP = 64;
const FIELD_TEXT_BASELINE_OFFSET = 32;
const TEXT_LINE_HEIGHT = 32 * 1.2;
const PRICE_ROW_Y = 966;
export const DEFAULT_CERTIFICATE_CONTROL_ORDER = [
  "identity",
  "product",
  "spec",
  "attributes",
  "compliance",
  "company",
  "custom",
  "ean",
  "commerce",
  "size"
];

export const DEFAULT_CERTIFICATE_FIELD_LABELS: Record<string, string> = {
  title: "标题",
  brand: "品牌",
  productName: "品名",
  styleNo: "款号",
  sizeCode: "尺码",
  sizeSpec: "号型",
  color: "颜色",
  grade: "等级",
  inspector: "检验员",
  standard: "执行标准",
  safetyCategory: "安全类别",
  company: "公司",
  address: "地址",
  ean: "EAN",
  price: "零售价",
  currency: "币种"
};

export const DEFAULT_CERTIFICATE_ITEM: CertificateItem = {
  id: "cert-001",
  title: "合格证",
  fontFamily: "HarmonyOS Sans SC, sans-serif",
  fieldFonts: {},
  backgroundColor: "#ffffff",
  widthMm: 80,
  heightMm: 120,
  fieldLabels: DEFAULT_CERTIFICATE_FIELD_LABELS,
  hiddenFields: [],
  controlOrder: DEFAULT_CERTIFICATE_CONTROL_ORDER,
  customBlocks: [],
  fields: {
    brand: "UZSQUARE",
    productName: "PROTO滑雪裤",
    styleNo: "26AW0200509F",
    sizeCode: "S",
    sizeSpec: "170/80A",
    color: "深灰",
    grade: "合格品",
    inspector: "检01",
    standard: "GB/T 32614-2023",
    safetyCategory: "GB 18401-2010 C类",
    company: "未限文化科技（深圳）有限公司",
    address: "深圳市南山区西丽街道高新北六道16号高北十六B2写字楼一层",
    ean: "6912345678902",
    price: "1598",
    currency: "CNY"
  }
};

export function createCertificateItem(overrides: Partial<CertificateItem> = {}): CertificateItem {
  return {
    ...DEFAULT_CERTIFICATE_ITEM,
    ...overrides,
    hiddenFields: overrides.hiddenFields ?? DEFAULT_CERTIFICATE_ITEM.hiddenFields,
    controlOrder: overrides.controlOrder ?? DEFAULT_CERTIFICATE_ITEM.controlOrder,
    customBlocks: overrides.customBlocks ?? DEFAULT_CERTIFICATE_ITEM.customBlocks,
    fieldFonts: {
      ...DEFAULT_CERTIFICATE_ITEM.fieldFonts,
      ...overrides.fieldFonts
    },
    fieldLabels: {
      ...DEFAULT_CERTIFICATE_ITEM.fieldLabels,
      ...overrides.fieldLabels
    },
    fields: {
      ...DEFAULT_CERTIFICATE_ITEM.fields,
      ...overrides.fields
    }
  };
}

export function createCertificateBatchItems(seed: CertificateItem, count: number): CertificateItem[] {
  const eans = buildBatchInputs("ean13", seed.fields.ean, count);
  return eans.map((ean, index) => ({
    ...seed,
    id: `cert-${String(index + 1).padStart(3, "0")}`,
    fields: {
      ...seed.fields,
      ean
    }
  }));
}

export function preserveCertificateBatchItems(
  seed: CertificateItem,
  existingItems: CertificateItem[],
  count: number
): CertificateItem[] {
  const safeCount = Math.max(1, Math.min(500, count || 1));
  const normalizedExisting = (existingItems.length ? existingItems : [seed]).map((item, index) => ({
    ...item,
    id: `cert-${String(index + 1).padStart(3, "0")}`
  }));

  if (safeCount <= normalizedExisting.length) {
    return normalizedExisting.slice(0, safeCount);
  }

  const generatedItems = createCertificateBatchItems(seed, safeCount);
  return [
    ...normalizedExisting,
    ...generatedItems.slice(normalizedExisting.length).map((item, index) => ({
      ...item,
      id: `cert-${String(normalizedExisting.length + index + 1).padStart(3, "0")}`
    }))
  ];
}

export async function generateCertificateSvg(
  item: CertificateItem,
  template = DEFAULT_CERTIFICATE_TEMPLATE
): Promise<string> {
  const certificateFont = item.fontFamily || "HarmonyOS Sans SC, sans-serif";
  const hiddenFields = new Set(item.hiddenFields ?? []);
  const visible = (fieldKey: string) => !hiddenFields.has(fieldKey);
  const ean = visible("ean") ? await generateCode({
    kind: "ean13",
    data: item.fields.ean,
    heightMm: 8,
    scale: 2,
    includeText: true,
    fontFamily: certificateFont
  }) : null;
  const legacyCustomFieldRows = getLegacyCustomFieldRows(item);
  const customRowCount = getCustomRowCount(item);
  const textColor = readableTextColor(item.backgroundColor);
  const fieldFont = (fieldKey: string) => item.fieldFonts?.[fieldKey] || certificateFont;
  const rowRenderers: RowRenderer[] = [];
  const addRenderer = (renderer: false | "" | null | undefined | ((y: number, rowStep: number) => string), extraHeight = 0) => {
    if (renderer) {
      rowRenderers.push({ render: renderer, extraHeight });
    }
  };

  const addCustomRows = (rows: CustomFieldEntry[][]) => {
    for (const customRow of rows) {
      if (customRow.length === 1) {
        const [customField] = customRow;
        addRenderer((y) => renderRow(y, `${customField.label}：`, customField.value, 119, fieldFont(customField.key), customField.key));
      } else {
        const [leftField, rightField] = customRow;
        addRenderer((y) => renderSplitRow(
          y,
          `${leftField.label}：`,
          leftField.value,
          `${rightField.label}：`,
          rightField.value,
          119,
          fieldFont(leftField.key),
          fieldFont(rightField.key),
          leftField.key,
          rightField.key
        ));
      }
    }
  };

  for (const blockId of getOrderedCertificateBlocks(item.controlOrder, item.customBlocks ?? [])) {
    const customBlock = (item.customBlocks ?? []).find((block) => block.id === blockId);
    if (customBlock) {
      addCustomRows(getCustomBlockRows(item, customBlock));
    } else if (blockId === "product") {
      addRenderer(visible("brand") ? (y) => renderRow(y, labelWithColon(item, "brand"), item.fields.brand, 119, fieldFont("brand"), "brand") : null);
      addRenderer(visible("productName") ? (y) => renderRow(y, labelWithColon(item, "productName"), item.fields.productName, 119, fieldFont("productName"), "productName") : null);
    } else if (blockId === "spec") {
      addRenderer(visible("styleNo") ? (y) => renderRow(y, labelWithColon(item, "styleNo"), item.fields.styleNo, 119, fieldFont("styleNo"), "styleNo") : null);
      addRenderer(visible("sizeCode") || visible("sizeSpec") || visible("color")
        ? (y) => renderSizeRow(y, item, visible, fieldFont) : null);
    } else if (blockId === "attributes") {
      addRenderer(Boolean(visible("grade") || visible("inspector")) ? (y) => renderSplitRow(
        y,
        visible("grade") ? labelWithColon(item, "grade") : "",
        visible("grade") ? item.fields.grade : "",
        visible("inspector") ? labelWithColon(item, "inspector") : "",
        visible("inspector") ? item.fields.inspector : "",
        158,
        fieldFont("grade"),
        fieldFont("inspector"),
        "grade",
        "inspector"
      ) : null);
    } else if (blockId === "compliance") {
      if (visible("standard")) {
        const standardLines = wrapText(item.fields.standard, 19, 3);
        addRenderer((y) => renderMultilineRow(y, labelWithColon(item, "standard"), standardLines, 197, fieldFont("standard"), "standard"), getExtraLineHeight(standardLines));
      }
      if (visible("safetyCategory")) {
        const safetyLines = wrapText(item.fields.safetyCategory, 19, 3);
        addRenderer((y) => renderMultilineRow(y, labelWithColon(item, "safetyCategory"), safetyLines, 197, fieldFont("safetyCategory"), "safetyCategory"), getExtraLineHeight(safetyLines));
      }
    } else if (blockId === "company") {
      addRenderer(visible("company") ? (y) => renderRow(y, labelWithColon(item, "company"), item.fields.company, 119, fieldFont("company"), "company") : null);
      if (visible("address")) {
        const addressMaxLines = customRowCount ? 2 : 3;
        const addressLines = wrapText(item.fields.address, 17, addressMaxLines);
        addRenderer((y, rowStep) => renderAddressRow(y, item, addressLines, fieldFont("address"), rowStep), getExtraLineHeight(addressLines));
      }
    } else if (blockId === "custom") {
      addCustomRows(legacyCustomFieldRows);
    }
  }

  const totalExtraHeight = rowRenderers.reduce((total, row) => total + row.extraHeight, 0);
  const layout = getCertificateLayout(item, template, rowRenderers);
  const rowStep = getFieldRowStep(rowRenderers.length, totalExtraHeight, layout.lastTextBaselineY);
  const eanMarkup = ean ? embedSvgInBox(ean.svg, layout.eanBox) : "";
  const contentRows: string[] = [];
  let rowY = 0;
  const pushRow = (row: string, extraHeight: number) => {
    if (!row) {
      return;
    }
    contentRows.push(row);
    rowY += rowStep + extraHeight;
  };

  for (const renderer of rowRenderers) {
    pushRow(renderer.render(rowY, rowStep), renderer.extraHeight);
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${svgNumber(item.widthMm)}mm" height="${svgNumber(layout.heightMm)}mm" viewBox="0 0 ${template.canvasWidth} ${svgNumber(layout.canvasHeight)}">`,
    `<rect width="${template.canvasWidth}" height="${svgNumber(layout.canvasHeight)}" fill="${escapeAttribute(item.backgroundColor)}" />`,
    visible("title") ? `<text data-cert-field="title" x="${template.canvasWidth / 2}" y="97" text-anchor="middle" fill="${textColor}" font-family="${escapeAttribute(fieldFont("title"))}" font-size="54" font-weight="600">${escapeText(item.title)}</text>` : "",
    `<g transform="translate(50 150)" fill="${textColor}" font-family="${escapeAttribute(certificateFont)}" font-size="32" font-weight="400">`,
    ...contentRows,
    visible("ean") ? `<g data-cert-field="ean"><rect data-role="ean-box" data-ean="${escapeAttribute(item.fields.ean)}" x="${svgNumber(layout.eanBox.x)}" y="${svgNumber(layout.eanBox.y)}" width="${svgNumber(layout.eanBox.width)}" height="${svgNumber(layout.eanBox.height)}" fill="none" />${eanMarkup}</g>` : "",
    visible("price") || visible("currency") ? renderPriceRow(item, visible("price") ? item.fields.price : "", visible("currency") ? item.fields.currency : "", layout.priceY, fieldFont("price"), fieldFont("currency")) : "",
    `</g>`,
    `</svg>`
  ].filter(Boolean).join("");
}

export async function generateCertificateBatch(
  items: CertificateItem[],
  template = DEFAULT_CERTIFICATE_TEMPLATE
): Promise<GeneratedCertificate[]> {
  const generated = await Promise.all(items.map((item) => generateCertificateSvg(item, template)));
  return generated.map((svg, index) => ({
    id: items[index].id,
    input: items[index],
    svg,
    filename: `${String(index + 1).padStart(3, "0")}_${safeFilename(items[index].fields.ean || items[index].id)}.svg`,
    warnings: []
  }));
}

export async function exportCertificateJpg(
  item: CertificateItem,
  template = DEFAULT_CERTIFICATE_TEMPLATE
): Promise<Blob> {
  const svg = await generateCertificateSvg(item, template);
  return svgToJpgBlob(svg, Math.max(template.canvasWidth, template.canvasHeight));
}

export async function exportCertificatePdf(
  input: CertificateItem | CertificateItem[],
  template = DEFAULT_CERTIFICATE_TEMPLATE
): Promise<Blob> {
  const items = Array.isArray(input) ? input : [input];
  if (!items.length) {
    throw new Error("没有可导出的合格证。");
  }

  const first = items[0];
  const pdf = new jsPDF({
    orientation: first.widthMm > first.heightMm ? "landscape" : "portrait",
    unit: "mm",
    format: [first.widthMm, first.heightMm]
  });

  for (let index = 0; index < items.length; index += 1) {
    if (index > 0) {
      pdf.addPage([items[index].widthMm, items[index].heightMm], items[index].widthMm > items[index].heightMm ? "landscape" : "portrait");
    }
    const svg = await generateCertificateSvg(items[index], template);
    const jpg = await svgToDataUrl(svg, Math.max(template.canvasWidth, template.canvasHeight));
    pdf.addImage(jpg, "JPEG", 0, 0, items[index].widthMm, items[index].heightMm);
  }

  return pdf.output("blob");
}

export async function exportCertificateZip(
  items: CertificateItem[],
  format: CertificateExportOptions["format"],
  template = DEFAULT_CERTIFICATE_TEMPLATE
): Promise<Blob> {
  if (!items.length) {
    throw new Error("没有可导出的批量结果。");
  }

  const zip = new JSZip();
  if (format === "svg") {
    const generated = await generateCertificateBatch(items, template);
    for (const item of generated) {
      zip.file(item.filename, item.svg);
    }
  } else if (format === "jpg") {
    for (let index = 0; index < items.length; index += 1) {
      const blob = await exportCertificateJpg(items[index], template);
      zip.file(`${String(index + 1).padStart(3, "0")}_${safeFilename(items[index].fields.ean)}.jpg`, blob);
    }
  } else {
    for (let index = 0; index < items.length; index += 1) {
      const blob = await exportCertificatePdf(items[index], template);
      zip.file(`${String(index + 1).padStart(3, "0")}_${safeFilename(items[index].fields.ean)}.pdf`, blob);
    }
  }
  return zip.generateAsync({ type: "blob" });
}

function renderSizeRow(y: number, item: CertificateItem, visible: (key: string) => boolean, font: (key: string) => string): string {
  const code = visible("sizeCode"), spec = visible("sizeSpec"), color = visible("color");
  const labelKey = code ? "sizeCode" : "sizeSpec";
  const text = (key: string, x: number, value: string) => `<text data-cert-field="${escapeAttribute(key)}" x="${x}" y="32" font-family="${escapeAttribute(font(key))}">${escapeText(value)}</text>`;
  return [`<g transform="translate(0 ${svgNumber(y)})">`,
    code || spec ? text(labelKey, 0, labelWithColon(item, labelKey)) : "",
    code ? text("sizeCode", 119, item.fields.sizeCode) : "",
    spec ? text("sizeSpec", code ? 180 : 119, item.fields.sizeSpec) : "",
    color ? text("color", 380, labelWithColon(item, "color")) + text("color", 499, item.fields.color) : "", "</g>"].join("");
}

function renderRow(y: number, label: string, value: string, labelWidth = 119, fontFamily = "", fieldKey = ""): string {
  return [
    `<g${fieldKey ? ` data-cert-field="${escapeAttribute(fieldKey)}"` : ""} font-family="${escapeAttribute(fontFamily)}">`,
    `<text x="0" y="${svgNumber(y + 32)}" font-weight="400">${escapeText(label)}</text>`,
    `<text x="${labelWidth}" y="${svgNumber(y + 32)}">${escapeText(value)}</text>`,
    `</g>`
  ].join("");
}

function renderSplitRow(
  y: number,
  leftLabel: string,
  leftValue: string,
  rightLabel: string,
  rightValue: string,
  rightLabelWidth = 119,
  leftFontFamily = "",
  rightFontFamily = "",
  leftFieldKey = "",
  rightFieldKey = ""
): string {
  return [
    `<g transform="translate(0 ${svgNumber(y)})">`,
    `<text${leftFieldKey ? ` data-cert-field="${escapeAttribute(leftFieldKey)}"` : ""} x="0" y="32" font-family="${escapeAttribute(leftFontFamily)}">${escapeText(leftLabel)}</text>`,
    `<text${leftFieldKey ? ` data-cert-field="${escapeAttribute(leftFieldKey)}"` : ""} x="119" y="32" font-family="${escapeAttribute(leftFontFamily)}">${escapeText(leftValue)}</text>`,
    `<text${rightFieldKey ? ` data-cert-field="${escapeAttribute(rightFieldKey)}"` : ""} x="380" y="32" font-family="${escapeAttribute(rightFontFamily)}">${escapeText(rightLabel)}</text>`,
    `<text${rightFieldKey ? ` data-cert-field="${escapeAttribute(rightFieldKey)}"` : ""} x="${380 + rightLabelWidth}" y="32" font-family="${escapeAttribute(rightFontFamily)}">${escapeText(rightValue)}</text>`,
    `</g>`
  ].join("");
}

type RowRenderer = {
  render: (y: number, rowStep: number) => string;
  extraHeight: number;
};

function renderAddressRow(y: number, item: CertificateItem, lines: string[], fontFamily = "", rowStep = FIELD_DEFAULT_STEP): string {
  return [
    `<g data-cert-field="address" font-family="${escapeAttribute(fontFamily)}">`,
    `<text x="0" y="${svgNumber(y + 32)}">${escapeText(labelWithColon(item, "address"))}</text>`,
    `<text x="119" y="${svgNumber(y + 32)}">`,
    ...lines.map((line, index) => `<tspan x="119" dy="${index === 0 ? 0 : svgNumber(TEXT_LINE_HEIGHT)}">${escapeText(line)}</tspan>`),
    `</text>`,
    `</g>`
  ].join("");
}

function renderMultilineRow(y: number, label: string, lines: string[], labelWidth = 119, fontFamily = "", fieldKey = ""): string {
  return [
    `<g${fieldKey ? ` data-cert-field="${escapeAttribute(fieldKey)}"` : ""} font-family="${escapeAttribute(fontFamily)}">`,
    `<text x="0" y="${svgNumber(y + 32)}" font-weight="400">${escapeText(label)}</text>`,
    `<text x="${labelWidth}" y="${svgNumber(y + 32)}">`,
    ...lines.map((line, index) => `<tspan x="${labelWidth}" dy="${index === 0 ? 0 : svgNumber(TEXT_LINE_HEIGHT)}">${escapeText(line)}</tspan>`),
    `</text>`,
    `</g>`
  ].join("");
}

function renderPriceRow(item: CertificateItem, price: string, currency: string, y = PRICE_ROW_Y, priceFontFamily = "", currencyFontFamily = ""): string {
  return [
    `<g transform="translate(0 ${svgNumber(y)})">`,
    `<g data-cert-field="price">`,
    `<text x="0" y="32" font-family="${escapeAttribute(priceFontFamily)}">${escapeText(labelWithColon(item, "price"))}</text>`,
    `<text x="512" y="32" font-family="${escapeAttribute(priceFontFamily)}">${escapeText(price)}</text>`,
    `</g>`,
    `<g data-cert-field="currency">`,
    `<text x="621" y="32" font-family="${escapeAttribute(currencyFontFamily)}">${escapeText(currency)}</text>`,
    `</g>`,
    `</g>`
  ].join("");
}

type CustomFieldEntry = { key: string; label: string; value: string };

type CertificateLayout = {
  canvasHeight: number;
  heightMm: number;
  eanBox: CertificateTemplate["eanBox"];
  priceY: number;
  lastTextBaselineY: number;
};

function getCertificateLayout(item: CertificateItem, template: CertificateTemplate, rows: RowRenderer[]): CertificateLayout {
  const totalExtraHeight = rows.reduce((total, row) => total + row.extraHeight, 0);
  const defaultLastTextBaselineY = template.eanBox.y - FIELD_TO_EAN_GAP;
  const requiredLastTextBaselineY = FIELD_TEXT_BASELINE_OFFSET + Math.max(0, rows.length - 1) * FIELD_MIN_STEP + totalExtraHeight;
  const overflow = Math.max(0, requiredLastTextBaselineY - defaultLastTextBaselineY);
  const canvasHeight = template.canvasHeight + overflow;

  return {
    canvasHeight,
    heightMm: item.heightMm * (canvasHeight / template.canvasHeight),
    eanBox: {
      ...template.eanBox,
      y: template.eanBox.y + overflow
    },
    priceY: PRICE_ROW_Y + overflow,
    lastTextBaselineY: defaultLastTextBaselineY + overflow
  };
}

function getCustomBlockRows(item: CertificateItem, block: CertificateCustomBlock): CustomFieldEntry[][] {
  const reserved = new Set(Object.keys(DEFAULT_CERTIFICATE_ITEM.fields));
  const hiddenFields = new Set(item.hiddenFields ?? []);
  const entries = block.fields
    .filter((key) => !reserved.has(key) && !hiddenFields.has(key) && key in item.fields)
    .map((key) => ({ key, label: fieldLabel(item, key), value: item.fields[key] }));

  if (block.layout === "1x1") {
    return entries.map((entry) => [entry]);
  }

  const rows: CustomFieldEntry[][] = [];
  for (let index = 0; index < entries.length; index += 2) {
    rows.push(entries.slice(index, index + 2));
  }
  return rows;
}

function getLegacyCustomFieldRows(item: CertificateItem): CustomFieldEntry[][] {
  const reserved = new Set(Object.keys(DEFAULT_CERTIFICATE_ITEM.fields));
  const hiddenFields = new Set(item.hiddenFields ?? []);
  const blockFields = new Set((item.customBlocks ?? []).flatMap((block) => block.fields));
  const rows: CustomFieldEntry[][] = [];

  for (const key of Object.keys(item.fields)) {
    if (!reserved.has(key) && !hiddenFields.has(key) && !blockFields.has(key)) {
      rows.push([{ key, label: fieldLabel(item, key), value: item.fields[key] }]);
    }
  }

  return rows;
}

function getCustomRowCount(item: CertificateItem): number {
  const blockRows = (item.customBlocks ?? []).reduce((count, block) => count + getCustomBlockRows(item, block).length, 0);
  return blockRows + getLegacyCustomFieldRows(item).length;
}

function fieldLabel(item: CertificateItem, fieldKey: string): string {
  return item.fieldLabels?.[fieldKey] ?? DEFAULT_CERTIFICATE_FIELD_LABELS[fieldKey] ?? fieldKey;
}

function labelWithColon(item: CertificateItem, fieldKey: string): string {
  return `${fieldLabel(item, fieldKey)}：`;
}

function getExtraLineHeight(lines: string[]): number {
  return Math.max(0, lines.length - 1) * TEXT_LINE_HEIGHT;
}

function getFieldRowStep(rowCount: number, extraHeight = 0, lastTextBaselineY = 720): number {
  if (rowCount <= 1) {
    return FIELD_DEFAULT_STEP;
  }

  const availableHeight = Math.max(FIELD_MIN_STEP, lastTextBaselineY - FIELD_TEXT_BASELINE_OFFSET - extraHeight);
  return Math.min(FIELD_DEFAULT_STEP, Math.max(FIELD_MIN_STEP, availableHeight / (rowCount - 1)));
}

function getOrderedCertificateBlocks(order: string[], customBlocks: CertificateCustomBlock[]): string[] {
  const customIds = customBlocks.map((block) => block.id);
  const known = new Set([...DEFAULT_CERTIFICATE_CONTROL_ORDER, ...customIds]);
  const ordered: string[] = [];
  for (const blockId of order) {
    if (known.has(blockId) && !ordered.includes(blockId)) {
      ordered.push(blockId);
    }
  }
  for (const blockId of DEFAULT_CERTIFICATE_CONTROL_ORDER) {
    if (!ordered.includes(blockId)) {
      ordered.push(blockId);
    }
    if (blockId === "custom") {
      let insertIndex = ordered.indexOf("custom") + 1;
      for (const customId of customIds) {
        if (!ordered.includes(customId)) {
          ordered.splice(insertIndex, 0, customId);
          insertIndex += 1;
        }
      }
    }
  }
  return ordered;
}

function readableTextColor(backgroundColor: string): "#111111" | "#ffffff" {
  const rgb = parseHexColor(backgroundColor);
  if (!rgb) {
    return "#111111";
  }
  const luminance = (0.299 * rgb.red + 0.587 * rgb.green + 0.114 * rgb.blue) / 255;
  return luminance > 0.62 ? "#111111" : "#ffffff";
}

function parseHexColor(value: string): { red: number; green: number; blue: number } | null {
  const match = value.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) {
    return null;
  }
  const hex = match[1].length === 3
    ? match[1].split("").map((char) => char + char).join("")
    : match[1];
  return {
    red: parseInt(hex.slice(0, 2), 16),
    green: parseInt(hex.slice(2, 4), 16),
    blue: parseInt(hex.slice(4, 6), 16)
  };
}

function embedSvgInBox(svg: string, box: CertificateTemplate["eanBox"]): string {
  const metrics = parseSvgMetrics(svg);
  const scale = Math.min(box.width / metrics.width, box.height / metrics.height);
  const width = metrics.width * scale;
  const height = metrics.height * scale;
  const x = box.x + (box.width - width) / 2;
  const y = box.y + (box.height - height) / 2;
  return `<svg x="${svgNumber(x)}" y="${svgNumber(y)}" width="${svgNumber(width)}" height="${svgNumber(height)}" viewBox="${metrics.viewBox}">${metrics.body}</svg>`;
}

function wrapText(value: string, maxUnits: number, maxLines: number): string[] {
  if (!value) {
    return [""];
  }

  const lines = value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .flatMap((line) => splitByUnits(line, maxUnits));
  if (lines.length <= maxLines) {
    return lines;
  }

  const visible = lines.slice(0, maxLines);
  visible[maxLines - 1] = truncateByUnits(
    `${visible[maxLines - 1]}${lines.slice(maxLines).join("")}`,
    Math.max(1, maxUnits - 1)
  );
  return visible.map((line, index) => (index === maxLines - 1 ? `${line}…` : line));
}

function splitByUnits(value: string, maxUnits: number): string[] {
  const lines: string[] = [];
  let current = "";
  let currentUnits = 0;

  for (const char of value) {
    const nextUnits = currentUnits + measureCharUnit(char);
    if (current && nextUnits > maxUnits) {
      lines.push(current);
      current = char;
      currentUnits = measureCharUnit(char);
    } else {
      current += char;
      currentUnits = nextUnits;
    }
  }

  if (current) {
    lines.push(current);
  }
  return lines;
}

function truncateByUnits(value: string, maxUnits: number): string {
  let result = "";
  let units = 0;
  for (const char of value) {
    const nextUnits = units + measureCharUnit(char);
    if (nextUnits > maxUnits) {
      break;
    }
    result += char;
    units = nextUnits;
  }
  return result;
}

function measureCharUnit(char: string): number {
  if (/\s/.test(char)) {
    return 0.35;
  }
  return char.charCodeAt(0) <= 0x7f ? 0.55 : 1;
}

function safeFilename(value: string): string {
  return (value || "certificate").replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "certificate";
}

function svgNumber(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;");
}

async function svgToJpgBlob(svg: string, maxDimension: number): Promise<Blob> {
  const dataUrl = await svgToDataUrl(svg, maxDimension);
  const response = await fetch(dataUrl);
  return response.blob();
}

export async function svgToDataUrl(svg: string, maxDimension: number): Promise<string> {
  const metrics = parseSvgMetrics(svg);
  const scale = maxDimension / Math.max(metrics.width, metrics.height);
  const width = Math.round(metrics.width * scale);
  const height = Math.round(metrics.height * scale);
  const image = new Image();
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("合格证渲染失败。"));
    image.src = svgUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("当前浏览器不支持 Canvas 导出。");
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.95);
}
