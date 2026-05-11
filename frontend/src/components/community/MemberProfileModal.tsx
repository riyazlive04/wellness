import { useEffect, useState } from "react";
import { Calendar, FileText, Award } from "lucide-react";
import { PreviewModal } from "@/components/ui/preview-modal";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  PublicProfile,
  projectPublicProfile,
  getServiceTypeBadgeColor,
  formatServiceTypeForCommunity,
  canSendDM,
} from "@/lib/community";

interface MemberProfileModalProps {
  clientId: string | null;
  open: boolean;
  onClose: () => void;
  currentClientId?: string;
  onStartDM?: (clientId: string) => void;
}

export function MemberProfileModal({
  clientId,
  open,
  onClose,
  currentClientId,
  onStartDM,
}: MemberProfileModalProps) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [canDM, setCanDM] = useState(false);
  
  useEffect(() => {
    if (clientId && open) {
      loadProfile();
    }
  }, [clientId, open]);
  
  const loadProfile = async () => {
    if (!clientId) return;
    
    setIsLoading(true);
    try {
      // Fetch client data (only public fields)
      const { data: client } = await supabase
        .from("clients")
        .select("id, display_name, name, service_type, created_at, badges")
        .eq("id", clientId)
        .single();
      
      if (client) {
        // Count posts
        const { count } = await supabase
          .from("community_posts")
          .select("*", { count: "exact", head: true })
          .eq("author_client_id", clientId)
          .eq("visibility", "public");
        
        setProfile(projectPublicProfile({
          ...client,
          post_count: count || 0,
        }));
        
        // Check if can DM
        if (currentClientId && currentClientId !== clientId) {
          const canMessage = await canSendDM(currentClientId, clientId);
          setCanDM(canMessage);
        }
      }
    } catch (error) {
      console.error("Failed to load profile:", error);
    } finally {
      setIsLoading(false);
    }
  };
  
  if (!clientId) return null;
  
  const initials = profile?.display_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "??";
  
  return (
    <PreviewModal
      open={open}
      onClose={onClose}
      title="Member Profile"
      className="max-w-sm"
    >
      {isLoading ? (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
          <Skeleton className="h-20 w-full" />
        </div>
      ) : profile ? (
        <div className="space-y-4">
          {/* Profile header */}
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-primary/10 text-primary text-xl font-medium">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-semibold text-lg">{profile.display_name}</h3>
              <Badge 
                variant="outline" 
                className={cn("mt-1", getServiceTypeBadgeColor(profile.service_type))}
              >
                {formatServiceTypeForCommunity(profile.service_type)}
              </Badge>
            </div>
          </div>
          
          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Joined</p>
                <p className="font-medium text-sm">{profile.join_month_year}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Posts</p>
                <p className="font-medium text-sm">{profile.post_count}</p>
              </div>
            </div>
          </div>
          
          {/* Badges */}
          {profile.badges && profile.badges.length > 0 && (
            <div>
              <h4 className="font-medium text-sm mb-2 flex items-center gap-1">
                <Award className="h-4 w-4" />
                Badges
              </h4>
              <div className="flex flex-wrap gap-2">
                {profile.badges.map((badge, index) => (
                  <Badge key={index} variant="secondary">
                    {badge}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          
          {/* Actions */}
          {currentClientId && currentClientId !== clientId && (
            <div className="pt-4 border-t">
              {canDM ? (
                <Button 
                  className="w-full"
                  onClick={() => {
                    onClose();
                    onStartDM?.(clientId);
                  }}
                >
                  Send Message
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground text-center">
                  Direct messages are only available between active 100-day program members
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="text-center text-muted-foreground">Profile not found</p>
      )}
    </PreviewModal>
  );
}
