import {
  ArrowRight,
  Ban,
  Check,
  ChevronRight,
  Clock,
  Copy,
  Flame,
  Minus,
  Package,
  PackageCheck,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Trash2,
  Truck,
  UploadCloud,
} from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Empty, ErrorState, Field, Loading, Modal, PageHeader, Pagination, ProductImage, StatusBadge } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'
import { useCart } from '../contexts/CartContext'
import { useToast } from '../contexts/ToastContext'
import { useApi } from '../hooks/useApi'
import { api } from '../services/api'
import type { Category, OrderDetail, OrderHistory, OrderSummary, PagedResult, PixSettings, ProductDetail, ProductSummary } from '../types'
import { currency, dateTime, errorMessage, labelStatus } from '../utils/format'

/* =========================================================
   COMPONENTE DE CARD DE PRODUTO (VISUAL E-COMMERCE)
   ========================================================= */
function ProductCard({ product }: { product: ProductSummary }) {
  return (
    <Link className="product-card" to={`/produtos/${product.id}`} aria-label={product.name}>
      <div className="product-card-image">
        <ProductImage photoId={product.photo?.id} alt={product.name} />
        {product.isAvailable === false ? (
          <span className="badge badge-danger" style={{ position: 'absolute', top: 12, left: 12 }}>
            Indisponível
          </span>
        ) : (
          <span className="badge badge-warning" style={{ position: 'absolute', top: 12, left: 12 }}>
            <Flame size={12} /> Oficial CWB
          </span>
        )}
      </div>
      <div className="product-card-body">
        <span className="product-category">Vestuário & Colecionáveis</span>
        <h3>{product.name}</h3>
        <p>{product.description || 'Produto oficial confeccionado em lote para os associados do Clube do Corsa CWB.'}</p>
        <div className="product-footer-row">
          <div className="price-display">
            <b>{currency(product.basePrice)}</b>
            {product.discounts?.length ? (
              <small className="discount-hint">
                {product.discounts[0].minimumQuantity}+ peças: menos {currency(product.discounts[0].discountPerUnit)} por unidade
              </small>
            ) : <small>via Pix no lote</small>}
          </div>
          <span className="product-action-badge">
            Ver detalhes <ChevronRight size={15} />
          </span>
        </div>
      </div>
    </Link>
  )
}

/* =========================================================
   PÁGINA INICIAL (HOME)
   ========================================================= */
export function HomePage() {
  const { user } = useAuth()
  const { data, loading } = useApi(() => api.get<PagedResult<ProductSummary>>('/products?page=1&pageSize=8'), [])

  return (
    <div className="home-container">
      {/* Hero Banner Automotivo */}
      <section className="hero-automotive">
        <div className="hero-container">
          <div className="hero-left">
            <div className="hero-pill-badge">
              <Sparkles size={14} /> Clube do Corsa CWB • Loja Oficial
            </div>
            <h1 className="hero-title">
              VISTA A PAIXÃO <em>PELO SEU CORSA</em>
            </h1>
            <div className="hero-cta-row">
              <Link className="btn btn-primary" to="/produtos">
                Explorar Catálogo <ArrowRight size={18} />
              </Link>
              <Link className="btn btn-secondary" to="/pedidos">
                Meus Pedidos
              </Link>
            </div>
          </div>

          <div className="hero-visual-card">
            <div className="hero-card-frame">
              <div className="hero-card-tag">
                <span className="badge badge-success">
                  <Flame size={12} /> Produção Ativa
                </span>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--orange)', fontWeight: 700, textTransform: 'uppercase' }}>
                  Bem-vindo à garagem,
                </span>
                <h3>{user?.fullName?.split(' ')[0] || 'Associado'}!</h3>
              </div>
              <p>
                Garanta suas peças antes do fechamento do próximo lote para retirada presencial no encontro oficial.
              </p>
              <div className="hero-card-highlights">
                <div><Check size={16} color="var(--orange)" /> Pedidos centralizados via Pix</div>
                <div><Check size={16} color="var(--orange)" /> Retirada combinada</div>
                <div><Check size={16} color="var(--orange)" /> Tecido e estampa de alta durabilidade</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Grid de Benefícios */}
      <section className="content-section" style={{ paddingBottom: 0 }}>
        <div className="benefits-grid">
          <div className="benefit-item">
            <div className="benefit-icon-wrap"><ShieldCheck size={24} /></div>
            <div>
              <b>Exclusivo do Clube</b>
              <small>Itens oficiais feitos sob medida para a nossa comunidade.</small>
            </div>
          </div>
          <div className="benefit-item">
            <div className="benefit-icon-wrap"><ShoppingBag size={24} /></div>
            <div>
              <b>Produção em Lote</b>
              <small>Economia coletiva garantindo máxima qualidade e menor custo.</small>
            </div>
          </div>
          <div className="benefit-item">
            <div className="benefit-icon-wrap"><Truck size={24} /></div>
            <div>
              <b>Retirada nos Encontros</b>
              <small>Pegue em mãos nos encontros mensais sem pagar frete.</small>
            </div>
          </div>
          <div className="benefit-item">
            <div className="benefit-icon-wrap"><Sparkles size={24} /></div>
            <div>
              <b>Pagamento Seguro</b>
              <small>Validação instantânea via Pix com comprovante auditado.</small>
            </div>
          </div>
        </div>

        {/* Guia: Como funciona a compra por lotes */}
        <div className="how-it-works-panel">
          <div className="section-header-centered">
            <span className="eyebrow">Etapas Simples</span>
            <h2>Como Funciona a Compra na Lojinha</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem' }}>
              Para garantir os melhores preços de fábrica aos membros, trabalhamos com remessas de produção fechadas.
            </p>
          </div>

          <div className="steps-grid">
            <div className="step-card">
              <span className="step-number">1</span>
              <h4>Escolha sua Peça</h4>
              <p>Selecione modelos, cores e seus tamanhos na vitrine oficial.</p>
            </div>
            <div className="step-card">
              <span className="step-number">2</span>
              <h4>Pague via Pix</h4>
              <p>Envie o Pix e anexe o comprovante direto na plataforma.</p>
            </div>
            <div className="step-card">
              <span className="step-number">3</span>
              <h4>Lote & Produção</h4>
              <p>A diretoria fecha o lote e envia para a confecção homologada.</p>
            </div>
            <div className="step-card">
              <span className="step-number">4</span>
              <h4>Retire no Encontro</h4>
              <p>Avisamos quando estiver pronto para retirada.</p>
            </div>
          </div>
        </div>

        {/* Vitrine de Destaques */}
        <div style={{ marginTop: 40, marginBottom: 40 }}>
          <PageHeader
            eyebrow="Catálogo"
            title="Destaques da Garagem"
            description="Peças mais procuradas pelos membros do clube."
            actions={
              <Link to="/produtos" className="btn btn-secondary">
                Ver todos os produtos <ArrowRight size={16} />
              </Link>
            }
          />
          {loading ? (
            <Loading label="Carregando produtos..." />
          ) : !data?.items.length ? (
            <Empty title="Nenhum produto cadastrado" description="Novos produtos serão anunciados em breve." />
          ) : (
            <div className="product-grid">
              {data.items.map(product => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

/* =========================================================
   CATÁLOGO DE PRODUTOS
   ========================================================= */
export function ProductsPage() {
  const [params, setParams] = useSearchParams()
  const search = params.get('busca') || ''
  const categoryId = params.get('categoria') || ''
  const page = Number(params.get('pagina') || 1)
  const [term, setTerm] = useState(search)

  const categories = useApi(() => api.get<Category[]>('/categories'), [])
  const products = useApi(
    () =>
      api.get<PagedResult<ProductSummary>>(
        `/products?search=${encodeURIComponent(search)}&categoryId=${categoryId}&page=${page}&pageSize=12`
      ),
    [search, categoryId, page]
  )

  const update = (values: Record<string, string>) => {
    const next = new URLSearchParams(params)
    Object.entries(values).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)))
    setParams(next)
  }

  return (
    <main className="content-section page">
      <PageHeader
        eyebrow="Vitrine Oficial"
        title="Catálogo de Produtos"
        description="Confira todas as peças e colecionáveis disponíveis para produção."
      />

      <div className="catalog-toolbar">
        <form
          className="search-box"
          onSubmit={e => {
            e.preventDefault()
            update({ busca: term, pagina: '1' })
          }}
        >
          <Search />
          <input
            value={term}
            onChange={e => setTerm(e.target.value)}
            placeholder="Buscar por nome ou descrição..."
          />
          <button type="submit">Buscar</button>
        </form>

        <select value={categoryId} onChange={e => update({ categoria: e.target.value, pagina: '1' })}>
          <option value="">Todas as Categorias</option>
          {categories.data?.map(category => (
            <option value={category.id} key={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      {products.loading ? (
        <Loading label="Buscando produtos no catálogo..." />
      ) : products.error ? (
        <ErrorState message={products.error} retry={products.reload} />
      ) : products.data?.items.length ? (
        <>
          <div className="product-grid">
            {products.data.items.map(product => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
          <Pagination
            page={page}
            totalPages={products.data.totalPages}
            onChange={value => update({ pagina: String(value) })}
          />
        </>
      ) : (
        <Empty
          title="Nenhum produto encontrado"
          description="Tente limpar a busca ou selecionar outra categoria."
        />
      )}
    </main>
  )
}

/* =========================================================
   DETALHE DO PRODUTO (PRODUCT DETAIL)
   ========================================================= */
export function ProductDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const cart = useCart()
  const notify = useToast()

  const { data: product, loading, error, reload } = useApi(() => api.get<ProductDetail>(`/products/${id}`), [id])
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [quantity, setQuantity] = useState(1)
  const [photo, setPhoto] = useState<string>()

  useEffect(() => {
    if (product) {
      setPhoto(product.photos.find(item => item.isPrimary)?.id || product.photos[0]?.id)
      const defaults: Record<string, string> = {}
      product.attributes.forEach(attr => {
        if (attr.values[0]) defaults[attr.id] = attr.values[0].id
      })
      setSelected(defaults)
    }
  }, [product])

  const variation = useMemo(() => {
    if (!product) return undefined
    if (product.attributes.length === 0) {
      return product.variations.find(item => item.attributes.length === 0) || product.variations[0]
    }
    return product.variations.find(item =>
      item.attributes.length > 0 &&
      item.attributes.every(attr => selected[attr.attributeDefinitionId] === attr.attributeValueId)
    )
  }, [product, selected])

  const activeDiscount = [...(product?.discounts || [])]
    .filter(rule => quantity >= rule.minimumQuantity)
    .sort((a, b) => b.minimumQuantity - a.minimumQuantity)[0]
  const originalPrice = variation?.price ?? product?.basePrice ?? 0
  const effectivePrice = Math.max(0, originalPrice - (activeDiscount?.discountPerUnit || 0))

  if (loading) return <main className="content-section page"><Loading label="Carregando detalhes..." /></main>
  if (error || !product) return <main className="content-section page"><ErrorState message={error || 'Produto não encontrado.'} retry={reload} /></main>

  const add = (goToCart = false) => {
    if (!variation) return notify('Escolha uma combinação disponível.', 'error')
    cart.add({
      productId: product.id,
      productName: product.name,
      photoId: photo,
      variationId: variation.id,
      variationName: variation.displayName,
      unitPrice: variation.price,
      quantity,
      discounts: product.discounts || []
    })
    notify('Produto adicionado ao seu carrinho!')
    if (goToCart) navigate('/carrinho')
  }

  return (
    <main className="content-section page">
      <div className="breadcrumbs">
        <Link to="/produtos">Catálogo</Link>
        <ChevronRight size={14} />
        <span>{product.name}</span>
      </div>

      <div className="product-detail">
        <section className="gallery">
          <div className="gallery-main">
            <ProductImage photoId={photo} alt={product.name} />
          </div>
          {product.photos.length > 1 && (
            <div className="thumbnails">
              {product.photos.map(item => (
                <button
                  key={item.id}
                  className={photo === item.id ? 'active' : ''}
                  onClick={() => setPhoto(item.id)}
                  type="button"
                >
                  <ProductImage photoId={item.id} alt={item.altText || product.name} />
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="product-info">
          <span className="eyebrow">{product.category?.name || 'Edição Oficial Corsa CWB'}</span>
          <h1>{product.name}</h1>
          <p className="product-description">{product.description || 'Produto oficial de alta durabilidade.'}</p>

          <div className="detail-price">
            {activeDiscount && <del>{currency(originalPrice)}</del>}
            {currency(effectivePrice)}
            <small>• Pagamento via Pix com liberação no lote</small>
          </div>

          {!!product.discounts?.length && (
            <div className="quantity-discounts">
              <b>Desconto por quantidade</b>
              {product.discounts.map(rule => (
                <span className={quantity >= rule.minimumQuantity ? 'active' : ''} key={rule.id}>
                  A partir de {rule.minimumQuantity} peças: {currency(rule.discountPerUnit)} de desconto em cada unidade
                </span>
              ))}
            </div>
          )}

          {/* Seletores de Atributos / Variações */}
          {product.attributes.map(attribute => (
            <div className="option-group" key={attribute.id}>
              <label>Escolha o {attribute.name}:</label>
              <div className="option-list">
                {attribute.values.map(value => (
                  <button
                    type="button"
                    className={selected[attribute.id] === value.id ? 'selected' : ''}
                    key={value.id}
                    disabled={!value.isActive}
                    onClick={() => setSelected({ ...selected, [attribute.id]: value.id })}
                  >
                    {selected[attribute.id] === value.id && <Check size={16} />}
                    {value.value}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Quantidade */}
          <div className="quantity-row">
            <label>Quantidade desejada:</label>
            <div className="stepper">
              <button type="button" onClick={() => setQuantity(Math.max(1, quantity - 1))}>
                <Minus size={16} />
              </button>
              <span>{quantity}</span>
              <button type="button" onClick={() => setQuantity(quantity + 1)}>
                <Plus size={16} />
              </button>
            </div>
          </div>

          {!variation && product.variations.length > 0 && (
            <div className="badge badge-warning" style={{ padding: 12, borderRadius: 10, width: '100%', marginBottom: 15 }}>
              Essa combinação de variações não está disponível no momento.
            </div>
          )}

          <div className="buy-actions">
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              disabled={!product.isAvailable || !variation}
              onClick={() => add(false)}
            >
              <ShoppingCart size={18} /> Adicionar ao Carrinho
            </button>
            <button
              className="btn btn-secondary"
              disabled={!product.isAvailable || !variation}
              onClick={() => add(true)}
            >
              Comprar Agora
            </button>
          </div>

          <div className="safe-note">
            <ShieldCheck size={22} />
            <div>
              <b>Garantia do Clube do Corsa CWB</b>
              <small>Retirada confirmada nos encontros oficiais após a aprovação do seu pagamento via Pix.</small>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

/* =========================================================
   CARRINHO DE COMPRAS (CART)
   ========================================================= */
export function CartPage() {
  const cart = useCart()

  return (
    <main className="content-section page">
      <PageHeader
        eyebrow="Checkout"
        title="Meu Carrinho"
        description={`${cart.itemCount} ${cart.itemCount === 1 ? 'item selecionado' : 'itens selecionados'}`}
      />

      {!cart.items.length ? (
        <Empty
          title="Seu carrinho está vazio"
          description="Navegue pela vitrine para escolher suas peças do clube."
          icon={<ShoppingCart size={40} />}
        />
      ) : (
        <div className="cart-layout">
          <section className="cart-list">
            {cart.items.map(item => (
              <article className="cart-item" key={item.variationId}>
                <ProductImage photoId={item.photoId} alt={item.productName} />
                <div className="cart-copy">
                  <Link to={`/produtos/${item.productId}`}>{item.productName}</Link>
                  <span>{item.variationName}</span>
                  <b>{currency(cart.unitPrice(item))}</b>
                  {cart.unitPrice(item) < item.unitPrice && <small><del>{currency(item.unitPrice)}</del> com desconto por quantidade</small>}
                </div>
                <div className="stepper">
                  <button type="button" onClick={() => cart.update(item.variationId, item.quantity - 1)}>
                    <Minus size={14} />
                  </button>
                  <span>{item.quantity}</span>
                  <button type="button" onClick={() => cart.update(item.variationId, item.quantity + 1)}>
                    <Plus size={14} />
                  </button>
                </div>
                <b className="line-total" style={{ color: 'var(--text-main)' }}>
                  {currency(cart.lineTotal(item))}
                </b>
                <button
                  className="icon-btn danger"
                  onClick={() => cart.remove(item.variationId)}
                  aria-label="Remover item"
                >
                  <Trash2 size={18} />
                </button>
              </article>
            ))}
          </section>

          <aside className="order-summary">
            <h2>Resumo da Compra</h2>
            <div>
              <span>Subtotal dos itens</span>
              <b>{currency(cart.subtotal)}</b>
            </div>
            {cart.discountTotal > 0 && <div className="summary-discount"><span>Desconto por quantidade</span><b>− {currency(cart.discountTotal)}</b></div>}
            <div>
              <span>Frete</span>
              <b style={{ color: 'var(--green)' }}>Grátis (Retirada)</b>
            </div>
            <hr />
            <div className="summary-total">
              <span>Total a pagar</span>
              <b>{currency(cart.total)}</b>
            </div>
            <Link className="btn btn-primary btn-block" to="/finalizar">
              Finalizar Pedido <ArrowRight size={18} />
            </Link>
            <Link className="continue-link" to="/produtos">
              ← Continuar escolhendo
            </Link>
          </aside>
        </div>
      )}
    </main>
  )
}

/* =========================================================
   FINALIZAR COMPRA (CHECKOUT)
   ========================================================= */
export function CheckoutPage() {
  const cart = useCart()
  const navigate = useNavigate()
  const notify = useToast()
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  if (!cart.items.length) {
    return (
      <main className="content-section page">
        <Empty title="Seu carrinho está vazio" description="Adicione itens antes de finalizar." />
      </main>
    )
  }

  async function finish() {
    setSaving(true)
    try {
      const order = await api.post<{ id: string; orderNumber: string }>('/orders', {
        items: cart.items.map(item => ({ variationId: item.variationId, quantity: item.quantity })),
        notes
      })
      cart.clear()
      notify(`Pedido #${order.orderNumber} gerado com sucesso!`)
      navigate(`/pedidos/${order.id}?pagamento=1`)
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="content-section page narrow-page">
      <PageHeader
        eyebrow="Última Etapa"
        title="Revisão do Pedido"
        description="Confira seus itens antes de gerar as instruções de pagamento Pix."
      />

      <div className="checkout-card">
        {cart.items.map(item => (
          <div className="checkout-line" key={item.variationId}>
            <span>{item.quantity}×</span>
            <div>
              <b>{item.productName}</b>
              <small>{item.variationName}</small>
            </div>
            <b>{currency(cart.lineTotal(item))}</b>
          </div>
        ))}

        <Field label="Observações de entrega ou detalhes (opcional)">
          <textarea
            rows={3}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Ex.: vou retirar no encontro de sábado, avisar pelo WhatsApp..."
          />
        </Field>

        {cart.discountTotal > 0 && <div className="checkout-discount"><span>Desconto por quantidade</span><b>− {currency(cart.discountTotal)}</b></div>}
        <div className="checkout-total">
          <div>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Valor total via Pix</span>
            <br />
            <b>{currency(cart.total)}</b>
          </div>
          <span className="badge badge-success">Sem taxa de frete</span>
        </div>

        <button
          className="btn btn-primary btn-block"
          disabled={saving}
          onClick={finish}
        >
          {saving ? 'Gerando pedido...' : 'Confirmar Pedido e Ver Chave Pix'}
        </button>
      </div>
    </main>
  )
}

/* =========================================================
   MEUS PEDIDOS (ORDERS LIST)
   ========================================================= */
export function OrdersPage() {
  const [params, setParams] = useSearchParams()
  const status = params.get('status') || ''
  const page = Number(params.get('pagina') || 1)

  const orders = useApi(
    () => api.get<PagedResult<OrderSummary>>(`/orders?status=${status}&page=${page}&pageSize=10`),
    [status, page]
  )

  return (
    <main className="content-section page">
      <PageHeader
        eyebrow="Minha Conta"
        title="Meus Pedidos"
        description="Acompanhe todas as etapas, desde o pagamento até a retirada com a diretoria."
      />

      {/* Filtros por Status */}
      <div className="filter-pills">
        {[
          ['', 'Todos'],
          ['awaiting_payment', 'Aguardando Pagamento'],
          ['awaiting_validation', 'Em Análise'],
          ['payment_confirmed', 'Aprovados'],
          ['in_production', 'Em Produção'],
          ['ready_for_delivery', 'Prontos para Retirada'],
          ['delivered', 'Entregues'],
          ['cancelled', 'Cancelados']
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={status === value ? 'active' : ''}
            onClick={() => setParams(value ? { status: value } : {})}
          >
            {label}
          </button>
        ))}
      </div>

      {orders.loading ? (
        <Loading label="Carregando seus pedidos..." />
      ) : orders.error ? (
        <ErrorState message={orders.error} retry={orders.reload} />
      ) : !orders.data?.items.length ? (
        <Empty
          title="Nenhum pedido encontrado"
          description="Quando você fizer uma compra na lojinha, ela aparecerá aqui."
        />
      ) : (
        <>
          <div className="order-cards">
            {orders.data.items.map(order => (
              <Link to={`/pedidos/${order.id}`} className="order-card" key={order.id}>
                <div>
                  <span>Número</span>
                  <h3>#{order.orderNumber}</h3>
                  <small>{dateTime(order.placedAt)}</small>
                </div>
                <div>
                  <span>Itens</span>
                  <b>{order.itemCount}</b>
                </div>
                <div>
                  <span>Total</span>
                  <b>{currency(order.totalAmount)}</b>
                </div>
                <StatusBadge status={order.statusCode} />
                <ChevronRight size={20} color="var(--text-muted)" />
              </Link>
            ))}
          </div>

          <Pagination
            page={page}
            totalPages={orders.data.totalPages}
            onChange={value => setParams({ ...(status ? { status } : {}), pagina: String(value) })}
          />
        </>
      )}
    </main>
  )
}

/* =========================================================
   DETALHES DO PEDIDO COM RASTREADOR E CANCELAMENTO
   ========================================================= */
export function OrderDetailPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const notify = useToast()

  const order = useApi(() => api.get<OrderDetail>(`/orders/${id}`), [id])
  const history = useApi(() => api.get<OrderHistory[]>(`/orders/${id}/history`), [id])
  const pix = useApi(() => api.get<PixSettings>('/pix'), [])

  const [file, setFile] = useState<File>()
  const [amount, setAmount] = useState('')
  const [uploading, setUploading] = useState(false)

  // Estado para Cancelamento de Pedido
  const [cancelModal, setCancelModal] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)

  if (order.loading) return <main className="content-section page"><Loading label="Carregando pedido..." /></main>
  if (order.error || !order.data) {
    return <main className="content-section page"><ErrorState message={order.error || 'Pedido não encontrado.'} retry={order.reload} /></main>
  }

  const statusCode = order.data.statusCode
  const isCancelled = statusCode === 'cancelled'
  const isDelivered = statusCode === 'delivered'
  const canPay = /(awaiting_payment|receipt_rejected)/i.test(statusCode)
  const canCancel = ['awaiting_payment', 'awaiting_validation', 'receipt_rejected'].includes(statusCode)

  // Upload de Comprovante
  async function upload(event: FormEvent) {
    event.preventDefault()
    if (!file) return notify('Selecione o arquivo do comprovante.', 'error')
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      if (amount) form.append('reportedAmount', amount.replace(',', '.'))
      await api.upload(`/orders/${id}/receipts`, form)
      notify('Comprovante enviado com sucesso!')
      setFile(undefined)
      await order.reload()
      await history.reload()
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      setUploading(false)
    }
  }

  // Cancelamento de Pedido pelo Membro
  async function confirmCancel() {
    setCancelling(true)
    try {
      await api.post(`/orders/${id}/cancel`, { reason: cancelReason })
      notify('Pedido cancelado com sucesso.', 'info')
      setCancelModal(false)
      setCancelReason('')
      await order.reload()
      await history.reload()
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      setCancelling(false)
    }
  }

  // Determina índice para o Stepper de Progresso
  const getStepIndex = (code: string) => {
    switch (code) {
      case 'awaiting_payment':
      case 'awaiting_validation':
      case 'receipt_rejected':
        return 0
      case 'payment_confirmed':
      case 'awaiting_batch':
        return 1
      case 'included_in_batch':
      case 'in_production':
      case 'production_completed':
        return 2
      case 'ready_for_delivery':
        return 3
      case 'delivered':
        return 4
      default:
        return 0
    }
  }
  const currentStep = getStepIndex(statusCode)

  return (
    <main className="content-section page">
      <div className="breadcrumbs">
        <Link to="/pedidos">Meus Pedidos</Link>
        <ChevronRight size={14} />
        <span>Pedido #{order.data.orderNumber}</span>
      </div>

      <PageHeader
        eyebrow="Acompanhamento"
        title={`Pedido #${order.data.orderNumber}`}
        description={`Realizado em ${dateTime(order.data.placedAt)}`}
        actions={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <StatusBadge status={order.data.statusCode} />
            {canCancel && (
              <button
                type="button"
                className="btn btn-danger btn-small"
                onClick={() => setCancelModal(true)}
              >
                <Ban size={15} /> Cancelar pedido
              </button>
            )}
          </div>
        }
      />

      {/* Stepper Visual de Progresso */}
      {!isCancelled ? (
        <div className="order-progress-stepper">
          <div className="stepper-steps-track">
            {[
              { label: 'Pagamento', icon: <Clock size={16} /> },
              { label: 'Aprovado', icon: <Check size={16} /> },
              { label: 'Em Produção', icon: <Package size={16} /> },
              { label: 'Pronto p/ Retirada', icon: <Truck size={16} /> },
              { label: 'Entregue', icon: <PackageCheck size={16} /> }
            ].map((step, idx) => {
              const isDone = currentStep > idx || (idx === 4 && isDelivered)
              const isActive = currentStep === idx && !isDelivered
              return (
                <div
                  key={step.label}
                  className={`step-item ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`}
                >
                  <div className="step-circle">{step.icon}</div>
                  <span>{step.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="alert alert-error" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <Ban size={20} />
          <div>
            <b>Este pedido foi cancelado.</b>
            <small style={{ display: 'block' }}>Nenhuma cobrança ou remessa de produção será realizada.</small>
          </div>
        </div>
      )}

      <div className="order-detail-grid">
        <section>
          {/* Itens do Pedido */}
          <div className="panel">
            <h2>Itens do Pedido</h2>
            {order.data.items.map(item => (
              <div className="detail-item" key={item.id}>
                <div>
                  <b style={{ color: 'var(--text-main)', fontSize: '1.05rem' }}>{item.productNameSnapshot}</b>
                  <span style={{ color: 'var(--orange)', fontWeight: 600 }}>{item.variationNameSnapshot}</span>
                  <small>{item.quantity} × {currency(item.unitPrice)}</small>
                </div>
                <b style={{ color: 'var(--text-main)', fontSize: '1.1rem' }}>{currency(item.subtotal)}</b>
              </div>
            ))}
            <div className="panel-total">
              <span>Total do Pedido</span>
              <b>{currency(order.data.totalAmount)}</b>
            </div>
          </div>

          {/* Histórico e Linha do Tempo */}
          <div className="panel timeline-panel">
            <h2>Linha do Tempo</h2>
            {history.loading ? (
              <Loading label="Carregando histórico..." />
            ) : (
              <div className="timeline">
                {history.data?.map((item, index) => (
                  <div className="timeline-item" key={item.id || index}>
                    <span className="timeline-dot" />
                    <div>
                      <b style={{ color: 'var(--text-main)' }}>
                        {labelStatus((item as any).newStatusCode || item.statusCode)}
                      </b>
                      <small>
                        {dateTime((item as any).changedAt || item.createdAt)}
                        {item.changedByName ? ` • ${item.changedByName}` : ''}
                      </small>
                      {item.notes && <p>{item.notes}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <aside>
          {/* Painel de Pagamento Pix */}
          {canPay && !isCancelled && (
            <div className={`panel payment-panel ${params.has('pagamento') ? 'highlight' : ''}`}>
              <span className="eyebrow">Aguardando Pagamento</span>
              <h2>Pague via Pix</h2>

              {pix.data ? (
                <>
                  <div className="pix-key">
                    <div>
                      <small style={{ color: 'var(--text-muted)' }}>Chave Pix ({pix.data.keyType.toUpperCase()}):</small>
                      <b>{pix.data.pixKey}</b>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(pix.data!.pixKey)
                        notify('Chave Pix copiada para a área de transferência!')
                      }}
                      title="Copiar chave Pix"
                    >
                      <Copy size={18} />
                    </button>
                  </div>
                  <p style={{ marginTop: 12, marginBottom: 4, color: 'var(--text-secondary)' }}>
                    Beneficiário: <b>{pix.data.beneficiaryName}</b>
                    {pix.data.beneficiaryCity && ` • ${pix.data.beneficiaryCity}`}
                  </p>
                  {pix.data.instructions && (
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      {pix.data.instructions}
                    </p>
                  )}
                </>
              ) : (
                <Loading label="Carregando dados Pix..." />
              )}

              <form className="upload-form" onSubmit={upload}>
                <Field label="Valor transferido (opcional):">
                  <input
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder={order.data.totalAmount.toFixed(2).replace('.', ',')}
                  />
                </Field>

                <label className="file-drop">
                  <UploadCloud size={30} />
                  <b>{file ? file.name : 'Clique para selecionar o comprovante'}</b>
                  <small>Aceita Imagem (JPG, PNG) ou PDF</small>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={e => setFile(e.target.files?.[0])}
                  />
                </label>

                <button
                  type="submit"
                  className="btn btn-primary btn-block"
                  disabled={uploading}
                >
                  {uploading
                    ? 'Enviando comprovante...'
                    : order.data.receipts.length
                    ? 'Reenviar Novo Comprovante'
                    : 'Enviar Comprovante'}
                </button>
              </form>
            </div>
          )}

          {/* Comprovantes Enviados */}
          {order.data.receipts.length > 0 && (
            <div className="panel">
              <h2>Comprovantes</h2>
              {order.data.receipts.map(receipt => (
                <div className="receipt" key={receipt.id}>
                  <div>
                    <b>Envio #{receipt.sequenceNumber}</b>
                    <small>{dateTime(receipt.submittedAt)}</small>
                  </div>
                  <StatusBadge status={receipt.statusCode} />
                  {receipt.rejectionDetails && (
                    <div className="rejection">
                      <b>Motivo da Recusa:</b>
                      <p>{receipt.rejectionDetails}</p>
                      {receipt.reviewedAt && (
                        <small>Analisado em {dateTime(receipt.reviewedAt)}</small>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      {/* Modal de Cancelamento de Pedido */}
      {cancelModal && (
        <Modal title="Confirmar Cancelamento do Pedido" onClose={() => setCancelModal(false)}>
          <p style={{ color: 'var(--text-secondary)' }}>
            Tem certeza que deseja cancelar o <b>Pedido #{order.data.orderNumber}</b>?
          </p>
          <Field label="Motivo do cancelamento (opcional):">
            <textarea
              rows={3}
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              placeholder="Ex.: desisti da compra, escolhi o tamanho errado..."
            />
          </Field>
          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setCancelModal(false)}
              disabled={cancelling}
            >
              Voltar
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={confirmCancel}
              disabled={cancelling}
            >
              {cancelling ? 'Cancelando...' : 'Confirmar Cancelamento'}
            </button>
          </div>
        </Modal>
      )}
    </main>
  )
}
