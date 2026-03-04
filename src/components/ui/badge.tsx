import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase font-mono transition-colors",
  {
    variants: {
      variant: {
        default: "bg-navy-3 text-muted border border-border",
        primary: "bg-gold/10 text-gold border border-gold/30",
        secondary: "bg-navy-3 text-cream-2 border border-border",
        success: "bg-g-green/10 text-g-green border border-g-green/30",
        warning: "bg-g-amber/10 text-g-amber border border-g-amber/30",
        danger: "bg-g-red/10 text-g-red border border-g-red/30",
        info: "bg-g-blue/10 text-g-blue border border-g-blue/30",
        premium: "bg-gold/20 text-gold-2 border border-gold/40",
      },
      size: {
        default: "px-2 py-0.5 text-[10px]",
        sm: "px-1.5 py-0.5 text-[9px]",
        lg: "px-3 py-1 text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant, size }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
