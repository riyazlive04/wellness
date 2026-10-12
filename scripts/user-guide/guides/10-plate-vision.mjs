export default {
  no: 10,
  slug: 'plate-vision',
  title: 'Plate Vision & meal review',
  tagline: 'Clients photograph their meals, NUSI\'s AI estimates the nutrients, and you approve, adjust or flag each one.',
  where: 'Clients: `Snap` in the NUSI app. You: `Nutrition` → `Plate review`',
  intro: [
    'Plate Vision is included in every plan. Each photo analysis uses one AI credit from your practice.',
  ],
  sections: [
    {
      title: 'How your client logs a meal',
      steps: [
        'In the app they tap `Snap`, then `Use camera` or `Upload photo`.',
        'Optionally they add hints: **portion size** (small, medium, large), whether a spoon, hand or card is in the photo for scale, and a note.',
        'They tap `Analyze with NUSI`. The result appears in a few seconds.',
        'They see the dish, how sure NUSI is (**Confident**, **Fairly sure** or **Rough guess**), a calorie range and each item with its weight, which they can adjust.',
        'If it\'s wrong, they tap `Not quite right?`, choose or type the dish and tap `Redo with this`.',
        'They choose the meal time and tap `Log this meal`. It is sent to you for review.',
      ],
      note: 'Each analysis, including each `Redo`, uses one AI credit.',
    },
    {
      title: 'The Plate review screen',
      text: 'Open `Nutrition` and choose the `Plate review` tab. Filter by **Pending**, **Flagged**, **Approved** or **Adjusted**. Each row shows the client, meal, calories and time.',
      bullets: [
        '**Photo:** drag to move; scroll or double-click to zoom.',
        '**Plate nutrition:** where the numbers came from (a **photo estimate** or the food database), how sure the AI is, what dish it saw, calories with a range, and protein, carbs and fat.',
        '**Items:** each food, marked as estimate, needs review or matched.',
        '**Insight:** a short comment on the meal, with any flags.',
      ],
    },
    {
      title: 'Approve, adjust or flag',
      steps: [
        'Look at the photo and the numbers.',
        'If you like, write a note for the client.',
        'Click `Approve` if it looks right, `Adjust` if the numbers need correcting, or `Flag` if something needs attention.',
        'Your note appears for the client on their Meals page as "Nutritionist: …".',
      ],
      note: '`Adjust` marks the meal as adjusted and sends your note; it doesn\'t change the individual items. Write the correct portion or food in your note.',
    },
    {
      title: 'How accurate are photo estimates?',
      bullets: [
        'They are a good starting point, not a measurement. Two photos of the same plate can give slightly different results.',
        'Portion hints and something for scale in the photo (a spoon, hand or card) make the estimate better.',
        'Your review is what makes the record reliable.',
      ],
      tip: 'For packaged foods, ask clients to use `Scan` (barcode) instead. It reads the label values.',
    },
  ],
};
