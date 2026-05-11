import { useState, useRef } from "react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Sparkles, Paperclip, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatFileSize, isImageFile, getFileIcon } from "@/lib/fileUtils";

interface MessageComposerProps {
  clientId: string;
  senderId: string;
  senderType: 'admin' | 'client' | 'manager';
  onMessageSent?: (message: any) => void;
}

const quickTemplates = [
  { label: 'Encouragement', value: 'Great progress! Keep up the excellent work! 🌟' },
  { label: 'Check-in', value: 'How are you feeling today? Any challenges I can help with?' },
  { label: 'Reminder', value: 'Don\'t forget to log your meals and water intake today! 💧' },
  { label: 'Congratulations', value: 'Congratulations on reaching your milestone! 🎉' },
];

export function MessageComposer({ clientId, senderId, senderType, onMessageSent }: MessageComposerProps) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [attachment, setAttachment] = useState<{
    url: string;
    name: string;
    type: string;
    size: number;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "File size must be less than 10MB",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      // Generate unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${clientId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      // Upload to storage
      const { data, error } = await supabase.storage
        .from('message-attachments')
        .upload(fileName, file);

      if (error) throw error;

      // Store attachment info in state
      setAttachment({
        url: data.path,
        name: file.name,
        type: file.type,
        size: file.size
      });

      toast({
        title: "File attached",
        description: "Your file has been attached to the message.",
      });
    } catch (error) {
      console.error('Error uploading file:', error);
      toast({
        title: "Upload failed",
        description: "Could not upload your file. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSend = async () => {
    if (!message.trim() && !attachment) return;

    setSending(true);
    try {
      if (!clientId || !senderId) {
        console.error('Missing required IDs:', { clientId, senderId });
        toast({
          title: "Unable to send message",
          description: "Missing user information.",
          variant: "destructive",
        });
        return;
      }

      const messageData: any = {
        client_id: clientId,
        sender_id: senderId,
        sender_type: senderType,
        message_type: 'manual',
        content: message.trim() || '(File attachment)',
        metadata: {},
        is_read: false,
        created_at: new Date().toISOString(),
      };

      // Add attachment data if present
      if (attachment) {
        messageData.attachment_url = attachment.url;
        messageData.attachment_name = attachment.name;
        messageData.attachment_type = attachment.type;
        messageData.attachment_size = attachment.size;
      }



      const { data, error } = await supabase
        .from('messages')
        .insert(messageData)
        .select()
        .single();

      if (error) {
        console.error('SERVER ERROR SENDING MESSAGE:', error);
        console.error('Error details:', error.details, error.message, error.hint);
        throw error;
      }

      setMessage('');
      setAttachment(null);
      toast({
        title: "Message sent",
        description: "Your message has been delivered.",
      });
      if (data) {
        onMessageSent?.(data);

        // Send push notification if enabling role-based notifications
        if (senderType === 'client') {
          console.log('Sending notification to admins...');
          supabase.functions.invoke('send-push-notification', {
            body: {
              target_roles: ['admin', 'manager'],
              title: 'New Message from Client',
              body: message.trim() || 'Sent an attachment',
              url: `/admin/client/${clientId}`, // Deep link to client details
              client_id: clientId // Optional: context
            }
          }).then(({ error }) => {
            if (error) console.error('Error sending notification:', error);
          });
        } else if (senderType === 'admin' || senderType === 'manager') {
          console.log('Sending notification to client...');
          supabase.functions.invoke('send-push-notification', {
            body: {
              client_id: clientId,
              title: 'New Message from your Nutritionist',
              body: message.trim() || 'Sent an attachment',
              url: '/dashboard?tab=messages',
            }
          }).then(({ error }) => {
            if (error) console.error('Error sending notification:', error);
          });

          // Notify client tab via localStorage storage event
          try {
            localStorage.setItem('sheizen-notify', JSON.stringify({
              title: 'New Message from your Nutritionist',
              body: message.trim() || 'Sent an attachment',
              ts: Date.now(),
            }));
          } catch (e) {}
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: "Failed to send",
        description: "Could not send your message. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const handleTemplateSelect = (template: string) => {
    setMessage(template);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t bg-background p-4 space-y-3">
      {(senderType === 'admin' || senderType === 'manager') && (
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          <Select onValueChange={handleTemplateSelect}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Quick templates..." />
            </SelectTrigger>
            <SelectContent>
              {quickTemplates.map((template) => (
                <SelectItem key={template.label} value={template.value}>
                  {template.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* File Attachment Preview */}
      {attachment && (
        <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
          {React.createElement(getFileIcon(attachment.type), { className: "h-4 w-4 text-muted-foreground shrink-0" })}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{attachment.name}</p>
            <p className="text-xs text-muted-foreground">{formatFileSize(attachment.size)}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAttachment(null)}
            disabled={sending}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="flex gap-2">
        <Textarea
          placeholder="Type your message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          className="min-h-[80px] resize-none"
          disabled={sending || uploading}
        />
        <div className="flex flex-col gap-2 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.doc,.docx,.mp3,.m4a"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending || uploading}
            title="Attach file"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Button
            onClick={handleSend}
            disabled={(!message.trim() && !attachment) || sending || uploading}
            size="icon"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Press Enter to send, Shift+Enter for new line
      </p>
    </div>
  );
}
