import { labelFor } from '../locale';
import OP from '../core';
import { ask, useApp } from '../store';
import { addResource, levelAll } from '../lib/taskOps';
import Field from '../components/Field';
import Icon from '../components/Icon';
import type { Resource } from '../types';

const U = OP.util, M = OP.model;

export function ResourcesView() {
  const st = useApp(), p = st.p, stats = st.s.resStats, cur = p.currency;
  const counts: Record<string, number> = {};
  p.resources.forEach(r => { counts[r.type] = (counts[r.type] || 0) + 1; });
  const summary = M.RES_TYPES.filter((t: string) => counts[t]).map((t: string) => counts[t] + ' 位' + labelFor(t)).join(' · ');

  const edit = (uid: number, fn: (r: Resource) => void) => st.commit(pp => { fn(pp.resources.find(x => x.uid === uid)!); });
  const remove = (r: Resource) => {
    const used = p.tasks.some(t => t.assignments.some(a => a.res === r.uid));
    const run = () => st.commit(pp => {
      pp.resources = pp.resources.filter(x => x.uid !== r.uid);
      pp.resources.forEach(x => { if (x.reportsTo === r.uid) x.reportsTo = null; });
      pp.tasks.forEach(t => { t.assignments = t.assignments.filter(a => a.res !== r.uid); });
    });
    if (used) ask('要刪除「' + (r.name || '這筆資源') + '」和它的所有任務指派嗎？', run, "移除");
    else run();
  };
  // A person cannot report to someone who (directly or indirectly) reports to them.
  const reportsUnder = (uid: number, boss: number) => {
    const seen = new Set<number>();
    for (let q = p.resources.find(x => x.uid === boss); q && !seen.has(q.uid); q = p.resources.find(x => x.uid === q!.reportsTo)) {
      if (q.uid === uid) return true;
      seen.add(q.uid);
    }
    return false;
  };
  const setKind = (r: Resource, kind: Resource['kind']) => {
    const run = () => st.commit(pp => {
      pp.resources.find(x => x.uid === r.uid)!.kind = kind;
      pp.tasks.forEach(t => t.assignments.forEach(a => { if (a.res === r.uid) a.units = kind === 'Work' ? 100 : kind === 'Material' ? 1 : 0; }));
    });
    const n = p.tasks.filter(t => t.assignments.some(a => a.res === r.uid)).length;
    if (n) ask('要將「' + (r.name || '這筆資源') + '」改為' + labelFor(kind) + '嗎？這將重設 ' + n + ' 筆指派的投入量。', run, '變更');
    else run();
  };

  return (
    <div className="view">
      <div className="view-head"><h1>資源</h1><span className="sub">{summary || "人員、材料與成本"}</span></div>
      <div className="toolbar">
        <button className="btn primary" onClick={addResource}><Icon name="plus" />新增資源</button>
        <span className="spacer" />
        <span className="muted small">人力按小時計費，材料按數量計價，成本為各任務的固定金額。</span>
      </div>
      <div className="scroll"><div className="card tbl">
        {!p.resources.length
          ? <div className="empty"><h3>目前沒有資源</h3><div>加入團隊成員，並設定角色、可用時間和時薪。</div></div>
          : (
            <table className="data">
              <thead><tr>
                <th style={{ minWidth: 170 }}>名稱</th><th style={{ width: 70 }}>簡稱</th><th style={{ minWidth: 140 }}>角色</th><th style={{ width: 106 }}>種類</th><th style={{ width: 118 }}>類型</th>
                <th className="num" style={{ width: 80 }}>投入上限 %</th><th className="num" style={{ width: 110 }}>費率（{cur})</th><th style={{ minWidth: 140 }}>直屬主管</th>
                <th className="num">工時</th><th className="num">成本</th><th className="num">尖峰</th><th>狀態</th><th />
              </tr></thead>
              <tbody>
                {p.resources.map(r => {
                  const s = stats[r.uid] || { work: 0, cost: 0, peak: 0, qty: 0 }, work = r.kind === 'Work';
                  const extra: string[] = [];
                  if (work && r.workDays.join() !== '1,2,3,4,5') extra.push(r.workDays.map(d => '週' + U.DAYS[d]).join('、'));
                  if (work && r.vacations.length) extra.push(r.vacations.length + ' 天休假');
                  if (work && r.rates.length) extra.push(r.rates.length + ' 筆費率異動');
                  return (
                    <tr key={r.uid}>
                      <td><Field className="inp" fk={'r' + r.uid + ':name'} value={r.name} placeholder="名稱"
                        onCommit={v => { edit(r.uid, x => { x.name = v; if (!x.initials) x.initials = M.initials(v); }); }} />
                        {extra.length > 0 && <div className="muted small sub-note">{extra.join(' · ')}</div>}</td>
                      <td><Field className="inp" value={r.initials} onCommit={v => { edit(r.uid, x => { x.initials = v; }); }} /></td>
                      <td><Field className="inp" value={r.role} placeholder="例如：開發人員" onCommit={v => { edit(r.uid, x => { x.role = v; }); }} /></td>
                      <td><select className="sel" value={r.kind} onChange={e => setKind(r, e.target.value as Resource['kind'])}>{M.RES_KINDS.map((k: string) => <option key={k} value={k}>{labelFor(k)}</option>)}</select></td>
                      <td><select className="sel" value={r.type} disabled={!work} onChange={e => { const v = e.target.value; edit(r.uid, x => { x.type = v; }); }}>
                        {M.RES_TYPES.map((t: string) => <option key={t} value={t}>{labelFor(t)}</option>)}</select></td>
                      <td>{work && <Field className="inp" type="number" min={1} max={1000} step={5} value={String(r.maxUnits)}
                        onCommit={v => { edit(r.uid, x => { x.maxUnits = Math.max(1, Math.round(+v || 100)); }); }} />}</td>
                      <td>{r.kind !== 'Cost' && <Field className="inp" type="number" min={0} step={100} value={String(r.rate)} title={work ? "每小時" : "每單位"}
                        onCommit={v => { edit(r.uid, x => { x.rate = Math.max(0, +v || 0); }); }} />}</td>
                      <td>{work && <select className="sel" value={r.reportsTo ?? ''} onChange={e => { const v = e.target.value; edit(r.uid, x => { x.reportsTo = v ? +v : null; }); }}>
                        <option value="">—</option>
                        {p.resources.filter(o => o.uid !== r.uid && o.kind === 'Work' && !reportsUnder(r.uid, o.uid)).map(o => <option key={o.uid} value={o.uid}>{o.name || "（未命名）"}</option>)}
                      </select>}</td>
                      <td className="num">{work ? U.num(s.work) + 'h' : r.kind === 'Material' ? U.num(s.qty) + ' ' + r.materialLabel : ''}</td>
                      <td className="num">{U.money(s.cost)}</td>
                      <td className="num">{work ? Math.round(s.peak) + '%' : ''}</td>
                      <td>{s.over ? <span className="chip bad"><Icon name="alert" />超額分配</span>
                        : (s.work || s.cost) ? <span className="chip good"><Icon name="check" />正常</span> : <span className="chip">未指派</span>}</td>
                      <td className="nowrap">
                        <button className="icon-btn" title="行事曆、費率與每次使用成本" aria-label="資源詳細資料" onClick={() => st.openDialog('resource', { uid: r.uid })}><Icon name="settings" /></button>
                        <button className="icon-btn" title="刪除資源" aria-label="刪除資源" onClick={() => remove(r)}><Icon name="trash" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr><td colSpan={8}>合計</td><td className="num">{U.num(st.s.totalWork)}h</td><td className="num">{U.money(st.s.totalCost, cur)}</td><td colSpan={3} /></tr></tfoot>
            </table>
          )}
      </div></div>
    </div>
  );
}

export function WorkloadView() {
  const st = useApp(), p = st.p, s = st.s;
  const people = p.resources.filter(r => r.kind === 'Work');
  const weeks: { dn: number; days: number[] }[] = [];
  const wkIndex: Record<number, number> = {};
  for (let d = 0; d < Math.ceil(s.duration); d++) {
    const dn = s.cal.date(d), wk = dn - ((U.weekday(dn) + 6) % 7);
    if (wkIndex[wk] == null) { wkIndex[wk] = weeks.length; weeks.push({ dn: wk, days: [] }); }
    weeks[wkIndex[wk]].days.push(d);
  }
  return (
    <div className="view">
      <div className="view-head"><h1>工作負荷</h1><span className="sub">每週每日的最高分配量。紅色代表超過可用量，已計入投入上限、工作日與休假。</span></div>
      <div className="toolbar">
        <div className="legend">
          <span><i className="l1" />低</span><span><i className="l3" />高</span>
          <span><i className="over" />超額分配</span><span><i className="hatch" />無法投入</span>
        </div>
        <span className="spacer" />
        <button className="btn" onClick={levelAll}><Icon name="balance" />平衡所有資源</button>
      </div>
      <div className="scroll">
        {!people.length || !s.duration
          ? <div className="card"><div className="empty"><h3>目前沒有工作負荷</h3><div>將人員指派給任務後，就能查看每個人的工作負荷。</div></div></div>
          : (
            <div className="card tbl" style={{ padding: 8 }}>
              <table className="heat">
                <thead><tr><th className="rh">資源</th><th>上限</th>{weeks.map(w => <th key={w.dn}>{U.fmt(w.dn).replace(/ \d+$/, '')}</th>)}</tr></thead>
                <tbody>
                  {people.map(r => {
                    const L = s.load[r.uid] || {}, stt = s.resStats[r.uid];
                    return (
                      <tr key={r.uid}>
                        <td className="rh"><b>{r.name || "（未命名）"}</b> <span className="muted small">{r.role || r.type}</span></td>
                        <td className="muted small">{r.maxUnits}%</td>
                        {weeks.map(w => {
                          let peak = 0, over = false, avail = 0;
                          const tasks = new Set<string>();
                          w.days.forEach(dd => {
                            const cap = stt.capOn(dd), l = L[dd] || 0;
                            if (cap > 0) avail++;
                            if (l > peak) peak = l;
                            if (l > cap + 1e-9) over = true;
                            (s.contrib[r.uid][dd] || []).forEach((i: number) => { const row = s.rows[i]; tasks.add(row.id + '. ' + row.task.name); });
                          });
                          const lvl = over ? 'over' : !peak ? (avail ? 'l0' : 'off') : peak <= 34 ? 'l1' : peak <= 67 ? 'l2' : 'l3';
                          const title = U.fmt(w.dn) + '：最高 ' + Math.round(peak) + '%（上限 ' + r.maxUnits + '%, ' + avail + ' 個可用工作日）' + (tasks.size ? '\n' + [...tasks].join('\n') : '');
                          return <td key={w.dn} className={lvl} title={title}>{peak ? Math.round(peak) + '%' + (over ? ' !' : '') : lvl === 'off' ? 'off' : '–'}</td>;
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </div>
  );
}
