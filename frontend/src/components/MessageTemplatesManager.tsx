import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Search, Loader2, MessageSquare, Info } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

interface MessageTemplate {
    id: string;
    name: string;
    category: string;
    template: string;
    trigger_event: string | null;
    variables: string[] | null;
    is_active: boolean;
    created_at: string;
}

const templateSchema = z.object({
    name: z.string().min(1, "Name is required").max(100, "Name must be less than 100 characters"),
    category: z.string().min(1, "Category is required").max(50, "Category must be less than 50 characters"),
    template: z.string().min(1, "Template body is required"),
    trigger_event: z.string().max(100, "Trigger event must be less than 100 characters").optional().nullable(),
    is_active: z.boolean().default(true),
});

type TemplateFormData = z.infer<typeof templateSchema>;

const FormFields = ({
    formData,
    setFormData,
    saving,
}: {
    formData: TemplateFormData;
    setFormData: (data: TemplateFormData) => void;
    saving: boolean;
}) => (
    <div className="space-y-4 py-4">
        <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
                <Label htmlFor="name">Template Name *</Label>
                <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., weekly_checkin"
                    disabled={saving}
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Input
                    id="category"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    placeholder="e.g., reminder"
                    disabled={saving}
                />
            </div>
        </div>

        <div className="space-y-2">
            <Label htmlFor="trigger_event">Trigger Event (Optional)</Label>
            <Input
                id="trigger_event"
                value={formData.trigger_event || ""}
                onChange={(e) => setFormData({ ...formData, trigger_event: e.target.value || null })}
                placeholder="e.g., scheduled_weekly"
                disabled={saving}
            />
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Info className="h-3 w-3" />
                Used by system automations to identify when to send this message.
            </p>
        </div>

        <div className="space-y-2">
            <Label htmlFor="template">Message Body *</Label>
            <Textarea
                id="template"
                value={formData.template}
                onChange={(e) => setFormData({ ...formData, template: e.target.value })}
                placeholder="Hi {name}, how are you today?"
                className="min-h-[150px]"
                disabled={saving}
            />
            <p className="text-[10px] text-muted-foreground">
                Use placeholders like <strong>{"{name}"}</strong>, <strong>{"{program_type}"}</strong>, <strong>{"{service_type}"}</strong>.
            </p>
        </div>

        <div className="flex items-center space-x-2">
            <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                disabled={saving}
            />
            <Label htmlFor="is_active">Template Active</Label>
        </div>
    </div>
);

export function MessageTemplatesManager() {
    const queryClient = useQueryClient();
    const [searchQuery, setSearchQuery] = useState("");
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<MessageTemplate | null>(null);
    const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const [formData, setFormData] = useState<TemplateFormData>({
        name: "",
        category: "",
        template: "",
        trigger_event: null,
        is_active: true,
    });

    const fetchTemplates = async () => {
        const { data, error } = await supabase
            .from("message_templates")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) throw error;
        return data || [];
    };

    const { data: templates = [], isLoading } = useQuery({
        queryKey: ['message-templates'],
        queryFn: fetchTemplates,
    });

    const resetForm = () => {
        setFormData({
            name: "",
            category: "",
            template: "",
            trigger_event: null,
            is_active: true,
        });
        setEditingItem(null);
    };

    const handleAdd = () => {
        resetForm();
        setIsAddDialogOpen(true);
    };

    const handleEdit = (item: MessageTemplate) => {
        setFormData({
            name: item.name,
            category: item.category,
            template: item.template,
            trigger_event: item.trigger_event,
            is_active: item.is_active,
        });
        setEditingItem(item);
    };

    const handleSave = async () => {
        try {
            const validatedData = templateSchema.parse(formData);
            setSaving(true);

            // Extract variables from template string
            const variableMatches = validatedData.template.match(/\{(\w+)\}/g);
            const variables = variableMatches ? [...new Set(variableMatches.map(v => v.slice(1, -1)))] : [];

            const dbData = {
                ...validatedData,
                variables,
            };

            if (editingItem) {
                const { error } = await supabase
                    .from("message_templates")
                    .update(dbData)
                    .eq("id", editingItem.id);

                if (error) throw error;
                toast.success("Template updated successfully!");
            } else {
                const { error } = await supabase
                    .from("message_templates")
                    .insert(dbData);

                if (error) throw error;
                toast.success("Template created successfully!");
            }

            setIsAddDialogOpen(false);
            setEditingItem(null);
            resetForm();
            queryClient.invalidateQueries({ queryKey: ['message-templates'] });
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                const firstError = error.errors[0];
                toast.error(firstError.message);
            } else {
                toast.error(error.message || "Failed to save template");
            }
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            const { error } = await supabase
                .from("message_templates")
                .delete()
                .eq("id", id);

            if (error) throw error;

            toast.success("Template deleted successfully!");
            queryClient.invalidateQueries({ queryKey: ['message-templates'] });
        } catch (error: any) {
            toast.error(error.message || "Failed to delete template");
        } finally {
            setDeleteItemId(null);
        }
    };

    const filteredItems = templates.filter(
        (item) =>
            item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.template.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <>
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div>
                            <CardTitle>Message Templates</CardTitle>
                            <CardDescription>Manage automated and manual message templates</CardDescription>
                        </div>
                        <Button onClick={handleAdd} size="sm" className="w-full sm:w-auto">
                            <Plus className="mr-2 h-4 w-4" />
                            Add Template
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Search className="h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search templates..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="max-w-sm"
                        />
                    </div>

                    {isLoading ? (
                        <div className="text-center py-12 text-muted-foreground">Loading templates...</div>
                    ) : filteredItems.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                            <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
                            <p className="text-lg font-medium mb-1">
                                {searchQuery ? "No templates found" : "No templates yet"}
                            </p>
                            <p className="text-sm">
                                {searchQuery ? "Try a different search term" : "Add your first message template to get started"}
                            </p>
                        </div>
                    ) : (
                        <div className="border rounded-lg overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Category</TableHead>
                                        <TableHead>Trigger</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredItems.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-medium">
                                                <div className="flex flex-col">
                                                    <span>{item.name}</span>
                                                    <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                                                        {item.template.substring(0, 50)}...
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="capitalize">
                                                    {item.category.replace('_', ' ')}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {item.trigger_event ? (
                                                    <code className="text-[10px] bg-muted px-1 py-0.5 rounded">
                                                        {item.trigger_event}
                                                    </code>
                                                ) : (
                                                    <span className="text-muted-foreground text-xs">Manual</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={item.is_active ? "default" : "secondary"}>
                                                    {item.is_active ? "Active" : "Inactive"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right space-x-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleEdit(item)}
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-destructive hover:text-destructive"
                                                    onClick={() => setDeleteItemId(item.id)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={isAddDialogOpen || !!editingItem} onOpenChange={(open) => {
                if (!open) {
                    setIsAddDialogOpen(false);
                    setEditingItem(null);
                    resetForm();
                }
            }}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{editingItem ? "Edit Template" : "Add Template"}</DialogTitle>
                        <DialogDescription>
                            Define a new message template for bulk sending or system triggers.
                        </DialogDescription>
                    </DialogHeader>

                    <FormFields formData={formData} setFormData={setFormData} saving={saving} />

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setIsAddDialogOpen(false);
                                setEditingItem(null);
                                resetForm();
                            }}
                            disabled={saving}
                        >
                            Cancel
                        </Button>
                        <Button onClick={handleSave} disabled={saving}>
                            {saving ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                "Save Template"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!deleteItemId} onOpenChange={() => setDeleteItemId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Template</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this message template? System automations relying on this trigger event might stop working.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => deleteItemId && handleDelete(deleteItemId)}
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

function Badge({ children, variant = "default", className = "" }: { children: React.ReactNode; variant?: "default" | "outline" | "secondary" | "destructive"; className?: string }) {
    const variants = {
        default: "bg-primary text-primary-foreground",
        outline: "border border-input bg-background",
        secondary: "bg-secondary text-secondary-foreground",
        destructive: "bg-destructive text-destructive-foreground",
    };

    return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors ${variants[variant]} ${className}`}>
            {children}
        </span>
    );
}
