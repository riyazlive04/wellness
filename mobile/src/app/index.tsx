import { ActivityIndicator, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

/**
 * Root splash. The auth gate in _layout redirects away from here to either the
 * tabs (signed in) or the login screen (signed out) once the session resolves.
 */
export default function Index() {
  const t = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: t.colors.canvas,
      }}>
      <ActivityIndicator color={t.colors.accent} />
    </View>
  );
}
