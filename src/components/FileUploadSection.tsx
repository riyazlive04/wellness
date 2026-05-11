import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Loader2, FileText, Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getSignedUrl } from "@/lib/storage";
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
import { formatDate } from "@/lib/formatters";

interface FileUploadSectionProps {
  clientId: string;
}

interface FileRecord {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
  source: 'file' | 'assessment'; // Distinguish source
  bucket: 'client-files' | 'assessment-files';
  assessment_type?: string | null;
}

export function FileUploadSection({ clientId }: FileUploadSectionProps) {
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchFiles();
  }, [clientId]);

  const fetchFiles = async () => {
    setLoading(true);
    console.log("Fetching files for client:", clientId);

    // Fetch from 'files' table
    const { data: clientFiles, error: filesError } = await supabase
      .from("files")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });

    if (filesError) {
      console.error("Error fetching client files:", filesError);
      toast.error("Failed to load your uploads");
    } else {
      console.log("Client files fetched:", clientFiles?.length);
    }

    // Fetch from 'assessments' table (files only)
    const { data: assessmentFiles, error: assessmentsError } = await supabase
      .from("assessments")
      .select("id, file_name, file_url, created_at") // Select relevant fields
      .eq("client_id", clientId)
      .not("file_url", "is", null)
      .order("created_at", { ascending: false });

    if (assessmentsError) {
      console.error("Error fetching assessment files:", assessmentsError);
    } else {
      console.log("Assessment files fetched:", assessmentFiles?.length);
    }

    const mappedFiles: FileRecord[] = (clientFiles || []).map(f => ({
      ...f,
      source: 'file',
      bucket: 'client-files'
    }));

    const mappedAssessments: FileRecord[] = (assessmentFiles || []).map(a => ({
      id: a.id,
      file_name: a.file_name || "Assessment File",
      file_url: a.file_url,
      file_type: "application/pdf", // Assuming mostly PDFs for assessments
      file_size: null, // Size might not be stored in assessments table
      created_at: a.created_at,
      source: 'assessment',
      bucket: 'assessment-files',
      assessment_type: (a as any).assessment_type // Cast to any since we updated query but maybe not types
    }));

    // Combine and sort by date
    const combined = [...mappedFiles, ...mappedAssessments].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    console.log("Total combined files:", combined.length);
    setFiles(combined);
    setLoading(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (selectedFile.size > 20 * 1024 * 1024) {
      toast.error("File size must be less than 20MB");
      return;
    }

    setUploading(true);

    try {
      // Upload file to storage
      const fileName = `${clientId}/${Date.now()}-${selectedFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from("client-files")
        .upload(fileName, selectedFile);

      if (uploadError) throw uploadError;

      // Insert file record with file path
      const { error: dbError } = await supabase
        .from("files")
        .insert({
          client_id: clientId,
          file_name: selectedFile.name,
          file_url: fileName,
          file_type: selectedFile.type,
          file_size: selectedFile.size,
        });

      if (dbError) throw dbError;

      toast.success("File uploaded successfully!");
      fetchFiles();
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error.message || "Failed to upload file");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDelete = async (fileId: string, filePath: string, source: 'file' | 'assessment', bucket: string) => {
    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from(bucket)
        .remove([filePath]);

      if (storageError) {
        console.error("Storage delete error:", storageError);
        // Continue to try DB delete even if storage fails
      }

      // Delete from database based on source
      if (source === 'file') {
        const { error: dbError } = await supabase
          .from("files")
          .delete()
          .eq("id", fileId);
        if (dbError) throw dbError;
      } else {
        // For assessments, try to delete the record if it's a generic upload (assessment_type is NULL)
        // Check count to see if delete actually happened (RLS might silently ignore)
        const { error: dbError, count } = await supabase
          .from("assessments")
          .delete({ count: 'exact' })
          .eq("id", fileId);

        if (dbError) {
          console.warn("Delete assessment failed:", dbError);
          throw dbError;
        }

        // If nothing deleted (likely due to RLS protecting non-null assessment_type), try Updating fields to null
        if (count === 0) {
          console.log("Delete affected 0 rows, attempting to clear file fields instead...");
          const { error: updateError } = await supabase
            .from("assessments")
            .update({ file_name: null, file_url: null, display_name: null } as any)
            .eq("id", fileId);

          if (updateError) {
            console.error("Fallback update failed:", updateError);
            throw new Error("Could not delete file attachment (System restricted)");
          }
        }
      }

      toast.success("File deleted successfully!");
      fetchFiles();
    } catch (error: any) {
      console.error("Delete error:", error);
      toast.error(error.message || "Failed to delete file");
    } finally {
      setDeleteId(null);
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Your Files</CardTitle>
              <CardDescription>Upload and manage your documents</CardDescription>
            </div>
            <Button
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload File
                </>
              )}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileUpload}
              className="hidden"
              disabled={uploading}
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading files...</div>
          ) : files.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg mb-2">No files yet</p>
              <p className="text-sm">Upload your first file to get started</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((file) => (
                  <TableRow key={file.id}>
                    <TableCell className="font-medium">{file.file_name}</TableCell>
                    <TableCell>{file.file_type || "—"}</TableCell>
                    <TableCell>{formatFileSize(file.file_size)}</TableCell>
                    <TableCell>{formatDate(file.created_at)}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          try {
                            const signedUrl = await getSignedUrl(file.bucket, file.file_url);
                            window.open(signedUrl, "_blank");
                          } catch (error) {
                            toast.error("Failed to open file");
                          }
                        }}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setDeleteId(file.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete File</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this file? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const file = files.find(f => f.id === deleteId);
                if (file) handleDelete(file.id, file.file_url, file.source, file.bucket);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
