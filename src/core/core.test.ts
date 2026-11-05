import { describe, expect, it } from 'vitest';
import OP from './index';

const M = OP.model;

type Spec = { name: string; duration: number; preds?: string };

function plan(specs: Spec[]) {
  let p = M.blank();
  p.start = '2026-01-05';
  specs.forEach(sp => p.tasks.push(M.newTask(p, { name: sp.name, duration: sp.duration })));
  specs.forEach((sp, i) => { if (sp.preds) p.tasks[i].preds = M.parsePreds(p, sp.preds, p.tasks[i].uid).preds; });
  p = M.normalize(p);
  return { p, s: OP.schedule(p) };
}

const row = (s: any, name: string) => s.rows.find((r: any) => r.task.name === name);

describe('scheduler', () => {
  it('chains finish-to-start links and finds the critical path', () => {
    const { s } = plan([
      { name: 'A', duration: 3 },
      { name: 'B', duration: 2, preds: '1' },
      { name: 'C', duration: 1 }
    ]);
    expect(row(s, 'B').es).toBe(3);
    expect(s.duration).toBe(5);
    expect(row(s, 'A').critical).toBe(true);
    expect(row(s, 'B').critical).toBe(true);
    expect(row(s, 'C').critical).toBe(false);
    expect(row(s, 'C').slack).toBe(4);
  });

  it('applies lag and start-to-start links', () => {
    const { s } = plan([
      { name: 'A', duration: 3 },
      { name: 'B', duration: 2, preds: '1FS+2d' },
      { name: 'C', duration: 2, preds: '1SS' }
    ]);
    expect(row(s, 'B').es).toBe(5);
    expect(row(s, 'C').es).toBe(0);
  });

  it('reports a dependency loop', () => {
    const { p } = plan([{ name: 'A', duration: 1 }, { name: 'B', duration: 1, preds: '1' }]);
    p.tasks[0].preds = [{ uid: p.tasks[1].uid, type: 'FS', lag: 0 }];
    expect(OP.schedule(p).cycle.length).toBeGreaterThan(0);
  });

  it('schedules the sample project without loops', () => {
    const p = OP.demo(), s = OP.schedule(p);
    expect(s.cycle).toEqual([]);
    expect(s.rows.some((r: any) => r.critical && !r.summary)).toBe(true);
    expect(s.finishDn).toBeGreaterThan(s.startDn);
  });
});

describe('predecessor parsing', () => {
  it('reads link types and lag, and reports bad entries', () => {
    const { p } = plan([{ name: 'A', duration: 1 }, { name: 'B', duration: 1 }, { name: 'C', duration: 1 }]);
    const res = M.parsePreds(p, '1, 2SS+2d, 3FF-1d, x, 9', p.tasks[2].uid);
    expect(res.preds).toEqual([
      { uid: p.tasks[0].uid, type: 'FS', lag: 0 },
      { uid: p.tasks[1].uid, type: 'SS', lag: 2 }
    ]);
    expect(res.errors).toEqual(['3FF-1d', 'x', '9']);
  });
});

describe('project files', () => {
  it('round-trips a project through JSON', () => {
    const p = OP.demo();
    const back = OP.io.fromJSON(OP.io.toJSON(p));
    expect(back).toEqual(M.normalize(JSON.parse(JSON.stringify(p))));
  });

  it('rejects files that are not OpenPlan projects', () => {
    expect(() => OP.io.fromJSON('{"hello":1}')).toThrow('無法辨識為 OpenPlan 專案檔案。');
    expect(() => OP.io.fromJSON('not json')).toThrow();
  });
});

describe('util', () => {
  it('escapes HTML', () => {
    expect(OP.util.esc('<a href="x">\'&')).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
  });
});
