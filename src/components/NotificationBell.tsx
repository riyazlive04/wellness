import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Bell, MessageSquare, ClipboardList, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, addDays } from "date-fns";

interface NotificationBellProps {
  clientId: string;
  onNavigate: (tab: string, date?: Date) => void;
}

export function NotificationBell({ clientId, onNavigate }: NotificationBellProps) {
  const [upcomingMeetings, setUpcomingMeetings] = useState<any[]>([]);
  const [unreadMessages, setUnreadMessages] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [open, setOpen] = useState(false);

  // Track known IDs to detect new items
  const knownRequestIds = useRef<Set<string>>(new Set());
  const knownMessageIds = useRef<Set<string>>(new Set());
  const knownMeetingIds = useRef<Set<string>>(new Set());
  const isFirstLoad = useRef(true);

  // Show a browser notification (works on both desktop and mobile)
  const notify = useCallback((title: string, body: string, tag: string) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    // Try service worker first (works on mobile Android Chrome)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.showNotification(title, {
          body,
          icon: '/icon-192.png',
          badge: '/favicon.ico',
          tag,
          data: { url: '/dashboard' },
          vibrate: [200, 100, 200],
        });
      }).catch(() => {
        // Fallback to basic Notification (desktop)
        try {
          const n = new Notification(title, { body, icon: '/icon-192.png', tag });
          n.onclick = () => { window.focus(); n.close(); };
        } catch (e) {}
      });
    } else {
      try {
        const n = new Notification(title, { body, icon: '/icon-192.png', tag });
        n.onclick = () => { window.focus(); n.close(); };
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    if (!clientId) return;

    isFirstLoad.current = true;
    loadAllNotifications();

    // Poll every 10 seconds for new data (reliable - no realtime dependency)
    const pollInterval = setInterval(() => {
      loadAllNotificationsWithNotify();
    }, 10000);

    return () => {
      clearInterval(pollInterval);
    };
  }, [clientId]);

  const loadAllNotificationsWithNotify = async () => {
    await Promise.all([
      loadUpcomingMeetingsWithNotify(),
      loadUnreadMessagesWithNotify(),
      loadPendingRequestsWithNotify(),
    ]);
  };

  const loadPendingRequestsWithNotify = async () => {
    const { data, error } = await supabase
      .from('assessment_requests')
      .select('*')
      .eq('client_id', clientId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (!error && data) {
      // Detect NEW requests (not seen before)
      if (!isFirstLoad.current) {
        for (const req of data) {
          if (!knownRequestIds.current.has(req.id)) {
            const label = req.assessment_type
              ? req.assessment_type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
              : 'Assessment';
            notify(
              `New ${label} Requested`,
              `Your nutritionist has requested a ${label}. Please complete it.`,
              `sheizen-assessment-${req.id}`
            );
          }
        }
      }
      // Update known IDs
      knownRequestIds.current = new Set(data.map((r: any) => r.id));
      setPendingRequests(data);
    }
  };

  const loadUnreadMessagesWithNotify = async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('client_id', clientId)
      .eq('is_read', false)
      .neq('sender_type', 'client')
      .order('created_at', { ascending: false });

    if (!error && data) {
      if (!isFirstLoad.current) {
        for (const msg of data) {
          if (!knownMessageIds.current.has(msg.id)) {
            notify(
              'New Message from your Nutritionist',
              (msg.content || 'You have a new message').replace(/[#*`_]/g, '').slice(0, 100),
              `sheizen-msg-${msg.id}`
            );
          }
        }
      }
      knownMessageIds.current = new Set(data.map((m: any) => m.id));
      setUnreadMessages(data);
    }
  };

  const loadUpcomingMeetingsWithNotify = async () => {
    const today = new Date();
    const nextMonth = addDays(today, 30);
    const { data, error } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('client_id', clientId)
      .gte('event_date', format(today, 'yyyy-MM-dd'))
      .lte('event_date', format(nextMonth, 'yyyy-MM-dd'))
      .order('event_date', { ascending: true });

    if (!error && data) {
      if (!isFirstLoad.current) {
        for (const meeting of data) {
          if (!knownMeetingIds.current.has(meeting.id)) {
            notify(
              'New Meeting Scheduled',
              meeting.title || 'A new meeting has been scheduled',
              `sheizen-meeting-${meeting.id}`
            );
          }
        }
      }
      knownMeetingIds.current = new Set(data.map((m: any) => m.id));
      setUpcomingMeetings(data);
    }

    // Mark first load complete after all data loaded
    isFirstLoad.current = false;
  };

  const loadAllNotifications = () => {
    loadAllNotificationsWithNotify();
  };

  const totalCount = upcomingMeetings.length + unreadMessages.length + pendingRequests.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {totalCount > 0 && (
            <Badge
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
              variant="destructive"
            >
              {totalCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex flex-col max-h-[450px]">
          <div className="p-4 border-b">
            <h4 className="font-semibold text-sm">Notifications</h4>
          </div>
          
          <div className="overflow-y-auto flex-1 p-2 space-y-4">
            {/* Meetings Section */}
            {upcomingMeetings.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <Calendar className="h-3 w-3" />
                  Upcoming Meetings
                </div>
                {upcomingMeetings.map((meeting) => (
                  <button
                    key={meeting.id}
                    onClick={() => {
                      if (meeting?.event_date) {
                        onNavigate('calendar', parseISO(meeting.event_date));
                        setOpen(false);
                      }
                    }}
                    className="w-full text-left p-2 rounded-md hover:bg-muted transition-colors text-sm"
                  >
                    <div className="font-medium truncate">{meeting.title || 'Untitled Meeting'}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {meeting?.event_date ? format(parseISO(meeting.event_date), 'MMM d, yyyy') : 'No date'}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Assessment Requests Section */}
            {pendingRequests.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <ClipboardList className="h-3 w-3" />
                  Assessment Requests
                </div>
                {pendingRequests.map((req) => (
                  <button
                    key={req.id}
                    onClick={() => {
                      onNavigate('assessments');
                      setOpen(false);
                    }}
                    className="w-full text-left p-2 rounded-md hover:bg-muted transition-colors text-sm"
                  >
                    <div className="font-medium text-wellness-green">New {req.assessment_type?.replace('_', ' ') || 'Assessment'} requested</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Please complete this form</div>
                  </button>
                ))}
              </div>
            )}

            {/* Messages Section */}
            {unreadMessages.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <MessageSquare className="h-3 w-3" />
                  Unread Messages
                </div>
                {unreadMessages.slice(0, 5).map((msg) => (
                  <button
                    key={msg.id}
                    onClick={() => {
                      onNavigate('messages');
                      setOpen(false);
                    }}
                    className="w-full text-left p-2 rounded-md hover:bg-muted transition-colors text-sm"
                  >
                    <div className="font-medium truncate">{(msg.content || '').replace(/[#*`_]/g, '').slice(0, 50)}...</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {msg.created_at ? format(parseISO(msg.created_at), 'MMM d, h:mm a') : 'Recently'}
                    </div>
                  </button>
                ))}
                {unreadMessages.length > 5 && (
                  <Button 
                    variant="ghost" 
                    className="w-full text-xs text-muted-foreground justify-center hover:bg-transparent h-auto py-1"
                    onClick={() => onNavigate('messages')}
                  >
                    View all messages
                  </Button>
                )}
              </div>
            )}

            {totalCount === 0 && (
              <div className="py-8 text-center bg-muted/30 rounded-lg">
                <p className="text-sm text-muted-foreground">All caught up!</p>
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}