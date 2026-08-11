import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import {
  DAY_LABELS, MEAL_SLOTS, SLOT_LABELS, cardsByDay, dayDate,
  type MealPlan, type MealSlot,
} from '../api/mealPlans';
import {
  drawBrandedFooters, drawBrandedHeader, drawCoverPage, resolvePdfBrand,
} from '../pdf/pdfBrand';

/** Optional extras a caller can enrich the document with. */
export interface MealPlanPdfExtras {
  /** A short client profile shown on page one (goal, allergies, stats…). */
  clientProfile?: { label: string; value: string }[];
  /** Free-text guidance from the nutritionist, printed as its own section. */
  coachNotes?: string;
}

/**
 * Meal-plan exports. The PDF is the artefact clients actually receive over
 * WhatsApp, so it is laid out day-by-day for reading on a phone rather than as
 * a 7-column grid that would be unreadable at that width.
 */

function fileStem(plan: MealPlan, clientName: string): string {
  const safe = clientName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  return `meal-plan-${safe || 'client'}-week-${plan.week_number}`;
}

/** Slots actually used by this plan, in canonical order. */
function usedSlots(plan: MealPlan): MealSlot[] {
  const present = new Set((plan.cards ?? []).map((c) => c.meal_type));
  return MEAL_SLOTS.filter((s) => present.has(s));
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

/** Compose a meal's full recipe detail into stacked lines for the PDF cell. */
function recipeDetail(c: MealPlan['cards'][number]): string {
  const rows: string[] = [];
  if (c.description) rows.push(c.description);
  if (c.ingredients) rows.push(`Ingredients: ${c.ingredients}`);
  if (c.instructions) rows.push(`Method: ${c.instructions}`);
  const macro = [
    c.protein_g != null && `P ${c.protein_g}g`,
    c.carbs_g != null && `C ${c.carbs_g}g`,
    c.fat_g != null && `F ${c.fat_g}g`,
  ].filter(Boolean).join('  ·  ');
  if (macro) rows.push(macro);
  return rows.join('\n');
}

/** Sum a macro across cards; null when not a single card carries it. */
function sumMacro(cards: MealPlan['cards'], key: 'protein_g' | 'carbs_g' | 'fat_g'): number | null {
  let total = 0;
  let any = false;
  for (const c of cards) {
    if (c[key] != null) { total += Number(c[key]); any = true; }
  }
  return any ? Math.round(total * 10) / 10 : null;
}

/** Grams for a table cell, or an em dash when unknown. */
function gramsCell(v: number | null): string {
  return v == null ? '—' : `${v.toLocaleString('en-IN')} g`;
}

/** Read the finalY autoTable stashes on the doc (loosely typed by the lib). */
function afterTable(doc: jsPDF, fallback: number): number {
  return (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? fallback;
}

export async function exportMealPlanPdf(
  plan: MealPlan,
  clientName: string,
  extras: MealPlanPdfExtras = {},
): Promise<void> {
  const brand = await resolvePdfBrand();
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 40;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const days = cardsByDay(plan.cards);
  const dayCount = days.size || 1;
  const totalMeals = (plan.cards ?? []).length;
  const weeklyKcal = (plan.cards ?? []).reduce((s, c) => s + (c.kcal ?? 0), 0) || plan.total_kcal;
  const avgPerDay = Math.round(weeklyKcal / dayCount);
  const generatedOn = `Generated ${new Date().toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  })}`;

  // ── Page 1: branded cover ─────────────────────────────────────────
  drawCoverPage(doc, brand, {
    margin,
    kind: 'Personalised Meal Plan',
    title: 'Weekly Meal Plan',
    subtitle: clientName,
    meta: [
      `Week ${plan.week_number}`,
      `${fmtDate(plan.start_date)} – ${fmtDate(plan.end_date)}`,
      `${avgPerDay.toLocaleString('en-IN')} kcal / day average · ${totalMeals} meals`,
    ],
    generatedOn,
  });

  // ── Page 2+: masthead, then content ───────────────────────────────
  doc.addPage();
  let y = drawBrandedHeader(doc, brand, {
    margin,
    title: `Meal Plan · Week ${plan.week_number}`,
    subtitle: clientName,
    meta: `${fmtDate(plan.start_date)} – ${fmtDate(plan.end_date)}  ·  ${avgPerDay.toLocaleString('en-IN')} kcal/day avg`,
    rightMeta: generatedOn,
  });

  // ── Plan summary tiles ────────────────────────────────────────────
  const tiles: [string, string][] = [
    ['Week', `#${plan.week_number}`],
    ['Days planned', String(dayCount)],
    ['Total meals', String(totalMeals)],
    ['Avg / day', `${avgPerDay.toLocaleString('en-IN')} kcal`],
  ];
  const gap = 10;
  const tileW = (pageW - margin * 2 - gap * (tiles.length - 1)) / tiles.length;
  const tileH = 44;
  tiles.forEach(([label, value], i) => {
    const x = margin + i * (tileW + gap);
    doc.setFillColor(247, 249, 249);
    doc.roundedRect(x, y, tileW, tileH, 6, 6, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(140);
    doc.text(label.toUpperCase(), x + 10, y + 16, { charSpace: 0.5 });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...brand.primary);
    doc.text(value, x + 10, y + 34);
  });
  y += tileH + 24;

  // ── Client profile (optional) ─────────────────────────────────────
  if (extras.clientProfile?.length) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30);
    doc.text('Client profile', margin, y);
    y += 8;
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      body: extras.clientProfile.map((r) => [r.label, r.value]),
      theme: 'plain',
      bodyStyles: {
        fontSize: 9, textColor: 55,
        cellPadding: { top: 4, right: 6, bottom: 4, left: 0 },
        lineWidth: { bottom: 0.4 }, lineColor: 235,
      },
      columnStyles: { 0: { cellWidth: 130, textColor: 120 }, 1: { cellWidth: 'auto' } },
    });
    y = afterTable(doc, y) + 24;
  }

  // ── One detailed table per day ────────────────────────────────────
  for (let day = 1; day <= 7; day++) {
    const cards = days.get(day) ?? [];
    if (!cards.length) continue;

    const dayKcal = cards.reduce((s, c) => s + (c.kcal ?? 0), 0);
    const date = dayDate(plan.start_date, day);
    const heading = `${DAY_LABELS[day - 1]} · ${date.toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'short',
    })}`;

    // Keep a day's heading with at least part of its table.
    if (y > pageH - 150) {
      doc.addPage();
      y = 60;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30);
    doc.text(heading, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(140);
    doc.text(`${cards.length} meals · ${dayKcal.toLocaleString('en-IN')} kcal`, pageW - margin, y, {
      align: 'right',
    });

    autoTable(doc, {
      startY: y + 10,
      margin: { left: margin, right: margin, bottom: margin },
      head: [['When', 'Meal', 'Recipe & method', 'kcal']],
      body: cards.map((c) => [
        SLOT_LABELS[c.meal_type],
        [c.meal_name, c.quantity ? `(${c.quantity}${c.unit ? ` ${c.unit}` : ''})` : ''].filter(Boolean).join('\n'),
        recipeDetail(c),
        String(c.kcal ?? 0),
      ]),
      theme: 'plain',
      headStyles: {
        fontStyle: 'normal', fontSize: 7, textColor: 140,
        cellPadding: { top: 5, right: 6, bottom: 5, left: 0 },
        lineWidth: { bottom: 0.4 }, lineColor: 200,
      },
      bodyStyles: {
        fontSize: 9, textColor: 45,
        cellPadding: { top: 7, right: 6, bottom: 7, left: 0 },
        lineWidth: { bottom: 0.4 }, lineColor: 235,
        valign: 'top',
      },
      columnStyles: {
        0: { cellWidth: 82, textColor: 110, fontSize: 8 },
        1: { cellWidth: 118, fontStyle: 'bold', textColor: 30 },
        2: { cellWidth: 'auto', textColor: 90, fontSize: 8 },
        3: { cellWidth: 42, halign: 'right', textColor: 110 },
      },
    });

    y = afterTable(doc, y) + 26;
  }

  // ── Weekly nutrition summary ──────────────────────────────────────
  if (y > pageH - 200) {
    doc.addPage();
    y = 60;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30);
  doc.text('Weekly nutrition summary', margin, y);
  y += 10;
  const allCards = plan.cards ?? [];
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin, bottom: margin },
    head: [['Day', 'Date', 'Meals', 'Calories', 'Protein', 'Carbs', 'Fat']],
    body: Array.from({ length: 7 }, (_, i) => {
      const day = i + 1;
      const cards = days.get(day) ?? [];
      return [
        DAY_LABELS[i],
        dayDate(plan.start_date, day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        String(cards.length),
        cards.length ? `${cards.reduce((s, c) => s + (c.kcal ?? 0), 0).toLocaleString('en-IN')} kcal` : '—',
        gramsCell(sumMacro(cards, 'protein_g')),
        gramsCell(sumMacro(cards, 'carbs_g')),
        gramsCell(sumMacro(cards, 'fat_g')),
      ];
    }),
    foot: [[
      'Week total', '', String(totalMeals), `${weeklyKcal.toLocaleString('en-IN')} kcal`,
      gramsCell(sumMacro(allCards, 'protein_g')),
      gramsCell(sumMacro(allCards, 'carbs_g')),
      gramsCell(sumMacro(allCards, 'fat_g')),
    ]],
    theme: 'plain',
    headStyles: {
      fontStyle: 'normal', fontSize: 7, textColor: 140,
      cellPadding: { top: 5, right: 6, bottom: 5, left: 0 },
      lineWidth: { bottom: 0.4 }, lineColor: 200,
    },
    bodyStyles: {
      fontSize: 9, textColor: 55,
      cellPadding: { top: 5, right: 6, bottom: 5, left: 0 },
      lineWidth: { bottom: 0.4 }, lineColor: 238,
    },
    footStyles: {
      fontStyle: 'bold', fontSize: 9, textColor: brand.primary,
      cellPadding: { top: 6, right: 6, bottom: 6, left: 0 },
      lineWidth: { top: 0.8 }, lineColor: 190,
    },
    columnStyles: {
      0: { cellWidth: 66 }, 1: { cellWidth: 74 },
      2: { cellWidth: 44, halign: 'right' }, 3: { cellWidth: 'auto', halign: 'right' },
      4: { cellWidth: 62, halign: 'right' }, 5: { cellWidth: 56, halign: 'right' },
      6: { cellWidth: 50, halign: 'right' },
    },
  });
  y = afterTable(doc, y) + 8;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(150);
  doc.text('Calorie and macro figures are estimates based on the meals in this plan (— = not recorded).', margin, y + 10);

  // ── Coach notes (optional) ────────────────────────────────────────
  if (extras.coachNotes?.trim()) {
    y += 26;
    if (y > pageH - 140) {
      doc.addPage();
      y = 60;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30);
    doc.text("Nutritionist's notes", margin, y);
    y += 16;
    doc.setFillColor(247, 249, 249);
    const noteLines = doc.splitTextToSize(extras.coachNotes.trim(), pageW - margin * 2 - 24) as string[];
    const boxH = noteLines.length * 13 + 24;
    doc.roundedRect(margin, y, pageW - margin * 2, boxH, 6, 6, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(60);
    doc.text(noteLines, margin + 12, y + 18);
  }

  drawBrandedFooters(doc, brand, margin, { coverPage: true });
  doc.save(`${fileStem(plan, clientName)}.pdf`);
}

export function exportMealPlanExcel(plan: MealPlan, clientName: string): void {
  const wb = XLSX.utils.book_new();
  const slots = usedSlots(plan);
  const days = cardsByDay(plan.cards);

  // Sheet 1 — the grid: rows = slots, columns = days. Matches how a
  // nutritionist reads a week at a glance.
  const grid: string[][] = [
    ['', ...DAY_LABELS.map((d, i) => `${d} (${dayDate(plan.start_date, i + 1).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})`)],
  ];
  for (const slot of slots) {
    const row = [SLOT_LABELS[slot]];
    for (let day = 1; day <= 7; day++) {
      // A slot can hold several meals — stack them in the cell, one per line.
      const cell = (days.get(day) ?? [])
        .filter((c) => c.meal_type === slot)
        .map((c) => `${c.meal_name}${c.kcal ? ` (${c.kcal} kcal)` : ''}`)
        .join('\n');
      row.push(cell);
    }
    grid.push(row);
  }
  grid.push(['']);
  grid.push([
    'Total kcal',
    ...Array.from({ length: 7 }, (_, i) =>
      String((days.get(i + 1) ?? []).reduce((s, c) => s + (c.kcal ?? 0), 0)),
    ),
  ]);
  const macroRow = (label: string, key: 'protein_g' | 'carbs_g' | 'fat_g') => [
    label,
    ...Array.from({ length: 7 }, (_, i) => {
      const v = sumMacro(days.get(i + 1) ?? [], key);
      return v == null ? '' : String(v);
    }),
  ];
  grid.push(macroRow('Total protein (g)', 'protein_g'));
  grid.push(macroRow('Total carbs (g)', 'carbs_g'));
  grid.push(macroRow('Total fat (g)', 'fat_g'));

  const ws = XLSX.utils.aoa_to_sheet(grid);
  ws['!cols'] = [{ wch: 18 }, ...Array.from({ length: 7 }, () => ({ wch: 28 }))];
  XLSX.utils.book_append_sheet(wb, ws, 'Week grid');

  // Sheet 2 — flat rows, for anyone who wants to filter or re-import.
  const flat = [
    ['Day', 'Date', 'Slot', 'Meal', 'Quantity', 'kcal', 'Protein (g)', 'Carbs (g)', 'Fat (g)', 'Description', 'Ingredients'],
    ...(plan.cards ?? [])
      .slice()
      .sort((a, b) => a.day_number - b.day_number || MEAL_SLOTS.indexOf(a.meal_type) - MEAL_SLOTS.indexOf(b.meal_type))
      .map((c) => [
        String(c.day_number),
        dayDate(plan.start_date, c.day_number).toLocaleDateString('en-IN'),
        SLOT_LABELS[c.meal_type],
        c.meal_name,
        [c.quantity, c.unit].filter(Boolean).join(' '),
        String(c.kcal ?? 0),
        c.protein_g != null ? String(c.protein_g) : '',
        c.carbs_g != null ? String(c.carbs_g) : '',
        c.fat_g != null ? String(c.fat_g) : '',
        c.description ?? '',
        c.ingredients ?? '',
      ]),
  ];
  const wsFlat = XLSX.utils.aoa_to_sheet(flat);
  wsFlat['!cols'] = [{ wch: 6 }, { wch: 12 }, { wch: 16 }, { wch: 28 }, { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 40 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsFlat, 'All meals');

  XLSX.writeFile(wb, `${fileStem(plan, clientName)}.xlsx`);
}
