import { useEffect, useState } from "react";
import { generateCertificateSvg, generateCode } from "./core";
import type { CertificateItem, GeneratedCode } from "./core";
import { resolveCertificate, type Workspace } from "./core/workspace";

export interface PreviewItem {
  id: string;
  svg: string;
  filename: string;
  encoded: string;
  certificate?: CertificateItem;
  warnings: string[];
}
export function previewInput(workspace: Workspace) {
  return workspace.mode === "certificate"
    ? { mode: "certificate" as const, document: workspace.certificate }
    : { mode: "barcode" as const, draft: workspace.barcodes[workspace.mode]! };
}
type PreviewInput = ReturnType<typeof previewInput>;

export async function generatePreview(input: PreviewInput, cancelled = () => false): Promise<PreviewItem[]> {
  const rows = input.mode === "certificate" ? input.document.rows : input.draft.rows;
  const result: PreviewItem[] = [];
  if (input.mode === "certificate" && (!(input.document.defaults.widthMm >= 20) || !(input.document.defaults.heightMm >= 20))) {
    throw new Error("合格证宽、高均须至少为 20 mm。");
  }
  if (input.mode === "barcode" && (!(input.draft.options.heightMm! >= 5) || !(input.draft.options.heightMm! <= 120)
    || !Number.isInteger(input.draft.options.scale) || !(input.draft.options.scale! >= 1) || !(input.draft.options.scale! <= 5))) {
    throw new Error("条码高度须为 5–120 mm，缩放须为 1–5 的整数。");
  }
  if (input.mode === "barcode" && input.draft.seed !== input.draft.appliedSeed) {
    throw new Error("起始数据尚未应用，请生成序列或撤销起始数据修改。");
  }
  for (let index = 0; index < rows.length; index++) {
    if (cancelled()) return [];
    try {
      if (input.mode === "certificate") {
        const certificate = resolveCertificate(input.document, input.document.rows[index]);
        result.push({ id: certificate.id, certificate, svg: await generateCertificateSvg(certificate),
          encoded: certificate.fields.ean, filename: `${String(index + 1).padStart(3, "0")}_${certificate.fields.ean}.svg`, warnings: [] });
      } else {
        const row = input.draft.rows[index];
        const code: GeneratedCode = await generateCode({ ...input.draft.options, data: row.data });
        result.push({ ...code, id: row.id, filename: `${String(index + 1).padStart(3, "0")}_${code.filename}` });
      }
    } catch (error) {
      throw new Error(`第 ${index + 1} 张：${(error as Error).message}`);
    }
    if (index % 20 === 19) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return result;
}

export function usePreview(workspace: Workspace, retry: number) {
  const input = previewInput(workspace);
  const key = JSON.stringify(input);
  const [state, setState] = useState<{ key: string; items: PreviewItem[]; busy: boolean; error: string }>({ key: "", items: [], busy: true, error: "" });
  useEffect(() => {
    let cancelled = false;
    setState((previous) => ({ ...previous, busy: true, error: "" }));
    const timer = setTimeout(() => {
      generatePreview(JSON.parse(key), () => cancelled).then((items) => {
        if (!cancelled) setState({ key, items, busy: false, error: "" });
      }).catch((error: Error) => {
        if (!cancelled) setState((previous) => ({ ...previous, key, busy: false, error: error.message }));
      });
    }, 100);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [key, retry]);
  return { ...state, ready: state.key === key && !state.busy && !state.error,
    busy: state.busy || state.key !== key, error: state.key === key ? state.error : "" };
}
