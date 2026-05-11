import { useState, useEffect } from "react";
import { formatDateTime } from "@/lib/formatters";
import { Bell, MessageCircle, Heart, Shield, Users, AtSign, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import {
  CommunityNotification,
  fetchNotifications,
  markNotificationsRead,
  getUnreadNotificationCount,
} from "@/lib/community";

interface CommunityNotificationsProps {
  clientId: string;
  onNotificationClick?: (notification: CommunityNotification) => void;
}

const NOTIFICATION_ICONS = {
  comment: MessageCircle,
  reaction: Heart,
  dm: MessageCircle,
  moderation_action: Shield,
  group_invite: Users,
  mention: AtSign,
};

export function CommunityNotifications({
  clientId,
  onNotificationClick,
}: CommunityNotificationsProps) {
  const [notifications, setNotifications] = useState<CommunityNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    loadNotifications();
    loadUnreadCount();

    // Realtime subscription
    const channel = supabase
      .channel("community-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "community_notifications",
          filter: `client_id=eq.${clientId}`,
        },
        () => {
          loadNotifications();
          loadUnreadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId]);

  const loadNotifications = async () => {
    try {
      const data = await fetchNotifications(clientId);
      setNotifications(data);
    } catch (error) {
      console.error("Failed to load notifications:", error);
    }
  };

  const loadUnreadCount = async () => {
    try {
      const count = await getUnreadNotificationCount(clientId);
      setUnreadCount(count);
    } catch (error) {
      console.error("Failed to load unread count:", error);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markNotificationsRead(clientId);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error("Failed to mark notifications as read:", error);
    }
  };

  const handleNotificationClick = async (notification: CommunityNotification) => {
    if (!notification.read) {
      await markNotificationsRead(clientId, [notification.id]);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }

    onNotificationClick?.(notification);
    setOpen(false);
  };

  const getNotificationMessage = (notification: CommunityNotification): string => {
    const payload = notification.payload;

    switch (notification.type) {
      case "comment":
        return `${payload.commenter_name || "Someone"} commented on your post`;
      case "reaction":
        return `${payload.reactor_name || "Someone"} reacted to your ${payload.target_type || "post"}`;
      case "dm":
        return "You have a new message";
      case "moderation_action":
        return `Moderation action: ${payload.action || "content reviewed"}`;
      case "group_invite":
        return `You've been invited to join ${payload.group_name || "a group"}`;
      case "mention":
        return `${payload.mentioner_name || "Someone"} mentioned you`;
      default:
        return "New notification";
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px]"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-3 border-b">
          <h4 className="font-semibold">Notifications</h4>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={handleMarkAllRead}
            >
              <Check className="h-3 w-3 mr-1" />
              Mark all read
            </Button>
          )}
        </div>

        <ScrollArea className="max-h-80">
          {notifications.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              No notifications yet
            </p>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => {
                const Icon = NOTIFICATION_ICONS[notification.type] || Bell;

                return (
                  <div
                    key={notification.id}
                    className={`flex gap-3 p-3 cursor-pointer hover:bg-muted/50 ${!notification.read ? "bg-primary/5" : ""
                      }`}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className={`rounded-full p-2 ${!notification.read ? "bg-primary/10 text-primary" : "bg-muted"
                      }`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${!notification.read ? "font-medium" : ""}`}>
                        {getNotificationMessage(notification)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(notification.created_at)}
                      </p>
                    </div>
                    {!notification.read && (
                      <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
