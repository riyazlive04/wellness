import * as XLSX from 'xlsx';

export interface ValidationError {
  row: number;
  field: string;
  message: string;
}

export interface ParsedData<T> {
  data: T[];
  errors: ValidationError[];
}

export function parseExcelFile<T>(file: File): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet);
        resolve(jsonData);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

export function generateExcelTemplate(columns: { header: string; key: string; example?: string }[], filename: string) {
  const ws = XLSX.utils.json_to_sheet([
    // Header row with examples
    columns.reduce((acc, col) => ({ ...acc, [col.header]: col.example || '' }), {}),
  ]);
  
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template');
  XLSX.writeFile(wb, filename);
}

export function validateRequired(value: any, fieldName: string): string | null {
  if (value === undefined || value === null || value === '') {
    return `${fieldName} is required`;
  }
  return null;
}

export function validateNumber(value: any, fieldName: string, min?: number, max?: number): string | null {
  const num = Number(value);
  if (isNaN(num)) {
    return `${fieldName} must be a number`;
  }
  if (min !== undefined && num < min) {
    return `${fieldName} must be at least ${min}`;
  }
  if (max !== undefined && num > max) {
    return `${fieldName} must be at most ${max}`;
  }
  return null;
}

export function validateString(value: any, fieldName: string, maxLength?: number): string | null {
  const str = String(value || '').trim();
  if (maxLength && str.length > maxLength) {
    return `${fieldName} must be less than ${maxLength} characters`;
  }
  return null;
}

export function sanitizeString(value: any): string {
  return String(value || '').trim();
}

export function exportToExcel(data: any[], filename: string, sheetName: string = 'Sheet1') {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

export function createFoodItemTemplate(filename: string) {
  const columns = [
    { header: 'name', key: 'name', example: 'Chicken Breast' },
    { header: 'category', key: 'category', example: 'Protein' },
    { header: 'serving_size', key: 'serving_size', example: '100' },
    { header: 'serving_unit', key: 'serving_unit', example: 'g' },
    { header: 'kcal_per_serving', key: 'kcal_per_serving', example: '165' },
    { header: 'protein', key: 'protein', example: '31' },
    { header: 'carbs', key: 'carbs', example: '0' },
    { header: 'fats', key: 'fats', example: '3.6' },
  ];
  
  generateExcelTemplate(columns, filename);
}

export function validateFoodItems(rawData: any[]): any[] {
  return rawData.map((row, index) => {
    const errors: string[] = [];
    
    // Validate required fields
    const nameError = validateRequired(row.name, 'Name');
    if (nameError) errors.push(nameError);
    
    const servingSizeError = validateRequired(row.serving_size, 'Serving Size');
    if (servingSizeError) errors.push(servingSizeError);
    
    const servingUnitError = validateRequired(row.serving_unit, 'Serving Unit');
    if (servingUnitError) errors.push(servingUnitError);
    
    const kcalError = validateRequired(row.kcal_per_serving, 'Kcal');
    if (kcalError) {
      errors.push(kcalError);
    } else {
      const kcalNumError = validateNumber(row.kcal_per_serving, 'Kcal', 0);
      if (kcalNumError) errors.push(kcalNumError);
    }
    
    // Validate optional numeric fields
    if (row.protein !== undefined && row.protein !== null && row.protein !== '') {
      const proteinError = validateNumber(row.protein, 'Protein', 0);
      if (proteinError) errors.push(proteinError);
    }
    
    if (row.carbs !== undefined && row.carbs !== null && row.carbs !== '') {
      const carbsError = validateNumber(row.carbs, 'Carbs', 0);
      if (carbsError) errors.push(carbsError);
    }
    
    if (row.fats !== undefined && row.fats !== null && row.fats !== '') {
      const fatsError = validateNumber(row.fats, 'Fats', 0);
      if (fatsError) errors.push(fatsError);
    }
    
    return {
      name: sanitizeString(row.name),
      category: sanitizeString(row.category),
      serving_size: sanitizeString(row.serving_size),
      serving_unit: sanitizeString(row.serving_unit),
      kcal_per_serving: Number(row.kcal_per_serving) || 0,
      protein: row.protein ? Number(row.protein) : null,
      carbs: row.carbs ? Number(row.carbs) : null,
      fats: row.fats ? Number(row.fats) : null,
      valid: errors.length === 0,
      error: errors.join(', '),
    };
  });
}
