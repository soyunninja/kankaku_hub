export interface ToastAction {
  href: string
  label: string
}

export interface ToastOptions {
  action?: ToastAction
  /** Zero keeps the toast visible until manually dismissed. */
  duration?: number
}

export interface ToastMessage {
  id: number
  title: string
  description?: string
  action?: ToastAction
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
    success: (title: string, description?: string, options: ToastOptions = {}) => push({ title, description, variant: 'success', action: options.action }, options.duration),
    error: (title: string, description?: string, options: ToastOptions = {}) => push({ title, description, variant: 'destructive', action: options.action }, options.duration),
    info: (title: string, description?: string, options: ToastOptions = {}) => push({ title, description, variant: 'default', action: options.action }, options.duration),
    dismiss,
  }
}
