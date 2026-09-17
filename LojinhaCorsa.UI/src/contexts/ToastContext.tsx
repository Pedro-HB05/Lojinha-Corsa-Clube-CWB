import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react'

type Tone = 'success' | 'error' | 'info'
interface Toast { id: number; message: string; tone: Tone }
const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const notify = useCallback((message: string, tone: Tone = 'success') => {
    const id = Date.now()
    setToasts(current => [...current, { id, message, tone }])
    window.setTimeout(() => setToasts(current => current.filter(toast => toast.id !== id)), 4500)
  }, [])
  return <ToastContext.Provider value={notify}>
    {children}
    <div className="toast-stack" aria-live="polite">
      {toasts.map(toast => <div key={toast.id} className={`toast toast-${toast.tone}`}>
        {toast.tone === 'success' ? <CheckCircle2 size={19} /> : toast.tone === 'error' ? <CircleAlert size={19} /> : <Info size={19} />}
        <span>{toast.message}</span>
        <button onClick={() => setToasts(current => current.filter(item => item.id !== toast.id))} aria-label="Fechar"><X size={16} /></button>
      </div>)}
    </div>
  </ToastContext.Provider>
}

export const useToast = () => useContext(ToastContext)
