import { useState, useEffect, useRef } from "react";
import { formatDateTime } from "@/lib/formatters";
import { Send, ArrowLeft, Loader2, MessageCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  DirectMessage,
  fetchConversations,
  fetchMessages,
  sendDirectMessage,
  canSendDM,
} from "@/lib/community";

interface MessagesPanelProps {
  clientId: string;
  displayName: string;
  initialPeerId?: string;
  onClose?: () => void;
}

export function MessagesPanel({
  clientId,
  displayName,
  initialPeerId,
  onClose,
}: MessagesPanelProps) {
  const [conversations, setConversations] = useState<{
    peerId: string;
    peerName: string;
    lastMessage: string;
    lastMessageAt: string;
    unreadCount: number;
  }[]>([]);
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(initialPeerId || null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [canMessage, setCanMessage] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadConversations();
  }, [clientId]);

  useEffect(() => {
    if (selectedPeerId) {
      loadMessages(selectedPeerId);
      checkCanMessage(selectedPeerId);
    }
  }, [selectedPeerId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Realtime subscription
  useEffect(() => {
    if (!selectedPeerId) return;

    const channel = supabase
      .channel("dm-messages")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "community_messages",
          filter: `receiver_client_id=eq.${clientId}`,
        },
        (payload) => {
          const newMsg = payload.new as DirectMessage;
          if (newMsg.sender_client_id === selectedPeerId) {
            setMessages((prev) => [...prev, newMsg]);
          }
          loadConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedPeerId, clientId]);

  const loadConversations = async () => {
    try {
      const data = await fetchConversations(clientId);
      setConversations(data);
    } catch (error) {
      console.error("Failed to load conversations:", error);
    }
  };

  const loadMessages = async (peerId: string) => {
    setIsLoading(true);
    try {
      const data = await fetchMessages(clientId, peerId);
      setMessages(data);
      loadConversations(); // Refresh unread counts
    } catch (error) {
      console.error("Failed to load messages:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const checkCanMessage = async (peerId: string) => {
    const can = await canSendDM(clientId, peerId);
    setCanMessage(can);
  };

  const handleSendMessage = async () => {
    if (!selectedPeerId || !newMessage.trim()) return;

    setIsSending(true);
    try {
      const message = await sendDirectMessage(clientId, selectedPeerId, newMessage);
      setMessages((prev) => [...prev, message]);
      setNewMessage("");
      loadConversations();
    } catch (error: any) {
      toast.error(error.message || "Failed to send message");
    } finally {
      setIsSending(false);
    }
  };

  const selectedPeer = conversations.find((c) => c.peerId === selectedPeerId);

  return (
    <Card className="h-[500px] flex flex-col">
      <CardHeader className="pb-3 border-b shrink-0">
        <CardTitle className="text-lg flex items-center gap-2">
          {selectedPeerId && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 -ml-2"
              onClick={() => setSelectedPeerId(null)}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <MessageCircle className="h-5 w-5" />
          {selectedPeer ? selectedPeer.peerName : "Messages"}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 p-0 overflow-hidden">
        {!selectedPeerId ? (
          // Conversations list
          <ScrollArea className="h-full">
            {conversations.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                <p>No messages yet</p>
                <p className="text-xs mt-1">
                  Start a conversation with a fellow 100-day member
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {conversations.map((conv) => {
                  const initials = conv.peerName
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2);

                  return (
                    <div
                      key={conv.peerId}
                      className="flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer"
                      onClick={() => setSelectedPeerId(conv.peerId)}
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarFallback>{initials}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{conv.peerName}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDateTime(conv.lastMessageAt)}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {conv.lastMessage}
                        </p>
                      </div>
                      {conv.unreadCount > 0 && (
                        <Badge className="h-5 w-5 rounded-full p-0 flex items-center justify-center">
                          {conv.unreadCount}
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        ) : (
          // Messages view
          <div className="flex flex-col h-full">
            <ScrollArea className="flex-1 p-4">
              {isLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <p className="text-center text-muted-foreground">
                  No messages yet. Say hi!
                </p>
              ) : (
                <div className="space-y-3">
                  {messages.map((msg) => {
                    const isOwn = msg.sender_client_id === clientId;

                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[70%] rounded-lg px-3 py-2 ${isOwn
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                            }`}
                        >
                          <p className="text-sm">{msg.content}</p>
                          <p className={`text-[10px] mt-1 ${isOwn ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                            {formatDateTime(msg.created_at)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            {canMessage ? (
              <div className="p-3 border-t flex gap-2">
                <Input
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                />
                <Button
                  size="icon"
                  onClick={handleSendMessage}
                  disabled={isSending || !newMessage.trim()}
                >
                  {isSending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            ) : (
              <div className="p-3 border-t text-center text-xs text-muted-foreground">
                DMs are only available between active 100-day members
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
