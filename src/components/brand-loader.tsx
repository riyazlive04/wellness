/**
 * The NUSI loading screen ("Pop + name"): the logo pops in, then N-U-S-I
 * follow one by one, on a loop. Same animation as the website's loader.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';

const LETTERS = ['N', 'U', 'S', 'I'];
const CYCLE = 2800;

export function BrandLoader({ label = 'Loading NUSI' }: { label?: string }) {
  const t = useTheme();
  const [logo] = useState(() => new Animated.Value(0));
  const [letters] = useState(() => LETTERS.map(() => new Animated.Value(0)));
  const [still, setStill] = useState(false);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((r) => { if (alive && r) setStill(true); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (still) {
      logo.setValue(1);
      letters.forEach((l) => l.setValue(1));
      return;
    }
    const pop = Animated.spring(logo, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true });
    const show = Animated.stagger(100, letters.map((l) => Animated.timing(l, { toValue: 1, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: true })));
    const hide = Animated.parallel([
      Animated.timing(logo, { toValue: 0, duration: 380, useNativeDriver: true }),
      ...letters.map((l) => Animated.timing(l, { toValue: 0, duration: 380, useNativeDriver: true })),
    ]);
    const loop = Animated.loop(Animated.sequence([pop, Animated.delay(120), show, Animated.delay(CYCLE - 1500), hide, Animated.delay(150)]));
    loop.start();
    return () => loop.stop();
  }, [logo, letters, still]);

  return (
    <View style={[styles.wrap, { backgroundColor: t.colors.canvas }]} accessibilityRole="progressbar" accessibilityLabel={label}>
      <Animated.Image
        source={require('../../assets/images/nusi-mark.png')}
        style={[styles.logo, { opacity: logo, transform: [{ scale: logo.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }]}
      />
      <View style={styles.row}>
        {LETTERS.map((ch, i) => (
          <Animated.View
            key={ch}
            style={{ opacity: letters[i], transform: [{ translateY: letters[i].interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
            <AppText style={[styles.letter, { color: t.colors.text }]}>{ch}</AppText>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 76, height: 76, borderRadius: 20 },
  row: { flexDirection: 'row', gap: 14, marginTop: 14 },
  letter: { fontSize: 15, fontWeight: '700' },
});
