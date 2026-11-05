import { getDb } from '@/db';
import { authenticated, fail, json, listProjects, payload, preparePlan, readProject, recordId } from '@/db/plans';
import { projects } from '@/db/schema';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return authenticated(request, async ownerId => json(await listProjects(ownerId)));
}

export function POST(request: Request) {
  return authenticated(request, async ownerId => {
    const body = await payload(request);
    const id = recordId(body.id);
    const { plan, planText, summary } = preparePlan(body.plan);
    const created = await getDb().insert(projects).values({
      id, ownerId, name: plan.name, plan: planText, summary, updatedAt: new Date().toISOString(),
    }).onConflictDoNothing().returning({ id: projects.id, revision: projects.revision });
    if (created.length) return json({ ...created[0], plan }, 201);

    const existing = await readProject(ownerId, id);
    if (existing.plan !== planText) fail(409, '這個專案已經存在。請從儀表板開啟。');
    return json({ id, revision: existing.revision, plan });
  });
}
