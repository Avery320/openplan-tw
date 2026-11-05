import { blankPlan, createCloudProject, downloadPlan, errorMessage, flushCloud } from './cloud';
import OP from '../core';
import { S, VIEW_NAMES, ask, type Store } from '../store';
import { gridItems } from './grid';
import { toXlsx } from './xlsx';
import { fromTemplate, type Template } from './templates';
import type { Project } from '../types';

const U = OP.util, C = OP.charts, IO = OP.io;

const MAX_FILE_MB = 20;

function checkSize(file: File) {
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error('檔案超過 ' + MAX_FILE_MB + ' MB。請將計畫拆成較小的專案。');
}

function openAsNew(plan: Project) {
  void createCloudProject(plan).catch(error => S().toast(errorMessage(error), true));
}

export function scopeRows(st: Store) {
  if (st.netScope === 'all') return st.s.rows;
  const r = st.s.rows.find((x: any) => String(x.task.uid) === String(st.netScope));
  return r ? r.leaves.map((i: number) => st.s.rows[i]) : st.s.rows;
}

// SVG markup for the current view (null when the view is not a picture).
export function viewSvgString(st: Store): string | null {
  if (st.view === 'gantt') {
    return C.gantt({ p: st.p, s: st.s, rows: gridItems(st), zoom: st.zoom, critical: st.critical, table: true, flat: st.group !== 'none', baseline: st.showBaseline && !!st.p.baseline }).svg;
  }
  if (!st.s.rows.length && st.view !== 'org') return null;
  if (st.view === 'network') {
    const sr = st.netScope === 'all' ? null : st.s.rows.find((x: any) => String(x.task.uid) === String(st.netScope));
    const title = sr ? sr.wbs + ' ' + sr.task.name : st.p.name + " — 任務網路圖";
    return C.network({ p: st.p, s: st.s, rows: scopeRows(st), critical: st.critical, dates: st.netDates, title }).svg;
  }
  if (st.view === 'wbs') return C.wbs({ p: st.p, s: st.s, depth: st.wbsDepth }).svg;
  if (st.view === 'org') {
    const people = st.p.resources.filter(r => r.kind === 'Work');
    return people.length ? C.org({ p: { resources: people, currency: st.p.currency } }).svg : null;
  }
  return null;
}

export const hasImage = (st: Store) => ['gantt', 'network', 'wbs', 'org'].includes(st.view);

function svgElement(str: string): SVGSVGElement {
  return new DOMParser().parseFromString(str, 'image/svg+xml').documentElement as unknown as SVGSVGElement;
}

// Replaces the current plan; the previous one can be restored from File › Open.
export function loadProject(p: Project, msg: string) {
  S().setUI({ backstage: false, menu: null });
  S().replaceProject(p, msg);
}

export function openTemplate(t: Template) {
  ask('要使用「' + t.name + '」範本建立另一個專案嗎？', () => openAsNew(fromTemplate(t)), '使用範本');
}

export function runAction(a: string) {
  const st = S(), name = U.slug(st.p.name);
  st.setUI({ menu: null, backstage: false });
  switch (a) {
    case 'new': openAsNew(blankPlan()); break;
    case 'sample': openAsNew(OP.demo()); break;
    case 'restore': {
      if (!st.previous) { st.toast('目前沒有可還原的計畫。'); break; }
      try { st.replaceProject(IO.fromJSON(st.previous), '已還原上一份計畫。'); }
      catch (error) { st.toast(errorMessage(error), true); }
      break;
    }
    case 'open': pickFile(false); break;
    case 'insert': pickFile(true); break;
    case 'import': st.openDialog('import'); break;
    case 'save': void flushCloud().then(saved => { if (saved) S().toast('已儲存至雲端。'); }); break;
    case 'saveas': downloadPlan(st.p); st.toast('已下載專案備份。'); break;
    case 'xlsx':
      U.download(name + '-任務清單.xlsx', new Blob([toXlsx(IO.taskTable(st.p), "任務")], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      st.toast("已下載 Excel 檔案。");
      break;
    case 'csv': U.download(name + '-任務清單.csv', '﻿' + IO.toCSV(st.p), 'text/csv'); st.toast("已下載 CSV 檔案。"); break;
    case 'png': case 'svg': {
      const svg = viewSvgString(st);
      if (!svg) { st.toast("請先切換到甘特圖、網路圖、工作分解結構或組織圖，再匯出圖片。"); return; }
      if (a === 'png') IO.exportPNG(svgElement(svg), name + '-' + st.view);
      else IO.exportSVG(svgElement(svg), name + '-' + st.view);
      break;
    }
    case 'print': {
      const svg = viewSvgString(st);
      if (svg) IO.printSVG(svgElement(svg), st.p.name + ' — ' + VIEW_NAMES[st.view]);
      else window.print();
      break;
    }
    case 'settings': st.openDialog('settings'); break;
    case 'about': st.openDialog('about'); break;
  }
}

function pickFile(insert: boolean) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.openplan,.json,application/json';
  input.onchange = () => {
    const file = input.files && input.files[0];
    if (!file) return;
    try { checkSize(file); } catch (e: any) { S().toast("無法開啟檔案： " + e.message, true); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const st = S();
      try {
        const p: Project = IO.fromJSON(String(reader.result));
        if (insert) {
          let res = { uid: 0, warnings: [] as string[] };
          st.commit(pp => { res = IO.insertProject(pp, p); });
          st.select([res.uid], res.uid);
          st.toast('已將「' + file.name + '」插入為子專案。' + (res.warnings.length ? res.warnings.join('。') + '。' : ''), res.warnings.length > 0);
        } else openAsNew(p);
      } catch (e: any) {
        st.toast("無法開啟檔案： " + e.message, true);
      }
    };
    reader.readAsText(file);
  };
  input.click();
}
