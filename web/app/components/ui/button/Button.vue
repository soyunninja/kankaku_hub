<script setup lang="ts">
import type { PrimitiveProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { computed } from "vue"
import type { ButtonVariants } from "."
import { Primitive } from "reka-ui"
import { cn } from "@/lib/utils"
import { buttonVariants } from "."

interface Props extends PrimitiveProps {
  variant?: ButtonVariants["variant"]
  size?: ButtonVariants["size"]
  /** Keep the resting appearance in measurement tables, including filled variants. */
  noHover?: boolean
  class?: HTMLAttributes["class"]
}

const props = withDefaults(defineProps<Props>(), {
  as: "button",
  noHover: false,
})

const classes = computed(() => {
  const classes = cn(buttonVariants({ variant: props.variant, size: props.size }), props.class)
  return props.noHover
    ? classes.split(/\s+/).filter(token => !token.split(":").includes("hover")).join(" ")
    : classes
})
</script>

<template>
  <Primitive
    data-slot="button"
    :data-variant="variant"
    :data-size="size"
    :as="as"
    :as-child="asChild"
    :class="classes"
  >
    <slot />
  </Primitive>
</template>
