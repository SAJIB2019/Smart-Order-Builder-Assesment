export function formatBdt(poisha: number): string {
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: 'BDT',
    minimumFractionDigits: 2,
  }).format(poisha / 100)
}

export function formatDateTime(timestamp: string): string {
  return new Intl.DateTimeFormat('en-BD', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Dhaka',
  }).format(new Date(timestamp))
}

export function formatPaymentMethod(method: string): string {
  return method === 'bkash'
    ? 'bKash'
    : `${method[0]?.toUpperCase()}${method.slice(1)}`
}
