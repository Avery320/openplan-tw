import { labelFor } from '../locale';
import { useEffect, useState, type ReactNode } from 'react';
import OP from '../core';
import { useApp, type Store } from '../store';
import { runAction } from '../lib/actions';
import Icon from '../components/Icon';
import { Kpi } from './BudgetView';
import type { Row } from '../types';

const U = OP.util, M = OP.model;

export const REPORTS: [string, string][] = [
  ['overview', "專案總覽"], ['critical', "關鍵任務"], ['milestones', "里程碑"], ['late', "延誤與進度落後的任務"],
  ['cost', "成本總覽"], ['resources', "資源總覽"], ['who', "任務分工"], ['ev', "實獲值"],
  ['variance', "基準線差異"], ['tasks', "任務清單"]
];

type Head = [string, boolean?];

function Table({ head, rows, foot }: { head: Head[]; rows: ReactNode[][]; foot?: ReactNode[] }) {
  if (!rows.length) return <p className="muted">目前沒有可供統計的資料。</p>;
  const cls = (i: number) => (head[i][1] ? 'num' : undefined);
  return (
    <table className="data rpt">
      <thead><tr>{head.map((h, i) => <th key={i} className={cls(i)}>{h[0]}</th>)}</tr></thead>
      <tbody>{rows.map((r, k) => <tr key={k}>{r.map((c, i) => <td key={i} className={cls(i)}>{c}</td>)}</tr>)}</tbody>
      {foot && <tfoot><tr>{foot.map((c, i) => <td key={i} className={cls(i)}>{c}</td>)}</tr></tfoot>}
    </table>
  );
}

const d = (dn: number | null) => (dn == null ? '' : U.fmt(dn));
const sd = (v: number | null) => (v == null ? '' : (v > 0 ? '+' : '') + U.num(v) + 'd');
const NeedBaseline = () => <div className="card note-card"><Icon name="info" /><div>這份報表會與基準線比較。請先選擇<b>專案 › 設定基準線</b>。</div></div>;

const build: Record<string, (st: Store) => ReactNode> = {
  overview: st => {
    const s = st.s, p = st.p, ls = s.rows.filter((r: Row) => !r.summary);
    let tot = 0, dn = 0;
    ls.forEach((r: Row) => { tot += r.duration; dn += r.duration * r.percent / 100; });
    const money = (v: number) => U.money(v, p.currency);
    return <>
      <div className="kpis">
        <Kpi k="開始" v={d(s.startDn)} />
        <Kpi k="完成" v={d(s.finishDn)} s={U.num(s.duration) + " 個工作日"} />
        <Kpi k="完成率" v={(tot ? Math.round(dn / tot * 100) : 0) + '%'} />
        <Kpi k="成本" v={money(s.totalCost)} s={p.budget ? "預算 " + money(p.budget) : ''} />
        <Kpi k="任務" v={ls.filter((r: Row) => !r.milestone).length} s={ls.filter((r: Row) => r.critical && !r.milestone).length + ' 項位於關鍵路徑'} />
        <Kpi k="待處理" v={ls.filter((r: Row) => r.late || r.missedDeadline || r.conflict).length + s.rows.filter((r: Row) => r.over).length} s="late, deadline, conflict or overallocated" />
      </div>
      <h3>專案資訊</h3>
      <Table head={[['Field'], ['Value']]} rows={[
        ["組織", p.organization], ["專案經理", p.manager], ["狀態", p.status], ["發布日期", d(U.parseDate(p.issueDate))],
        ["狀態日期", p.statusDate ? d(U.parseDate(p.statusDate)) : "尚未設定，暫以今天為準"],
        ["基準線", p.baseline ? "儲存於 " + U.fmt(U.parseDate(p.baseline.savedAt.slice(0, 10))) : "尚未設定"]
      ]} />
      <h3>工作包</h3>
      <Table head={[["工作分解（WBS）"], ["名稱"], ["開始"], ["完成"], ["完成率", true], ['成本', true]]}
        rows={s.rows.filter((r: Row) => r.task.level === 1).map((r: Row) => [r.wbs, r.task.name, d(r.startDn), d(r.finishDn), r.percent + '%', U.money(r.cost)])} />
      <h3>即將到來的里程碑</h3>
      <Table head={[['ID'], ["里程碑"], ['Date'], ["期限"]]}
        rows={ls.filter((r: Row) => r.milestone && r.percent < 100).slice(0, 8).map((r: Row) => [r.id, r.task.name, d(r.startDn),
          r.task.deadline ? <>{d(U.parseDate(r.task.deadline))} {r.missedDeadline && <span className="chip bad">逾期</span>}</> : ''])} />
    </>;
  },
  critical: st => <>
    <p className="muted">總浮時為零或負數的任務，延誤時會影響專案完工日。</p>
    <Table head={[['ID'], ["任務"], ["開始"], ["完成"], ["工期", true], ['Slack', true], ["資源"], ["前置任務"]]}
      rows={st.s.rows.filter((r: Row) => !r.summary && r.critical).map((r: Row) => [r.id, r.task.name, d(r.startDn), d(r.finishDn), M.fmtDuration(r.duration), U.num(r.slack) + 'd', r.names, M.formatPreds(st.p, r.task)])} />
  </>,
  milestones: st => (
    <Table head={[['ID'], ["工作分解（WBS）"], ["里程碑"], ['Date'], ["基準線"], ['Variance', true], ["期限"], ["狀態"]]}
      rows={st.s.rows.filter((r: Row) => !r.summary && r.milestone).map((r: Row) => [r.id, r.wbs, r.task.name, d(r.startDn), r.base ? d(r.base.finishDn) : '', r.base ? sd(r.finishVar) : '',
        r.task.deadline ? d(U.parseDate(r.task.deadline)) : '',
        r.percent >= 100 ? <span className="chip good">已完成</span> : r.missedDeadline ? <span className="chip bad">已逾期</span> : r.late ? <span className="chip warn">延誤</span> : ''])} />
  ),
  late: st => <>
    <p className="muted">狀態日期 {d(st.s.statusDn)}。進度落後表示截至狀態日期的完成率低於計畫。</p>
    <Table head={[['ID'], ["任務"], ["完成"], ["完成率", true], ["完成日期差異", true], ['Problem']]}
      rows={st.s.rows.filter((r: Row) => !r.summary && (r.late || r.slipped || r.missedDeadline || r.conflict)).map((r: Row) => {
        const why: string[] = [];
        if (r.late) why.push("進度落後");
        if (r.slipped) why.push('較基準線延後 ' + sd(r.finishVar) + '');
        if (r.missedDeadline) why.push("超過期限");
        if (r.conflict) why.push("限制條件衝突");
        return [r.id, r.task.name, d(r.finishDn), r.percent + '%', r.base ? sd(r.finishVar) : '', why.join('; ')];
      })} />
  </>,
  cost: st => (
    <Table head={[["工作分解（WBS）"], ["任務"], ["固定成本", true], ["總成本", true], ["基準線", true], ['Variance', true], ['Actual', true], ['Remaining', true]]}
      rows={st.s.rows.filter((r: Row) => r.task.level <= 2).map((r: Row) => [r.wbs, r.task.level > 1 ? <span style={{ paddingLeft: 18 }}>{r.task.name}</span> : <b>{r.task.name}</b>,
        U.money(r.task.fixedCost || 0), U.money(r.cost), r.base ? U.money(r.base.cost) : '', r.base ? U.money(r.costVar) : '', U.money(r.actualCost), U.money(r.cost - r.actualCost)])}
      foot={['', "合計", '', U.money(st.s.totalCost, st.p.currency), st.p.baseline ? U.money(st.s.ev.bac, st.p.currency) : '', '', '', '']} />
  ),
  resources: st => (
    <Table head={[["資源"], ["種類"], ["上限"], ["工時／數量", true], ['成本', true], ["尖峰", true], ["狀態"]]}
      rows={st.p.resources.map(r => {
        const x = st.s.resStats[r.uid];
        return [<>{r.name}<div className="muted small">{r.role}</div></>, r.kind === 'Work' ? r.type : r.kind, r.kind === 'Work' ? r.maxUnits + '%' : '',
          r.kind === 'Work' ? U.num(x.work) + 'h' : r.kind === 'Material' ? U.num(x.qty) + ' ' + r.materialLabel : '', U.money(x.cost), r.kind === 'Work' ? Math.round(x.peak) + '%' : '',
          x.over ? <span className="chip bad">超額分配（{x.overDays.length} 天）</span> : x.work || x.cost ? <span className="chip good">正常</span> : <span className="chip">未指派</span>];
      })}
      foot={["合計", '', '', U.num(st.s.totalWork) + 'h', U.money(st.s.totalCost, st.p.currency), '', '']} />
  ),
  who: st => st.p.resources.length ? <>{st.p.resources.map(r => {
    const list = st.s.rows.filter((row: Row) => !row.summary && row.task.assignments.some((a: any) => a.res === r.uid));
    return <div key={r.uid}>
      <h3>{r.name || "（未命名）"} <span className="muted small">{r.role || labelFor(r.kind)}</span></h3>
      <Table head={[['ID'], ["任務"], ["開始"], ["完成"], ['Units', true], ['Work', true]]} rows={list.map((row: Row) => {
        const a = row.task.assignments.find(x => x.res === r.uid)!;
        return [row.id, row.task.name, d(row.startDn), d(row.finishDn), r.kind === 'Work' ? a.units + '%' : U.num(a.units),
          r.kind === 'Work' ? U.num(a.units / 100 * st.p.hoursPerDay * row.duration) + 'h' : ''];
      })} />
    </div>;
  })}</> : <p className="muted">目前沒有資源。</p>,
  ev: st => {
    if (!st.p.baseline) return <NeedBaseline />;
    const s = st.s, ev = s.ev, money = (v: number) => U.money(v, st.p.currency), rt = (v: number | null) => (v == null ? '—' : v.toFixed(2));
    return <>
      <div className="kpis">
        <Kpi k="BAC" v={money(ev.bac)} /><Kpi k="SPI" v={rt(ev.spi)} s={'SV ' + U.money(ev.sv)} />
        <Kpi k="CPI" v={rt(ev.cpi)} s={'CV ' + U.money(ev.cv)} /><Kpi k="EAC" v={money(ev.eac)} s={'VAC ' + U.money(ev.vac)} />
      </div>
      <p className="muted">狀態日期 {d(s.statusDn)}。BCWS 是計畫價值，BCWP 是實獲值（基準成本 × 完成率），ACWP 則以計畫成本乘以完成率估算。SPI 或 CPI 低於 1.00，分別表示進度落後或成本超支。</p>
      <Table head={[["工作分解（WBS）"], ["工作包"], ['BCWS', true], ['BCWP', true], ['ACWP', true], ['SV', true], ['CV', true], ['SPI', true], ['CPI', true]]}
        rows={s.rows.filter((r: Row) => r.task.level === 1).map((r: Row) => [r.wbs, r.task.name, U.money(r.bcws), U.money(r.bcwp), U.money(r.acwp), U.money(r.bcwp - r.bcws), U.money(r.bcwp - r.acwp),
          r.bcws ? (r.bcwp / r.bcws).toFixed(2) : '—', r.acwp ? (r.bcwp / r.acwp).toFixed(2) : '—'])}
        foot={['', "專案", U.money(ev.bcws), U.money(ev.bcwp), U.money(ev.acwp), U.money(ev.sv), U.money(ev.cv), rt(ev.spi), rt(ev.cpi)]} />
    </>;
  },
  variance: st => {
    if (!st.p.baseline) return <NeedBaseline />;
    return <Table head={[['ID'], ["任務"], ["開始"], ["基準開始日期"], ["開始日期差異", true], ["完成"], ["基準完成日期"], ["完成日期差異", true], ["成本差異", true]]}
      rows={st.s.rows.filter((r: Row) => r.base).map((r: Row) => [r.id, r.summary ? <b>{r.task.name}</b> : r.task.name, d(r.startDn), d(r.base!.startDn), sd(r.startVar),
        d(r.finishDn), d(r.base!.finishDn), sd(r.finishVar), U.money(r.costVar)])} />;
  },
  tasks: st => (
    <Table head={[['ID'], ["工作分解（WBS）"], ["任務"], ["工期", true], ["開始"], ["完成"], ["前置任務"], ["資源"], ['成本', true]]}
      rows={st.s.rows.map((r: Row) => [r.id, r.wbs, <span style={{ paddingLeft: (r.task.level - 1) * 18 }}>{r.summary ? <b>{r.task.name}</b> : r.task.name}</span>,
        M.fmtDuration(r.duration), d(r.startDn), d(r.finishDn), M.formatPreds(st.p, r.task), r.names, U.money(r.cost)])}
      foot={['', '', "合計", M.fmtDuration(st.s.duration), d(st.s.startDn), d(st.s.finishDn), '', '', U.money(st.s.totalCost, st.p.currency)]} />
  )
};

export default function ReportsView() {
  const st = useApp();
  const [printAll, setPrintAll] = useState(false);
  useEffect(() => {
    if (!printAll) return;
    window.print();
    setPrintAll(false);
  }, [printAll]);
  const id = build[st.report] ? st.report : 'overview';
  const page = ([k, title]: [string, string]) => (
    <article className="paper" key={k} id={printAll ? undefined : 'report'}>
      <header className="rpt-head">
        <div><div className="muted small">{st.p.name}{st.p.organization ? ' · ' + st.p.organization : ''}</div><h2>{title}</h2></div>
        <div className="muted small">產生於 {U.fmtLong(U.todayDn())}</div>
      </header>
      {build[k](st)}
    </article>
  );
  return (
    <div className="view"><div className="reports">
      <nav className="rpt-nav" aria-label="報表">
        {REPORTS.map(([k, label]) => <button key={k} className={k === id ? 'active' : ''} onClick={() => st.setUI({ report: k })}>{label}</button>)}
      </nav>
      <div className="rpt-body">
        <div className="toolbar rpt-tools"><span className="spacer" />
          <button className="btn" onClick={() => setPrintAll(true)}><Icon name="report" />列印所有報表</button>
          <button className="btn" onClick={() => runAction('print')}><Icon name="printer" />列印／另存為 PDF</button>
        </div>
        {printAll ? <div className="rpt-all">{REPORTS.map(page)}</div> : page(REPORTS.find(r => r[0] === id)!)}
      </div>
    </div></div>
  );
}
