<script setup lang="ts">
import type { TabsTriggerProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { TabsTrigger, useForwardProps } from "reka-ui"
import { cn } from "@/lib/utils"

const props = defineProps<TabsTriggerProps & { class?: HTMLAttributes["class"] }>()

const delegatedProps = reactiveOmit(props, "class")

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <TabsTrigger
    data-slot="tabs-trigger"
    :class="cn(
      `data-[state=active]:bg-background dark:data-[state=active]:text-foreground focus-visible:border-focus-indicator focus-visible:ring-focus-indicator focus-visible:outline-focus-indicator dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 text-foreground dark:text-muted-foreground inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[12px] border-0 px-3 py-0 text-base md:text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-3 focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4`,
      props.class,
    )"
    v-bind="forwardedProps"
  >
    <slot />
  </TabsTrigger>
</template>
