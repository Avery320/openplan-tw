import OP from '../core';
import type { Store } from '../store';
import type { Row } from '../types';

const U = OP.util, M = OP.model;

/* ---------- columns ---------- */

export interface Col {
  t: string;
  w: number;
  fixed?: boolean;
  num?: boolean;
  edit?: 'duration' | 'work' | 'preds' | 'number' | 'percent' | 'date' | 'select' | 'text' | 'cftext' | 'cfnum';
  field?: string;
  options?: Record<string, string>;
  sumRo?: boolean;
  cf?: string;
  get?: (r: Row) => string;
}

const dayNum = (v: number) => (v == null || !isFinite(v) ? '' : U.num(v));
const money = (v: number) => (v == null ? '' : U.money(v));
const signedDays = (v: number) => (v == null ? '' : (v > 0 ? '+' : '') + U.num(v) + 'd');

export const COLS: Record<string, Col> = {
  id: { t: 'ID', w: 44, fixed: true },
  ind: { t: '', w: 56, fixed: true },
  name: { t: "任務名稱", w: 280, fixed: true },
  wbs: { t: "工作分解（WBS）", w: 64, get: r => r.wbs },
  duration: { t: "工期", w: 76, edit: 'duration', get: r => M.fmtDuration(r.duration), sumRo: true },
  work: { t: '工時', w: 80, edit: 'work', num: true, get: r => U.num(r.work) + 'h', sumRo: true },
  start: { t: "開始", w: 88, get: r => U.fmt(r.startDn) },
  finish: { t: "完成", w: 88, get: r => U.fmt(r.finishDn) },
  preds: { t: "前置任務", w: 110, edit: 'preds' },
  res: { t: "資源", w: 170 },
  cost: { t: '成本', w: 110, num: true, get: r => U.money(r.cost) },
  fixedCost: { t: "固定成本", w: 96, num: true, edit: 'number', field: 'fixedCost', get: r => String(r.task.fixedCost || 0) },
  percent: { t: "完成率", w: 90, num: true, edit: 'percent', get: r => r.percent + '%', sumRo: true },
  actualStart: { t: "實際開始", w: 130, edit: 'date', field: 'actualStart', sumRo: true },
  actualFinish: { t: "實際完成", w: 130, edit: 'date', field: 'actualFinish', sumRo: true },
  constraint: { t: "限制條件", w: 170, edit: 'select', field: 'constraint', options: M.CONSTRAINTS, sumRo: true },
  constraintDate: { t: "限制日期", w: 130, edit: 'date', field: 'constraintDate', sumRo: true },
  deadline: { t: "期限", w: 130, edit: 'date', field: 'deadline', sumRo: true },
  type: { t: "任務類型", w: 130, edit: 'select', field: 'type', options: M.TASK_TYPES, sumRo: true },
  priority: { t: "優先順序", w: 74, num: true, edit: 'number', field: 'priority', get: r => String(r.task.priority) },
  slack: { t: "總浮時", w: 86, num: true, get: r => U.num(r.slack) + 'd' },
  freeSlack: { t: "自由浮時", w: 80, num: true, get: r => (r.summary ? '' : U.num(r.freeSlack) + 'd') },
  es: { t: 'ES', w: 56, num: true, get: r => dayNum(r.es) },
  ef: { t: 'EF', w: 56, num: true, get: r => dayNum(r.ef) },
  ls: { t: 'LS', w: 56, num: true, get: r => dayNum(r.ls) },
  lf: { t: 'LF', w: 56, num: true, get: r => dayNum(r.lf) },
  bStart: { t: "基準開始日期", w: 104, get: r => (r.base ? U.fmt(r.base.startDn) : '') },
  bFinish: { t: "基準完成日期", w: 104, get: r => (r.base ? U.fmt(r.base.finishDn) : '') },
  bCost: { t: "基準成本", w: 110, num: true, get: r => (r.base ? U.money(r.base.cost) : '') },
  startVar: { t: "開始日期差異", w: 80, num: true, get: r => (r.base ? signedDays(r.startVar) : '') },
  finishVar: { t: "完成日期差異", w: 80, num: true, get: r => (r.base ? signedDays(r.finishVar) : '') },
  costVar: { t: "成本差異", w: 100, num: true, get: r => (r.base ? U.money(r.costVar) : '') },
  actualCost: { t: "實際成本", w: 104, num: true, get: r => money(r.actualCost) },
  bcws: { t: 'BCWS (PV)', w: 104, num: true, get: r => money(r.bcws) },
  bcwp: { t: 'BCWP (EV)', w: 104, num: true, get: r => money(r.bcwp) },
  acwp: { t: 'ACWP (AC)', w: 104, num: true, get: r => money(r.acwp) },
  sv: { t: 'SV', w: 96, num: true, get: r => money(r.bcwp - r.bcws) },
  cv: { t: 'CV', w: 96, num: true, get: r => money(r.bcwp - r.acwp) },
  levelDelay: { t: "資源平衡造成的延遲", w: 100, num: true, get: r => (r.task.levelDelay ? U.num(r.task.levelDelay) + 'd' : '') },
  notes: { t: "備註", w: 200, edit: 'text', field: 'notes' }
};

export const COL_GROUPS: [string, string[]][] = [
  ['General', ['wbs', 'duration', 'work', 'start', 'finish', 'preds', 'res', 'cost', 'fixedCost', 'priority', 'type', 'notes']],
  ["排程", ['constraint', 'constraintDate', 'deadline', 'slack', 'freeSlack', 'es', 'ef', 'ls', 'lf', 'levelDelay']],
  ['Tracking', ['percent', 'actualStart', 'actualFinish', 'actualCost', 'bStart', 'bFinish', 'bCost', 'startVar', 'finishVar', 'costVar']],
  ["實獲值", ['bcws', 'bcwp', 'acwp', 'sv', 'cv']]
];
const COL_ORDER = ['id', 'ind', 'name'].concat(COL_GROUPS.flatMap(g => g[1]));

export function colDef(st: Store, k: string): Col | null {
  if (COLS[k]) return COLS[k];
  const m = /^cf:(.+)$/.exec(k);
  const f = m && st.p.customFields.find(x => x.id === m[1]);
  if (!f) return null;
  return { t: f.name, w: 120, num: f.type === 'number', edit: f.type === 'number' ? 'cfnum' : 'cftext', cf: f.id };
}

export function activeCols(st: Store): string[] {
  const ks = st.cols.filter(k => colDef(st, k));
  ['name', 'ind', 'id'].forEach(k => { if (!ks.includes(k)) ks.unshift(k); });
  return ks;
}

export function toggleCol(cols: string[], k: string, on: boolean): string[] {
  const next = cols.filter(c => c !== k);
  if (on) next.push(k);
  return next.sort((a, b) => {
    const x = COL_ORDER.indexOf(a), y = COL_ORDER.indexOf(b);
    return (x < 0 ? 999 : x) - (y < 0 ? 999 : y);
  });
}

/* ---------- filter, group, sort ---------- */

export const FILTERS: Record<string, string> = {
  all: "所有任務", critical: "關鍵任務", milestones: "里程碑", summary: "摘要任務",
  incomplete: "未完成的任務", complete: "已完成的任務", late: "進度落後", slipped: "較基準線延後",
  overalloc: "資源超額分配", deadline: "已逾期", conflicts: "限制條件衝突"
};
export const GROUPS: Record<string, string> = { none: "不分組", critical: "關鍵路徑", milestone: "里程碑", status: "進度狀態", resource: "資源", priority: "優先順序", type: "任務類型" };
export const SORTS: Record<string, string> = { id: 'ID', start: "開始日期", finish: "完成日期", duration: "工期", name: "名稱", cost: '成本', priority: "優先順序", slack: "總浮時" };

export function menuData(st: Store) {
  const filters: Record<string, string> = { ...FILTERS };
  st.p.resources.forEach(r => { filters['res:' + r.uid] = '使用 ' + (r.name || "（未命名）"); });
  const groups: Record<string, string> = { ...GROUPS };
  st.p.customFields.forEach(cf => { groups['cf:' + cf.id] = cf.name; });
  return { filters, groups, sorts: SORTS };
}

function matches(st: Store, r: Row) {
  const f = st.filter, t = r.task;
  if (f === 'all') return true;
  if (f === 'summary') return r.summary;
  if (r.summary) return false;
  if (f === 'critical') return r.critical;
  if (f === 'milestones') return r.milestone;
  if (f === 'incomplete') return r.percent < 100;
  if (f === 'complete') return r.percent >= 100;
  if (f === 'late') return r.late;
  if (f === 'slipped') return !!r.slipped;
  if (f === 'overalloc') return r.over;
  if (f === 'deadline') return r.missedDeadline;
  if (f === 'conflicts') return !!r.conflict;
  const m = /^res:(\d+)$/.exec(f);
  if (m) return t.assignments.some((a: any) => a.res === +m[1]);
  return true;
}

function sortKey(st: Store, r: Row): number | string {
  switch (st.sort) {
    case 'start': return r.startDn;
    case 'finish': return r.finishDn;
    case 'duration': return -r.duration;
    case 'name': return (r.task.name || '').toLowerCase();
    case 'cost': return -r.cost;
    case 'priority': return -r.task.priority;
    case 'slack': return r.slack;
    default: return r.i;
  }
}

function groupKeys(st: Store, r: Row): string[] {
  const g = st.group, t = r.task;
  if (g === 'critical') return [r.critical ? "關鍵路徑" : "非關鍵路徑"];
  if (g === 'milestone') return [r.milestone ? "里程碑" : "任務"];
  if (g === 'status') return [r.percent >= 100 ? "完成" : r.percent > 0 ? "進行中" : "尚未開始"];
  if (g === 'priority') return ['優先順序 ' + t.priority];
  if (g === 'type') return [M.TASK_TYPES[t.type] || t.type];
  if (g === 'resource') {
    const names = t.assignments.map((a: any) => { const res = st.p.resources.find(x => x.uid === a.res); return res ? res.name || "（未命名）" : null; }).filter((n): n is string => !!n);
    return names.length ? names : ["未指派"];
  }
  const m = /^cf:(.+)$/.exec(g);
  if (m) { const v = t.custom && t.custom[m[1]]; return [v === '' || v == null ? '（空白）' : String(v)]; }
  return ['全部'];
}

export interface GroupItem { group: true; key: string; label: string; count: number; cost: number; startDn: number; finishDn: number }

// Rows to display, honouring filter, grouping, sorting and collapsed summaries.
export function gridItems(st: Store): (Row | GroupItem)[] {
  const rows: Row[] = st.s.rows;
  const cmp = (a: Row, b: Row) => {
    const x = sortKey(st, a), y = sortKey(st, b);
    return x < y ? -1 : x > y ? 1 : a.i - b.i;
  };
  if (st.group !== 'none') {
    const groups: Record<string, Row[]> = {}, order: string[] = [];
    rows.forEach(r => {
      if (r.summary || !matches(st, r)) return;
      groupKeys(st, r).forEach(k => {
        if (!groups[k]) { groups[k] = []; order.push(k); }
        groups[k].push(r);
      });
    });
    order.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const out: (Row | GroupItem)[] = [];
    order.forEach(k => {
      const list = groups[k].sort(cmp), key = 'g:' + k;
      out.push({
        group: true, key, label: k, count: list.length,
        cost: list.reduce((a, r) => a + r.cost, 0),
        startDn: Math.min(...list.map(r => r.startDn)),
        finishDn: Math.max(...list.map(r => r.finishDn))
      });
      if (!st.collapsed[key]) out.push(...list);
    });
    return out;
  }
  const keep: Record<number, boolean> = {};
  rows.forEach(r => {
    if (!matches(st, r)) return;
    keep[r.i] = true;
    for (let q = r.parent; q >= 0; q = rows[q].parent) keep[q] = true;
  });
  const res: Row[] = [];
  const walk = (list: Row[]) => {
    list.slice().sort(cmp).forEach(r => {
      if (!keep[r.i]) return;
      res.push(r);
      if (r.summary && !st.collapsed[r.task.uid]) walk(r.children.map((c: number) => rows[c]));
    });
  };
  walk(rows.filter(r => r.parent < 0));
  return res;
}
