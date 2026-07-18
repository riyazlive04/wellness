import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      // Top-centre: horizontally centred, tucked at the top so it never floats
      // over page content the way a dead-centre toast does. Set here once, so
      // every toast in the app lands in the same place.
      position="top-center"
      className="toaster group"
      // Wider than sonner's 356px default so the message has room to breathe.
      style={{ "--width": "440px" } as React.CSSProperties}
      toastOptions={{
        classNames: {
          // Bigger, more legible toast: larger padding, gap, and text than
          // sonner's compact default (13px / 16px padding).
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-xl group-[.toaster]:gap-3 group-[.toaster]:p-5 group-[.toaster]:text-[15px] group-[.toaster]:rounded-xl [&_[data-icon]]:size-6",
          title: "group-[.toast]:text-[15px] group-[.toast]:font-semibold",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:text-sm",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:text-sm group-[.toast]:h-9 group-[.toast]:px-3",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:text-sm group-[.toast]:h-9 group-[.toast]:px-3",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
