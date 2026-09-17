import { ClipboardCheck, Gauge, LogOut, Menu, Package, ReceiptText, Settings, ShoppingBag, Truck, X } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { Logo, ThemeToggle } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'
import { initials } from '../utils/format'

const links = [
  ['/admin', 'Visão geral', Gauge],
  ['/admin/produtos', 'Produtos', ShoppingBag],
  ['/admin/pedidos', 'Pedidos', Package],
  ['/admin/pagamentos', 'Pagamentos', ReceiptText],
  ['/admin/lotes', 'Lotes', ClipboardCheck],
  ['/admin/entregas', 'Entregas', Truck],
  ['/admin/configuracoes', 'Configurações', Settings],
] as const

export function AdminLayout() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)

  return (
    <div className="admin-shell">
      <aside className={open ? 'admin-sidebar open' : 'admin-sidebar'}>
        <div className="sidebar-head">
          <Link to="/admin" aria-label="Painel Inicial">
            <Logo />
          </Link>
          <button className="icon-btn sidebar-close" onClick={() => setOpen(false)} aria-label="Fechar menu">
            <X size={18} />
          </button>
        </div>
        <div className="admin-tag">Painel Administrativo</div>
        <nav className="admin-nav" onClick={() => setOpen(false)}>
          {links.map(([path, label, Icon], index) => (
            <NavLink key={path} to={path} end={index === 0}>
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link to="/" className="sidebar-store-link">
            ← Voltar para a loja
          </Link>
          <button onClick={logout} className="sidebar-logout-btn">
            <LogOut size={15} /> Sair da conta
          </button>
        </div>
      </aside>

      {open && <div className="sidebar-overlay" onClick={() => setOpen(false)} />}

      <div className="admin-main">
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            <button className="mobile-menu" onClick={() => setOpen(true)} aria-label="Abrir menu">
              <Menu size={22} />
            </button>
            <div className="admin-context-pill">
              <span className="live-indicator" />
              <span>Painel de Gestão</span>
            </div>
          </div>

          <div className="admin-topbar-right">
            <ThemeToggle className="admin-theme-toggle" />
            <div className="admin-profile-box">
              <div className="avatar" title={user?.fullName}>{initials(user?.fullName)}</div>
              <div className="admin-profile-details">
                <strong>{user?.fullName || 'Administrador'}</strong>
                <small>Diretoria Corsa CWB</small>
              </div>
            </div>
          </div>
        </header>

        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
