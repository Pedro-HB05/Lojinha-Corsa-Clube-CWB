import { AlertCircle, Check, ChevronRight, Eye, Gauge, Package, Pencil, Percent, Plus, ReceiptText, RefreshCw, Search, ShoppingBag, Trash2, Truck, UploadCloud, UserPlus, X } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Empty, ErrorState, Field, Loading, Modal, PageHeader, Pagination, ProductImage, StatusBadge } from '../components/ui'
import { useToast } from '../contexts/ToastContext'
import { useApi } from '../hooks/useApi'
import { api } from '../services/api'
import type { AdministratorSummary, BatchDetail, BatchSummary, DashboardData, OrderDetail, OrderSummary, PagedResult, PendingPayment, PixSettings, ProductDetail, ProductSummary } from '../types'
import { currency, dateTime, errorMessage, labelStatus } from '../utils/format'

function StatCard({ label, value, icon, tone = '' }: { label: string; value: number | string; icon: React.ReactNode; tone?: string }) {
  return <div className={`stat-card ${tone}`}><span className="stat-icon">{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>
}

export function AdminDashboardPage() {
  const dashboard = useApi(() => api.get<DashboardData>('/admin/dashboard'), [])
  if (dashboard.loading) return <Loading />
  if (dashboard.error) return <ErrorState message={dashboard.error} retry={dashboard.reload} />
  const data = dashboard.data || {}
  const pick = (...keys: string[]) => keys.map(key => data[key]).find(value => value !== undefined && value !== null) ?? 0
  return <><PageHeader eyebrow="Visão geral" title="Painel da lojinha" description="Acompanhe o que precisa da sua atenção hoje." /><div className="stats-grid"><StatCard label="Pedidos totais" value={pick('totalOrders', 'ordersCount')} icon={<Package />} /><StatCard label="Pagamentos pendentes" value={pick('pendingPayments', 'pendingPaymentsCount')} icon={<ReceiptText />} tone="orange" /><StatCard label="Prontos para entrega" value={pick('readyForDelivery', 'readyDeliveriesCount')} icon={<Truck />} tone="green" /><StatCard label="Produtos ativos" value={pick('activeProducts', 'productsCount')} icon={<ShoppingBag />} tone="blue" /></div><div className="admin-grid"><section className="panel"><h2>Acesso rápido</h2><div className="quick-actions"><Link to="/admin/pagamentos"><ReceiptText /><span><b>Analisar pagamentos</b><small>Aprovar ou recusar comprovantes</small></span><ChevronRight /></Link><Link to="/admin/lotes"><Package /><span><b>Gerenciar lotes</b><small>Agrupar pedidos para produção</small></span><ChevronRight /></Link><Link to="/admin/entregas"><Truck /><span><b>Registrar entregas</b><small>Pedidos prontos para retirada</small></span><ChevronRight /></Link></div></section><section className="panel dashboard-note"><Gauge /><h2>Operação centralizada</h2><p>Use o menu lateral para gerenciar todo o fluxo da loja, desde o catálogo até a entrega ao associado.</p></section></div></>
}

const KIDS_SIZES = ['02', '04', '06', '08', '10'] as const
const ADULT_SIZES = ['P', 'M', 'G', 'GG'] as const
const PLUS_SIZES = ['G1', 'G2', 'G3', 'G4'] as const

interface SizeGroupState {
  enabled: boolean
  price: string
  sizes: string[]
}

interface SizePricingState {
  mode: 'sized' | 'single'
  singlePrice: string
  kids: SizeGroupState
  adult: SizeGroupState
  plus: SizeGroupState
  customSizes: Array<{ size: string; price: string }>
}

function createInitialSizePricingState(defaultPrice = ''): SizePricingState {
  return {
    mode: 'sized',
    singlePrice: defaultPrice,
    kids: { enabled: true, price: defaultPrice, sizes: [...KIDS_SIZES] },
    adult: { enabled: true, price: defaultPrice, sizes: [...ADULT_SIZES] },
    plus: { enabled: true, price: defaultPrice, sizes: [...PLUS_SIZES] },
    customSizes: []
  }
}

function normalizeSizeLabel(raw: string): string {
  const clean = raw.trim().toUpperCase()
  if (clean === '2') return '02'
  if (clean === '4') return '04'
  if (clean === '6') return '06'
  if (clean === '8') return '08'
  return clean
}

function parseProductToSizePricingState(product: ProductDetail): SizePricingState {
  const baseStr = String(product.basePrice || '')
  const sizeMap = new Map<string, number>()

  for (const v of product.variations || []) {
    if (v.isAvailable === false) continue
    const attrVal = v.attributes?.[0]?.value
    if (attrVal) {
      sizeMap.set(normalizeSizeLabel(attrVal), v.price)
    } else if (v.displayName && v.displayName.toLowerCase() !== 'padrão') {
      const cleaned = v.displayName.replace(/^tamanho\s+/i, '').trim()
      if (cleaned) sizeMap.set(normalizeSizeLabel(cleaned), v.price)
    }
  }

  if (sizeMap.size === 0 && product.attributes?.length) {
    for (const attr of product.attributes) {
      for (const val of attr.values) {
        if (val.isActive) sizeMap.set(normalizeSizeLabel(val.value), product.basePrice)
      }
    }
  }

  if (sizeMap.size === 0) {
    return {
      mode: 'single',
      singlePrice: baseStr,
      kids: { enabled: true, price: baseStr, sizes: [...KIDS_SIZES] },
      adult: { enabled: true, price: baseStr, sizes: [...ADULT_SIZES] },
      plus: { enabled: true, price: baseStr, sizes: [...PLUS_SIZES] },
      customSizes: []
    }
  }

  const kidsMatched = KIDS_SIZES.filter(s => sizeMap.has(s))
  const adultMatched = ADULT_SIZES.filter(s => sizeMap.has(s))
  const plusMatched = PLUS_SIZES.filter(s => sizeMap.has(s))

  const knownSet = new Set<string>([...KIDS_SIZES, ...ADULT_SIZES, ...PLUS_SIZES])
  const customSizes: Array<{ size: string; price: string }> = []
  sizeMap.forEach((price, size) => {
    if (!knownSet.has(size)) {
      customSizes.push({ size, price: String(price) })
    }
  })

  return {
    mode: 'sized',
    singlePrice: baseStr,
    kids: {
      enabled: kidsMatched.length > 0,
      price: kidsMatched.length > 0 ? String(sizeMap.get(kidsMatched[0]) ?? product.basePrice) : baseStr,
      sizes: kidsMatched.length > 0 ? [...kidsMatched] : [...KIDS_SIZES]
    },
    adult: {
      enabled: adultMatched.length > 0,
      price: adultMatched.length > 0 ? String(sizeMap.get(adultMatched[0]) ?? product.basePrice) : baseStr,
      sizes: adultMatched.length > 0 ? [...adultMatched] : [...ADULT_SIZES]
    },
    plus: {
      enabled: plusMatched.length > 0,
      price: plusMatched.length > 0 ? String(sizeMap.get(plusMatched[0]) ?? product.basePrice) : baseStr,
      sizes: plusMatched.length > 0 ? [...plusMatched] : [...PLUS_SIZES]
    },
    customSizes
  }
}

function buildSizesPayload(state: SizePricingState): {
  basePrice: number
  sizes: Array<{ size: string; price: number }>
  error?: string
} {
  if (state.mode === 'single') {
    const p = Number(state.singlePrice)
    if (isNaN(p) || p <= 0) {
      return { basePrice: 0, sizes: [], error: 'Informe um preço válido maior que zero (mínimo R$ 0,01).' }
    }
    return { basePrice: p, sizes: [] }
  }

  const sizes: Array<{ size: string; price: number }> = []

  if (state.kids.enabled && state.kids.sizes.length > 0) {
    const p = Number(state.kids.price)
    if (isNaN(p) || p <= 0) {
      return { basePrice: 0, sizes: [], error: 'Informe o preço para os tamanhos Infantis (02 ao 10).' }
    }
    for (const s of KIDS_SIZES) {
      if (state.kids.sizes.includes(s)) sizes.push({ size: s, price: p })
    }
  }

  if (state.adult.enabled && state.adult.sizes.length > 0) {
    const p = Number(state.adult.price)
    if (isNaN(p) || p <= 0) {
      return { basePrice: 0, sizes: [], error: 'Informe o preço para os tamanhos P ao GG.' }
    }
    for (const s of ADULT_SIZES) {
      if (state.adult.sizes.includes(s)) sizes.push({ size: s, price: p })
    }
  }

  if (state.plus.enabled && state.plus.sizes.length > 0) {
    const p = Number(state.plus.price)
    if (isNaN(p) || p <= 0) {
      return { basePrice: 0, sizes: [], error: 'Informe o preço para os tamanhos G1 ao G4.' }
    }
    for (const s of PLUS_SIZES) {
      if (state.plus.sizes.includes(s)) sizes.push({ size: s, price: p })
    }
  }

  for (const custom of state.customSizes) {
    const label = custom.size.trim()
    if (!label) continue
    const p = Number(custom.price)
    if (isNaN(p) || p <= 0) {
      return { basePrice: 0, sizes: [], error: `Informe um preço válido para o tamanho "${label}".` }
    }
    sizes.push({ size: label, price: p })
  }

  if (sizes.length === 0) {
    return {
      basePrice: 0,
      sizes: [],
      error: 'Ative pelo menos uma faixa de tamanho (ex.: 02 a 10, P a GG ou G1 a G4) ou escolha "Tamanho único".'
    }
  }

  const adultPrice = state.adult.enabled && state.adult.sizes.length > 0 ? Number(state.adult.price) : 0
  const basePrice = adultPrice > 0 ? adultPrice : sizes[0].price

  return { basePrice, sizes }
}

function SizePricingEditor({
  value,
  onChange
}: {
  value: SizePricingState
  onChange: (next: SizePricingState) => void
}) {
  const updateGroup = (key: 'kids' | 'adult' | 'plus', patch: Partial<SizeGroupState>) => {
    onChange({
      ...value,
      [key]: { ...value[key], ...patch }
    })
  }

  const toggleSizeInGroup = (
    key: 'kids' | 'adult' | 'plus',
    allGroupSizes: readonly string[],
    size: string
  ) => {
    const current = value[key].sizes
    const exists = current.includes(size)
    const nextSizes = exists
      ? current.filter(s => s !== size)
      : allGroupSizes.filter(s => current.includes(s) || s === size)
    updateGroup(key, {
      sizes: nextSizes,
      enabled: nextSizes.length > 0
    })
  }

  const renderGroupCard = (
    key: 'kids' | 'adult' | 'plus',
    title: string,
    subtitle: string,
    allSizes: readonly string[],
    placeholderPrice: string
  ) => {
    const group = value[key]
    return (
      <div className={`size-group-card ${group.enabled ? 'active' : 'disabled'}`}>
        <div className="size-group-header">
          <div>
            <b>{title}</b>
            <small>{subtitle}</small>
          </div>
          <label className="size-group-toggle">
            <input
              type="checkbox"
              checked={group.enabled}
              onChange={e =>
                updateGroup(key, {
                  enabled: e.target.checked,
                  sizes: e.target.checked && group.sizes.length === 0 ? [...allSizes] : group.sizes
                })
              }
            />
            <span>{group.enabled ? 'Ativo' : 'Desativado'}</span>
          </label>
        </div>

        {group.enabled && (
          <div className="size-group-body">
            <Field label={`Preço ${title} (R$) *`}>
              <input
                type="number"
                min="0.01"
                step="0.01"
                required={group.enabled}
                value={group.price}
                onChange={e => updateGroup(key, { price: e.target.value })}
                placeholder={placeholderPrice}
              />
            </Field>

            <div className="size-pills-section">
              <div className="size-pills-header">
                <small>Tamanhos disponíveis nesta faixa (clique para marcar/desmarcar):</small>
                {group.sizes.length < allSizes.length && (
                  <button
                    type="button"
                    className="btn-link-xs"
                    onClick={() => updateGroup(key, { sizes: [...allSizes], enabled: true })}
                  >
                    Marcar todos
                  </button>
                )}
              </div>
              <div className="size-pills-row">
                {allSizes.map(size => {
                  const selected = group.sizes.includes(size)
                  return (
                    <button
                      key={size}
                      type="button"
                      className={`size-pill-btn ${selected ? 'selected' : ''}`}
                      onClick={() => toggleSizeInGroup(key, allSizes, size)}
                    >
                      {selected && <Check size={14} />}
                      <span>{size}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="size-pricing-section">
      <div className="size-pricing-header">
        <div>
          <b>Tamanhos e Preços do Produto *</b>
          <small>Configure preços diferentes por faixa de tamanho (Infantil 02 a 10, P ao GG e G1 ao G4) ou use preço único.</small>
        </div>
        <div className="size-mode-switch">
          <button
            type="button"
            className={value.mode === 'sized' ? 'active' : ''}
            onClick={() => onChange({ ...value, mode: 'sized' })}
          >
            Com grade de tamanhos
          </button>
          <button
            type="button"
            className={value.mode === 'single' ? 'active' : ''}
            onClick={() => onChange({ ...value, mode: 'single' })}
          >
            Tamanho único
          </button>
        </div>
      </div>

      {value.mode === 'single' ? (
        <div className="single-price-box">
          <Field label="Preço único do produto (R$) *">
            <input
              required
              min="0.01"
              step="0.01"
              type="number"
              value={value.singlePrice}
              onChange={e => onChange({ ...value, singlePrice: e.target.value })}
              placeholder="Ex.: 49.90"
            />
            <small className="field-hint">Ideal para adesivos, bonés, chaveiros ou itens sem variação de tamanho.</small>
          </Field>
        </div>
      ) : (
        <div className="size-groups-grid">
          {renderGroupCard('kids', 'Infantil (02 ao 10)', 'Tamanhos 02, 04, 06, 08 e 10', KIDS_SIZES, 'Ex.: 39.90')}
          {renderGroupCard('adult', 'Tradicional (P ao GG)', 'Tamanhos P, M, G e GG', ADULT_SIZES, 'Ex.: 49.90')}
          {renderGroupCard('plus', 'Plus Size (G1 ao G4)', 'Tamanhos G1, G2, G3 e G4', PLUS_SIZES, 'Ex.: 59.90')}
        </div>
      )}
    </div>
  )
}

export function AdminProductsPage() {
  const notify = useToast()
  const [active, setActive] = useState('')
  const [search, setSearch] = useState('')
  const [manageId, setManageId] = useState<string>()

  // Criação de novo produto
  const [isCreating, setIsCreating] = useState(false)
  const [newProduct, setNewProduct] = useState({ name: '', description: '' })
  const [newSizePricing, setNewSizePricing] = useState<SizePricingState>(() => createInitialSizePricingState())
  const [newPhotos, setNewPhotos] = useState<Array<{ file: File; preview: string }>>([])
  const [newPhotoError, setNewPhotoError] = useState('')
  const [savingNew, setSavingNew] = useState(false)

  const products = useApi(() => api.get<ProductSummary[]>(`/admin/products?active=${active}`), [active])
  const filtered = (products.data || []).filter(product => product.name.toLowerCase().includes(search.toLowerCase()))

  function isValidImageFile(file: File): boolean {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/x-png', 'image/pjpeg', 'image/jpg']
    if (file.type && validTypes.includes(file.type.toLowerCase())) return true
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    return ['jpg', 'jpeg', 'png', 'webp'].includes(ext)
  }

  function clearNewPhotos() {
    newPhotos.forEach(item => URL.revokeObjectURL(item.preview))
    setNewPhotos([])
  }

  function handleNewPhotosSelect(fileList: FileList | null) {
    setNewPhotoError('')
    if (!fileList || fileList.length === 0) return

    const MAX_SIZE = 5 * 1024 * 1024
    const validAdditions: Array<{ file: File; preview: string }> = []
    const errors: string[] = []

    for (const file of Array.from(fileList)) {
      if (!isValidImageFile(file)) {
        errors.push(`"${file.name}": formato inválido (use JPG, PNG ou WebP).`)
        continue
      }
      if (file.size > MAX_SIZE) {
        const sizeMb = (file.size / (1024 * 1024)).toFixed(2)
        errors.push(`"${file.name}" possui ${sizeMb} MB e ultrapassa o limite de 5 MB.`)
        continue
      }
      const alreadyAdded = newPhotos.some(
        existing =>
          existing.file.name === file.name &&
          existing.file.size === file.size &&
          existing.file.lastModified === file.lastModified
      )
      if (!alreadyAdded) {
        validAdditions.push({ file, preview: URL.createObjectURL(file) })
      }
    }

    if (errors.length > 0) {
      setNewPhotoError(errors.join(' '))
    }
    if (validAdditions.length > 0) {
      setNewPhotos(prev => [...prev, ...validAdditions])
    }
  }

  function removeNewPhoto(index: number) {
    setNewPhotoError('')
    setNewPhotos(prev => {
      const target = prev[index]
      if (target) URL.revokeObjectURL(target.preview)
      return prev.filter((_, i) => i !== index)
    })
  }

  function setPrimaryNewPhoto(index: number) {
    if (index <= 0) return
    setNewPhotos(prev => {
      const target = prev[index]
      if (!target) return prev
      const rest = prev.filter((_, i) => i !== index)
      return [target, ...rest]
    })
  }

  function openCreate() {
    clearNewPhotos()
    setNewProduct({ name: '', description: '' })
    setNewSizePricing(createInitialSizePricingState())
    setNewPhotoError('')
    setIsCreating(true)
  }

  async function handleCreateProduct(event: FormEvent) {
    event.preventDefault()
    const built = buildSizesPayload(newSizePricing)
    if (built.error) {
      notify(built.error, 'error')
      return
    }
    if (newPhotos.length === 0) {
      setNewPhotoError('Selecione pelo menos uma imagem do produto para cadastro.')
      notify('Selecione pelo menos uma imagem para cadastrar o produto.', 'error')
      return
    }

    setSavingNew(true)
    try {
      const form = new FormData()
      form.append('name', newProduct.name.trim())
      form.append('description', newProduct.description.trim())
      form.append('price', String(built.basePrice))
      if (built.sizes.length > 0) {
        form.append('sizesJson', JSON.stringify(built.sizes))
      }
      newPhotos.forEach(item => form.append('photos', item.file))
      await api.upload<{ id: string }>('/admin/products/simple', form)
      notify('Produto cadastrado com sucesso!')
      setIsCreating(false)
      clearNewPhotos()
      await products.reload()
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      setSavingNew(false)
    }
  }

  async function toggle(product: ProductSummary) {
    try {
      await api.patch(`/admin/products/${product.id}/availability`, !(product.isAvailable ?? true))
      notify('Disponibilidade atualizada.')
      await products.reload()
    } catch (error) {
      notify(errorMessage(error), 'error')
    }
  }

  async function deleteProduct(product: ProductSummary) {
    if (!confirm(`Tem certeza que deseja excluir o produto "${product.name}" permanentemente?\n\nEsta ação não poderá ser desfeita.`)) return
    try {
      await api.delete(`/admin/products/${product.id}`)
      notify('Produto excluído com sucesso.')
      await products.reload()
    } catch (error) {
      notify(errorMessage(error), 'error')
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Catálogo"
        title="Produtos"
        description="Preencha os dados básicos, defina os preços por faixa de tamanho e salve."
        actions={<button className="btn btn-primary" onClick={openCreate}><Plus /> Novo produto</button>}
      />
      <div className="admin-toolbar">
        <div className="search-box">
          <Search />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome..."
          />
        </div>
        <select value={active} onChange={e => setActive(e.target.value)}>
          <option value="">Todos</option>
          <option value="true">Disponíveis</option>
          <option value="false">Indisponíveis</option>
        </select>
      </div>

      {products.loading ? (
        <Loading />
      ) : products.error ? (
        <ErrorState message={products.error} retry={products.reload} />
      ) : !filtered.length ? (
        <Empty
          title="Nenhum produto"
          description="Cadastre o primeiro produto da lojinha."
        />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Produto</th>
                <th>Preço base</th>
                <th>Disponibilidade</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(product => (
                <tr key={product.id}>
                  <td>
                    <div className="table-product">
                      <ProductImage photoId={product.photo?.id} alt={product.name} />
                      <div>
                        <b>{product.name}</b>
                        <small>{product.slug}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <b>{currency(product.basePrice)}</b>
                  </td>
                  <td>
                    <button
                      className={`switch ${product.isAvailable !== false ? 'on' : ''}`}
                      onClick={() => toggle(product)}
                      title="Alternar disponibilidade"
                    >
                      <span />
                    </button>
                  </td>
                  <td>
                    <div className="table-actions">
                      <button
                        title="Editar produto e tamanhos"
                        onClick={() => setManageId(product.id)}
                      >
                        <Pencil />
                      </button>
                      <button
                        title="Excluir produto permanentemente"
                        className="danger"
                        onClick={() => deleteProduct(product)}
                      >
                        <Trash2 />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isCreating && (
        <Modal
          title="Novo produto"
          onClose={() => setIsCreating(false)}
          wide
        >
          <form onSubmit={handleCreateProduct}>
            <div className="product-modal-banner">
              Preencha os dados, configure os preços por faixa de tamanho (Infantil 02 a 10, P ao GG e G1 ao G4) e anexe as fotos do produto.
            </div>

            <div className="form-grid">
              <Field label="Nome do produto *">
                <input
                  required
                  value={newProduct.name}
                  onChange={e => setNewProduct({ ...newProduct, name: e.target.value })}
                  placeholder="Ex.: Camiseta Oficial Corsa Clube"
                />
              </Field>

              <Field label="Descrição">
                <textarea
                  rows={2}
                  value={newProduct.description}
                  onChange={e => setNewProduct({ ...newProduct, description: e.target.value })}
                  placeholder="Informações sobre material, medidas ou modelo..."
                />
              </Field>
            </div>

            <SizePricingEditor value={newSizePricing} onChange={setNewSizePricing} />

            {/* Upload de Fotos do Produto */}
            <div className="product-image-section">
              <div className="field-label">
                <b>Fotos do produto * (Pelo menos 1 obrigatória)</b>
                <small>Selecione uma ou mais imagens • Formatos aceitos: JPG, PNG, WebP (máx. 5 MB por foto)</small>
              </div>

              <div className="product-upload-box">
                <input
                  id="product-main-photo-input"
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/x-png,image/pjpeg,image/jpg"
                  style={{ display: 'none' }}
                  onChange={e => {
                    handleNewPhotosSelect(e.target.files)
                    e.target.value = ''
                  }}
                />
                <label htmlFor="product-main-photo-input" className="product-upload-trigger">
                  <UploadCloud size={24} />
                  <span>{newPhotos.length > 0 ? 'Adicionar mais imagens do produto' : 'Selecionar imagens do produto'}</span>
                  <small>Clique para escolher uma ou várias imagens do seu computador</small>
                </label>

                {newPhotos.length > 0 && (
                  <div className="product-photos-selected-wrap">
                    <div className="product-photos-selected-header">
                      <small>
                        <b>{newPhotos.length}</b> {newPhotos.length === 1 ? 'imagem selecionada' : 'imagens selecionadas'}
                      </small>
                      {newPhotos.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-small"
                          onClick={clearNewPhotos}
                        >
                          Remover todas
                        </button>
                      )}
                    </div>

                    <div className="product-photos-preview-grid">
                      {newPhotos.map((item, index) => (
                        <div key={`${item.file.name}-${item.file.lastModified}-${index}`} className="product-photo-preview-box">
                          <img src={item.preview} alt={`Pré-visualização ${index + 1}`} className="product-form-preview" />
                          <div className="preview-meta">
                            <div className="preview-meta-top">
                              <b>{item.file.name}</b>
                              {index === 0 && <span className="badge badge-warning">Capa principal</span>}
                            </div>
                            <small>{(item.file.size / (1024 * 1024)).toFixed(2)} MB</small>
                            <div className="preview-meta-actions">
                              {index > 0 && (
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-small"
                                  onClick={() => setPrimaryNewPhoto(index)}
                                >
                                  Definir como capa
                                </button>
                              )}
                              <button
                                type="button"
                                className="btn btn-ghost btn-small"
                                onClick={() => removeNewPhoto(index)}
                              >
                                Remover
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {newPhotoError && (
                <div className="form-error-banner">
                  <AlertCircle size={18} />
                  <span>{newPhotoError}</span>
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setIsCreating(false)}>
                Cancelar
              </button>
              <button className="btn btn-primary" disabled={savingNew}>
                {savingNew ? 'Salvando...' : 'Cadastrar produto'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {manageId && <ProductManager productId={manageId} onClose={() => { setManageId(undefined); products.reload() }} />}
    </>
  )
}

function ProductManager({ productId, onClose }: { productId: string; onClose(): void }) {
  const notify = useToast()
  const product = useApi(() => api.get<ProductDetail>(`/products/${productId}`), [productId])
  const [tab, setTab] = useState<'general' | 'sizes' | 'photos' | 'discounts'>('general')

  // Estado da aba Dados Gerais
  const [generalForm, setGeneralForm] = useState({ name: '', basePrice: '', description: '', isAvailable: true })
  const [mainPhoto, setMainPhoto] = useState<File | null>(null)
  const [mainPhotoPreview, setMainPhotoPreview] = useState('')
  const [mainPhotoError, setMainPhotoError] = useState('')
  const [savingGeneral, setSavingGeneral] = useState(false)

  // Estado da aba Tamanhos e Preços
  const [sizePricing, setSizePricing] = useState<SizePricingState>(() => createInitialSizePricingState())
  const [savingSizes, setSavingSizes] = useState(false)

  // Estado da aba Fotos
  const [filesToUpload, setFilesToUpload] = useState<Array<{ file: File; preview: string }>>([])
  const [alt, setAlt] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [uploading, setUploading] = useState(false)

  // Estado da aba Descontos
  const [discount, setDiscount] = useState({ minimumQuantity: '2', discountPerUnit: '' })

  useEffect(() => {
    if (product.data) {
      setGeneralForm({
        name: product.data.name,
        basePrice: String(product.data.basePrice),
        description: product.data.description || '',
        isAvailable: product.data.isAvailable !== false
      })
      setSizePricing(parseProductToSizePricingState(product.data))
    }
  }, [product.data])

  function isValidImageFile(f: File): boolean {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/x-png', 'image/pjpeg', 'image/jpg']
    if (f.type && validTypes.includes(f.type.toLowerCase())) return true
    const ext = f.name.split('.').pop()?.toLowerCase() || ''
    return ['jpg', 'jpeg', 'png', 'webp'].includes(ext)
  }

  function handleMainPhotoSelect(selected?: File) {
    setMainPhotoError('')
    if (mainPhotoPreview) URL.revokeObjectURL(mainPhotoPreview)
    if (!selected) {
      setMainPhoto(null)
      setMainPhotoPreview('')
      return
    }
    if (!isValidImageFile(selected)) {
      setMainPhotoError('Formato inválido! Envie uma imagem nos formatos JPG, PNG ou WebP.')
      setMainPhoto(null)
      setMainPhotoPreview('')
      return
    }
    const MAX_SIZE = 5 * 1024 * 1024
    if (selected.size > MAX_SIZE) {
      const sizeMb = (selected.size / (1024 * 1024)).toFixed(2)
      setMainPhotoError(`A imagem possui ${sizeMb} MB e ultrapassa o limite de 5 MB.`)
      setMainPhoto(null)
      setMainPhotoPreview('')
      return
    }
    setMainPhoto(selected)
    setMainPhotoPreview(URL.createObjectURL(selected))
  }

  async function saveGeneral(event: FormEvent) {
    event.preventDefault()
    if (!product.data) return

    const built = buildSizesPayload(sizePricing)
    if (built.error) {
      notify(built.error, 'error')
      return
    }
    if (mainPhotoError) {
      notify(mainPhotoError, 'error')
      return
    }

    setSavingGeneral(true)
    try {
      await api.put(`/admin/products/${productId}`, {
        categoryId: product.data.categoryId || null,
        name: generalForm.name.trim(),
        slug: product.data.slug,
        description: generalForm.description.trim(),
        basePrice: built.basePrice,
        isAvailable: generalForm.isAvailable
      })
      await api.put(`/admin/products/${productId}/sizes`, {
        basePrice: built.basePrice,
        sizes: built.sizes
      })
      if (mainPhoto) {
        const form = new FormData()
        form.append('file', mainPhoto)
        form.append('isPrimary', 'true')
        await api.upload(`/admin/products/${productId}/photos`, form)
        if (mainPhotoPreview) URL.revokeObjectURL(mainPhotoPreview)
        setMainPhoto(null)
        setMainPhotoPreview('')
      }
      notify('Produto e tamanhos atualizados com sucesso!')
      await product.reload()
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      setSavingGeneral(false)
    }
  }

  async function saveSizes(event: FormEvent) {
    event.preventDefault()
    const built = buildSizesPayload(sizePricing)
    if (built.error) {
      notify(built.error, 'error')
      return
    }
    setSavingSizes(true)
    try {
      await api.put(`/admin/products/${productId}/sizes`, {
        basePrice: built.basePrice,
        sizes: built.sizes
      })
      notify('Tamanhos e preços salvos com sucesso!')
      await product.reload()
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      setSavingSizes(false)
    }
  }

  function handleFileSelect(fileList: FileList | null) {
    setUploadError('')
    if (!fileList || fileList.length === 0) return

    const MAX_SIZE = 5 * 1024 * 1024
    const validAdditions: Array<{ file: File; preview: string }> = []
    const errors: string[] = []

    for (const selected of Array.from(fileList)) {
      if (!isValidImageFile(selected)) {
        errors.push(`"${selected.name}": formato não suportado (use JPG, PNG ou WebP).`)
        continue
      }
      if (selected.size > MAX_SIZE) {
        const sizeMb = (selected.size / (1024 * 1024)).toFixed(2)
        errors.push(`"${selected.name}" possui ${sizeMb} MB e ultrapassa o limite de 5 MB.`)
        continue
      }
      validAdditions.push({ file: selected, preview: URL.createObjectURL(selected) })
    }

    if (errors.length > 0) {
      setUploadError(errors.join(' '))
    }
    if (validAdditions.length > 0) {
      setFilesToUpload(prev => [...prev, ...validAdditions])
    }
  }

  function removeFileToUpload(index: number) {
    setFilesToUpload(prev => {
      const target = prev[index]
      if (target) URL.revokeObjectURL(target.preview)
      return prev.filter((_, i) => i !== index)
    })
  }

  async function upload() {
    if (!filesToUpload.length) return notify('Selecione pelo menos uma imagem para enviar.', 'error')
    setUploading(true)
    try {
      const hasExistingPhotos = Boolean(product.data?.photos.length)
      for (let i = 0; i < filesToUpload.length; i++) {
        const form = new FormData()
        form.append('file', filesToUpload[i].file)
        form.append('altText', alt)
        form.append('isPrimary', String(!hasExistingPhotos && i === 0))
        await api.upload(`/admin/products/${productId}/photos`, form)
      }
      notify(filesToUpload.length > 1 ? 'Fotos enviadas com sucesso.' : 'Foto enviada com sucesso.')
      filesToUpload.forEach(item => URL.revokeObjectURL(item.preview))
      setFilesToUpload([])
      setUploadError('')
      setAlt('')
      await product.reload()
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      setUploading(false)
    }
  }

  async function deletePhoto(id: string) {
    if (!confirm('Excluir esta foto?')) return
    try {
      await api.delete(`/admin/product-photos/${id}`)
      notify('Foto removida.')
      await product.reload()
    } catch (error) {
      notify(errorMessage(error), 'error')
    }
  }

  async function addDiscount(event: FormEvent) {
    event.preventDefault()
    try {
      await api.post(`/admin/products/${productId}/discounts`, {
        minimumQuantity: Number(discount.minimumQuantity),
        discountPerUnit: Number(discount.discountPerUnit)
      })
      notify('Desconto por quantidade criado.')
      setDiscount({ minimumQuantity: '2', discountPerUnit: '' })
      await product.reload()
    } catch (error) {
      notify(errorMessage(error), 'error')
    }
  }

  async function deleteDiscount(id: string) {
    if (!confirm('Excluir esta regra de desconto?')) return
    try {
      await api.delete(`/admin/product-discounts/${id}`)
      notify('Regra de desconto removida.')
      await product.reload()
    } catch (error) {
      notify(errorMessage(error), 'error')
    }
  }

  const activeSizesCount =
    product.data?.variations.filter(v => v.isAvailable !== false && v.attributes?.length > 0).length || 0

  return (
    <Modal title={product.data ? `Editar produto: ${product.data.name}` : 'Editar produto'} onClose={onClose} wide>
      {product.loading ? (
        <Loading />
      ) : product.error || !product.data ? (
        <ErrorState message={product.error} />
      ) : (
        <>
          <div className="tabs">
            <button
              type="button"
              className={tab === 'general' ? 'active' : ''}
              onClick={() => setTab('general')}
            >
              Dados Gerais e Tamanhos
            </button>
            <button
              type="button"
              className={tab === 'sizes' ? 'active' : ''}
              onClick={() => setTab('sizes')}
            >
              Tamanhos e Preços ({activeSizesCount || 'Único'})
            </button>
            <button
              type="button"
              className={tab === 'photos' ? 'active' : ''}
              onClick={() => setTab('photos')}
            >
              Fotos ({product.data.photos.length})
            </button>
            <button
              type="button"
              className={tab === 'discounts' ? 'active' : ''}
              onClick={() => setTab('discounts')}
            >
              Descontos ({product.data.discounts.length})
            </button>
          </div>

          {tab === 'general' && (
            <form onSubmit={saveGeneral} className="stack-form">
              <div className="form-grid">
                <Field label="Nome do produto *">
                  <input
                    required
                    value={generalForm.name}
                    onChange={e => setGeneralForm({ ...generalForm, name: e.target.value })}
                    placeholder="Ex.: Camiseta Oficial Corsa Clube"
                  />
                </Field>

                <Field label="Disponibilidade">
                  <select
                    value={String(generalForm.isAvailable)}
                    onChange={e => setGeneralForm({ ...generalForm, isAvailable: e.target.value === 'true' })}
                  >
                    <option value="true">Disponível para venda</option>
                    <option value="false">Indisponível / Oculto</option>
                  </select>
                </Field>

                <Field label="Descrição">
                  <textarea
                    rows={2}
                    value={generalForm.description}
                    onChange={e => setGeneralForm({ ...generalForm, description: e.target.value })}
                    placeholder="Informações sobre material, medidas ou modelo..."
                  />
                </Field>
              </div>

              <SizePricingEditor value={sizePricing} onChange={setSizePricing} />

              {/* Foto Principal */}
              <div className="product-image-section">
                <div className="field-label">
                  <b>Foto principal (capa)</b>
                  <small>Substitua a foto de capa do produto se desejar (JPG, PNG ou WebP até 5 MB)</small>
                </div>

                {product.data.photos.find(p => p.isPrimary) && !mainPhotoPreview && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px' }}>
                    <div style={{ width: '64px', height: '64px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-line)' }}>
                      <ProductImage photoId={product.data.photos.find(p => p.isPrimary)?.id} alt={product.data.name} />
                    </div>
                    <small style={{ color: 'var(--text-muted)' }}>Capa atual cadastrada</small>
                  </div>
                )}

                <div className="product-upload-box">
                  <input
                    id="product-edit-cover-photo"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/x-png,image/pjpeg,image/jpg"
                    style={{ display: 'none' }}
                    onChange={e => handleMainPhotoSelect(e.target.files?.[0])}
                  />
                  <label htmlFor="product-edit-cover-photo" className="product-upload-trigger">
                    <UploadCloud size={24} />
                    <span>{mainPhoto ? 'Substituir nova foto de capa' : 'Escolher nova foto de capa'}</span>
                    <small>Clique para escolher uma imagem do seu computador</small>
                  </label>

                  {mainPhotoPreview && (
                    <div className="product-photo-preview-box">
                      <img src={mainPhotoPreview} alt="Pré-visualização" className="product-form-preview" />
                      <div className="preview-meta">
                        <b>{mainPhoto?.name}</b>
                        <small>{mainPhoto ? (mainPhoto.size / (1024 * 1024)).toFixed(2) : '0'} MB</small>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleMainPhotoSelect(undefined)}
                        >
                          Remover foto
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {mainPhotoError && (
                  <div className="form-error-banner" style={{ marginTop: '12px' }}>
                    <AlertCircle size={18} />
                    <span>{mainPhotoError}</span>
                  </div>
                )}
              </div>

              <div className="modal-actions">
                <button className="btn btn-primary" type="submit" disabled={savingGeneral}>
                  <Check /> {savingGeneral ? 'Salvando...' : 'Salvar produto e tamanhos'}
                </button>
              </div>
            </form>
          )}

          {tab === 'sizes' && (
            <form onSubmit={saveSizes} className="stack-form">
              <SizePricingEditor value={sizePricing} onChange={setSizePricing} />
              <div className="modal-actions">
                <button className="btn btn-primary" type="submit" disabled={savingSizes}>
                  <Check /> {savingSizes ? 'Salvando...' : 'Salvar tamanhos e preços'}
                </button>
              </div>
            </form>
          )}

          {tab === 'photos' && (
            <div>
              <div className="photo-manager">
                {product.data.photos.map(photo => (
                  <div key={photo.id}>
                    <ProductImage photoId={photo.id} alt={photo.altText || product.data!.name} />
                    {photo.isPrimary && <span className="photo-manager-badge">Capa</span>}
                    <button
                      onClick={() => deletePhoto(photo.id)}
                      title="Excluir foto"
                    >
                      <Trash2 />
                    </button>
                  </div>
                ))}
              </div>

              <div className="product-upload-guidelines">
                <small>Você pode selecionar várias fotos de uma vez • Formatos aceitos: JPG, PNG, WebP (máx. 5 MB por imagem)</small>
              </div>

              <div className="inline-form">
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/x-png,image/pjpeg,image/jpg"
                  onChange={e => {
                    handleFileSelect(e.target.files)
                    e.target.value = ''
                  }}
                />
                <input
                  value={alt}
                  onChange={e => setAlt(e.target.value)}
                  placeholder="Texto alternativo (opcional)"
                />
                <button
                  className="btn btn-primary"
                  onClick={upload}
                  disabled={uploading || !filesToUpload.length}
                >
                  <UploadCloud /> {uploading ? 'Enviando...' : filesToUpload.length > 1 ? `Enviar ${filesToUpload.length} fotos` : 'Enviar foto'}
                </button>
              </div>

              {filesToUpload.length > 0 && (
                <div className="product-photos-preview-grid" style={{ marginTop: '12px' }}>
                  {filesToUpload.map((item, idx) => (
                    <div key={`${item.file.name}-${idx}`} className="product-photo-preview-box">
                      <img src={item.preview} alt="Preview" className="product-form-preview" />
                      <div className="preview-meta">
                        <b>{item.file.name}</b>
                        <small>{(item.file.size / (1024 * 1024)).toFixed(2)} MB</small>
                        <div className="preview-meta-actions">
                          <button
                            type="button"
                            className="btn btn-ghost btn-small"
                            onClick={() => removeFileToUpload(idx)}
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {uploadError && (
                <div className="form-error-banner" style={{ marginTop: '12px' }}>
                  <AlertCircle size={18} />
                  <span>{uploadError}</span>
                </div>
              )}
            </div>
          )}

          {tab === 'discounts' && (
            <>
              <div className="discount-rule-list">
                {!product.data.discounts?.length ? (
                  <p>Nenhum desconto por quantidade cadastrado.</p>
                ) : (
                  product.data.discounts.map(rule => (
                    <div key={rule.id}>
                      <Percent size={18} />
                      <span>
                        <b>A partir de {rule.minimumQuantity} peças</b>
                        <small>
                          {currency(rule.discountPerUnit)} de desconto em cada unidade
                        </small>
                      </span>
                      <button
                        type="button"
                        className="icon-btn danger"
                        onClick={() => deleteDiscount(rule.id)}
                        aria-label="Excluir desconto"
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  ))
                )}
              </div>
              <form className="stack-form discount-form" onSubmit={addDiscount}>
                <div className="form-grid">
                  <Field label="Quantidade mínima">
                    <input
                      required
                      type="number"
                      min="2"
                      max="1000"
                      value={discount.minimumQuantity}
                      onChange={e =>
                        setDiscount({ ...discount, minimumQuantity: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Desconto por unidade (R$)">
                    <input
                      required
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={discount.discountPerUnit}
                      onChange={e =>
                        setDiscount({ ...discount, discountPerUnit: e.target.value })
                      }
                      placeholder="10,00"
                    />
                  </Field>
                </div>
                <button className="btn btn-primary">
                  <Percent size={17} /> Adicionar desconto
                </button>
              </form>
            </>
          )}
        </>
      )}
    </Modal>
  )
}

export function AdminOrdersPage() {
  const [params, setParams] = useSearchParams(); const status = params.get('status') || ''; const page = Number(params.get('page') || 1); const [selected, setSelected] = useState<string>()
  const orders = useApi(() => api.get<PagedResult<OrderSummary>>(`/orders?status=${status}&page=${page}&pageSize=15`), [status, page])
  return <><PageHeader eyebrow="Operação" title="Pedidos" description="Consulte pedidos e acompanhe seus históricos." /><div className="admin-toolbar"><select value={status} onChange={e => setParams(e.target.value ? { status: e.target.value } : {})}><option value="">Todos os status</option><option value="awaiting_payment">Aguardando pagamento</option><option value="awaiting_validation">Comprovante enviado</option><option value="receipt_rejected">Comprovante recusado</option><option value="payment_confirmed">Pagamento confirmado</option><option value="awaiting_batch">Aguardando lote</option><option value="included_in_batch">Incluído no lote</option><option value="in_production">Em produção</option><option value="ready_for_delivery">Pronto para entrega</option><option value="delivered">Entregue</option><option value="cancelled">Cancelado</option></select></div>{orders.loading ? <Loading /> : orders.error ? <ErrorState message={orders.error} retry={orders.reload} /> : !orders.data?.items.length ? <Empty title="Nenhum pedido" /> : <><div className="table-wrap"><table><thead><tr><th>Pedido</th><th>Associado</th><th>Data</th><th>Total</th><th>Status</th><th /></tr></thead><tbody>{orders.data.items.map(order => <tr key={order.id}><td><b>#{order.orderNumber}</b></td><td>{order.member?.fullName || (order as any).memberName || 'Associado'}</td><td>{dateTime(order.placedAt)}</td><td><b>{currency(order.totalAmount)}</b></td><td><StatusBadge status={order.statusCode} /></td><td><button className="icon-btn" onClick={() => setSelected(order.id)}><Eye /></button></td></tr>)}</tbody></table></div><Pagination page={page} totalPages={orders.data.totalPages} onChange={value => setParams({ ...(status ? { status } : {}), page: String(value) })} /></>}{selected && <AdminOrderModal id={selected} onClose={() => setSelected(undefined)} onUpdated={orders.reload} />}</>
}

function AdminOrderModal({ id, onClose, onUpdated }: { id: string; onClose(): void; onUpdated?: () => void }) {
  const notify = useToast()
  const order = useApi(() => api.get<OrderDetail>(`/orders/${id}`), [id])
  const history = useApi(() => api.get<Array<{ statusCode?: string; newStatusCode?: string; createdAt?: string; changedAt?: string; notes?: string }>>(`/orders/${id}/history`), [id])
  const [cancelling, setCancelling] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [loadingCancel, setLoadingCancel] = useState(false)

  async function handleCancel(e: FormEvent) {
    e.preventDefault()
    setLoadingCancel(true)
    try {
      await api.post(`/orders/${id}/cancel`, { reason: cancelReason || 'Cancelado pela administração.' })
      notify('Pedido cancelado com sucesso.')
      setCancelling(false)
      setCancelReason('')
      await order.reload()
      await history.reload()
      onUpdated?.()
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      setLoadingCancel(false)
    }
  }

  const canCancel = order.data && order.data.statusCode !== 'cancelled' && order.data.statusCode !== 'delivered'

  return <Modal title="Detalhes do pedido" onClose={onClose} wide>{order.loading ? <Loading /> : order.error || !order.data ? <ErrorState message={order.error} /> : <>
    <div className="admin-order-detail">
      <div>
        <div className="member-box">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <span>Pedido #{order.data.orderNumber}</span>
              <h3>{order.data.member?.fullName || (order.data as any).memberName || 'Associado'}</h3>
              <p>{order.data.member?.email} {order.data.member?.phone && `• ${order.data.member?.phone}`}</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
              <StatusBadge status={order.data.statusCode} />
              {canCancel && <button className="btn btn-small btn-danger" onClick={() => setCancelling(true)}><X /> Cancelar pedido</button>}
            </div>
          </div>
        </div>
        {order.data.items.map(item => <div className="detail-item" key={item.id}><div><b>{item.productNameSnapshot}</b><span>{item.variationNameSnapshot}</span><small>{item.quantity} × {currency(item.unitPrice)}</small></div><b>{currency(item.subtotal)}</b></div>)}
        <div className="panel-total"><span>Total</span><b>{currency(order.data.totalAmount)}</b></div>
      </div>
      <div className="timeline">
        <h4 style={{ marginBottom: '0.75rem', fontSize: '0.9rem', color: 'var(--muted)' }}>Histórico de status</h4>
        {history.data?.map((item, index) => <div className="timeline-item" key={index}><span className="timeline-dot" /><div><b>{labelStatus(item.newStatusCode || item.statusCode)}</b><small>{dateTime(item.changedAt || item.createdAt)}</small>{item.notes && <p>{item.notes}</p>}</div></div>)}
      </div>
    </div>
    {cancelling && <Modal title={`Cancelar pedido #${order.data.orderNumber}`} onClose={() => setCancelling(false)}><form onSubmit={handleCancel}><p style={{ marginBottom: '1rem', color: 'var(--muted)', fontSize: '0.9rem' }}>Tem certeza que deseja cancelar este pedido? Essa ação é irreversível e o pedido será removido de qualquer lote em que estiver incluído.</p><Field label="Motivo do cancelamento (opcional)"><textarea rows={3} value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="Ex.: Pedido duplicado, desistência a pedido do associado, etc." /></Field><div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={() => setCancelling(false)}>Voltar</button><button type="submit" className="btn btn-danger" disabled={loadingCancel}>{loadingCancel ? 'Cancelando...' : 'Confirmar cancelamento'}</button></div></form></Modal>}
  </>}</Modal>
}

export function AdminPaymentsPage() {
  const notify = useToast(); const payments = useApi(() => api.get<PendingPayment[]>('/admin/payments/pending'), []); const [selected, setSelected] = useState<PendingPayment>(); const [rejecting, setRejecting] = useState(false); const [reason, setReason] = useState({ reasonCode: 'invalid_receipt', details: '' }); const [working, setWorking] = useState(false); const [preview, setPreview] = useState('')
  async function open(payment: PendingPayment) { setSelected(payment); setPreview(''); try { const blob = await api.blob(`/orders/${payment.orderId}/receipts/${payment.id}/file`); setPreview(URL.createObjectURL(blob)) } catch (error) { notify(errorMessage(error), 'error') } }
  async function approve() { if (!selected) return; setWorking(true); try { await api.post(`/admin/payments/${selected.id}/approve`, {}); notify('Pagamento aprovado.'); setSelected(undefined); await payments.reload() } catch (error) { notify(errorMessage(error), 'error') } finally { setWorking(false) } }
  async function reject(event: FormEvent) { event.preventDefault(); if (!selected) return; setWorking(true); try { await api.post(`/admin/payments/${selected.id}/reject`, reason); notify('Comprovante recusado e associado notificado no histórico.'); setSelected(undefined); setRejecting(false); await payments.reload() } catch (error) { notify(errorMessage(error), 'error') } finally { setWorking(false) } }
  return <><PageHeader eyebrow="Financeiro" title="Pagamentos pendentes" description="Confira os comprovantes antes de aprovar." actions={<button className="btn btn-secondary" onClick={payments.reload}><RefreshCw /> Atualizar</button>} />{payments.loading ? <Loading /> : payments.error ? <ErrorState message={payments.error} retry={payments.reload} /> : !payments.data?.length ? <Empty title="Tudo em dia" description="Não há comprovantes aguardando análise." /> : <div className="payment-grid">{payments.data.map(payment => <article className="payment-card" key={payment.id}><div><span>Pedido #{payment.orderNumber}</span><StatusBadge status={payment.statusCode} /></div><h3>{payment.memberName}</h3><p>Enviado em {dateTime(payment.submittedAt)}</p><div className="payment-value"><span>Valor informado</span><b>{payment.reportedAmount ? currency(payment.reportedAmount) : 'Não informado'}</b></div><button className="btn btn-secondary btn-block" onClick={() => open(payment)}><Eye /> Analisar comprovante</button></article>)}</div>}{selected && <Modal title={`Pagamento • Pedido #${selected.orderNumber}`} onClose={() => { setSelected(undefined); if (preview) URL.revokeObjectURL(preview) }} wide><div className="receipt-review"><div className="receipt-preview">{preview ? preview.startsWith('blob:') ? <iframe src={preview} title="Comprovante" /> : null : <Loading label="Carregando comprovante..." />}</div><aside><span className="eyebrow">Associado</span><h3>{selected.memberName}</h3><p>Enviado em {dateTime(selected.submittedAt)}</p>{selected.reportedAmount && <div className="review-amount"><span>Valor informado</span><b>{currency(selected.reportedAmount)}</b></div>}<div className="review-actions"><button className="btn btn-success" disabled={working} onClick={approve}><Check /> Aprovar</button><button className="btn btn-danger" onClick={() => setRejecting(true)}><X /> Recusar</button></div></aside></div></Modal>}{rejecting && selected && <Modal title="Recusar comprovante" onClose={() => setRejecting(false)}><form onSubmit={reject}><Field label="Motivo"><select value={reason.reasonCode} onChange={e => setReason({ ...reason, reasonCode: e.target.value })}><option value="invalid_receipt">Comprovante inválido</option><option value="wrong_amount">Valor incorreto</option><option value="unreadable">Arquivo ilegível</option><option value="duplicate">Comprovante duplicado</option><option value="other">Outro</option></select></Field><Field label="Detalhes para o associado"><textarea required rows={4} value={reason.details} onChange={e => setReason({ ...reason, details: e.target.value })} placeholder="Explique como corrigir o problema..." /></Field><div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={() => setRejecting(false)}>Cancelar</button><button className="btn btn-danger" disabled={working}>Confirmar recusa</button></div></form></Modal>}</>
}

export function AdminBatchesPage() {
  const notify = useToast(); const [status, setStatus] = useState(''); const [creating, setCreating] = useState(false); const [form, setForm] = useState({ productId: '', notes: '' }); const batches = useApi(() => api.get<BatchSummary[]>(`/admin/batches?status=${status}`), [status]); const products = useApi(() => api.get<ProductSummary[]>('/admin/products?active=true'), [])
  async function create(event: FormEvent) { event.preventDefault(); try { await api.post('/admin/batches', form); notify('Lote criado.'); setCreating(false); setForm({ productId: '', notes: '' }); await batches.reload() } catch (error) { notify(errorMessage(error), 'error') } }
  return <><PageHeader eyebrow="Produção" title="Lotes" description="Agrupe pedidos aprovados e consolide a produção." actions={<button className="btn btn-primary" onClick={() => setCreating(true)}><Plus /> Novo lote</button>} /><div className="admin-toolbar"><select value={status} onChange={e => setStatus(e.target.value)}><option value="">Todos os status</option><option value="open">Abertos</option><option value="in_production">Em produção</option><option value="closed">Fechados</option><option value="cancelled">Cancelados</option></select></div>{batches.loading ? <Loading /> : batches.error ? <ErrorState message={batches.error} retry={batches.reload} /> : !batches.data?.length ? <Empty title="Nenhum lote" description="Crie um lote para começar a organizar a produção." /> : <div className="batch-grid">{batches.data.map(batch => <Link to={`/admin/lotes/${batch.id}`} className="batch-card" key={batch.id}><div><span>Lote</span><h3>#{batch.batchNumber}</h3><StatusBadge status={batch.statusCode} /></div><h4>{batch.productName}</h4><div className="batch-meta"><span><b>{batch.totalQuantity}</b> unidades</span><small>{dateTime(batch.createdAt)}</small></div><span className="text-link">Abrir lote <ChevronRight /></span></Link>)}</div>}{creating && <Modal title="Criar novo lote" onClose={() => setCreating(false)}><form onSubmit={create}><Field label="Produto"><select required value={form.productId} onChange={e => setForm({ ...form, productId: e.target.value })}><option value="">Selecione o produto</option>{products.data?.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></Field><Field label="Observações"><textarea rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field><div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={() => setCreating(false)}>Cancelar</button><button className="btn btn-primary">Criar lote</button></div></form></Modal>}</>
}

const batchTransitions: Record<string, Array<{ value: string; label: string }>> = {
  open: [{ value: 'closed', label: 'Fechado para produção' }, { value: 'cancelled', label: 'Cancelar lote' }],
  closed: [{ value: 'sent_to_production', label: 'Enviado para produção' }, { value: 'cancelled', label: 'Cancelar lote' }],
  sent_to_production: [{ value: 'in_production', label: 'Em produção' }, { value: 'cancelled', label: 'Cancelar lote' }],
  in_production: [{ value: 'production_completed', label: 'Produção concluída' }, { value: 'cancelled', label: 'Cancelar lote' }],
  production_completed: [{ value: 'received', label: 'Recebido do fornecedor (Pronto para entrega)' }],
}

export function AdminBatchDetailPage() {
  const { id = '' } = useParams(); const notify = useToast(); const batch = useApi(() => api.get<BatchDetail>(`/admin/batches/${id}`), [id]); const eligible = useApi(() => api.get<OrderSummary[]>(`/admin/batches/${id}/eligible-orders`), [id]); const [statusModal, setStatusModal] = useState(false); const [nextStatus, setNextStatus] = useState(''); const [notes, setNotes] = useState('')
  const transitions = batch.data ? (batchTransitions[batch.data.statusCode] || []) : []
  const canCancelBatch = batch.data && batch.data.statusCode !== 'cancelled' && batch.data.statusCode !== 'received'
  function openStatusModal() { setNextStatus(transitions[0]?.value || ''); setNotes(''); setStatusModal(true) }
  async function addOrder(orderId: string) { try { await api.post(`/admin/batches/${id}/orders/${orderId}`, {}); notify('Pedido adicionado ao lote.'); await batch.reload(); await eligible.reload() } catch (error) { notify(errorMessage(error), 'error') } }
  async function removeOrder(orderId: string) { if (!confirm('Remover este pedido do lote?')) return; try { await api.delete(`/admin/batches/${id}/orders/${orderId}`); notify('Pedido removido.'); await batch.reload(); await eligible.reload() } catch (error) { notify(errorMessage(error), 'error') } }
  async function changeStatus(event: FormEvent) { event.preventDefault(); try { await api.post(`/admin/batches/${id}/status`, { status: nextStatus, notes }); notify('Status do lote atualizado.'); setStatusModal(false); await batch.reload() } catch (error) { notify(errorMessage(error), 'error') } }
  if (batch.loading) return <Loading />
  if (batch.error || !batch.data) return <ErrorState message={batch.error || 'Lote não encontrado.'} retry={batch.reload} />
  return <><div className="breadcrumbs"><Link to="/admin/lotes">Lotes</Link><ChevronRight />#{batch.data.batchNumber}</div><PageHeader eyebrow="Produção" title={`Lote #${batch.data.batchNumber}`} description={batch.data.productName} actions={<><StatusBadge status={batch.data.statusCode} />{transitions.length > 0 && <button className="btn btn-secondary" onClick={openStatusModal}>Alterar status</button>}{canCancelBatch && <button className="btn btn-danger" onClick={() => { setNextStatus('cancelled'); setNotes(''); setStatusModal(true) }}><X /> Cancelar lote</button>}</>} /><div className="batch-detail-grid"><section><div className="panel"><h2>Pedidos do lote <span className="count">{batch.data.orders.length}</span></h2>{!batch.data.orders.length ? <Empty title="Lote vazio" description="Adicione pedidos elegíveis ao lado." /> : batch.data.orders.map(order => <div className="batch-order" key={order.orderId}><div><b>#{order.orderNumber}</b><span>{order.fullName || (order as any).memberName || 'Associado'}</span></div><button className="icon-btn danger" onClick={() => removeOrder(order.orderId)}><Trash2 /></button></div>)}</div><div className="panel"><h2>Consolidação</h2>{!batch.data.consolidation.length ? <Empty title="Sem itens para consolidar" /> : <div className="consolidation-list">{batch.data.consolidation.map((item, index) => <div key={index}>{Object.entries(item).map(([key, value]) => <span key={key}><small>{key}</small><b>{typeof value === 'object' && value !== null ? Object.entries(value).map(([k, v]) => `${k}: ${v}`).join(', ') : String(value ?? '—')}</b></span>)}</div>)}</div>}</div></section><aside className="panel"><h2>Pedidos elegíveis</h2>{eligible.loading ? <Loading /> : !eligible.data?.length ? <Empty title="Nenhum pedido elegível" description="Somente pedidos pagos deste produto aparecem aqui." /> : eligible.data.map(order => <div className="eligible-order" key={order.id}><div><b>#{order.orderNumber}</b><span>{(order as any).memberName || order.member?.fullName || 'Associado'}</span><small>{(order as any).itemCount ?? (order as any).items?.reduce((s: number, i: any) => s + (i.quantity || 0), 0) ?? 0} itens</small></div><button className="btn btn-small btn-secondary" onClick={() => addOrder(order.id)}><Plus /> Adicionar</button></div>)}</aside></div>{statusModal && <Modal title={nextStatus === 'cancelled' ? 'Cancelar lote' : 'Alterar status do lote'} onClose={() => setStatusModal(false)}>{transitions.length === 0 ? <p>Este lote já está finalizado ({labelStatus(batch.data?.statusCode)}).</p> : <form onSubmit={changeStatus}>{nextStatus === 'cancelled' ? <div style={{ marginBottom: '1rem' }}><p style={{ color: 'var(--danger)', fontWeight: 600, marginBottom: '0.5rem' }}>Atenção: Cancelar este lote devolverá todos os {batch.data?.orders.length} pedidos vinculados para a fila de espera ("Aguardando lote").</p><p style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>Eles poderão ser incluídos em um novo lote de produção posteriormente.</p></div> : <Field label="Novo status"><select value={nextStatus} onChange={e => setNextStatus(e.target.value)}>{transitions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></Field>}<Field label="Observação / Justificativa"><textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder={nextStatus === 'cancelled' ? 'Informe o motivo do cancelamento do lote...' : 'Observação interna sobre o avanço do lote...'} /></Field><div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={() => setStatusModal(false)}>Voltar</button><button type="submit" className={nextStatus === 'cancelled' ? 'btn btn-danger' : 'btn btn-primary'}>{nextStatus === 'cancelled' ? 'Confirmar cancelamento do lote' : 'Salvar status'}</button></div></form>}</Modal>}</>
}

export function AdminDeliveriesPage() {
  const notify = useToast(); const [search, setSearch] = useState(''); const [selected, setSelected] = useState<any>(); const [notes, setNotes] = useState(''); const deliveries = useApi(() => api.get<any[]>(`/admin/deliveries/ready?search=${encodeURIComponent(search)}`), [search])
  async function deliver(event: FormEvent) { event.preventDefault(); const orderId = selected?.orderId || selected?.id; if (!orderId) return; try { await api.post(`/admin/deliveries/${orderId}`, { notes }); notify('Entrega registrada com sucesso.'); setSelected(undefined); setNotes(''); await deliveries.reload() } catch (error) { notify(errorMessage(error), 'error') } }
  return <><PageHeader eyebrow="Retirada" title="Entregas prontas" description="Localize o associado e registre a retirada." /><div className="admin-toolbar"><div className="search-box"><Search /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Pedido ou nome do associado..." /></div></div>{deliveries.loading ? <Loading /> : deliveries.error ? <ErrorState message={deliveries.error} retry={deliveries.reload} /> : !deliveries.data?.length ? <Empty title="Nenhuma entrega aguardando" description="Pedidos prontos aparecerão aqui." /> : <div className="delivery-list">{deliveries.data.map((item, index) => <article key={item.orderId || item.id || index}><div className="delivery-icon"><Truck /></div><div><span>Pedido #{item.orderNumber}</span><h3>{item.memberName || item.member?.fullName || item.member || 'Associado'}</h3><small>{item.itemCount ? `${item.itemCount} itens • ` : item.items ? `${item.items.length} itens • ` : ''}{dateTime(item.placedAt || item.updatedAt)}</small></div>{item.totalAmount !== undefined && <b>{currency(item.totalAmount)}</b>}<button className="btn btn-success" onClick={() => setSelected(item)}><Check /> Marcar entregue</button></article>)}</div>}{selected && <Modal title="Confirmar entrega" onClose={() => setSelected(undefined)}><p>Confirma a entrega do pedido <b>#{selected.orderNumber}</b> para <b>{selected.memberName || selected.member?.fullName || selected.member || 'Associado'}</b>?</p><form onSubmit={deliver}><Field label="Observação (opcional)"><textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Nome de quem retirou, detalhes..." /></Field><div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={() => setSelected(undefined)}>Cancelar</button><button className="btn btn-success">Confirmar entrega</button></div></form></Modal>}</>
}

export function AdminSettingsPage() {
  const notify = useToast(); const pix = useApi(() => api.get<PixSettings>('/pix'), []); const administrators = useApi(() => api.get<AdministratorSummary[]>('/admin/administrators'), []); const [form, setForm] = useState<PixSettings>({ pixKey: '', keyType: 'cpf', beneficiaryName: '', beneficiaryCity: '', instructions: '' }); const [loaded, setLoaded] = useState(false); const [saving, setSaving] = useState(false); const [adminEmail, setAdminEmail] = useState(''); const [granting, setGranting] = useState(false)
  useEffect(() => { if (pix.data && !loaded) { setForm(pix.data); setLoaded(true) } }, [pix.data, loaded])
  async function save(event: FormEvent) { event.preventDefault(); setSaving(true); try { await api.put('/pix', form); notify('Configurações Pix salvas.') } catch (error) { notify(errorMessage(error), 'error') } finally { setSaving(false) } }
  async function grantAdministrator(event: FormEvent) { event.preventDefault(); setGranting(true); try { await api.post('/admin/administrators', { email: adminEmail }); notify('Acesso administrativo concedido.'); setAdminEmail(''); await administrators.reload() } catch (error) { notify(errorMessage(error), 'error') } finally { setGranting(false) } }
  const isNotFound = /404|not found/i.test(pix.error)
  return <><PageHeader eyebrow="Loja" title="Configurações" description="Gerencie pagamentos e acessos administrativos." /><div className="settings-stack"><section className="panel settings-form"><div className="settings-title"><UserPlus /><div><h2>Administradores</h2><p>Conceda acesso administrativo a uma pessoa que já possui cadastro.</p></div></div><form className="admin-grant-form" onSubmit={grantAdministrator}><Field label="E-mail do usuário"><input required type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="usuario@email.com" /></Field><button className="btn btn-primary" disabled={granting}><UserPlus size={17} /> {granting ? 'Adicionando...' : 'Adicionar administrador'}</button></form>{administrators.loading ? <Loading label="Carregando administradores..." /> : administrators.error ? <ErrorState message={administrators.error} retry={administrators.reload} /> : <div className="administrator-list">{administrators.data?.map(admin => <div key={admin.id}><span className="avatar">{admin.fullName.split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase()}</span><span><b>{admin.fullName}</b><small>{admin.email}</small></span><span className={`badge ${admin.statusCode === 'active' ? 'badge-success' : 'badge-danger'}`}>{admin.statusCode === 'active' ? 'Ativo' : 'Inativo'}</span></div>)}</div>}<p className="settings-note">O novo administrador deve sair e entrar novamente para atualizar suas permissões.</p></section>{pix.loading ? <Loading /> : pix.error && !isNotFound ? <ErrorState message={pix.error} retry={pix.reload} /> : <form className="panel settings-form" onSubmit={save}><div className="settings-title"><ReceiptText /><div><h2>Pagamento via Pix</h2><p>Essas informações aparecem na tela de pagamento do pedido.</p></div></div><div className="form-grid"><Field label="Tipo da chave"><select value={form.keyType} onChange={e => setForm({ ...form, keyType: e.target.value })}><option value="cpf">CPF</option><option value="cnpj">CNPJ</option><option value="email">E-mail</option><option value="phone">Telefone</option><option value="random">Chave aleatória</option></select></Field><Field label="Chave Pix"><input required value={form.pixKey} onChange={e => setForm({ ...form, pixKey: e.target.value })} /></Field><Field label="Nome do beneficiário"><input required value={form.beneficiaryName} onChange={e => setForm({ ...form, beneficiaryName: e.target.value })} /></Field><Field label="Cidade"><input value={form.beneficiaryCity} onChange={e => setForm({ ...form, beneficiaryCity: e.target.value })} /></Field></div><Field label="Instruções adicionais"><textarea rows={4} value={form.instructions || ''} onChange={e => setForm({ ...form, instructions: e.target.value })} placeholder="Ex.: envie o comprovante logo após o pagamento." /></Field><div className="form-footer"><button className="btn btn-primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar configurações'}</button></div></form>}</div></>
}
