import { AssistantChat } from '@/modules/assistant/AssistantChat';

/**
 * Executive AI — the super-admin platform-intelligence assistant (Module 6).
 * Rendered inside SuperAdminLayout's outlet, so it mounts the shared chat
 * surface directly.
 */
export default function ExecutiveAI() {
  return <AssistantChat />;
}
