import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MessageSquarePlus } from "lucide-react";
import { BulkMessageDialog } from "./BulkMessageDialog";
import type { Tables } from "@/integrations/supabase/types";

type Client = Tables<"clients">;

interface BulkMessageButtonProps {
  clients: Client[];
  onSuccess?: () => void;
}

export function BulkMessageButton({ clients, onSuccess }: BulkMessageButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setDialogOpen(true)}
        disabled={clients.length === 0}
      >
        <MessageSquarePlus className="mr-2 h-4 w-4" />
        Bulk Message
      </Button>

      <BulkMessageDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        clients={clients}
        onSuccess={onSuccess}
      />
    </>
  );
}