import { labelFor } from '../locale';
import { useEffect, useState, type JSX } from 'react';
import OP from '../core';
import { useApp, ask, VIEW_NAMES, ZOOMS, S } from '../store';
import { hasImage, loadProject, openTemplate, runAction } from '../lib/actions';
import { TEMPLATES } from '../lib/templates';
import { errorMessage, fetchSnapshots, leaveCloudProject, removeSnapshot, restoreSnapshot, saveSnapshot } from '../lib/cloud';
import type { Snapshot } from '../cloud-model';
import Icon from './Icon';
import type { ViewName } from '../types';

const U = OP.util;
const LOGO_MARK = '/assets/OpenPlan.png';

/* ---------- title bar ---------- */

export function TitleBar() {
  const st = useApp();
  const [renaming, setRenaming] = useState(false);
  useEffect(() => { document.title = st.p.name + ' - OpenPlan'; }, [st.p.name]);
  const rename = (value: string) => {
    setRenaming(false);
    const name = value.trim();
    if (name && name !== st.p.name) st.commit(pp => { pp.name = name; });
  };
  return (
    <header className="titlebar">
      <div className="qat">
        <button className="qat-btn home cloud-home" title="返回專案儀表板" aria-label="返回專案儀表板" onClick={() => {
          void leaveCloudProject().catch(error => S().toast(errorMessage(error), true));
        }}><img className="app-icon" src={LOGO_MARK} alt="" /><span>儀表板</span></button>
        <button className="qat-btn" title="儲存至雲端（Ctrl+S）" aria-label="儲存" onClick={() => runAction('save')}><Icon name="save" /></button>
        <button className="qat-btn" title="復原（Ctrl+Z）" aria-label="復原" disabled={!st.undo.length} onClick={st.undoAct}><Icon name="undo" /></button>
        <button className="qat-btn" title="重做（Ctrl+Y）" aria-label="重做" disabled={!st.redo.length} onClick={st.redoAct}><Icon name="redo" /></button>
      </div>
      <div className="title">
        {renaming
          ? <input className="title-inp" aria-label="專案名稱" defaultValue={st.p.name} maxLength={160} size={st.p.name.length || 8} autoFocus onFocus={e => e.target.select()}
              onBlur={e => rename(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') e.currentTarget.value = st.p.name; if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur(); }} />
          : <button className="title-btn" title="重新命名專案" onClick={() => setRenaming(true)}>{st.p.name}</button>}
        {' - OpenPlan'}
      </div>
      <div className="tb-right">
        <button className="qat-btn" title="深色／淺色" aria-label="切換深色或淺色模式" onClick={() => st.setUI({ theme: st.theme === 'dark' ? 'light' : 'dark' })}>
          <Icon name={st.theme === 'dark' ? 'sun' : 'moon'} />
        </button>
        <button className="qat-btn" title="關於 OpenPlan" aria-label="關於" onClick={() => st.openDialog('about')}><Icon name="info" /></button>
      </div>
    </header>
  );
}

/* ---------- status bar ---------- */

const SB_VIEWS: [ViewName, string][] = [['gantt', 'gantt'], ['board', 'columns'], ['resources', 'users'], ['network', 'network'], ['reports', 'report']];

export function StatusBar() {
  const st = useApp();
  const zi = ZOOMS.indexOf(st.zoom as any);
  const setZoom = (i: number) => st.setUI({ zoom: ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i))] });
  return (
    <footer className="statusbar">
      <span>就緒</span>
      <span className="sb-sep" />
      <span className="hide-sm">新任務採用自動排程</span>
      <span className="sb-sep hide-sm" />
      <span className="save-state">
        {st.saveState === 'ok' ? <><Icon name="check" />已儲存至雲端</>
          : st.saveState === 'pending' ? <><Icon name="clock" />正在儲存…</>
          : <span style={{ color: 'var(--warn)' }}><Icon name="alert" />尚未儲存</span>}
      </span>
      <span className="spacer" />
      <div className="sb-views">
        {SB_VIEWS.map(([v, icon]) => (
          <button key={v} className={st.view === v ? 'active' : ''} title={VIEW_NAMES[v]} aria-label={VIEW_NAMES[v]} onClick={() => st.setView(v)}><Icon name={icon} /></button>
        ))}
      </div>
      <div className="sb-zoom" title="時程縮放">
        <button className="z-btn" aria-label="縮小" onClick={() => setZoom(zi - 1)}>−</button>
        <input type="range" min={0} max={3} step={1} value={zi} aria-label="時程縮放" onChange={e => setZoom(+e.target.value)} />
        <button className="z-btn" aria-label="放大" onClick={() => setZoom(zi + 1)}>+</button>
      </div>
    </footer>
  );
}

/* ---------- File backstage ---------- */

const PAGES: [string, string][] = [['info', "資訊"], ['new', "新增"], ['open', "開啟"], ['save', "儲存"], ['versions', '版本紀錄'], ['export', "匯出"], ['print', "列印"], ['about', "關於"]];

function Tile({ icon, title, sub, act, disabled }: { icon: string; title: string; sub: string; act: string; disabled?: boolean }) {
  return (
    <button className="bs-tile" disabled={disabled} onClick={() => runAction(act)}>
      <Icon name={icon} /><div><b>{title}</b><span>{sub}</span></div>
    </button>
  );
}

function VersionsPage() {
  const id = useApp().cloudId!;
  const [list, setList] = useState<Snapshot[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    void fetchSnapshots(id).then(value => { if (current) setList(value); })
      .catch(error => { if (current) setError(errorMessage(error)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [id]);

  async function perform(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try { await action(); }
    catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }

  return <>
    <h1>版本紀錄</h1>
    <p className="bs-note">在調整時程前先儲存一份雲端版本，之後可還原到當時的計畫。</p>
    <form className="ver-form" onSubmit={e => {
      e.preventDefault();
      void perform(async () => {
        const saved = await saveSnapshot(name.trim() || '版本 ' + (list.length + 1));
        setList(previous => [saved, ...previous]);
        setName('');
        S().toast('已儲存版本。');
      });
    }}>
      <input className="inp" value={name} onChange={e => setName(e.target.value)} placeholder="例如：改期之前" aria-label="版本名稱" maxLength={80} />
      <button className="btn primary" type="submit" disabled={busy || loading}><Icon name="save" />儲存版本</button>
    </form>
    {error && <p className="alert inline" role="alert">{error}</p>}
    {list.length ? <table className="data ver-list">
      <thead><tr><th>版本</th><th>儲存時間</th><th><span className="sr-only">操作</span></th></tr></thead>
      <tbody>{list.map(v => <tr key={v.id}>
        <td>{v.name}</td><td>{new Date(v.createdAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })}</td>
        <td className="ver-acts">
          <button className="btn" disabled={busy} onClick={() => ask('要還原「' + v.name + '」嗎？可用「復原」回到目前計畫。', () => {
            void perform(() => restoreSnapshot(id, v.id));
          }, '還原')}>還原</button>
          <button className="icon-btn" disabled={busy} aria-label={'刪除版本 ' + v.name} onClick={() => ask('要刪除「' + v.name + '」嗎？', () => {
            void perform(async () => { await removeSnapshot(id, v.id); setList(previous => previous.filter(item => item.id !== v.id)); });
          }, '刪除')}><Icon name="trash" /></button>
        </td>
      </tr>)}</tbody>
    </table> : <p className="muted">{loading ? '正在載入版本…' : '目前沒有已儲存的版本。'}</p>}
  </>;
}

export function Backstage() {
  const st = useApp();
  useEffect(() => {
    if (!st.backstage) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') st.setUI({ backstage: false }); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [st.backstage]);
  if (!st.backstage) return null;
  const p = st.p, s = st.s, page = st.bsPage, img = hasImage(st), viewName = VIEW_NAMES[st.view];
  let body: JSX.Element;
  if (page === 'new') {
    body = <><h1>新增</h1><div className="bs-cards">
      <button className="bs-card" onClick={() => runAction('new')}><div className="bs-thumb blank" /><b>空白專案</b></button>
      <button className="bs-card" onClick={() => runAction('sample')}><div className="bs-thumb sample"><i /><i /><i /></div><b>範例專案</b></button>
    </div><h2 className="bs-sub">範本</h2><div className="bs-cards">
      {TEMPLATES.map(t => (
        <button key={t.id} className="bs-card" onClick={() => openTemplate(t)}>
          <div className="bs-thumb sample"><i /><i /><i /></div><b>{t.name}</b><span className="bs-card-sub">{t.desc}</span>
        </button>
      ))}
    </div></>;
  } else if (page === 'open') {
    body = <><h1>開啟</h1>
      <Tile icon="upload" title="瀏覽…" sub="匯入 .openplan 或 .json，另建新專案" act="open" />
      <Tile icon="table" title="從 Excel 或 CSV 匯入…" sub="貼上試算表中的任務清單，或選擇 CSV 檔案" act="import" />
      <Tile icon="layers" title="插入為子專案…" sub="將另一份專案放在新的摘要任務底下" act="insert" />
      <Tile icon="undo" title="還原上一份計畫" sub="還原這次編輯中被取代的計畫內容" act="restore" disabled={!st.previous} />
    </>;
  } else if (page === 'save') {
    body = <><h1>儲存</h1>
      <Tile icon="save" title="儲存" sub="立即將目前的變更儲存至雲端。快速鍵 Ctrl+S" act="save" />
      <Tile icon="save" title="下載備份…" sub="下載 .openplan 檔案，方便備份或移轉" act="saveas" />
      <p className="bs-note">編輯內容會自動儲存至雲端。也可下載 .openplan 檔案作為備份。</p></>;
  } else if (page === 'versions') {
    body = <VersionsPage />;
  } else if (page === 'export') {
    body = <><h1>匯出</h1>
      <Tile icon="table" title="Excel 活頁簿（.xlsx）" sub="含日期、成本和浮時的任務清單" act="xlsx" />
      <Tile icon="table" title="CSV 檔案（.csv）" sub="以純文字匯出任務清單，適用各種試算表" act="csv" />
      <Tile icon="image" title={"匯出 " + viewName + " 圖片（.png）"} sub={img ? "適合插入文件" : "請先切換到甘特圖、網路圖、工作分解結構或組織圖"} act="png" disabled={!img} />
      <Tile icon="image" title="向量圖（.svg）" sub="縮放時仍能保持清晰" act="svg" disabled={!img} /></>;
  } else if (page === 'print') {
    body = <><h1>列印</h1><Tile icon="printer" title={"列印 " + viewName} sub="可在列印視窗中選擇「另存為 PDF」" act="print" /></>;
  } else if (page === 'about') {
    body = <><h1>關於</h1><img className="logo" src="./assets/OpenPlan.png" alt="OpenPlan" height={48} />
      <p className="bs-note">使用甘特圖、關鍵路徑、工作分解結構、資源調度和報表規劃專案。</p>
      <Tile icon="info" title="快速鍵與說明" sub="查看任務表和甘特圖的操作技巧" act="about" />
      <button className="bs-tile" onClick={() => st.setUI({ guide: true, backstage: false })}><Icon name="check" /><div><b>入門指南</b><span>重新顯示四個入門步驟</span></div></button></>;
  } else {
    const props: [string, string][] = [
      ["開始", U.fmtLong(s.startDn)], ["完成", U.fmtLong(s.finishDn)], ["工期", U.num(s.duration) + " 天"],
      ['成本', U.money(s.totalCost, p.currency)], ["預算", p.budget ? U.money(p.budget, p.currency) : '—'], ['Work', U.num(s.totalWork) + " 小時"],
      ["任務", String(p.tasks.length)], ["資源", String(p.resources.length)], ["狀態", labelFor(p.status)], ["負責人", p.manager || '—'], ["組織", p.organization || '—']
    ];
    body = <><h1>資訊</h1><div className="bs-cols">
      <div><h2>{p.name}</h2>
        <Tile icon="info" title="專案資訊" sub="編輯名稱、開始日期、狀態日期、預算、行事曆和自訂欄位" act="settings" />
        <button className="bs-tile" onClick={() => st.setUI({ backstage: false, tab: 'project' })}>
          <Icon name="layers" /><div><b>{p.baseline ? "已儲存基準線" : "尚未設定基準線"}</b>
            <span>{p.baseline ? "儲存於 " + U.fmtLong(U.parseDate(p.baseline.savedAt.slice(0, 10))) : "選擇「專案 › 設定基準線」，將目前計畫留作比較"}</span></div>
        </button>
      </div>
      <div className="bs-props"><h3>專案內容</h3>{props.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>
    </div></>;
  }
  return (
    <div className="backstage">
      <nav className="bs-nav">
        <button className="bs-back" aria-label="返回" onClick={() => st.setUI({ backstage: false })}><Icon name="up" /></button>
        {PAGES.map(([k, label]) => <button key={k} className={'bs-item' + (page === k ? ' on' : '')} onClick={() => st.setUI({ bsPage: k })}>{label}</button>)}
      </nav>
      <div className="bs-body">{body}</div>
    </div>
  );
}
