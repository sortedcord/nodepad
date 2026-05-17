
export interface KeybindDefinition {
  id: string
  keys: string[]
  label: string
}

export interface KeybindBinding {
  id: string
  key: string
  requiresMod?: boolean
  requiresShift?: boolean
}

export const getKeyboardShortcuts = (modKey: string): KeybindDefinition[] => [
  { id: "command-menu", keys: [modKey, "K"], label: "Command menu" },
  { id: "toggle-sidebar", keys: [modKey, "B"], label: "Toggle sidebar" },
  { id: "undo", keys: [modKey, "Z"], label: "Undo last action" },
  { id: "submit-node", keys: ["Enter"], label: "Submit a new node" },
  { id: "escape", keys: ["Esc"], label: "Close command menu / deselect" },
]

export const GLOBAL_KEYBINDS: KeybindBinding[] = [
  { id: "command-menu", key: "k", requiresMod: true },
  { id: "toggle-sidebar", key: "b", requiresMod: true },
  { id: "undo", key: "z", requiresMod: true, requiresShift: false },
  { id: "escape", key: "Escape" },
]

export const matchKeybind = (event: KeyboardEvent, binding: KeybindBinding): boolean => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  const expectedKey = binding.key.length === 1 ? binding.key.toLowerCase() : binding.key
  if (key !== expectedKey) return false

  if (binding.requiresMod) {
    if (!event.metaKey && !event.ctrlKey) return false
  }

  if (typeof binding.requiresShift === "boolean" && event.shiftKey !== binding.requiresShift) {
    return false
  }

  return true
}

export const getGlobalKeybindAction = (event: KeyboardEvent): string | null => {
  const match = GLOBAL_KEYBINDS.find(binding => matchKeybind(event, binding))
  return match?.id ?? null
}
