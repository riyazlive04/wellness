import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Save, Send, FileText, Download, Upload, History, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { validateDisplayName } from "@/lib/assessmentUtils";

interface EditAssessmentDialogProps {
  assessmentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
}

export function EditAssessmentDialog({
  assessmentId,
  open,
  onOpenChange,
  onSave,
}: EditAssessmentDialogProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [assessment, setAssessment] = useState<any>(null);
  const [displayName, setDisplayName] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('draft');
  const [createdAt, setCreatedAt] = useState('');
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [versionHistory, setVersionHistory] = useState<any[]>([]);

  useEffect(() => {
    if (open && assessmentId) {
      fetchAssessment();
      fetchVersionHistory();
    }
  }, [open, assessmentId]);

  const fetchAssessment = async () => {
    if (!assessmentId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('assessments')
        .select('*, clients(name)')
        .eq('id', assessmentId)
        .single();

      if (error) throw error;

      setAssessment(data);
      setDisplayName(data.display_name || '');
      setNotes(data.notes || '');
      setStatus(data.status || 'draft');
      setCreatedAt(data.created_at?.split('T')[0] || '');
    } catch (error) {
      console.error('Error fetching assessment:', error);
      toast({
        title: "Error",
        description: "Failed to load assessment",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchVersionHistory = async () => {
    if (!assessmentId) return;

    try {
      const { data, error } = await supabase
        .from('assessment_audits')
        .select('*, profiles(name)')
        .eq('assessment_id', assessmentId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setVersionHistory(data || []);
    } catch (error) {
      console.error('Error fetching version history:', error);
    }
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      const validation = validateDisplayName(displayName);
      if (!validation.valid) {
        toast({
          title: "Invalid Display Name",
          description: validation.error,
          variant: "destructive",
        });
        setSaving(false);
        return;
      }

      // Create audit record of before state
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error: auditError } = await supabase
        .from('assessment_audits')
        .insert({
          assessment_id: assessmentId,
          actor_id: user?.id,
          action: 'update',
          target_table: 'assessments',
          before: {
            display_name: assessment.display_name,
            notes: assessment.notes,
            status: assessment.status,
          },
          after: {
            display_name: displayName,
            notes: notes,
            status: status,
          },
        });

      if (auditError) console.error('Audit error:', auditError);

      const { error } = await supabase
        .from('assessments')
        .update({
          display_name: displayName,
          notes: notes,
          status: status,
          updated_at: new Date().toISOString()
        })
        .eq('id', assessmentId);

      if (error) throw error;

      toast({
        title: "Saved",
        description: "Assessment saved as draft",
      });

      await fetchVersionHistory();
      onSave?.();
    } catch (error) {
      console.error('Error saving:', error);
      toast({
        title: "Error",
        description: "Failed to save changes",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReplaceFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast({
        title: "Invalid File",
        description: "Only PDF files are allowed",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Maximum file size is 10MB",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Save current file to history
      const currentHistory = assessment.file_history || [];
      currentHistory.push({
        file_url: assessment.file_url,
        file_name: assessment.file_name,
        version: assessment.file_version || 1,
        replaced_at: new Date().toISOString(),
        replaced_by: user?.id,
      });

      const fileExt = file.name.split('.').pop();
      const fileName = `${assessmentId}_v${(assessment.file_version || 1) + 1}.${fileExt}`;
      const filePath = `${assessment.client_id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('assessment-files')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('assessment-files')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('assessments')
        .update({
          file_url: publicUrl,
          file_name: file.name,
          file_version: (assessment.file_version || 1) + 1,
          file_history: currentHistory,
          updated_at: new Date().toISOString()
        })
        .eq('id', assessmentId);

      if (updateError) throw updateError;

      // Create audit
      await supabase.from('assessment_audits').insert({
        assessment_id: assessmentId,
        actor_id: user?.id,
        action: 'replace_file',
        target_table: 'assessments',
        before: { file_url: assessment.file_url, file_name: assessment.file_name },
        after: { file_url: publicUrl, file_name: file.name },
      });

      toast({
        title: "File Replaced",
        description: "Assessment file has been updated",
      });

      await fetchAssessment();
      await fetchVersionHistory();
    } catch (error) {
      console.error('Error replacing file:', error);
      toast({
        title: "Error",
        description: "Failed to replace file",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleSendToClient = async () => {
    setSending(true);
    try {
      await handleSaveDraft();

      const { data: { user } } = await supabase.auth.getUser();

      const { error: sendError } = await supabase.functions.invoke('send-assessment', {
        body: {
          assessment_id: assessmentId,
          client_id: assessment.client_id,
        }
      });

      if (sendError) throw sendError;

      // Update status to sent
      await supabase
        .from('assessments')
        .update({ status: 'sent' })
        .eq('id', assessmentId);

      // Create audit
      await supabase.from('assessment_audits').insert({
        assessment_id: assessmentId,
        actor_id: user?.id,
        action: 'send',
        target_table: 'assessments',
        after: { status: 'sent' },
      });

      toast({
        title: "Sent",
        description: "Assessment sent to client",
      });

      onOpenChange(false);
      onSave?.();
    } catch (error: any) {
      console.error('Error sending:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to send assessment",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const handleDownload = () => {
    if (assessment?.file_url) {
      window.open(assessment.file_url, '_blank');
    }
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-screen overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Loading Assessment</DialogTitle>
            <DialogDescription>Please wait...</DialogDescription>
          </DialogHeader>
          <div className="flex flex-1 items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-wellness-green" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-screen overflow-hidden flex flex-col">
        <DialogHeader className="px-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-wellness-green/20 to-wellness-mint/20 rounded-lg">
              <FileText className="h-5 w-5 text-wellness-green" />
            </div>
            <div className="flex-1">
              <DialogTitle>Edit Assessment</DialogTitle>
              <DialogDescription>
                Review and update assessment details
              </DialogDescription>
            </div>
            <Badge variant="outline">{status}</Badge>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-y-auto max-h-[70vh] px-6">
          <div className="grid grid-cols-2 gap-6 pb-6">
            {/* Left Column - Form */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="display-name">Display Name *</Label>
                <Input
                  id="display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="assessment-name.pdf"
                  maxLength={200}
                />
              </div>

              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes about this assessment..."
                  rows={4}
                />
              </div>

              <div>
                <Label htmlFor="created-date">Created Date</Label>
                <Input
                  id="created-date"
                  type="date"
                  value={createdAt}
                  onChange={(e) => setCreatedAt(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>

              <div>
                <Label htmlFor="assessment-type">Assessment Type</Label>
                <Input
                  id="assessment-type"
                  value={assessment?.assessment_type || 'N/A'}
                  disabled
                />
              </div>

              <div>
                <Label htmlFor="status">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Right Column - File Area */}
            <div className="space-y-4">
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Current File</Label>
                  <Badge>PDF</Badge>
                </div>
                
                {assessment?.file_url && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDownload}
                      className="flex-1"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Preview
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDownload}
                      className="flex-1"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                  </div>
                )}

                <div className="text-sm text-muted-foreground">
                  Version: {assessment?.file_version || 1}
                </div>
              </div>

              <div>
                <Label htmlFor="replace-file">Replace File</Label>
                <div className="mt-2">
                  <Input
                    id="replace-file"
                    type="file"
                    accept=".pdf"
                    onChange={handleReplaceFile}
                    disabled={uploading}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    PDF only, max 10MB
                  </p>
                </div>
              </div>

              <Button
                variant="outline"
                onClick={() => setShowVersionHistory(!showVersionHistory)}
                className="w-full"
              >
                <History className="h-4 w-4 mr-2" />
                View Version History ({versionHistory.length})
              </Button>

              {showVersionHistory && (
                <div className="border rounded-lg p-3 max-h-[200px] overflow-y-auto">
                  <div className="space-y-2">
                    {versionHistory.map((audit) => (
                      <div key={audit.id} className="text-sm border-b pb-2">
                        <div className="font-medium">{audit.action}</div>
                        <div className="text-muted-foreground text-xs">
                          {new Date(audit.created_at).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        <div className="flex justify-end gap-2 px-6 py-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={handleSaveDraft}
            disabled={saving || uploading}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" />
            Save Draft
          </Button>
          <Button
            onClick={handleSendToClient}
            disabled={sending || uploading}
            className="bg-wellness-green hover:bg-wellness-green/90"
          >
            {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Send className="mr-2 h-4 w-4" />
            Save & Send to Client
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
