import { NavLink } from 'react-router-dom';
import { BookOpen, ChefHat, Camera, ShoppingBag } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Shared sub-navigation for the Nutrition area. Collapses four former sidebar
 * items (Food library, Recipes, Plate review, Products) into one "Nutrition"
 * entry whose sub-sections switch via these tabs — the same one-item-with-tabs
 * pattern Billing uses. Route-based (each tab is its own page) so deep links,
 * detail views, and per-page state keep working untouched.
 */
const TABS = [
  { to: '/dashboard/nutrition/foods', label: 'Food library', icon: BookOpen },
  { to: '/dashboard/nutrition/recipes', label: 'Recipes', icon: ChefHat },
  { to: '/dashboard/plate-review', label: 'Plate review', icon: Camera },
  { to: '/products', label: 'Products', icon: ShoppingBag },
];

export function NutritionTabs() {
  return (
    <nav
      aria-label="Nutrition sections"
      className="mb-6 flex flex-wrap gap-1 rounded-full border border-foreground/10 bg-foreground/[0.03] p-1"
    >
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          className={({ isActive }) =>
            cn(
              'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white shadow-sm'
                : 'text-foreground/65 hover:bg-foreground/[0.05] hover:text-foreground',
            )
          }
        >
          <t.icon className="h-4 w-4" />
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
