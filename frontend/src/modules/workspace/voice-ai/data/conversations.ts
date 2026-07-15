import type { Conversation } from '../types';

export const CONVERSATIONS: Conversation[] = [
  {
    id: 'meal_log_breakfast',
    prompt: 'Log a breakfast',
    userText:
      "Hey SIRAH LIFE, I had a bowl of poha for breakfast, about one cup, with a small handful of peanuts and a cup of masala chai.",
    intent: {
      kind: 'meal_log',
      mealType: 'breakfast',
      items: [
        { name: 'Vegetable poha',  portion: '1 cup (150 g)',  calories: 230, source: 'IFCT' },
        { name: 'Roasted peanuts', portion: '15 g',           calories: 90,  source: 'IFCT' },
        { name: 'Masala chai',     portion: '1 cup (200 ml)', calories: 60,  source: 'IFCT' },
      ],
      totalCalories: 380,
    },
  },
  {
    id: 'reflection_tired',
    prompt: 'Daily reflection',
    userText:
      "I'm feeling a bit tired today. Not sure if it's the back-to-back workouts or something else.",
    intent: {
      kind: 'reflection',
      reply:
        "Two strength days in a row can absolutely build up. I checked your week — sleep was 6.3 hours last night vs. your 7.5h average. Try a 15-minute walk + stretching today instead of another lift, and protect tonight's bedtime. Your body's asking for restoration, not more output.",
    },
  },
  {
    id: 'question_run',
    prompt: 'Pre-run nutrition',
    userText:
      "What should I eat before my run tomorrow morning?",
    intent: {
      kind: 'question',
      reply:
        "For a 6:30 AM run, aim for 30–40 g of carbs about 60 minutes before. A banana with peanut butter on toast, or a small bowl of oats with honey, both work well. Hydrate well tonight and sip 200 ml of water on waking. Want me to add this to tomorrow's plan?",
    },
  },
];
