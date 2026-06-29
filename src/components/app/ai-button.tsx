import { Sparkles } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AiButton({ className, children, ...props }: ButtonProps) {
  return (
    <Button
      {...props}
      className={cn(
        "relative overflow-hidden border-0 text-brand-foreground shadow-soft",
        "bg-[image:var(--gradient-brand)] hover:brightness-110",
        className,
      )}
    >
      <Sparkles className="mr-1.5 h-4 w-4" />
      {children}
    </Button>
  );
}
