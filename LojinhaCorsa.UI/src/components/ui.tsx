import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, LoaderCircle, Moon, PackageOpen, Sun, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import { assetUrl } from '../services/api'
import { labelStatus, statusTone } from '../utils/format'

export function Logo({ compact = false }: { compact?: boolean }) {
  return <div className="logo"><span className="logo-mark">C</span>{!compact && <span><b>LOJINHA</b><small>CORSA CWB</small></span>}</div>
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return <header className="page-header"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="header-actions">{actions}</div>}</header>
}

export function Loading({ label = 'Carregando...' }: { label?: string }) {
  return <div className="state-box"><LoaderCircle className="spin" /><p>{label}</p></div>
}

export function Empty({ title = 'Nada por aqui', description = 'Nenhum registro foi encontrado.', icon }: { title?: string; description?: string; icon?: ReactNode }) {
  return <div className="state-box empty">{icon || <Inbox />}<h3>{title}</h3><p>{description}</p></div>
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="state-box error"><AlertTriangle /><h3>Não foi possível carregar</h3><p>{message}</p>{retry && <button className="btn btn-secondary" onClick={retry}>Tentar novamente</button>}</div>
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge-${statusTone(status)}`}>{labelStatus(status)}</span>
}

export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose(): void; wide?: boolean }) {
  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><section className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true"><header><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Fechar"><X /></button></header>{children}</section></div>
}

export function ConfirmModal({ title, message, confirmLabel = 'Confirmar', danger = false, onConfirm, onClose }: { title: string; message: string; confirmLabel?: string; danger?: boolean; onConfirm(): void; onClose(): void }) {
  return <Modal title={title} onClose={onClose}><p>{message}</p><div className="modal-actions"><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>{confirmLabel}</button></div></Modal>
}

export function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange(page: number): void }) {
  if (totalPages <= 1) return null
  return <div className="pagination"><button disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft size={17} /> Anterior</button><span>Página <b>{page}</b> de {totalPages}</span><button disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Próxima <ChevronRight size={17} /></button></div>
}

export function ProductImage({ photoId, alt, className = '' }: { photoId?: string; alt: string; className?: string }) {
  const [hasError, setHasError] = useState(false)
  if (!photoId || hasError) {
    return (
      <div className={`image-placeholder ${className}`}>
        <PackageOpen />
        <span>Sem foto</span>
      </div>
    )
  }
  return (
    <img
      className={className}
      src={assetUrl(`/product-photos/${photoId}`)}
      alt={alt}
      onError={() => setHasError(true)}
    />
  )
}

export function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}{error && <small className="field-error">{error}</small>}</label>
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggleTheme } = useTheme()
  return (
    <button
      type="button"
      className={`theme-toggle ${className}`}
      onClick={toggleTheme}
      title={theme === 'dark' ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
      aria-label="Alternar tema claro/escuro"
    >
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}
