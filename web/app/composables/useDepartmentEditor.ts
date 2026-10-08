import { ref } from 'vue'
import type { DepartmentRecord } from '@/lib/pocketbase-types'
import type { useTeamCatalog } from '@/composables/useTeamCatalog'

type Catalog = Pick<ReturnType<typeof useTeamCatalog>, 'save' | 'setActive'>

/** Bounded create/edit state for the department dialog; catalog writes remain owned by useTeamCatalog. */
export function useDepartmentEditor(catalog: Catalog, t: (key: string) => string) {
  const isOpen = ref(false)
  const editing = ref<DepartmentRecord | null>(null)
  const name = ref('')
  const active = ref(true)
  const pending = ref(false)
  const error = ref('')

  function reset() {
    editing.value = null
    name.value = ''
    active.value = true
    error.value = ''
  }

  function openCreate() {
    if (pending.value) return
    reset()
    isOpen.value = true
  }

  function openEdit(department: DepartmentRecord) {
    if (pending.value) return
    reset()
    editing.value = department
    name.value = department.name
    active.value = department.active
    isOpen.value = true
  }

  function close() {
    if (pending.value) return
    isOpen.value = false
    reset()
  }

  function onOpenChange(open: boolean) {
    if (open) return
    close()
  }

  async function run(operation: () => Promise<unknown>) {
    if (pending.value || !isOpen.value) return
    pending.value = true
    error.value = ''
    try {
      await operation()
      isOpen.value = false
      reset()
    }
    catch {
      error.value = t('team.requestFailed')
    }
    finally {
      pending.value = false
    }
  }

  function submit() {
    if (pending.value || !isOpen.value) return
    const department = editing.value
    return run(() => catalog.save('departments', department?.id ?? '', {
      name: name.value.trim(), active: department ? active.value : true,
    }))
  }

  function toggleActive() {
    const department = editing.value
    if (!department || pending.value || !isOpen.value) return
    return run(() => catalog.setActive('departments', department.id, !active.value))
  }

  return { isOpen, editing, name, active, pending, error, openCreate, openEdit, close, cancel: close, onOpenChange, submit, toggleActive }
}
