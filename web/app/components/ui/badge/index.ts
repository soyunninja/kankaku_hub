import type { VariantProps } from "class-variance-authority"
import { cva } from "class-variance-authority"

export { default as Badge } from "./Badge.vue"

export const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-focus-indicator focus-visible:ring-focus-indicator focus-visible:ring-3 aria-invalid:ring-destructive aria-invalid:focus-visible:ring-destructive aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
         "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        // App-specific extension (not part of the stock shadcn-vue registry
        // component): "Activo"/active-state badges use the app's own
        // --success token rather than forking the component markup.
        success:
          "border-transparent bg-success text-success-foreground [a&]:hover:bg-success/90",
        // App-specific extension, same rationale as `success` above: the
        // entry detail status badge (see EntryDetailSheet.vue) needs a
        // third, distinct-from-red/green tone for "interrupted" that
        // still passes contrast in both themes.
        warning:
          "border-transparent bg-warning text-warning-foreground [a&]:hover:bg-warning/90",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)
export type BadgeVariants = VariantProps<typeof badgeVariants>
