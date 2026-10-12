export default {
  no: 6,
  slug: 'meal-plans',
  section: 'Meal plans',
  color: '#f97316',
  title: 'Meal plans',
  tagline: 'Create a weekly meal plan for each client, with your own meal times, accurate nutrition from the food library or AI, and a branded PDF to share.',
  where: '`Clients` → open a client → `Meal plan` tab',
  intro: [
    'Each meal plan covers one week (Monday to Sunday) for one client. You build it as a draft, then publish it. Clients only ever see published weeks.',
  ],
  sections: [
    {
      title: 'Start a plan',
      steps: [
        'Open the client and go to the `Meal plan` tab (or click `Meal plan` on their summary in the Clients list).',
        'Click `Start week 1`. The week starts next Monday (or today if it is Monday).',
        'Use `New week` to add more weeks. The **Week N** chips switch between weeks; a dot shows whether each is a draft or published.',
      ],
    },
    {
      title: 'Your meal times',
      text: 'The plan is a grid: meal times down the side, the 7 days across. Meal times are the same for **all** your clients.',
      bullets: [
        'Default meal times: Breakfast, Mid-morning, Lunch, Evening snack, Dinner.',
        '**Rename** a meal time: click its name (for example "First meal", "Mid snack", "Last meal"). `Use "<standard name>"` changes it back.',
        '**Hide** a meal time you don\'t use: click its name, then `Hide`. It disappears for every client.',
        '`Add slot` brings back other meal times: Cleansing water, Early morning, Mid-breakfast, Evening snack 1 and 2 and more.',
      ],
      note: 'You cannot hide a meal time that already has meals in this week, or the last remaining meal time.',
    },
    {
      title: 'Add a meal',
      steps: [
        'Click `+` in the right day and meal time.',
        'Choose `Type it` to write the meal yourself, or `From library` to pick it.',
        'Fill in **Meal**, **Qty** (a number, e.g. 2) and **Unit** (e.g. katori, g).',
        'Fill in **kcal** and **Macros**: Protein, Carbs, Fat and **Fibre** (in grams).',
        'Optionally add a **Note for the client** and the **Ingredients** (bullets and bold work).',
        'Click `Add meal`.',
      ],
      tip: 'Click an existing meal to edit it (`Save`) or `Remove` it. If you close the form with unsaved changes, NUSI asks before discarding them.',
    },
    {
      title: 'Pick meals from the library',
      bullets: [
        '**My foods:** meals you typed before; they are saved automatically for reuse.',
        '**Your recipes:** your published recipes.',
        '**Food library:** thousands of foods (type at least 2 letters). Calories, macros and other nutrients fill in automatically for the standard serving.',
      ],
      note: 'Changing the quantity does not recalculate the nutrients automatically. Update the numbers if you change the portion.',
    },
    {
      title: 'Estimate with AI',
      steps: [
        'Type the meal name (for example "2 ragi dosa with sambar").',
        'Click `Estimate with AI`.',
        'Calories, protein, carbs, fat, fibre and your extra nutrients are filled in, with the message "Filled in by AI. Check the numbers, then click Save to keep them."',
        'Check the values and click `Save`.',
      ],
      note: 'Each estimate uses one AI credit. AI values are estimates; always check them.',
    },
    {
      title: 'Extra nutrient columns',
      text: 'Besides calories, protein, carbs, fat and fibre, you can track any nutrient you need (sodium, iron, vitamin D…).',
      steps: [
        'In the meal form, click `Add nutrient`.',
        'Choose one **From the food database**, or create **Your own** with a name and unit.',
        'The new column appears for every client and meal (up to 12 columns).',
      ],
      tip: 'Removing a column (×) hides it everywhere; values already entered are kept and come back if you add the column again.',
    },
    {
      title: 'Draft a whole week with AI',
      steps: [
        'Click `AI draft`.',
        'Choose the **Meal slots to fill** and optionally write guidance in **Anything to steer it?** (e.g. "vegetarian, low GI, South Indian").',
        'If the week already has meals, decide whether to replace them.',
        'Click `Generate draft`. The result is always a draft for you to review.',
      ],
      note: 'Check allergies and medical conditions before publishing an AI draft. The AI draft button is greyed out if AI is off for your practice (Settings → AI).',
    },
    {
      title: 'Notes, publishing and duplicating',
      bullets: [
        '**Nutritionist\'s notes:** general guidance for the week. Saved when you click away; shown to the client and printed on the PDF.',
        '`Publish to client`: the client can now see this week in their app (needs at least one meal). `Unpublish` hides it again.',
        '`Duplicate`: copies the week to the following Monday as a new draft.',
        '`Delete`: removes the week and its meals.',
      ],
      note: 'Clients see the published week covering today, or the latest published week. Drafts are never shown to clients.',
    },
    {
      title: 'Share as PDF or Excel',
      bullets: [
        '`PDF`: a branded plan with your logo, a cover, the client\'s profile, day-by-day tables, a weekly nutrition summary (calories, protein, carbs, fat, fibre) and your notes.',
        '`Excel`: two sheets, the week grid and a list of all meals.',
      ],
    },
  ],
};
