import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import App from './App';
import Dashboard from './views/Dashboard';
import DialogHost from './components/Dialogs';
import { Toast } from './components/Toast';
import { S, useStore } from './store';
import { downloadPlan, errorMessage, flushCloud, hasUnsavedChanges, openCloudProject, reloadCloudProject } from './lib/cloud';

export interface PlannerProps {
  displayName: string;
  signOutUrl: string;
}

class PlannerBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() {
    if (!this.state.error) return this.props.children;
    return <div className="cloud-loading">
      <h1>OpenPlan 暫時無法顯示</h1>
      <p>可先下載目前編輯中的計畫，再重新載入網頁。</p>
      <div className="cloud-actions">
        {S().cloudId && <button className="btn" onClick={() => downloadPlan(S().p)}>下載計畫備份</button>}
        <button className="btn primary" onClick={() => location.reload()}>重新載入</button>
      </div>
    </div>;
  }
}

function SaveIssue() {
  const state = useStore(s => s.saveState);
  const message = useStore(s => s.saveError);
  const [working, setWorking] = useState(false);
  if (state !== 'error' && state !== 'conflict') return null;
  return <aside className="cloud-alert" role="alert">
    <span><b>變更尚未儲存。</b> {message}</span>
    <button className="btn" onClick={() => downloadPlan(S().p)}>下載這份計畫</button>
    {state === 'conflict'
      ? <button className="btn" disabled={working} onClick={async () => {
        if (!window.confirm('要載入雲端的最新版本嗎？目前未儲存的變更會被捨棄。')) return;
        setWorking(true);
        try { await reloadCloudProject(); } catch (error) { S().toast(errorMessage(error), true); }
        finally { setWorking(false); }
      }}>載入最新版本</button>
      : <button className="btn" onClick={() => void flushCloud()}>重試儲存</button>}
  </aside>;
}

export default function Planner(props: PlannerProps) {
  const id = useStore(s => s.cloudId);
  const theme = useStore(s => s.theme);
  const [opening, setOpening] = useState(() => new URLSearchParams(location.search).has('project'));
  const didOpen = useRef(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  useEffect(() => {
    if (didOpen.current) return;
    didOpen.current = true;
    const query = new URLSearchParams(location.search);
    const id = query.get('project');
    if (!id) return;
    const task = Number(query.get('task'));
    void openCloudProject(id, Number.isSafeInteger(task) && task > 0 ? task : undefined)
      .catch(error => {
        S().toast(errorMessage(error), true);
        const url = new URL(location.href);
        url.searchParams.delete('project');
        url.searchParams.delete('task');
        history.replaceState(null, '', url);
      }).finally(() => setOpening(false));
  }, []);
  useEffect(() => {
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const saveWhenHidden = () => {
      if (document.visibilityState === 'hidden' && S().saveState === 'pending') void flushCloud();
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    document.addEventListener('visibilitychange', saveWhenHidden);
    return () => {
      window.removeEventListener('beforeunload', warnBeforeLeaving);
      document.removeEventListener('visibilitychange', saveWhenHidden);
    };
  }, []);

  return <PlannerBoundary>
    <div id="root">
      {opening ? <div className="cloud-loading" role="status">正在開啟專案…</div>
        : id ? <><SaveIssue /><App key={id} /></>
        : <Dashboard {...props} />}
      <DialogHost />
      <Toast />
    </div>
  </PlannerBoundary>;
}
