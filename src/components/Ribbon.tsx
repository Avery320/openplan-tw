import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import OP from '../core';
import { useStore, S, focusKey, DEFAULT_COLS, type Store } from '../store';
import { COL_GROUPS, COLS, gridItems, menuData, toggleCol } from '../lib/grid';
import { hasImage, runAction } from '../lib/actions';
import * as ops from '../lib/taskOps';
import { scrollToSelected } from '../views/GanttView';
import Icon from './Icon';
import type { ViewName } from '../types';

const U = OP.util;
const TABS: [string, string, string][] = [['task', "任務", 'gantt'], ['resource', "資源", 'users'], ['report', "報表", 'report'], ['project', "專案", 'target'], ['view', "檢視", 'layers'], ['format', '格式', 'sparkle']];

/* ---------- building blocks ---------- */

type BtnProps = { icon: string; label: ReactNode; title?: string; onClick: () => void; disabled?: boolean; on?: boolean; accent?: boolean };

function Big({ icon, label, title, onClick, disabled, on, accent }: BtnProps) {
  return (
    <button className={'rb big' + (on ? ' on' : '') + (accent ? ' accent' : '')} disabled={disabled} title={title} onClick={onClick}>
      <Icon name={icon} /><span>{label}</span>
    </button>
  );
}
function Small({ icon, label, title, onClick, disabled, on }: BtnProps) {
  return (
    <button className={'rb small' + (on ? ' on' : '')} disabled={disabled} title={title || String(label)} onClick={onClick}>
      <Icon name={icon} /><span>{label}</span>
    </button>
  );
}
function Ico({ icon, title, onClick, disabled }: { icon: string; title: string; onClick: () => void; disabled?: boolean }) {
  return <button className="rb ico" title={title} aria-label={title} disabled={disabled} onClick={onClick}><Icon name={icon} /></button>;
}
const Group = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="rgroup"><div className="rg-body">{children}</div><div className="rg-label">{label}</div></div>
);
const Stack = ({ children }: { children: ReactNode }) => <div className="rstack">{children}</div>;
const RowBox = ({ children }: { children: ReactNode }) => <div className="rrow">{children}</div>;

// Arrow keys move between the menu's buttons and checkboxes.
function menuKeys(e: React.KeyboardEvent<HTMLDivElement>) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input')];
  const i = items.indexOf(document.activeElement as HTMLElement);
  e.preventDefault();
  items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
}

function DropBig({ id, icon, label, children, st }: { id: string; icon: string; label: ReactNode; children: ReactNode; st: Store }) {
  const open = st.menu === id;
  const wrap = useRef<HTMLDivElement>(null), menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const w = wrap.current, m = menu.current;
    if (!open || !w || !m) return;
    const r = w.getBoundingClientRect();
    m.style.position = 'fixed';
    m.style.top = r.bottom + 'px';
    m.style.left = Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8)) + 'px';
    // The position is measured once, so close the menu when its button moves.
    const close = () => S().setUI({ menu: null }), ribbon = w.closest('.ribbon');
    addEventListener('resize', close);
    ribbon?.addEventListener('scroll', close);
    return () => { removeEventListener('resize', close); ribbon?.removeEventListener('scroll', close); };
  }, [open]);
  return (
    <div className="menu-wrap" ref={wrap}>
      <button className="rb big drop" aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={() => st.setUI({ menu: open ? null : id })}><Icon name={icon} /><span>{label} ▾</span></button>
      <div id={id} ref={menu} role="menu" className={'menu left' + (open ? ' open' : '')} onKeyDown={menuKeys}>{children}</div>
    </div>
  );
}
function MenuItem({ icon, label, onClick, disabled }: { icon: string; label: string; onClick: () => void; disabled?: boolean }) {
  return <button role="menuitem" disabled={disabled} onClick={() => { S().setUI({ menu: null }); onClick(); }}><Icon name={icon} />{label}</button>;
}

function Check({ label, checked, onChange, disabled, title }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; title?: string }) {
  return (
    <label className={'rcheck' + (disabled ? ' off' : '')} title={title}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />{label}
    </label>
  );
}
function SelectRow({ label, value, map, onChange }: { label: string; value: string; map: Record<string, string>; onChange: (v: string) => void }) {
  return (
    <label className="rselect"><span>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}>
        {Object.entries(map).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </label>
  );
}

/* ---------- commands ---------- */

// Commands that edit the task list switch to the Gantt Chart first.
function inGantt(fn: () => void) { return () => { if (S().view !== 'gantt') S().setView('gantt'); fn(); }; }

function setAllCollapsed(collapse: boolean) {
  const st = S();
  if (!collapse) { st.setUI({ collapsed: {} }); return; }
  const collapsed: Record<string, boolean> = Object.fromEntries(st.s.rows.filter(r => r.summary).map(r => [r.task.uid, true]));
  gridItems({ ...st, collapsed: {} }).forEach(it => { if ('group' in it) collapsed[it.key] = true; });
  st.setUI({ collapsed });
}

function assignResources() {
  const st = S();
  if (st.sel.length !== 1) { st.toast("請先選取一項任務，再點「指派資源」。"); return; }
  if (!['gantt', 'network', 'wbs'].includes(st.view)) st.setView('gantt');
  st.setUI({ drawer: true });
  focusKey('d:addres', false);
}

function nextOverallocation() {
  const st = S();
  let first: any = null;
  st.s.rows.forEach((r: any) => { if (r.over && (!first || r.startDn < first.startDn)) first = r; });
  if (!first) { st.toast("目前沒有資源超額分配的任務。"); return; }
  st.setView('gantt');
  st.select([first.task.uid], first.task.uid);
  requestAnimationFrame(scrollToSelected);
  st.toast('任務 ' + first.id + ' 的資源超出可用量');
}

function ColumnsMenu({ st }: { st: Store }) {
  const set = (k: string, on: boolean) => st.setUI({ cols: toggleCol(st.cols, k, on) });
  return (
    <div className="cols-list">
      {COL_GROUPS.map(([label, keys]) => (
        <div key={label}>
          <div className="label">{label}</div>
          <div className="col-grid">
            {keys.map(k => <label key={k} className="chk"><input type="checkbox" checked={st.cols.includes(k)} onChange={e => set(k, e.target.checked)} />{COLS[k].t}</label>)}
          </div>
        </div>
      ))}
      {st.p.customFields.length > 0 && <>
        <div className="label">自訂欄位</div>
        <div className="col-grid">
          {st.p.customFields.map(f => <label key={f.id} className="chk"><input type="checkbox" checked={st.cols.includes('cf:' + f.id)} onChange={e => set('cf:' + f.id, e.target.checked)} />{f.name}</label>)}
        </div>
      </>}
      <hr />
      <MenuItem icon="undo" label="還原預設欄位" onClick={() => st.setUI({ cols: DEFAULT_COLS.slice() })} />
    </div>
  );
}

/* ---------- tabs ---------- */

function TaskTab({ st }: { st: Store }) {
  const noSel = !st.sel.length;
  const viewBtn = (v: ViewName, icon: string, label: ReactNode) => <Big icon={icon} label={label} on={st.view === v} onClick={() => st.setView(v)} />;
  return <>
    <Group label="檢視">{viewBtn('gantt', 'gantt', '甘特圖')}</Group>
    <Group label="排程">
      <Stack>
        <RowBox>{[0, 25, 50, 75, 100].map(v => <button key={v} className="rb pct" disabled={noSel} title={'將完成率設為 ' + v + '%'} onClick={() => ops.markPercent(v)}>{v}%</button>)}</RowBox>
        <RowBox>
          <Ico icon="outdent" title="減少任務縮排（Alt+Shift+←）" disabled={noSel} onClick={inGantt(() => ops.indent(-1))} />
          <Ico icon="indent" title="增加任務縮排（Alt+Shift+→）" disabled={noSel} onClick={inGantt(() => ops.indent(1))} />
          <Ico icon="link" title="連結選取的任務" disabled={st.sel.length < 2} onClick={ops.linkSelected} />
          <Ico icon="unlink" title="取消任務連結" disabled={noSel} onClick={ops.unlinkSelected} />
        </RowBox>
        <RowBox><Small icon="check" label="更新為如期進行" onClick={ops.updateAsScheduled} /></RowBox>
      </Stack>
    </Group>
    <Group label="任務">
      <Stack>
        <Small icon="up" label="往上移" disabled={noSel} onClick={inGantt(() => ops.move(-1))} />
        <Small icon="down" label="往下移" disabled={noSel} onClick={inGantt(() => ops.move(1))} />
        <Small icon="trash" label="刪除" disabled={noSel} onClick={ops.deleteSelected} />
      </Stack>
    </Group>
    <Group label="插入">
      <Big icon="plus" label="任務" accent onClick={() => ops.addTask(false)} />
      <Stack>
        <Small icon="diamond" label="里程碑" onClick={() => ops.addTask(true)} />
        <Small icon="repeat" label="週期性任務…" onClick={() => st.openDialog('recurring')} />
        <Small icon="layers" label="子專案…" onClick={() => runAction('insert')} />
      </Stack>
    </Group>
    <Group label="內容">
      <Big icon="panel" label="資訊" on={st.drawer} onClick={() => st.setUI({ drawer: !st.drawer })} />
      <Stack>
        <Small icon="users" label="指派資源" disabled={st.sel.length !== 1} onClick={assignResources} />
        <Small icon="target" label="跳至選取的任務" onClick={inGantt(() => requestAnimationFrame(scrollToSelected))} />
      </Stack>
    </Group>
    <Group label="編輯">
      <Stack>
        <Small icon="undo" label="復原" disabled={!st.undo.length} onClick={st.undoAct} />
        <Small icon="redo" label="重做" disabled={!st.redo.length} onClick={st.redoAct} />
      </Stack>
    </Group>
  </>;
}

function ResourceTab({ st }: { st: Store }) {
  return <>
    <Group label="檢視">
      <Big icon="users" label={'資源清單'} on={st.view === 'resources'} onClick={() => st.setView('resources')} />
      <Stack>
        <Small icon="org" label="組織圖" on={st.view === 'org'} onClick={() => st.setView('org')} />
        <Small icon="grid" label="資源使用狀況" on={st.view === 'workload'} onClick={() => st.setView('workload')} />
      </Stack>
    </Group>
    <Group label="指派"><Big icon="users" label={<>指派<br />資源</>} disabled={st.sel.length !== 1} onClick={assignResources} /></Group>
    <Group label="插入"><Big icon="plus" label={<>新增<br />資源</>} accent onClick={ops.addResource} /></Group>
    <Group label="資源平衡">
      <Big icon="balance" label={'平衡所有資源'} onClick={ops.levelAll} />
      <Stack>
        <Small icon="x" label="清除資源平衡調整" onClick={ops.clearLeveling} />
        <Small icon="grid" label="下一筆超額分配" onClick={nextOverallocation} />
      </Stack>
    </Group>
  </>;
}

function ReportTab({ st }: { st: Store }) {
  const rpt = (icon: string, label: ReactNode, id: string) => (
    <Big icon={icon} label={label} on={st.view === 'reports' && st.report === id} onClick={() => { st.setUI({ report: id }); st.setView('reports'); }} />
  );
  const more: [string, string][] = [['critical', "關鍵任務"], ['milestones', "里程碑"], ['who', "任務分工"], ['variance', "基準線差異"], ['tasks', "任務清單"]];
  return <>
    <Group label="檢視報表">
      {rpt('report', '專案總覽', 'overview')}{rpt('users', "資源", 'resources')}{rpt('wallet', '成本', 'cost')}
      {rpt('clock', '進度追蹤', 'late')}{rpt('balance', '實獲值', 'ev')}
      <DropBig id="rbMoreReports" icon="table" label={'更多報表'} st={st}>
        {more.map(([id, label]) => <MenuItem key={id} icon="report" label={label} onClick={() => { st.setUI({ report: id }); st.setView('reports'); }} />)}
      </DropBig>
    </Group>
    <Group label="預算"><Big icon="wallet" label={'成本與預算'} on={st.view === 'budget'} onClick={() => st.setView('budget')} /></Group>
    <Group label="匯出">
      <Big icon="printer" label="列印" onClick={() => runAction('print')} />
      <Stack>
        <Small icon="image" label="圖片（PNG）" disabled={!hasImage(st)} onClick={() => runAction('png')} />
        <Small icon="table" label="Excel（.xlsx）" onClick={() => runAction('xlsx')} />
        <Small icon="table" label="CSV" onClick={() => runAction('csv')} />
      </Stack>
    </Group>
  </>;
}

function ProjectTab({ st }: { st: Store }) {
  const hasBase = !!st.p.baseline;
  return <>
    <Group label="插入"><Big icon="layers" label="子專案" onClick={() => runAction('insert')} /></Group>
    <Group label="內容">
      <Big icon="info" label={<>專案<br />資訊</>} onClick={() => st.openDialog('settings')} />
      <Stack>
        <Small icon="columns" label="自訂欄位" onClick={() => st.openDialog('settings')} />
        <Small icon="tree" label="工作分解圖" on={st.view === 'wbs'} onClick={() => st.setView('wbs')} />
        <Small icon="network" label="網路圖" on={st.view === 'network'} onClick={() => st.setView('network')} />
      </Stack>
    </Group>
    <Group label="排程">
      <DropBig id="rbBaseline" icon="layers" label={'設定基準線'} st={st}>
        <MenuItem icon="layers" label={hasBase ? "更新基準線" : "設定基準線"} onClick={ops.setBaseline} />
        <MenuItem icon="x" label="清除基準線" disabled={!hasBase} onClick={ops.clearBaseline} />
      </DropBig>
      <Stack>
        <Small icon="clock" label={"狀態日期： " + (st.p.statusDate ? U.fmt(U.parseDate(st.p.statusDate)) : '尚未設定')} onClick={() => st.openDialog('settings')} />
        <Small icon="check" label="更新專案進度" onClick={ops.updateAsScheduled} />
        <Small icon="balance" label="平衡資源" onClick={ops.levelAll} />
      </Stack>
    </Group>
    <Group label="狀態">
      <div className="rinfo">
        <div><span>開始</span><b>{U.fmt(st.s.startDn)}</b></div>
        <div><span>完成</span><b>{U.fmt(st.s.finishDn)}</b></div>
        <div><span>成本</span><b>{U.money(st.s.totalCost, st.p.currency)}</b></div>
      </div>
    </Group>
  </>;
}

function ViewTab({ st }: { st: Store }) {
  const md = menuData(st);
  const vb = (v: ViewName, icon: string, label: ReactNode) => <Big icon={icon} label={label} on={st.view === v} onClick={() => st.setView(v)} />;
  const vs = (v: ViewName, icon: string, label: string) => <Small icon={icon} label={label} on={st.view === v} onClick={() => st.setView(v)} />;
  return <>
    <Group label="任務檢視">{vb('gantt', 'gantt', '甘特圖')}{vb('board', 'columns', <>任務<br />看板</>)}{vb('network', 'network', '網路圖')}{vb('wbs', 'tree', '工作分解圖')}</Group>
    <Group label="資源檢視"><Stack>{vs('resources', 'users', "資源清單")}{vs('org', 'org', "組織圖")}{vs('workload', 'grid', "資源使用狀況")}</Stack></Group>
    <Group label="資料">
      <Stack>
        <SelectRow label="排序" value={st.sort} map={md.sorts} onChange={v => st.setUI({ sort: v })} />
        <SelectRow label="篩選" value={md.filters[st.filter] ? st.filter : 'all'} map={md.filters} onChange={v => st.setUI({ filter: v })} />
        <SelectRow label="群組" value={md.groups[st.group] ? st.group : 'none'} map={md.groups} onChange={v => st.setUI({ group: v })} />
      </Stack>
      <DropBig id="colMenu" icon="columns" label="表格" st={st}><ColumnsMenu st={st} /></DropBig>
    </Group>
    <Group label="大綱">
      <Stack>
        <Small icon="chevD" label="全部展開" title="顯示所有子任務" onClick={inGantt(() => setAllCollapsed(false))} />
        <Small icon="chevR" label="全部收合" title="只顯示最上層的任務" onClick={inGantt(() => setAllCollapsed(true))} />
      </Stack>
    </Group>
    <Group label="縮放">
      <Stack>
        <SelectRow label="時間刻度" value={st.zoom} map={{ day: "天", week: "週", month: "月", quarter: "季" }} onChange={v => st.setUI({ zoom: v })} />
        <Small icon="target" label="選取的任務" onClick={inGantt(() => requestAnimationFrame(scrollToSelected))} />
      </Stack>
    </Group>
    <Group label="分割檢視">
      <Stack>
        <Check label="時程軸" checked={st.timeline} onChange={v => st.setUI({ timeline: v })} />
        <Check label="詳細資料" checked={st.drawer} onChange={v => st.setUI({ drawer: v })} />
      </Stack>
    </Group>
    <Group label="視窗"><Big icon={st.theme === 'dark' ? 'sun' : 'moon'} label={'深色模式'} on={st.theme === 'dark'} onClick={() => st.setUI({ theme: st.theme === 'dark' ? 'light' : 'dark' })} /></Group>
  </>;
}

function FormatTab({ st }: { st: Store }) {
  const hasBase = !!st.p.baseline;
  return <>
    <Group label="欄位"><DropBig id="colMenu" icon="columns" label={<>插入<br />欄位</>} st={st}><ColumnsMenu st={st} /></DropBig></Group>
    <Group label="時程條樣式">
      <Stack>
        <Check label="關鍵任務" checked={st.critical} onChange={v => st.setUI({ critical: v })} />
        <Check label="基準線" checked={st.showBaseline && hasBase} disabled={!hasBase} title={hasBase ? '' : "請先設定基準線（專案 › 設定基準線）"} onChange={v => st.setUI({ showBaseline: v })} />
        <Check label="時程軸" checked={st.timeline} onChange={v => st.setUI({ timeline: v })} />
      </Stack>
    </Group>
    <Group label="日期">
      <Stack>
        <Check label="顯示四位數年份" title="以 2026/1/12 顯示完整年份" checked={st.fullYear} onChange={v => st.setUI({ fullYear: v })} />
      </Stack>
    </Group>
    <Group label="甘特圖樣式">
      <div className="swatches">
        {['teal', 'indigo', 'amber', 'slate'].map(c => (
          <button key={c} className={'swatch sw-' + c + (st.bars === c ? ' on' : '')} title={c + '時程條'} onClick={() => st.setUI({ bars: c })}><i /><i /></button>
        ))}
      </div>
    </Group>
    <Group label="顯示／隱藏">
      <Stack>
        <Check label="大綱編號" checked={st.cols.includes('wbs')} onChange={v => st.setUI({ cols: toggleCol(st.cols, 'wbs', v) })} />
      </Stack>
    </Group>
  </>;
}

export default function Ribbon() {
  const st = useStore();
  const tools = st.view === 'gantt';
  const tab = st.tab === 'format' && !tools ? 'task' : st.tab;
  const Body = { task: TaskTab, resource: ResourceTab, report: ReportTab, project: ProjectTab, view: ViewTab, format: FormatTab }[tab] || TaskTab;
  const [peek, setPeek] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!st.ribbonMin) setPeek(false); }, [st.ribbonMin]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'F1') { e.preventDefault(); S().setUI({ ribbonMin: !S().ribbonMin }); }
      else if (e.key === 'Escape') setPeek(false);
    };
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setPeek(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onDown); };
  }, []);
  const onTab = (k: string) => {
    if (st.ribbonMin) setPeek(!(peek && tab === k));
    st.setUI({ tab: k });
  };
  const onCommand = (e: React.MouseEvent) => {
    const b = (e.target as Element).closest('button');
    if (peek && b && !b.classList.contains('drop')) setPeek(false);
  };
  return <div className="ribbon-wrap" ref={wrap}>
    <nav className="ribbon-tabs" aria-label="工具列">
      <button className="rtab file" onClick={() => st.setUI({ backstage: true, bsPage: 'info', menu: null })}><Icon name="menu" />檔案</button>
      {TABS.filter(([k]) => k !== 'format' || tools).map(([k, label, icon]) => (
        <button key={k} aria-pressed={tab === k} className={'rtab' + (tab === k ? ' on' : '')}
          onClick={() => onTab(k)} onDoubleClick={() => st.setUI({ ribbonMin: !st.ribbonMin })}><Icon name={icon} />{label}</button>
      ))}
      <span className="rtab-fill" />
      <button className="rb-collapse" title={(st.ribbonMin ? 'Show' : 'Hide') + '工具列（Ctrl+F1）'} onClick={() => st.setUI({ ribbonMin: !st.ribbonMin })}>
        <Icon name={st.ribbonMin ? 'chevD' : 'up'} />{st.ribbonMin ? "顯示工具列" : "隱藏工具列"}
      </button>
    </nav>
    <div className={'ribbon' + (st.ribbonMin ? ' min' : '') + (peek ? ' peek' : '')} onClick={onCommand}><Body st={st} /></div>
  </div>;
}
