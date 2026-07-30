export const ADMIN_CONFIRM_EVENT = 'mlsc:admin-confirm'

export function adminConfirm(options) {
  const normalized = typeof options === 'string' ? { message: options } : options
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent(ADMIN_CONFIRM_EVENT, {
      detail: { options: normalized || {}, resolve },
    }))
  })
}
