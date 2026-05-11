import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Trash2, User, Key, Loader2 } from "lucide-react";
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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

export function ManagersManager() {
    const queryClient = useQueryClient();
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
    const [selectedManager, setSelectedManager] = useState<{ id: string, name: string, email: string } | null>(null);
    const [newPassword, setNewPassword] = useState("");
    const [updatingPassword, setUpdatingPassword] = useState(false);

    const { data: managers, isLoading, refetch } = useQuery({
        queryKey: ['managers-list'],
        queryFn: async () => {
            // Fetch users with 'manager' role
            const { data: roles, error: rolesError } = await supabase
                .from('user_roles')
                .select('user_id')
                .eq('role', 'manager');

            if (rolesError) throw rolesError;

            const userIds = roles?.map(r => r.user_id) || [];
            if (userIds.length === 0) return [];

            // Fetch profiles for these users
            const { data: profiles, error: profilesError } = await supabase
                .from('profiles')
                .select('*')
                .in('id', userIds);

            if (profilesError) throw profilesError;
            return profiles;
        },
    });

    const handleDeleteManager = async (userId: string) => {
        try {
            const { data, error } = await supabase.functions.invoke('delete-user', {
                body: { user_id: userId }
            });

            if (error) throw error;
            if (data?.error) throw new Error(data.error);

            toast.success("Manager account deleted successfully");
            refetch();
            // Also invalidate admin-dashboard query since it might be affected
            queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
        } catch (error: any) {
            console.error("Delete manager error:", error);
            toast.error(error.message || "Failed to delete manager account");
        } finally {
            setDeletingId(null);
        }
    };

    const handleChangePassword = async () => {
        if (!selectedManager || !newPassword) return;

        if (newPassword.length < 6) {
            toast.error("Password must be at least 6 characters");
            return;
        }

        setUpdatingPassword(true);
        try {
            const { data, error } = await supabase.functions.invoke('update-manager-password', {
                body: {
                    user_id: selectedManager.id,
                    password: newPassword
                }
            });

            if (error) throw error;
            if (data?.error) throw new Error(data.error);

            toast.success(`Password updated for ${selectedManager.name || selectedManager.email}`);
            setPasswordDialogOpen(false);
            setNewPassword("");
            setSelectedManager(null);
        } catch (error: any) {
            console.error("Change password error:", error);
            toast.error(error.message || "Failed to update password");
        } finally {
            setUpdatingPassword(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Manager Accounts</CardTitle>
                <CardDescription>View and manage manager credentials. Warning: Deleting an account is permanent.</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="text-center py-8">Loading managers...</div>
                ) : !managers || managers.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                        <User className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>No extra manager accounts found.</p>
                    </div>
                ) : (
                    <div className="border rounded-lg overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Phone</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {managers.map((manager) => (
                                    <TableRow key={manager.id}>
                                        <TableCell className="font-medium">{manager.name || "—"}</TableCell>
                                        <TableCell>{manager.email || "—"}</TableCell>
                                        <TableCell>{manager.phone || "—"}</TableCell>
                                        <TableCell className="text-right flex justify-end gap-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-primary hover:text-primary hover:bg-primary/10"
                                                onClick={() => {
                                                    setSelectedManager({
                                                        id: manager.id,
                                                        name: manager.name,
                                                        email: manager.email
                                                    });
                                                    setPasswordDialogOpen(true);
                                                }}
                                            >
                                                <Key className="h-4 w-4" />
                                            </Button>

                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Delete Manager Account?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            This will permanently delete the account for <strong>{manager.name || manager.email}</strong>.
                                                            They will lose all access immediately. This action cannot be undone.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                        <AlertDialogAction
                                                            onClick={() => handleDeleteManager(manager.id)}
                                                            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                                                        >
                                                            Delete Forever
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>

            <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Change Manager Password</DialogTitle>
                        <DialogDescription>
                            Updating password for <strong>{selectedManager?.name || selectedManager?.email}</strong>.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">New Password</label>
                            <Input
                                type="password"
                                placeholder="Enter at least 6 characters"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setPasswordDialogOpen(false);
                                setNewPassword("");
                            }}
                            disabled={updatingPassword}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleChangePassword}
                            disabled={updatingPassword || !newPassword}
                        >
                            {updatingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Update Password
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
