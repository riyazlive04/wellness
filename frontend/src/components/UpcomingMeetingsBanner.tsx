import { useState, useEffect } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Bell, X } from "lucide-react";
import { format, addDays, parseISO } from "date-fns";
import { formatDateTime } from "@/lib/formatters";

interface UpcomingMeeting {
  id: string;
  title: string;
  event_date: string;
  metadata: any;
}

interface UpcomingMeetingsBannerProps {
  clientId: string;
  onNavigate: (date: Date) => void;
}

export function UpcomingMeetingsBanner({ clientId, onNavigate }: UpcomingMeetingsBannerProps) {
  const [upcomingMeetings, setUpcomingMeetings] = useState<UpcomingMeeting[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    loadUpcomingMeetings();
  }, [clientId]);

  const loadUpcomingMeetings = async () => {
    const today = new Date();
    const nextWeek = addDays(today, 7);

    const { data, error } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('client_id', clientId)
      .gte('event_date', format(today, 'yyyy-MM-dd'))
      .lte('event_date', format(nextWeek, 'yyyy-MM-dd'))
      .order('event_date', { ascending: true });

    if (!error && data && data.length > 0) {
      setUpcomingMeetings(data);
    }
  };

  if (dismissed || upcomingMeetings.length === 0) {
    return null;
  }

  const nextMeeting = upcomingMeetings[0];
  const meetingDate = parseISO(nextMeeting.event_date);

  return (
    <Alert className="mb-4 border-blue-500 bg-blue-50 dark:bg-blue-950/20">
      <Bell className="h-4 w-4 text-blue-600" />
      <AlertTitle className="flex items-center justify-between">
        Upcoming Meeting
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setDismissed(true)}
        >
          <X className="h-4 w-4" />
        </Button>
      </AlertTitle>
      <AlertDescription>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mt-2">
          <div>
            <p className="font-medium text-blue-900 dark:text-blue-100">{nextMeeting.title}</p>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              {formatDateTime(meetingDate)}
              {nextMeeting.metadata?.time && ` at ${nextMeeting.metadata.time}`}
            </p>
          </div>
          <Button
            size="sm"
            variant="default"
            onClick={() => onNavigate(meetingDate)}
          >
            View Details
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}