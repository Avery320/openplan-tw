import OP from '../core';
import { attachEditor, S, useStore } from '../store';
import { taipeiToday, type CloudProject, type ProjectCard, type Snapshot } from '../cloud-model';
import type { Project } from '../types';

type Session = {
  id: string;
  revision: number;
  draft: string;
  saved: string;
  timer: number;
  inFlight: Promise<boolean> | null;
  conflict: boolean;
};

let active: Session | null = null;

class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export function errorMessage(error: unknown) {
  return error instanceof Error && !(error instanceof TypeError) && error.name !== 'TimeoutError'
    ? error.message : '連線暫時中斷，請確認網路後再試。';
}

async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch('/api/projects' + path, {
    method, cache: 'no-store', signal: AbortSignal.timeout(20_000),
    ...(body === undefined ? {} : {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result === null) {
    const message = result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
      ? result.error : '請重新登入或稍後再試。';
    throw new ApiError(response.status, message);
  }
  return result as T;
}

export function blankPlan(name = '未命名專案'): Project {
  const plan: Project = OP.model.blank();
  plan.name = name;
  plan.start = taipeiToday();
  plan.issueDate = plan.start;
  const self = OP.model.newResource(plan, { name: '我' });
  plan.resources.push(self);
  return plan;
}

export const fetchProjects = () => api<ProjectCard[]>('');
export const deleteCloudProject = (project: ProjectCard) => api('/' + project.id + '?revision=' + project.revision, 'DELETE');
export const hasUnsavedChanges = () => !!active && active.draft !== active.saved;

function changeAddress(id?: string, taskUid?: number) {
  const url = new URL(window.location.href);
  url.hash = '';
  if (id) url.searchParams.set('project', id);
  else url.searchParams.delete('project');
  if (taskUid != null) url.searchParams.set('task', String(taskUid));
  else url.searchParams.delete('task');
  window.history.replaceState(null, '', url);
}

function activate(doc: CloudProject, taskUid?: number) {
  if (active) window.clearTimeout(active.timer);
  const saved = JSON.stringify(doc.plan);
  const session: Session = { id: doc.id, revision: doc.revision, saved, draft: saved, timer: 0, inFlight: null, conflict: false };
  active = session;
  attachEditor(doc.id, doc.plan, draft => {
    session.draft = draft;
    if (session.conflict) return;
    useStore.setState({ saveState: 'pending', saveError: '' });
    window.clearTimeout(session.timer);
    session.timer = window.setTimeout(() => void flushCloud(), 500);
  }, taskUid);
  changeAddress(doc.id, taskUid);
}

async function drain(session: Session): Promise<boolean> {
  try {
    while (session.draft !== session.saved) {
      const draft = session.draft;
      const { revision } = await api<{ revision: number }>('/' + session.id, 'PUT', {
        revision: session.revision, plan: JSON.parse(draft),
      });
      session.saved = draft;
      session.revision = revision;
    }
    if (active === session) useStore.setState({ saveState: 'ok', saveError: '' });
    return true;
  } catch (error) {
    session.conflict = error instanceof ApiError && error.status === 409;
    if (active === session) useStore.setState({ saveState: session.conflict ? 'conflict' : 'error', saveError: errorMessage(error) });
    return false;
  }
}

export function flushCloud(): Promise<boolean> {
  const session = active;
  if (!session) return Promise.resolve(true);
  if (session.conflict) return Promise.resolve(false);
  window.clearTimeout(session.timer);
  if (!session.inFlight) {
    if (session.draft !== session.saved) useStore.setState({ saveState: 'pending', saveError: '' });
    session.inFlight = drain(session).finally(() => { session.inFlight = null; });
  }
  return session.inFlight;
}

async function requireSaved() {
  if (!await flushCloud()) throw new Error(S().saveError || '請先完成目前的雲端存檔。');
}

export async function createCloudProject(plan: Project, id = crypto.randomUUID()) {
  await requireSaved();
  const doc = await api<CloudProject>('', 'POST', { id, plan });
  await requireSaved();
  activate(doc);
}

export async function openCloudProject(id: string, taskUid?: number) {
  await requireSaved();
  activate(await api<CloudProject>('/' + id), taskUid);
}

export async function leaveCloudProject() {
  await requireSaved();
  active = null;
  attachEditor(null, blankPlan(), () => {});
  changeAddress();
}

export async function reloadCloudProject() {
  const session = active;
  if (!session) return;
  if (session.inFlight) await session.inFlight;
  const doc = await api<CloudProject>('/' + session.id);
  if (active === session) activate(doc);
}

export const fetchSnapshots = (id: string) => api<Snapshot[]>('/' + id + '/snapshots');

export async function saveSnapshot(name: string) {
  await requireSaved();
  if (!active) throw new Error('請先開啟專案。');
  return api<Snapshot>('/' + active.id + '/snapshots', 'POST', { id: crypto.randomUUID(), name, revision: active.revision });
}

export async function restoreSnapshot(projectId: string, snapshotId: string) {
  const { plan } = await api<{ plan: Project }>('/' + projectId + '/snapshots/' + snapshotId);
  if (active?.id === projectId) S().replaceProject(plan, '已還原版本。');
}

export const removeSnapshot = (id: string, snapshotId: string) => api('/' + id + '/snapshots/' + snapshotId, 'DELETE');

export function downloadPlan(plan: Project) {
  const name = plan.name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').trim() || '專案備份';
  OP.util.download(name + '.openplan', OP.io.toJSON(plan), 'application/x-openplan');
}
