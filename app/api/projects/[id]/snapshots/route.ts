import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { authenticated, fail, json, payload, readProject, recordId } from '@/db/plans';
import { snapshots } from '@/db/schema';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

export function GET(request: Request, context: Context) {
  return authenticated(request, async ownerId => {
    const projectId = recordId((await context.params).id);
    await readProject(ownerId, projectId);
    const rows = await getDb().select({
      id: snapshots.id, name: snapshots.name, createdAt: snapshots.createdAt,
    }).from(snapshots).where(eq(snapshots.projectId, projectId)).orderBy(desc(snapshots.createdAt)).all();
    return json(rows);
  });
}

export function POST(request: Request, context: Context) {
  return authenticated(request, async ownerId => {
    const projectId = recordId((await context.params).id);
    const project = await readProject(ownerId, projectId);
    const body = await payload(request);
    const id = recordId(body.id);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > 80) fail(422, '請輸入 1 到 80 個字的版本名稱。');
    const db = getDb();
    const duplicate = await db.select({ id: snapshots.id, name: snapshots.name, createdAt: snapshots.createdAt })
      .from(snapshots).where(and(eq(snapshots.id, id), eq(snapshots.projectId, projectId))).get();
    if (duplicate) return json(duplicate);
    if (project.revision !== body.revision) fail(409, '專案已有更新，請先重新載入再儲存版本。');

    const createdAt = new Date().toISOString();
    await db.insert(snapshots).values({ id, name, projectId, plan: project.plan, createdAt }).onConflictDoNothing();
    return json({ id, name, createdAt }, 201);
  });
}
