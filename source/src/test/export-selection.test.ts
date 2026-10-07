import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOutput } from "../core/exportSelection";
import { svgToDataUrl } from "../core/certificate";
import type { PreviewItem } from "../usePreview";

const pdf = vi.hoisted(() => ({ addPage: vi.fn(), addImage: vi.fn(), output: vi.fn() }));
const constructor = vi.hoisted(() => vi.fn());
vi.mock("jspdf", () => ({ jsPDF: function(options: unknown) { constructor(options); return pdf; } }));
vi.mock("../core/certificate", async (importOriginal) => ({ ...await importOriginal<typeof import("../core/certificate")>(), svgToDataUrl: vi.fn() }));
function read(blob: Blob): Promise<ArrayBuffer> { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer); reader.onerror = reject; reader.readAsArrayBuffer(blob); }); }
const items: PreviewItem[] = [0, 1, 2].map((index) => ({ id: String(index), filename: `${index}_code.svg`, encoded: String(index), warnings: [],
  svg: `<svg xmlns="http://www.w3.org/2000/svg" width="80mm" height="${120 + index}mm" viewBox="0 0 800 ${1200 + index * 10}"><text>ROW${index}</text></svg>` }));
beforeEach(() => { vi.clearAllMocks(); pdf.output.mockReturnValue(new Blob(["PDF"])); vi.mocked(svgToDataUrl).mockImplementation(async (svg) => "data:image/jpeg;base64," + btoa(svg.match(/ROW\d/)![0])); });

describe("export exact accepted previews", () => {
  it("writes all SVG contents in display order, or only the chosen single item", async () => {
    const all = await createOutput(items, "svg", "test");
    const svg = new TextDecoder().decode(await read(all.blob));
    expect(svg.match(/ROW\d/g)).toEqual(["ROW0", "ROW1", "ROW2"]);
    const single = await createOutput([items[1]], "svg", "test");
    expect(new TextDecoder().decode(await read(single.blob))).toBe(items[1].svg);
    expect(svgToDataUrl).not.toHaveBeenCalled();
  });
  it("puts one named JPG per selected record in a ZIP without merging rows", async () => {
    const result = await createOutput(items, "jpg", "test");
    expect(result.filename).toBe("test_3张_JPG.zip");
    const zip = await JSZip.loadAsync(await read(result.blob));
    expect(Object.keys(zip.files)).toEqual(["0_code.jpg", "1_code.jpg", "2_code.jpg"]);
    for (let index = 0; index < items.length; index++) expect(await zip.file(`${index}_code.jpg`)!.async("string")).toBe(`ROW${index}`);
    expect(vi.mocked(svgToDataUrl).mock.calls.map(([svg]) => svg)).toEqual(items.map((item) => item.svg));
  });
  it("creates one PDF page per item using the rendered height, including overflow", async () => {
    await createOutput(items, "pdf", "test");
    expect(constructor).toHaveBeenCalledWith({ unit: "mm", orientation: "portrait", format: [80, 120] });
    expect(pdf.addPage.mock.calls).toEqual([[[80, 121], "portrait"], [[80, 122], "portrait"]]);
    expect(pdf.addImage.mock.calls.map((call) => call.slice(2))).toEqual([[0, 0, 80, 120], [0, 0, 80, 121], [0, 0, 80, 122]]);
  });
  it("rejects empty output", async () => { await expect(createOutput([], "svg", "test")).rejects.toThrow(); });
});
