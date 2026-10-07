import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  Eye,
  EyeOff,
  GripVertical,
  Plus,
  RefreshCcw,
  Table2,
  Trash2,
  X
} from "lucide-react";
import {
  APP_MODE_ORDER,
  PRESET_BY_KIND,
  DEFAULT_CERTIFICATE_CONTROL_ORDER,
  DEFAULT_CERTIFICATE_FIELD_LABELS,
  composeSvgGrid,
  copySvg,
  downloadBlob,
} from "./core";
import type {
  AppMode,
  BarcodeKind,
  CertificateCustomBlock,
  CertificateExportOptions,
  CertificateFieldLayout,
  CertificateItem
} from "./core";
import "./styles.css";
import "./workflow.css";
import { CountInput, DetailEditor, useModalFocus } from "./DetailEditor";
import { createWorkspace, DETAIL_FIELDS, resizeBarcodes, resizeCertificates, resequenceBarcodes, selectOutput, switchMode, updateDefaults, type BarcodeDraft, type Workspace } from "./core/workspace";
import { previewInput, usePreview, type PreviewItem } from "./usePreview";
import { prepareSvgForClipboard } from "./core/svg";
import { createOutput } from "./core/exportSelection";

type FontOption = { label: string; value: string };
const FONT_OPTIONS: FontOption[] = [
  { label: "HarmonyOS Sans SC", value: "HarmonyOS Sans SC, sans-serif" },
  { label: "Raleway Heavy", value: "Raleway Heavy, Raleway, HarmonyOS Sans SC, sans-serif" },
  { label: "Stack Sans Headline", value: "Stack Sans Headline, sans-serif" },
  { label: "SF Pro Text", value: "SF Pro Text, SF Pro Display, -apple-system, BlinkMacSystemFont, sans-serif" },
  { label: "System UI", value: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" },
  { label: "Noto Sans SC", value: "Noto Sans SC, HarmonyOS Sans SC, sans-serif" },
  { label: "Microsoft YaHei", value: "Microsoft YaHei, HarmonyOS Sans SC, sans-serif" },
  { label: "SimHei", value: "SimHei, HarmonyOS Sans SC, sans-serif" },
  { label: "SimSun", value: "SimSun, Songti SC, serif" }
];
const MODE_OPTIONS: Array<{ label: string; value: AppMode; description: string }> = [
  ...APP_MODE_ORDER.map((mode) => {
    if (mode === "certificate") {
      return { label: "合格证", value: mode, description: "版式编辑" };
    }
    const preset = PRESET_BY_KIND[mode];
    return { label: preset.label, value: mode, description: preset.description };
  })
];

const DEFAULT_FIELD_KEYS = [
  "brand",
  "productName",
  "styleNo",
  "sizeCode",
  "sizeSpec",
  "color",
  "grade",
  "inspector",
  "standard",
  "safetyCategory",
  "company",
  "address",
  "ean",
  "price",
  "currency"
];

const FIELD_META: Record<string, { label: string; control?: "textarea" | "number" | "select" | "color" }> = {
  brand: { label: "品牌" },
  productName: { label: "品名" },
  styleNo: { label: "款号" },
  sizeCode: { label: "尺码" },
  sizeSpec: { label: "号型" },
  color: { label: "颜色" },
  grade: { label: "等级", control: "select" },
  inspector: { label: "检验员" },
  standard: { label: "执行标准", control: "textarea" },
  safetyCategory: { label: "安全类别", control: "textarea" },
  company: { label: "公司" },
  address: { label: "地址", control: "textarea" },
  ean: { label: "EAN" },
  price: { label: "零售价", control: "number" },
  currency: { label: "币种" }
};

const EXPORT_FORMAT_OPTIONS: Array<{ label: string; value: CertificateExportOptions["format"] }> = [
  { label: "SVG", value: "svg" },
  { label: "JPG", value: "jpg" },
  { label: "PDF", value: "pdf" }
];
const CUSTOM_FIELD_LAYOUT_OPTIONS: Array<{ label: string; value: CertificateFieldLayout; description: string }> = [
  { label: "1*1", value: "1x1", description: "单字段组件" },
  { label: "1*2", value: "1x2", description: "双字段组件" },
  { label: "2*2", value: "2x2", description: "四字段组件" }
];
const CUSTOM_LAYOUT_FIELD_COUNT: Record<CertificateFieldLayout, number> = {
  "1x1": 1,
  "1x2": 2,
  "2x2": 4
};
const GRAY_LEVELS = [255, 238, 221, 204, 187, 170, 153, 136, 119, 102, 85, 68, 51, 34, 17, 0];
const COLOR_PALETTE = [
  ["#ffffff", "#eeeeee", "#dddddd", "#cccccc", "#bbbbbb", "#aaaaaa", "#999999", "#888888"],
  ["#777777", "#666666", "#555555", "#444444", "#333333", "#222222", "#111111", "#000000"]
];

interface DropdownOption<T extends string> {
  label: string;
  value: T;
  description?: string;
  extra?: string;
  disabled?: boolean;
}

export function App() {
  const [workspace, setWorkspace] = useState<Workspace>(createWorkspace);
  const [name, setName] = useState("合格证 1");
  const [scope, setScope] = useState<"all" | "current">("all");
  const [selectedId, setSelectedId] = useState("");
  const [format, setFormat] = useState<CertificateExportOptions["format"]>("svg");
  const [editor, setEditor] = useState<{ workspace: Workspace; id: string; field?: string } | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [exporting, setExporting] = useState(false);
  const lastBarcodeMode = useRef<BarcodeKind>("ean13");
  const preview = usePreview(workspace, retry);
  const latestInput = useRef("");
  const inputKey = JSON.stringify(previewInput(workspace));
  latestInput.current = inputKey;
  const isCertificate = workspace.mode === "certificate";
  const doc = workspace.certificate;
  const barcode = isCertificate ? null : workspace.barcodes[workspace.mode as BarcodeKind]!;
  const rows = isCertificate ? doc.rows : barcode!.rows;
  const currentId = rows.some((row) => row.id === selectedId) ? selectedId : rows[0].id;
  const activeColumn = { certificate: doc.defaults };
  const customFieldKeys = Object.keys(doc.defaults.fields).filter((key) => !DEFAULT_FIELD_KEYS.includes(key));
  const chosen = selectOutput(preview.items, scope, currentId);
  const outputSvg = chosen.length > 1 ? composeSvgGrid(chosen) : chosen[0]?.svg ?? "";
  const ready = preview.ready && Boolean(chosen.length) && !exporting;
  const showToast = (message: string) => setNotice(message);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(""), 3000); return () => clearTimeout(timer); } }, [notice]);
  function updateCertificate(updater: (item: CertificateItem) => CertificateItem) {
    setWorkspace((state) => ({ ...state, certificate: updateDefaults(state.certificate, updater) }));
  }
  function updateCertificateField(key: string, value: string) {
    updateCertificate((item) => ({ ...item, fields: { ...item.fields, [key]: value } }));
  }
  function updateCertificateTitle(title: string) {
    updateCertificate((item) => ({ ...item, title }));
  }
  function updateBarcode(updater: (draft: BarcodeDraft) => BarcodeDraft) {
    setWorkspace((state) => state.mode === "certificate" ? state : {
      ...state, barcodes: { ...state.barcodes, [state.mode]: updater(state.barcodes[state.mode]!) }
    });
  }
  function setBarcodeSeed(seed: string) {
    updateBarcode((draft) => ({ ...draft, seed }));
  }
  function setBarcodeOption<K extends keyof BarcodeDraft["options"]>(key: K, value: BarcodeDraft["options"][K]) {
    updateBarcode((draft) => ({ ...draft, options: { ...draft.options, [key]: value } }));
  }
  function chooseMode(mode: AppMode) {
    if (mode !== "certificate") lastBarcodeMode.current = mode;
    setWorkspace((state) => switchMode(state, mode)); setActionError(""); setViewer(null);
  }
  function openBatchEditor(field?: string, id = currentId) {
    setSelectedId(id); setEditor({ workspace, id, field });
  }
  function resize(count: number) {
    if (count < rows.length && !window.confirm("将删除末尾 " + (rows.length - count) + " 张记录，是否继续？")) return;
    try {
      if (isCertificate) setWorkspace({ ...workspace, certificate: resizeCertificates(doc, count) });
      else updateBarcode(() => resizeBarcodes(barcode!, count));
      setActionError("");
    } catch (error) { setActionError((error as Error).message); }
  }
  function regenerateSequence() {
    if (!window.confirm("将重新生成全部 " + rows.length + " 张条码，替换逐张编辑的数据，是否继续？")) return;
    try { updateBarcode(() => resequenceBarcodes(barcode!)); setActionError(""); }
    catch (error) { setActionError((error as Error).message); }
  }
  async function copy(target: "svg" | "illustrator") {
    if (!ready) return;
    try {
      await copySvg(prepareSvgForClipboard(outputSvg, target));
      showToast("已复制 " + chosen.length + " 张" + (target === "illustrator" ? "（Illustrator）" : "（SVG）"));
    } catch (error) { setActionError((error as Error).message); }
  }
  async function download() {
    if (!ready) return;
    const capturedKey = inputKey;
    const selected = chosen;
    const exportFormat = isCertificate ? format : "svg";
    setExporting(true); setActionError("");
    try {
      const output = await createOutput(selected, exportFormat, name);
      if (latestInput.current !== capturedKey) { setActionError("内容已变化，请等待新预览后重新下载。"); return; }
      downloadBlob(output.blob, output.filename);
      showToast("已下载 " + selected.length + " 张");
    } catch (error) { setActionError((error as Error).message); }
    finally { setExporting(false); }
  }
  function updateCertificateFieldLabel(fieldKey: string, nextLabel: string): boolean {
    const label = nextLabel.trim();
    if (!label) {
      showToast("字段标题不能为空");
      return false;
    }

    const updateItem = (item: CertificateItem): CertificateItem => ({
      ...item,
      fieldLabels: {
        ...(item.fieldLabels ?? {}),
        [fieldKey]: label
      }
    });

    updateCertificate(updateItem);
    return true;
  }

  function addCustomField(layout: CertificateFieldLayout = "1x1") {
    const fieldCount = CUSTOM_LAYOUT_FIELD_COUNT[layout];
    const baseFields = { ...activeColumn.certificate.fields };
    const keys: string[] = [];
    for (let index = 0; index < fieldCount; index += 1) {
      const key = getNextCustomFieldKey(baseFields);
      baseFields[key] = "";
      keys.push(key);
    }
    const block: CertificateCustomBlock = {
      id: `custom-${Date.now()}-${keys[0]}`,
      label: `${CUSTOM_FIELD_LAYOUT_OPTIONS.find((option) => option.value === layout)?.label ?? "1*1"} 自定义组件`,
      layout,
      fields: keys
    };

    const addBlockToItem = (item: CertificateItem): CertificateItem => {
      const fields = { ...item.fields };
      const fieldLabels = { ...(item.fieldLabels ?? {}) };
      for (const key of keys) {
        fields[key] = fields[key] ?? "";
        fieldLabels[key] = fieldLabels[key] ?? key;
      }
      return {
        ...item,
        fields,
        fieldLabels,
        customBlocks: [...(item.customBlocks ?? []), block],
        controlOrder: insertCustomBlockId(normalizeControlOrder(item.controlOrder, [...(item.customBlocks ?? []), block]), block.id)
      };
    };

    updateCertificate(addBlockToItem);
  }

  function deleteCustomBlock(blockId: string) {
    const deleteBlockFromItem = (item: CertificateItem): CertificateItem => {
      const fallbackField = blockId.startsWith("legacy-") ? blockId.slice("legacy-".length) : "";
      const block = (item.customBlocks ?? []).find((candidate) => candidate.id === blockId)
        ?? (fallbackField ? { id: blockId, label: fallbackField, layout: "1x1" as CertificateFieldLayout, fields: [fallbackField] } : null);
      if (!block) {
        return item;
      }
      const fields = { ...item.fields };
      const fieldLabels = { ...(item.fieldLabels ?? {}) };
      const fieldFonts = { ...(item.fieldFonts ?? {}) };
      const deleteKeys = new Set(block.fields);
      for (const key of deleteKeys) {
        delete fields[key];
        delete fieldLabels[key];
        delete fieldFonts[key];
      }
      return {
        ...item,
        fields,
        fieldFonts,
        fieldLabels,
        customBlocks: (item.customBlocks ?? []).filter((candidate) => candidate.id !== blockId),
        controlOrder: (item.controlOrder ?? []).filter((candidate) => candidate !== blockId),
        hiddenFields: (item.hiddenFields ?? []).filter((key) => !deleteKeys.has(key))
      };
    };

    updateCertificate(deleteBlockFromItem);
  }

  function reorderControlBlock(sourceId: string, targetId: string) {
    if (sourceId === targetId) {
      return;
    }
    const reorderItem = (item: CertificateItem): CertificateItem => ({
      ...item,
      controlOrder: moveById(normalizeControlOrder(item.controlOrder, item.customBlocks ?? []), sourceId, targetId)
    });
    updateCertificate(reorderItem);
  }

  function toggleCertificateField(fieldKey: string) {
    const toggleItem = (item: CertificateItem): CertificateItem => {
      const hiddenFields = new Set(item.hiddenFields ?? []);
      if (hiddenFields.has(fieldKey)) {
        hiddenFields.delete(fieldKey);
      } else {
        hiddenFields.add(fieldKey);
      }
      return {
        ...item,
        hiddenFields: Array.from(hiddenFields)
      };
    };

    updateCertificate(toggleItem);
  }


  return <div className="page-shell"><main className="app-shell">
    <aside className="control-rail" aria-label="参数">
      <section className="control-section two-up">
        <label>项目名称<input aria-label="项目名称" value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>功能<select aria-label="功能" value={isCertificate ? "certificate" : "barcode"} onChange={(event) => chooseMode(event.target.value === "certificate" ? "certificate" : lastBarcodeMode.current)}>
          <option value="certificate">合格证</option><option value="barcode">条码 / 二维码</option>
        </select></label>
      </section>
      {isCertificate ? <>
        <div className="section-heading"><h2>公共信息</h2><p>作为整批默认值，保留明细中的单张例外。</p></div>
        <section className="control-section common-fields">
          <label>标题<input aria-label="公共标题" value={doc.defaults.title} onChange={(event) => updateCertificateTitle(event.target.value)} /></label>
          {[...DEFAULT_FIELD_KEYS.filter((key) => !DETAIL_FIELDS.includes(key)), ...customFieldKeys].map((key) => <label key={key}>
            {getCertificateFieldLabel(doc.defaults, key)}
            {FIELD_META[key]?.control === "textarea" ? <textarea aria-label={"公共" + getCertificateFieldLabel(doc.defaults, key)} rows={2} value={doc.defaults.fields[key]} onChange={(event) => updateCertificateField(key, event.target.value)} />
              : <input aria-label={"公共" + getCertificateFieldLabel(doc.defaults, key)} value={doc.defaults.fields[key]} onChange={(event) => updateCertificateField(key, event.target.value)} />}
          </label>)}
        </section>
        <details className="layout-settings"><summary>版式设置 <span>字体 · 尺寸 · 显隐 · 排序</span></summary>
          <p className="workflow-hint">版式设置作用于整批；内容请在公共信息或逐张明细中编辑。</p>
          <CertificateControls certificate={doc.defaults} customFieldKeys={customFieldKeys} fontOptions={FONT_OPTIONS}
            toggleFieldVisibility={toggleCertificateField}
            updateCertificateFieldLabel={updateCertificateFieldLabel} updateCertificate={updateCertificate}
            addCustomField={addCustomField} deleteCustomBlock={deleteCustomBlock} reorderControlBlock={reorderControlBlock} />
        </details>
      </> : <>
        <div className="section-heading"><h2>码制与数据</h2><p>起始数据用于生成序列；单张内容在逐张明细中修改。</p></div>
        <section className="control-section">
          <label>码制<DropdownSelect ariaLabel="码制" value={workspace.mode} options={MODE_OPTIONS.filter((option) => option.value !== "certificate")} onChange={chooseMode} /></label>
          <label>起始数据<textarea aria-label="起始数据" rows={3} value={barcode!.seed} onChange={(event) => setBarcodeSeed(event.target.value)} /></label>
          <div className="button-row"><button type="button" onClick={regenerateSequence}>生成 / 重建序列…</button>
            {barcode!.seed !== barcode!.appliedSeed && <button type="button" onClick={() => updateBarcode((draft) => ({ ...draft, seed: draft.appliedSeed }))}>撤销起始数据修改</button>}
          </div>
        </section>
        <details className="layout-settings"><summary>版式设置 <span>高度 · 缩放 · 文字</span></summary>
          <section className="control-section two-up">
            <label>高度 mm<input aria-label="条码高度" type="number" min="5" max="120" step="0.1" value={barcode!.options.heightMm} onChange={(event) => setBarcodeOption("heightMm", Number(event.target.value))} /></label>
            <label>缩放<input aria-label="条码缩放" type="number" min="1" max="5" value={barcode!.options.scale} onChange={(event) => setBarcodeOption("scale", Number(event.target.value))} /></label>
            <label className="toggle"><input type="checkbox" checked={barcode!.options.includeText} disabled={!PRESET_BY_KIND[barcode!.options.kind].supportsText} onChange={(event) => setBarcodeOption("includeText", event.target.checked)} />显示可读文字</label>
            <label>文字字体<DropdownSelect ariaLabel="可读文字字体" value={barcode!.options.fontFamily!} options={FONT_OPTIONS} onChange={(fontFamily) => updateBarcode((draft) => ({ ...draft, options: { ...draft.options, fontFamily } }))} /></label>
          </section>
        </details>
      </>}
    </aside>
    <section className="workspace" aria-label="预览和输出">
      <div className="workspace-toolbar workflow-toolbar">
        <div className="button-row"><CountInput count={rows.length} onCommit={resize} label={isCertificate ? "合格证数量" : "条码数量"} />
          <button type="button" onClick={() => openBatchEditor()}><Table2 size={16} />逐张明细</button>
        </div>
        <div className="button-row">
          <label className="scope-control">输出范围<select aria-label="输出范围" value={scope} onChange={(event) => setScope(event.target.value as "all" | "current")}>
            <option value="all">全部 {rows.length} 张</option><option value="current">当前第 {rows.findIndex((row) => row.id === currentId) + 1} 张</option>
          </select></label>
          <button type="button" disabled={!ready} onClick={() => copy("illustrator")}><Copy size={16} />复制到 Illustrator</button>
          <button type="button" disabled={!ready} onClick={() => copy("svg")}><Copy size={16} />复制为 SVG</button>
          {isCertificate && <label className="format-control"><span className="sr-only">下载格式</span><select aria-label="下载格式" value={format} onChange={(event) => setFormat(event.target.value as typeof format)}>
            {EXPORT_FORMAT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select></label>}
          <button type="button" disabled={!ready} onClick={download}><Download size={16} />{exporting ? "下载准备中" : "下载 " + (isCertificate ? format === "jpg" && chosen.length > 1 ? "JPG ZIP" : format.toUpperCase() : "SVG")}</button>
        </div>
      </div>
      <div className="workflow-status" role="status">{preview.busy ? "正在更新预览…" : preview.error ? "预览未更新，输出已暂停" : rows.length + " 张已更新 · " + (scope === "all" ? "输出整批" : "仅输出当前张")}
        {preview.error && <button type="button" onClick={() => setRetry((value) => value + 1)}><RefreshCcw size={14} />重试</button>}
      </div>
      {(preview.error || actionError) && <div className="error-panel" role="alert">{actionError || preview.error}</div>}
      <div className={"result-grid " + (isCertificate ? "is-certificate" : "is-barcode") + (!preview.ready ? " is-stale" : "")} aria-busy={preview.busy}>
        {preview.items.filter((item) => rows.some((row) => row.id === item.id)).map((item, index) => <article className={"result-card" + (item.id === currentId ? " is-selected" : "")} key={item.id}>
          <div className="result-card-head"><button type="button" aria-pressed={item.id === currentId} onClick={() => setSelectedId(item.id)}>第 {index + 1} 张{item.id === currentId ? " · 当前" : ""}</button>
            <button type="button" onClick={() => openBatchEditor(undefined, item.id)}>编辑此张</button>
            <button type="button" aria-label={"放大第 " + (index + 1) + " 张"} onClick={() => setViewer(item.id)}><Eye size={15} /></button></div>
          <button type="button" className="result-preview" aria-label={"选择第 " + (index + 1) + " 张"} onClick={(event) => {
            setSelectedId(item.id);
            const field = getPreviewFieldKey(event.target);
            if (field && isCertificate) openBatchEditor(field, item.id);
          }}><div dangerouslySetInnerHTML={{ __html: item.svg }} /></button>
          {item.warnings.map((warning) => <p className="workflow-hint" key={warning}>{warning}</p>)}
        </article>)}
        {!preview.items.length && <p className="empty-state">{preview.busy ? "正在生成…" : "修改数据后将自动显示预览"}</p>}
      </div>
    </section>
  </main>
  {editor && <DetailEditor initial={editor.workspace} selectedId={editor.id} initialField={editor.field}
    onApply={(next) => { setWorkspace(next); setEditor(null); setActionError(""); showToast("明细已应用"); }} onClose={() => setEditor(null)} />}
  {viewer && <ResultViewer items={preview.items} id={viewer} onChange={setViewer} onClose={() => setViewer(null)} />}
  {notice && <div className="toast-layer"><div className="toast-pill" role="status"><Check size={16} />{notice}</div></div>}
  </div>;
}

function getPreviewFieldKey(target: EventTarget): string {
  return target instanceof Element ? target.closest("[data-cert-field]")?.getAttribute("data-cert-field") ?? "" : "";
}

function ResultViewer({ items, id, onChange, onClose }: { items: PreviewItem[]; id: string; onChange: (id: string) => void; onClose: () => void }) {
  const ref = useModalFocus(onClose);
  const index = items.findIndex((item) => item.id === id);
  const item = items[index];
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="大图预览"><section className="preview-modal" ref={ref}>
    <header><h3>第 {index + 1} / {items.length} 张</h3><button type="button" className="icon-button" aria-label="关闭预览" onClick={onClose}><X size={18} /></button></header>
    <div className="preview-modal-body"><div className="large-preview-canvas">{item && <div className={"large-preview-svg " + (item.certificate ? "is-certificate" : "is-barcode")} dangerouslySetInnerHTML={{ __html: item.svg }} />}</div></div>
    <footer className="preview-modal-footer"><button type="button" disabled={index <= 0} onClick={() => onChange(items[index - 1].id)}>上一张</button><span>{item?.encoded}</span><button type="button" disabled={index >= items.length - 1} onClick={() => onChange(items[index + 1].id)}>下一张</button></footer>
  </section></div>;
}

function DropdownSelect<T extends string>({
  ariaLabel,
  disabled = false,
  onChange,
  onDoubleClick,
  options,
  value
}: {
  ariaLabel: string;
  disabled?: boolean;
  onChange: (value: T) => void;
  onDoubleClick?: () => void;
  options: ReadonlyArray<DropdownOption<T>>;
  value: T;
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const dropdownId = useId();
  const selected = options.find((option) => option.value === value) ?? { label: value, value };

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    function updateMenuPosition() {
      const trigger = triggerRef.current;
      if (!trigger) {
        return;
      }
      const rect = trigger.getBoundingClientRect();
      const viewportGap = 12;
      const availableBelow = window.innerHeight - rect.bottom - viewportGap;
      const availableAbove = rect.top - viewportGap;
      const placeAbove = availableBelow < 220 && availableAbove > availableBelow;
      const maxHeight = Math.min(320, Math.max(160, placeAbove ? availableAbove : availableBelow));
      setMenuStyle({
        left: Math.max(viewportGap, Math.min(rect.left, window.innerWidth - rect.width - viewportGap)),
        top: placeAbove ? Math.max(viewportGap, rect.top - maxHeight - 8) : rect.bottom + 8,
        minWidth: rect.width,
        maxHeight
      });
    }

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function handleSelect(option: DropdownOption<T>) {
    if (option.disabled) {
      return;
    }
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div className="dropdown-field">
      <button
        ref={triggerRef}
        className={open ? "dropdown-trigger is-open" : "dropdown-trigger"}
        type="button"
        role="combobox"
        aria-controls={dropdownId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onDoubleClick={onDoubleClick}
      >
        <span className="dropdown-trigger-content">
          <span className="dropdown-value">{selected?.label ?? "-"}</span>
          {selected?.extra ? <span className="dropdown-extra">{selected.extra}</span> : null}
        </span>
        <ChevronDown className="dropdown-chevron" size={17} />
      </button>

      {open
        ? createPortal(
          <div
            ref={menuRef}
            className="dropdown-menu"
            id={dropdownId}
            role="listbox"
            style={menuStyle}
          >
            {options.map((option) => {
              const selectedOption = option.value === value;
              return (
                <button
                  className={selectedOption ? "dropdown-option is-selected" : "dropdown-option"}
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={selectedOption}
                  disabled={option.disabled}
                  onClick={() => handleSelect(option)}
                >
                  <span className="dropdown-option-main">
                    <span>{option.label}</span>
                    {option.description ? <small>{option.description}</small> : null}
                  </span>
                  {option.extra ? <span className="dropdown-extra">{option.extra}</span> : null}
                  {selectedOption ? <Check size={15} /> : null}
                </button>
              );
            })}
          </div>,
          document.body
        )
        : null}
    </div>
  );
}

function ColorPickerControl({
  ariaLabel,
  onChange,
  value
}: {
  ariaLabel: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const safeValue = toNearestGrayHex(normalizeHexColor(value) ?? "#ffffff");
  const [open, setOpen] = useState(false);
  const [hexDraft, setHexDraft] = useState(safeValue.toUpperCase());
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const cmyk = hexToCmyk(safeValue);

  useEffect(() => {
    setHexDraft(safeValue.toUpperCase());
  }, [safeValue]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    function updatePanelPosition() {
      const trigger = triggerRef.current;
      if (!trigger) {
        return;
      }
      const rect = trigger.getBoundingClientRect();
      const viewportGap = 12;
      const panelWidth = 280;
      const panelHeight = 330;
      const availableBelow = window.innerHeight - rect.bottom - viewportGap;
      const availableAbove = rect.top - viewportGap;
      const placeAbove = availableBelow < panelHeight && availableAbove > availableBelow;
      setPanelStyle({
        left: Math.max(viewportGap, Math.min(rect.left, window.innerWidth - panelWidth - viewportGap)),
        top: placeAbove ? Math.max(viewportGap, rect.top - panelHeight - 8) : rect.bottom + 8,
        width: panelWidth
      });
    }

    updatePanelPosition();
    window.addEventListener("resize", updatePanelPosition);
    window.addEventListener("scroll", updatePanelPosition, true);
    return () => {
      window.removeEventListener("resize", updatePanelPosition);
      window.removeEventListener("scroll", updatePanelPosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function applyColor(nextValue: string) {
    const normalized = normalizeHexColor(nextValue);
    if (!normalized) {
      return;
    }
    const gray = toNearestGrayHex(normalized);
    onChange(gray);
    setHexDraft(gray.toUpperCase());
  }

  function updateCmyk(channel: keyof CmykColor, nextValue: number) {
    applyColor(cmykToHex({
      ...cmyk,
      [channel]: clampPercent(nextValue)
    }));
  }

  function commitHex() {
    const normalized = normalizeHexColor(hexDraft);
    if (normalized) {
      applyColor(normalized);
    } else {
      setHexDraft(safeValue.toUpperCase());
    }
  }

  return (
    <div className="color-picker-field">
      <button
        ref={triggerRef}
        className={open ? "color-picker-trigger is-open" : "color-picker-trigger"}
        type="button"
        aria-controls={panelId}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={ariaLabel}
        style={{
          backgroundColor: safeValue,
          color: readableTextColor(safeValue)
        }}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="color-picker-description" title={safeValue.toUpperCase()}>
          {safeValue.toUpperCase().replace("#", "")}
        </span>
      </button>

      {open
        ? createPortal(
          <div
            ref={panelRef}
            className="color-picker-popover"
            id={panelId}
            role="dialog"
            aria-label={`${ariaLabel}选择器`}
            style={panelStyle}
          >
            <div className="color-picker-palette" aria-label="色板">
              {COLOR_PALETTE.flat().map((swatch) => (
                <button
                  className={toNearestGrayHex(swatch) === safeValue ? "color-palette-swatch is-selected" : "color-palette-swatch"}
                  key={swatch}
                  type="button"
                  title={swatch.toUpperCase()}
                  aria-label={`选择 ${swatch.toUpperCase()}`}
                  onClick={() => applyColor(swatch)}
                >
                  <span style={{ backgroundColor: swatch }} />
                </button>
              ))}
            </div>

            <div className="color-picker-preview-row">
              <span className="color-picker-preview" style={{ backgroundColor: safeValue }} />
              <label className="color-picker-hex-field">
                HEX
                <input
                  value={hexDraft}
                  onBlur={commitHex}
                  onChange={(event) => setHexDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.currentTarget.blur();
                    }
                    if (event.key === "Escape") {
                      setHexDraft(safeValue.toUpperCase());
                      triggerRef.current?.focus();
                    }
                  }}
                />
              </label>
            </div>

            <div className="color-picker-cmyk-grid" aria-label="CMYK">
              {(["c", "m", "y", "k"] as const).map((channel) => (
                <label className="color-picker-cmyk-field" key={channel}>
                  <span>{channel.toUpperCase()}</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={cmyk[channel]}
                    onChange={(event) => updateCmyk(channel, Number(event.target.value))}
                  />
                </label>
              ))}
            </div>
          </div>,
          document.body
        )
        : null}
    </div>
  );
}

type CmykColor = { c: number; m: number; y: number; k: number };

function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim();
  const match = trimmed.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) {
    return null;
  }
  const hex = match[1];
  if (hex.length === 3) {
    return `#${hex.split("").map((char) => char + char).join("")}`.toLowerCase();
  }
  return `#${hex}`.toLowerCase();
}

function toNearestGrayHex(hex: string): string {
  const normalized = normalizeHexColor(hex) ?? "#ffffff";
  const red = parseInt(normalized.slice(1, 3), 16);
  const green = parseInt(normalized.slice(3, 5), 16);
  const blue = parseInt(normalized.slice(5, 7), 16);
  const luminance = 0.299 * red + 0.587 * green + 0.114 * blue;
  const nearest = GRAY_LEVELS.reduce((best, current) => (
    Math.abs(current - luminance) < Math.abs(best - luminance) ? current : best
  ), GRAY_LEVELS[0]);
  return `#${toHexPair(nearest)}${toHexPair(nearest)}${toHexPair(nearest)}`;
}

function hexToCmyk(hex: string): CmykColor {
  const normalized = toNearestGrayHex(normalizeHexColor(hex) ?? "#ffffff");
  const red = parseInt(normalized.slice(1, 3), 16) / 255;
  const green = parseInt(normalized.slice(3, 5), 16) / 255;
  const blue = parseInt(normalized.slice(5, 7), 16) / 255;
  const k = 1 - Math.max(red, green, blue);
  if (k >= 1) {
    return { c: 0, m: 0, y: 0, k: 100 };
  }
  return {
    c: Math.round(((1 - red - k) / (1 - k)) * 100),
    m: Math.round(((1 - green - k) / (1 - k)) * 100),
    y: Math.round(((1 - blue - k) / (1 - k)) * 100),
    k: Math.round(k * 100)
  };
}

function cmykToHex({ c, m, y, k }: CmykColor): string {
  const cyan = clampPercent(c) / 100;
  const magenta = clampPercent(m) / 100;
  const yellow = clampPercent(y) / 100;
  const black = clampPercent(k) / 100;
  const red = Math.round(255 * (1 - cyan) * (1 - black));
  const green = Math.round(255 * (1 - magenta) * (1 - black));
  const blue = Math.round(255 * (1 - yellow) * (1 - black));
  return `#${toHexPair(red)}${toHexPair(green)}${toHexPair(blue)}`;
}

function readableTextColor(hex: string): string {
  const normalized = normalizeHexColor(hex) ?? "#ffffff";
  const red = parseInt(normalized.slice(1, 3), 16);
  const green = parseInt(normalized.slice(3, 5), 16);
  const blue = parseInt(normalized.slice(5, 7), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance > 0.62 ? "#1d1d1f" : "#ffffff";
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
}

function toHexPair(value: number): string {
  return Math.min(255, Math.max(0, value)).toString(16).padStart(2, "0");
}

function getNextCustomFieldKey(fields: CertificateItem["fields"]): string {
  const base = "自定义字段";
  if (!(base in fields)) {
    return base;
  }

  for (let index = 2; index < 100; index += 1) {
    const key = `${base}${index}`;
    if (!(key in fields)) {
      return key;
    }
  }

  return `${base}${Date.now()}`;
}

function normalizeControlOrder(order: string[] = [], customBlocks: CertificateCustomBlock[] = []): string[] {
  const customIds = customBlocks.map((block) => block.id);
  const known = new Set([...DEFAULT_CERTIFICATE_CONTROL_ORDER, ...customIds]);
  const normalized: string[] = [];
  for (const blockId of order) {
    if (known.has(blockId) && !normalized.includes(blockId)) {
      normalized.push(blockId);
    }
  }
  for (const blockId of DEFAULT_CERTIFICATE_CONTROL_ORDER) {
    if (!normalized.includes(blockId)) {
      normalized.push(blockId);
    }
    if (blockId === "custom") {
      let insertIndex = normalized.indexOf("custom") + 1;
      for (const customId of customIds) {
        if (!normalized.includes(customId)) {
          normalized.splice(insertIndex, 0, customId);
          insertIndex += 1;
        }
      }
    }
  }
  return normalized;
}

function insertCustomBlockId(order: string[], blockId: string): string[] {
  const normalized = order.filter((candidate) => candidate !== blockId);
  const customIndex = normalized.indexOf("custom");
  let insertIndex = customIndex >= 0 ? customIndex + 1 : normalized.length;
  while (insertIndex < normalized.length && normalized[insertIndex].startsWith("custom-")) {
    insertIndex += 1;
  }
  normalized.splice(insertIndex, 0, blockId);
  return normalized;
}

function moveById<T extends string | { id: string }>(items: T[], sourceId: string, targetId: string): T[] {
  const getId = (item: T) => (typeof item === "string" ? item : item.id);
  const sourceIndex = items.findIndex((item) => getId(item) === sourceId);
  const targetIndex = items.findIndex((item) => getId(item) === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return items;
  }
  const next = [...items];
  const [source] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, source);
  return next;
}

function getCertificateCustomBlocks(certificate: CertificateItem, customFieldKeys: string[]): CertificateCustomBlock[] {
  const blocks = [...(certificate.customBlocks ?? [])];
  const coveredKeys = new Set(blocks.flatMap((block) => block.fields));
  for (const key of customFieldKeys) {
    if (!coveredKeys.has(key)) {
      blocks.push({
        id: `legacy-${key}`,
        label: "1*1 自定义组件",
        layout: "1x1",
        fields: [key]
      });
    }
  }
  return blocks;
}

function getCertificateFieldLabel(item: CertificateItem, fieldKey: string): string {
  return item.fieldLabels?.[fieldKey] ?? DEFAULT_CERTIFICATE_FIELD_LABELS[fieldKey] ?? FIELD_META[fieldKey]?.label ?? fieldKey;
}

function CertificateControls({
  certificate,
  customFieldKeys,
  fontOptions,
  toggleFieldVisibility,
  updateCertificateFieldLabel,
  updateCertificate,
  addCustomField,
  deleteCustomBlock,
  reorderControlBlock
}: {
  certificate: CertificateItem;
  customFieldKeys: string[];
  fontOptions: FontOption[];
  toggleFieldVisibility: (fieldKey: string) => void;
  updateCertificateFieldLabel: (fieldKey: string, nextLabel: string) => boolean;
  updateCertificate: (updater: (item: CertificateItem) => CertificateItem) => void;
  addCustomField: (layout: CertificateFieldLayout) => void;
  deleteCustomBlock: (blockId: string) => void;
  reorderControlBlock: (sourceId: string, targetId: string) => void;
}) {
  const hiddenFields = certificate.hiddenFields ?? [];
  const [customLayout, setCustomLayout] = useState<CertificateFieldLayout>("1x1");
  const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null);
  const [draggingOverBlockId, setDraggingOverBlockId] = useState<string | null>(null);
  const activeDragBlockIdRef = useRef<string | null>(null);
  const dragPreviewRef = useRef<HTMLElement | null>(null);
  const customBlocks = getCertificateCustomBlocks(certificate, customFieldKeys);
  const orderedBlocks = normalizeControlOrder(certificate.controlOrder, customBlocks);
  const getLabel = (fieldKey: string) => getCertificateFieldLabel(certificate, fieldKey);
  const getFieldFont = (fieldKey: string) => certificate.fieldFonts?.[fieldKey] ?? certificate.fontFamily;
  const updateCertificateFieldFont = (fieldKey: string, fontFamily: string) => {
    updateCertificate((item) => ({
      ...item,
      fieldFonts: {
        ...item.fieldFonts,
        [fieldKey]: fontFamily
      }
    }));
  };
  useEffect(() => () => {
    dragPreviewRef.current?.remove();
    dragPreviewRef.current = null;
  }, []);
  const clearDragState = () => {
    setDraggingBlockId(null);
    setDraggingOverBlockId(null);
    activeDragBlockIdRef.current = null;
    dragPreviewRef.current?.remove();
    dragPreviewRef.current = null;
  };
  const setDragPreview = (event: React.DragEvent<HTMLElement>, selector: string) => {
    const source = event.currentTarget.closest(selector) as HTMLElement | null;
    if (!source) {
      return;
    }
    dragPreviewRef.current?.remove();
    const rect = source.getBoundingClientRect();
    const preview = source.cloneNode(true) as HTMLElement;
    preview.classList.remove("is-dragging", "is-drop-target");
    preview.classList.add("drag-preview-card");
    preview.style.width = `${rect.width}px`;
    document.body.appendChild(preview);
    dragPreviewRef.current = preview;
    event.dataTransfer.setDragImage(preview, 18, Math.max(20, Math.min(rect.height / 2, 72)));
  };
  const renderField = (fieldKey: string, onDelete?: () => void) => (
    <div className="layout-field">
      <FieldControlLabel fieldKey={fieldKey} fontFamily={getFieldFont(fieldKey)} fontOptions={fontOptions}
        hiddenFields={hiddenFields} label={getLabel(fieldKey)}
        onChangeFont={(fontFamily) => updateCertificateFieldFont(fieldKey, fontFamily)}
        onRenameLabel={(nextLabel) => updateCertificateFieldLabel(fieldKey, nextLabel)}
        onToggleHidden={toggleFieldVisibility} onDelete={onDelete} />
    </div>
  );
  const renderComponent = (blockId: string, children: React.ReactNode) => {
    return (
      <section
        key={blockId}
        className={[
          "control-section",
          "control-component",
          draggingBlockId === blockId ? "is-dragging" : "",
          draggingOverBlockId === blockId && draggingBlockId !== blockId ? "is-drop-target" : ""
        ].filter(Boolean).join(" ")}
        onDragEnd={clearDragState}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          const sourceId = activeDragBlockIdRef.current || draggingBlockId;
          if (sourceId && sourceId !== blockId) {
            setDraggingOverBlockId(blockId);
            reorderControlBlock(sourceId, blockId);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          const sourceId = event.dataTransfer.getData("text/plain") || activeDragBlockIdRef.current || draggingBlockId;
          if (sourceId) {
            reorderControlBlock(sourceId, blockId);
          }
          clearDragState();
        }}
      >
        <button
          className="component-drag-handle"
          type="button"
          draggable
          aria-label="拖动排序"
          title="拖动排序"
          onDragStart={(event) => {
            setDraggingBlockId(blockId);
            activeDragBlockIdRef.current = blockId;
            event.dataTransfer.setData("text/plain", blockId);
            event.dataTransfer.effectAllowed = "move";
            setDragPreview(event, ".control-component");
          }}
          onDragEnd={clearDragState}
          onClick={(event) => event.preventDefault()}
        >
          <GripVertical size={16} />
        </button>
        {children}
      </section>
    );
  };
  const renderCustomBlock = (block: CertificateCustomBlock) => renderComponent(block.id, (
    <div className={"component-body custom-component-fields layout-" + block.layout}>
      {block.fields.map((key) => <React.Fragment key={key}>{renderField(key, () => deleteCustomBlock(block.id))}</React.Fragment>)}
    </div>
  ));
  const renderBlock = (blockId: string) => {
    const customBlock = customBlocks.find((block) => block.id === blockId);
    if (customBlock) {
      return renderCustomBlock(customBlock);
    }
    if (blockId === "identity") {
      return renderComponent(blockId, (
        <div className="component-body two-up">
          {renderField("title")}
          <label>
            证书字体
            <DropdownSelect
              ariaLabel="证书字体"
              value={certificate.fontFamily}
              options={fontOptions}
              onChange={(value) => updateCertificate((item) => ({ ...item, fontFamily: value }))}
            />
          </label>
        </div>
      ));
    }
    if (blockId === "product") {
      return renderComponent(blockId, <div className="component-body two-up">{renderField("brand")}{renderField("productName")}</div>);
    }
    if (blockId === "spec") {
      return renderComponent(blockId, (
        <div className="component-body three-up">
          {renderField("styleNo")}
          {renderField("sizeCode")}
          {renderField("sizeSpec")}
        </div>
      ));
    }
    if (blockId === "attributes") {
      return renderComponent(blockId, (
        <div className="component-body three-up">
          {renderField("color")}
          {renderField("grade")}
          {renderField("inspector")}
        </div>
      ));
    }
    if (blockId === "compliance") {
      return renderComponent(blockId, <div className="component-body two-up">{renderField("standard")}{renderField("safetyCategory")}</div>);
    }
    if (blockId === "company") {
      return renderComponent(blockId, (
        <div className="component-body">
          <div className="company-address-row">
            {renderField("company")}
            {renderField("address")}
          </div>
        </div>
      ));
    }
    if (blockId === "custom") {
      return renderComponent(blockId, (
        <div className="component-body">
          <div className="custom-add-row">
            <label>
              新增字段
              <DropdownSelect
                ariaLabel="新增字段类型"
                value={customLayout}
                options={CUSTOM_FIELD_LAYOUT_OPTIONS}
                onChange={(value) => setCustomLayout(value)}
              />
            </label>
            <button type="button" onClick={() => addCustomField(customLayout)}>
              <Plus size={17} />
              <span>新增字段</span>
            </button>
          </div>
        </div>
      ));
    }
    if (blockId === "ean") {
      return renderComponent(blockId, <div className="component-body">{renderField("ean")}</div>);
    }
    if (blockId === "commerce") {
      return renderComponent(blockId, (
        <div className="component-body four-up">
          {renderField("price")}
          {renderField("currency")}
          <label>
            背景色
            <ColorPickerControl
              ariaLabel="背景色"
              value={certificate.backgroundColor}
              onChange={(backgroundColor) => updateCertificate((item) => ({ ...item, backgroundColor }))}
            />
          </label>

        </div>
      ));
    }
    if (blockId === "size") {
      return renderComponent(blockId, (
        <div className="component-body two-up">
          <label>
            外宽 mm
            <input type="number" min="20" step="1" value={certificate.widthMm} onChange={(event) => { const widthMm = Number(event.target.value); updateCertificate((item) => ({ ...item, widthMm })); }} />
          </label>
          <label>
            外高 mm
            <input type="number" min="20" step="1" value={certificate.heightMm} onChange={(event) => { const heightMm = Number(event.target.value); updateCertificate((item) => ({ ...item, heightMm })); }} />
          </label>
        </div>
      ));
    }
    return null;
  };
  return <>{orderedBlocks.map(renderBlock)}</>;
}

function FieldControlLabel({
  fieldKey,
  fontFamily,
  fontOptions,
  hiddenFields,
  label,
  onChangeFont,
  onRenameLabel,
  onToggleHidden,
  onDelete
}: {
  fieldKey: string;
  fontFamily: string;
  fontOptions: FontOption[];
  hiddenFields: string[];
  label: string;
  onChangeFont: (fontFamily: string) => void;
  onRenameLabel?: (nextLabel: string) => boolean;
  onToggleHidden: (fieldKey: string) => void;
  onDelete?: () => void;
}) {
  const hidden = hiddenFields.includes(fieldKey);
  const showFontControl = true;
  const showDeleteControl = Boolean(onDelete);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);

  useEffect(() => {
    if (!editing) {
      setDraft(label);
    }
  }, [editing, label]);

  function commitLabel() {
    const nextLabel = draft.trim();
    setEditing(false);
    if (!nextLabel || nextLabel === label) {
      setDraft(label);
      return;
    }
    if (!onRenameLabel?.(nextLabel)) {
      setDraft(label);
    }
  }

  return (
    <span className={[
      "field-label",
      hidden ? "is-hidden" : "",
      showFontControl ? "has-font-control" : "",
      showDeleteControl ? "has-delete-control" : ""
    ].filter(Boolean).join(" ")}>
      {editing ? (
        <input
          className="field-label-edit-input"
          value={draft}
          autoFocus
          onBlur={commitLabel}
          onChange={(event) => setDraft(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
            if (event.key === "Escape") {
              setDraft(label);
              setEditing(false);
            }
          }}
        />
      ) : (
        <button
          className="field-label-edit-button"
          type="button"
          aria-label={`编辑${label}`}
          title="点击编辑字段标题"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setEditing(true);
          }}
        >
          {label}
        </button>
      )}
      <span className="field-label-actions">
        {showFontControl ? (
          <FieldFontButton
            fieldKey={fieldKey}
            label={label}
            options={fontOptions}
            value={fontFamily}
            onChange={onChangeFont}
          />
        ) : null}
        <button
          className="field-visibility-button"
          type="button"
          aria-label={hidden ? `显示${label}` : `隐藏${label}`}
          title={hidden ? `显示${label}` : `隐藏${label}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggleHidden(fieldKey);
          }}
        >
          {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
        {onDelete ? (
          <button
            className="field-delete-button"
            type="button"
            aria-label={`删除${label}`}
            title={`删除${label}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 size={14} />
          </button>
        ) : null}
      </span>
    </span>
  );
}

function FieldFontButton({
  fieldKey,
  label,
  onChange,
  options,
  value
}: {
  fieldKey: string;
  label: string;
  onChange: (fontFamily: string) => void;
  options: FontOption[];
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      return;
    }

    const rect = buttonRef.current.getBoundingClientRect();
    setMenuStyle({
      left: Math.max(12, Math.min(rect.left, window.innerWidth - 272)),
      top: rect.bottom + 8,
      width: 260
    });
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        className="field-font-button"
        type="button"
        aria-label={`选择${label}字体`}
        title={`${label}字体：${selected.label}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        F
      </button>
      {open ? createPortal(
        <div className="field-font-menu" ref={menuRef} style={menuStyle} role="menu" aria-label={`${label}字体`}>
          {options.map((option) => (
            <button
              className={option.value === value ? "field-font-option is-selected" : "field-font-option"}
              key={`${fieldKey}-${option.value}`}
              type="button"
              role="menuitemradio"
              aria-checked={option.value === value}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onChange(option.value);
                setOpen(false);
              }}
            >
              <span style={{ fontFamily: option.value }}>F</span>
              <strong>{option.label}</strong>
            </button>
          ))}
        </div>,
        document.body
      ) : null}
    </>
  );
}
