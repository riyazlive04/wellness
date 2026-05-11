import { useState } from "react";
import { Shield, Heart, Users, AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CommunityGuidelinesModalProps {
  open: boolean;
  onAccept: (updatedClient?: any) => void;
  clientId: string;
}

export function CommunityGuidelinesModal({
  open,
  onAccept,
  clientId,
}: CommunityGuidelinesModalProps) {
  const [accepted, setAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAccept = async () => {
    if (!accepted) {
      toast.error("Please accept the community guidelines");
      return;
    }

    setIsSubmitting(true);
    try {
      console.log("Accepting guidelines for client:", clientId);
      const { data, error } = await supabase
        .from("clients")
        .update({ community_terms_accepted_at: new Date().toISOString() })
        .eq("id", clientId)
        .select()
        .maybeSingle();

      if (error) {
        console.error("Error accepting guidelines (DB update):", error);
        throw error;
      }

      console.log("Guidelines accepted, updated client:", data);

      toast.success("Welcome to the community!");
      onAccept(data);
    } catch (error: any) {
      console.error("Failed to accept guidelines:", error);
      toast.error(error.message || "Failed to accept guidelines. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => { }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Welcome to the Sheizen Community!
          </DialogTitle>
          <DialogDescription>
            Please read and accept our community guidelines before participating.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[400px] pr-4">
          <div className="space-y-4">
            <div className="flex gap-3">
              <Heart className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium">Be Supportive</h4>
                <p className="text-sm text-muted-foreground">
                  Everyone is on their own health journey. Encourage and support each other with kindness and empathy.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <Users className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium">Respect Privacy</h4>
                <p className="text-sm text-muted-foreground">
                  Don't share personal health information of others. What's shared in the community stays in the community.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium">No Medical Advice</h4>
                <p className="text-sm text-muted-foreground">
                  Share your experiences, but don't give medical advice. Always consult with our nutritionists for personalized guidance.
                </p>
              </div>
            </div>

            <div className="border-t pt-4 mt-4">
              <h4 className="font-medium mb-2">Prohibited Content</h4>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Spam, advertising, or self-promotion</li>
                <li>Harassment, bullying, or hate speech</li>
                <li>Misinformation about health and nutrition</li>
                <li>Promotion of extreme diets or unhealthy practices</li>
                <li>Sharing of personal contact information</li>
                <li>Inappropriate or offensive content</li>
              </ul>
            </div>

            <div className="border-t pt-4 mt-4">
              <h4 className="font-medium mb-2">Consequences</h4>
              <p className="text-sm text-muted-foreground">
                Violations of these guidelines may result in content removal, warnings, or account suspension. Our moderators work to keep this community safe and supportive for everyone.
              </p>
            </div>
          </div>
        </ScrollArea>

        <div className="flex items-center space-x-2 pt-4 border-t">
          <Checkbox
            id="accept"
            checked={accepted}
            onCheckedChange={(checked) => setAccepted(checked === true)}
          />
          <label
            htmlFor="accept"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            I have read and agree to follow the community guidelines
          </label>
        </div>

        <DialogFooter>
          <Button
            onClick={handleAccept}
            disabled={!accepted || isSubmitting}
            className="w-full"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Joining...
              </>
            ) : (
              "Join Community"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
