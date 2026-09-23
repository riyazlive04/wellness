/**
 * More — the grouped navigation list.
 *
 * Fully server-driven: the groups, their order, the rows inside them and their
 * labels all come from the published `more` layout. This is the surface that
 * most wanted it — a practice that does not run a shop, a community or a cycle
 * tracker should not be showing its clients those rows.
 *
 * Plan-gated rows are cut on the server (see pruneForFeatures), so a row that
 * arrives here is one this workspace is entitled to.
 */
import { useScreen } from '@/contexts/sdui-context';
import { SduiScreenView } from '@/components/sdui/screen';

export default function MoreIndex() {
  const screen = useScreen('more');
  return <SduiScreenView screen={screen} />;
}
