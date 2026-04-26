export type MealSlot = 'breakfast' | 'lunch' | 'dinner';

export interface FoodItem {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  upc: string | null;
  serving: { size: number; unit: string | null; text: string | null } | null;
  per_100g: {
    kcal: number | null;
    protein_g: number | null;
    fat_g: number | null;
    carbs_g: number | null;
  };
}

export interface MealEntry {
  food: FoodItem;
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface DailyLog {
  date: string; // YYYY-MM-DD
  meals: Record<MealSlot, MealEntry[]>;
  goals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
}

export type RootStackParamList = {
  Onboarding: undefined;
  Home: undefined;
  MealRegister: { slot: MealSlot; date: string };
  FoodSearch: { slot: MealSlot; date: string };
};
