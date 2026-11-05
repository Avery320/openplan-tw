import OP from '../core';
import type { Project } from '../types';

const M = OP.model;

// Splits CSV, or tab-separated text pasted from Excel or Sheets, into rows of cells.
export function parseTable(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0];
  const sep = first.includes('\t') ? '\t' : first.split(';').length > first.split(',').length ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim()));
}

const COLUMNS: [keyof Cols, RegExp][] = [
  ['id', /^(id|#|no\.?|number|task id|任務編號)$/i], ['wbs', /^(wbs|工作分解)/i], ['level', /^((outline )?level|層級)$/i],
  ['name', /^(task|activity|name|title|summary|task name|activity name|task title|任務名稱|名稱|任務)$/i],
  ['duration', /^((duration|days|length)( \(days\))?|工期(?:（天）)?)$/i], ['preds', /^(predecessors?|depends on|dependencies|前置任務|前置關係)$/i],
  ['resources', /^(resources?|resource names|assigned to|assignee|owner|who|資源|責任人)$/i],
  ['percent', /^(% ?complete|percent complete|progress|%|完成率|進度)$/i], ['notes', /^(notes?|comments?|description|備註|說明)$/i]
];
type Cols = { id?: number; wbs?: number; level?: number; name?: number; duration?: number; preds?: number; resources?: number; percent?: number; notes?: number };

export interface ImportResult { project: Project; tasks: number; resources: number; warnings: string[] }

// Builds a new project from a task table. Columns are found by their headings; without headings the
// columns are read as task name, duration and predecessors. Predecessors refer to the ID column, or row numbers.
export function projectFromTable(text: string): ImportResult {
  const rows = parseTable(text), warnings: string[] = [];
  if (!rows.length) throw new Error("找不到可匯入的資料列。");
  const cols: Cols = {};
  rows[0].forEach((h, i) => {
    const hit = COLUMNS.find(([k, re]) => cols[k] == null && re.test(h.trim()));
    if (hit) cols[hit[0]] = i;
  });
  const hasHeader = cols.name != null;
  if (!hasHeader) Object.assign(cols, { name: 0, duration: 1, preds: 2 });
  const data = hasHeader ? rows.slice(1) : rows;
  const get = (r: string[], k: keyof Cols) => (cols[k] == null ? '' : (r[cols[k]!] ?? '').trim());

  let p = M.blank();
  p.name = "匯入的計畫";
  const resByName = new Map<string, number>(), idToRow = new Map<string, number>(), predText: string[] = [];
  let badDur = 0;
  data.forEach((r, i) => {
    const raw = cols.name == null ? '' : r[cols.name] ?? '';
    const name = raw.trim();
    if (!name) return;
    let level = parseInt(get(r, 'level'), 10);
    if (!(level >= 1)) level = get(r, 'wbs') ? get(r, 'wbs').split('.').filter(Boolean).length : Math.floor((raw.length - raw.trimStart().length) / 2) + 1;
    const durText = get(r, 'duration');
    let duration = durText ? M.parseDuration(durText, p.hoursPerDay) : 1;
    if (duration == null) { badDur++; duration = 1; }
    const t = M.newTask(p, { name, level: Math.min(level, 20), duration, milestone: duration === 0, percent: Math.max(0, Math.min(100, parseFloat(get(r, 'percent')) || 0)), notes: get(r, 'notes') });
    get(r, 'resources').split(/[,;]/).map(s => s.trim()).filter(Boolean).forEach(entry => {
      const m = /^(.*?)\s*(?:\[(\d+(?:\.\d+)?)%\])?$/.exec(entry)!, rname = m[1];
      if (!resByName.has(rname)) {
        const res = M.newResource(p, { name: rname, initials: M.initials(rname) });
        p.resources.push(res);
        resByName.set(rname, res.uid);
      }
      t.assignments.push({ res: resByName.get(rname)!, units: m[2] ? +m[2] : 100 });
    });
    idToRow.set(get(r, 'id') || String(i + 1), p.tasks.length + 1);
    p.tasks.push(t);
    predText.push(get(r, 'preds'));
  });
  if (!p.tasks.length) throw new Error("找不到任務名稱。請將名稱放在第一欄，或加上「任務名稱」欄名。");
  // Rewrite each predecessor's ID as the task's row number, keeping its link type and lag.
  const toRows = (text: string) => text.split(/[,;]/).map(part => {
    const m = /^\s*(.+?)\s*(FS|SS|FF|SF)?\s*([+-]\s*\d+(?:\.\d+)?\s*d?)?\s*$/i.exec(part);
    return m ? (idToRow.get(m[1]) ?? m[1]) + (m[2] || '') + (m[3] || '').replace(/\s/g, '') : part;
  }).join(',');
  let badPreds = 0;
  p.tasks.forEach((t: any, i: number) => {
    const res = M.parsePreds(p, toRows(predText[i]), t.uid);
    t.preds = res.preds;
    badPreds += res.errors.length;
  });
  if (badDur) warnings.push('有 ' + badDur + ' 筆工期無法辨識，已設為 1 天');
  if (badPreds) warnings.push('已略過 ' + badPreds + ' 筆無法辨識的前置任務');
  p = M.normalize(p);
  return { project: p, tasks: p.tasks.length, resources: p.resources.length, warnings };
}
