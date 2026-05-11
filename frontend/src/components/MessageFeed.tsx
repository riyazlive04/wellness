import { useEffect, useRef, useState } from "react";
import * as React from "react";
import { format, isToday, isYesterday } from "date-fns";
import { formatDateTime } from "@/lib/formatters";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Bot, User, Download, ExternalLink } from "lucide-react";
import type { Message } from "@/lib/messages";
import { getSignedUrl } from "@/lib/storage";
import { formatFileSize, isImageFile, getFileIcon } from "@/lib/fileUtils";
import { toast } from "sonner";

interface MessageFeedProps {
    messages: Message[];
    currentUserType: 'admin' | 'client' | 'manager';
    onStartAssessment?: (requestId: string, type: string) => void;
    inverted?: boolean;
}

export function MessageFeed({ messages, currentUserType, onStartAssessment, inverted = false }: MessageFeedProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const topSentinelRef = useRef<HTMLDivElement>(null);
    const bottomSentinelRef = useRef<HTMLDivElement>(null);
    const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
    const [displayCount, setDisplayCount] = useState(20);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const prevMessagesLengthRef = useRef(messages.length);
    const oldScrollHeightRef = useRef<number>(0);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Filter messages to show based on mode
    // If inverted (Newest First): Take the FIRST N messages (index 0 to N)
    // If standard (Oldest First): Take the LAST N messages (index -N)
    // IMPORTANT: We must sort the visible messages by created_at to ensure chronological order,
    // as real-time updates or batch fetches might not guarantee perfect order.
    const visibleMessages = (inverted
        ? messages.slice(0, displayCount)
        : messages.slice(-Math.min(displayCount, messages.length))
    ).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());



    const loadMore = () => {
        if (displayCount < messages.length && !isLoadingMore) {
            setIsLoadingMore(true);
            if (scrollRef.current) {
                oldScrollHeightRef.current = scrollRef.current.scrollHeight;
            }
            // Load 20 more messages
            setDisplayCount(prev => Math.min(prev + 20, messages.length));
        }
    };

    // Intersection Observer for Infinite Scroll
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && displayCount < messages.length) {
                    loadMore();
                }
            },
            { root: scrollRef.current, threshold: 0.1 }
        );

        // In standard mode, we observe the TOP sentinel to load older messages (which are "above")
        // In inverted mode, we observe the BOTTOM sentinel to load older messages (which are "below")
        const sentinel = inverted ? bottomSentinelRef.current : topSentinelRef.current;

        if (sentinel) {
            observer.observe(sentinel);
        }

        return () => observer.disconnect();
    }, [displayCount, messages.length, isLoadingMore, inverted]);

    // Restore scroll position after loading more messages (Standard Mode only)
    React.useLayoutEffect(() => {
        if (!inverted && isLoadingMore && scrollRef.current) {
            const newScrollHeight = scrollRef.current.scrollHeight;
            const diff = newScrollHeight - oldScrollHeightRef.current;

            if (diff > 0) {
                scrollRef.current.scrollTop = diff;
            }
            setIsLoadingMore(false);
        } else if (inverted && isLoadingMore) {
            setIsLoadingMore(false);
        }
    }, [displayCount, isLoadingMore, inverted]);

    // Auto-scroll logic
    useEffect(() => {
        // Condition 1: New message received -> Increase display count to show it
        if (messages.length > prevMessagesLengthRef.current) {
            setDisplayCount(prev => prev + 1);
            prevMessagesLengthRef.current = messages.length;
        }

        // Condition 2: Scroll to bottom
        // If we are in standard mode (not inverted), we want to stay at the bottom
        // whenever messages change or on initial load.
        if (!inverted && messagesEndRef.current) {
            // Use a small timeout to ensure DOM update is complete
            const timeoutId = setTimeout(() => {
                messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 100);
            return () => clearTimeout(timeoutId);
        }
    }, [messages.length, inverted, displayCount]);

    // Initial scroll to bottom
    useEffect(() => {
        if (!inverted && messagesEndRef.current) {
            const timeoutId = setTimeout(() => {
                messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
            }, 100);
            return () => clearTimeout(timeoutId);
        }
    }, []);

    // Load signed URLs
    useEffect(() => {
        const loadSignedUrls = async () => {
            const attachments = visibleMessages
                .filter(m => m.attachment_url)
                .map(m => m.attachment_url as string);

            if (attachments.length === 0) return;

            const urls: Record<string, string> = {};
            await Promise.all(
                attachments.map(async (path) => {
                    try {
                        const url = await getSignedUrl('message-attachments', path);
                        urls[path] = url;
                    } catch (error) {
                        console.error('Error loading signed URL:', error);
                    }
                })
            );

            setSignedUrls(urls);
        };

        loadSignedUrls();
    }, [visibleMessages]);

    const groupMessagesByDate = (msgs: Message[]) => {
        const groups: Record<string, Message[]> = {};

        // For grouping, if inverted, visibleMessages are Newest -> Oldest.
        // We probably still want to group them by date, but the order of groups matters.
        // Standard: Oldest Date -> Newest Date.
        // Inverted: Newest Date -> Oldest Date.

        // This function iterates the array as-is. 
        // If 'msgs' is [Newest...Oldest], the groups will be created in that order of encounter (mostly).
        // But JS object keys order isn't guaranteed until ES2020+, and usually insertion order for strings.
        // Better to explicitly sort keys later.

        msgs.forEach((message) => {
            const date = new Date(message.created_at);
            let dateKey: string;

            if (isToday(date)) {
                dateKey = 'Today';
            } else if (isYesterday(date)) {
                dateKey = 'Yesterday';
            } else {
                dateKey = format(date, 'MMM d, yyyy');
            }

            if (!groups[dateKey]) {
                groups[dateKey] = [];
            }
            groups[dateKey].push(message);
        });

        return groups;
    };

    const handleDownload = async (attachmentUrl: string, attachmentName: string) => {
        try {
            const url = signedUrls[attachmentUrl];
            if (!url) {
                toast.error("File URL not found");
                return;
            }
            window.open(url, '_blank');
        } catch (error) {
            console.error('Error downloading file:', error);
            toast.error("Could not download the file");
        }
    };

    const groupedMessages = groupMessagesByDate(visibleMessages);
    // Keys need to be sorted properly
    // Standard: Chronological
    // Inverted: Reverse Chronological
    // Since 'visibleMessages' is already sorted correctly by the slice/query nature:
    // Standard: [Old...New]
    // Inverted: [New...Old]
    // We can just rely on the order of keys as they were created from the array, OR just map the array directly if we didn't want date headers.
    // But we want date headers.

    // Let's force sort the keys to be safe.
    const sortedDateKeys = Object.keys(groupedMessages).sort((a, b) => {
        const getDate = (k: string) => {
            if (k === 'Today') return new Date();
            if (k === 'Yesterday') {
                const d = new Date();
                d.setDate(d.getDate() - 1);
                return d;
            }
            return new Date(k);
        };
        const dateA = getDate(a).getTime();
        const dateB = getDate(b).getTime();
        return inverted ? dateB - dateA : dateA - dateB;
    });

    return (
        <div
            className={`flex-1 p-4 overflow-y-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent min-h-0 flex flex-col ${inverted ? '' : ''}`}
            ref={scrollRef}
        >
            {!inverted && <div className="flex-1 min-h-0" />} {/* Spacer pushes content down only in standard chat */}

            <div className="space-y-6">
                {/* Standard Mode: Top Sentinel for loading older messages (which are visually "above") */}
                {!inverted && <div ref={topSentinelRef} className="h-1 w-full" />}

                {/* Standard Mode: Manual Load More Button at Top */}
                {!inverted && displayCount < messages.length && (
                    <div className="flex justify-center py-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={loadMore}
                            className="text-xs text-muted-foreground hover:bg-muted/50 h-auto py-1"
                            disabled={isLoadingMore}
                        >
                            {isLoadingMore ? "Loading..." : "Load older messages"}
                        </Button>
                    </div>
                )}

                {visibleMessages.length === 0 && (
                    <div className="text-center text-muted-foreground py-10">
                        No messages yet. Start a conversation!
                    </div>
                )}

                {sortedDateKeys.map((date) => (
                    <div key={date} className={`space-y-4 ${inverted ? 'flex flex-col-reverse space-y-reverse' : ''}`}>
                        {/* Note: sticky header needs to be before content in DOM for normal flow. 
                        If we use column-reverse for inverted within the date group, the header might be at bottom?
                        Actually, 'groupedMessages[date]' is an array.
                        Standard: [Msg1, Msg2...] (Oldest -> Newest)
                        Inverted: [Msg1, Msg2...] (Newest -> Oldest) because visibleMessages is Newest->Oldest
                        So we can just map them. No need for flex-col-reverse on the group itself unless we want to change visual order vs DOM order.
                        */}

                        <div className="flex items-center justify-center sticky top-0 py-2 z-10">
                            <span className="text-xs text-muted-foreground bg-muted/80 backdrop-blur-sm px-3 py-1 rounded-full shadow-sm">
                                {date}
                            </span>
                        </div>

                        {groupedMessages[date].map((message) => {
                            const isSystem = message.sender_type === 'system';
                            const isCurrentUser = (
                                (message.sender_type?.toLowerCase() === 'admin' || message.sender_type?.toLowerCase() === 'manager') && 
                                (currentUserType.toLowerCase() === 'admin' || currentUserType.toLowerCase() === 'manager')
                            ) || message.sender_type?.toLowerCase() === currentUserType.toLowerCase();

                            return (
                                <div
                                    key={message.id}
                                    className={`flex gap-3 ${isCurrentUser ? 'flex-row-reverse' : ''}`}
                                >
                                    <Avatar className="h-8 w-8 shrink-0">
                                        <AvatarFallback className={isSystem ? 'bg-primary/10' : 'bg-secondary'}>
                                            {isSystem ? <Bot className="h-4 w-4 text-primary" /> : <User className="h-4 w-4" />}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className={`flex flex-col gap-1 max-w-[70%] ${isCurrentUser ? 'items-end' : ''}`}>
                                        <div
                                            className={`rounded-2xl px-4 py-2 shadow-sm ${isSystem
                                                ? 'bg-primary/5 border border-primary/20'
                                                : isCurrentUser
                                                    ? 'bg-primary text-primary-foreground'
                                                    : 'bg-muted'
                                                }`}
                                        >
                                            <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>

                                            {/* Assessment Request Action Button */}
                                            {message.message_type === 'assessment_request' && onStartAssessment && currentUserType === 'client' && (
                                                <div className="mt-3">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => {
                                                            const requestId = message.metadata?.request_id;
                                                            const assessmentType = message.metadata?.assessment_type;
                                                            if (requestId && assessmentType) {
                                                                onStartAssessment(requestId, assessmentType);
                                                            }
                                                        }}
                                                        className="w-full bg-background/50 hover:bg-background/80 border-primary/20"
                                                    >
                                                        <ExternalLink className="mr-2 h-3 w-3" />
                                                        Complete Assessment
                                                    </Button>
                                                </div>
                                            )}

                                            {/* File Attachment Display */}
                                            {message.attachment_url && (
                                                <div className="mt-3 p-3 bg-background/50 rounded-lg border">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        {React.createElement(getFileIcon(message.attachment_type || ''), {
                                                            className: "h-4 w-4 text-muted-foreground shrink-0"
                                                        })}
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm font-medium truncate">
                                                                {message.attachment_name}
                                                            </p>
                                                            <p className="text-xs text-muted-foreground">
                                                                {message.attachment_size ? formatFileSize(message.attachment_size) : 'Unknown size'}
                                                            </p>
                                                        </div>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleDownload(message.attachment_url!, message.attachment_name!)}
                                                        >
                                                            <Download className="h-4 w-4" />
                                                        </Button>
                                                    </div>

                                                    {/* Inline preview for images */}
                                                    {message.attachment_type && isImageFile(message.attachment_type) && signedUrls[message.attachment_url] && (
                                                        <img
                                                            src={signedUrls[message.attachment_url]}
                                                            alt={message.attachment_name || "Attachment"}
                                                            className="mt-2 rounded max-h-48 object-cover w-full"
                                                        />
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <span className="text-[10px] text-muted-foreground px-2 opacity-70">
                                            {formatDateTime(message.created_at)}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ))}

                {/* Inverted Mode: Load More Button at Bottom */}
                {inverted && displayCount < messages.length && (
                    <div className="flex justify-center py-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={loadMore}
                            className="text-xs text-muted-foreground hover:bg-muted/50 h-auto py-1"
                            disabled={isLoadingMore}
                        >
                            {isLoadingMore ? "Loading..." : "Load older messages"}
                        </Button>
                    </div>
                )}

                {/* Inverted Mode: Bottom Sentinel for auto-loading */}
                {inverted && <div ref={bottomSentinelRef} className="h-1 w-full" />}

                {/* Standard Mode: Anchor for scrolling to bottom */}
                {!inverted && <div ref={messagesEndRef} />}
            </div>
        </div>
    );
}
