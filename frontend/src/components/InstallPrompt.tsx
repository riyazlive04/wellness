import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { X, Smartphone, Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

// Store the deferred prompt globally so it persists across re-renders
let deferredInstallPrompt: any = null;

export function InstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const promptListenerAdded = useRef(false);

  useEffect(() => {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(ios);

    const standalone = window.matchMedia('(display-mode: standalone)').matches ||
                      (window.navigator as any).standalone;
    setIsStandalone(standalone);

    if (standalone) return;

    // Capture the native beforeinstallprompt event (Android Chrome / Desktop Chrome/Edge)
    if (!promptListenerAdded.current) {
      promptListenerAdded.current = true;
      window.addEventListener('beforeinstallprompt', (e: Event) => {
        e.preventDefault();
        deferredInstallPrompt = e;
        
        const dismissed = localStorage.getItem('pwa-prompt-dismissed');
        if (!dismissed) {
          setShowPrompt(true);
        }
      });
    }

    // For iOS (no beforeinstallprompt), show manual instructions
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile && ios) {
      const timer = setTimeout(() => {
        const dismissed = localStorage.getItem('pwa-prompt-dismissed');
        if (!dismissed) {
          setShowPrompt(true);
        }
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  const dismissPrompt = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa-prompt-dismissed', Date.now().toString());
  };

  const handleInstall = async () => {
    if (deferredInstallPrompt) {
      // Trigger the native install prompt
      deferredInstallPrompt.prompt();
      const result = await deferredInstallPrompt.userChoice;
      if (result.outcome === 'accepted') {
        setShowPrompt(false);
      }
      deferredInstallPrompt = null;
    } else {
      // No native prompt available - just dismiss
      dismissPrompt();
    }
  };

  if (!showPrompt || isStandalone) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[100] animate-in fade-in slide-in-from-bottom-5">
      <Card className="shadow-2xl border-primary/20 bg-background/95 backdrop-blur-sm">
        <CardContent className="p-4 flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Smartphone className="h-6 w-6 text-primary" />
          </div>

          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm">Install Sheizen App</h4>
            <p className="text-xs text-muted-foreground line-clamp-2">
              Install our app for the best experience and real-time push notifications.
            </p>
          </div>

          <div className="flex flex-col gap-2 shrink-0">
            <Button size="sm" className="h-8" onClick={isIOS ? dismissPrompt : handleInstall}>
              <Download className="h-3 w-3 mr-2" />
              {isIOS ? "How to Install" : "Install"}
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 absolute -top-2 -right-2 rounded-full bg-background shadow-md border" onClick={dismissPrompt}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        </CardContent>
        {isIOS && (
          <div className="px-4 pb-4 pt-0 text-[10px] text-muted-foreground flex items-center gap-1 border-t mt-2 pt-2">
             Tap the <span className="p-1 px-1.5 bg-muted rounded border"><Download className="h-2 w-2 inline" /> Share</span> icon then <strong>&quot;Add to Home Screen&quot;</strong>
          </div>
        )}
      </Card>
    </div>
  );
}
