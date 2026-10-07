import { describe, expect, it } from "vitest";
import { createBarcodeDraft, createCertificateDocument, createWorkspace, editCertificateRow, normalizeCount,
  resequenceBarcodes, resequenceCertificateEans, resetRowField, resizeBarcodes, resizeCertificates,
  resolveCertificate, selectOutput, switchMode, syncSizeSpec, updateDefaults } from "../core/workspace";
import { generatePreview, previewInput } from "../usePreview";
import { generateCode } from "../core/generator";
import { composeSvgGrid, parseSvgMetrics, prepareSvgForClipboard } from "../core/svg";

describe("editable records are the source of truth", () => {
  it("starts with S/M/L/XL, linked sizes and consecutive EANs", () => {
    const doc = createCertificateDocument();
    expect(doc.rows.map((row) => resolveCertificate(doc, row).fields.sizeCode)).toEqual(["S", "M", "L", "XL"]);
    expect(doc.rows.map((row) => row.fields.sizeSpec)).toEqual(["160/84A", "165/88A", "170/92A", "175/96A"]);
    expect(doc.rows.map((row) => row.fields.ean)).toEqual(["6912345678902", "6912345678919", "6912345678926", "6912345678933"]);
  });
  it("keeps individual exceptions when common values change, including explicit equal overrides", () => {
    let doc = createCertificateDocument();
    doc.rows[1] = editCertificateRow(doc.rows[1], "brand", doc.defaults.fields.brand);
    doc.rows[2] = editCertificateRow(doc.rows[2], "brand", "单张品牌");
    doc = updateDefaults(doc, (item) => ({ ...item, fields: { ...item.fields, brand: "新公共品牌" } }));
    expect(doc.rows.map((row) => resolveCertificate(doc, row).fields.brand)).toEqual(["新公共品牌", "UZSQUARE", "单张品牌", "新公共品牌"]);
    doc.rows[2] = resetRowField(doc.rows[2], "brand");
    expect(resolveCertificate(doc, doc.rows[2]).fields.brand).toBe("新公共品牌");
  });
  it("adding and deleting rows keeps IDs and all edits, never restores deleted rows", () => {
    let doc = createCertificateDocument();
    doc.rows[1] = editCertificateRow(doc.rows[1], "color", "审查蓝色");
    const initial = doc.rows.slice();
    doc = resizeCertificates(doc, 5);
    expect(doc.rows).toHaveLength(5);
    expect(doc.rows.slice(0, 4)).toEqual(initial);
    doc = { ...doc, rows: doc.rows.filter((row) => row.id !== initial[0].id) };
    expect(doc.rows[0]).toEqual(initial[1]);
    doc = resizeCertificates(doc, 5);
    expect(new Set(doc.rows.map((row) => row.id)).size).toBe(5);
    expect(new Set(doc.rows.map((row) => row.fields.ean)).size).toBe(5);
    expect(doc.rows[0].fields.color).toBe("审查蓝色");
  });
  it("editing size or EAN never replaces other row content", () => {
    const doc = createCertificateDocument();
    let row = editCertificateRow(doc.rows[1], "color", "红色");
    row = editCertificateRow(row, "sizeCode", "XXL");
    row = editCertificateRow(row, "ean", "6975396545111");
    expect(row.fields).toMatchObject({ color: "红色", sizeCode: "XXL", sizeSpec: "180/100A", ean: "6975396545111" });
    expect(row.id).toBe(doc.rows[1].id);
  });
  it("manual sizes survive size edits until explicit relinking", () => {
    const doc = createCertificateDocument();
    let row = editCertificateRow(doc.rows[0], "sizeSpec", "定制号型");
    row = editCertificateRow(row, "sizeCode", "XL");
    expect(row.fields.sizeSpec).toBe("定制号型");
    row = syncSizeSpec(doc, row);
    expect(row.fields.sizeSpec).toBe("175/96A");
    expect(row.manualSizeSpec).toBe(false);
  });
  it("resequence changes EANs only", () => {
    const doc = createCertificateDocument();
    doc.rows[1] = editCertificateRow(doc.rows[1], "color", "红色");
    const next = resequenceCertificateEans(doc, "6975396545111");
    next.rows.forEach((row, index) => expect({ ...row, fields: { ...row.fields, ean: doc.rows[index].fields.ean } }).toEqual(doc.rows[index]));
    expect(next.rows[0].fields.ean).not.toBe(doc.rows[0].fields.ean);
  });
  it("rejects bad sequence seeds without changing valid records", () => {
    const doc = createCertificateDocument();
    const snapshot = JSON.stringify(doc);
    expect(() => resequenceCertificateEans(doc, "invalid")).toThrow();
    expect(JSON.stringify(doc)).toBe(snapshot);
  });
  it("bounds all quantity paths to whole numbers between 1 and 500", () => {
    expect(normalizeCount(0)).toBe(1);
    expect(normalizeCount(4.9)).toBe(4);
    expect(normalizeCount(999)).toBe(500);
    expect(() => normalizeCount(NaN)).toThrow();
    expect(resizeCertificates(createCertificateDocument(), 501).rows).toHaveLength(500);
    expect(resizeBarcodes(createBarcodeDraft("ean13"), 501).rows).toHaveLength(500);
  });
  it("retains custom field values, labels, hidden state and ordering after resizing", () => {
    let doc = createCertificateDocument();
    doc = updateDefaults(doc, (item) => ({ ...item, fields: { ...item.fields, custom: "公共值" }, hiddenFields: ["price"],
      fieldLabels: { ...item.fieldLabels, custom: "成分" }, customBlocks: [{ id: "custom-1", label: "成分", layout: "1x1", fields: ["custom"] }],
      controlOrder: ["custom-1", ...item.controlOrder] }));
    doc.rows[1] = editCertificateRow(doc.rows[1], "custom", "单张值");
    doc = resizeCertificates(doc, 5);
    expect(resolveCertificate(doc, doc.rows[1]).fields.custom).toBe("单张值");
    expect(resolveCertificate(doc, doc.rows[4])).toMatchObject({ hiddenFields: ["price"], fields: { custom: "公共值" } });
    expect(resolveCertificate(doc, doc.rows[4]).controlOrder[0]).toBe("custom-1");
  });
  it("keeps separate mode drafts and never resets them on reselect", () => {
    let workspace = switchMode(createWorkspace(), "ean13");
    workspace.barcodes.ean13 = { ...resizeBarcodes(workspace.barcodes.ean13!, 3), seed: "新起始数据" };
    workspace.barcodes.ean13.rows[1].data = "单张修改";
    const draft = workspace.barcodes.ean13;
    workspace = switchMode(switchMode(switchMode(workspace, "certificate"), "code128"), "ean13");
    expect(workspace.barcodes.ean13).toEqual(draft);
    expect(switchMode(workspace, "ean13").barcodes.ean13).toEqual(draft);
  });
  it("appending barcodes preserves manual edits and resequence is explicit", () => {
    let draft = resizeBarcodes(createBarcodeDraft("ean13"), 3);
    draft.rows[0].data = "6975396545111";
    draft = resizeBarcodes(draft, 4);
    expect(draft.rows[0].data).toBe("6975396545111");
    const ids = draft.rows.map((row) => row.id);
    draft = resequenceBarcodes(draft);
    expect(draft.rows[0].data).toBe(draft.seed);
    expect(draft.rows.map((row) => row.id)).toEqual(ids);
  });
});

describe("preview and output contracts", () => {
  it("preview tracks exact row count and contents after batch apply", async () => {
    const workspace = createWorkspace();
    workspace.certificate = resizeCertificates(workspace.certificate, 5);
    workspace.certificate.rows[1] = editCertificateRow(workspace.certificate.rows[1], "color", "审查蓝色");
    const output = await generatePreview(previewInput(workspace));
    expect(output).toHaveLength(5);
    expect(output[1].svg).toContain("审查蓝色");
    expect(selectOutput(output, "current", output[1].id)).toEqual([output[1]]);
    expect(selectOutput(output, "all", output[1].id)).toEqual(output);
  });
  it("invalid row blocks output and identifies its position without changing data", async () => {
    const workspace = createWorkspace();
    workspace.certificate.rows[2].fields.ean = "";
    const snapshot = JSON.stringify(workspace);
    await expect(generatePreview(previewInput(workspace))).rejects.toThrow("第 3 张");
    expect(JSON.stringify(workspace)).toBe(snapshot);
  });
  it("unapplied barcode seeds cannot silently export the previous sequence", async () => {
    const workspace = switchMode(createWorkspace(), "ean13");
    workspace.barcodes.ean13!.seed = "123";
    await expect(generatePreview(previewInput(workspace))).rejects.toThrow("尚未应用");
  });
  it("EAN shortening touches bars only, with unchanged digit baseline and dimensions", async () => {
    const result = await generateCode({ kind: "ean13", data: "6912345678902", heightMm: 8, scale: 2, includeText: true });
    const svg = new DOMParser().parseFromString(result.svg, "image/svg+xml");
    expect(svg.documentElement.getAttribute("viewBox")).toBe("0 0 226 62");
    const bars = svg.querySelector('g[transform*="scale(1 0.82)"]');
    expect(bars?.querySelectorAll("path").length).toBeGreaterThan(0);
    expect(bars?.querySelector("text")).toBeNull();
    expect([...svg.querySelectorAll("text")].map((node) => node.getAttribute("y"))).toEqual(["61", "61", "61"]);
    expect([...svg.querySelectorAll("text")].map((node) => node.textContent).join("")).toBe("6912345678902");
  });
  it("grid and both clipboard targets keep deployed physical sizing", () => {
    const item = { svg: '<svg xmlns="http://www.w3.org/2000/svg" width="80mm" height="120mm" viewBox="0 0 800 1200"><text>证书</text></svg>' };
    const grid = composeSvgGrid([item, item]);
    const metrics = parseSvgMetrics(grid);
    expect(metrics.width * metrics.mmPerUnitX!).toBeCloseTo(162.4);
    expect(metrics.height * metrics.mmPerUnitY!).toBeCloseTo(120);
    expect(parseSvgMetrics(prepareSvgForClipboard(item.svg, "svg")).width).toBe(800);
    expect(parseSvgMetrics(prepareSvgForClipboard(item.svg, "illustrator")).width).toBeCloseTo(80 * 72 / 25.4, 2);
  });
});
