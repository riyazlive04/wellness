import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Calendar } from "lucide-react";

const eventSchema = z.object({
  title: z.string().min(1, "Title is required").max(100, "Title must be less than 100 characters"),
  eventType: z.string().min(1, "Event type is required"),
  hour: z.string().optional(),
  minute: z.string().optional(),
  ampm: z.enum(["AM", "PM"]).optional(),
  duration: z.coerce.number().min(5).max(480).optional(),
  description: z.string().max(500, "Description must be less than 500 characters").optional(),
});

type EventFormData = z.infer<typeof eventSchema>;

interface EventScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: Date;
  clientId: string;
  onEventCreated?: () => void;
  onEventsChanged?: () => void;
}

export function EventScheduleDialog({ open, onOpenChange, date, clientId, onEventCreated, onEventsChanged }: EventScheduleDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      title: "",
      eventType: "",
      hour: "12",
      minute: "00",
      ampm: "AM",
      duration: undefined,
      description: "",
    },
  });

  const onSubmit = async (data: EventFormData) => {
    setIsSubmitting(true);
    try {
      const metadata: any = {};

      // Construct time string if fields are present
      if (data.hour && data.minute && data.ampm) {
        metadata.time = `${data.hour}:${data.minute} ${data.ampm}`;
      }

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
        .insert({
          client_id: clientId,
          event_date: format(date, 'yyyy-MM-dd'),
          event_type: eventTypeMap[data.eventType] || 'follow_up',
          title: data.title,
          description: data.description || null,
          metadata: Object.keys(metadata).length > 0 ? metadata : null,
        });

      if (error) throw error;

      toast.success("Meeting scheduled successfully!");
      form.reset({
        title: "",
        eventType: "",
        hour: "12",
        minute: "00",
        ampm: "AM",
        duration: undefined,
        description: "",
      });
      onOpenChange(false);
      onEventCreated?.();
      onEventsChanged?.();
    } catch (error: any) {
      console.error('Error scheduling meeting:', error);
      toast.error(error.message || "Failed to schedule meeting");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Schedule Meeting</DialogTitle>
          <DialogDescription>
            Create a new meeting or event for your client
          </DialogDescription>
        </DialogHeader>

        <div className="bg-muted p-3 rounded-lg mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Meeting Date</p>
              <p className="text-lg font-semibold">{format(date, 'EEEE, MMMM d, yyyy')}</p>
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
                  <FormLabel>Title *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Weekly Check-in Call" {...field} />
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
                  <FormLabel>Event Type *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select event type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="consultation">Consultation</SelectItem>
                      <SelectItem value="follow_up">Follow-up Call</SelectItem>
                      <SelectItem value="meeting">Meeting</SelectItem>
                      <SelectItem value="appointment">Appointment</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormItem>
                <FormLabel>Time</FormLabel>
                <div className="flex items-center gap-2">
                  <FormField
                    control={form.control}
                    name="hour"
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="w-[70px]">
                            <SelectValue placeholder="HH" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Array.from({ length: 12 }, (_, i) => i + 1).map((num) => (
                            <SelectItem key={num} value={num.toString()}>
                              {num}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <span className="text-muted-foreground">:</span>
                  <FormField
                    control={form.control}
                    name="minute"
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="w-[70px]">
                            <SelectValue placeholder="MM" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"].map((min) => (
                            <SelectItem key={min} value={min}>
                              {min}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="ampm"
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="w-[70px]">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="AM">AM</SelectItem>
                          <SelectItem value="PM">PM</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </FormItem>

              <FormField
                control={form.control}
                name="duration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration (min)</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="30" min={5} max={480} {...field} />
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
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Additional details about this meeting..."
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
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
                Schedule Meeting
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
