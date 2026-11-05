import { describe, expect, it } from 'vitest';
import OP from '../core';
import { TEMPLATES, fromTemplate } from './templates';
import { parseTable, projectFromTable } from './importTable';
import { decodePlan, encodePlan } from './share';
import { toXlsx } from './xlsx';

describe('templates', () => {
  it.each(TEMPLATES.map(t => [t.name, t] as const))('%s schedules without loops or bad links', (_, t) => {
    const p = fromTemplate(t), s = OP.schedule(p);
    expect(p.tasks).toHaveLength(t.tasks.length);
    expect(s.cycle).toEqual([]);
    const linked = t.tasks.filter(l => l[3]).length;
    expect(p.tasks.filter((x: any) => x.preds.length).length).toBe(linked);
  });
});

describe('table import', () => {
  it('splits CSV with quotes, and tab-separated text pasted from Excel', () => {
    expect(parseTable('a,"b, c","say ""hi"""\r\n1,2,3\n')).toEqual([['a', 'b, c', 'say "hi"'], ['1', '2', '3']]);
    expect(parseTable('Task\tDays\nDesign\t5')).toEqual([['Task', 'Days'], ['Design', '5']]);
  });

  it('matches columns by heading and maps predecessors from the ID column', () => {
    const res = projectFromTable([
      'ID,WBS,Task Name,Duration,Predecessors,Resources,% Complete',
      'T1,1,Build,,,,',
      'T2,1.1,Design,1w,,Ana [50%],',
      'T3,1.2,Code,3d,T2FS+1d,"Ana, Ben",40',
      'T4,2,Launch,0,T3,,'
    ].join('\n'));
    const [build, design, code, launch] = res.project.tasks;
    expect(res.tasks).toBe(4);
    expect(res.resources).toBe(2);
    expect(build.level).toBe(1);
    expect(design.level).toBe(2);
    expect(design.duration).toBe(5);
    expect(design.assignments).toEqual([{ res: res.project.resources[0].uid, units: 50 }]);
    expect(code.preds).toEqual([{ uid: design.uid, type: 'FS', lag: 1 }]);
    expect(code.percent).toBe(40);
    expect(launch.milestone).toBe(true);
    expect(launch.preds[0].uid).toBe(code.uid);
    expect(res.warnings).toEqual([]);
  });

  it('re-imports an OpenPlan CSV export with the same outline and links', () => {
    const p = OP.demo(), res = projectFromTable(OP.io.toCSV(p));
    expect(res.project.tasks.map((t: any) => [t.name, t.level])).toEqual(p.tasks.map((t: any) => [t.name, t.level]));
    expect(res.project.tasks.map((t: any) => t.preds.length)).toEqual(p.tasks.map((t: any) => t.preds.length));
  });

  it('reads name, duration and predecessors when there are no headings, and reports problems', () => {
    const res = projectFromTable('Design,5\nBuild,soon,1\nTest,2,1, 9');
    expect(res.project.tasks.map((t: any) => t.name)).toEqual(['Design', 'Build', 'Test']);
    expect(res.project.tasks[1].duration).toBe(1);
    expect(res.warnings).toEqual(['有 1 筆工期無法辨識，已設為 1 天']);
    expect(() => projectFromTable('\n\n')).toThrow('找不到可匯入的資料列。');
  });
});

describe('share links', () => {
  it('round-trips a plan through the link text', async () => {
    const p = OP.demo(), data = await encodePlan(p);
    expect(data).toMatch(/^[\w-]+$/);
    expect(await decodePlan(data)).toEqual(OP.io.fromJSON(JSON.stringify(p)));
  });

  it('rejects damaged links', async () => {
    await expect(decodePlan('not-a-plan')).rejects.toThrow();
  });
});

describe('Excel export', () => {
  it('writes a zip with the workbook parts and real dates', () => {
    const bytes = toXlsx([['Task', 'Start', 'Days'], ['Design <1>', '2026-01-05', 3]], 'Tasks');
    const text = new TextDecoder().decode(bytes);
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(new DataView(bytes.buffer).getUint16(bytes.length - 12, true)).toBe(6);
    expect(text).toContain('xl/worksheets/sheet1.xml');
    expect(text).toContain('<v>46027</v>');
    expect(text).toContain('Design &lt;1&gt;');
  });
});
