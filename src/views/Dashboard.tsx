import { useEffect, useRef, useState, type FormEvent } from 'react';
import OP from '../core';
import Icon from '../components/Icon';
import { blankPlan, createCloudProject, deleteCloudProject, errorMessage, fetchProjects, openCloudProject } from '../lib/cloud';
import { MAX_PLAN_BYTES, shortDate, taipeiToday, type ProjectCard } from '../cloud-model';
import { S, useStore } from '../store';
import type { PlannerProps } from '../Planner';

type TaskFilter = 'upcoming' | 'overdue' | 'milestones' | 'all';
const FILTERS: [TaskFilter, string][] = [
  ['upcoming', '七天內到期'], ['overdue', '已逾期'], ['milestones', '里程碑'], ['all', '全部任務'],
];

export default function Dashboard({ displayName, signOutUrl }: PlannerProps) {
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [filter, setFilter] = useState<TaskFilter>('upcoming');
  const [person, setPerson] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const pendingCreate = useRef<{ name: string; id: string } | null>(null);
  const actionInProgress = useRef(false);
  const theme = useStore(s => s.theme);

  async function refresh() {
    setLoading(true);
    setError('');
    try { setProjects(await fetchProjects()); }
    catch (error) { setError(errorMessage(error)); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    document.title = '專案儀表板 · OpenPlan 台灣版';
    void refresh();
  }, []);

  async function run(action: () => Promise<unknown>) {
    if (actionInProgress.current) return;
    actionInProgress.current = true;
    setBusy(true);
    setError('');
    try { await action(); }
    catch (error) { setError(errorMessage(error)); }
    finally { actionInProgress.current = false; setBusy(false); }
  }

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = name.trim();
    if (!title) return;
    if (pendingCreate.current?.name !== title) pendingCreate.current = { name: title, id: crypto.randomUUID() };
    const id = pendingCreate.current.id;
    void run(() => createCloudProject(blankPlan(title), id));
  }

  const today = taipeiToday();
  const nextWeek = new Date(Date.parse(today) + 7 * 86_400_000).toISOString().slice(0, 10);
  const allTasks = projects.flatMap(project => project.tasks.map(task => ({
    ...task, projectId: project.id, projectName: project.name, due: task.deadline || task.finish,
  })));
  const isUpcoming = (task: typeof allTasks[number]) => task.percent < 100 && task.due >= today && task.due < nextWeek;
  const isOverdue = (task: typeof allTasks[number]) => task.percent < 100 && task.due < today;
  const isMilestone = (task: typeof allTasks[number]) => task.percent < 100 && task.milestone;
  const people = Array.from(new Set(allTasks.flatMap(task => task.people))).sort((a, b) => a.localeCompare(b, 'zh-TW'));
  const visibleTasks = allTasks.filter(task => {
    const matches = filter === 'all' || (filter === 'upcoming' ? isUpcoming(task) : filter === 'overdue' ? isOverdue(task) : isMilestone(task));
    return matches && (!projectFilter || projectFilter === task.projectId) && (!person || task.people.includes(person));
  }).sort((a, b) => a.due.localeCompare(b.due) || a.name.localeCompare(b.name, 'zh-TW'));

  const nextMilestone = allTasks.filter(task => isMilestone(task) && task.due >= today)
    .sort((a, b) => a.due.localeCompare(b.due))[0];
  const date = new Intl.DateTimeFormat('zh-TW', { month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Taipei' }).format();

  return <div className="cloud-shell">
    <header className="cloud-header">
      <a className="cloud-brand" href="/" aria-label="OpenPlan 儀表板">
        <img src="/assets/icon-192.png" width={32} height={32} alt="" />
        <strong>OpenPlan</strong><span>台灣版</span>
      </a>
      <div className="cloud-account">
        <span className="cloud-account-name" title={displayName}>{displayName}</span>
        <button className="icon-btn cloud-theme" title="切換深色或淺色模式" aria-label="切換深色或淺色模式"
          onClick={() => S().setUI({ theme: theme === 'dark' ? 'light' : 'dark' })}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
        <a className="cloud-signout" href={signOutUrl} target="_top">登出</a>
      </div>
    </header>
    <main className="cloud-dashboard">
      <section className="cloud-intro">
        <div><p className="cloud-date">{date}</p><h1>專案儀表板</h1><p>掌握每個專案的進度，排定接下來要做的事。</p></div>
        <div className="cloud-actions">
          <button className="btn" disabled={busy} onClick={() => fileInput.current?.click()}><Icon name="upload" />匯入專案</button>
          <button className="btn primary" disabled={busy} onClick={() => setCreating(!creating)}><Icon name="plus" />新增專案</button>
        </div>
        <input type="file" hidden ref={fileInput} accept=".openplan,.json,application/json" onChange={event => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (!file) return;
          void run(async () => {
            if (file.size > MAX_PLAN_BYTES * 2) throw new Error('檔案太大，請先將計畫拆成較小的專案。');
            await createCloudProject(OP.io.fromJSON(await file.text()));
          });
        }} />
      </section>

      {creating && <form className="cloud-create" onSubmit={create}>
        <label htmlFor="new-project-name">專案名稱</label>
        <input className="inp" id="new-project-name" autoFocus required maxLength={160} placeholder="例如：網站改版" value={name} onChange={e => setName(e.target.value)} />
        <button type="submit" className="btn primary" disabled={busy || !name.trim()}>建立專案</button>
        <button type="button" className="btn" onClick={() => setCreating(false)} disabled={busy}>取消</button>
      </form>}
      {error && <div className="cloud-alert" role="alert"><span>{error}</span><button className="btn" onClick={() => void refresh()} disabled={loading || busy}>重新整理清單</button></div>}

      <section className="cloud-kpis" aria-label="專案摘要">
        <article><span><Icon name="layers" />專案</span><strong>{projects.length}</strong><small>所有計畫</small></article>
        <button onClick={() => setFilter('upcoming')}><span><Icon name="calendar" />七天內到期</span><strong>{allTasks.filter(isUpcoming).length}</strong><small>含今天，僅計未完成</small></button>
        <button onClick={() => setFilter('overdue')}><span><Icon name="alert" />已逾期</span><strong className="cloud-overdue">{allTasks.filter(isOverdue).length}</strong><small>已過到期日且未完成</small></button>
        <button onClick={() => setFilter('milestones')}><span><Icon name="diamond" />下一個里程碑</span><strong className="cloud-kpi-text">{nextMilestone ? shortDate(nextMilestone.due) : '—'}</strong><small title={nextMilestone?.name}>{nextMilestone?.name ?? '目前沒有即將到來的里程碑'}</small></button>
      </section>

      <section className="cloud-section" aria-labelledby="cloud-projects-title">
        <div className="cloud-section-head"><h2 id="cloud-projects-title">我的專案</h2><button className="btn" onClick={() => void refresh()} disabled={loading || busy}>重新整理</button></div>
        {loading ? <p className="cloud-empty" role="status">正在載入專案…</p>
          : projects.length ? <div className="cloud-projects">{projects.map(project => <article className="cloud-project" key={project.id}>
            <div className="cloud-project-top"><Icon name="gantt" /><button className="icon-btn" title="刪除專案" aria-label={'刪除專案 ' + project.name}
              disabled={busy} onClick={() => {
                if (!window.confirm('確定刪除「' + project.name + '」及其雲端版本嗎？')) return;
                void run(async () => { await deleteCloudProject(project); await refresh(); });
              }}><Icon name="trash" /></button></div>
            <button className="cloud-project-name" disabled={busy} onClick={() => void run(() => openCloudProject(project.id))}>{project.name}</button>
            <p>{project.tasks.length} 項工作 · {shortDate(project.start)} 至 {shortDate(project.finish)}</p>
            <div className="cloud-progress"><label htmlFor={'progress-' + project.id}>完成率 <b>{project.percent}%</b></label>
              <progress id={'progress-' + project.id} value={project.percent} max={100} /></div>
          </article>)}</div>
          : <div className="cloud-empty"><h3>建立你的第一個專案</h3><p>從空白專案開始，或用範例體驗時程和任務指派。</p>
            <button className="btn" disabled={busy} onClick={() => void run(() => createCloudProject(OP.demo()))}>建立範例專案</button></div>}
      </section>

      <section className="cloud-section" aria-labelledby="cloud-tasks-title">
        <div className="cloud-section-head"><h2 id="cloud-tasks-title">任務追蹤</h2>
          <div className="cloud-filters">
            <select className="inp" value={projectFilter} onChange={e => setProjectFilter(e.target.value)} aria-label="依專案篩選">
              <option value="">所有專案</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
            <select className="inp" value={person} onChange={e => setPerson(e.target.value)} aria-label="依責任人篩選">
              <option value="">所有責任人</option>{people.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
        </div>
        <div className="cloud-tabs" aria-label="任務狀態篩選">
          {FILTERS.map(([key, label]) => <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}
        </div>
        {visibleTasks.length ? <div className="cloud-table"><table>
          <thead><tr><th>任務</th><th>專案</th><th>責任人</th><th>到期日</th><th>進度</th></tr></thead>
          <tbody>{visibleTasks.map(task => <tr key={task.projectId + ':' + task.uid}>
            <td><button className="cloud-task-link" disabled={busy} onClick={() => void run(() => openCloudProject(task.projectId, task.uid))}>{task.name || '未命名任務'}</button>
              {task.milestone && <span className="cloud-pill">里程碑</span>}</td>
            <td>{task.projectName}</td><td>{task.people.join('、') || '未指派'}</td>
            <td className={isOverdue(task) ? 'cloud-overdue' : ''}>{shortDate(task.due)}</td><td>{task.percent}%</td>
          </tr>)}</tbody>
        </table></div> : <p className="cloud-empty">{loading ? '正在載入任務…' : '目前沒有符合篩選條件的任務。'}</p>}
      </section>
      <footer className="cloud-footer">OpenPlan 台灣版 · <a href="https://github.com/MNSBaanu/OpenPlan" target="_blank" rel="noreferrer">開放原始碼</a></footer>
    </main>
  </div>;
}
