import { useState, useEffect } from "react";
import { formatDateTime } from "@/lib/formatters";
import { Heart, Send, Loader2, X } from "lucide-react";
import { PreviewModal } from "@/components/ui/preview-modal";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  CommunityPost,
  CommunityComment,
  fetchComments,
  getServiceTypeBadgeColor,
  formatServiceTypeForCommunity,
  sanitizeContent,
} from "@/lib/community";

interface PostDetailModalProps {
  post: CommunityPost | null;
  open: boolean;
  onClose: () => void;
  clientId?: string;
  displayName?: string;
  serviceType?: string | null;
  userRole?: 'admin' | 'client' | 'manager';
  onComment: (postId: string, content: string) => Promise<void>;
  onLikeComment: (commentId: string) => void;
  onAuthorClick: (clientId: string) => void;
}

export function PostDetailModal({
  post,
  open,
  onClose,
  clientId,
  displayName,
  serviceType,
  userRole,
  onComment,
  onLikeComment,
  onAuthorClick,
}: PostDetailModalProps) {
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (post && open) {
      loadComments();
    }
  }, [post?.id, open]);

  const loadComments = async () => {
    if (!post) return;

    setIsLoading(true);
    try {
      const data = await fetchComments(post.id, clientId);
      setComments(data);
    } catch (error) {
      console.error("Failed to load comments:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitComment = async () => {
    if (!post || !commentText.trim() || !clientId) return;

    const newCommentContent = sanitizeContent(commentText);
    setIsSubmitting(true);

    // Create optimistic comment
    const optimisticComment: CommunityComment = {
      id: `temp-${Date.now()}`,
      post_id: post.id,
      author_client_id: clientId,
      author_display_name: displayName || "Me",
      author_service_type: serviceType,
      author_role: userRole || 'client',
      content: newCommentContent,
      likes_count: 0,
      created_at: new Date().toISOString(),
      user_reaction: null,
    };

    // Optimistic update
    setComments(prev => [...prev, optimisticComment]);

    try {
      // We pass the role to the onComment function
      await onComment(post.id, newCommentContent);
      setCommentText("");
      // Refresh to get the real ID and server-side data
      await loadComments();
    } catch (error) {
      // Rollback optimistic update on error
      setComments(prev => prev.filter(c => c.id !== optimisticComment.id));
      console.error("Failed to submit comment:", error);
      toast.error("Failed to post comment");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!post) return null;

  const authorInitials = post.author_display_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <PreviewModal
      open={open}
      onClose={onClose}
      title="Post"
      className="max-w-2xl"
    >
      <div className="space-y-4">
        {/* Post content */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Avatar
              className="h-10 w-10 cursor-pointer"
              onClick={() => onAuthorClick(post.author_client_id)}
            >
              <AvatarFallback className="bg-primary/10 text-primary font-medium">
                {authorInitials}
              </AvatarFallback>
            </Avatar>
            <div>
              <span
                className="font-medium hover:underline cursor-pointer"
                onClick={() => onAuthorClick(post.author_client_id)}
              >
                {post.author_display_name}
              </span>
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

          {post.title && (
            <h3 className="font-semibold text-lg">{post.title}</h3>
          )}

          <p className="whitespace-pre-wrap">{post.content}</p>

          {post.media_urls && post.media_urls.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {post.media_urls.map((url, index) => (
                <img
                  key={index}
                  src={url}
                  alt={`Post media ${index + 1}`}
                  className="rounded-lg object-cover w-full max-h-60"
                />
              ))}
            </div>
          )}

          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {post.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  #{tag}
                </Badge>
              ))}
            </div>
          )}

          <div className="flex items-center gap-4 text-sm text-muted-foreground pt-2 border-t">
            <span>{post.likes_count} likes</span>
            <span>{post.comments_count} comments</span>
          </div>
        </div>

        {/* Comments section */}
        <div className="border-t pt-4">
          <h4 className="font-medium mb-3">Comments</h4>

          {isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : comments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No comments yet. Be the first to comment!
            </p>
          ) : (
            <ScrollArea className="max-h-60">
              <div className="space-y-3">
                {comments.map((comment) => {
                  const commentInitials = comment.author_display_name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2);

                  return (
                    <div key={comment.id} className="flex gap-3">
                      <Avatar
                        className="h-8 w-8 cursor-pointer"
                        onClick={() => onAuthorClick(comment.author_client_id)}
                      >
                        <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">
                          {commentInitials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="bg-muted rounded-lg p-2">
                          <div className="flex items-center gap-2">
                            <span
                              className="font-medium text-sm hover:underline cursor-pointer"
                              onClick={() => onAuthorClick(comment.author_client_id)}
                            >
                              {comment.author_display_name}
                            </span>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[9px] px-1 py-0",
                                comment.author_role === 'admin' || comment.author_role === 'manager'
                                  ? "bg-purple-100 text-purple-800 border-purple-200"
                                  : "bg-blue-100 text-blue-800 border-blue-200"
                              )}
                            >
                              {comment.author_role === 'admin' ? "Admin" : (comment.author_role === 'manager' ? "Manager" : "Client")}
                            </Badge>
                          </div>
                          <p className="text-sm">{comment.content}</p>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span>{formatDateTime(comment.created_at)}</span>
                          <button
                            className={cn(
                              "hover:text-foreground flex items-center gap-1",
                              comment.user_reaction && "text-red-500"
                            )}
                            onClick={() => onLikeComment(comment.id)}
                          >
                            <Heart className={cn("h-3 w-3", comment.user_reaction && "fill-current")} />
                            {comment.likes_count > 0 && comment.likes_count}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}

          {/* Comment input */}
          {clientId && (
            <div className="flex gap-2 mt-4">
              <Textarea
                placeholder="Write a comment..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value.slice(0, 500))}
                className="min-h-[60px] resize-none"
              />
              <Button
                size="icon"
                onClick={handleSubmitComment}
                disabled={isSubmitting || !commentText.trim()}
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </PreviewModal>
  );
}
