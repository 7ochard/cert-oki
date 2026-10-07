import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../main";
import { copySvg, downloadBlob } from "../core";
import { createOutput } from "../core/exportSelection";

vi.mock("../core", async (importOriginal) => ({ ...await importOriginal<typeof import("../core")>(), copySvg: vi.fn().mockResolvedValue(undefined), downloadBlob: vi.fn() }));
vi.mock("../core/exportSelection", () => ({ createOutput: vi.fn().mockResolvedValue({ blob: new Blob(["test"]), filename: "test.svg" }) }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let container: HTMLDivElement;
let root: Root;
const wait = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 160)); }); };
function input(label: string) { const node = container.querySelector<HTMLInputElement>(`[aria-label="${label}"]`); if (!node) throw new Error("Missing input " + label); return node; }
function button(text: string) { const node = [...container.querySelectorAll("button")].find((node) => node.textContent?.trim() === text || node.getAttribute("aria-label") === text); if (!node) throw new Error("Missing button " + text); return node; }
function click(text: string) { act(() => button(text).click()); }
function change(label: string, value: string) { act(() => { const node = input(label); node.value = value; Simulate.change(node); }); }
function blur(label: string) { act(() => Simulate.blur(input(label))); }
function text() { return container.textContent ?? ""; }
function previews() { return [...container.querySelectorAll(".result-preview")].map((node) => node.textContent); }

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(createOutput).mockResolvedValue({ blob: new Blob(["test"]), filename: "test.svg" });
  vi.mocked(copySvg).mockResolvedValue(undefined);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  await act(async () => root.render(<App />)); await wait();
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });

describe("complete edit / preview / output flow", () => {
  it("applies added rows without reverting the quantity or losing custom colors", async () => {
    click("逐张明细"); change("第 2 张颜色", "审查蓝色"); click("增加一行"); click("应用明细"); await wait(); await wait();
    expect(input("合格证数量").value).toBe("5"); expect(previews()).toHaveLength(5); expect(previews()[1]).toContain("审查蓝色");
    click("逐张明细"); click("删除第 1 张"); click("应用明细"); await wait();
    expect(input("合格证数量").value).toBe("4"); expect(previews()[0]).toContain("审查蓝色");
  });
  it("preserves single-row common-field exceptions and restores inheritance explicitly", async () => {
    click("逐张明细"); click("更多字段"); change("第 2 张品牌", "单张品牌"); click("应用明细"); await wait();
    change("公共品牌", "新的公共品牌"); await wait();
    expect(previews()[0]).toContain("新的公共品牌"); expect(previews()[1]).toContain("单张品牌");
    click("逐张明细"); click("更多字段"); click("单张例外 · 恢复继承"); click("应用明细"); await wait();
    expect(previews()[1]).toContain("新的公共品牌");
  });
  it("does not truncate on intermediate empty count input, and respects cancelled deletion", async () => {
    change("合格证数量", ""); expect(previews()).toHaveLength(4); blur("合格证数量"); expect(input("合格证数量").value).toBe("4");
    vi.mocked(window.confirm).mockReturnValue(false);
    change("合格证数量", "1"); blur("合格证数量"); await wait(); expect(previews()).toHaveLength(4); expect(input("合格证数量").value).toBe("4");
    change("合格证数量", "6.8"); blur("合格证数量"); await wait(); expect(previews()).toHaveLength(6); expect(input("合格证数量").value).toBe("6");
  });
  it("uses the same selected rows for copy and download", async () => {
    click("复制为 SVG"); await wait(); expect(vi.mocked(copySvg).mock.calls[0][0].match(/data-cert-field="title"/g)).toHaveLength(4);
    click("下载 SVG"); await wait(); expect(vi.mocked(createOutput).mock.calls[0][0]).toHaveLength(4); expect(downloadBlob).toHaveBeenCalledOnce();
    click("第 2 张"); change("输出范围", "current"); click("复制为 SVG"); await wait();
    const svg = vi.mocked(copySvg).mock.calls[1][0]; expect(svg.match(/data-cert-field="title"/g)).toHaveLength(1); expect(svg).toContain("6912345678919");
    click("下载 SVG"); await wait(); expect(vi.mocked(createOutput).mock.calls[1][0]).toHaveLength(1); expect(vi.mocked(createOutput).mock.calls[1][0][0].encoded).toBe("6912345678919");
  });
  it("blocks old output while editing or invalid, and recovers without dropping valid rows", async () => {
    change("公共品牌", "更新中"); expect(button("下载 SVG").disabled).toBe(true); await wait();
    click("逐张明细"); change("第 2 张EAN", "invalid"); click("应用明细"); await wait();
    expect(text()).toContain("第 2 张"); expect(button("下载 SVG").disabled).toBe(true); expect(button("复制为 SVG").disabled).toBe(true);
    click("逐张明细"); expect(input("第 1 张EAN").value).toBe("6912345678902"); change("第 2 张EAN", "6912345678919"); click("应用明细"); await wait();
    expect(button("下载 SVG").disabled).toBe(false); expect(previews()).toHaveLength(4);
  });
  it("retains barcode records across switches and treats unapplied seeds explicitly", async () => {
    change("功能", "barcode"); await wait(); change("条码数量", "3"); blur("条码数量"); await wait();
    click("逐张明细"); change("第 2 张数据", "6975396545111"); click("应用明细"); await wait();
    change("功能", "certificate"); await wait(); change("功能", "barcode"); await wait();
    expect(input("条码数量").value).toBe("3"); click("逐张明细"); expect(input("第 2 张数据").value).toBe("6975396545111"); click("取消");
    change("起始数据", "123"); await wait(); expect(button("下载 SVG").disabled).toBe(true); expect(text()).toContain("尚未应用");
    click("撤销起始数据修改"); await wait(); expect(button("下载 SVG").disabled).toBe(false);
  });
  it("preview field clicks open the same transactional detail editor", async () => {
    act(() => container.querySelector('[data-cert-field="sizeSpec"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.querySelector('[role="dialog"][aria-label="逐张明细"]')).not.toBeNull();
    change("第 1 张号型", "手动号型"); change("第 1 张尺码", "XXL"); expect(input("第 1 张号型").value).toBe("手动号型");
    click("应用明细"); await wait(); expect(previews()[0]).toContain("手动号型");
  });
  it("bulk overwrite requires confirmation and cancel leaves exceptions unchanged", async () => {
    click("逐张明细"); change("第 2 张颜色", "红色"); change("统一值", "蓝色");
    vi.mocked(window.confirm).mockReturnValue(false); click("覆盖全部 4 张…"); expect(input("第 2 张颜色").value).toBe("红色");
    vi.mocked(window.confirm).mockReturnValue(true); click("覆盖全部 4 张…"); expect(input("第 2 张颜色").value).toBe("蓝色");
    click("应用明细"); await wait(); expect(previews().every((value) => value?.includes("蓝色"))).toBe(true);
  });
});
