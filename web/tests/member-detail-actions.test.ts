import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

const page = readFileSync('app/pages/team/[id].vue', 'utf8')

function pageHandler(name: string, dependencies: Record<string, unknown>, options: { async?: boolean, parameters?: string } = {}) {
  const body = page.match(new RegExp(`(?:async )?function ${name}\\([^)]*\\) \\{([\\s\\S]*?)\\n\\}`))?.[1]
  expect(body, `${name} implementation`).toBeTruthy()
  const asyncKeyword = options.async ? 'async ' : ''
  return new Function(...Object.keys(dependencies), `return ${asyncKeyword}function ${name}(${options.parameters ?? ''}) {${body}\n}`)(...Object.values(dependencies))
}

function editorHarness(save = vi.fn(async () => {})) {
  const isOwner = { value: true }
  const member = { value: { id: 'member-a', name: 'Ada', department: 'dept-a', active: true } }
  const memberId = { value: 'member-a' }
  const generation = { value: 1 }
  const saving = { value: false }
  const editing = { value: false }
  const editError = { value: '' }
  const error = { value: '' }
  const draft = { name: '', department: '', active: true }
  const dependencies = { isOwner, member, memberId, generation, saving, editing, editError, error, draft, t: (key: string) => key, useTeamCatalog: () => ({ save }) }
  const cancel = pageHandler('cancelEdit', dependencies) as () => void
  const openDependencies = { ...dependencies, cancelEdit: cancel }
  return {
    ...dependencies,
    save,
    open: pageHandler('editMember', dependencies, { async: true }) as () => Promise<void>,
    submit: pageHandler('saveMember', dependencies, { async: true }) as () => Promise<void>,
    cancel,
    updateOpen: pageHandler('onEditOpenChange', openDependencies, { parameters: 'open' }) as (open: boolean) => void,
    preventDismiss: pageHandler('preventEditDismiss', dependencies, { parameters: 'event' }) as (event: Event) => void,
  }
}

function activeHandler(dependencies: Record<string, unknown>) {
  return pageHandler('toggleMemberActive', dependencies, { async: true }) as () => Promise<void>
}

function harness(options: { owner?: boolean, active?: boolean, id?: string, setActive?: ReturnType<typeof vi.fn> } = {}) {
  const isOwner = { value: options.owner ?? true }
  const member = { value: { id: options.id ?? 'member-a', active: options.active ?? true } }
  const memberId = { value: member.value.id }
  const saving = { value: false }
  const editing = { value: false }
  const generation = { value: 1 }
  const draft = { active: member.value.active }
  const error = { value: '' }
  const setActive = options.setActive ?? vi.fn(async () => {})
  const handler = activeHandler({ isOwner, member, memberId, saving, editing, generation, draft, error, t: (key: string) => key, useTeamCatalog: () => ({ setActive }) })
  return { handler, isOwner, member, memberId, saving, editing, generation, draft, error, setActive }
}

describe('member detail actions', () => {
  it('soft-toggles the captured member active state and synchronizes the profile draft', async () => {
    for (const active of [true, false]) {
      const state = harness({ active })
      await state.handler()
      expect(state.setActive).toHaveBeenCalledWith('team_members', 'member-a', !active)
      expect(state.draft.active).toBe(!active)
      expect(state.saving.value).toBe(false)
      expect(state.error.value).toBe('')
    }
  })

  it('guards non-owner, missing, pending, and editing states', async () => {
    const nonOwner = harness({ owner: false })
    await nonOwner.handler()
    expect(nonOwner.setActive).not.toHaveBeenCalled()

    const missing = harness()
    missing.member.value = null as never
    await missing.handler()
    expect(missing.setActive).not.toHaveBeenCalled()

    const pending = harness()
    pending.saving.value = true
    await pending.handler()
    expect(pending.setActive).not.toHaveBeenCalled()

    const editing = harness()
    editing.editing.value = true
    await editing.handler()
    expect(editing.setActive).not.toHaveBeenCalled()

    const profile = editorHarness()
    profile.isOwner.value = false
    await profile.open()
    expect(profile.editing.value).toBe(false)
    profile.editing.value = true
    await profile.submit()
    expect(profile.save).not.toHaveBeenCalled()
  })

  it('shows the existing localized failure and releases pending state', async () => {
    const state = harness({ setActive: vi.fn(async () => { throw new Error('private failure') }) })
    await state.handler()
    expect(state.error.value).toBe('team.requestFailed')
    expect(state.saving.value).toBe(false)
  })

  it('does not overwrite the next route draft or error after a stale completion', async () => {
    let resolve!: () => void
    const pending = new Promise<void>((done) => { resolve = done })
    const state = harness({ setActive: vi.fn(() => pending) })
    const operation = state.handler()
    state.memberId.value = 'member-b'
    state.generation.value++
    state.member.value = { id: 'member-b', active: true }
    state.draft.active = true
    state.error.value = 'next route error'
    resolve()
    await operation
    expect(state.draft.active).toBe(true)
    expect(state.error.value).toBe('next route error')
    expect(state.saving.value).toBe(false)
  })

  it('prefills the modal, cancels without writing, and reopens from persisted values', async () => {
    const state = editorHarness()
    await state.open()
    expect(state.editing.value).toBe(true)
    expect(state.draft).toEqual({ name: 'Ada', department: 'dept-a', active: true })
    state.draft.name = 'Unsaved'
    const idleDismiss = { preventDefault: vi.fn() } as unknown as Event
    state.preventDismiss(idleDismiss)
    state.updateOpen(false)
    expect(idleDismiss.preventDefault).not.toHaveBeenCalled()
    expect(state.editing.value).toBe(false)
    expect(state.save).not.toHaveBeenCalled()
    state.member.value = { id: 'member-a', name: 'Ada Persisted', department: 'dept-b', active: false }
    await state.open()
    expect(state.draft).toEqual({ name: 'Ada Persisted', department: 'dept-b', active: false })
  })

  it('blocks modal dismissal while saving and closes only after a successful save', async () => {
    let resolve!: () => void
    const state = editorHarness(vi.fn(() => new Promise<void>((done) => { resolve = done })))
    await state.open()
    state.draft.name = ' Ada Saved '
    const operation = state.submit()
    await state.submit()
    expect(state.save).toHaveBeenCalledOnce()
    expect(state.saving.value).toBe(true)
    state.updateOpen(false)
    const event = { preventDefault: vi.fn() } as unknown as Event
    state.preventDismiss(event)
    expect(state.editing.value).toBe(true)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    resolve()
    await operation
    expect(state.save).toHaveBeenCalledWith('team_members', 'member-a', { name: 'Ada Saved', department: 'dept-a', active: true })
    expect(state.editing.value).toBe(false)
    expect(state.saving.value).toBe(false)
    expect(state.editError.value).toBe('')
  })

  it('keeps the modal draft and visible localized error after save failure', async () => {
    const state = editorHarness(vi.fn(async () => { throw new Error('private failure') }))
    await state.open()
    state.draft.name = 'Draft name'
    await state.submit()
    expect(state.editing.value).toBe(true)
    expect(state.draft.name).toBe('Draft name')
    expect(state.editError.value).toBe('team.requestFailed')
    expect(state.saving.value).toBe(false)
  })

  it('does not close or replace the next member modal after a stale save completion', async () => {
    let resolve!: () => void
    const state = editorHarness(vi.fn(() => new Promise<void>((done) => { resolve = done })))
    await state.open()
    state.draft.name = 'Old member draft'
    const operation = state.submit()
    state.memberId.value = 'member-b'
    state.generation.value++
    state.member.value = { id: 'member-b', name: 'Bea', department: 'dept-b', active: false }
    state.editing.value = false
    state.draft.name = 'Next member draft'
    state.editError.value = 'next member error'
    resolve()
    await operation
    expect(state.editing.value).toBe(false)
    expect(state.draft.name).toBe('Next member draft')
    expect(state.editError.value).toBe('next member error')
    expect(state.saving.value).toBe(false)
    await state.open()
    expect(state.editing.value).toBe(true)
    expect(state.draft).toEqual({ name: 'Bea', department: 'dept-b', active: false })
  })

  it('places edit/archive controls in the owner sidebar and the department below the name', () => {
    const header = page.slice(page.indexOf('<header'), page.indexOf('</header>'))
    const sidebar = page.slice(page.indexOf('<aside'), page.indexOf('</aside>'))
    expect(header).not.toContain('team.currentDepartment')
    expect(header).not.toContain("t('nav.team')")
    expect(header).not.toContain('editMember')
    expect(header).toContain('<h1')
    expect(header).toContain('{{ currentDepartment }}')
    expect(header.indexOf('<h1')).toBeLessThan(header.indexOf('{{ currentDepartment }}'))
    expect(page).not.toContain('<NuxtLink to="/team" class="self-start')
    expect(page).toContain('@click="navigateTo(\'/team\')"')
    expect(sidebar).toContain('v-if="isOwner && member"')
    expect(sidebar).toContain('@click="editMember"')
    expect(sidebar).toContain('@click="toggleMemberActive"')
    expect(sidebar).toContain('member.active ? Archive : ArchiveRestore')
    expect(sidebar).toContain("member.active ? t('common.archive') : t('common.unarchive')")
    expect(sidebar).toContain(':disabled="saving || editing"')
    const main = page.slice(page.indexOf('<main'), page.indexOf('</main>'))
    expect(main).toContain('<MemberWorkViews :key="member.id" :member-id="member.id" />')
    expect(main).not.toContain('<form')
    expect(page).toContain('<Dialog v-if="isOwner && member" :open="editing" @update:open="onEditOpenChange">')
    expect(page).toContain(':show-close-button="!saving"')
    expect(page).toContain(':aria-describedby="undefined"')
    expect(page).toContain('@escape-key-down="preventEditDismiss"')
    expect(page).toContain('@pointer-down-outside="preventEditDismiss"')
    expect(page).toContain('@interact-outside="preventEditDismiss"')
    expect(page).toContain("{{ t('common.edit') }} · {{ member.name }}")
    expect(page).toContain('v-if="editError" role="alert"')
    expect(page).toContain('watch([memberId, isOwner]')
  })
})
