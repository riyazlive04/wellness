import { Users, Lock, Globe } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CommunityGroup } from "@/lib/community";

interface GroupCardProps {
  group: CommunityGroup;
  onJoin: (groupId: string) => void;
  onLeave: (groupId: string) => void;
  onClick: (groupId: string) => void;
  isJoining?: boolean;
  isAdmin?: boolean;
  onDelete?: (groupId: string) => void;
}

export function GroupCard({
  group,
  onJoin,
  onLeave,
  onClick,
  isJoining,
  isAdmin,
  onDelete,
}: GroupCardProps) {
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => onClick(group.id)}
    >
      <CardContent className="p-4">
        {/* Cover image */}
        {group.cover_image_url ? (
          <div className="h-24 -mx-4 -mt-4 mb-3 rounded-t-lg overflow-hidden">
            <img
              src={group.cover_image_url}
              alt={group.name}
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div className="h-24 -mx-4 -mt-4 mb-3 rounded-t-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
            <Users className="h-10 w-10 text-primary/50" />
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold">{group.name}</h3>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                {group.is_private ? (
                  <Badge variant="outline" className="gap-1 text-[10px]">
                    <Lock className="h-3 w-3" />
                    Private
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 text-[10px]">
                    <Globe className="h-3 w-3" />
                    Public
                  </Badge>
                )}
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {group.member_count}
                </span>
              </div>
            </div>
          </div>

          {group.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {group.description}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              variant={group.is_member ? "outline" : "default"}
              size="sm"
              className="flex-1"
              onClick={(e) => {
                e.stopPropagation();
                if (group.is_member) {
                  onLeave(group.id);
                } else {
                  onJoin(group.id);
                }
              }}
              disabled={isJoining}
            >
              {group.is_member ? "Leave" : group.is_private ? "Request to Join" : "Join"}
            </Button>

            {isAdmin && onDelete && (
              <Button
                variant="destructive"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm("Are you sure you want to delete this group? All members will be removed.")) {
                    onDelete(group.id);
                  }
                }}
              >
                Delete
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
