import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { createGroup } from "@/lib/community";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface CreateGroupModalProps {
    open: boolean;
    onClose: () => void;
    onSuccess: (group: any) => void;
    ownerClientId: string;
}

export function CreateGroupModal({ open, onClose, onSuccess, ownerClientId }: CreateGroupModalProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        name: "",
        slug: "",
        description: "",
        coverImageUrl: "",
        isPrivate: false,
    });

    const handleNameChange = (name: string) => {
        const slug = name
            .toLowerCase()
            .replace(/[^\w\s-]/g, "")
            .replace(/\s+/g, "-");
        setFormData((prev) => ({ ...prev, name, slug }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.slug) {
            toast.error("Name and slug are required");
            return;
        }

        setIsSubmitting(true);
        try {
            const group = await createGroup({
                ...formData,
                ownerClientId,
            });
            toast.success("Group created successfully!");
            onSuccess(group);
            onClose();
            // Reset form
            setFormData({
                name: "",
                slug: "",
                description: "",
                coverImageUrl: "",
                isPrivate: false,
            });
        } catch (error: any) {
            console.error("Failed to create group:", error);
            toast.error(error.message || "Failed to create group");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Create New Community Group</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Group Name</Label>
                        <Input
                            id="name"
                            placeholder="e.g. Yoga Enthusiasts"
                            value={formData.name}
                            onChange={(e) => handleNameChange(e.target.value)}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="slug">Slug (URL friendly)</Label>
                        <Input
                            id="slug"
                            placeholder="e.g. yoga-enthusiasts"
                            value={formData.slug}
                            onChange={(e) => setFormData((prev) => ({ ...prev, slug: e.target.value }))}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                            id="description"
                            placeholder="What is this group about?"
                            value={formData.description}
                            onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="coverImageUrl">Cover Image URL (Optional)</Label>
                        <Input
                            id="coverImageUrl"
                            placeholder="https://example.com/image.jpg"
                            value={formData.coverImageUrl}
                            onChange={(e) => setFormData((prev) => ({ ...prev, coverImageUrl: e.target.value }))}
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <Label htmlFor="isPrivate">Private Group</Label>
                        <Switch
                            id="isPrivate"
                            checked={formData.isPrivate}
                            onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, isPrivate: checked }))}
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Creating...
                                </>
                            ) : (
                                "Create Group"
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
