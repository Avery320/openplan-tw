import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { authenticated, fail, json, ownerProject, payload, preparePlan, readProject, recordId } from '@/db/plans';
import { projects } from '@/db/schema';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

export function GET(request: Request, context: Context) {
  return authenticated(request, async ownerId => {
    const id = recordId((await context.params).id);
    const row = await readProject(ownerId, id);
    return json({ id, revision: row.revision, plan: JSON.parse(row.plan) });
  });
}

export function PUT(request: Request, context: Context) {
  return authenticated(request, async ownerId => {
    const id = recordId((await context.params).id);
    const body = await payload(request);
    const revision = body.revision;
    if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1) fail(400, '缺少有效的版本編號。');

    const current = await readProject(ownerId, id);
    const { plan, planText, summary } = preparePlan(body.plan);
    if (current.plan === planText) return json({ revision: current.revision });
    if (current.revision !== revision) fail(409, '另一個分頁或裝置已更新這個專案。');

    const updated = await getDb().update(projects).set({
      name: plan.name, plan: planText, summary, revision: sql`${projects.revision} + 1`, updatedAt: new Date().toISOString(),
    }).where(and(ownerProject(ownerId, id), eq(projects.revision, revision))).returning({ revision: projects.revision });
    if (!updated.length) fail(409, '另一個分頁或裝置已更新這個專案。');
    return json(updated[0]);
  });
}

export function DELETE(request: Request, context: Context) {
  return authenticated(request, async ownerId => {
    const id = recordId((await context.params).id);
    const revision = Number(new URL(request.url).searchParams.get('revision'));
    const deleted = await getDb().delete(projects).where(
      and(ownerProject(ownerId, id), eq(projects.revision, revision)),
    ).returning({ id: projects.id });
    if (!deleted.length) fail(409, '這個專案已變更或已刪除。請重新整理儀表板。');
    return json({ id });
  });
}
