import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";
import packageJson from "../../package.json";
import {
  APP_MODE_ORDER,
  BARCODE_PRESETS,
  DEFAULT_CERTIFICATE_CONTROL_ORDER,
  DEFAULT_CERTIFICATE_ITEM,
  DEFAULT_CERTIFICATE_TEMPLATE,
  buildBatchInputs,
  composeSvgGrid,
  copySvg,
  createCertificateBatchItems,
  createCertificateItem,
  exportCertificateZip,
  exportZip,
  generateBatch,
  generateCertificateBatch,
  generateCertificateSvg,
  generateCode,
  preserveCertificateBatchItems
} from "../core";
import type { BarcodeKind } from "../core";

const VALID_SAMPLES: Array<[BarcodeKind, string]> = [
  ["ean8", "69123450"],
  ["ean13", "6912345678902"],
  ["ean128", "(00)369112345600000015"],
  ["upca", "123456789012"],
  ["upce", "01234565"],
  ["code39", "ABC123"],
  ["code93", "ABC123"],
  ["code128", "ABC123"],
  ["code128a", "ABC123"],
  ["code128b", "ABC123"],
  ["code128c", "0123"],
  ["itf14", "0691234567890"],
  ["itf25", "0123"],
  ["qrcode", "https://example.com/产品"]
];

describe("generateCode", () => {
  it("uses 8mm as the default height for every preset", () => {
    expect(BARCODE_PRESETS.every((preset) => preset.defaultHeightMm === 8)).toBe(true);
  });

  it.each(VALID_SAMPLES)("generates SVG for %s", async (kind, data) => {
    const result = await generateCode({ kind, data, heightMm: 24, scale: 2, includeText: true });

    expect(result.svg).toContain("<svg");
    expect(result.svg).toContain("</svg>");
    expect(result.encoded.length).toBeGreaterThan(0);
    expect(result.filename.endsWith(".svg")).toBe(true);
  });

  it("applies EAN-13 check digit when body is provided", async () => {
    const result = await generateCode({ kind: "ean13", data: "691234567890" });

    expect(result.encoded).toBe("6912345678902");
  });

  it("formats EAN-13 readable text without changing encoded data", async () => {
    const result = await generateCode({
      kind: "ean13",
      data: "6912345678902",
      includeText: true,
      fontFamily: "HarmonyOS Sans SC, sans-serif"
    });

    expect(result.encoded).toBe("6912345678902");
    expect(result.svg).toContain('font-family="HarmonyOS Sans SC, sans-serif"');
    expect(result.svg).toContain(">6</text>");
    expect(result.svg).toContain(">912345</text>");
    expect(result.svg).toContain(">678902</text>");
    expect(result.svg).not.toContain(">6 912345 678902</text>");
  });

  it("keeps generated code SVG backgrounds transparent", async () => {
    const ean = await generateCode({ kind: "ean13", data: "6912345678902" });
    const qr = await generateCode({ kind: "qrcode", data: "https://example.com" });

    expect(ean.svg).not.toMatch(/backgroundcolor|fill=["']#?fff(?:fff)?["']|fill=["']white["']/i);
    expect(qr.svg).not.toMatch(/fill=["']#(?:fff(?:fff)?|0000|00000000)["']/i);
  });

  it("rejects invalid CODE 39 characters", async () => {
    await expect(generateCode({ kind: "code39", data: "abc-123" })).rejects.toThrow(/CODE 39/);
  });
});

describe("batch generation", () => {
  it("increments EAN-13 body and recalculates check digits", () => {
    const values = buildBatchInputs("ean13", "6912345678902", 3);

    expect(values).toEqual(["6912345678902", "6912345678919", "6912345678926"]);
  });

  it("preserves leading zeroes for arbitrary numeric suffixes", () => {
    const values = buildBatchInputs("code128", "BOX-0098", 3);

    expect(values).toEqual(["BOX-0098", "BOX-0099", "BOX-0100"]);
  });

  it("rejects batch data without a numeric suffix", () => {
    expect(() => buildBatchInputs("code128", "ABC", 2)).toThrow(/至少包含一段数字/);
  });

  it("creates sorted filenames for generated batches", async () => {
    const values = await generateBatch({ kind: "ean8", data: "69123450", count: 2 });

    expect(values[0].filename.startsWith("001_")).toBe(true);
    expect(values[1].filename.startsWith("002_")).toBe(true);
  });
});

describe("certificate generation", () => {
  it("places certificate mode before EAN-13", () => {
    expect(APP_MODE_ORDER[0]).toBe("certificate");
    expect(APP_MODE_ORDER[1]).toBe("ean8");
    expect(APP_MODE_ORDER.indexOf("certificate")).toBeLessThan(APP_MODE_ORDER.indexOf("ean13"));
  });

  it("uses Cert-oki as the project name", () => {
    expect(packageJson.name).toBe("cert-oki");
  });

  it("generates a certificate SVG with title, fields, and EAN barcode", async () => {
    const svg = await generateCertificateSvg(DEFAULT_CERTIFICATE_ITEM);

    expect(svg).toContain("<svg");
    expect(svg).toContain("合格证");
    expect(svg).toContain("UZSQUARE");
    expect(svg).toContain("PROTO滑雪裤");
    expect(svg).toContain("6912345678902");
    expect(svg).toContain("viewBox=\"0 0 800 1200\"");
  });

  it("maps the combined size row to size code before size spec", async () => {
    const svg = await generateCertificateSvg(DEFAULT_CERTIFICATE_ITEM);

    expect(svg).toContain('data-cert-field="sizeCode"');
    expect(svg).toContain("尺码：");
    const document = new DOMParser().parseFromString(svg, "image/svg+xml");
    const size = document.querySelector('text[data-cert-field="sizeCode"][x="119"]');
    const spec = document.querySelector('text[data-cert-field="sizeSpec"]');
    expect(size?.textContent).toBe("S");
    expect(spec?.textContent).toBe("170/80A");
    expect(Number(spec?.getAttribute("x"))).toBeGreaterThan(Number(size?.getAttribute("x")));
    expect(spec?.getAttribute("y")).toBe(size?.getAttribute("y"));
  });

  it("centers the certificate title on the canvas", async () => {
    const svg = await generateCertificateSvg(DEFAULT_CERTIFICATE_ITEM);

    expect(svg).toContain('data-cert-field="title" x="400"');
    expect(svg).toContain('text-anchor="middle"');
  });

  it("applies the selected certificate font to the exported SVG", async () => {
    const item = createCertificateItem({ fontFamily: "Stack Sans Headline, sans-serif" });
    const svg = await generateCertificateSvg(item);

    expect(svg).toContain('font-family="Stack Sans Headline, sans-serif"');
  });

  it("wraps the address without shrinking the field font", async () => {
    const svg = await generateCertificateSvg(DEFAULT_CERTIFICATE_ITEM);
    const addressLines = [...svg.matchAll(/<tspan x="119" dy="(?:0|[0-9.]+)">([^<]*)<\/tspan>/g)].map((match) => match[1]);

    expect(svg).not.toContain('font-size="26"');
    expect(addressLines.length).toBeGreaterThan(1);
    expect(addressLines.every((line) => line.length <= 18)).toBe(true);
  });

  it("keeps multiline address spacing bounded by the EAN area", async () => {
    const item = createCertificateItem({
      fields: {
        ...DEFAULT_CERTIFICATE_ITEM.fields,
        address: "深圳市南山区西丽街道高新北六道16号\n高北十六B2写字楼一层"
      }
    });
    const svg = await generateCertificateSvg(item);
    const addressY = Number(svg.match(/<text x="0" y="([0-9.]+)">地址：<\/text>/)?.[1] ?? 0);
    const lastAddressBaseline = addressY + 38.4;

    expect(lastAddressBaseline).toBeLessThanOrEqual(DEFAULT_CERTIFICATE_TEMPLATE.eanBox.y - 64);
  });

  it("wraps compliance fields with 120 percent line height", async () => {
    const item = createCertificateItem({
      fields: {
        ...DEFAULT_CERTIFICATE_ITEM.fields,
        standard: "GB/T 32614-2023\nFZ/T 73020-2019",
        safetyCategory: "GB 18401-2010 C类\n儿童纺织产品安全技术规范"
      }
    });
    const svg = await generateCertificateSvg(item);

    expect(svg).toContain("<tspan x=\"197\" dy=\"38.4\">");
    expect(svg).toContain("GB/T 32614-2023");
    expect(svg).toContain("FZ/T 73020-2019");
    expect(svg).toContain("儿童纺织产品安全技术规范");
  });

  it("renders custom certificate fields below the address area", async () => {
    const item = createCertificateItem({
      fields: {
        ...DEFAULT_CERTIFICATE_ITEM.fields,
        season: "冬季"
      }
    });
    const svg = await generateCertificateSvg(item);

    expect(svg).toContain("season：");
    expect(svg).toContain("冬季");
  });

  it("stacks custom certificate fields vertically and compresses row spacing", async () => {
    const item = createCertificateItem({
      fields: {
        ...DEFAULT_CERTIFICATE_ITEM.fields,
        自定义字段: "A",
        自定义字段2: "B",
        自定义字段3: "C",
        自定义字段4: "D"
      }
    });
    const svg = await generateCertificateSvg(item);
    const labelY = (label: string) => {
      const match = svg.match(new RegExp(`<text x="0" y="([0-9.]+)"(?: font-weight="400")?>${label}：</text>`));
      return match ? Number(match[1]) : 0;
    };

    expect(svg).toContain("自定义字段4：");
    expect(labelY("品名") - labelY("品牌")).toBeLessThan(80);
    expect(labelY("自定义字段2")).toBeGreaterThan(labelY("自定义字段"));
    expect(labelY("自定义字段3")).toBeGreaterThan(labelY("自定义字段2"));
    expect(labelY("自定义字段4")).toBeGreaterThan(labelY("自定义字段3"));
  });

  it("renders 2x2 custom certificate fields as two split rows", async () => {
    const item = createCertificateItem({
      customBlocks: [{
        id: "custom-2x2",
        label: "2*2 自定义组件",
        layout: "2x2",
        fields: ["customA", "customB", "customC", "customD"]
      }],
      fieldLabels: {
        customA: "自定义A",
        customB: "自定义B",
        customC: "自定义C",
        customD: "自定义D"
      },
      fields: {
        ...DEFAULT_CERTIFICATE_ITEM.fields,
        customA: "A",
        customB: "B",
        customC: "C",
        customD: "D"
      }
    });
    const svg = await generateCertificateSvg(item);
    const firstPair = svg.slice(svg.indexOf("自定义A："), svg.indexOf("自定义B："));
    const secondPair = svg.slice(svg.indexOf("自定义C："), svg.indexOf("自定义D："));

    expect(svg).toContain("自定义A：");
    expect(svg).toContain("自定义D：");
    expect(firstPair).not.toContain("</g><g");
    expect(secondPair).not.toContain("</g><g");
  });

  it("uses the edited control order when rendering certificate field groups", async () => {
    const item = createCertificateItem({
      controlOrder: ["custom", ...DEFAULT_CERTIFICATE_CONTROL_ORDER.filter((blockId) => blockId !== "custom")],
      fields: {
        ...DEFAULT_CERTIFICATE_ITEM.fields,
        自定义字段: "优先显示"
      }
    });
    const svg = await generateCertificateSvg(item);

    expect(svg.indexOf("自定义字段：")).toBeLessThan(svg.indexOf("品牌："));
    expect(svg).toContain("优先显示");
  });

  it("uses custom block ids in the control order", async () => {
    const item = createCertificateItem({
      controlOrder: ["custom-1x1", "product", ...DEFAULT_CERTIFICATE_CONTROL_ORDER.filter((blockId) => !["custom", "product"].includes(blockId)), "custom"],
      customBlocks: [{
        id: "custom-1x1",
        label: "1*1 自定义组件",
        layout: "1x1",
        fields: ["customTop"]
      }],
      fieldLabels: {
        customTop: "自定义置顶"
      },
      fields: {
        ...DEFAULT_CERTIFICATE_ITEM.fields,
        customTop: "置顶内容"
      }
    });
    const svg = await generateCertificateSvg(item);

    expect(svg.indexOf("自定义置顶：")).toBeLessThan(svg.indexOf("品牌："));
    expect(svg).toContain("置顶内容");
  });

  it("reflows spacing when a custom block is dragged before compliance fields", async () => {
    const item = createCertificateItem({
      controlOrder: ["product", "spec", "attributes", "custom-1x1", "compliance", "company", "custom", "ean", "commerce", "size"],
      customBlocks: [{
        id: "custom-1x1",
        label: "1*1 自定义组件",
        layout: "1x1",
        fields: ["customMiddle"]
      }],
      fieldLabels: {
        customMiddle: "自定义字段"
      },
      fields: {
        ...DEFAULT_CERTIFICATE_ITEM.fields,
        customMiddle: ""
      }
    });
    const svg = await generateCertificateSvg(item);
    const labelY = (label: string) => {
      const match = svg.match(new RegExp(`<text x="0" y="([0-9.]+)"(?: font-weight="400")?>${label}：</text>`));
      return match ? Number(match[1]) : 0;
    };

    expect(labelY("自定义字段")).toBeGreaterThan(labelY("款号"));
    expect(labelY("自定义字段")).toBeLessThan(labelY("执行标准"));
    expect(labelY("地址")).toBeLessThan(DEFAULT_CERTIFICATE_TEMPLATE.eanBox.y);
  });

  it("uses edited certificate field labels in the SVG output", async () => {
    const item = createCertificateItem({
      fieldLabels: {
        brand: "品牌名",
        safetyCategory: "安全等级",
        price: "吊牌价"
      }
    });
    const svg = await generateCertificateSvg(item);

    expect(svg).toContain("品牌名：");
    expect(svg).toContain("安全等级：");
    expect(svg).toContain("吊牌价：");
    expect(svg).not.toContain("品牌：");
    expect(svg).not.toContain("安全类别：");
  });

  it("omits hidden certificate fields from the SVG output", async () => {
    const item = createCertificateItem({
      hiddenFields: ["safetyCategory", "ean"],
      fields: {
        ...DEFAULT_CERTIFICATE_ITEM.fields,
        ean: "invalid"
      }
    });
    const svg = await generateCertificateSvg(item);

    expect(svg).not.toContain("安全类别：");
    expect(svg).not.toContain(DEFAULT_CERTIFICATE_ITEM.fields.safetyCategory);
    expect(svg).not.toContain('data-role="ean-box"');
  });

  it("keeps the EAN placeholder aligned to the Figma template box", async () => {
    const svg = await generateCertificateSvg(DEFAULT_CERTIFICATE_ITEM);

    expect(svg).toContain(`width="${DEFAULT_CERTIFICATE_TEMPLATE.eanBox.width}"`);
    expect(svg).toContain(`height="${DEFAULT_CERTIFICATE_TEMPLATE.eanBox.height}"`);
  });

  it("applies background color and external dimensions to the SVG", async () => {
    const item = createCertificateItem({
      backgroundColor: "#f5f5f7",
      widthMm: 90,
      heightMm: 135
    });
    const svg = await generateCertificateSvg(item);

    expect(svg).toContain('width="90mm"');
    expect(svg).toContain('height="135mm"');
    expect(svg).toContain('fill="#f5f5f7"');
  });

  it("switches certificate text color automatically on dark backgrounds", async () => {
    const lightSvg = await generateCertificateSvg(createCertificateItem({ backgroundColor: "#f5f5f7" }));
    const darkSvg = await generateCertificateSvg(createCertificateItem({ backgroundColor: "#111111" }));

    expect(lightSvg).toContain('fill="#111111" font-family=');
    expect(darkSvg).toContain('fill="#ffffff" font-family=');
    expect(darkSvg).toContain('<g transform="translate(50 150)" fill="#ffffff"');
  });

  it("does not add a white background behind embedded EAN codes", async () => {
    const item = createCertificateItem({ backgroundColor: "#f5f5f7" });
    const svg = await generateCertificateSvg(item);

    expect(svg).toContain('fill="#f5f5f7"');
    expect(svg).not.toMatch(/fill=["']#?fff(?:fff)?["']|fill=["']white["']/i);
  });

  it("generates multiple certificates from batch data", async () => {
    const items = createCertificateBatchItems(DEFAULT_CERTIFICATE_ITEM, 3);
    const generated = await generateCertificateBatch(items);

    expect(generated).toHaveLength(3);
    expect(generated[0].filename.startsWith("001_")).toBe(true);
    expect(generated[1].input.fields.ean).not.toBe(generated[0].input.fields.ean);
  });

  it("preserves edited certificate content when appending new items", () => {
    const edited = createCertificateItem({
      fields: {
        ...DEFAULT_CERTIFICATE_ITEM.fields,
        productName: "PROTO",
        ean: "6912345678964"
      }
    });
    const items = preserveCertificateBatchItems(DEFAULT_CERTIFICATE_ITEM, [edited], 2);

    expect(items).toHaveLength(2);
    expect(items[0].fields.productName).toBe("PROTO");
    expect(items[0].fields.ean).toBe("6912345678964");
    expect(items[1].fields.productName).toBe(DEFAULT_CERTIFICATE_ITEM.fields.productName);
    expect(items[1].fields.ean).toBe("6912345678919");
  });

  it("exports certificate SVG files into a ZIP blob", async () => {
    const items = createCertificateBatchItems(DEFAULT_CERTIFICATE_ITEM, 2);
    const blob = await exportCertificateZip(items, "svg");
    const zip = await JSZip.loadAsync(blob);

    expect(Object.keys(zip.files).sort()).toHaveLength(2);
  });
});

describe("output helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("copies SVG text through the clipboard fallback", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });

    await copySvg("<svg></svg>");

    expect(writeText).toHaveBeenCalledWith("<svg></svg>");
  });

  it("copies SVG through execCommand when clipboard API is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined
    });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand
    });

    await copySvg("<svg><text>LAN</text></svg>");

    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("falls back to execCommand when clipboard write is rejected", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        write: vi.fn().mockRejectedValue(new DOMException("blocked", "NotAllowedError"))
      }
    });
    Object.defineProperty(window, "ClipboardItem", {
      configurable: true,
      value: class ClipboardItem {
        constructor(public items: Record<string, Blob>) {}
      }
    });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand
    });

    await copySvg("<svg><text>Figma</text></svg>");

    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("composes batch items into one SVG grid", async () => {
    const items = await generateBatch({ kind: "ean8", data: "69123450", count: 2 });
    const grid = composeSvgGrid(items, 2, 12);

    expect(grid).toContain("<svg");
    expect(grid).toContain("<g transform=");
    expect(grid).toContain("viewBox=");
  });

  it("exports batch SVG files into a ZIP blob", async () => {
    const items = await generateBatch({ kind: "ean8", data: "69123450", count: 2 });
    const blob = await exportZip(items);
    const zip = await JSZip.loadAsync(blob);

    expect(Object.keys(zip.files).sort()).toEqual(items.map((item) => item.filename).sort());
  });
});
