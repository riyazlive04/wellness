import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Calendar } from "lucide-react";
import { format } from "date-fns";

const eventSchema = z.object({
  title: z.string().min(1, "Title is required").max(100, "Title must be less than 100 characters"),
  eventType: z.string().min(1, "Event type is required"),
  time: z.string().optional(),
  duration: z.string().optional(),
  description: z.string().optional(),
});

type EventFormData = z.infer<typeof eventSchema>;

interface EventEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: any;
  onEventUpdated?: () => void;
  onEventsChanged?: () => void;
}

export function EventEditDialog({ open, onOpenChange, event, onEventUpdated, onEventsChanged }: EventEditDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      title: event.title || "",
      eventType: event.metadata?.meeting_type || "meeting",
      time: event.metadata?.time || "",
      duration: event.metadata?.duration?.toString() || "",
      description: event.description || "",
    },
  });

  const onSubmit = async (data: EventFormData) => {
    setIsSubmitting(true);
    try {
      const metadata: any = {};
      if (data.time) metadata.time = data.time;
      if (data.duration) metadata.duration = data.duration;
      metadata.meeting_type = data.eventType;

      // Map meeting types to allowed event_type values
      const eventTypeMap: Record<string, string> = {
        'consultation': 'follow_up',
        'follow_up': 'follow_up',
        'meeting': 'follow_up',
        'appointment': 'follow_up',
        'other': 'milestone'
      };

      const { error } = await supabase
        .from('calendar_events')
        .update({
          event_type: eventTypeMap[data.eventType] || 'follow_up',
          title: data.title,
          description: data.description || null,
          metadata: Object.keys(metadata).length > 0 ? metadata : null,
        })
        .eq('id', event.metadata.id);

      if (error) throw error;

      toast.success("Meeting updated successfully!");
      form.reset();
      onOpenChange(false);
      onEventUpdated?.();
      onEventsChanged?.();
    } catch (error: any) {
      console.error("Error updating meeting:", error);
      toast.error(error.message || "Failed to update meeting");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Meeting</DialogTitle>
          <DialogDescription>
            Update meeting details
          </DialogDescription>
        </DialogHeader>

        <div className="bg-muted p-3 rounded-lg mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Meeting Date</p>
              <p className="text-lg font-semibold">{format(event.date, 'EEEE, MMMM d, yyyy')}</p>
            </div>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter meeting title" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="eventType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select meeting type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="consultation">Consultation</SelectItem>
                      <SelectItem value="follow_up">Follow-up Call</SelectItem>
                      <SelectItem value="meeting">General Meeting</SelectItem>
                      <SelectItem value="appointment">Appointment</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Time (Optional)</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="duration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration (minutes)</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="30" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Add any notes or details..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update Meeting
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}