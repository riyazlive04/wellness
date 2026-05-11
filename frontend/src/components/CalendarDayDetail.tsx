import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { ChevronLeft, UtensilsCrossed, Phone, Trophy, Activity, Calendar as CalendarIcon, Loader2, Plus, Edit, Trash } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { EventScheduleDialog } from "./EventScheduleDialog";
import { EventEditDialog } from "./EventEditDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface CalendarEvent {
  id: string;
  date: Date;
  type: "meal_plan" | "follow_up" | "milestone" | "activity" | "custom";
  title: string;
  description?: string;
  metadata?: any;
}

interface CalendarDayDetailProps {
  date: Date;
  events: CalendarEvent[];
  clientId: string;
  onBack: () => void;
  onEventsChanged?: () => void;
}

export function CalendarDayDetail({ date, events, clientId, onBack, onEventsChanged }: CalendarDayDetailProps) {
  const { userRole } = useAuth();
  const [mealPlanDetails, setMealPlanDetails] = useState<any[]>([]);
  const [dailyLogDetails, setDailyLogDetails] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  useEffect(() => {
    loadDayDetails();
  }, [date, clientId]);

  const loadDayDetails = async () => {
    setIsLoading(true);
    try {
      const dateStr = format(date, 'yyyy-MM-dd');

      // Load meal cards for this day if there's a meal plan
      const mealPlanEvent = events.find(e => e.type === 'meal_plan');
      if (mealPlanEvent?.metadata?.plan_id) {
        const { data: mealCards } = await supabase
          .from('meal_cards')
          .select('*')
          .eq('plan_id', mealPlanEvent.metadata.plan_id)
          .order('meal_type');

        if (mealCards) {
          // Determine day number in the week
          const { data: plan } = await supabase
            .from('weekly_plans')
            .select('start_date')
            .eq('id', mealPlanEvent.metadata.plan_id)
            .single();

          if (plan) {
            const startDate = new Date(plan.start_date);
            const dayNumber = Math.floor((date.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

            const dayMeals = mealCards.filter(card => card.day_number === dayNumber);
            setMealPlanDetails(dayMeals);
          }
        }
      }

      // Load daily log for this day
      const { data: dailyLog } = await supabase
        .from('daily_logs')
        .select('*')
        .eq('client_id', clientId)
        .eq('log_date', dateStr)
        .maybeSingle();

      setDailyLogDetails(dailyLog);

    } catch (error) {
      console.error('Error loading day details:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getEventIcon = (type: CalendarEvent['type']) => {
    switch (type) {
      case 'meal_plan':
        return <UtensilsCrossed className="h-4 w-4" />;
      case 'follow_up':
        return <Phone className="h-4 w-4" />;
      case 'milestone':
        return <Trophy className="h-4 w-4" />;
      case 'activity':
        return <Activity className="h-4 w-4" />;
      default:
        return <CalendarIcon className="h-4 w-4" />;
    }
  };

  const getEventColor = (type: CalendarEvent['type']) => {
    switch (type) {
      case 'meal_plan':
        return 'bg-primary/10 text-primary border-primary/20';
      case 'follow_up':
        return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'milestone':
        return 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20';
      case 'activity':
        return 'bg-orange-500/10 text-orange-600 border-orange-500/20';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  const formatMealType = (type: string) => {
    return type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const handleEditEvent = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setShowEditDialog(true);
  };

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<CalendarEvent | null>(null);

  const handleDeleteEvent = (event: CalendarEvent) => {
    setEventToDelete(event);
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!eventToDelete?.metadata?.id) return;

    try {
      const { error } = await supabase
        .from('calendar_events')
        .delete()
        .eq('id', eventToDelete.metadata.id);

      if (error) throw error;

      toast.success("Meeting deleted successfully!");
      setShowDeleteDialog(false);
      setEventToDelete(null);
      loadDayDetails();
      onEventsChanged?.();
    } catch (error: any) {
      console.error("Error deleting meeting:", error);
      toast.error(error.message || "Failed to delete meeting");
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div>
              <CardTitle>{format(date, 'EEEE, MMMM d, yyyy')}</CardTitle>
              <CardDescription>
                {events.length} {events.length === 1 ? 'event' : 'events'} on this day
              </CardDescription>
            </div>
          </div>
          {(userRole === 'admin' || userRole === 'manager') && (
            <Button onClick={() => setShowScheduleDialog(true)} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Schedule Meeting
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Events List */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Events</h3>
              {events.length === 0 ? (
                <p className="text-sm text-muted-foreground">No events scheduled</p>
              ) : (
                <div className="space-y-3">
                  {events.map(event => (
                    <div key={event.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                      <Badge variant="outline" className={`${getEventColor(event.type)} shrink-0`}>
                        {getEventIcon(event.type)}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-medium text-sm">{event.title}</h4>
                          <div className="flex items-center gap-1">
                            {event.metadata?.time && (
                              <span className="text-xs text-muted-foreground">
                                {event.metadata.time}
                                {event.metadata.duration && ` (${event.metadata.duration} min)`}
                              </span>
                            )}
                            {(userRole === 'admin' || userRole === 'manager') && event.metadata?.id && event.type === 'custom' && (
                              <div className="flex gap-1 ml-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => handleEditEvent(event)}
                                >
                                  <Edit className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-destructive hover:text-destructive"
                                  onClick={() => handleDeleteEvent(event)}
                                >
                                  <Trash className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                        {event.description && (
                          <p className="text-xs text-muted-foreground mt-1">{event.description}</p>
                        )}
                        {event.metadata?.meeting_type && (
                          <Badge variant="secondary" className="mt-2 text-xs">
                            {event.metadata.meeting_type}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Meal Plan Details */}
            {mealPlanDetails.length > 0 && (
              <>
                <Separator />
                <div>
                  <h3 className="text-sm font-semibold mb-3">Today's Meal Plan</h3>
                  <div className="space-y-3">
                    {mealPlanDetails.map(meal => (
                      <Card key={meal.id} className="bg-muted/30">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <Badge variant="outline" className="mb-1">
                                {formatMealType(meal.meal_type)}
                              </Badge>
                              <h4 className="font-semibold">{meal.meal_name}</h4>
                            </div>
                            <Badge variant="secondary">{meal.kcal} kcal</Badge>
                          </div>
                          {meal.description && (
                            <p className="text-sm text-muted-foreground mb-2">{meal.description}</p>
                          )}
                          {meal.ingredients && (
                            <div className="text-xs">
                              <span className="font-medium">Ingredients: </span>
                              <span className="text-muted-foreground">{meal.ingredients}</span>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  <div className="mt-3 p-3 bg-primary/5 rounded-lg border border-primary/20">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Total Calories</span>
                      <span className="text-lg font-bold text-primary">
                        {mealPlanDetails.reduce((sum, meal) => sum + meal.kcal, 0)} kcal
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Daily Activity Summary */}
            {dailyLogDetails && (
              <>
                <Separator />
                <div>
                  <h3 className="text-sm font-semibold mb-3">Daily Activity Summary</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {dailyLogDetails.weight && (
                      <Card className="bg-muted/30">
                        <CardContent className="p-3">
                          <div className="text-xs text-muted-foreground mb-1">Weight</div>
                          <div className="text-lg font-semibold">{dailyLogDetails.weight} kg</div>
                        </CardContent>
                      </Card>
                    )}
                    {dailyLogDetails.water_intake !== null && (
                      <Card className="bg-muted/30">
                        <CardContent className="p-3">
                          <div className="text-xs text-muted-foreground mb-1">Water</div>
                          <div className="text-lg font-semibold">{dailyLogDetails.water_intake} ml</div>
                        </CardContent>
                      </Card>
                    )}
                    {dailyLogDetails.activity_minutes !== null && (
                      <Card className="bg-muted/30">
                        <CardContent className="p-3">
                          <div className="text-xs text-muted-foreground mb-1">Activity</div>
                          <div className="text-lg font-semibold">{dailyLogDetails.activity_minutes} min</div>
                        </CardContent>
                      </Card>
                    )}
                    {dailyLogDetails.steps !== null && (
                      <Card className="bg-muted/30">
                        <CardContent className="p-3">
                          <div className="text-xs text-muted-foreground mb-1">Steps</div>
                          <div className="text-lg font-semibold">{dailyLogDetails.steps}</div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                  {dailyLogDetails.notes && (
                    <Card className="bg-muted/30 mt-3">
                      <CardContent className="p-3">
                        <div className="text-xs text-muted-foreground mb-1">Notes</div>
                        <p className="text-sm">{dailyLogDetails.notes}</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </>
            )}

            {/* Empty State */}
            {events.length === 0 && !mealPlanDetails.length && !dailyLogDetails && (
              <div className="text-center py-8">
                <CalendarIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">
                  No events or activities on this day
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>

      <EventScheduleDialog
        open={showScheduleDialog}
        onOpenChange={setShowScheduleDialog}
        date={date}
        clientId={clientId}
        onEventCreated={loadDayDetails}
        onEventsChanged={onEventsChanged}
      />

      {selectedEvent && (
        <EventEditDialog
          open={showEditDialog}
          onOpenChange={setShowEditDialog}
          event={selectedEvent}
          onEventUpdated={loadDayDetails}
          onEventsChanged={onEventsChanged}
        />
      )}

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Meeting</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{eventToDelete?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
