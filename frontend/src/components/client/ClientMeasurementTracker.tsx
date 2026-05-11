import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Ruler, History } from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";

interface Measurement {
    id: string;
    recorded_at: string;
    arm_inches: number | null;
    chest_inches: number | null;
    waist_inches: number | null;
    hip_inches: number | null;
    thigh_inches: number | null;
}

export function ClientMeasurementTracker({ clientId }: { clientId: string }) {
    const [measurements, setMeasurements] = useState<Measurement[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showAddForm, setShowAddForm] = useState(false);

    const fetchMeasurements = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from("client_measurements")
                .select("*")
                .eq("client_id", clientId)
                .order("recorded_at", { ascending: false });

            if (error) {
                // Check if it's a "table not found" error
                if (error.code === 'P0001' || error.message.includes('relation "client_measurements" does not exist')) {
                    console.warn("client_measurements table not found, expected if migrations haven't run");
                    setMeasurements([]);
                    return;
                }
                throw error;
            }
            setMeasurements(data || []);
        } catch (error) {
            console.error("Error fetching measurements:", error);
            // Don't show toast for "table not found" to avoid annoying user
            if (!(error as any).message?.includes('relation "client_measurements" does not exist')) {
                toast.error("Failed to load measurements");
            }
        } finally {
            setIsLoading(false);
        }
    }, [clientId]);

    useEffect(() => {
        fetchMeasurements();
    }, [fetchMeasurements]);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsSubmitting(true);

        const formData = new FormData(e.currentTarget);
        const newMeasurement = {
            client_id: clientId,
            arm_inches: formData.get("arm") ? parseFloat(formData.get("arm") as string) : null,
            chest_inches: formData.get("chest") ? parseFloat(formData.get("chest") as string) : null,
            waist_inches: formData.get("waist") ? parseFloat(formData.get("waist") as string) : null,
            hip_inches: formData.get("hip") ? parseFloat(formData.get("hip") as string) : null,
            thigh_inches: formData.get("thigh") ? parseFloat(formData.get("thigh") as string) : null,
        };

        if (!Object.values(newMeasurement).some(val => val !== null && val !== clientId)) {
            toast.error("Please enter at least one measurement");
            setIsSubmitting(false);
            return;
        }

        try {
            const { error } = await supabase
                .from("client_measurements")
                .insert(newMeasurement);

            if (error) throw error;

            toast.success("Measurements recorded successfully");
            setShowAddForm(false);
            fetchMeasurements();
        } catch (error) {
            console.error("Error saving measurements:", error);
            toast.error("Failed to save measurements");
        } finally {
            setIsSubmitting(false);
        }
    };

    const latest = measurements[0];
    const previous = measurements[1];

    const getDiff = (current: number | null, prev: number | null) => {
        if (current === null || prev === null) return null;
        const diff = current - prev;
        if (diff === 0) return <span className="text-muted-foreground">-</span>;
        return diff > 0
            ? <span className="text-red-500">+{diff.toFixed(1)}</span>
            : <span className="text-green-500">{diff.toFixed(1)}</span>;
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    <Ruler className="w-6 h-6 text-primary" />
                    Body Measurements
                </h2>
                <Button onClick={() => setShowAddForm(!showAddForm)} variant={showAddForm ? "outline" : "default"}>
                    {showAddForm ? "Cancel" : "Update Measurements"}
                </Button>
            </div>

            {showAddForm && (
                <Card className="animate-in slide-in-from-top-4">
                    <CardHeader>
                        <CardTitle>New Entry</CardTitle>
                        <CardDescription>Enter your current body measurements in inches.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="arm">Arm</Label>
                                    <Input id="arm" name="arm" type="number" step="0.1" min="0" placeholder="e.g. 12.5" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="chest">Chest</Label>
                                    <Input id="chest" name="chest" type="number" step="0.1" min="0" placeholder="e.g. 36" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="waist">Waist</Label>
                                    <Input id="waist" name="waist" type="number" step="0.1" min="0" placeholder="e.g. 32" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="hip">Hip</Label>
                                    <Input id="hip" name="hip" type="number" step="0.1" min="0" placeholder="e.g. 38" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="thigh">Thigh</Label>
                                    <Input id="thigh" name="thigh" type="number" step="0.1" min="0" placeholder="e.g. 21" />
                                </div>
                            </div>
                            <Button type="submit" disabled={isSubmitting} className="w-full md:w-auto">
                                {isSubmitting ? "Saving..." : "Save Entry"}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            )}

            {/* Latest Overview */}
            {latest && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <Card>
                        <CardHeader className="p-4 pb-2"><CardTitle className="text-sm font-medium">Arm</CardTitle></CardHeader>
                        <CardContent className="p-4 pt-0">
                            <div className="text-2xl font-bold">{latest.arm_inches || "-"}</div>
                            {previous && <div className="text-xs">{getDiff(latest.arm_inches, previous.arm_inches)} from last</div>}
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="p-4 pb-2"><CardTitle className="text-sm font-medium">Chest</CardTitle></CardHeader>
                        <CardContent className="p-4 pt-0">
                            <div className="text-2xl font-bold">{latest.chest_inches || "-"}</div>
                            {previous && <div className="text-xs">{getDiff(latest.chest_inches, previous.chest_inches)} from last</div>}
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="p-4 pb-2"><CardTitle className="text-sm font-medium">Waist</CardTitle></CardHeader>
                        <CardContent className="p-4 pt-0">
                            <div className="text-2xl font-bold">{latest.waist_inches || "-"}</div>
                            {previous && <div className="text-xs">{getDiff(latest.waist_inches, previous.waist_inches)} from last</div>}
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="p-4 pb-2"><CardTitle className="text-sm font-medium">Hip</CardTitle></CardHeader>
                        <CardContent className="p-4 pt-0">
                            <div className="text-2xl font-bold">{latest.hip_inches || "-"}</div>
                            {previous && <div className="text-xs">{getDiff(latest.hip_inches, previous.hip_inches)} from last</div>}
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="p-4 pb-2"><CardTitle className="text-sm font-medium">Thigh</CardTitle></CardHeader>
                        <CardContent className="p-4 pt-0">
                            <div className="text-2xl font-bold">{latest.thigh_inches || "-"}</div>
                            {previous && <div className="text-xs">{getDiff(latest.thigh_inches, previous.thigh_inches)} from last</div>}
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* History Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <History className="w-5 h-5" />
                        History
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Arm</TableHead>
                                <TableHead>Chest</TableHead>
                                <TableHead>Waist</TableHead>
                                <TableHead>Hip</TableHead>
                                <TableHead>Thigh</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {measurements.map((m) => (
                                <TableRow key={m.id}>
                                    <TableCell>{format(new Date(m.recorded_at), "MMM d, yyyy")}</TableCell>
                                    <TableCell>{m.arm_inches || "-"}</TableCell>
                                    <TableCell>{m.chest_inches || "-"}</TableCell>
                                    <TableCell>{m.waist_inches || "-"}</TableCell>
                                    <TableCell>{m.hip_inches || "-"}</TableCell>
                                    <TableCell>{m.thigh_inches || "-"}</TableCell>
                                </TableRow>
                            ))}
                            {measurements.length === 0 && !isLoading && (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center text-muted-foreground h-24">
                                        No measurements recorded yet.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
