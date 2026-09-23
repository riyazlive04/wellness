/**
 * Today — the client dashboard.
 *
 * The composition of this screen is server-driven: which blocks appear, in what
 * order, and what the practice calls them all come from the published `home`
 * layout. The blocks themselves are still real components, registered in
 * components/sdui/natives.tsx — this file used to hold them inline and that is
 * where they moved to, unchanged.
 *
 * When no layout has been published, `useScreen` returns the built-in default,
 * which reproduces exactly what this screen rendered before.
 */
import { useScreen } from '@/contexts/sdui-context';
import { SduiScreenView } from '@/components/sdui/screen';

export default function Today() {
  const screen = useScreen('home');
  return <SduiScreenView screen={screen} />;
}
