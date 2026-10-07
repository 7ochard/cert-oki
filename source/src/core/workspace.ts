import { buildBatchInputs } from "./batch";
import { createCertificateItem } from "./certificate";
import { PRESET_BY_KIND } from "./presets";
import type { AppMode, BarcodeKind, CertificateItem, GenerateOptions } from "./types";

export const SIZE_SPECS: Record<string, string> = {
  XXS: "150/76A", XS: "155/80A", S: "160/84A", M: "165/88A", L: "170/92A", XL: "175/96A", XXL: "180/100A"
};
const SIZES = Object.keys(SIZE_SPECS);
export const DETAIL_FIELDS = ["sizeCode", "sizeSpec", "color", "ean"];

export interface CertificateRow {
  id: string;
  fields: Record<string, string>;
  title?: string;
  manualSizeSpec: boolean;
}
export interface CertificateDocument {
  defaults: CertificateItem;
  rows: CertificateRow[];
}
export interface BarcodeRow { id: string; data: string }
export interface BarcodeDraft {
  options: Omit<GenerateOptions, "data">;
  seed: string;
  appliedSeed: string;
  rows: BarcodeRow[];
}
export interface Workspace {
  mode: AppMode;
  certificate: CertificateDocument;
  barcodes: Partial<Record<BarcodeKind, BarcodeDraft>>;
}

export function normalizeCount(value: number): number {
  if (!Number.isFinite(value)) throw new Error("数量必须为 1–500 的整数。");
  return Math.min(500, Math.max(1, Math.trunc(value)));
}

function nextSize(size: string, offset: number): string {
  const index = SIZES.indexOf(size);
  return index < 0 ? size : SIZES[Math.min(index + offset, SIZES.length - 1)];
}

export function resolveCertificate(doc: CertificateDocument, row: CertificateRow): CertificateItem {
  return { ...doc.defaults, id: row.id, title: row.title ?? doc.defaults.title,
    fields: { ...doc.defaults.fields, ...row.fields } };
}

export function createCertificateDocument(count = 4): CertificateDocument {
  const defaults = createCertificateItem();
  defaults.fields.sizeSpec = SIZE_SPECS[defaults.fields.sizeCode];
  const eans = buildBatchInputs("ean13", defaults.fields.ean, normalizeCount(count));
  return { defaults, rows: eans.map((ean, index) => {
    const sizeCode = nextSize(defaults.fields.sizeCode, index);
    return { id: crypto.randomUUID(), fields: { ean, sizeCode, sizeSpec: SIZE_SPECS[sizeCode] }, manualSizeSpec: false };
  }) };
}

export function editCertificateRow(row: CertificateRow, key: string, value: string): CertificateRow {
  if (key === "title") return { ...row, title: value };
  const fields = { ...row.fields, [key]: value };
  if (key === "sizeCode" && !row.manualSizeSpec && SIZE_SPECS[value]) fields.sizeSpec = SIZE_SPECS[value];
  return { ...row, fields, manualSizeSpec: key === "sizeSpec" ? true : row.manualSizeSpec };
}

export function resetRowField(row: CertificateRow, key: string): CertificateRow {
  if (key === "title") { const { title: _title, ...rest } = row; return rest; }
  const fields = { ...row.fields };
  delete fields[key];
  return { ...row, fields, manualSizeSpec: key === "sizeSpec" ? false : row.manualSizeSpec };
}

export function syncSizeSpec(doc: CertificateDocument, row: CertificateRow): CertificateRow {
  const value = SIZE_SPECS[resolveCertificate(doc, row).fields.sizeCode];
  return value ? { ...row, fields: { ...row.fields, sizeSpec: value }, manualSizeSpec: false } : row;
}

export function updateDefaults(doc: CertificateDocument, updater: (item: CertificateItem) => CertificateItem): CertificateDocument {
  const defaults = updater(doc.defaults);
  // Removing a custom field must remove its per-row overrides as well.
  const removed = Object.keys(doc.defaults.fields).filter((key) => !(key in defaults.fields));
  return { defaults, rows: removed.length ? doc.rows.map((row) => ({ ...row,
    fields: Object.fromEntries(Object.entries(row.fields).filter(([key]) => !removed.includes(key)))
  })) : doc.rows };
}

export function resizeCertificates(doc: CertificateDocument, value: number): CertificateDocument {
  const count = normalizeCount(value);
  if (count <= doc.rows.length) return { ...doc, rows: doc.rows.slice(0, count) };
  const last = resolveCertificate(doc, doc.rows[doc.rows.length - 1]);
  const eans = buildBatchInputs("ean13", last.fields.ean, count - doc.rows.length + 1).slice(1);
  const added = eans.map((ean, index): CertificateRow => {
    const sizeCode = nextSize(last.fields.sizeCode, index + 1);
    return { id: crypto.randomUUID(), fields: { ean, sizeCode, sizeSpec: SIZE_SPECS[sizeCode] ?? doc.defaults.fields.sizeSpec }, manualSizeSpec: false };
  });
  return { ...doc, rows: [...doc.rows, ...added] };
}

export function resequenceCertificateEans(doc: CertificateDocument, seed: string): CertificateDocument {
  const eans = buildBatchInputs("ean13", seed, doc.rows.length);
  return { ...doc, rows: doc.rows.map((row, index) => editCertificateRow(row, "ean", eans[index])) };
}

export function createBarcodeDraft(kind: BarcodeKind): BarcodeDraft {
  const preset = PRESET_BY_KIND[kind];
  const seed = preset.defaultData;
  return { seed, appliedSeed: seed, options: { kind, heightMm: preset.defaultHeightMm, scale: 2,
    includeText: preset.supportsText, fontFamily: "HarmonyOS Sans SC, sans-serif" },
    rows: [{ id: crypto.randomUUID(), data: seed }] };
}

export function resizeBarcodes(draft: BarcodeDraft, value: number): BarcodeDraft {
  const count = normalizeCount(value);
  if (count <= draft.rows.length) return { ...draft, rows: draft.rows.slice(0, count) };
  const inputs = buildBatchInputs(draft.options.kind, draft.rows[draft.rows.length - 1].data, count - draft.rows.length + 1).slice(1);
  return { ...draft, rows: [...draft.rows, ...inputs.map((data) => ({ id: crypto.randomUUID(), data }))] };
}

export function resequenceBarcodes(draft: BarcodeDraft): BarcodeDraft {
  const data = draft.rows.length === 1 ? [draft.seed] : buildBatchInputs(draft.options.kind, draft.seed, draft.rows.length);
  return { ...draft, appliedSeed: draft.seed, rows: draft.rows.map((row, index) => ({ ...row, data: data[index] })) };
}

export function createWorkspace(): Workspace {
  return { mode: "certificate", certificate: createCertificateDocument(), barcodes: {} };
}

export function switchMode(workspace: Workspace, mode: AppMode): Workspace {
  return { ...workspace, mode, barcodes: mode === "certificate" || workspace.barcodes[mode]
    ? workspace.barcodes : { ...workspace.barcodes, [mode]: createBarcodeDraft(mode) } };
}

export function selectOutput<T extends { id: string }>(items: T[], scope: "all" | "current", selectedId: string): T[] {
  return scope === "all" ? items : items.filter((item) => item.id === selectedId);
}
