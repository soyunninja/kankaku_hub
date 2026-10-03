import type { VariantProps } from "class-variance-authority"
import { cva } from "class-variance-authority"

export { default as Button } from "./Button.vue"

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap border-0 font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-focus-indicator focus-visible:ring-3 aria-invalid:ring-destructive aria-invalid:focus-visible:ring-destructive aria-invalid:ring-3",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive dark:bg-destructive/60 dark:hover:bg-destructive/60",
        outline:
          "bg-background hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:hover:bg-accent",
        toolbar:
          "bg-muted text-foreground hover:bg-muted dark:bg-muted dark:hover:bg-muted",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-foreground underline-offset-4 hover:underline",
      },
      size: {
        "default": "control-size",
        "segment": "h-9 rounded-[12px] px-3 text-base md:text-sm",
        "xs": "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        "sm": "control-size gap-1.5",
        "lg": "control-size px-6",
        "icon": "control-size w-11 p-0",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 rounded-[8px] p-0 text-sm",
        "calendar-nav": "size-7 rounded-[8px] p-0 text-sm",
        "icon-lg": "control-size w-11 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)
export type ButtonVariants = VariantProps<typeof buttonVariants>
