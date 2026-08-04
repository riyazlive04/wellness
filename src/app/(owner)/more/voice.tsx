/**
 * Voice AI — placeholder pending the next native build.
 *
 * The real screen is hold-to-record → POST the clip to `/voice/converse` →
 * show transcript, reply and parsed intent. Recording needs `expo-audio`,
 * which is a NATIVE module: it has to be compiled into the APK and cannot
 * arrive over the air. Importing it here would call `requireNativeModule`
 * at module scope, and because expo-router eagerly evaluates every route file
 * to build its tree, that would crash the app at launch for everyone still on
 * the current binary — clients included.
 *
 * So this route ships as a notice, and the whole nutritionist portal stays
 * OTA-deliverable. The API client it needs (@/lib/owner/api/voice-ai) is
 * already written and dependency-free.
 *
 * TO RESTORE, in the release that ships a new APK:
 *   1. npx expo install expo-audio          (RECORD_AUDIO is already in the
 *                                            manifest via expo-camera)
 *   2. bump expo.runtimeVersion in app.json
 *   3. replace this file's body with the recorder:
 *        useAudioRecorder(RecordingPresets.HIGH_QUALITY) →
 *        requestRecordingPermissionsAsync() → setAudioModeAsync(
 *          { allowsRecording: true, playsInSilentMode: true }) →
 *        prepareToRecordAsync() / record() / stop() →
 *        converse(recorder.uri) from @/lib/owner/api/voice-ai
 *   4. eas build -p android --profile production
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { ActionButton, OwnerPage, Pill, RouteGate } from '@/components/owner/ui';
import { AppText, Card } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { radius, spacing } from '@/lib/theme';

export default function OwnerVoiceAI() {
  return (
    <RouteGate permission="ai.use" feature="ai_assistant" featureLabel="Voice AI">
      <VoiceNotice />
    </RouteGate>
  );
}

function VoiceNotice() {
  const t = useTheme();
  const router = useRouter();

  return (
    <OwnerPage title="Voice" subtitle="Talk to your assistant" back>
      <View style={{ alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.md }}>
        <View
          style={{
            width: 88,
            height: 88,
            borderRadius: radius.pill,
            backgroundColor: t.colors.surfaceStrong,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Ionicons name="mic-off-outline" size={34} color={t.colors.textFaint} />
        </View>
        <Pill label="Next app update" tone="warning" />
      </View>

      <Card style={{ gap: spacing.sm }}>
        <AppText variant="heading">Voice needs a new app version</AppText>
        <AppText variant="muted" tone="muted">
          {
            'Recording uses a part of the app that lives in the installed build itself, so it can’t arrive in a background update the way the rest of the dashboard does. It switches on with the next release you install — nothing for you to do.'
          }
        </AppText>
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <AppText variant="heading">In the meantime</AppText>
        <AppText variant="muted" tone="muted">
          The assistant answers exactly the same questions by text, including the morning brief and the actions it can run for you.
        </AppText>
        <ActionButton
          label="Open the AI Assistant"
          icon="sparkles-outline"
          onPress={() => router.replace('/(owner)/more/ai')}
        />
      </Card>
    </OwnerPage>
  );
}
