export const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format

export function dateTime(value?: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

export const statusLabels: Record<string, string> = {
  awaiting_payment: 'Aguardando pagamento', awaiting_validation: 'Comprovante enviado', receipt_rejected: 'Comprovante recusado',
  payment_confirmed: 'Pagamento confirmado', awaiting_batch: 'Aguardando lote', included_in_batch: 'Incluído no lote',
  pending_payment: 'Aguardando pagamento', pending: 'Pendente', payment_submitted: 'Comprovante enviado',
  payment_approved: 'Pagamento aprovado', paid: 'Pago', payment_rejected: 'Comprovante recusado',
  sent_to_production: 'Enviado para produção', in_production: 'Em produção', production: 'Em produção',
  production_completed: 'Produção concluída', received: 'Recebido', ready_for_delivery: 'Pronto para entrega',
  delivered: 'Entregue', cancelled: 'Cancelado', open: 'Aberto', closed: 'Fechado', approved: 'Aprovado', rejected: 'Recusado',
}

export function labelStatus(status?: string) {
  if (!status) return '—'
  return statusLabels[status.toLowerCase()] || status.replaceAll('_', ' ')
}

export function statusTone(status?: string) {
  const value = status?.toLowerCase() || ''
  if (/(approved|confirmed|paid|delivered|closed|received|completed)/.test(value)) return 'success'
  if (/(rejected|cancelled)/.test(value)) return 'danger'
  if (/(production|submitted|ready|validation|included)/.test(value)) return 'info'
  return 'warning'
}

export function initials(name?: string) {
  return (name || 'Usuário').split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Ocorreu um erro inesperado.'
}
