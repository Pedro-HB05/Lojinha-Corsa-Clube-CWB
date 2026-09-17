import { Flame, LogOut, Menu, Package, ShieldCheck, ShoppingBag, ShoppingCart, Sparkles, Truck, X } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { Logo, ThemeToggle } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'
import { useCart } from '../contexts/CartContext'
import { initials } from '../utils/format'

export function MemberLayout() {
  const { user, logout, hasRole } = useAuth()
  const { itemCount, total } = useCart()
  const [open, setOpen] = useState(false)

  return (
    <div className="member-shell">
      {/* Barra de Anúncio Superior */}
      <aside className="announcement-bar">
        <div className="announcement-content">
          <span>
            <Flame size={15} /> <strong>Lojinha Oficial Corsa CWB</strong> • Produtos e vestuário exclusivos para membros
          </span>
          <span className="announcement-badge">
            <Truck size={14} /> Retirada gratuita nos encontros
          </span>
        </div>
      </aside>

      {/* Header Principal de E-Commerce */}
      <header className="store-header">
        <div className="header-container">
          <Link to="/" className="brand-link" aria-label="Página Inicial">
            <Logo />
          </Link>

          <button
            className="mobile-menu"
            onClick={() => setOpen(!open)}
            aria-label="Menu principal"
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>

          <nav className={open ? 'nav-menu open' : 'nav-menu'} onClick={() => setOpen(false)}>
            <NavLink to="/produtos" className={({ isActive }) => (isActive ? 'active' : '')}>
              <ShoppingBag size={18} /> Vitrine
            </NavLink>
            <NavLink to="/pedidos" className={({ isActive }) => (isActive ? 'active' : '')}>
              <Package size={18} /> Meus Pedidos
            </NavLink>
            {hasRole('administrator') && (
              <NavLink to="/admin" className="admin-shortcut">
                <Sparkles size={16} /> Painel Admin
              </NavLink>
            )}
          </nav>

          <div className="header-actions-group">
            <ThemeToggle className="header-theme-toggle" />

            <Link to="/carrinho" className="cart-chip" aria-label={`Carrinho com ${itemCount} itens`}>
              <div className="cart-icon-wrap">
                <ShoppingCart size={20} />
                {itemCount > 0 && <span className="cart-count-badge">{itemCount}</span>}
              </div>
              <div className="cart-chip-text">
                <small>Carrinho</small>
                <b>R$ {total.toFixed(2).replace('.', ',')}</b>
              </div>
            </Link>

            {user ? (
              <div className="user-profile-widget">
                <div className="avatar" title={user?.fullName}>{initials(user?.fullName)}</div>
                <div className="user-info-text">
                  <b>{user?.fullName?.split(' ')[0]}</b>
                  <button type="button" onClick={logout} className="logout-btn" title="Encerrar sessão">
                    <LogOut size={12} /> Sair
                  </button>
                </div>
              </div>
            ) : (
              <Link to="/entrar" className="btn btn-primary btn-small" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                Entrar
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="store-main-viewport">
        <Outlet />
      </main>

      {/* Rodapé Completo de E-Commerce */}
      <footer className="store-footer-rich">
        <div className="footer-top-grid">
          <div className="footer-col brand-col">
            <Logo />
            <p>
              A paixão pelo Chevrolet/Opel Corsa em Curitiba e Região. Produtos oficiais produzidos em lotes com acabamento premium para a comunidade.
            </p>
            <div className="trust-pill">
              <ShieldCheck size={18} />
              <span>Loja 100% Autêntica do Clube</span>
            </div>
          </div>

          <div className="footer-col">
            <h4>Navegação</h4>
            <ul>
              <li><Link to="/produtos">Todos os Produtos</Link></li>
              <li><Link to="/pedidos">Acompanhar Pedido</Link></li>
              <li><Link to="/carrinho">Meu Carrinho</Link></li>
              {hasRole('administrator') && <li><Link to="/admin">Área da Diretoria</Link></li>}
            </ul>
          </div>

          <div className="footer-col">
            <h4>Como Funciona</h4>
            <ul>
              <li>1. Escolha suas peças e tamanhos</li>
              <li>2. Pagamento seguro via Pix</li>
              <li>3. Confecção em lote fechado</li>
              <li>4. Entrega em mãos no encontro</li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>Encontros CWB</h4>
            <p className="footer-address">
              <small>Fique atento às datas no grupo oficial do clube.</small>
            </p>
          </div>
        </div>

        <div className="footer-bottom-bar">
          <div className="footer-bottom-content">
            <p>© {new Date().getFullYear()} Clube do Corsa CWB. Todos os direitos reservados.</p>
            <span>Feito para quem leva a paixão na garagem.</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
