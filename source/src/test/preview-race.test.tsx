import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateCertificateSvg } from "../core";
import { createWorkspace, resizeCertificates, updateDefaults, type Workspace } from "../core/workspace";
import { usePreview } from "../usePreview";

vi.mock("../core", async (importOriginal) => ({ ...await importOriginal<typeof import("../core")>(), generateCertificateSvg: vi.fn() }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
function deferred() { let resolve!: (value: string) => void; let reject!: (error: Error) => void; const promise = new Promise<string>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function Harness({ workspace }: { workspace: Workspace }) {
  const preview = usePreview(workspace, 0);
  return <div data-ready={preview.ready}>{preview.error}{preview.items.map((item) => item.svg).join("")}</div>;
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("only the latest generation can publish", () => {
  it.each(["resolve", "reject"] as const)("ignores a late %s from the previous edit", async (finish) => {
    vi.useFakeTimers();
    const old = deferred(), latest = deferred();
    vi.mocked(generateCertificateSvg).mockReset().mockImplementationOnce(() => old.promise).mockImplementationOnce(() => latest.promise);
    const node = document.createElement("div"); const root = createRoot(node);
    let workspace = createWorkspace(); workspace.certificate = resizeCertificates(workspace.certificate, 1);
    await act(async () => root.render(<Harness workspace={workspace} />));
    await act(async () => vi.advanceTimersByTimeAsync(110));
    workspace = { ...workspace, certificate: updateDefaults(workspace.certificate, (item) => ({ ...item, title: "new" })) };
    await act(async () => root.render(<Harness workspace={workspace} />));
    expect(node.firstElementChild?.getAttribute("data-ready")).toBe("false");
    await act(async () => vi.advanceTimersByTimeAsync(110));
    await act(async () => latest.resolve("LATEST"));
    expect(node.textContent).toBe("LATEST");
    await act(async () => finish === "resolve" ? old.resolve("STALE") : old.reject(new Error("STALE ERROR")));
    expect(node.textContent).toBe("LATEST");
    expect(node.firstElementChild?.getAttribute("data-ready")).toBe("true");
    act(() => root.unmount());
  });
});
