
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Edit2, Save, X, } from "lucide-react";
import { formatDateTime } from "@/lib/formatters";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Note {
    id: string;
    client_id: string;
    content: string;
    created_at: string;
    updated_at: string;
    admin_id: string | null;
}

interface AdminNotesProps {
    clientId: string;
    clientName: string;
}

export function AdminNotes({ clientId, clientName }: AdminNotesProps) {
    const [notes, setNotes] = useState<Note[]>([]);
    const [loading, setLoading] = useState(true);
    const [newNote, setNewNote] = useState("");
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState("");

    const fetchNotes = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from("admin_notes")
                .select("*")
                .eq("client_id", clientId)
                .order("created_at", { ascending: false });

            if (error) {
                throw error;
            }

            setNotes(data || []);
        } catch (error: any) {
            console.error("Error fetching notes:", error);
            toast.error("Failed to load notes");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (clientId) {
            fetchNotes();
        }
    }, [clientId]);

    const handleAddNote = async () => {
        if (!newNote.trim()) {
            toast.error("Note cannot be empty");
            return;
        }

        try {
            setSaving(true);
            const { error } = await supabase
                .from("admin_notes")
                .insert({
                    client_id: clientId,
                    content: newNote.trim(),
                });

            if (error) throw error;

            toast.success("Note added successfully");
            setNewNote("");
            fetchNotes();
        } catch (error: any) {
            console.error("Error adding note:", error);
            toast.error(error.message || "Failed to add note");
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteNote = async (id: string) => {
        try {
            const { error } = await supabase
                .from("admin_notes")
                .delete()
                .eq("id", id);

            if (error) throw error;

            toast.success("Note deleted");
            setNotes(notes.filter(n => n.id !== id));
        } catch (error: any) {
            console.error("Error deleting note:", error);
            toast.error("Failed to delete note");
        }
    };

    const startEditing = (note: Note) => {
        setEditingId(note.id);
        setEditContent(note.content);
    };

    const cancelEditing = () => {
        setEditingId(null);
        setEditContent("");
    };

    const handleUpdateNote = async (id: string) => {
        if (!editContent.trim()) {
            toast.error("Note cannot be empty");
            return;
        }

        try {
            const { error } = await supabase
                .from("admin_notes")
                .update({ content: editContent.trim() })
                .eq("id", id);

            if (error) throw error;

            toast.success("Note updated");
            setEditingId(null);
            fetchNotes();
        } catch (error: any) {
            console.error("Error updating note:", error);
            toast.error("Failed to update note");
        }
    };

    if (loading && notes.length === 0) {
        return (
            <Card>
                <CardContent className="pt-6">
                    <div className="flex justify-center items-center h-20">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>{clientName} Notes</CardTitle>
                    <CardDescription>
                        Private notes about this client. Not visible to the client.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <Textarea
                            placeholder="Type a new private note..."
                            value={newNote}
                            onChange={(e) => setNewNote(e.target.value)}
                            rows={3}
                        />
                        <div className="flex justify-end">
                            <Button
                                onClick={handleAddNote}
                                disabled={saving || !newNote.trim()}
                            >
                                {saving ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <Plus className="mr-2 h-4 w-4" />
                                        Add Note
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="space-y-4">
                {notes.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                        No notes yet. Use the form above to add one.
                    </p>
                ) : (
                    notes.map((note) => (
                        <Card key={note.id} className="bg-slate-50 dark:bg-slate-900 border-l-4 border-l-primary">
                            <CardContent className="pt-6">
                                {editingId === note.id ? (
                                    <div className="space-y-4">
                                        <Textarea
                                            value={editContent}
                                            onChange={(e) => setEditContent(e.target.value)}
                                            rows={3}
                                        />
                                        <div className="flex justify-end gap-2">
                                            <Button variant="ghost" size="sm" onClick={cancelEditing}>
                                                <X className="h-4 w-4 mr-1" /> Cancel
                                            </Button>
                                            <Button size="sm" onClick={() => handleUpdateNote(note.id)}>
                                                <Save className="h-4 w-4 mr-1" /> Save
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-start">
                                            <p className="whitespace-pre-wrap text-sm">{note.content}</p>
                                            <div className="flex gap-1 ml-4">
                                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => startEditing(note)}>
                                                    <Edit2 className="h-4 w-4 text-muted-foreground hover:text-primary" />
                                                </Button>

                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-destructive/10">
                                                            <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Delete Note?</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                Acc action cannot be undone. This note will be permanently deleted.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction onClick={() => handleDeleteNote(note.id)} className="bg-destructive hover:bg-destructive/90">
                                                                Delete
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>

                                            </div>
                                        </div>
                                        <div className="text-xs text-muted-foreground flex justify-between pt-2 border-t mt-2">
                                            <span>{formatDateTime(note.created_at)}</span>
                                            {/* Could add author name here if we joined with profiles */}
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
}
