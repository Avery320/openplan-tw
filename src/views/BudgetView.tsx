import { labelFor } from '../locale';
import type { ReactNode } from 'react';
import OP from '../core';
import { useApp } from '../store';
import Icon from '../components/Icon';
import type { Resource, Row } from '../types';

const U = OP.util, M = OP.model, C = OP.charts;

export function Kpi({ k, v, s }: { k: string; v: ReactNode; s?: ReactNode }) {
  return <div className="card kpi"><div className="k">{k}</div><div className="v">{v}</div><div className="s">{s}</div></div>;
}

function Health({ v }: { v: number | null }) {
  if (v == null) return null;
  if (v >= 1) return <span className="chip good"><Icon name="check" />符合或優於計畫</span>;
  return <span className={'chip ' + (v >= 0.9 ? 'warn' : 'bad')}><Icon name="alert" />{v >= 0.9 ? "略為落後" : 'Behind'}</span>;
}
const ratio = (v: number | null) => (v == null ? '—' : v.toFixed(2));

export default function BudgetView() {
  const st = useApp(), p = st.p, s = st.s, cur = p.currency, ev = s.ev;
  const budget = +p.budget || 0, cost = s.totalCost, diff = budget - cost, pct = budget ? cost / budget * 100 : 0;
  const monthly = C.monthlyCost(p, s);
  const tops = s.rows.filter((r: Row) => r.task.level === 1);
  const maxTop = Math.max(1, ...tops.map((r: Row) => r.cost));
  const maxRes = Math.max(1, ...p.resources.map(r => s.resStats[r.uid].cost));
  const actual = s.rows.reduce((a: number, r: Row) => a + (r.summary ? 0 : r.actualCost), 0);
  const fixed = s.rows.reduce((a: number, r: Row) => a + (+r.task.fixedCost || 0), 0);
  const groups: { label: string; list: Resource[] }[] = [
    ...M.RES_TYPES.map((t: string) => ({ label: labelFor(t), list: p.resources.filter(r => r.kind === 'Work' && r.type === t) })),
    { label: 'Materials', list: p.resources.filter(r => r.kind === 'Material') },
    { label: "成本資源", list: p.resources.filter(r => r.kind === 'Cost') }
  ].filter(g => g.list.length);

  return (
    <div className="view">
      <div className="view-head"><h1>成本與預算</h1><span className="sub">依工時、費率、使用次數、材料及各項成本計算。</span></div>
      <div className="toolbar"><button className="btn" onClick={() => st.openDialog('settings')}><Icon name="settings" />設定預算和狀態日期</button></div>
      <div className="scroll">
        <div className="kpis">
          <Kpi k="預算" v={budget ? U.money(budget, cur) : "尚未設定"} s={budget ? '' : <span className="muted">請在「專案資訊」中設定</span>} />
          <Kpi k="計畫成本" v={U.money(cost, cur)} s={budget ? <span className="muted">{U.num(pct)}的預算</span> : ''} />
          {budget
            ? <Kpi k={diff >= 0 ? 'Remaining' : "超過預算"} v={U.money(Math.abs(diff), cur)}
              s={diff >= 0 ? <span className="chip good"><Icon name="check" />在預算內</span> : <span className="chip bad"><Icon name="alert" />超過預算</span>} />
            : <Kpi k="剩餘預算" v="—" s={<span className="muted">尚未設定預算</span>} />}
          <Kpi k="工期" v={U.num(s.duration) + " 天"} s={<span className="muted">{U.fmt(s.startDn)} → {U.fmt(s.finishDn)}</span>} />
          <Kpi k="目前實際成本" v={U.money(actual, cur)} s={<span className="muted">依完成率估算</span>} />
        </div>

        {p.baseline ? <>
          <div className="section-h">實獲值 <span className="muted small">以狀態日期為準 {U.fmt(s.statusDn)}{p.statusDate ? '' : " （目前採今天，可在「專案資訊」設定）"}</span></div>
          <div className="kpis">
            <Kpi k="Planned value (BCWS)" v={U.money(ev.bcws, cur)} s={<span className="muted">BAC {U.money(ev.bac, cur)}</span>} />
            <Kpi k="Earned value (BCWP)" v={U.money(ev.bcwp, cur)} />
            <Kpi k="Actual cost (ACWP)" v={U.money(ev.acwp, cur)} />
            <Kpi k="Schedule index (SPI)" v={ratio(ev.spi)} s={<><Health v={ev.spi} /> <span className="muted small">SV {U.money(ev.sv)}</span></>} />
            <Kpi k="Cost index (CPI)" v={ratio(ev.cpi)} s={<><Health v={ev.cpi} /> <span className="muted small">CV {U.money(ev.cv)}</span></>} />
            <Kpi k="Estimate at completion" v={U.money(ev.eac, cur)} s={<span className="muted">VAC {U.money(ev.vac)}</span>} />
          </div>
        </> : (
          <div className="card note-card"><Icon name="info" /><div><b>實獲值</b> （SPI、CPI、EAC）以基準線為準。請先選擇 <b>專案 › 設定基準線</b>，再填寫任務完成率。</div></div>
        )}

        {monthly.length > 0 && (
          <div className="grid2">
            <div className="card"><h3>每月成本</h3><div className="card-sub">各月份預計支出</div>
              <div className="chart" dangerouslySetInnerHTML={{ __html: C.costChart({ p, data: monthly, kind: 'monthly' }) }} /></div>
            <div className="card"><h3>累計成本與預算比較</h3><div className="card-sub">虛線表示核定預算</div>
              <div className="chart" dangerouslySetInnerHTML={{ __html: C.costChart({ p, data: monthly, kind: 'cumulative' }) }} /></div>
          </div>
        )}

        <div className="grid2">
          <div className="card"><h3>各工作包的成本</h3><div className="card-sub">最上層的工作項目</div>
            <div className="tbl"><table className="data">
              <thead><tr><th>工作分解（WBS）</th><th>工作包</th><th className="num">工時（小時）</th><th className="num">成本</th>{p.baseline && <th className="num">基準線</th>}<th style={{ width: '28%' }} /></tr></thead>
              <tbody>{tops.map((r: Row) => (
                <tr key={r.task.uid}>
                  <td>{r.wbs}</td><td>{r.task.name}<div className="muted small">{U.fmt(r.startDn)} – {U.fmt(r.finishDn)}</div></td>
                  <td className="num">{U.num(r.work)}</td><td className="num">{U.money(r.cost)}</td>
                  {p.baseline && <td className="num">{r.base ? U.money(r.base.cost) : ''}</td>}
                  <td><div className="barcell"><div className="hbar-track"><div className="hbar" style={{ width: r.cost / maxTop * 100 + '%' }} /></div>
                    <span className="muted small">{cost ? Math.round(r.cost / cost * 100) : 0}%</span></div></td>
                </tr>
              ))}</tbody>
              <tfoot><tr><td colSpan={2}>合計</td><td className="num">{U.num(s.totalWork)}</td><td className="num">{U.money(cost, cur)}</td>{p.baseline && <td className="num">{U.money(ev.bac)}</td>}<td /></tr></tfoot>
            </table></div>
          </div>
          <div className="card"><h3>各資源的成本</h3><div className="card-sub">依類型分組</div>
            <div className="tbl"><table className="data">
              <thead><tr><th>名稱</th><th>種類</th><th className="num">費率</th><th className="num">工時／數量</th><th className="num">成本</th><th style={{ width: '24%' }} /></tr></thead>
              <tbody>
                {groups.map(g => {
                  const gc = g.list.reduce((a, r) => a + s.resStats[r.uid].cost, 0);
                  return [
                    ...g.list.map(r => {
                      const rs = s.resStats[r.uid];
                      return (
                        <tr key={r.uid}>
                          <td>{r.name}</td><td className="muted">{labelFor(r.kind === 'Work' ? r.type : r.kind)}</td><td className="num">{r.kind === 'Cost' ? '' : U.money(r.rate)}</td>
                          <td className="num">{r.kind === 'Work' ? U.num(rs.work) + 'h' : r.kind === 'Material' ? U.num(rs.qty) : ''}</td><td className="num">{U.money(rs.cost)}</td>
                          <td><div className="hbar-track"><div className="hbar" style={{ width: rs.cost / maxRes * 100 + '%' }} /></div></td>
                        </tr>
                      );
                    }),
                    <tr key={'g' + g.label}><td colSpan={4} className="muted small"><b>{g.label} 小計</b></td><td className="num"><b>{U.money(gc)}</b></td><td /></tr>
                  ];
                })}
                {fixed > 0 && <tr><td colSpan={4} className="muted small"><b>任務固定成本</b></td><td className="num"><b>{U.money(fixed)}</b></td><td /></tr>}
              </tbody>
              <tfoot><tr><td colSpan={4}>合計</td><td className="num">{U.money(cost, cur)}</td><td /></tr></tfoot>
            </table></div>
          </div>
        </div>
      </div>
    </div>
  );
}
