export type BarcodeKind =
  | "ean8"
  | "ean13"
  | "ean128"
  | "upca"
  | "upce"
  | "code39"
  | "code93"
  | "code128"
  | "code128a"
  | "code128b"
  | "code128c"
  | "itf14"
  | "itf25"
  | "qrcode";

export type AppMode = "certificate" | BarcodeKind;

export interface GenerateOptions {
  kind: BarcodeKind;
  data: string;
  heightMm?: number;
  scale?: number;
  includeText?: boolean;
  fontFamily?: string;
}

export interface BatchOptions extends GenerateOptions {
  count: number;
}

export interface GeneratedCode {
  kind: BarcodeKind;
  input: string;
  encoded: string;
  svg: string;
  filename: string;
  warnings: string[];
}

export interface BarcodePreset {
  kind: BarcodeKind;
  label: string;
  defaultData: string;
  defaultHeightMm: number;
  supportsText: boolean;
  description: string;
}

export interface CertificateFields {
  brand: string;
  productName: string;
  styleNo: string;
  sizeCode: string;
  sizeSpec: string;
  color: string;
  grade: string;
  inspector: string;
  standard: string;
  safetyCategory: string;
  company: string;
  address: string;
  ean: string;
  price: string;
  currency: string;
  [customField: string]: string;
}

export type CertificateFieldLayout = "1x1" | "1x2" | "2x2";

export interface CertificateCustomBlock {
  id: string;
  label: string;
  layout: CertificateFieldLayout;
  fields: string[];
}

export interface CertificateItem {
  id: string;
  title: string;
  fontFamily: string;
  fieldFonts: Record<string, string>;
  fields: CertificateFields;
  fieldLabels: Record<string, string>;
  hiddenFields: string[];
  controlOrder: string[];
  customBlocks: CertificateCustomBlock[];
  backgroundColor: string;
  widthMm: number;
  heightMm: number;
}

export interface CertificateTemplate {
  canvasWidth: number;
  canvasHeight: number;
  eanBox: { x: number; y: number; width: number; height: number };
}

export interface CertificateExportOptions {
  format: "svg" | "jpg" | "pdf";
}

export interface GeneratedCertificate {
  id: string;
  input: CertificateItem;
  svg: string;
  filename: string;
  warnings: string[];
}
