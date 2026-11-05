import { and, desc, eq } from 'drizzle-orm';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getDb } from './index';
import { projects } from './schema';
import OP from '@/src/core';
import { MAX_PLAN_BYTES, type PlanSummary } from '@/src/cloud-model';
import type { Project, Schedule } from '@/src/types';

class RequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

export function fail(status: number, message: string): never {
  throw new RequestError(status, message);
}

export async function authenticated(request: Request, run: (ownerId: string) => Promise<Response>) {
  try {
    const user = await getChatGPTUser();
    if (!user) fail(401, '請重新登入 ChatGPT。');
    if (request.method !== 'GET' && request.headers.get('Sec-Fetch-Site') === 'cross-site') {
      fail(403, '請從 OpenPlan 網站操作。');
    }
    return await run(user.userId);
  } catch (error) {
    if (error instanceof RequestError) return json({ error: error.message }, error.status);
    console.error('OpenPlan request failed', error instanceof Error ? error.name : 'UnknownError');
    return json({ error: '伺服器暫時無法處理，請稍後再試。' }, 500);
  }
}

export async function payload(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') {
    fail(415, '請使用 JSON 格式。');
  }
  const maxBytes = MAX_PLAN_BYTES + 4_000;
  const reader = request.body?.getReader();
  if (!reader) fail(400, '找不到專案資料。');
  let total = 0;
  const decoder = new TextDecoder();
  let body = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      fail(413, '這份專案超出雲端存檔大小上限。請先匯出備份。');
    }
    body += decoder.decode(value, { stream: true });
  }
  try {
    const parsed: unknown = JSON.parse(body + decoder.decode());
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch { /* respond with the same message for invalid JSON and non-object bodies */ }
  return fail(400, '無法讀取專案資料。');
}

export function recordId(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)) {
    fail(404, '找不到這筆資料。');
  }
  return value;
}

export function ownerProject(ownerId: string, id: string) {
  return and(eq(projects.ownerId, ownerId), eq(projects.id, id));
}

export async function readProject(ownerId: string, id: string) {
  const row = await getDb().select().from(projects).where(ownerProject(ownerId, id)).get();
  if (!row) fail(404, '找不到這個專案。');
  return row;
}

export async function listProjects(ownerId: string) {
  const rows = await getDb().select({
    id: projects.id, name: projects.name, revision: projects.revision,
    updatedAt: projects.updatedAt, summary: projects.summary,
  }).from(projects).where(eq(projects.ownerId, ownerId)).orderBy(desc(projects.updatedAt)).all();
  return rows.map(({ summary, ...row }) => ({ ...row, ...JSON.parse(summary) as PlanSummary }));
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '1900-01-01' && value <= '2200-12-31' && OP.util.parseDate(value) !== null;
}

export function preparePlan(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(422, '請提供一份有效的 OpenPlan 專案。');
  const candidate = input as Partial<Project>;
  if (!Array.isArray(candidate.tasks) || !Array.isArray(candidate.resources)) fail(422, '找不到任務或資源清單。');
  if (candidate.tasks.length > 500 || candidate.resources.length > 200) {
    fail(422, '每個專案最多支援 500 項任務與 200 筆資源。');
  }

  let plan: Project;
  try {
    plan = OP.io.fromJSON(JSON.stringify(candidate));
  } catch {
    return fail(422, '無法讀取這份 OpenPlan 專案。');
  }
  plan.name = plan.name.trim() || '未命名專案';
  if (plan.name.length > 160) fail(422, '專案名稱最多 160 個字。');
  if (![plan.start, plan.statusDate, ...plan.holidays].filter(Boolean).every(validDate) || !validDate(plan.start)) {
    fail(422, '請確認專案的開始日期、狀態日期和假日。');
  }

  const dates = [plan.start];
  let duration = 0;
  for (const task of plan.tasks) {
    dates.push(...[task.actualStart, task.actualFinish, task.constraintDate, task.deadline].filter(Boolean));
    const totalGap = task.splits.reduce((sum, split) => sum + split.gap, 0);
    duration += task.duration + task.levelDelay + totalGap;
    if (task.level > 50 || task.preds.length > 100 || task.preds.some(link => Math.abs(link.lag) > 2600)) {
      fail(422, '任務階層或前置關係超出此站支援的範圍。');
    }
  }
  if (duration > 50_000 || !dates.every(validDate) || Math.max(...dates.map(date => Math.abs(OP.util.parseDate(date) - OP.util.parseDate(plan.start)))) > 18_300) {
    fail(422, '工期或任務日期超出此站支援的範圍。');
  }

  const planText = JSON.stringify(plan);
  if (new TextEncoder().encode(planText).byteLength > MAX_PLAN_BYTES) fail(413, '這份專案超出雲端存檔大小上限。請先匯出備份。');
  const schedule: Schedule = OP.schedule(plan);
  if (schedule.cycle.length) fail(422, '發現循環依賴，請調整任務的前置關係。');
  const tasks = schedule.rows.filter(row => !row.summary);
  const durationTotal = tasks.reduce((sum, row) => sum + row.duration, 0);
  const done = tasks.reduce((sum, row) => sum + row.duration * row.percent, 0);
  const resourceNames = new Map(plan.resources.filter(resource => resource.kind === 'Work').map(resource => [resource.uid, resource.name]));
  const summary: PlanSummary = {
    start: OP.util.iso(schedule.startDn),
    finish: OP.util.iso(schedule.finishDn),
    percent: durationTotal ? Math.round(done / durationTotal) : 0,
    tasks: tasks.map(row => ({
      uid: row.task.uid, name: row.task.name, finish: OP.util.iso(row.finishDn),
      deadline: row.task.deadline, percent: row.percent, milestone: row.milestone, critical: row.critical,
      people: row.task.assignments.map(assignment => resourceNames.get(assignment.res) ?? '').filter(Boolean),
    })),
  };
  return { plan, planText, summary: JSON.stringify(summary) };
}
