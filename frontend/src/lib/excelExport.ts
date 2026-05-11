import * as XLSX from 'xlsx';

interface MealCard {
  meal_type: string;
  meal_name: string;
  description: string | null;
  ingredients: string | null;
  instructions: string | null;
  kcal: number;
  day_number: number;
}

interface WeeklyPlan {
  week_number: number;
  start_date: string;
  end_date: string;
  total_kcal: number | null;
}

interface Client {
  name: string;
  program_type: string | null;
}

export const exportDietPlanToExcel = (
  client: Client,
  plan: WeeklyPlan,
  mealCards: MealCard[]
) => {
  // Create a new workbook
  const wb = XLSX.utils.book_new();

  // Sheet 1: Weekly Overview
  const overviewData = [
    ['Sheizen AI Nutritionist - Weekly Diet Plan'],
    [],
    ['Client Name:', client.name],
    ['Program Type:', client.program_type || 'N/A'],
    ['Week Number:', plan.week_number],
    ['Period:', `${plan.start_date} to ${plan.end_date}`],
    ['Total Weekly Kcal:', plan.total_kcal || 'N/A'],
    [],
    ['Day', 'Total Kcal', 'Cleansing Water', 'Early Morning', 'Breakfast', 'Mid Breakfast', 'Lunch', 'Evening Snack', 'Dinner'],
  ];

  // Calculate daily totals
  for (let day = 1; day <= 7; day++) {
    const dayMeals = mealCards.filter(m => m.day_number === day);
    const dayTotal = dayMeals.reduce((sum, m) => sum + m.kcal, 0);
    const cleansing = dayMeals.find(m => m.meal_type === 'cleansing_water')?.kcal || 0;
    const earlyMorning = dayMeals.find(m => m.meal_type === 'early_morning')?.kcal || 0;
    const breakfast = dayMeals.find(m => m.meal_type === 'breakfast')?.kcal || 0;
    const midBreakfast = dayMeals.find(m => m.meal_type === 'mid_breakfast')?.kcal || 0;
    const lunch = dayMeals.find(m => m.meal_type === 'lunch')?.kcal || 0;
    const snack = dayMeals.filter(m => ['evening_snack_1', 'evening_snack_2'].includes(m.meal_type)).reduce((sum, m) => sum + m.kcal, 0);
    const dinner = dayMeals.find(m => m.meal_type === 'dinner')?.kcal || 0;

    overviewData.push([
      `Day ${day}`,
      dayTotal,
      cleansing,
      earlyMorning,
      breakfast,
      midBreakfast,
      lunch,
      snack,
      dinner
    ]);
  }

  const wsOverview = XLSX.utils.aoa_to_sheet(overviewData);

  // Set column widths
  wsOverview['!cols'] = [
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 }
  ];

  XLSX.utils.book_append_sheet(wb, wsOverview, 'Weekly Overview');

  // Sheets 2-8: Daily meal cards
  const mealTypeLabels: Record<string, string> = {
    cleansing_water: 'Cleansing Water',
    early_morning: 'Early Morning',
    breakfast: 'Breakfast',
    mid_breakfast: 'Mid Breakfast',
    lunch: 'Lunch',
    evening_snack_1: 'Evening Snack 1',
    evening_snack_2: 'Evening Snack 2',
    dinner: 'Dinner'
  };

  for (let day = 1; day <= 7; day++) {
    const dayMeals = mealCards.filter(m => m.day_number === day);
    const dayData: any[][] = [
      [`Day ${day} - Meal Plan`],
      [],
    ];

    dayMeals.forEach(meal => {
      dayData.push(
        ['Meal Type:', mealTypeLabels[meal.meal_type] || meal.meal_type],
        ['Meal Name:', meal.meal_name],
        ['Calories (Kcal):', meal.kcal],
        [],
        ['Description:'],
        [meal.description || 'N/A'],
        [],
        ['Ingredients:'],
        [meal.ingredients || 'N/A'],
        [],
        ['Instructions:'],
        [meal.instructions || 'N/A'],
        [],
        ['─'.repeat(50)],
        []
      );
    });

    const wsDay = XLSX.utils.aoa_to_sheet(dayData);
    wsDay['!cols'] = [{ wch: 20 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, wsDay, `Day ${day}`);
  }

  // Generate filename
  const filename = `Diet_Plan_${client.name.replace(/\s+/g, '_')}_Week${plan.week_number}.xlsx`;

  // Write file
  XLSX.writeFile(wb, filename);
};
