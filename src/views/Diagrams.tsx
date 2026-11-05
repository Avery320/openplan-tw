import { useLayoutEffect, useMemo, useRef } from 'react';
import { useApp, useStore, S } from '../store';
import { runAction, viewSvgString } from '../lib/actions';
import Icon from '../components/Icon';

// Zoomable SVG canvas; clicking a task node selects it and opens the details panel.
function Canvas({ svg, nodeClass }: { svg: string; nodeClass?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const zoom = useStore(s => s.netZoom);
  useLayoutEffect(() => {
    const el = ref.current?.querySelector('svg');
    if (!el) return;
    if (!el.dataset.w) { el.dataset.w = el.getAttribute('width')!; el.dataset.h = el.getAttribute('height')!; }
    el.setAttribute('width', String(Math.round(+el.dataset.w * zoom)));
    el.setAttribute('height', String(Math.round(+el.dataset.h! * zoom)));
  }, [svg, zoom]);
  const pick = (target: EventTarget) => {
    if (!nodeClass) return false;
    const g = (target as Element).closest('.' + nodeClass) as SVGGElement | null;
    if (!g) return false;
    const uid = +g.dataset.uid!;
    S().select([uid], uid);
    S().setUI({ drawer: true });
    return true;
  };
  return (
    <div className="canvas" id="canvas" ref={ref} dangerouslySetInnerHTML={{ __html: svg }}
      onClick={e => { pick(e.target); }}
      onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && pick(e.target)) e.preventDefault(); }} />
  );
}

function zoomBy(kind: 'in' | 'out' | 'fit') {
  const st = S();
  if (kind === 'fit') {
    const box = document.getElementById('canvas'), el = box?.querySelector('svg');
    if (!box || !el) return;
    st.setUI({ netZoom: Math.min(1.5, Math.max(0.2, Math.min((box.clientWidth - 4) / +el.dataset.w!, (box.clientHeight - 4) / +el.dataset.h!))) });
  } else st.setUI({ netZoom: Math.max(0.2, Math.min(2.5, st.netZoom * (kind === 'in' ? 1.2 : 1 / 1.2))) });
}

function ZoomTools() {
  return <>
    <button className="icon-btn" title="縮小" aria-label="縮小" onClick={() => zoomBy('out')}><Icon name="zout" /></button>
    <button className="icon-btn" title="符合視窗大小" aria-label="符合視窗大小" onClick={() => zoomBy('fit')}><Icon name="fit" /></button>
    <button className="icon-btn" title="放大" aria-label="放大" onClick={() => zoomBy('in')}><Icon name="zin" /></button>
    <button className="btn" onClick={() => runAction('png')}><Icon name="image" />PNG</button>
  </>;
}

const Empty = ({ title, text }: { title: string; text: string }) => (
  <div className="canvas"><div className="empty"><h3>{title}</h3><div>{text}</div></div></div>
);

export function NetworkView() {
  const st = useApp();
  const svg = useMemo(() => viewSvgString(st), [st.p, st.s, st.netScope, st.netDates, st.critical, st.view]);
  const tops = st.s.rows.filter((r: any) => r.summary && r.task.level === 1);
  return (
    <div className="view">
      <div className="view-head"><h1>網路圖</h1><span className="sub">顯示最早與最晚開始／完成時間及總浮時</span></div>
      <div className="toolbar">
        <select className="sel" aria-label="範圍" value={st.netScope} onChange={e => st.setUI({ netScope: e.target.value, netZoom: 1 })}>
          <option value="all">所有任務</option>
          {tops.map((r: any) => <option key={r.task.uid} value={String(r.task.uid)}>{r.wbs} {r.task.name}</option>)}
        </select>
        <div className="seg">
          <button className={!st.netDates ? 'on' : ''} onClick={() => st.setUI({ netDates: false })}>工作日序號</button>
          <button className={st.netDates ? 'on' : ''} onClick={() => st.setUI({ netDates: true })}>日期</button>
        </div>
        <label className="toggle"><input type="checkbox" checked={st.critical} onChange={e => st.setUI({ critical: e.target.checked })} />關鍵路徑</label>
        <span className="spacer" /><ZoomTools />
      </div>
      {svg ? <Canvas svg={svg} nodeClass="nnode" /> : <Empty title="目前沒有內容可顯示" text="Add tasks in the Gantt view first." />}
    </div>
  );
}

export function WbsView() {
  const st = useApp();
  const svg = useMemo(() => viewSvgString(st), [st.p, st.s, st.wbsDepth, st.view]);
  const maxLv = st.s.rows.reduce((a: number, r: any) => Math.max(a, r.task.level), 1);
  const levels: number[] = [];
  for (let l = 2; l <= Math.max(2, maxLv); l++) levels.push(l);
  return (
    <div className="view">
      <div className="view-head"><h1>工作分解結構</h1>
        <span className="sub">{st.s.rows.length} 項工作 · {st.s.rows.filter((r: any) => r.task.level === 1).length} 個最上層工作包</span></div>
      <div className="toolbar">
        <span className="muted">顯示層級</span>
        <div className="seg">{levels.map(l => <button key={l} className={Math.min(st.wbsDepth, maxLv) === l ? 'on' : ''} onClick={() => st.setUI({ wbsDepth: l })}>{l}</button>)}</div>
        <span className="spacer" /><ZoomTools />
      </div>
      {svg ? <Canvas svg={svg} nodeClass="wnode" /> : <Empty title="目前沒有工作項目" text="Build your task outline in the Gantt view; indented tasks become WBS levels." />}
    </div>
  );
}

export function OrgView() {
  const st = useApp();
  const svg = useMemo(() => viewSvgString(st), [st.p, st.view]);
  return (
    <div className="view">
      <div className="view-head"><h1>團隊組織</h1><span className="sub">依各人員的「直屬主管」建立</span></div>
      <div className="toolbar">
        <button className="btn" onClick={() => st.setView('resources')}><Icon name="users" />編輯團隊</button>
        <span className="spacer" /><ZoomTools />
      </div>
      {svg ? <Canvas svg={svg} /> : <Empty title="目前沒有團隊成員" text="Add resources and set who each person reports to." />}
    </div>
  );
}
