interface ToggleProps {
  checked: boolean
  onChange: () => void
  ariaLabel: string
}

export function Toggle({ checked, onChange, ariaLabel }: ToggleProps): JSX.Element {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={checked}
      onClick={onChange}
      className={`relative h-6 w-11 shrink-0 overflow-hidden rounded-full transition-colors ${
        checked ? 'bg-blue-600' : 'bg-[#333]'
      }`}
    >
      <span
        className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}
