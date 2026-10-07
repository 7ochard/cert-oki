import type { AppMode, BarcodeKind, BarcodePreset } from "./types";

const DEFAULT_HEIGHT_MM = 8;

export const BARCODE_PRESETS: BarcodePreset[] = [
  {
    kind: "ean8",
    label: "EAN-8",
    defaultData: "69123450",
    defaultHeightMm: DEFAULT_HEIGHT_MM,
    supportsText: true,
    description: "8位商品短码"
  },
  {
    kind: "ean13",
    label: "EAN-13",
    defaultData: "6912345678902",
    defaultHeightMm: DEFAULT_HEIGHT_MM,
    supportsText: true,
    description: "13位商品条码"
  },
  {
    kind: "ean128",
    label: "EAN-128 / GS1-128",
    defaultData: "(00)369112345600000015",
    defaultHeightMm: DEFAULT_HEIGHT_MM,
    supportsText: true,
    description: "GS1应用标识符条码"
  },
  {
    kind: "upca",
    label: "UPC-A",
    defaultData: "123456789012",
    defaultHeightMm: DEFAULT_HEIGHT_MM,
    supportsText: true,
    description: "12位北美商品条码"
  },
  {
    kind: "upce",
    label: "UPC-E",
    defaultData: "01234565",
    defaultHeightMm: DEFAULT_HEIGHT_MM,
    supportsText: true,
    description: "压缩UPC条码"
  },
  {
    kind: "code39",
    label: "CODE 39",
    defaultData: "ABC123",
    defaultHeightMm: DEFAULT_HEIGHT_MM,
    supportsText: true,
    description: "大写字母和数字"
  },
  {
    kind: "code93",
    label: "CODE 93",
    defaultData: "ABC123",
    defaultHeightMm: DEFAULT_HEIGHT_MM,
    supportsText: true,
    description: "高密度字母数字码"
  },
  {
    kind: "code128",
    label: "CODE 128",
    defaultData: "ABC123",
    defaultHeightMm: DEFAULT_HEIGHT_MM,
    supportsText: true,
    description: "通用高密度条码"
  },
  {
    kind: "code128a",
    label: "CODE 128A",
    defaultData: "ABC123",
    defaultHeightMm: DEFAULT_HEIGHT_MM,
    supportsText: true,
    description: "CODE 128 A字符集"
  },
  {
    kind: "code128b",
    label: "CODE 128B",
    defaultData: "ABC123",
    defaultHeightMm: DEFAULT_HEIGHT_MM,
    supportsText: true,
    description: "CODE 128 B字符集"
  },
  {
    kind: "code128c",
    label: "CODE 128C",
    defaultData: "0123",
    defaultHeightMm: DEFAULT_HEIGHT_MM,
    supportsText: true,
    description: "数字双位压缩"
  },
  {
    kind: "itf14",
    label: "ITF-14",
    defaultData: "0691234567890",
    defaultHeightMm: DEFAULT_HEIGHT_MM,
    supportsText: true,
    description: "物流外箱14位码"
  },
  {
    kind: "itf25",
    label: "ITF-25",
    defaultData: "0123",
    defaultHeightMm: DEFAULT_HEIGHT_MM,
    supportsText: true,
    description: "交叉二五码"
  },
  {
    kind: "qrcode",
    label: "QR Code",
    defaultData: "www.cnprint.org",
    defaultHeightMm: DEFAULT_HEIGHT_MM,
    supportsText: false,
    description: "二维码"
  }
];

export const PRESET_BY_KIND = BARCODE_PRESETS.reduce(
  (acc, preset) => {
    acc[preset.kind] = preset;
    return acc;
  },
  {} as Record<BarcodeKind, BarcodePreset>
);

export const APP_MODE_ORDER: AppMode[] = ["certificate", ...BARCODE_PRESETS.map((preset) => preset.kind)];
