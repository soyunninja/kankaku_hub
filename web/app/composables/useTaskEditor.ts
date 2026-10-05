import type { TaskRecord, TaskStatus } from '../lib/pocketbase-types'

/** Existing task edit fields and mutation semantics, reusable by the page
 * dialog and executable without mounting a Nuxt page. */
export function useTaskEditor(task: () => TaskRecord, canWrite: () => boolean, onDeleted: () => void = () => {}) {
  const { update, remove } = useTasks()
  const { t } = useI18n()
  const toast = useToast()
  const open = ref(false)
  const form = reactive({ title: '', project: '', status: 'open' as TaskStatus, external_ref: '', description: '' })

  function reset() {
    const { title, project, status, external_ref, description } = task()
    Object.assign(form, { title, project, status, external_ref, description })
  }

  async function submit() {
    if (!canWrite()) return
    try {
      await update(task().id, { ...form })
      toast.success(t('common.saved'))
      open.value = false
    }
    catch {
      toast.error(t('common.error'))
    }
  }

  async function deleteTask() {
    if (!canWrite()) return
    try {
      await remove(task().id)
      toast.success(t('common.saved'))
      open.value = false
      onDeleted()
    }
    catch {
      toast.error(t('common.error'))
    }
  }

  return { open, form, reset, submit, deleteTask }
}
