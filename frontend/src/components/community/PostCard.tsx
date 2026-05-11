import { useState } from "react";
import { formatDateTime } from "@/lib/formatters";
import { Heart, MessageCircle, MoreHorizontal, Flag, Pin, Trash2, Image as ImageIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { CommunityPost, getServiceTypeBadgeColor, formatServiceTypeForCommunity } from "@/lib/community";

interface PostCardProps {
  post: CommunityPost;
  currentClientId?: string;
  isAdmin?: boolean;
  onLike: (postId: string) => void;
  onComment: (postId: string) => void;
  onReport: (postId: string) => void;
  onPin?: (postId: string) => void;
  onDelete?: (postId: string) => void;
  onAuthorClick: (clientId: string) => void;
}

export function PostCard({
  post,
  currentClientId,
  isAdmin,
  onLike,
  onComment,
  onReport,
  onPin,
  onDelete,
  onAuthorClick,
}: PostCardProps) {
  const [isLiking, setIsLiking] = useState(false);

  const handleLike = async () => {
    if (isLiking) return;
    setIsLiking(true);
    try {
      await onLike(post.id);
    } finally {
      setIsLiking(false);
    }
  };

  const displayName = post.author_display_name || "Unknown Member";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const isOwner = currentClientId === post.author_client_id;

  return (
    <Card className={cn(
      "transition-all hover:shadow-md",
      post.pinned && "border-primary/50 bg-primary/5"
    )}>
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <Avatar
              className="h-10 w-10 cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
              onClick={() => onAuthorClick(post.author_client_id)}
            >
              <AvatarFallback className="bg-primary/10 text-primary font-medium">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="font-medium hover:underline cursor-pointer"
                  onClick={() => onAuthorClick(post.author_client_id)}
                >
                  {displayName}
                </span>
                {post.pinned && (
                  <Pin className="h-3 w-3 text-primary" />
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] px-1.5 py-0",
                    post.author_role === 'admin' || post.author_role === 'manager'
                      ? "bg-purple-100 text-purple-800 border-purple-200"
                      : "bg-blue-100 text-blue-800 border-blue-200"
                  )}
                >
                  {post.author_role === 'admin' ? "Admin" : (post.author_role === 'manager' ? "Manager" : "Client")}
                </Badge>
                <span>•</span>
                <span>{formatDateTime(post.created_at)}</span>
              </div>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!isOwner && (
                <DropdownMenuItem onClick={() => onReport(post.id)}>
                  <Flag className="h-4 w-4 mr-2" />
                  Report
                </DropdownMenuItem>
              )}
              {isAdmin && onPin && (
                <DropdownMenuItem onClick={() => onPin(post.id)}>
                  <Pin className="h-4 w-4 mr-2" />
                  {post.pinned ? "Unpin" : "Pin"}
                </DropdownMenuItem>
              )}
              {(isOwner || isAdmin) && onDelete && (
                <DropdownMenuItem
                  onClick={() => onDelete(post.id)}
                  className="text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Title */}
        {post.title && (
          <h3 className="font-semibold text-lg mb-2">{post.title}</h3>
        )}

        {/* Content */}
        <p className="text-foreground whitespace-pre-wrap mb-3">{post.content}</p>

        {/* Media */}
        {post.media_urls && post.media_urls.length > 0 && (
          <div className={cn(
            "grid gap-2 mb-3",
            post.media_urls.length === 1 ? "grid-cols-1" : "grid-cols-2"
          )}>
            {post.media_urls.slice(0, 4).map((url, index) => (
              <div
                key={index}
                className="relative rounded-lg overflow-hidden bg-muted aspect-video"
              >
                <img
                  src={url}
                  alt={`Post media ${index + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                {post.media_urls.length > 4 && index === 3 && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <span className="text-white font-semibold text-xl">
                      +{post.media_urls.length - 4}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {post.tags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-xs cursor-pointer hover:bg-secondary/80"
              >
                #{tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Attachments */}
        {post.attachments && post.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {post.attachments.map((attachment, index) => (
              <a
                key={index}
                href={attachment.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-2 py-1 rounded bg-muted text-xs hover:bg-muted/80"
              >
                <ImageIcon className="h-3 w-3" />
                {attachment.name}
              </a>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 pt-2 border-t">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "gap-1.5",
              post.user_reaction && "text-red-500"
            )}
            onClick={handleLike}
            disabled={isLiking}
          >
            <Heart className={cn("h-4 w-4", post.user_reaction && "fill-current")} />
            <span>{post.likes_count}</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => onComment(post.id)}
          >
            <MessageCircle className="h-4 w-4" />
            <span>{post.comments_count}</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
