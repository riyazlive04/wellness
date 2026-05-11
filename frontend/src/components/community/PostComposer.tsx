import { useState, useRef, useEffect } from "react";
import { Image, Paperclip, X, Hash, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { sanitizeContent } from "@/lib/community";

interface PostComposerProps {
  clientId: string;
  displayName: string;
  serviceType: string | null;
  groupId?: string;
  onPost: (data: {
    content: string;
    title?: string;
    tags: string[];
    mediaUrls: string[];
    attachments: { name: string; url: string; type: string }[];
  }) => Promise<void>;
}

export function PostComposer({
  clientId,
  displayName,
  serviceType,
  groupId,
  onPost,
}: PostComposerProps) {
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<{ name: string; url: string; type: string }[]>([]);
  const [isPosting, setIsPosting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showTitle, setShowTitle] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  // Auto-detect hashtags
  useEffect(() => {
    const extractedTags = content.match(/#[a-zA-Z0-9]+/g);
    if (extractedTags) {
      const newTags = extractedTags
        .map(t => t.slice(1).toLowerCase())
        .filter(t => !tags.includes(t));

      if (newTags.length > 0) {
        setTags(prev => [...prev, ...newTags].slice(0, 5));
      }
    }
  }, [content]);

  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleAddTag = () => {
    const tag = tagInput.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (tag && !tags.includes(tag) && tags.length < 5) {
      setTags([...tags, tag]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (mediaUrls.length + files.length > 10) {
      toast.error("Maximum 10 images allowed");
      return;
    }

    setIsUploading(true);

    try {
      for (const file of Array.from(files)) {
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${file.name} is too large (max 10MB)`);
          continue;
        }

        const fileExt = file.name.split(".").pop();
        const fileName = `${clientId}/${Date.now()}.${fileExt}`;

        const { error } = await supabase.storage
          .from("meal-photos")
          .upload(fileName, file);

        if (error) throw error;

        const { data: urlData } = supabase.storage
          .from("meal-photos")
          .getPublicUrl(fileName);

        setMediaUrls((prev) => [...prev, urlData.publicUrl]);
      }
    } catch (error: any) {
      toast.error("Failed to upload image");
      console.error(error);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (attachments.length + files.length > 3) {
      toast.error("Maximum 3 attachments allowed");
      return;
    }

    setIsUploading(true);

    try {
      for (const file of Array.from(files)) {
        if (file.size > 20 * 1024 * 1024) {
          toast.error(`${file.name} is too large (max 20MB)`);
          continue;
        }

        const fileExt = file.name.split(".").pop();
        const fileName = `${clientId}/${Date.now()}_${file.name}`;

        const { error } = await supabase.storage
          .from("client-files")
          .upload(fileName, file);

        if (error) throw error;

        const { data: urlData } = supabase.storage
          .from("client-files")
          .getPublicUrl(fileName);

        setAttachments((prev) => [
          ...prev,
          { name: file.name, url: urlData.publicUrl, type: file.type },
        ]);
      }
    } catch (error: any) {
      toast.error("Failed to upload attachment");
      console.error(error);
    } finally {
      setIsUploading(false);
      if (attachmentInputRef.current) {
        attachmentInputRef.current.value = "";
      }
    }
  };

  const handleRemoveMedia = (index: number) => {
    setMediaUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    const sanitized = sanitizeContent(content);
    if (!sanitized.trim()) {
      toast.error("Please write something");
      return;
    }

    setIsPosting(true);

    try {
      await onPost({
        content: sanitized,
        title: showTitle ? title.trim() : undefined,
        tags,
        mediaUrls,
        attachments,
      });

      // Reset form
      setContent("");
      setTitle("");
      setTags([]);
      setMediaUrls([]);
      setAttachments([]);
      setShowTitle(false);

      toast.success("Post created!");
    } catch (error: any) {
      toast.error(error.message || "Failed to create post");
    } finally {
      setIsPosting(false);
    }
  };

  const charCount = content.length;
  const maxChars = 1000;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary/10 text-primary font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 space-y-3">
            {showTitle && (
              <Input
                placeholder="Add a title (optional)"
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 150))}
                className="font-medium"
              />
            )}

            <Textarea
              placeholder="Share something with the community..."
              value={content}
              onChange={(e) => setContent(e.target.value.slice(0, maxChars))}
              className="min-h-[100px] resize-none"
            />

            {/* Character count */}
            <div className="flex justify-end">
              <span className={`text-xs ${charCount > maxChars * 0.9 ? "text-destructive" : "text-muted-foreground"}`}>
                {charCount}/{maxChars}
              </span>
            </div>

            {/* Tags */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    #{tag}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => handleRemoveTag(tag)}
                    />
                  </Badge>
                ))}
              </div>
            )}

            {/* Tag input */}
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Add a tag (press Enter)"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                className="h-8 text-sm"
              />
            </div>

            {/* Media preview */}
            {mediaUrls.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {mediaUrls.map((url, index) => (
                  <div key={index} className="relative">
                    <img
                      src={url}
                      alt={`Upload ${index + 1}`}
                      className="w-full h-20 object-cover rounded"
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute -top-2 -right-2 h-5 w-5"
                      onClick={() => handleRemoveMedia(index)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Attachments preview */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachments.map((attachment, index) => (
                  <Badge key={index} variant="outline" className="gap-1">
                    {attachment.name}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => handleRemoveAttachment(index)}
                    />
                  </Badge>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-2 border-t">
              <div className="flex items-center gap-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleMediaUpload}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  <Image className="h-4 w-4" />
                </Button>

                <input
                  ref={attachmentInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx"
                  multiple
                  className="hidden"
                  onChange={handleAttachmentUpload}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => attachmentInputRef.current?.click()}
                  disabled={isUploading}
                >
                  <Paperclip className="h-4 w-4" />
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => setShowTitle(!showTitle)}
                >
                  {showTitle ? "Remove title" : "+ Add title"}
                </Button>
              </div>

              <Button
                onClick={handleSubmit}
                disabled={isPosting || isUploading || !content.trim()}
                size="sm"
              >
                {isPosting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Posting...
                  </>
                ) : (
                  "Post"
                )}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
