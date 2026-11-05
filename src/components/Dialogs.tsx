import { labelFor } from '../locale';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import OP from '../core';
import { useStore, S } from '../store';
import * as ops from '../lib/taskOps';
import Icon from './Icon';
import type { CustomField, Resource } from '../types';
import { version } from '../../package.json';
import { projectFromTable } from '../lib/importTable';
import { loadProject } from '../lib/actions';

const U = OP.util;
const STATUSES = ['Draft', 'In review', 'Approved', 'Baselined', 'Final'];

function Modal({ title, children, onSubmit, okLabel = "儲存", cancelLabel = "取消", noOk }: {
  title: string; children: ReactNode; onSubmit?: (fd: FormData) => boolean | void; okLabel?: ReactNode; cancelLabel?: string; noOk?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = () => S().closeDialog();
  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
  }, []);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (onSubmit && onSubmit(new FormData(e.currentTarget)) === false) return;
    close();
  };
  return (
    <dialog ref={ref} onClose={close} onCancel={e => { e.preventDefault(); close(); }}>
      <form onSubmit={submit}>
        <div className="dlg-head"><h2>{title}</h2><button type="button" className="icon-btn" aria-label="關閉" onClick={close}><Icon name="x" /></button></div>
        <div className="dlg-body">{children}</div>
        <div className="dlg-foot">
          <button type="button" className="btn" onClick={close}>{cancelLabel}</button>
          {!noOk && <button type="submit" className="btn primary">{okLabel}</button>}
        </div>
      </form>
    </dialog>
  );
}

function F({ label, name, value, type = 'text', ...rest }: { label: string; name: string; value?: any; type?: string; [k: string]: any }) {
  return <label className="field"><span>{label}</span><input className="inp" name={name} type={type} defaultValue={value ?? ''} {...rest} /></label>;
}

function parseDates(text: FormDataEntryValue | null, bad: string[]) {
  return String(text || '').split(/[\s,]+/).filter(Boolean).filter(d => {
    if (U.parseDate(d) == null) { bad.push(d); return false; }
    return true;
  });
}

function SettingsDialog() {
  const st = useStore(), p = st.p;
  // Fields keep their ids while being renamed, so task values stay with the right field.
  const [fields, setFields] = useState<CustomField[]>(() => p.customFields.map(f => ({ ...f })));
  const patchField = (k: number, patch: Partial<CustomField>) => setFields(fields.map((f, i) => (i === k ? { ...f, ...patch } : f)));
  const statuses = STATUSES.includes(p.status) || !p.status ? STATUSES : STATUSES.concat([p.status]);
  return (
    <Modal title="專案資訊" onSubmit={fd => {
      const bad: string[] = [];
      const hol = parseDates(fd.get('holidays'), bad);
      if (bad.length) st.toast("已略過無效的假日日期： " + bad.join(', '), true);
      const cfs = fields.map(f => ({ ...f, name: f.name.trim() })).filter(f => f.name);
      st.commit(pp => {
        pp.name = String(fd.get('name')).trim() || "未命名專案";
        pp.organization = String(fd.get('organization'));
        pp.manager = String(fd.get('manager'));
        pp.status = String(fd.get('status'));
        pp.issueDate = String(fd.get('issueDate'));
        pp.start = String(fd.get('start')) || pp.start;
        pp.statusDate = String(fd.get('statusDate'));
        pp.hoursPerDay = Math.max(1, Math.min(24, +fd.get('hoursPerDay')! || 8));
        pp.budget = Math.max(0, +fd.get('budget')! || 0);
        pp.currency = String(fd.get('currency')).trim();
        pp.holidays = hol;
        pp.customFields = cfs;
        const keep = new Set(cfs.map(f => f.id));
        pp.tasks.forEach(t => { Object.keys(t.custom).forEach(id => { if (!keep.has(id)) delete t.custom[id]; }); });
      });
    }}>
      <F label="專案名稱" name="name" value={p.name} maxLength={160} required />
      <div className="row2"><F label="發布單位" name="organization" value={p.organization} /><F label="專案經理" name="manager" value={p.manager} /></div>
      <div className="row2">
        <label className="field"><span>狀態</span><select className="sel" name="status" defaultValue={p.status}>
          {statuses.map(s => <option key={s} value={s}>{labelFor(s)}</option>)}
        </select></label>
        <F label="發布日期" name="issueDate" value={p.issueDate} type="date" />
      </div>
      <div className="row2"><F label="專案開始日期" name="start" value={p.start} type="date" required /><F label="狀態日期（進度統計基準）" name="statusDate" value={p.statusDate} type="date" /></div>
      <div className="row3">
        <F label="預算" name="budget" value={p.budget} type="number" min={0} step={1000} />
        <F label="幣別符號" name="currency" value={p.currency} />
        <F label="每日工作時數" name="hoursPerDay" value={p.hoursPerDay} type="number" min={1} max={24} step={0.5} />
      </div>
      <label className="field"><span>假日（每行填一個 YYYY-MM-DD 日期，週末已列為非工作日）</span>
        <textarea className="inp" name="holidays" rows={3} defaultValue={(p.holidays || []).join('\n')} /></label>
      <div className="field"><span>自訂任務欄位</span>
        <div className="mini-list">
          {fields.map((f, k) => (
            <div className="mini-row cf" key={f.id}>
              <input className="inp" aria-label="欄位名稱" placeholder="例如：責任人" value={f.name} onChange={e => patchField(k, { name: e.target.value })} />
              <select className="sel" aria-label="欄位類型" value={f.type} onChange={e => patchField(k, { type: e.target.value as CustomField['type'] })}>
                <option value="text">文字</option><option value="number">數字</option>
              </select>
              <button type="button" className="icon-btn" aria-label="移除欄位" onClick={() => setFields(fields.filter((_, i) => i !== k))}><Icon name="x" /></button>
            </div>
          ))}
          <button type="button" className="btn ghost" onClick={() => setFields(fields.concat([{ id: 'c' + Date.now().toString(36) + fields.length, name: '', type: 'text' }]))}><Icon name="plus" />新增欄位</button>
        </div>
      </div>
    </Modal>
  );
}

function RecurringDialog() {
  const st = useStore();
  return (
    <Modal title="週期性任務" okLabel="建立" onSubmit={fd => {
      const name = String(fd.get('name')).trim(), first = U.parseDate(String(fd.get('first')));
      if (!name || first == null) return false;
      ops.createRecurring({
        name, first, duration: Math.max(0, +fd.get('duration')! || 0),
        count: Math.max(1, Math.min(104, +fd.get('count')! || 1)), every: Math.max(1, +fd.get('every')! || 1), unit: String(fd.get('unit'))
      });
      st.setView('gantt');
    }}>
      <F label="任務名稱" name="name" value="Sprint review" required />
      <div className="row3">
        <F label="工期（天）" name="duration" value={1} type="number" min={0} step={0.5} />
        <F label="首次執行" name="first" value={U.iso(st.s.startDn)} type="date" required />
        <F label="執行次數" name="count" value={4} type="number" min={1} max={104} />
      </div>
      <div className="row2">
        <label className="field"><span>重複</span><select className="sel" name="unit" defaultValue="week">
          <option value="week">每週</option><option value="month">每月</option><option value="day">每個工作日</option>
        </select></label>
        <F label="間隔" name="every" value={2} type="number" min={1} max={52} />
      </div>
      <p className="muted small">建立一項摘要任務，每次執行各有一項子任務，並設定最早開始日期。</p>
    </Modal>
  );
}

function ResourceDialog({ uid }: { uid: number }) {
  const st = useStore(), r = st.p.resources.find(x => x.uid === uid) as Resource;
  if (!r) return null;
  const rates = (r.rates || []).map(e => e.from + ' ' + e.rate).join('\n');
  return (
    <Modal title={r.name || "資源"} onSubmit={fd => {
      const bad: string[] = [];
      const vac = parseDates(fd.get('vacations'), bad);
      const rateList: { from: string; rate: number }[] = [];
      String(fd.get('rates') || '').split('\n').forEach(line => {
        const m = /^\s*(\d{4}-\d{2}-\d{2})[\s,;]+(\d+(?:\.\d+)?)\s*$/.exec(line);
        if (m) rateList.push({ from: m[1], rate: +m[2] });
        else if (line.trim()) bad.push(line.trim());
      });
      if (bad.length) st.toast("已略過： " + bad.join(', '), true);
      st.commit(p => {
        const x = p.resources.find(y => y.uid === uid)!;
        if (x.kind === 'Work') {
          x.workDays = fd.getAll('wd').map(Number).sort();
          x.vacations = vac;
          x.rates = rateList.sort((a, b) => (a.from < b.from ? -1 : 1));
        }
        if (x.kind === 'Material') x.materialLabel = String(fd.get('materialLabel') || '');
        if (x.kind !== 'Cost') x.costPerUse = Math.max(0, +fd.get('costPerUse')! || 0);
      });
    }}>
      {r.kind === 'Work' && <>
        <label className="field"><span>工作日</span><div className="chk-row">
          {[1, 2, 3, 4, 5, 6, 0].map(d => <label key={d} className="chk"><input type="checkbox" name="wd" value={d} defaultChecked={r.workDays.includes(d)} />週{U.DAYS[d]}</label>)}
        </div></label>
        <label className="field"><span>休假／不在班（每行填一個 YYYY-MM-DD 日期）</span><textarea className="inp" name="vacations" rows={3} defaultValue={r.vacations.join('\n')} /></label>
        <label className="field"><span>費率異動（每行填生效日期與新時薪）</span><textarea className="inp" name="rates" rows={3} placeholder="2026-04-01 8500" defaultValue={rates} /></label>
        <p className="muted small">依工作日與休假判斷人員何時可投入，並用於超額分配提示及資源平衡。</p>
      </>}
      {r.kind === 'Material' && <F label="材料單位" name="materialLabel" value={r.materialLabel} placeholder="例如：套、台" />}
      {r.kind !== 'Cost'
        ? <F label={"每次使用成本（" + st.p.currency + ')'} name="costPerUse" value={r.costPerUse} type="number" min={0} step={100} />
        : <p className="muted">差旅、授權或規費等成本資源，可在各項任務的指派欄位直接填金額。</p>}
    </Modal>
  );
}

const SHORTCUTS: [ReactNode, string][] = [
  [<><kbd>Enter</kbd> <kbd>↑</kbd> <kbd>↓</kbd></>, "在各列間移動"],
  [<><kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>→</kbd> / <kbd>←</kbd></>, "增加／減少縮排"],
  [<kbd>Ins</kbd>, "插入任務"],
  [<kbd>Del</kbd>, "刪除選取的任務"],
  [<><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Y</kbd></>, "復原／重做"],
  [<><kbd>Ctrl</kbd>+<kbd>S</kbd></>, "儲存至雲端"]
];

function AboutDialog() {
  return (
    <Modal title="關於 OpenPlan" cancelLabel="關閉" noOk>
      <div className="about-head">
        <img src="./assets/OpenPlan.png" alt="" width={44} height={44} />
        <div><h3>OpenPlan</h3><span className="muted">版本 {version} · 台灣繁體中文</span></div>
      </div>
      <p>使用甘特圖、工作分解結構、資源指派和報表規劃專案。變更會自動儲存至雲端，也可從<b>檔案 › 儲存</b>下載 .openplan 備份。</p>
      <section className="about-sec">
        <h4>快速鍵</h4>
        <table className="about-keys"><tbody>{SHORTCUTS.map(([keys, action]) => <tr key={action}><td>{keys}</td><td>{action}</td></tr>)}</tbody></table>
      </section>
      <section className="about-sec">
        <h4>操作技巧</h4>
        <dl className="about-tips">
          <dt>重新命名專案</dt><dd>點一下標題列的專案名稱。 <kbd>Enter</kbd> 儲存； <kbd>Esc</kbd> 取消。</dd>
          <dt>甘特圖</dt><dd>拖曳時程條可設定最早開始日期，拖曳右緣可調整工期，拖到另一個時程條上可建立依賴關係。</dd>
          <dt>前置任務</dt><dd>以逗號分隔任務編號，可指定 FS（預設）、SS、FF、SF 關係及延遲天數，例如 <code>3, 5SS+2d, 7FF-1d</code>.</dd>
        </dl>
      </section>
      <p className="about-foot muted">採用 <a href="https://github.com/MNSBaanu/OpenPlan/blob/main/LICENSE" target="_blank" rel="noreferrer">MIT 授權條款</a> · <a href="https://github.com/MNSBaanu/OpenPlan" target="_blank" rel="noreferrer">GitHub 原始碼</a> · 原作者 MNS Baanu</p>
    </Modal>
  );
}

function ImportDialog() {
  const [text, setText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const result = useMemo(() => {
    if (!text.trim()) return null;
    try { return projectFromTable(text); } catch (e: any) { return { error: e.message as string }; }
  }, [text]);
  const ok = result && 'project' in result ? result : null;
  const pickFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { S().toast("檔案超過 5 MB。請選擇較小的 CSV 任務清單。", true); return; }
    setText(await file.text());
  };
  return (
    <Modal title="從 Excel 或 CSV 匯入任務" okLabel="匯入" onSubmit={() => {
      if (!ok) return false;
      loadProject(ok.project, '已匯入 ' + ok.tasks + ' 項任務。' + ok.warnings.join('。'));
    }}>
      <p>可貼上 Excel 或 Google 試算表中的任務清單，或選擇 CSV 檔案。支援任務名稱、工期、前置任務、資源、層級、WBS、完成率和備註欄。沒有欄名時，依序讀取任務名稱、工期和前置任務。</p>
      <textarea className="inp mono" id="import-text" rows={9} value={text} onChange={e => setText(e.target.value)} aria-label="任務清單"
        placeholder={['任務名稱,工期,前置任務', '設計,5', '製作,10,1', '上線,0,2'].join('\n')} />
      <div className="row-actions">
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}><Icon name="upload" />選擇 CSV 檔案…</button>
        <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv" hidden onChange={e => pickFile(e.target.files?.[0])} />
      </div>
      {ok && <p className="muted">找到 {ok.tasks} 項任務和 {ok.resources} 筆資源。匯入會取代目前計畫，可用「復原」回到匯入前。</p>}
      {ok && ok.warnings.length > 0 && <p className="alert warn inline">{ok.warnings.join('。')}.</p>}
      {result && 'error' in result && <p className="alert inline">{result.error}</p>}
    </Modal>
  );
}

function ConfirmDialog({ title, message, okLabel, onOk }: { title: string; message: string; okLabel: string; onOk: () => void }) {
  return (
    <Modal title={title} okLabel={okLabel} onSubmit={() => { S().closeDialog(); onOk(); return false; }}>
      <p className="confirm-msg">{message}</p>
    </Modal>
  );
}

export default function DialogHost() {
  const dialog = useStore(s => s.dialog);
  if (!dialog) return null;
  switch (dialog.type) {
    case 'settings': return <SettingsDialog />;
    case 'recurring': return <RecurringDialog />;
    case 'resource': return <ResourceDialog uid={dialog.props.uid} />;
    case 'about': return <AboutDialog />;
    case 'import': return <ImportDialog />;
    case 'confirm': return <ConfirmDialog {...dialog.props} />;
    default: return null;
  }
}
