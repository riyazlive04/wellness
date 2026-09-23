/**
 * Server-driven UI — the layouts compiled into this build.
 *
 * MIRROR of backend/src/sdui/sdui.defaults.ts. On the device these are the
 * FALLBACK: what renders before the first bundle arrives, when the network is
 * down, when the cached bundle is corrupt, and when a published tree fails to
 * render. A phone that has never reached the server still gets a complete app.
 *
 * They reproduce the screens as they shipped hardcoded, and they do three jobs
 * at once:
 *
 *   1. They are what a workspace gets when it has never opened the editor, so
 *      turning SDUI on changes nothing visible until somebody chooses to.
 *   2. They are the starting point the editor clones on first edit — authors
 *      begin from a working app, not a blank canvas.
 *   3. They are the reference the mobile bundle mirrors, so a device with no
 *      network on first launch still has a complete, coherent app.
 *
 * Node ids are STABLE and hand-written. The editor tracks selection and diffs
 * by id, and a workspace that customised `home-quick-actions` should still be
 * pointing at the same node after we edit the defaults around it.
 */
import type { UiScreen } from './types';


/**
 * Home — the Today dashboard.
 *
 * The genuinely interactive pieces (score hero with its live greeting, the
 * tappable habit tiles, the mood picker) stay `native`: they own animation,
 * optimistic writes and a running clock, none of which belong in a JSON tree.
 * What the server decides is whether they appear and in what order — which is
 * the part a practice actually wants to change.
 */
const HOME: UiScreen = {
  version: 1,
  screen: 'home',
  revision: 1,
  data: [
    { key: 'home', source: 'me.home' },
    { key: 'meals', source: 'me.meals', params: { days: 14 } },
  ],
  root: {
    id: 'home-root',
    type: 'stack',
    gap: 'lg',
    children: [
      { id: 'home-hero', type: 'native', component: 'home.scoreHero' },
      { id: 'home-log-cta', type: 'native', component: 'home.logMealCta' },
      { id: 'home-habits', type: 'native', component: 'home.habitTiles' },
      { id: 'home-meals', type: 'native', component: 'home.mealSummary' },

      {
        id: 'home-nudge',
        type: 'if',
        cond: { op: 'truthy', left: '{{home.messages}}' },
        then: [{ id: 'home-nudge-card', type: 'native', component: 'home.coachNudge' }],
      },

      {
        id: 'home-program',
        type: 'if',
        cond: { op: 'truthy', left: '{{home.program}}' },
        then: [{ id: 'home-program-card', type: 'native', component: 'home.programProgress' }],
      },

      {
        id: 'home-quick-actions',
        type: 'section',
        title: 'Quick actions',
        children: [{ id: 'home-quick-grid', type: 'native', component: 'home.quickActions' }],
      },
    ],
  },
};

/**
 * More — the grouped navigation list.
 *
 * Every plan-gated destination carries a `feature` guard. Those are resolved on
 * the server and the losing rows are cut from the payload, so a Starter
 * workspace's clients never receive the Community row at all rather than
 * tapping it into a 402.
 */
const MORE: UiScreen = {
  version: 1,
  screen: 'more',
  revision: 1,
  data: [],
  root: {
    id: 'more-root',
    type: 'stack',
    gap: 'lg',
    children: [
      { id: 'more-profile', type: 'native', component: 'more.profileHeader' },

      {
        id: 'more-wellness',
        type: 'section',
        title: 'Wellness',
        children: [
          {
            id: 'more-wellness-card',
            type: 'card',
            padding: 'none',
            children: [
              { id: 'more-habits', type: 'row', label: 'Habits', icon: 'repeat-outline', action: { kind: 'navigate', href: '/(tabs)/more/habits' } },
              { id: 'more-journal', type: 'row', label: 'Journal', icon: 'create-outline', action: { kind: 'navigate', href: '/(tabs)/more/journal' } },
              { id: 'more-wellbeing', type: 'row', label: 'Wellbeing', icon: 'heart-outline', action: { kind: 'navigate', href: '/(tabs)/more/wellbeing' } },
              { id: 'more-cycle', type: 'row', label: 'Cycle', icon: 'water-outline', action: { kind: 'navigate', href: '/(tabs)/more/cycle' } },
            ],
          },
        ],
      },

      {
        id: 'more-plan',
        type: 'section',
        title: 'Plan',
        children: [
          {
            id: 'more-plan-card',
            type: 'card',
            padding: 'none',
            children: [
              { id: 'more-meal-plan', type: 'row', label: 'Meal plan', icon: 'calendar-outline', action: { kind: 'navigate', href: '/(tabs)/more/meal-plan' } },
              { id: 'more-goals', type: 'row', label: 'Goals', icon: 'flag-outline', action: { kind: 'navigate', href: '/(tabs)/more/goals' } },
              { id: 'more-programs', type: 'row', label: 'Programs', icon: 'clipboard-outline', action: { kind: 'navigate', href: '/(tabs)/more/programs' } },
              {
                id: 'more-assessments',
                type: 'row',
                label: 'Assessments',
                icon: 'checkbox-outline',
                when: { op: 'feature', feature: 'comprehensive_assessment' },
                action: { kind: 'navigate', href: '/(tabs)/more/assessments' },
              },
              { id: 'more-timeline', type: 'row', label: 'Timeline', icon: 'time-outline', action: { kind: 'navigate', href: '/(tabs)/more/timeline' } },
            ],
          },
        ],
      },

      {
        id: 'more-library',
        type: 'section',
        title: 'Library & records',
        children: [
          {
            id: 'more-library-card',
            type: 'card',
            padding: 'none',
            children: [
              { id: 'more-foods', type: 'row', label: 'Food lookup', icon: 'search-outline', action: { kind: 'navigate', href: '/(tabs)/more/foods' } },
              { id: 'more-barcode', type: 'row', label: 'Barcode scan', icon: 'scan-outline', action: { kind: 'navigate', href: '/(tabs)/more/barcode' } },
              {
                id: 'more-recipes',
                type: 'row',
                label: 'Recipes',
                icon: 'book-outline',
                when: { op: 'feature', feature: 'recipes' },
                action: { kind: 'navigate', href: '/(tabs)/more/recipes' },
              },
              { id: 'more-supplements', type: 'row', label: 'Supplements', icon: 'medkit-outline', action: { kind: 'navigate', href: '/(tabs)/more/supplements' } },
              { id: 'more-measurements', type: 'row', label: 'Measurements', icon: 'resize-outline', action: { kind: 'navigate', href: '/(tabs)/more/measurements' } },
              { id: 'more-photos', type: 'row', label: 'Progress photos', icon: 'images-outline', action: { kind: 'navigate', href: '/(tabs)/more/photos' } },
              { id: 'more-reports', type: 'row', label: 'Reports', icon: 'document-text-outline', action: { kind: 'navigate', href: '/(tabs)/more/reports' } },
              { id: 'more-files', type: 'row', label: 'Files', icon: 'folder-outline', action: { kind: 'navigate', href: '/(tabs)/more/files' } },
            ],
          },
        ],
      },

      {
        id: 'more-shop',
        type: 'section',
        title: 'Shop',
        children: [
          {
            id: 'more-shop-card',
            type: 'card',
            padding: 'none',
            children: [
              { id: 'more-shop-row', type: 'row', label: 'Shop', icon: 'bag-outline', action: { kind: 'navigate', href: '/(tabs)/more/shop' } },
            ],
          },
        ],
      },

      {
        id: 'more-connect',
        type: 'section',
        title: 'Connect',
        children: [
          {
            id: 'more-connect-card',
            type: 'card',
            padding: 'none',
            children: [
              {
                id: 'more-appointments',
                type: 'row',
                label: 'Appointments',
                icon: 'calendar-outline',
                when: { op: 'feature', feature: 'appointments' },
                action: { kind: 'navigate', href: '/(tabs)/more/appointments' },
              },
              {
                id: 'more-community',
                type: 'row',
                label: 'Community',
                icon: 'people-outline',
                when: { op: 'feature', feature: 'community' },
                action: { kind: 'navigate', href: '/(tabs)/more/community' },
              },
              { id: 'more-notifications', type: 'row', label: 'Notifications', icon: 'notifications-outline', action: { kind: 'navigate', href: '/(tabs)/more/notifications' } },
              { id: 'more-settings', type: 'row', label: 'Settings', icon: 'settings-outline', action: { kind: 'navigate', href: '/(tabs)/more/settings' } },
            ],
          },
        ],
      },

      { id: 'more-signout', type: 'native', component: 'more.signOut' },
    ],
  },
};

/**
 * Tabs — the bottom bar.
 *
 * `index` is pinned by the validator (REQUIRED_TABS): a practice may drop the
 * Assistant or Progress tab, but not the way home.
 */
const TABS: UiScreen = {
  version: 1,
  screen: 'tabs',
  revision: 1,
  data: [],
  root: {
    id: 'tabs-root',
    type: 'stack',
    children: [
      { id: 'tab-index', type: 'tab', route: 'index', label: 'Today', icon: 'home' },
      { id: 'tab-meals', type: 'tab', route: 'meals', label: 'Meals', icon: 'restaurant' },
      {
        id: 'tab-assistant',
        type: 'tab',
        route: 'assistant',
        label: 'Assistant',
        icon: 'sparkles',
        when: { op: 'feature', feature: 'ai_assistant' },
      },
      { id: 'tab-progress', type: 'tab', route: 'progress', label: 'Progress', icon: 'pulse' },
      { id: 'tab-chat', type: 'tab', route: 'chat', label: 'Chat', icon: 'chatbubble-ellipses' },
      { id: 'tab-more', type: 'tab', route: 'more', label: 'More', icon: 'ellipsis-horizontal' },
    ],
  },
};

/**
 * Onboarding — the post-approval wizard.
 *
 * Steps declare only what they collect; the app supplies the chrome (progress
 * bar, Back/Next/Finish, validation, submit). A practice reorders, retitles or
 * drops a step; it never has to re-implement the flow.
 */
const ONBOARDING: UiScreen = {
  version: 1,
  screen: 'onboarding',
  revision: 1,
  data: [],
  root: {
    id: 'onb-root',
    type: 'stack',
    children: [
      {
        id: 'onb-basics',
        type: 'step',
        key: 'basics',
        title: 'Basics',
        subtitle: 'A few details so your plan fits you.',
        children: [
          {
            id: 'onb-age',
            type: 'field',
            key: 'age',
            label: 'Age',
            kind: 'number',
            placeholder: 'e.g. 32',
            min: 10,
            max: 120,
          },
          {
            id: 'onb-gender',
            type: 'field',
            key: 'gender',
            label: 'Gender',
            kind: 'select',
            options: [
              { value: 'female', label: 'Female' },
              { value: 'male', label: 'Male' },
              { value: 'non-binary', label: 'Non-binary' },
              { value: 'prefer not to say', label: 'Prefer not to say' },
            ],
          },
        ],
      },
      {
        id: 'onb-body',
        type: 'step',
        key: 'body',
        title: 'Body',
        subtitle: 'Used to calibrate targets. You can change these later.',
        children: [
          {
            id: 'onb-height',
            type: 'field',
            key: 'height_cm',
            label: 'Height (cm)',
            kind: 'number',
            placeholder: 'e.g. 165',
            min: 50,
            max: 250,
          },
          {
            id: 'onb-weight',
            type: 'field',
            key: 'initial_weight_kg',
            label: 'Weight (kg)',
            kind: 'number',
            placeholder: 'e.g. 68',
            min: 20,
            max: 400,
          },
        ],
      },
      {
        id: 'onb-goals',
        type: 'step',
        key: 'goals',
        title: 'Goals',
        subtitle: 'What are you here for?',
        children: [
          {
            id: 'onb-goals-field',
            type: 'field',
            key: 'goals',
            label: 'Your goals',
            kind: 'chips',
            options: [
              { value: 'Weight loss', label: 'Weight loss' },
              { value: 'Muscle gain', label: 'Muscle gain' },
              { value: 'Better energy', label: 'Better energy' },
              { value: 'Sleep & recovery', label: 'Sleep & recovery' },
              { value: 'Manage a health condition', label: 'Manage a health condition' },
              { value: 'General wellness', label: 'General wellness' },
            ],
          },
        ],
      },
      {
        id: 'onb-activity',
        type: 'step',
        key: 'activity',
        title: 'Activity',
        subtitle: 'How much do you move on a typical day?',
        children: [
          {
            id: 'onb-activity-field',
            type: 'field',
            key: 'activity_level',
            label: 'Activity level',
            kind: 'select',
            options: [
              { value: 'sedentary', label: 'Mostly sitting' },
              { value: 'light', label: 'Light movement' },
              { value: 'moderate', label: 'Moderately active' },
              { value: 'active', label: 'Active' },
              { value: 'very_active', label: 'Very active' },
            ],
          },
        ],
      },
      {
        id: 'onb-health',
        type: 'step',
        key: 'health',
        title: 'Health',
        subtitle: 'Anything your nutritionist should know before planning.',
        children: [
          { id: 'onb-allergies', type: 'field', key: 'allergies', label: 'Allergies', kind: 'multiline', placeholder: 'Optional' },
          { id: 'onb-conditions', type: 'field', key: 'medical_conditions', label: 'Medical conditions', kind: 'multiline', placeholder: 'Optional' },
          { id: 'onb-prefs', type: 'field', key: 'food_preferences', label: 'Food preferences', kind: 'multiline', placeholder: 'Optional' },
        ],
      },
    ],
  },
};

export const DEFAULT_SCREENS = {
  home: HOME,
  more: MORE,
  tabs: TABS,
  onboarding: ONBOARDING,
} as const;

/** A deep copy — callers mutate (prune, bump revision) and must not touch these. */
export function defaultScreen<K extends keyof typeof DEFAULT_SCREENS>(key: K): UiScreen {
  return JSON.parse(JSON.stringify(DEFAULT_SCREENS[key])) as UiScreen;
}
