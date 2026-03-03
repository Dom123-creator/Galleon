import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-slate-100 text-slate-800",
        primary: "bg-blue-100 text-blue-800",
        secondary: "bg-slate-100 text-slate-600",
        success: "bg-emerald-100 text-emerald-800",
        warning: "bg-amber-100 text-amber-800",
        danger: "bg-red-100 text-red-800",
        info: "bg-sky-100 text-sky-800",
        premium: "bg-gradient-to-r from-amber-400 to-amber-600 text-white",
        // Category colors
        "market-crashes": "bg-red-100 text-red-800",
        "trading-legends": "bg-blue-100 text-blue-800",
        "economic-policy": "bg-purple-100 text-purple-800",
        "banking-history": "bg-yellow-100 text-yellow-800",
        "investment-strategies": "bg-green-100 text-green-800",
        "market-bubbles": "bg-orange-100 text-orange-800",
        "financial-scandals": "bg-pink-100 text-pink-800",
        "monetary-policy": "bg-indigo-100 text-indigo-800",
        "corporate-history": "bg-cyan-100 text-cyan-800",
        "global-finance": "bg-teal-100 text-teal-800",
      },
      size: {
        default: "px-2.5 py-0.5 text-xs",
        sm: "px-2 py-0.5 text-[10px]",
        lg: "px-3 py-1 text-sm",
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
