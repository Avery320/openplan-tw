import OP from '../core';
import { ask, S, focusKey, rowByUid } from '../store';
import type { Project, Task } from '../types';

const U = OP.util, M = OP.model;

/* ---------- task-type rules (fixed units / work / duration, effort driven) ---------- */

const hpd = (p: Project) => +p.hoursPerDay || 8;
const round = (v: number) => Math.round(v * 100) / 100;
const resIn = (p: Project, uid: number) => p.resources.find(r => r.uid === uid);

export function taskWork(p: Project, t: Task) { return M.workUnits(p, t) * hpd(p) * (t.milestone ? 0 : +t.duration || 0); }

function scaleUnits(p: Project, t: Task, f: number) {
  t.assignments.forEach(a => {
    const r = resIn(p, a.res);
    if (r && r.kind === 'Work') a.units = Math.max(1, Math.round(a.units * f * 10) / 10);
  });
}

export function setDuration(p: Project, t: Task, d: number) {
  const old = +t.duration || 0;
  if (t.type === 'FixedWork' && old > 0 && d > 0 && M.workUnits(p, t) > 0) scaleUnits(p, t, old / d);
  t.duration = d;
  t.milestone = d === 0;
}

export function setWork(p: Project, t: Task, hours: number): string {
  const u = M.workUnits(p, t), d = +t.duration || 0;
  if (!u) return "請先指派人員，再輸入這項任務的工時。";
  if (t.type === 'FixedDuration' && d > 0) scaleUnits(p, t, hours / (d * u * hpd(p)));
  else { t.duration = round(hours / (u * hpd(p))); t.milestone = t.duration === 0; }
  return '';
}

// Effort-driven tasks keep their total work when people are added or removed.
export function changeAssignments(p: Project, t: Task, fn: () => void) {
  const before = taskWork(p, t), u0 = M.workUnits(p, t);
  fn();
  const u1 = M.workUnits(p, t);
  if (!t.effortDriven || !u0 || !u1 || u0 === u1 || t.milestone) return;
  if (t.type === 'FixedDuration') scaleUnits(p, t, u0 / u1);
  else t.duration = round(before / (u1 * hpd(p)));
}

export function setUnits(p: Project, t: Task, k: number, units: number) {
  const before = taskWork(p, t);
  t.assignments[k].units = units;
  const r = resIn(p, t.assignments[k].res);
  if (t.type === 'FixedWork' && r && r.kind === 'Work' && before > 0) t.duration = round(before / (M.workUnits(p, t) * hpd(p)));
}

/* ---------- helpers ---------- */

export const findTask = (p: Project, uid: number) => p.tasks.find(t => t.uid === uid)!;

function selIndexes(p: Project): number[] {
  const idx = M.indexByUid(p);
  return S().sel.map(u => idx[u]).filter((i: number | undefined) => i != null).sort((a: number, b: number) => a - b);
}

// Top-most selected tasks (children of a selected summary move with it).
function selectedBlocks(p: Project): number[] {
  const out: number[] = [];
  let coveredTo = -1;
  selIndexes(p).forEach(i => {
    if (i < coveredTo) return;
    out.push(i);
    coveredTo = M.subtreeEnd(p, i);
  });
  return out;
}

function wouldLoop(mutate: (p: Project) => void) {
  const trial: Project = U.clone(S().p);
  mutate(trial);
  return OP.schedule(trial, { cycleOnly: true }).cycle.length > 0;
}

/* ---------- commands ---------- */

export function setPreds(uid: number, text: string): boolean {
  const st = S(), res = M.parsePreds(st.p, text, uid);
  if (res.errors.length) {
    st.toast('無法辨識「' + res.errors.join('、') + '」。請輸入任務編號，例如 3、5SS+2d 或 7FF。', true);
    return false;
  }
  if (wouldLoop(p => { findTask(p, uid).preds = res.preds; })) { st.toast("這項連結會造成循環依賴。", true); return false; }
  st.commit(p => { findTask(p, uid).preds = res.preds; });
  return true;
}

export function addLink(fromUid: number, toUid: number): boolean {
  const st = S(), target = st.p.tasks.find(t => t.uid === toUid);
  if (!target || fromUid === toUid) return false;
  if (target.preds.some(l => l.uid === fromUid)) { st.toast("這些任務已經連結。"); return false; }
  const add = (p: Project) => { findTask(p, toUid).preds.push({ uid: fromUid, type: 'FS', lag: 0 }); };
  if (wouldLoop(add)) { st.toast("這項連結會造成循環依賴。", true); return false; }
  st.commit(add);
  return true;
}

export function addTask(milestone: boolean) {
  const st = S(), p = st.p, ids = selIndexes(p);
  let pos: number, lvl: number;
  if (ids.length) {
    const i = ids[ids.length - 1];
    if (M.isSummary(p, i) && !st.collapsed[p.tasks[i].uid]) { pos = i + 1; lvl = p.tasks[i].level + 1; }
    else { pos = M.subtreeEnd(p, i); lvl = p.tasks[i].level; }
  } else {
    pos = p.tasks.length;
    lvl = pos ? p.tasks[pos - 1].level : 1;
  }
  let uid = 0;
  st.commit(pp => {
    const t = M.newTask(pp, { name: milestone ? "新增里程碑" : "新增任務", level: lvl, duration: milestone ? 0 : 1, milestone });
    uid = t.uid;
    pp.tasks.splice(pos, 0, t);
  });
  st.setUI({ view: 'gantt', filter: 'all', group: 'none' });
  st.select([uid], uid);
  focusKey(uid + ':name');
}

export function addTaskNamed(name: string) {
  const st = S(), p = st.p, last = p.tasks[p.tasks.length - 1];
  const lvl = last ? (M.isSummary(p, p.tasks.length - 1) ? last.level + 1 : last.level) : 1;
  let uid = 0;
  st.commit(pp => { const t = M.newTask(pp, { name, level: lvl }); uid = t.uid; pp.tasks.push(t); });
  st.select([uid], uid);
}

export function indent(dir: 1 | -1) {
  S().commit(p => {
    selectedBlocks(p).forEach(i => {
      const end = M.subtreeEnd(p, i), t = p.tasks[i];
      if (dir > 0 && (i === 0 || t.level > p.tasks[i - 1].level)) return;
      if (dir < 0 && t.level <= 1) return;
      for (let k = i; k < end; k++) p.tasks[k].level += dir;
    });
    M.normalizeLevels(p);
  });
}

export function move(dir: 1 | -1) {
  const st = S(), blocks = selectedBlocks(st.p);
  if (blocks.length !== 1) { st.toast("請先選取一項任務或摘要任務。"); return; }
  st.commit(p => {
    const i = blocks[0], end = M.subtreeEnd(p, i), lv = p.tasks[i].level;
    let k: number;
    if (dir < 0) {
      for (k = i - 1; k >= 0 && p.tasks[k].level > lv; k--);
      if (k < 0 || p.tasks[k].level !== lv) return false;
      const block = p.tasks.splice(i, end - i);
      p.tasks.splice(k, 0, ...block);
    } else {
      if (end >= p.tasks.length || p.tasks[end].level !== lv) return false;
      const end2 = M.subtreeEnd(p, end);
      const block = p.tasks.splice(i, end - i);
      p.tasks.splice(end2 - block.length, 0, ...block);
    }
  });
}

export function linkSelected() {
  const st = S(), ids = selIndexes(st.p);
  if (ids.length < 2) return;
  const link = (p: Project) => {
    for (let k = 1; k < ids.length; k++) {
      const a = p.tasks[ids[k - 1]], b = p.tasks[ids[k]];
      if (!b.preds.some(l => l.uid === a.uid)) b.preds.push({ uid: a.uid, type: 'FS', lag: 0 });
    }
  };
  if (wouldLoop(link)) { st.toast("連結這些任務會造成循環依賴。", true); return; }
  st.commit(link);
}

export function unlinkSelected() {
  const st = S(), set = new Set(st.sel);
  st.commit(p => {
    p.tasks.forEach(t => {
      if (st.sel.length === 1 && set.has(t.uid)) t.preds = [];
      else if (set.has(t.uid)) t.preds = t.preds.filter(l => !set.has(l.uid));
    });
  });
}

export function deleteSelected() {
  const st = S(), blocks = selectedBlocks(st.p);
  if (!blocks.length) return;
  const uids: number[] = [];
  blocks.forEach(i => { for (let k = i; k < M.subtreeEnd(st.p, i); k++) uids.push(st.p.tasks[k].uid); });
  const run = () => { S().commit(p => { M.removeTasks(p, uids); }); S().select([]); };
  if (uids.length > 1) ask('要刪除 ' + uids.length + ' 項任務嗎？子任務會一併刪除。', run, "刪除");
  else run();
}

export function setPercent(uid: number, v: number) {
  const r = rowByUid(uid);
  if (!r) return;
  S().commit(p => {
    const t = findTask(p, uid);
    t.percent = v;
    if (v > 0 && !t.actualStart) t.actualStart = U.iso(r.startDn);
    if (v >= 100 && !t.actualFinish) t.actualFinish = U.iso(r.finishDn);
    if (v < 100) t.actualFinish = '';
    if (v === 0) t.actualStart = '';
  });
}

export function markPercent(v: number) {
  const st = S(), rows = st.sel.map(rowByUid).filter((r: any) => r && !r.summary);
  if (!rows.length) { st.toast("請先選取任務。摘要任務會依子任務自動更新。"); return; }
  st.commit(p => {
    rows.forEach((r: any) => {
      const t = findTask(p, r.task.uid);
      t.percent = v;
      if (v > 0 && !t.actualStart) t.actualStart = U.iso(r.startDn);
      if (v >= 100) { if (!t.actualFinish) t.actualFinish = U.iso(r.finishDn); } else t.actualFinish = '';
      if (v === 0) t.actualStart = '';
    });
  });
}

// Set progress on every task to what the plan says should be done by the status date.
export function updateAsScheduled() {
  const st = S(), s = st.s, statusIdx = s.cal.finishIndex(s.statusDn);
  let n = 0;
  st.commit(p => {
    s.rows.forEach((r: any) => {
      if (r.summary) return;
      const t = findTask(p, r.task.uid), sp = r.ef - r.es;
      let pct = sp > 0 ? Math.max(0, Math.min(1, (statusIdx - r.es) / sp)) : (statusIdx >= r.es ? 1 : 0);
      pct = Math.round(pct * 100);
      if (pct <= (+t.percent || 0)) return;
      t.percent = pct; n++;
      if (!t.actualStart) t.actualStart = U.iso(r.startDn);
      if (pct >= 100 && !t.actualFinish) t.actualFinish = U.iso(r.finishDn);
    });
  });
  st.toast(n ? '已將 ' + n + ' 項任務的進度更新至 ' + U.fmt(s.statusDn) : "任務進度已符合或超前狀態日期。");
}

export function setBaseline() {
  const run = () => {
    const st = S();
    st.setUI({ showBaseline: true });
    st.commit(p => { OP.setBaseline(p); if (p.status === 'Draft') p.status = 'Baselined'; });
    st.toast("已儲存基準線，差異與實獲值會以此為準。");
  };
  if (S().p.baseline) ask("要將目前計畫設為新的基準線嗎？", run, "取代");
  else run();
}

export function clearBaseline() {
  ask("要清除基準線嗎？", () => S().commit(p => { p.baseline = null; }), "清除");
}

export function levelAll() {
  const st = S();
  let res: any = null;
  st.commit(p => { res = OP.level(p); });
  if (!res || (!res.moved && !res.unresolved.length)) st.toast("目前沒有需要平衡的資源。");
  else if (res.unresolved.length) st.toast('已調整 ' + res.moved + ' 項任務。這些資源仍超額分配：' + res.unresolved.join('、') + '。請檢查投入上限及無法改期的任務。', true);
  else st.toast('已平衡資源並延後 ' + res.moved + ' 項任務。');
}

export function clearLeveling() { S().commit(p => { p.tasks.forEach(t => { t.levelDelay = 0; }); }); }

export function createRecurring(o: { name: string; duration: number; first: number; count: number; every: number; unit: string }) {
  const st = S(), cal = st.s.cal, ids = selIndexes(st.p);
  const pos = ids.length ? M.subtreeEnd(st.p, ids[ids.length - 1]) : st.p.tasks.length;
  const lvl = ids.length ? st.p.tasks[ids[ids.length - 1]].level : 1;
  let head = 0;
  st.commit(p => {
    const summary = M.newTask(p, { name: o.name, level: lvl, notes: '每 ' + o.every + (o.unit === 'month' ? ' 個月' : o.unit === 'week' ? ' 週' : ' 個工作日') + '執行一次，共 ' + o.count + ' 次。' });
    head = summary.uid;
    const list = [summary];
    for (let k = 0; k < o.count; k++) {
      let dn: number;
      if (o.unit === 'week') dn = o.first + k * 7 * o.every;
      else if (o.unit === 'day') dn = cal.date(cal.indexOf(o.first) + k * o.every);
      else {
        // Clamp to the month's last day so "every month from 31 Jan" gives 28/29 Feb, not 3 Mar.
        const dt = U.toDate(o.first), y = dt.getUTCFullYear(), m = dt.getUTCMonth() + k * o.every;
        const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
        dn = Math.round(Date.UTC(y, m, Math.min(dt.getUTCDate(), last)) / 864e5);
      }
      list.push(M.newTask(p, { name: o.name + ' ' + (k + 1), level: lvl + 1, duration: o.duration, milestone: o.duration === 0, constraint: 'SNET', constraintDate: U.iso(dn) }));
    }
    p.tasks.splice(pos, 0, ...list);
  });
  st.select([head], head);
}

export function addResource() {
  const st = S();
  let uid = 0;
  st.commit(p => {
    const r = M.newResource(p, { name: '', type: 'Full-time', reportsTo: p.resources.length ? p.resources[0].uid : null });
    uid = r.uid;
    p.resources.push(r);
  });
  st.setView('resources');
  focusKey('r' + uid + ':name');
}
