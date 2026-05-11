import { useState, useEffect } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, parseISO, isWithinInterval, isSameDay } from "date-fns";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, UtensilsCrossed, Phone, Trophy, Activity, Loader2 } from "lucide-react";
import { CalendarDayDetail } from "./CalendarDayDetail";

interface CalendarEvent {
  id: string;
  date: Date;
  type: "meal_plan" | "follow_up" | "milestone" | "activity" | "custom";
  title: string;
  description?: string;
  metadata?: any;
}

interface CalendarViewProps {
  clientId: string;
}

export function CalendarView({ clientId }: CalendarViewProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDayDetail, setShowDayDetail] = useState(false);

  useEffect(() => {
    loadEvents();
  }, [clientId, currentMonth]);

  const loadEvents = async () => {
    setIsLoading(true);
    try {
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);

      const allEvents: CalendarEvent[] = [];

      // 1. Load weekly plans (meal plan days)
      const { data: weeklyPlans, error: plansError } = await supabase
        .from('weekly_plans')
        .select('id, start_date, end_date, week_number, status')
        .eq('client_id', clientId)
        .lte('start_date', format(monthEnd, 'yyyy-MM-dd'))
        .gte('end_date', format(monthStart, 'yyyy-MM-dd'));

      if (plansError) throw plansError;

      weeklyPlans?.forEach(plan => {
        const startDate = parseISO(plan.start_date);
        const endDate = parseISO(plan.end_date);

        // Create event for each day in the plan
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
          if (isWithinInterval(d, { start: monthStart, end: monthEnd })) {
            allEvents.push({
              id: `plan-${plan.id}-${format(d, 'yyyy-MM-dd')}`,
              date: new Date(d),
              type: 'meal_plan',
              title: `Week ${plan.week_number} Meal Plan`,
              description: plan.status === 'published' ? 'Active meal plan' : 'Draft meal plan',
              metadata: { plan_id: plan.id, status: plan.status },
            });
          }
        }
      });

      // 2. Load follow-ups
      const { data: followUps, error: followUpsError } = await supabase
        .from('follow_ups')
        .select('id, scheduled_date, status, follow_up_type')
        .eq('client_id', clientId)
        .gte('scheduled_date', format(monthStart, 'yyyy-MM-dd'))
        .lte('scheduled_date', format(monthEnd, 'yyyy-MM-dd'));

      if (followUpsError) throw followUpsError;

      followUps?.forEach(followUp => {
        allEvents.push({
          id: `followup-${followUp.id}`,
          date: parseISO(followUp.scheduled_date),
          type: 'follow_up',
          title: `${followUp.follow_up_type?.replace('_', '-')} Check-In`,
          description: `Status: ${followUp.status}`,
          metadata: followUp,
        });
      });

      // 3. Load calendar events (custom events and milestones)
      const { data: calendarEvents, error: eventsError } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('client_id', clientId)
        .gte('event_date', format(monthStart, 'yyyy-MM-dd'))
        .lte('event_date', format(monthEnd, 'yyyy-MM-dd'));

      if (eventsError) throw eventsError;

      calendarEvents?.forEach(event => {
        allEvents.push({
          id: `event-${event.id}`,
          date: parseISO(event.event_date),
          type: event.event_type === 'milestone' ? 'milestone' : 'custom',
          title: event.title,
          description: event.description || undefined,
          metadata: event,
        });
      });

      // 4. Load daily logs (activity indicators)
      const { data: dailyLogs, error: logsError } = await supabase
        .from('daily_logs')
        .select('id, log_date, weight, water_intake, activity_minutes, steps')
        .eq('client_id', clientId)
        .gte('log_date', format(monthStart, 'yyyy-MM-dd'))
        .lte('log_date', format(monthEnd, 'yyyy-MM-dd'));

      if (logsError) throw logsError;

      dailyLogs?.forEach(log => {
        // Only add activity indicator if there's actual data logged
        const hasActivity = log.weight || log.water_intake || log.activity_minutes || log.steps;
        if (hasActivity) {
          allEvents.push({
            id: `activity-${log.id}`,
            date: parseISO(log.log_date),
            type: 'activity',
            title: 'Activity Logged',
            description: 'Daily metrics recorded',
            metadata: log,
          });
        }
      });

      setEvents(allEvents);
    } catch (error) {
      console.error('Error loading calendar events:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getEventsForDate = (date: Date): CalendarEvent[] => {
    return events.filter(event => isSameDay(event.date, date));
  };

  const getEventIcon = (type: CalendarEvent['type']) => {
    switch (type) {
      case 'meal_plan':
        return <UtensilsCrossed className="h-3 w-3" />;
      case 'follow_up':
        return <Phone className="h-3 w-3" />;
      case 'milestone':
        return <Trophy className="h-3 w-3" />;
      case 'activity':
        return <Activity className="h-3 w-3" />;
      default:
        return <CalendarIcon className="h-3 w-3" />;
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

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
      setShowDayDetail(true);
    }
  };

  const handleMonthChange = (direction: 'prev' | 'next') => {
    const newMonth = new Date(currentMonth);
    if (direction === 'prev') {
      newMonth.setMonth(newMonth.getMonth() - 1);
    } else {
      newMonth.setMonth(newMonth.getMonth() + 1);
    }
    setCurrentMonth(newMonth);
  };

  const modifiers = {
    hasEvents: (date: Date) => getEventsForDate(date).length > 0,
  };

  const modifiersStyles = {
    hasEvents: {
      fontWeight: 'bold' as const,
      position: 'relative' as const,
    },
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (showDayDetail) {
    return (
      <CalendarDayDetail
        date={selectedDate}
        events={getEventsForDate(selectedDate)}
        clientId={clientId}
        onBack={() => setShowDayDetail(false)}
        onEventsChanged={loadEvents}
      />
    );
  }

  return (
    <Card>
      <CardHeader className="p-3 pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarIcon className="h-4 w-4" />
              Calendar
            </CardTitle>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => handleMonthChange('prev')}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-sm font-medium min-w-[120px] text-center">
              {format(currentMonth, 'MMMM yyyy')}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => handleMonthChange('next')}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <div className="space-y-6">
          {/* Calendar */}
          <div className="flex justify-center">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleDateSelect}
              month={currentMonth}
              onMonthChange={setCurrentMonth}
              modifiers={modifiers}
              modifiersStyles={modifiersStyles}
              className="rounded-md border"
            />
          </div>

          {/* Event Legend */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold mb-3">Event Types</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Badge variant="outline" className={getEventColor('meal_plan')}>
                {getEventIcon('meal_plan')}
                <span className="ml-1">Meal Plan</span>
              </Badge>
              <Badge variant="outline" className={getEventColor('follow_up')}>
                {getEventIcon('follow_up')}
                <span className="ml-1">Follow-Up</span>
              </Badge>
              <Badge variant="outline" className={getEventColor('milestone')}>
                {getEventIcon('milestone')}
                <span className="ml-1">Milestone</span>
              </Badge>
              <Badge variant="outline" className={getEventColor('activity')}>
                {getEventIcon('activity')}
                <span className="ml-1">Activity Logged</span>
              </Badge>
            </div>
          </div>

          {/* Events for current month */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold mb-3">
              Events in {format(currentMonth, 'MMMM yyyy')}
            </h3>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">No events this month</p>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {events
                  .sort((a, b) => a.date.getTime() - b.date.getTime())
                  .map(event => (
                    <div
                      key={event.id}
                      className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => handleDateSelect(event.date)}
                    >
                      <Badge variant="outline" className={`${getEventColor(event.type)} shrink-0`}>
                        {getEventIcon(event.type)}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-medium">{event.title}</span>
                          <span className="text-xs text-muted-foreground">
                            {format(event.date, 'MMM d')}
                          </span>
                        </div>
                        {event.description && (
                          <p className="text-xs text-muted-foreground truncate">
                            {event.description}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
