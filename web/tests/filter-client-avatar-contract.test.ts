import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Source contracts only: these checks do not mount Nuxt pages or exercise
// Select's runtime focus, keyboard, search, or rendering behavior.
describe.each(['tasks', 'entries'])('%s filter identity source contract', (page) => {
  const source = readFileSync(`app/pages/${page}/index.vue`, 'utf8')

  it.each(['client', 'project'])('visibly labels the %s filter with a unique association', (field) => {
    const id = `${page}-filter-${field}`
    expect(source.match(new RegExp(`\\bid="${id}"`, 'g'))).toHaveLength(1)
    expect(source.match(new RegExp(`\\bfor="${id}"`, 'g'))).toHaveLength(1)
    expect(source).toMatch(new RegExp(`<(?:Label|label)\\b[^>]*for="${id}"[^>]*>\\s*\\{\\{ t\\('common\\.${field}'\\) \\}\\}\\s*</(?:Label|label)>`))
    expect(source).toMatch(new RegExp(`<Select\\s[^>]*id="${id}"`))
  })

  it('wires decorative xs avatars before canonical text in both client slots', () => {
    const select = source.match(new RegExp(`<Select\\s[^>]*id="${page}-filter-client"[\\s\\S]*?</Select>`))?.[0]
    expect(select).toBeTruthy()
    expect(source).toContain("import ClientAvatar from '@/components/clients/ClientAvatar.vue'")
    expect(source).toMatch(/function clientById\(id: string\) \{\s*return clients\.value\.find\(c => c\.id === id\)/)
    expect(select).toContain("{ value: '', label: t('common.all') }")
    expect(select).toContain('clients.map(c => ({ value: c.id, label: c.name }))')
    expect(select).toContain('@update:model-value="selectClient"')
    expect(select).toContain(page === 'tasks' ? ':model-value="filterClient"' : ':model-value="filters.client"')

    for (const [slot, binding, guard, text] of [
      ['option', '{ option }', 'option.value && clientById(option.value)', 'option.label'],
      ['selected', '{ option, label }', 'option?.value && clientById(option.value)', 'label'],
    ]) {
      const content = select?.match(new RegExp(`<template #${slot}="${binding}">([\\s\\S]*?)</template>`))?.[1]
      expect(content).toBeTruthy()
      expect(content).toContain(`v-if="${guard}"`)
      expect(content).toContain(':client="clientById(option.value)!" size="xs" aria-hidden="true"')
      expect(content).toMatch(new RegExp(`<ClientAvatar[^>]+/>\\s*<span class="truncate">\\{\\{ ${text.replace('.', '\\.')} \\}\\}</span>`))
    }
  })
})
