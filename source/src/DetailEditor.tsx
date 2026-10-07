import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { DEFAULT_CERTIFICATE_FIELD_LABELS } from "./core";
import { DETAIL_FIELDS, editCertificateRow, normalizeCount, resequenceBarcodes, resequenceCertificateEans,
  resetRowField, resizeBarcodes, resizeCertificates, resolveCertificate, SIZE_SPECS, syncSizeSpec, type Workspace } from "./core/workspace";

export function CountInput({ count, onCommit, label = "数量" }: { count: number; onCommit: (count: number) => void; label?: string }) {
  const [draft, setDraft] = useState(String(count));
  useEffect(() => setDraft(String(count)), [count]);
  function commit() {
    if (!draft.trim() || !Number.isFinite(Number(draft))) { setDraft(String(count)); return; }
    const next = normalizeCount(Number(draft));
    if (next !== count) onCommit(next);
    // Also restore the input when a reduction was cancelled by the user.
    setDraft(String(count));
  }
  return <label className="count-control"><span>{label}</span>
    <button type="button" aria-label="减少数量" disabled={count <= 1} onClick={() => onCommit(count - 1)}>−</button>
    <input aria-label={label} inputMode="numeric" value={draft} onChange={(event) => setDraft(event.target.value)}
      onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setDraft(String(count)); } }} />
    <button type="button" aria-label="增加数量" disabled={count >= 500} onClick={() => onCommit(count + 1)}>+</button>
  </label>;
}

export function useModalFocus(onClose: () => void) {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]') ?? []).filter((el) => el.getClientRects().length);
    (ref.current?.querySelector<HTMLElement>("[data-initial-focus]") ?? focusable()[0])?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const nodes = focusable();
      if (!nodes.length) return;
      if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes[nodes.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === nodes[nodes.length - 1]) { event.preventDefault(); nodes[0].focus(); }
    }
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, []);
  return ref;
}

export function DetailEditor({ initial, selectedId, initialField, onApply, onClose }: {
  initial: Workspace; selectedId: string; initialField?: string; onApply: (workspace: Workspace) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [more, setMore] = useState(Boolean(initialField && !DETAIL_FIELDS.includes(initialField)));
  const [error, setError] = useState("");
  const [bulkKey, setBulkKey] = useState(initialField ?? "color");
  const [bulkValue, setBulkValue] = useState("");
  const certificate = draft.mode === "certificate";
  const doc = draft.certificate;
  const barcode = certificate ? null : draft.barcodes[draft.mode as Exclude<Workspace["mode"], "certificate">]!;
  const rows = certificate ? doc.rows : barcode!.rows;
  const allFields = ["title", ...Object.keys(doc.defaults.fields)];
  const fields = more ? [...DETAIL_FIELDS, ...allFields.filter((key) => !DETAIL_FIELDS.includes(key))] : DETAIL_FIELDS;
  const label = (key: string) => doc.defaults.fieldLabels[key] ?? DEFAULT_CERTIFICATE_FIELD_LABELS[key] ?? key;
  const [seed, setSeed] = useState(certificate ? resolveCertificate(doc, doc.rows[0]).fields.ean : barcode!.seed);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const close = () => { if (!dirty || window.confirm("放弃本次尚未应用的明细修改？")) onClose(); };
  const modalRef = useModalFocus(close);

  function run(updater: (workspace: Workspace) => Workspace) {
    try { setDraft(updater(draft)); setError(""); } catch (err) { setError((err as Error).message); }
  }
  function editCell(id: string, key: string, value: string) {
    setDraft((state) => ({ ...state, certificate: { ...state.certificate,
      rows: state.certificate.rows.map((row) => row.id === id ? editCertificateRow(row, key, value) : row) } }));
  }
  function editBarcode(id: string, value: string) {
    setDraft((state) => {
      if (state.mode === "certificate") return state;
      const current = state.barcodes[state.mode]!;
      return { ...state, barcodes: { ...state.barcodes, [state.mode]: { ...current,
        rows: current.rows.map((row) => row.id === id ? { ...row, data: value } : row) } } };
    });
  }
  function resize(count: number) {
    if (count < rows.length && !window.confirm(`将删除末尾 ${rows.length - count} 张记录，是否继续？`)) return;
    run((state) => certificate ? { ...state, certificate: resizeCertificates(state.certificate, count) }
      : { ...state, barcodes: { ...state.barcodes, [state.mode]: resizeBarcodes(barcode!, count) } });
  }
  function remove(id: string, index: number) {
    if (!window.confirm(`删除第 ${index + 1} 张记录？`)) return;
    run((state) => certificate ? { ...state, certificate: { ...doc, rows: doc.rows.filter((row) => row.id !== id) } }
      : { ...state, barcodes: { ...state.barcodes, [state.mode]: { ...barcode!, rows: barcode!.rows.filter((row) => row.id !== id) } } });
  }
  function bulk() {
    if (!window.confirm(`将“${label(bulkKey)}”覆盖到全部 ${rows.length} 张，包含单张例外，是否继续？`)) return;
    run((state) => ({ ...state, certificate: { ...doc, rows: doc.rows.map((row) => editCertificateRow(row, bulkKey, bulkValue)) } }));
  }
  function sequence() {
    if (!window.confirm(`重新生成全部 ${rows.length} 张的${certificate ? " EAN（其他字段保留）" : "数据，将替换逐张修改的数据"}，是否继续？`)) return;
    run((state) => certificate ? { ...state, certificate: resequenceCertificateEans(doc, seed) }
      : { ...state, barcodes: { ...state.barcodes, [state.mode]: resequenceBarcodes({ ...barcode!, seed }) } });
  }

  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="逐张明细">
    <section className="batch-editor" ref={modalRef}>
      <header><div><p className="eyebrow">编辑 → 应用 → 自动预览</p><h3>逐张明细 · {rows.length} 张</h3></div>
        <button type="button" className="icon-button" onClick={close} aria-label="关闭明细"><X size={18} /></button></header>
      <div className="detail-tools">
        <CountInput count={rows.length} onCommit={resize} />
        {certificate && <button type="button" aria-pressed={more} onClick={() => setMore(!more)}>{more ? "收起更多字段" : "更多字段"}</button>}
        <label>连号起始数据<input aria-label="连号起始数据" value={seed} onChange={(event) => setSeed(event.target.value)} /></label>
        <button type="button" onClick={sequence}>{certificate ? "仅重排 EAN" : "重新生成序列"}</button>
      </div>
      {certificate && <p className="workflow-hint">公共字段默认继承左侧设置；单张修改显示“单张例外”。号型手动填写后不再随尺码变化。</p>}
      {error && <p className="error-text" role="alert">{error}</p>}
      <div className="batch-table-wrap"><table className={more ? "detail-table is-expanded" : "detail-table"}>
        <thead><tr><th>#</th>{certificate ? fields.map((key) => <th key={key}>{label(key)}</th>) : <th>数据</th>}<th>操作</th></tr></thead>
        <tbody>{rows.map((record, index) => <tr key={record.id} className={record.id === selectedId ? "selected-detail" : ""}>
          <td>{index + 1}</td>
          {certificate ? fields.map((key) => {
            const row = doc.rows[index];
            const item = resolveCertificate(doc, row);
            const override = key === "title" ? row.title !== undefined : key in row.fields && !DETAIL_FIELDS.includes(key);
            return <td key={key}><input aria-label={`第 ${index + 1} 张${label(key)}`} data-initial-focus={record.id === selectedId && key === (initialField ?? "sizeCode") ? true : undefined}
              value={key === "title" ? item.title : item.fields[key] ?? ""}
              onChange={(event) => editCell(row.id, key, event.target.value)} />
              {override && <button type="button" className="override-badge" title="恢复继承公共信息" onClick={() => setDraft((state) => ({ ...state, certificate: { ...state.certificate,
                rows: state.certificate.rows.map((candidate) => candidate.id === row.id ? resetRowField(candidate, key) : candidate) } }))}>单张例外 · 恢复继承</button>}
              {key === "sizeSpec" && row.manualSizeSpec && <button type="button" className="override-badge" disabled={!SIZE_SPECS[item.fields.sizeCode]} onClick={() => {
                if (window.confirm("用当前尺码的默认号型覆盖手动号型？")) setDraft((state) => ({ ...state, certificate: { ...state.certificate,
                  rows: state.certificate.rows.map((candidate) => candidate.id === row.id ? syncSizeSpec(state.certificate, candidate) : candidate) } }));
              }}>手动号型 · 恢复联动</button>}
            </td>;
          }) : <td><input aria-label={`第 ${index + 1} 张数据`} data-initial-focus={record.id === selectedId ? true : undefined} value={barcode!.rows[index].data}
            onChange={(event) => editBarcode(record.id, event.target.value)} /></td>}
          <td><button type="button" className="icon-button" aria-label={`删除第 ${index + 1} 张`} disabled={rows.length === 1} onClick={() => remove(record.id, index)}><Trash2 size={15} /></button></td>
        </tr>)}</tbody></table></div>
      {certificate && <div className="detail-tools bulk-tools"><label>覆盖字段<select aria-label="覆盖字段" value={bulkKey} onChange={(event) => setBulkKey(event.target.value)}>{allFields.map((key) => <option value={key} key={key}>{label(key)}</option>)}</select></label>
        <label>统一值<input aria-label="统一值" value={bulkValue} onChange={(event) => setBulkValue(event.target.value)} /></label>
        <button type="button" onClick={bulk}>覆盖全部 {rows.length} 张…</button></div>}
      <footer><button type="button" disabled={rows.length >= 500} onClick={() => resize(rows.length + 1)}><Plus size={17} />增加一行</button>
        <button type="button" onClick={close}>取消</button><button type="button" className="primary-button" onClick={() => onApply(draft)}>应用明细</button></footer>
    </section>
  </div>;
}
