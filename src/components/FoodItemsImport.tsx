import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, Download, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  parseExcelFile,
  generateExcelTemplate,
  validateRequired,
  validateNumber,
  validateString,
  ValidationError,
} from "@/lib/importUtils";
import { ScrollArea } from "@/components/ui/scroll-area";

interface FoodItemImport {
  name: string;
  category?: string;
  serving_size: string;
  serving_unit: string;
  kcal_per_serving: number;
  protein?: number;
  carbs?: number;
  fats?: number;
}

interface ParsedItem extends FoodItemImport {
  rowNumber: number;
  isValid: boolean;
  errors: string[];
}

interface FoodItemsImportProps {
  onImportComplete: () => void;
}

export function FoodItemsImport({ onImportComplete }: FoodItemsImportProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [importing, setImporting] = useState(false);
  const [parsing, setParsing] = useState(false);

  const downloadTemplate = () => {
    const columns = [
      { header: 'name', key: 'name', example: 'Brown Rice' },
      { header: 'category', key: 'category', example: 'Grains' },
      { header: 'serving_size', key: 'serving_size', example: '100' },
      { header: 'serving_unit', key: 'serving_unit', example: 'g' },
      { header: 'kcal_per_serving', key: 'kcal_per_serving', example: '111' },
      { header: 'protein', key: 'protein', example: '2.6' },
      { header: 'carbs', key: 'carbs', example: '23' },
      { header: 'fats', key: 'fats', example: '0.9' },
    ];
    
    generateExcelTemplate(columns, 'food-items-template.xlsx');
    toast.success("Template downloaded!");
  };

  const validateItem = (item: any, rowNumber: number): ParsedItem => {
    const errors: string[] = [];

    // Validate required fields
    const nameError = validateRequired(item.name, 'Name');
    if (nameError) errors.push(nameError);
    else {
      const nameStrError = validateString(item.name, 'Name', 100);
      if (nameStrError) errors.push(nameStrError);
    }

    const servingSizeError = validateRequired(item.serving_size, 'Serving Size');
    if (servingSizeError) errors.push(servingSizeError);

    const servingUnitError = validateRequired(item.serving_unit, 'Serving Unit');
    if (servingUnitError) errors.push(servingUnitError);
    else {
      const unitStrError = validateString(item.serving_unit, 'Serving Unit', 20);
      if (unitStrError) errors.push(unitStrError);
    }

    const kcalError = validateRequired(item.kcal_per_serving, 'Kcal per Serving');
    if (kcalError) errors.push(kcalError);
    else {
      const kcalNumError = validateNumber(item.kcal_per_serving, 'Kcal per Serving', 0);
      if (kcalNumError) errors.push(kcalNumError);
    }

    // Validate optional numeric fields
    if (item.protein !== undefined && item.protein !== null && item.protein !== '') {
      const proteinError = validateNumber(item.protein, 'Protein', 0);
      if (proteinError) errors.push(proteinError);
    }

    if (item.carbs !== undefined && item.carbs !== null && item.carbs !== '') {
      const carbsError = validateNumber(item.carbs, 'Carbs', 0);
      if (carbsError) errors.push(carbsError);
    }

    if (item.fats !== undefined && item.fats !== null && item.fats !== '') {
      const fatsError = validateNumber(item.fats, 'Fats', 0);
      if (fatsError) errors.push(fatsError);
    }

    // Validate optional category field
    if (item.category) {
      const categoryError = validateString(item.category, 'Category', 50);
      if (categoryError) errors.push(categoryError);
    }

    return {
      name: String(item.name || '').trim(),
      category: item.category ? String(item.category).trim() : undefined,
      serving_size: String(item.serving_size || '').trim(),
      serving_unit: String(item.serving_unit || '').trim(),
      kcal_per_serving: Number(item.kcal_per_serving) || 0,
      protein: item.protein !== undefined && item.protein !== null && item.protein !== '' ? Number(item.protein) : undefined,
      carbs: item.carbs !== undefined && item.carbs !== null && item.carbs !== '' ? Number(item.carbs) : undefined,
      fats: item.fats !== undefined && item.fats !== null && item.fats !== '' ? Number(item.fats) : undefined,
      rowNumber,
      isValid: errors.length === 0,
      errors,
    };
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setParsing(true);
    try {
      const rawData = await parseExcelFile(file);
      
      if (rawData.length === 0) {
        toast.error("The file is empty or invalid");
        return;
      }

      const validated = rawData.map((item, index) => validateItem(item, index + 2)); // +2 because Excel rows start at 1 and header is row 1
      setParsedItems(validated);
      setIsOpen(true);

      const validCount = validated.filter(item => item.isValid).length;
      const invalidCount = validated.length - validCount;
      
      if (invalidCount > 0) {
        toast.warning(`${validCount} valid items, ${invalidCount} with errors`);
      } else {
        toast.success(`${validCount} items ready to import`);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to parse file");
    } finally {
      setParsing(false);
      // Reset input
      event.target.value = '';
    }
  };

  const handleImport = async () => {
    const validItems = parsedItems.filter(item => item.isValid);
    
    if (validItems.length === 0) {
      toast.error("No valid items to import");
      return;
    }

    setImporting(true);
    try {
      const itemsToInsert = validItems.map(item => ({
        name: item.name,
        category: item.category || null,
        serving_size: item.serving_size,
        serving_unit: item.serving_unit,
        kcal_per_serving: item.kcal_per_serving,
        protein: item.protein ?? null,
        carbs: item.carbs ?? null,
        fats: item.fats ?? null,
      }));

      const { error } = await supabase
        .from('food_items')
        .insert(itemsToInsert);

      if (error) throw error;

      toast.success(`Successfully imported ${validItems.length} food items!`);
      setIsOpen(false);
      setParsedItems([]);
      onImportComplete();
    } catch (error: any) {
      toast.error(error.message || "Failed to import items");
    } finally {
      setImporting(false);
    }
  };

  const validCount = parsedItems.filter(item => item.isValid).length;
  const invalidCount = parsedItems.length - validCount;

  return (
    <>
      <div className="flex gap-2">
        <Button variant="outline" onClick={downloadTemplate}>
          <Download className="mr-2 h-4 w-4" />
          Download Template
        </Button>
        <Button variant="outline" disabled={parsing} asChild>
          <label className="cursor-pointer">
            {parsing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Parsing...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Import from Excel
              </>
            )}
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="hidden"
              disabled={parsing}
            />
          </label>
        </Button>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Import Food Items Preview</DialogTitle>
            <DialogDescription>
              Review the items below before importing. Only valid items will be imported.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-4 mb-4">
            <Badge variant="default" className="bg-green-500">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              {validCount} Valid
            </Badge>
            {invalidCount > 0 && (
              <Badge variant="destructive">
                <XCircle className="mr-1 h-3 w-3" />
                {invalidCount} Invalid
              </Badge>
            )}
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Row</TableHead>
                  <TableHead className="w-12">Status</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Serving</TableHead>
                  <TableHead className="text-right">Kcal</TableHead>
                  <TableHead className="text-right">Protein</TableHead>
                  <TableHead className="text-right">Carbs</TableHead>
                  <TableHead className="text-right">Fats</TableHead>
                  <TableHead>Errors</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsedItems.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-mono text-xs">{item.rowNumber}</TableCell>
                    <TableCell>
                      {item.isValid ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>{item.category || "—"}</TableCell>
                    <TableCell>{item.serving_size} {item.serving_unit}</TableCell>
                    <TableCell className="text-right">{item.kcal_per_serving}</TableCell>
                    <TableCell className="text-right">{item.protein ?? "—"}</TableCell>
                    <TableCell className="text-right">{item.carbs ?? "—"}</TableCell>
                    <TableCell className="text-right">{item.fats ?? "—"}</TableCell>
                    <TableCell>
                      {item.errors.length > 0 && (
                        <div className="text-xs text-destructive space-y-1">
                          {item.errors.map((error, i) => (
                            <div key={i}>• {error}</div>
                          ))}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)} disabled={importing}>
              Cancel
            </Button>
            <Button onClick={handleImport} disabled={importing || validCount === 0}>
              {importing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                `Import ${validCount} Item${validCount !== 1 ? 's' : ''}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
