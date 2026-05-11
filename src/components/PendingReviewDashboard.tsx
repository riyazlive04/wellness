import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Clock, Eye, Send, Loader2, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDateTime, formatDate } from "@/lib/formatters";

interface PendingCard {
  id: string;
  client_id: string;
  card_type: string;
  status: string;
  ai_generated_at: string;
  clients: {
    name: string;
  };
}

interface PendingReviewDashboardProps {
  onReviewCard: (cardId: string, cardType: string) => void;
  onSuccess?: () => void;
  clientId?: string;
}

export function PendingReviewDashboard({ onReviewCard, onSuccess, clientId }: PendingReviewDashboardProps) {
  const queryClient = useQueryClient();
  const [sendingCard, setSendingCard] = useState<string | null>(null);
  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchPendingCards = async () => {
    console.log("Fetching pending cards...");
    try {
      // DEBUG: First try simple count
      const count = await supabase.from('pending_review_cards').select('*', { count: 'exact', head: true });
      console.log("Total pending_review_cards count (all statuses):", count.count);

      let query = supabase
        .from('pending_review_cards')
        .select(`
            *,
            clients (
              name
            )
          `)
        .in('status', ['pending', 'edited']);

      if (clientId) {
        query = query.eq('client_id', clientId);
      }

      const { data, error } = await query.order('ai_generated_at', { ascending: false });

      if (error) {
        console.error('PendingReviewDashboard: Fetch Error:', error);
        toast({
          title: "Debug Error",
          description: `Fetch failed: ${error.message}`,
          variant: "destructive"
        });
        throw error;
      }

      console.log("Fetched cards raw data:", data);
      return data || [];
    } catch (err) {
      console.error("Critical fetch error:", err);
      return [];
    }
  };

  const { data: cards = [], isLoading } = useQuery({
    queryKey: ['pending-review-cards'],
    queryFn: fetchPendingCards,
  });

  const getCardTypeLabel = (cardType: string) => {
    const labels: Record<string, string> = {
      'health_assessment': 'Health Assessment',
      'stress_card': 'Stress Card',
      'sleep_card': 'Sleep Card',
      'action_plan': 'Action Plan',
      'diet_plan': 'Diet Plan'
    };
    return labels[cardType] || cardType;
  };

  const getCardTypeColor = (cardType: string) => {
    const colors: Record<string, string> = {
      'health_assessment': 'bg-blue-500',
      'stress_card': 'bg-orange-500',
      'sleep_card': 'bg-purple-500',
      'action_plan': 'bg-green-500',
      'diet_plan': 'bg-pink-500'
    };
    return colors[cardType] || 'bg-gray-500';
  };

  const handleSendCard = async (cardId: string) => {
    setSendingCard(cardId);

    const card = cards.find(c => c.id === cardId);
    if (!card) {
      setSendingCard(null);
      return;
    }

    const display_name = `${getCardTypeLabel(card.card_type)} - ${formatDate(new Date())}`;

    try {
      const { error } = await supabase.functions.invoke('send-card-to-client', {
        body: {
          card_id: cardId,
          display_name: display_name
        }
      });

      if (error) throw error;

      try { localStorage.setItem('sheizen-notify', JSON.stringify({ title: 'New Assessment Card', body: 'Your nutritionist has sent your assessment card. View your results now!', ts: Date.now() })); } catch (e) {}

      toast({
        title: "Card Sent",
        description: "Assessment card sent to client successfully",
      });

      onSuccess?.();
      queryClient.invalidateQueries({ queryKey: ['pending-review-cards'] });
    } catch (error: any) {
      console.error('Error sending card:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to send card to client",
        variant: "destructive",
      });
    } finally {
      setSendingCard(null);
    }
  };

  const handleSelectCard = (cardId: string, checked: boolean) => {
    if (checked) {
      setSelectedCards(prev => [...prev, cardId]);
    } else {
      setSelectedCards(prev => prev.filter(id => id !== cardId));
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedCards(cards.map(card => card.id));
    } else {
      setSelectedCards([]);
    }
  };

  const handleDeleteReports = async () => {
    if (selectedCards.length === 0) return;

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('pending_review_cards')
        .delete()
        .in('id', selectedCards);

      if (error) throw error;

      toast({
        title: "Reports Deleted",
        description: `Successfully deleted ${selectedCards.length} report(s).`,
      });

      setSelectedCards([]);
      setIsDeleteDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['pending-review-cards'] });
    } catch (error: any) {
      console.error('Error deleting reports:', error);
      toast({
        title: "Error",
        description: "Failed to delete reports",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };



  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (cards.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pending Review Cards</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-muted-foreground">
            No cards pending review at the moment
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="select-all"
              checked={cards.length > 0 && selectedCards.length === cards.length}
              onCheckedChange={(checked) => handleSelectAll(checked as boolean)}
            />
            <label
              htmlFor="select-all"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Select All
            </label>
          </div>
          <CardTitle className="flex items-center gap-2">
            Pending Review Cards
            <Badge variant="secondary">{cards.length}</Badge>
          </CardTitle>
        </div>

        {selectedCards.length > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setIsDeleteDialogOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete ({selectedCards.length})
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {cards.map((card) => (
            <div
              key={card.id}
              className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-center gap-4 flex-1">
                <Checkbox
                  checked={selectedCards.includes(card.id)}
                  onCheckedChange={(checked) => handleSelectCard(card.id, checked as boolean)}
                />
                <div className={`w-3 h-3 rounded-full ${getCardTypeColor(card.card_type)}`} />
                <div className="flex-1">
                  <div className="font-medium">{card.clients.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {getCardTypeLabel(card.card_type)}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  {formatDateTime(card.ai_generated_at)}
                </div>
                {card.status === 'edited' && (
                  <Badge variant="outline">Reviewed</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onReviewCard(card.id, card.card_type)}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  Review
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleSendCard(card.id)}
                  disabled={sendingCard === card.id}
                >
                  {sendingCard === card.id ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Send
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the selected {selectedCards.length} report(s).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteReports}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
