
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { FileText, Loader2, ArrowLeft, ArrowRight, CheckCircle, Check } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";

type Client = Tables<"clients">;

// --- Form Schema ---
// Simplified schema for the massive form.
// In a real production app, you might want more strict validation.

const formSchema = z.object({
    client_id: z.string().optional(),
    personal: z.object({
        name: z.string().optional().default(""),
        email: z.string().optional().default(""),
        age_gender: z.string().optional().default(""),
        contact: z.union([z.string(), z.number()]).transform((val) => String(val)).optional().default(""),
        occupation: z.string().optional().default(""),
        marital_status: z.string().optional().default(""),
        address: z.string().optional().default(""),
        lifestyle: z.enum(["Sedentary", "Moderate", "Heavy"]).optional(),
        date_of_assessment: z.string().optional().default(""),
        purpose_of_visit: z.string().optional().default(""),
        referrals: z.string().optional().default(""),
    }),
    anthropometric: z.object({
        height: z.string().optional().default(""),
        weight: z.string().optional().default(""),
        bmi: z.string().optional().default(""),
        waist_circumference: z.string().optional().default(""),
        hip_circumference: z.string().optional().default(""),
        waist_hip_ratio: z.string().optional().default(""),
        muac: z.string().optional().default(""),
        ideal_body_weight: z.string().optional().default(""),
        weight_change_percent: z.string().optional().default(""),
        body_fat_percent: z.string().optional().default(""),
        growth_percentile: z.string().optional().default(""),
        interpretation: z.array(z.string()).optional().default([]),
    }),
    biochemical: z.object({
        fbs_ppbs: z.string().optional().default(""),
        hba1c: z.string().optional().default(""),
        lipid_profile: z.string().optional().default(""),
        hemoglobin: z.string().optional().default(""),
        vitamin_d: z.string().optional().default(""),
        vitamin_b12: z.string().optional().default(""),
        serum_iron_ferritin: z.string().optional().default(""),
        serum_calcium: z.string().optional().default(""),
        thyroid_function: z.string().optional().default(""),
        lft_rft: z.string().optional().default(""),
        hormone: z.string().optional().default(""),
        others: z.string().optional().default(""),
        interpretation: z.string().optional().default(""),
    }),
    clinical: z.object({
        general_appearance: z.string().optional().default(""),
        skin_hair_nails: z.string().optional().default(""),
        eyes: z.string().optional().default(""),
        oral_cavity: z.string().optional().default(""),
        edema_dehydration: z.string().optional().default(""),
        appetite: z.enum(["Good", "Moderate", "Poor"]).optional(),
        bowel_habits: z.enum(["Regular", "Constipation", "Loose stools"]).optional(),
        digestive_issues: z.string().optional().default(""),
        bloating_etc: z.string().optional().default(""),
        menstrual_history: z.string().optional().default(""),
        sleep_pattern: z.string().optional().default(""),
        stress_anxiety: z.string().optional().default(""),
        physical_activity_level: z.enum(["Sedentary", "Moderate", "Active"]).optional(),
        medical_history: z.string().optional().default(""),
        family_history: z.string().optional().default(""),
        current_medications: z.string().optional().default(""),
    }),
    dietary: z.object({
        diet_preference: z.string().optional().default(""),
        cooking_responsibility: z.string().optional().default(""),
        skipping_meals: z.string().optional().default(""),
        recall_24hr: z.string().optional().default(""),
    }),
    ffq: z.record(z.string(), z.string().optional().default("")).optional().default({}),
    lifestyle: z.object({
        meal_timing: z.enum(["Regular", "Irregular"]).optional(),
        water_intake: z.enum(["<4", "4-8", ">8"]).optional(),
        eating_speed: z.enum(["Fast", "Medium", "Slow"]).optional(),
        emotional_eating: z.enum(["Yes", "No"]).optional(),
        outside_food_frequency: z.enum(["Daily", "Weekly", "Rare"]).optional(),
        cooking_oil: z.array(z.string()).optional().default([]),
        exercise_type: z.string().optional().default(""),
        exercise_duration: z.string().optional().default(""),
        sleep_duration: z.string().optional().default(""),
    }),
    diagnosis_plan: z.object({
        nutritional_diagnosis: z.string().optional().default(""),
        counselling_summary: z.string().optional().default(""),
        follow_up_plan: z.string().optional().default(""),
    }),
});

interface ComprehensiveAssessmentFormProps {
    clients: Client[];
    initialClientId?: string;
    initialData?: {
        name?: string;
        email?: string;
        phone?: string;
        age?: string;
        gender?: string;
    };
    trigger?: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    onSuccess?: () => void;
    assessmentId?: string | null;
}

const STEPS = [
    { id: "personal", title: "Personal Info" },
    { id: "anthropometric", title: "Measurements" },
    { id: "biochemical", title: "Biochemical" },
    { id: "clinical", title: "Clinical" },
    { id: "dietary_lifestyle", title: "Dietary & Lifestyle" },
    { id: "diagnosis", title: "Diagnosis & Plan" }
];

export function ComprehensiveAssessmentForm({
    clients,
    initialClientId,
    initialData,
    trigger,
    open: controlledOpen,
    onOpenChange: setControlledOpen,
    onSuccess,
    assessmentId: propAssessmentId,
}: ComprehensiveAssessmentFormProps) {
    const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
    const open = controlledOpen ?? uncontrolledOpen;
    const setOpen = setControlledOpen ?? setUncontrolledOpen;
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [currentStep, setCurrentStep] = useState(0);
    const [completedSteps, setCompletedSteps] = useState<number[]>([]);
    const [popoverOpen, setPopoverOpen] = useState(false);
    const [draftAssessmentId, setDraftAssessmentId] = useState<string | null>(propAssessmentId || null);
    const [isLoading, setIsLoading] = useState(false);
    const { userRole } = useAuth();
    const isAdmin = userRole === "admin";
    const isClient = userRole === "client";
    const canViewSensitve = isAdmin || isClient;

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            client_id: initialClientId || "",
            personal: {
                date_of_assessment: new Date().toISOString().split("T")[0],
                name: initialData?.name || "",
                email: initialData?.email || "",
                contact: initialData?.phone || "",
                age_gender: initialData?.age ? `${initialData.age} / ${initialData.gender || ""}` : "",
                occupation: "",
                marital_status: "",
                address: "",
                lifestyle: undefined,
                purpose_of_visit: "",
                referrals: "",
            },
            anthropometric: {
                height: "",
                weight: "",
                bmi: "",
                waist_circumference: "",
                hip_circumference: "",
                waist_hip_ratio: "",
                muac: "",
                ideal_body_weight: "",
                weight_change_percent: "",
                body_fat_percent: "",
                growth_percentile: "",
                interpretation: [],
            },
            biochemical: {
                fbs_ppbs: "",
                hba1c: "",
                lipid_profile: "",
                hemoglobin: "",
                vitamin_d: "",
                vitamin_b12: "",
                serum_iron_ferritin: "",
                serum_calcium: "",
                thyroid_function: "",
                lft_rft: "",
                hormone: "",
                others: "",
                interpretation: "",
            },
            clinical: {
                general_appearance: "",
                skin_hair_nails: "",
                eyes: "",
                oral_cavity: "",
                edema_dehydration: "",
                appetite: undefined,
                bowel_habits: undefined,
                digestive_issues: "",
                bloating_etc: "",
                menstrual_history: "",
                sleep_pattern: "",
                stress_anxiety: "",
                physical_activity_level: undefined,
                medical_history: "",
                family_history: "",
                current_medications: "",
            },
            dietary: {
                diet_preference: "",
                cooking_responsibility: "",
                skipping_meals: "",
                recall_24hr: "",
            },
            ffq: {
                Rice: "", Millets: "", "Idli/Dosa": "", "Non-veg": "", Pulses: "",
                Milk: "", Fruits: "", Vegetables: "", "Fried Food": "", Sweets: ""
            },
            lifestyle: {
                meal_timing: undefined,
                water_intake: undefined,
                eating_speed: undefined,
                emotional_eating: undefined,
                outside_food_frequency: undefined,
                cooking_oil: [],
                exercise_type: "",
                exercise_duration: "",
                sleep_duration: "",
            },
            diagnosis_plan: {
                nutritional_diagnosis: "",
                counselling_summary: "",
                follow_up_plan: "",
            },
        },
    });

    useEffect(() => {
        const loadAssessmentData = async () => {
            if (!propAssessmentId || !open) return;

            setIsLoading(true);
            try {
                const { data, error } = await supabase
                    .from("assessments")
                    .select("*")
                    .eq("id", propAssessmentId)
                    .single();

                if (error) throw error;
                if (data && data.form_responses) {
                    form.reset(data.form_responses as any);
                    setDraftAssessmentId(data.id);
                }
            } catch (error) {
                console.error("Error loading assessment:", error);
                toast.error("Failed to load assessment data");
            } finally {
                setIsLoading(false);
            }
        };

        if (propAssessmentId && open) {
            loadAssessmentData();
        } else if (initialClientId && open) {
            form.setValue("client_id", initialClientId);
            const client = clients.find((c) => c.id === initialClientId);
            if (client) {
                form.setValue("personal.name", client.name);
                form.setValue("personal.contact", client.phone);
                if (client.age) form.setValue("personal.age_gender", `${client.age} / ${client.gender || ""}`);
            }
        } else if (initialData && open) {
            form.setValue("personal.name", initialData.name || "");
            form.setValue("personal.contact", initialData.phone || "");
            if (initialData.age) form.setValue("personal.age_gender", `${initialData.age} / ${initialData.gender || ""}`);
            form.setValue("client_id", "");
        }
    }, [propAssessmentId, initialClientId, clients, form, initialData, open]);

    const handleNext = async () => {
        const fieldsToValidate = getFieldsForStep(currentStep);
        const isValid = await form.trigger(fieldsToValidate as any);

        // Mark step as completed if valid
        if (isValid && !completedSteps.includes(currentStep)) {
            setCompletedSteps(prev => [...prev, currentStep]);
        } else if (!isValid) {
            // If not valid anymore, remove from completed steps
            setCompletedSteps(prev => prev.filter(s => s !== currentStep));
        }

        // Save progress before moving to next step
        await saveAssessmentProgress(form.getValues());

        if (currentStep < STEPS.length - 1) {
            setCurrentStep(currentStep + 1);
        }
    };

    const saveAssessmentProgress = async (values: z.infer<typeof formSchema>) => {
        try {
            const assessmentData = {
                id: draftAssessmentId || undefined,
                client_id: values.client_id || null,
                assessment_type: "custom" as any,
                display_name: values.personal.name || "Comprehensive Nutritional Assessment",
                form_responses: values as any,
                status: "in-progress",
                notes: values.diagnosis_plan.nutritional_diagnosis || "Draft assessment",
                updated_at: new Date().toISOString(),
            };

            const { data, error } = await supabase
                .from("assessments")
                .upsert(assessmentData)
                .select("id")
                .single();

            if (error) throw error;
            if (data && !draftAssessmentId) {
                setDraftAssessmentId(data.id);
            }
        } catch (error) {
            console.error("Error saving draft assessment:", error);
            // We don't block the UI with a toast for background draft saves unless it's critical
        }
    };

    const getFieldsForStep = (stepIdx: number) => {
        if (stepIdx === 0) return ["client_id", "personal"];
        if (stepIdx === 1) return ["anthropometric"];
        if (stepIdx === 2) return ["biochemical"];
        if (stepIdx === 3) return ["clinical"];
        if (stepIdx === 4) return ["dietary", "ffq", "lifestyle"];
        return [];
    };

    const goToStep = async (stepIdx: number) => {
        if (stepIdx < 0 || stepIdx >= STEPS.length || stepIdx === currentStep) return;

        // If moving forward, validate current step
        if (stepIdx > currentStep) {
            const fieldsToValidate = getFieldsForStep(currentStep);
            const isValid = await form.trigger(fieldsToValidate as any);

            // Update completed status based on current validity
            if (isValid && !completedSteps.includes(currentStep)) {
                setCompletedSteps(prev => [...prev, currentStep]);
            } else if (!isValid) {
                setCompletedSteps(prev => prev.filter(s => s !== currentStep));
            }
        }

        // Save progress whenever we switch steps to ensure no data loss
        await saveAssessmentProgress(form.getValues());

        setCurrentStep(stepIdx);
    };

    const handlePrev = () => {
        if (currentStep > 0) {
            setCurrentStep(prev => prev - 1);
        }
    };

    const onSubmit = async (values: z.infer<typeof formSchema>) => {
        setIsSubmitting(true);
        try {
            const { error } = await supabase.from("assessments").upsert({
                id: draftAssessmentId || undefined,
                client_id: values.client_id || null,
                assessment_type: "custom",
                display_name: values.personal.name || "Comprehensive Nutritional Assessment",
                form_responses: values as any,
                status: isAdmin ? "completed" : "pending",
                notes: values.diagnosis_plan.nutritional_diagnosis || "Assessment submitted by client",
                updated_at: new Date().toISOString(),
            });

            if (error) throw error;
            toast.success("Assessment saved successfully");
            setOpen(false);
            form.reset();
            setCurrentStep(0);
            setCompletedSteps([]);
            onSuccess?.();
        } catch (error: any) {
            toast.error("Failed to save assessment: " + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDialogChange = (newOpen: boolean) => {
        setOpen(newOpen);
        if (!newOpen) {
            setCurrentStep(0);
            setCompletedSteps([]);
            form.reset();
            setDraftAssessmentId(null);
        }
    };

    const handleClientChange = (clientId: string) => {
        if (!clientId) {
            form.setValue("client_id", "");
            setPopoverOpen(false);
            return;
        }
        form.setValue("client_id", clientId);
        const client = clients.find((c) => c.id === clientId);
        if (client) {
            form.setValue("personal.name", client.name);
            form.setValue("personal.contact", client.phone);
            form.setValue("personal.email", client.email);
            if (client.age) form.setValue("personal.age_gender", `${client.age} / ${client.gender || ""}`);
        }
        setPopoverOpen(false);
    };

    return (
        <Dialog open={open} onOpenChange={handleDialogChange}>
            {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
            <DialogContent className="max-w-4xl max-h-[95vh] h-[95vh] overflow-hidden flex flex-col p-0 gap-0">
                {isLoading && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                        <div className="flex flex-col items-center gap-2">
                            <Loader2 className="h-8 w-8 animate-spin text-wellness-green" />
                            <p className="text-sm font-medium text-muted-foreground">Loading assessment data...</p>
                        </div>
                    </div>
                )}
                <DialogHeader className="px-6 pt-4 pb-4 border-b relative">
                    <DialogTitle>Comprehensive Nutritional Assessment</DialogTitle>
                    <div className="flex flex-col gap-3 mt-4">
                        <div className="flex justify-between items-center w-full px-2">
                            {STEPS.map((step, idx) => (
                                <div
                                    key={step.id}
                                    className="flex flex-col items-center gap-1.5 flex-1 relative group cursor-pointer"
                                    onClick={() => goToStep(idx)}
                                >
                                    <div className={cn(
                                        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all border-2",
                                        idx === currentStep
                                            ? "bg-wellness-green text-white border-wellness-green ring-4 ring-wellness-green/20"
                                            : completedSteps.includes(idx)
                                                ? "bg-wellness-green/10 text-wellness-green border-wellness-green"
                                                : "bg-muted text-muted-foreground border-transparent"
                                    )}>
                                        {completedSteps.includes(idx) ? <Check className="w-4 h-4" /> : idx + 1}
                                    </div>
                                    <span className={cn(
                                        "text-[10px] font-medium text-center transition-colors px-1",
                                        idx === currentStep ? "text-wellness-green font-bold" : "text-muted-foreground group-hover:text-foreground"
                                    )}>
                                        {step.title}
                                    </span>
                                    {idx < STEPS.length - 1 && (
                                        <div className={cn(
                                            "absolute left-[50%] right-[-50%] top-4 h-[2px] -z-10",
                                            completedSteps.includes(idx) ? "bg-wellness-green" : "bg-muted"
                                        )} />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 overflow-hidden flex flex-col">
                        <ScrollArea className="flex-1">
                            <div className="p-6 space-y-6">

                                {/* STEP 1: Personal Information */}
                                {currentStep === 0 && (
                                    <div className="space-y-4">
                                        <Card>
                                            <CardHeader><CardTitle>1. Personal Information</CardTitle></CardHeader>
                                            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <FormField
                                                    control={form.control}
                                                    name="personal.name"
                                                    render={({ field }) => (
                                                        <FormItem className="flex flex-col relative">
                                                            <FormLabel>Name *</FormLabel>
                                                            <FormControl>
                                                                <Input
                                                                    {...field}
                                                                    placeholder="Type name..."
                                                                    autoComplete="off"
                                                                    onlyAlphabets
                                                                    onFocus={() => {
                                                                        if (field.value.length >= 2) setPopoverOpen(true);
                                                                    }}
                                                                    onBlur={() => {
                                                                        // Small delay to allow clicking a suggestion
                                                                        setTimeout(() => setPopoverOpen(false), 200);
                                                                    }}
                                                                    onChange={(e) => {
                                                                        field.onChange(e);
                                                                        if (e.target.value.length >= 2) setPopoverOpen(true);
                                                                        else setPopoverOpen(false);
                                                                    }}
                                                                />
                                                            </FormControl>
                                                            {popoverOpen && field.value.length >= 2 && (
                                                                <div className="absolute top-[calc(100%+4px)] left-0 w-full bg-popover border rounded-md shadow-lg z-[100] max-h-60 overflow-auto py-1">
                                                                    {clients
                                                                        .filter(c => c.name.toLowerCase().includes(field.value.toLowerCase()))
                                                                        .map((client) => (
                                                                            <div
                                                                                key={client.id}
                                                                                className="px-4 py-2 hover:bg-accent cursor-pointer text-sm flex items-center justify-between"
                                                                                onClick={() => {
                                                                                    handleClientChange(client.id);
                                                                                    setPopoverOpen(false);
                                                                                }}
                                                                            >
                                                                                <span>{client.name}</span>
                                                                                {client.id === form.getValues("client_id") && (
                                                                                    <Check className="h-4 w-4 text-wellness-green" />
                                                                                )}
                                                                            </div>
                                                                        ))}
                                                                    {clients.filter(c => c.name.toLowerCase().includes(field.value.toLowerCase())).length === 0 && (
                                                                        <div className="px-4 py-2 text-sm text-muted-foreground italic text-center">
                                                                            No matching client found (manual entry)
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField control={form.control} name="personal.date_of_assessment" render={({ field }) => (<FormItem><FormLabel>Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                                <FormField control={form.control} name="personal.contact" render={({ field }) => (<FormItem><FormLabel>Contact</FormLabel><FormControl><Input {...field} value={canViewSensitve ? field.value : "**********"} disabled={!canViewSensitve} onlyNumbers /></FormControl><FormMessage /></FormItem>)} />
                                                <FormField control={form.control} name="personal.email" render={({ field }) => (<FormItem><FormLabel>Email *</FormLabel><FormControl><Input type="email" {...field} value={canViewSensitve ? field.value : "***@***.com"} disabled={!canViewSensitve} /></FormControl><FormMessage /></FormItem>)} />
                                                {["age_gender", "occupation", "marital_status", "address", "purpose_of_visit", "referrals"].map((key) => (
                                                    <FormField key={key} control={form.control} name={`personal.${key}` as any} render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="capitalize">{key.replace(/_/g, " ")}</FormLabel>
                                                            <FormControl>
                                                                <Input
                                                                    {...field}
                                                                    value={canViewSensitve || key !== "age_gender" ? field.value : "*** / ***"}
                                                                    disabled={!canViewSensitve && key === "age_gender"}
                                                                    onlyAlphabets={key === "occupation"}
                                                                    onlyNumbers={key === "age_gender"}
                                                                />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )} />
                                                ))}
                                                <FormField control={form.control} name="personal.lifestyle" render={({ field }) => (<FormItem><FormLabel>Lifestyle</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Sedentary">Sedentary</SelectItem><SelectItem value="Moderate">Moderate</SelectItem><SelectItem value="Heavy">Heavy work</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                                            </CardContent>
                                        </Card>
                                    </div>
                                )}

                                {/* STEP 2: Anthropometric */}
                                {currentStep === 1 && (
                                    <div className="space-y-4">
                                        <Card>
                                            <CardHeader><CardTitle>2. Anthropometric Assessment</CardTitle></CardHeader>
                                            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {[
                                                    { name: "height", label: "Height (cm)" }, { name: "weight", label: "Weight (kg)" },
                                                    { name: "bmi", label: "BMI (kg/m²)" }, { name: "waist_circumference", label: "Waist (cm)" },
                                                    { name: "hip_circumference", label: "Hip (cm)" }, { name: "waist_hip_ratio", label: "WHR" },
                                                    { name: "muac", label: "MUAC" }, { name: "ideal_body_weight", label: "Ideal Weight" },
                                                    { name: "weight_change_percent", label: "% Weight Change" }, { name: "body_fat_percent", label: "Body Fat %" },
                                                    { name: "growth_percentile", label: "Growth Percentile" },
                                                ].map((item) => (
                                                    <FormField key={item.name} control={form.control} name={`anthropometric.${item.name}` as any} render={({ field }) => (<FormItem><FormLabel>{item.label}</FormLabel><FormControl><Input {...field} onlyNumbers /></FormControl><FormMessage /></FormItem>)} />
                                                ))}
                                                <div className="col-span-full">
                                                    <Label className="mb-2 block">Interpretation</Label>
                                                    <div className="flex flex-wrap gap-4">
                                                        {["Underweight", "Normal", "Overweight", "Obese", "Muscle wasting", "Fluid retention"].map((opt) => (
                                                            <FormField key={opt} control={form.control} name="anthropometric.interpretation" render={({ field }) => (<FormItem key={opt} className="flex flex-row items-center space-x-2 space-y-0"><FormControl><Checkbox checked={field.value?.includes(opt)} onCheckedChange={(checked) => checked ? field.onChange([...(field.value || []), opt]) : field.onChange(field.value?.filter((val) => val !== opt))} /></FormControl><FormLabel className="font-normal cursor-pointer">{opt}</FormLabel></FormItem>)} />
                                                        ))}
                                                    </div>
                                                    <FormField control={form.control} name="anthropometric.interpretation" render={() => (<FormMessage />)} />
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </div>
                                )}

                                {/* STEP 3: Biochemical */}
                                {currentStep === 2 && (
                                    <div className="space-y-4">
                                        <Card>
                                            <CardHeader><CardTitle>3. Biochemical Assessment</CardTitle></CardHeader>
                                            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {["fbs_ppbs", "hba1c", "lipid_profile", "hemoglobin", "vitamin_d", "vitamin_b12", "serum_iron_ferritin", "serum_calcium", "thyroid_function", "lft_rft", "hormone", "others"].map(key => (
                                                    <FormField key={key} control={form.control} name={`biochemical.${key}` as any} render={({ field }) => (<FormItem><FormLabel className="uppercase">{key.replace(/_/g, " ")}</FormLabel><FormControl><Input {...field} onlyNumbers /></FormControl><FormMessage /></FormItem>)} />
                                                ))}
                                                <FormField control={form.control} name="biochemical.interpretation" render={({ field }) => (<FormItem className="col-span-full"><FormLabel>Interpretation</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>)} />
                                            </CardContent>
                                        </Card>
                                    </div>
                                )}

                                {/* STEP 4: Clinical */}
                                {currentStep === 3 && (
                                    <div className="space-y-4">
                                        <Card>
                                            <CardHeader><CardTitle>4. Clinical Assessment</CardTitle></CardHeader>
                                            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {["general_appearance", "skin_hair_nails", "eyes", "oral_cavity", "edema_dehydration", "digestive_issues", "bloating_etc", "menstrual_history", "sleep_pattern", "stress_anxiety", "medical_history", "family_history", "current_medications"].map(key => (
                                                    <FormField key={key} control={form.control} name={`clinical.${key}` as any} render={({ field }) => (<FormItem><FormLabel className="capitalize">{key.replace(/_/g, " ")}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                                                ))}
                                                <FormField control={form.control} name="clinical.appetite" render={({ field }) => (<FormItem><FormLabel>Appetite</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Good">Good</SelectItem><SelectItem value="Moderate">Moderate</SelectItem><SelectItem value="Poor">Poor</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                                                <FormField control={form.control} name="clinical.bowel_habits" render={({ field }) => (<FormItem><FormLabel>Bowel Habits</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Regular">Regular</SelectItem><SelectItem value="Constipation">Constipation</SelectItem><SelectItem value="Loose stools">Loose stools</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                                                <FormField control={form.control} name="clinical.physical_activity_level" render={({ field }) => (<FormItem><FormLabel>Physical Activity</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Sedentary">Sedentary</SelectItem><SelectItem value="Moderate">Moderate</SelectItem><SelectItem value="Active">Active</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                                            </CardContent>
                                        </Card>
                                    </div>
                                )}

                                {/* STEP 5: Dietary & Lifestyle */}
                                {currentStep === 4 && (
                                    <div className="space-y-4">
                                        <Card>
                                            <CardHeader><CardTitle>5. Dietary Assessment & FFQ</CardTitle></CardHeader>
                                            <CardContent className="space-y-4">
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                    <FormField control={form.control} name="dietary.diet_preference" render={({ field }) => (<FormItem><FormLabel>Diet Preference</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                                                    <FormField control={form.control} name="dietary.cooking_responsibility" render={({ field }) => (<FormItem><FormLabel>Who Cooks?</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                                                    <FormField control={form.control} name="dietary.skipping_meals" render={({ field }) => (<FormItem><FormLabel>Skipping Meals?</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                                                </div>
                                                <FormField control={form.control} name="dietary.recall_24hr" render={({ field }) => (<FormItem><FormLabel>24-Hour Diet Recall</FormLabel><FormControl><Textarea {...field} className="h-32" /></FormControl><FormMessage /></FormItem>)} />
                                                <div>
                                                    <FormLabel className="mb-2 block font-semibold">Food Frequency</FormLabel>
                                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                                                        {["Rice", "Millets", "Idli/Dosa", "Non-veg", "Pulses", "Milk", "Fruits", "Vegetables", "Fried Food", "Sweets"].map(item => (
                                                            <FormField
                                                                key={item}
                                                                control={form.control}
                                                                name={`ffq.${item}` as any}
                                                                render={({ field }) => (
                                                                    <FormItem className="flex flex-col border p-2 rounded-md bg-accent/5 hover:bg-accent/10 transition-colors">
                                                                        <FormLabel className="mb-2 text-[10px] font-bold uppercase text-center text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">{item}</FormLabel>
                                                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                                            <FormControl>
                                                                                <SelectTrigger className="h-8 text-xs bg-background">
                                                                                    <SelectValue placeholder="-" />
                                                                                </SelectTrigger>
                                                                            </FormControl>
                                                                            <SelectContent>
                                                                                <SelectItem value="Daily">Daily</SelectItem>
                                                                                <SelectItem value="Weekly">Weekly</SelectItem>
                                                                                <SelectItem value="Rare">Rare</SelectItem>
                                                                                <SelectItem value="Never">Never</SelectItem>
                                                                            </SelectContent>
                                                                        </Select>
                                                                        <FormMessage />
                                                                    </FormItem>
                                                                )}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                        <Card>
                                            <CardHeader><CardTitle>Lifestyle</CardTitle></CardHeader>
                                            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <FormField control={form.control} name="lifestyle.meal_timing" render={({ field }) => (<FormItem><FormLabel>Meal Timing</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="-" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Regular">Regular</SelectItem><SelectItem value="Irregular">Irregular</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                                                <FormField control={form.control} name="lifestyle.water_intake" render={({ field }) => (<FormItem><FormLabel>Water Intake</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="-" /></SelectTrigger></FormControl><SelectContent><SelectItem value="<4">&lt;4</SelectItem><SelectItem value="4-8">4-8</SelectItem><SelectItem value=">8">&gt;8</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                                                <FormField
                                                    control={form.control}
                                                    name="lifestyle.eating_speed"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>Eating Speed</FormLabel>
                                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                                <FormControl>
                                                                    <SelectTrigger><SelectValue placeholder="Select speed" /></SelectTrigger>
                                                                </FormControl>
                                                                <SelectContent>
                                                                    <SelectItem value="Fast">Fast</SelectItem>
                                                                    <SelectItem value="Medium">Medium</SelectItem>
                                                                    <SelectItem value="Slow">Slow</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField
                                                    control={form.control}
                                                    name="lifestyle.emotional_eating"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>Emotional Eating</FormLabel>
                                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                                <FormControl>
                                                                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                                                                </FormControl>
                                                                <SelectContent>
                                                                    <SelectItem value="Yes">Yes</SelectItem>
                                                                    <SelectItem value="No">No</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField
                                                    control={form.control}
                                                    name="lifestyle.outside_food_frequency"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>Outside Food Frequency</FormLabel>
                                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                                <FormControl>
                                                                    <SelectTrigger><SelectValue placeholder="Select frequency" /></SelectTrigger>
                                                                </FormControl>
                                                                <SelectContent>
                                                                    <SelectItem value="Daily">Daily</SelectItem>
                                                                    <SelectItem value="Weekly">Weekly</SelectItem>
                                                                    <SelectItem value="Rare">Rare</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                                {["exercise_type", "exercise_duration", "sleep_duration"].map(key => (
                                                    <FormField key={key} control={form.control} name={`lifestyle.${key}` as any} render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="capitalize">{key.replace(/_/g, " ")}</FormLabel>
                                                            <FormControl><Input {...field} onlyNumbers /></FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )} />
                                                ))}
                                                <div className="col-span-full">
                                                    <Label className="mb-2 block">Cooking Oil</Label>
                                                    <div className="flex flex-wrap gap-4">
                                                        {["Groundnut", "Coconut", "Sunflower", "Gingelly", "Mixed"].map((opt) => (
                                                            <FormField
                                                                key={opt}
                                                                control={form.control}
                                                                name="lifestyle.cooking_oil"
                                                                render={({ field }) => (
                                                                    <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                                                                        <FormControl>
                                                                            <Checkbox
                                                                                checked={field.value?.includes(opt)}
                                                                                onCheckedChange={(checked) =>
                                                                                    checked
                                                                                        ? field.onChange([...(field.value || []), opt])
                                                                                        : field.onChange(field.value?.filter((val) => val !== opt))
                                                                                }
                                                                            />
                                                                        </FormControl>
                                                                        <Label className="font-normal cursor-pointer">{opt}</Label>
                                                                    </FormItem>
                                                                )}
                                                            />
                                                        ))}
                                                    </div>
                                                    <FormField control={form.control} name="lifestyle.cooking_oil" render={() => (<FormMessage />)} />
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </div>
                                )}

                                {/* STEP 6: Diagnosis & Plan */}
                                {currentStep === 5 && (
                                    <div className="space-y-4">
                                        <Card className="border-primary/20 bg-primary/5">
                                            <CardHeader><CardTitle className="text-primary">6. Diagnosis & Plan</CardTitle></CardHeader>
                                            <CardContent className="space-y-4">
                                                <FormField control={form.control} name="diagnosis_plan.nutritional_diagnosis" render={({ field }) => (<FormItem><FormLabel>Nutritional Diagnosis</FormLabel><FormControl><Textarea {...field} className="min-h-[100px]" /></FormControl><FormMessage /></FormItem>)} />
                                                <FormField control={form.control} name="diagnosis_plan.counselling_summary" render={({ field }) => (<FormItem><FormLabel>Counselling Summary</FormLabel><FormControl><Textarea {...field} className="min-h-[100px]" /></FormControl><FormMessage /></FormItem>)} />
                                                <FormField control={form.control} name="diagnosis_plan.follow_up_plan" render={({ field }) => (<FormItem><FormLabel>Follow-up Plan</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                                            </CardContent>
                                        </Card>
                                    </div>
                                )}
                            </div>
                        </ScrollArea>

                        <div className="flex items-center justify-between p-4 border-t bg-muted/20">
                            <Button type="button" variant="outline" onClick={handlePrev} disabled={currentStep === 0 || isSubmitting} className={currentStep === 0 ? "invisible" : ""}>
                                <ArrowLeft className="mr-2 h-4 w-4" /> Previous
                            </Button>
                            <div className="flex gap-2">
                                {currentStep === 0 && <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>}
                                {currentStep < STEPS.length - 1 ? (
                                    <Button type="button" onClick={handleNext}>Next <ArrowRight className="ml-2 h-4 w-4" /></Button>
                                ) : (
                                    <Button type="submit" disabled={isSubmitting} className="bg-wellness-green hover:bg-wellness-green/90 text-white">
                                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        <CheckCircle className="mr-2 h-4 w-4" /> Submit Assessment
                                    </Button>
                                )}
                            </div>
                        </div>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}


