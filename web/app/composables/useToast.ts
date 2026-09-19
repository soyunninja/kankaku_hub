export interface ToastMessage {
  id: number
  title: string
  description?: string
  variant?: 'default' | 'destructive' | 'success'
}

let nextId = 1

/** Minimal toast stack shared app-wide via useState — no external
 * toast/sonner dependency needed for a single-user internal tool. */
export function useToast() {
  const toasts = useState<ToastMessage[]>('toasts', () => [])

  function push(toast: Omit<ToastMessage, 'id'>, timeoutMs = 5000) {
    const id = nextId++
    toasts.value.push({ id, ...toast })
    if (timeoutMs > 0) {
      setTimeout(() => dismiss(id), timeoutMs)
    }
    return id
  }

  function dismiss(id: number) {
    const idx = toasts.value.findIndex(t => t.id === id)
    if (idx !== -1) toasts.value.splice(idx, 1)
  }

  return {
    toasts,
    success: (title: string, description?: string) => push({ title, description, variant: 'success' }),
    error: (title: string, description?: string) => push({ title, description, variant: 'destructive' }),
    info: (title: string, description?: string) => push({ title, description, variant: 'default' }),
    dismiss,
  }
}
