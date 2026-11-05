import { labelFor, LINK_LABELS } from '../locale';
import OP from '../core';
import { useApp, type Store } from '../store';
import * as ops from '../lib/taskOps';
import Field, { DateField } from './Field';
import Icon from './Icon';
import type { Project, Resource, Row, Task } from '../types';

const U = OP.util, M = OP.model;
const VIEWS = ['gantt', 'network', 'wbs'];

function Stat({ v, k }: { v: React.ReactNode; k: string }) { return <div className="stat"><b>{v}</b><span>{k}</span></div>; }
const varDays = (v: number) => (v > 0 ? '+' : '') + U.num(v) + 'd';

const defaultUnits = (res: Resource) => (res.kind === 'Work' ? Math.min(100, res.maxUnits) : res.kind === 'Material' ? 1 : 0);

function Opts({ map }: { map: Record<string, string> }) {
  return <>{Object.entries(map).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</>;
}

export default function Drawer() {
  const st = useApp();
  const t = st.sel.length === 1 ? st.p.tasks.find(x => x.uid === st.sel[0]) : null;
  const r = t ? st.s.rows.find((x: Row) => x.task.uid === t.uid) : undefined;
  if (!st.drawer || !t || !r || !VIEWS.includes(st.view)) return null;
  return <DrawerBody st={st} t={t} r={r} />;
}

function DrawerBody({ st, t, r }: { st: Store; t: Task; r: Row }) {
  const p = st.p, uid = t.uid, leaf = !r.summary, cur = p.currency;
  const edit = (fn: (t: Task, p: Project) => void | false) => st.commit(pp => fn(ops.findTask(pp, uid), pp));
  const set = (key: keyof Task, v: any) => edit(x => { (x as any)[key] = v; });
  const dated = t.constraint !== 'ASAP' && t.constraint !== 'ALAP';
  const unitLabel = (resUid: number) => {
    const res = p.resources.find(x => x.uid === resUid);
    return !res ? '' : res.kind === 'Material' ? (res.materialLabel || 'qty') : res.kind === 'Cost' ? cur : '%';
  };
  const rows = st.s.rows;
  const validPred = (x: Row) => {
    if (x.task.uid === uid) return false;
    for (let q = r.parent; q >= 0; q = rows[q].parent) if (q === x.i) return false;
    for (let q = x.parent; q >= 0; q = rows[q].parent) if (q === r.i) return false;
    return true;
  };
  const free = p.resources.filter(x => !t.assignments.some(a => a.res === x.uid));

  const setPredLink = (k: number, patch: Partial<Task['preds'][number]>) => {
    const next = { ...t.preds[k], ...patch };
    const trial: Project = U.clone(p);
    ops.findTask(trial, uid).preds[k] = next;
    if (OP.schedule(trial, { cycleOnly: true }).cycle.length) { st.toast("這項連結會造成循環依賴。", true); return; }
    edit(x => { x.preds[k] = next; });
  };
  const addPred = () => {
    const idx = M.indexByUid(p), i = idx[uid];
    for (let j = i - 1; j >= 0; j--) {
      const c = p.tasks[j];
      if (!M.isSummary(p, j) && !t.preds.some(l => l.uid === c.uid)) {
        const txt = M.formatPreds(p, t);
        ops.setPreds(uid, (txt ? txt + ', ' : '') + (idx[c.uid] + 1));
        return;
      }
    }
    st.toast("目前沒有可連結的前置任務。");
  };

  return (
    <aside className="drawer open">
      <div className="drawer-head">
        <h2>任務 {r.id} <span className="muted small">· WBS {r.wbs}</span></h2>
        <button className="icon-btn" title="關閉面板" aria-label="關閉面板" onClick={() => st.setUI({ drawer: false })}><Icon name="x" /></button>
      </div>
      <div className="drawer-body">
        <label className="field"><span>名稱</span><Field className="inp" fk="d:name" value={t.name} onCommit={v => { set('name', v); }} /></label>
        {r.conflict && <div className="alert inline"><Icon name="alert" />{r.conflict}.</div>}
        {r.missedDeadline && <div className="alert inline"><Icon name="deadline" />預計於 {U.fmt(r.finishDn)} 完成，已超過期限。</div>}

        {leaf && <>
          <div className="row3">
            <label className="field"><span>工期</span><Field className="inp" fk="d:duration" value={M.fmtDuration(r.duration)} onCommit={v => {
              const d = M.parseDuration(v, p.hoursPerDay);
              if (d == null) { st.toast("請輸入工期，例如 5 天、2 週或 16 小時。", true); return false; }
              edit((x, pp) => { ops.setDuration(pp, x, d); });
            }} /></label>
            <label className="field"><span>工時（小時）</span><Field className="inp" fk="d:work" value={U.num(r.work)} onCommit={v => {
              const hrs = parseFloat(v);
              if (!isFinite(hrs)) return false;
              let err = '';
              edit((x, pp) => { err = ops.setWork(pp, x, hrs); if (err) return false; });
              if (err) { st.toast(err, true); return false; }
            }} /></label>
            <label className="field"><span>完成率</span><Field className="inp" type="number" min={0} max={100} step={5} fk="d:percent" value={String(t.percent || 0)}
              onCommit={v => ops.setPercent(uid, Math.max(0, Math.min(100, Math.round(+v || 0))))} /></label>
          </div>
          <div className="row3">
            <label className="field"><span>任務類型</span><select className="sel" value={t.type} onChange={e => set('type', e.target.value)}><Opts map={M.TASK_TYPES} /></select></label>
            <label className="field"><span>投入工時固定</span><label className="toggle" style={{ height: 24, padding: 0 }}><input type="checkbox" checked={t.effortDriven} onChange={e => set('effortDriven', e.target.checked)} />是</label></label>
            <label className="field"><span>里程碑</span><label className="toggle" style={{ height: 24, padding: 0 }}><input type="checkbox" checked={t.milestone} onChange={e => {
              const on = e.target.checked;
              edit(x => { x.milestone = on; x.duration = on ? 0 : (x.duration || 1); });
            }} />是</label></label>
          </div>
          <div className="row2">
            <label className="field"><span>限制條件</span><select className="sel" value={t.constraint} onChange={e => {
              const v = e.target.value;
              edit(x => {
                x.constraint = v;
                if (v === 'ASAP' || v === 'ALAP') x.constraintDate = '';
                else if (!x.constraintDate) x.constraintDate = U.iso(r.startDn);
              });
            }}><Opts map={M.CONSTRAINTS} /></select></label>
            <label className="field"><span>限制日期</span><DateField className="inp" disabled={!dated} value={t.constraintDate}
              onCommit={v => { edit(x => { x.constraintDate = v; if (v && x.constraint === 'ASAP') x.constraint = 'SNET'; }); }} /></label>
          </div>
          <div className="row2">
            <label className="field"><span>期限</span><DateField className="inp" fk="d:deadline" value={t.deadline} onCommit={v => set('deadline', v)} /></label>
            <label className="field"><span>優先順序（0–1000）</span><Field className="inp" type="number" min={0} max={1000} step={50} value={String(t.priority)}
              onCommit={v => { set('priority', Math.max(0, Math.min(1000, Math.round(+v || 0)))); }} /></label>
          </div>
          <div className="row2">
            <label className="field"><span>實際開始</span><DateField className="inp" value={t.actualStart} onCommit={v => {
              edit(x => { x.actualStart = v; if (!v) { x.percent = 0; x.actualFinish = ''; } });
            }} /></label>
            <label className="field"><span>實際完成</span><DateField className="inp" value={t.actualFinish} onCommit={v => {
              edit(x => { x.actualFinish = v; if (v) { x.percent = 100; if (!x.actualStart) x.actualStart = U.iso(r.startDn); } else if (x.percent >= 100) x.percent = 99; });
            }} /></label>
          </div>
        </>}
        <div className="row2">
          <label className="field"><span>固定成本（{cur})</span><Field className="inp" type="number" min={0} step={1000} value={String(t.fixedCost || 0)}
            onCommit={v => { set('fixedCost', Math.max(0, +v || 0)); }} /></label>
          {!leaf && <label className="field"><span>優先順序（0–1000）</span><Field className="inp" type="number" value={String(t.priority)}
            onCommit={v => { set('priority', Math.max(0, Math.min(1000, Math.round(+v || 0)))); }} /></label>}
        </div>

        <div className="stats">
          <Stat v={U.fmt(r.startDn)} k="開始" /><Stat v={U.fmt(r.finishDn)} k="完成" /><Stat v={M.fmtDuration(r.duration)} k="工期" />
          <Stat v={U.num(r.slack) + ' 天'} k="總浮時" /><Stat v={leaf ? U.num(r.freeSlack) + ' 天' : '—'} k="自由浮時" />
          <Stat v={r.critical ? <span style={{ color: 'var(--critical-edge)' }}>是</span> : "否"} k="關鍵路徑" />
          <Stat v={U.num(r.es) + ' / ' + U.num(r.ef)} k="最早開始／完成（天）" /><Stat v={U.num(r.ls) + ' / ' + U.num(r.lf)} k="最晚開始／完成（天）" />
          <Stat v={U.num(r.work) + ' 小時'} k="工時" /><Stat v={U.money(r.cost)} k="成本" /><Stat v={U.money(r.actualCost)} k="實際成本" /><Stat v={r.percent + '%'} k="完成" />
        </div>

        {r.base && <>
          <div className="section-title">基準線</div>
          <div className="stats">
            <Stat v={U.fmt(r.base.startDn)} k="基準開始日期" /><Stat v={U.fmt(r.base.finishDn)} k="基準完成日期" /><Stat v={U.money(r.base.cost)} k="基準成本" />
            <Stat v={varDays(r.startVar)} k="開始日期差異" /><Stat v={varDays(r.finishVar)} k="完成日期差異" /><Stat v={U.money(r.costVar)} k="成本差異" />
          </div>
        </>}
        {t.levelDelay > 0 && <>
          <div className="section-title">資源平衡造成的延遲<button className="btn ghost" onClick={() => set('levelDelay', 0)}><Icon name="x" />清除</button></div>
          <div className="muted small">為了避免資源超額分配，延後 {U.num(t.levelDelay)} 個工作日。</div>
        </>}

        <div className="section-title">前置任務<button className="btn ghost" onClick={addPred}><Icon name="plus" />新增</button></div>
        <div className="mini-list">
          {!t.preds.length && <div className="muted small">尚未設定前置任務。</div>}
          {t.preds.map((l, k) => (
            <div className="mini-row pred" key={k}>
              <select className="sel" value={l.uid} onChange={e => setPredLink(k, { uid: +e.target.value })}>
                {rows.filter(validPred).map((x: Row) => <option key={x.task.uid} value={x.task.uid}>{x.id}. {x.task.name || "（未命名）"}</option>)}
              </select>
              <select className="sel" value={l.type} title="關係類型" onChange={e => setPredLink(k, { type: e.target.value as any })}>
                {M.LINK_TYPES.map((ty: string) => <option key={ty} value={ty}>{LINK_LABELS[ty]}</option>)}
              </select>
              <Field className="inp" type="number" step={1} value={String(l.lag || 0)} title="延遲（天）" onCommit={v => { setPredLink(k, { lag: +v || 0 }); }} />
              <button className="icon-btn" aria-label="移除" onClick={() => edit(x => { x.preds.splice(k, 1); })}><Icon name="x" /></button>
            </div>
          ))}
        </div>

        {leaf && <>
          <div className="section-title">資源</div>
          <div className="mini-list">
            {t.assignments.map((a, k) => {
              const res = p.resources.find(x => x.uid === a.res);
              return (
                <div className="mini-row asg" key={k}>
                  <select className="sel" value={a.res} aria-label="資源" onChange={e => {
                    const v = +e.target.value, nr = p.resources.find(x => x.uid === v);
                    if (!nr) return;
                    edit((x, pp) => { ops.changeAssignments(pp, x, () => { x.assignments[k] = { res: v, units: defaultUnits(nr) }; }); });
                  }}>
                    {p.resources.filter(x => x.uid === a.res || !t.assignments.some(b => b.res === x.uid)).map(x => <option key={x.uid} value={x.uid}>{(x.name || "（未命名）") + (x.kind !== 'Work' ? '（' + labelFor(x.kind) + '）' : '')}</option>)}
                  </select>
                  <label className="unit-inp"><Field className="inp" type="number" min={0} step={res && res.kind === 'Work' ? 5 : 1} value={String(a.units)}
                    onCommit={v => { edit((x, pp) => { ops.setUnits(pp, x, k, Math.max(0, +v || 0)); }); }} /><span>{unitLabel(a.res)}</span></label>
                  <button className="icon-btn" aria-label="移除" onClick={() => edit((x, pp) => { ops.changeAssignments(pp, x, () => { x.assignments.splice(k, 1); }); })}><Icon name="x" /></button>
                </div>
              );
            })}
            {p.resources.length
              ? <select className="sel" data-fk="d:addres" aria-label="指派資源" value="" disabled={!free.length} onChange={e => {
                  const v = +e.target.value, res = p.resources.find(x => x.uid === v);
                  if (!res) return;
                  edit((x, pp) => { ops.changeAssignments(pp, x, () => { x.assignments.push({ res: v, units: defaultUnits(res) }); }); });
                }}>
                  <option value="">{free.length ? "＋ 指派資源…" : "所有資源皆已指派"}</option>
                  {free.map(x => <option key={x.uid} value={x.uid}>{x.name} — {x.kind === 'Work' ? (x.role || labelFor(x.type)) + ' (' + x.maxUnits + '%)' : labelFor(x.kind)}</option>)}
                </select>
              : <div className="muted small">請先在「資源清單」新增人員。</div>}
            <div className="muted small">人力填每日投入比例，材料填數量，成本填金額。{t.effortDriven ? " 固定投入工時下，增加人員會縮短工期，總工時維持相同。" : ''}</div>
          </div>

          {!t.milestone && t.duration > 1 && <>
            <div className="section-title">分割任務<button className="btn ghost" onClick={() => edit(x => { x.splits.push({ at: Math.max(0.5, Math.floor(x.duration / 2)), gap: 2 }); })}><Icon name="plus" />新增中斷</button></div>
            <div className="mini-list">
              {!t.splits.length && <div className="muted small">安排任務中途暫停，例如等待回覆的期間。</div>}
              {t.splits.map((sp, k) => (
                <div className="mini-row split" key={k}>
                  <span className="muted small">開始後</span>
                  <Field className="inp" type="number" min={0.5} step={0.5} value={String(sp.at)} onCommit={v => { edit(x => { x.splits[k].at = Math.max(0.5, Math.min(x.duration - 0.5, +v || 0.5)); }); }} />
                  <span className="muted small">天暫停</span>
                  <Field className="inp" type="number" min={0.5} step={0.5} value={String(sp.gap)} onCommit={v => { edit(x => { x.splits[k].gap = Math.max(0.5, +v || 0.5); }); }} />
                  <span className="muted small">天{sp.at >= t.duration ? '（超過任務工期，已略過）' : ''}</span>
                  <button className="icon-btn" aria-label="移除中斷" onClick={() => edit(x => { x.splits.splice(k, 1); })}><Icon name="x" /></button>
                </div>
              ))}
            </div>
          </>}
        </>}

        {p.customFields.length > 0 && <>
          <div className="section-title">自訂欄位</div>
          {p.customFields.map(f => (
            <label className="field" key={f.id}><span>{f.name}</span>
              <Field className="inp" type={f.type === 'number' ? 'number' : 'text'} value={t.custom[f.id] == null ? '' : String(t.custom[f.id])}
                onCommit={v => { edit(x => { x.custom[f.id] = f.type === 'number' ? (v === '' ? '' : +v) : v; }); }} />
            </label>
          ))}
        </>}
        <label className="field"><span>備註</span>
          <textarea className="inp" defaultValue={t.notes} key={uid + ':' + t.notes} onBlur={e => { if (e.target.value !== t.notes) set('notes', e.target.value); }} />
        </label>
      </div>
    </aside>
  );
}

