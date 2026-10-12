/**
 * The client's garden plant, drawn and animated.
 *
 * Five stages follow the logging streak (seed → sprout → growing → thriving →
 * blooming, see gardenState() on the server). The plant sways gently, sparkles
 * drift around it, and water drops fall while today's care has "watered" it.
 *
 * Built from react-native-svg and React Native's own Animated (native driver),
 * so it ships over the air with no new native code. The pot is a separate,
 * still layer: only the plant above the soil moves.
 */
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

export type GardenStage = 'seed' | 'sprout' | 'growing' | 'thriving' | 'blooming';

/** The neon look: lime leaves and a dark pot, made to glow on a dark backdrop. */
const NEON = {
  leaf: '#84cc16',
  leaf2: '#bef264',
  stem: '#65a30d',
  pot: '#3f3f46',
  rim: '#52525b',
  soil: '#18181b',
  petal: '#f9a8d4',
  spark: '#d9f99d',
};

// viewBox is 120 × 150; the soil line sits at y≈105, which is where the plant pivots.
const VIEW_W = 120;
const VIEW_H = 150;

function Leaf({ x, y, r, s, c }: { x: number; y: number; r: number; s: number; c: string }) {
  return (
    <G transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
      <Path d="M0 0 C7 -11 25 -12 32 0 C25 12 7 11 0 0Z" fill={c} />
    </G>
  );
}

function Flower({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <G transform={`translate(${x} ${y}) scale(${s})`}>
      {[0, 72, 144, 216, 288].map((a) => (
        <Ellipse key={a} cx={0} cy={-7} rx={5} ry={7.5} fill={NEON.petal} transform={`rotate(${a})`} />
      ))}
      <Circle r={4.2} fill="#fde047" />
    </G>
  );
}

function Stem({ top }: { top: number }) {
  const span = 105 - top;
  return (
    <Path
      d={`M60 105 C57 ${top + span * 0.6} 63 ${top + span * 0.3} 60 ${top}`}
      stroke={NEON.stem}
      strokeWidth={4}
      strokeLinecap="round"
      fill="none"
    />
  );
}

function PlantBody({ stage }: { stage: GardenStage }) {
  const { leaf: a, leaf2: b } = NEON;
  if (stage === 'seed') {
    return (
      <G>
        <Ellipse cx={60} cy={101} rx={7} ry={5} fill="#8a5a3b" />
        <Path d="M57 99 q3 -3 6 0" stroke="#c89a72" strokeWidth={1.2} fill="none" />
      </G>
    );
  }
  if (stage === 'sprout') {
    return (
      <G>
        <Stem top={82} />
        <Leaf x={60} y={84} r={-40} s={0.55} c={b} />
        <Leaf x={60} y={84} r={-140} s={0.55} c={a} />
      </G>
    );
  }
  if (stage === 'growing') {
    return (
      <G>
        <Stem top={58} />
        <Leaf x={60} y={92} r={-150} s={0.7} c={a} />
        <Leaf x={60} y={82} r={-28} s={0.75} c={b} />
        <Leaf x={60} y={70} r={-152} s={0.7} c={b} />
        <Leaf x={60} y={60} r={-40} s={0.6} c={a} />
        <Leaf x={60} y={60} r={-140} s={0.55} c={b} />
      </G>
    );
  }
  return (
    <G>
      <Stem top={32} />
      <Leaf x={60} y={96} r={-160} s={0.9} c={a} />
      <Leaf x={60} y={88} r={-18} s={0.95} c={b} />
      <Leaf x={60} y={76} r={-158} s={0.95} c={b} />
      <Leaf x={60} y={66} r={-24} s={0.9} c={a} />
      <Leaf x={60} y={54} r={-150} s={0.85} c={a} />
      <Leaf x={60} y={44} r={-32} s={0.8} c={b} />
      <Leaf x={60} y={34} r={-60} s={0.6} c={b} />
      <Leaf x={60} y={34} r={-122} s={0.6} c={a} />
      {stage === 'blooming' ? (
        <>
          <Flower x={60} y={26} s={1.05} />
          <Flower x={30} y={58} s={0.8} />
          <Flower x={92} y={62} s={0.8} />
        </>
      ) : null}
    </G>
  );
}

function Pot() {
  return (
    <G>
      <Path d="M36 112 h48 l-6 30 a5 5 0 0 1-5 4 h-26 a5 5 0 0 1-5-4z" fill={NEON.pot} />
      <Rect x={31} y={103} width={58} height={12} rx={5} fill={NEON.rim} />
      <Ellipse cx={60} cy={105.5} rx={25} ry={3.2} fill={NEON.soil} />
    </G>
  );
}

/** A value that runs 0 → 1 → 0 forever, offset by `delay` ms. */
function useLoop(duration: number, delay = 0) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: duration / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: duration / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [v, duration, delay]);
  return v;
}

function Sparkle({ x, y, size, delay, scale }: { x: number; y: number; size: number; delay: number; scale: number }) {
  const v = useLoop(2800, delay);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x * scale - size / 2,
        top: y * scale - size / 2,
        width: size,
        height: size,
        borderRadius: size,
        backgroundColor: NEON.spark,
        opacity: v,
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [4, -4] }) }],
      }}
    />
  );
}

function Drop({ x, delay, scale }: { x: number; delay: number; scale: number }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 1600, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(800),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [v, delay]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x * scale - 3,
        top: 8 * scale,
        width: 6,
        height: 8,
        borderRadius: 4,
        borderTopLeftRadius: 1,
        backgroundColor: '#38bdf8',
        opacity: v.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 0] }),
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, 30 * scale] }) }, { rotate: '45deg' }],
      }}
    />
  );
}

export function GardenPlant({ stage, size = 80, watered = false }: { stage: GardenStage; size?: number; watered?: boolean }) {
  const height = (size * VIEW_H) / VIEW_W;
  const scale = size / VIEW_W;
  const sway = useLoop(4500);
  const rotate = sway.interpolate({ inputRange: [0, 1], outputRange: ['-2.5deg', '2.5deg'] });
  const grow = sway.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.025, 1] });

  return (
    <View style={{ width: size, height }} accessibilityLabel={`Your garden plant, ${stage}`}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          // Pivot at the soil line so the stem bends from the pot, not the middle.
          { transformOrigin: ['50%', `${(105 / VIEW_H) * 100}%`, 0], transform: [{ rotate }, { scale: grow }] },
        ]}>
        <Svg width={size} height={height} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
          <PlantBody stage={stage} />
        </Svg>
      </Animated.View>
      <Svg width={size} height={height} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} style={StyleSheet.absoluteFill}>
        <Pot />
      </Svg>
      {stage !== 'seed' ? (
        <>
          <Sparkle x={22} y={40} size={4} delay={0} scale={scale} />
          <Sparkle x={100} y={30} size={3.5} delay={900} scale={scale} />
          <Sparkle x={96} y={78} size={3} delay={1800} scale={scale} />
        </>
      ) : null}
      {watered ? (
        <>
          <Drop x={44} delay={0} scale={scale} />
          <Drop x={60} delay={800} scale={scale} />
          <Drop x={76} delay={1600} scale={scale} />
        </>
      ) : null}
    </View>
  );
}
