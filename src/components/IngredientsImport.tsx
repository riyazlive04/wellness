import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Download, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { parseExcelFile, validateFoodItems, createFoodItemTemplate } from "@/lib/importUtils";

interface ImportPreviewItem {
  name: string;
  category: string;
  serving_size: string;
  serving_unit: string;
  kcal_per_serving: number;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
  valid: boolean;
  error?: string;
}

export function IngredientsImport({ onImportComplete }: { onImportComplete: () => void }) {
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<ImportPreviewItem[]>([]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const data = await parseExcelFile(file);
      const validatedItems = validateFoodItems(data);
      setPreview(validatedItems);
    } catch (error: any) {
      toast.error(error.message || "Failed to parse file");
    }
  };

  const handleImport = async () => {
    const validItems = preview.filter(item => item.valid);
    if (validItems.length === 0) {
      toast.error("No valid items to import");
      return;
    }

    setImporting(true);
    try {
      const { error } = await supabase
        .from("ingredients")
        .insert(validItems.map(item => ({
          name: item.name,
          category: item.category || null,
          serving_size: item.serving_size,
          serving_unit: item.serving_unit,
          kcal_per_serving: item.kcal_per_serving,
          protein: item.protein,
          carbs: item.carbs,
          fats: item.fats,
        })));

      if (error) throw error;

      toast.success(`Successfully imported ${validItems.length} ingredients`);
      setOpen(false);
      setPreview([]);
      onImportComplete();
    } catch (error: any) {
      toast.error(error.message || "Failed to import ingredients");
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadTemplate = () => {
    createFoodItemTemplate("ingredients_template.xlsx");
    toast.success("Template downloaded!");
  };

  const validCount = preview.filter(item => item.valid).length;
  const invalidCount = preview.length - validCount;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="mr-2 h-4 w-4" />
          Import from Excel
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import Ingredients from Excel/CSV</DialogTitle>
          <DialogDescription>
            Upload an Excel or CSV file to bulk import ingredients. Download the template for the correct format.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleDownloadTemplate}>
              <Download className="mr-2 h-4 w-4" />
              Download Template
            </Button>
            <Input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="flex-1"
            />
          </div>

          {preview.length > 0 && (
            <>
              <div className="flex gap-4 text-sm">
                <span className="text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4" />
                  Valid: {validCount}
                </span>
                <span className="text-red-600 flex items-center gap-1">
                  <XCircle className="h-4 w-4" />
                  Invalid: {invalidCount}
                </span>
              </div>

              <div className="border rounded-lg overflow-auto flex-1">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Status</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Serving</TableHead>
                      <TableHead>Kcal</TableHead>
                      <TableHead>P/C/F</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          {item.valid ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-600" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell>{item.category || "—"}</TableCell>
                        <TableCell>{item.serving_size} {item.serving_unit}</TableCell>
                        <TableCell>{item.kcal_per_serving}</TableCell>
                        <TableCell>
                          {item.protein ?? "—"} / {item.carbs ?? "—"} / {item.fats ?? "—"}
                        </TableCell>
                        <TableCell className="text-red-600 text-xs">{item.error}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setPreview([])}>
                  Clear
                </Button>
                <Button onClick={handleImport} disabled={importing || validCount === 0}>
                  {importing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    `Import ${validCount} Ingredients`
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
