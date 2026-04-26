function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function formatLocalDateInputValue(input?: string | number | Date): string {
  const date = input ? new Date(input) : new Date()
  if (Number.isNaN(date.getTime())) {
    const now = new Date()
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  }

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
