import { chatGPTSignOutPath, requireChatGPTUser } from './chatgpt-auth';
import PlannerGate from './planner-gate';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await requireChatGPTUser('/');
  return <PlannerGate displayName={user.displayName} signOutUrl={chatGPTSignOutPath()} />;
}
