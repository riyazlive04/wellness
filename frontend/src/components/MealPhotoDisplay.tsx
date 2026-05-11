import { useState, useEffect } from "react";
import { getSignedUrl } from "@/lib/storage";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

interface MealPhotoDisplayProps {
  photoPath: string | null;
  mealName: string | null;
}

export function MealPhotoDisplay({ photoPath, mealName }: MealPhotoDisplayProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!photoPath) {
      setLoading(false);
      return;
    }

    const loadImage = async () => {
      try {
        const url = await getSignedUrl("meal-photos", photoPath);
        setSignedUrl(url);
      } catch (error) {
        console.error("Failed to load meal photo:", error);
        toast.error("Failed to load meal photo");
      } finally {
        setLoading(false);
      }
    };

    loadImage();
  }, [photoPath]);

  if (!photoPath) {
    return (
      <div className="aspect-square rounded-lg overflow-hidden bg-muted flex items-center justify-center">
        <p className="text-sm text-muted-foreground">No photo</p>
      </div>
    );
  }

  if (loading) {
    return <Skeleton className="aspect-square rounded-lg" />;
  }

  return (
    <div className="aspect-square rounded-lg overflow-hidden bg-muted">
      {signedUrl && (
        <img
          src={signedUrl}
          alt={mealName || "Meal"}
          className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform"
          onClick={() => window.open(signedUrl, "_blank")}
        />
      )}
    </div>
  );
}
