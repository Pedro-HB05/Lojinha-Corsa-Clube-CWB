import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react'

type Tone = 'success' | 'error' | 'info'
interface Toast { id: string; message: string; tone: Tone }
const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const notify = useCallback((message: string, tone: Tone = 'success') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setToasts(current => [...current, { id, message, tone }])
    window.setTimeout(() => setToasts(current => current.filter(toast => toast.id !== id)), 5000)
  }, [])
  return <ToastContext.Provider value={notify}>
    {children}
    <div className="toast-stack" aria-live="polite">
      {toasts.map(toast => <div key={toast.id} role="alert" className={`toast toast-${toast.tone}`}>
        {toast.tone === 'success' ? <CheckCircle2 size={20} /> : toast.tone === 'error' ? <CircleAlert size={20} /> : <Info size={20} />}
        <span>{toast.message}</span>
        <button onClick={() => setToasts(current => current.filter(item => item.id !== toast.id))} aria-label="Fechar"><X size={16} /></button>
      </div>)}
    </div>
  </ToastContext.Provider>
}

export const useToast = () => useContext(ToastContext)
