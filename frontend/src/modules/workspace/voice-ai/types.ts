export type VoiceState = 'idle' | 'listening' | 'processing' | 'responding' | 'done';

export type IntentKind = 'meal_log' | 'reflection' | 'question';

export interface ParsedMealItem {
  name: string;
  portion: string;     // human-readable, e.g. "1 cup", "120 g"
  calories: number;
  source: 'IFCT' | 'USDA';
}

export interface MealLogIntent {
  kind: 'meal_log';
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  items: ParsedMealItem[];
  totalCalories: number;
}

export interface TextIntent {
  kind: 'reflection' | 'question';
  /** AI's textual reply */
  reply: string;
}

export type Intent = MealLogIntent | TextIntent;

export interface Conversation {
  id: string;
  prompt: string;           // chip label
  userText: string;         // what the user "says"
  intent: Intent;
}
