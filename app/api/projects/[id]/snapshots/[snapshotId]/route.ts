import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { authenticated, fail, json, readProject, recordId } from '@/db/plans';
import { snapshots } from '@/db/schema';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string; snapshotId: string }> };

export function GET(request: Request, context: Context) {
  return authenticated(request, async ownerId => {
    const params = await context.params;
    const projectId = recordId(params.id);
    await readProject(ownerId, projectId);
    const id = recordId(params.snapshotId);
    const row = await getDb().select({ plan: snapshots.plan }).from(snapshots)
      .where(and(eq(snapshots.projectId, projectId), eq(snapshots.id, id))).get();
    if (!row) fail(404, '找不到這個版本。');
    return json({ plan: JSON.parse(row.plan) });
  });
}

export function DELETE(request: Request, context: Context) {
  return authenticated(request, async ownerId => {
    const params = await context.params;
    const projectId = recordId(params.id);
    await readProject(ownerId, projectId);
    const id = recordId(params.snapshotId);
    await getDb().delete(snapshots).where(and(eq(snapshots.projectId, projectId), eq(snapshots.id, id)));
    return json({ id });
  });
}
