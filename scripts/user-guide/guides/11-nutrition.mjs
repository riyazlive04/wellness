export default {
  no: 11,
  slug: 'nutrition',
  title: 'Nutrition library & recipes',
  tagline: 'Search thousands of Indian and international foods, add your own, and build recipes with full nutrition.',
  where: '`Nutrition` in the left menu, with the tabs Food library, Recipes, Plate review and Products',
  sections: [
    {
      title: 'Where the food data comes from',
      table: [
        ['Source', 'What it is'],
        ['IFCT 2017', 'Indian Food Composition Tables (NIN / ICMR)'],
        ['INDB', 'Indian prepared dishes'],
        ['USDA FDC', 'US food database (international foods)'],
        ['Your food', 'Foods you add yourself'],
      ],
    },
    {
      title: 'Find a food',
      steps: [
        'Open `Nutrition` → `Food library`.',
        'Type in **Search by name or alias…**, or pick a category on the left.',
        'Click a food to see its full nutrient panel per 100 g.',
      ],
      tip: '`PDF` downloads the list you are looking at (code, name, category and source), handy for sharing a food list.',
    },
    {
      title: 'Add your own food',
      steps: [
        'Click `Add food`.',
        'Enter the **Food name**, **Category** and **Energy (kcal per 100 g)**.',
        'Optionally add **Protein, Carbs, Fat** and **Fiber** per 100 g, and a source or note.',
        'Click `Add food`. It is marked **Your food** and can be used in meal plans. You can remove it later.',
      ],
    },
    {
      title: 'Recipes (Scale Pro)',
      steps: [
        'Open the `Recipes` tab and click `New recipe`.',
        'Enter the **Recipe name**, description, category and number of **Servings**.',
        'Add ingredients by searching the food library, with the weight in grams, the cooking method, and whether the weight is **raw** or **as eaten**.',
        'Add instructions if you like and click `Create recipe`.',
        'Open a recipe to see its nutrition per serving and per 100 g cooked, including micronutrients.',
      ],
      bullets: [
        '`Import` adds recipes from a CSV or Excel file: either a list of dish names (saved as drafts) or a full sheet.',
        '`Publish all` publishes all your draft recipes at once.',
      ],
      note: 'The recipe library is part of the Scale Pro plan.',
    },
    {
      title: 'Plate review',
      text: 'The `Plate review` tab is where you check meals clients logged with a photo. See the **Plate Vision & meal review** guide.',
    },
  ],
};
