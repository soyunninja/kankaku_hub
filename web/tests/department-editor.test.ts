import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { useDepartmentEditor } from '../app/composables/useDepartmentEditor'

const department = { id: 'design', name: 'Design', active: false } as never

function setup() {
  const save = vi.fn().mockResolvedValue(undefined)
  const setActive = vi.fn().mockResolvedValue(undefined)
  const editor = useDepartmentEditor({ save, setActive }, (key: string) => key)
  return { editor, save, setActive }
}

describe('department editor lifecycle', () => {
  it('opens blank create mode and explicitly creates an active department', async () => {
    const { editor, save, setActive } = setup()
    editor.openCreate()
    expect(editor.isOpen.value).toBe(true)
    expect(editor.name.value).toBe('')
    expect(editor.active.value).toBe(true)
    await editor.submit()
    expect(save).toHaveBeenCalledWith('departments', '', { name: '', active: true })
    expect(editor.isOpen.value).toBe(false)
    expect(setActive).not.toHaveBeenCalled()
  })

  it('prefills edit state and saves the selected name and active status', async () => {
    const { editor, save } = setup()
    editor.openEdit(department)
    expect(editor.name.value).toBe('Design')
    expect(editor.active.value).toBe(false)
    await editor.submit()
    expect(save).toHaveBeenCalledWith('departments', 'design', { name: 'Design', active: false })
    expect(editor.isOpen.value).toBe(false)
  })

  it('changes persisted status through the catalog and closes on success', async () => {
    const { editor, setActive } = setup()
    editor.openEdit(department)
    await editor.toggleActive()
    expect(setActive).toHaveBeenCalledWith('departments', 'design', true)
    expect(editor.isOpen.value).toBe(false)
  })

  it.each(['save', 'status'] as const)('retains draft and open modal after failed %s and permits retry', async (operation) => {
    const { editor, save, setActive } = setup()
    editor.openEdit(department)
    editor.name.value = 'Research'
    if (operation === 'save') save.mockRejectedValueOnce(new Error('offline'))
    else setActive.mockRejectedValueOnce(new Error('offline'))
    if (operation === 'save') await editor.submit()
    else await editor.toggleActive()
    expect(editor.isOpen.value).toBe(true)
    expect(editor.name.value).toBe('Research')
    expect(editor.error.value).toBe('team.requestFailed')
    if (operation === 'save') await editor.submit()
    else await editor.toggleActive()
    expect(editor.isOpen.value).toBe(false)
    expect(editor.error.value).toBe('')
  })

  it('blocks duplicate requests and dismissal while pending; cancel is write-free and reopening resets state', async () => {
    const { editor, save, setActive } = setup()
    let resolve!: () => void
    save.mockReturnValueOnce(new Promise<void>((done) => { resolve = done }))
    editor.openEdit(department)
    const pending = editor.submit()
    expect(editor.pending.value).toBe(true)
    expect(editor.submit()).toBeUndefined()
    expect(editor.toggleActive()).toBeUndefined()
    editor.onOpenChange(false)
    expect(editor.isOpen.value).toBe(true)
    resolve()
    await pending
    editor.openEdit(department)
    editor.cancel()
    expect(editor.isOpen.value).toBe(false)
    expect(save).toHaveBeenCalledTimes(1)
    expect(setActive).not.toHaveBeenCalled()
    editor.openCreate()
    expect(editor.name.value).toBe('')
    expect(editor.error.value).toBe('')
    expect(editor.active.value).toBe(true)
  })

  it('shows the shared close button only while idle and explicitly omits the optional description', () => {
    const dialog = readFileSync('app/components/team/DepartmentEditDialog.vue', 'utf8')
    expect(dialog).toContain(':show-close-button="!editor.pending.value"')
    expect(dialog).toContain(':aria-describedby="undefined"')
    expect(dialog).toContain('@update:open="editor.onOpenChange"')
  })

  it('wires card-only edit and dialog create/edit without inline department forms', () => {
    const page = readFileSync('app/pages/team/index.vue', 'utf8')
    expect(page).toContain('<DepartmentEditDialog :editor="departmentEditor" />')
    expect(page).toContain('departmentEditor.openEdit(department)')
    expect(page).toContain('@click="departmentEditor.openCreate()"')
    expect(page).not.toContain("setActive('departments'")
    expect(page).not.toContain('v-if="editing === \'departments\'"')
    expect(page).not.toContain('v-if="departmentDialog"')
  })
})
