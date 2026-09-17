import { CheckCircle2, PackageCheck, ShieldCheck } from 'lucide-react'
import { Link, Outlet } from 'react-router-dom'
import { Logo, ThemeToggle } from '../components/ui'

export function PublicLayout() {
  return (
    <main className="auth-shell">
      <aside className="auth-brand">
        <div className="auth-brand-header">
          <Logo />
          <span className="auth-brand-tag">Loja oficial</span>
        </div>

        <div className="auth-brand-copy">
          <span className="eyebrow">Clube do Corsa CWB</span>
          <h1>Feito para quem leva a paixão no peito.</h1>
          <p>Uma experiência simples para escolher produtos, acompanhar pedidos e fazer parte da comunidade.</p>

          <div className="auth-benefits" aria-label="Benefícios da loja">
            <span><PackageCheck size={18} /> Pedidos organizados</span>
            <span><ShieldCheck size={18} /> Pagamento acompanhado</span>
            <span><CheckCircle2 size={18} /> Atualizações em cada etapa</span>
          </div>
        </div>

        <p className="auth-brand-footer">Produtos oficiais feitos para membros do clube.</p>
        <div className="road-lines" aria-hidden="true" />
      </aside>

      <section className="auth-panel">
        <div className="auth-panel-header">
          <Link className="auth-mobile-logo" to="/" aria-label="Ir para a página inicial"><Logo /></Link>
          <ThemeToggle />
        </div>
        <div className="auth-panel-content"><Outlet /></div>
      </section>
    </main>
  )
}
