import { AlertCircle, Check, ChevronRight, Eye, Filter, Gauge, Package, Pencil, Percent, Plus, ReceiptText, RefreshCw, Search, ShoppingBag, Trash2, Truck, UploadCloud, UserPlus, X } from 'lucide-react'
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

interface ProductFormState { id?: string; categoryId: string; name: string; slug: string; description: string; basePrice: string; isAvailable: boolean }
const emptyProduct: ProductFormState = { categoryId: '', name: '', slug: '', description: '', basePrice: '', isAvailable: true }

export function AdminProductsPage() {
  const notify = useToast()
  const [active, setActive] = useState('')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<ProductFormState | null>(null)
  const [manageId, setManageId] = useState<string>()
  const [saving, setSaving] = useState(false)

  const [productPhoto, setProductPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string>('')
  const [photoError, setPhotoError] = useState<string>('')

  const products = useApi(() => api.get<ProductSummary[]>(`/admin/products?active=${active}`), [active])
  const filtered = (products.data || []).filter(product => product.name.toLowerCase().includes(search.toLowerCase()))

  function handlePhotoSelect(file?: File) {
    setPhotoError('')
    if (!file) {
      setProductPhoto(null)
      setPhotoPreview('')
      return
    }
    const validTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!validTypes.includes(file.type.toLowerCase())) {
      setPhotoError('Formato inválido! Envie uma imagem nos formatos JPG, PNG ou WebP.')
      setProductPhoto(null)
      setPhotoPreview('')
      return
    }
    const MAX_SIZE = 5 * 1024 * 1024
    if (file.size > MAX_SIZE) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(2)
      setPhotoError(`A imagem selecionada possui ${sizeMb} MB e ultrapassa o limite máximo de 5 MB. Escolha uma imagem menor.`)
      setProductPhoto(null)
      setPhotoPreview('')
      return
    }
    setProductPhoto(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  function openEdit(product?: ProductSummary) {
    setPhotoError('')
    setProductPhoto(null)
    setPhotoPreview('')
    setEditing(product ? {
      id: product.id,
      categoryId: product.categoryId || '',
      name: product.name,
      slug: product.slug,
      description: product.description || '',
      basePrice: String(product.basePrice),
      isAvailable: product.isAvailable !== false
    } : { ...emptyProduct })
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!editing) return

    const priceNum = Number(editing.basePrice)
    if (isNaN(priceNum) || priceNum <= 0) {
      notify('O preço base deve ser maior que zero (mínimo R$ 0,01).', 'error')
      return
    }

    if (!editing.id && !productPhoto) {
      setPhotoError('A imagem do produto é obrigatória para cadastro.')
      notify('Selecione uma imagem principal para cadastrar o produto.', 'error')
      return
    }

    if (photoError) {
      notify(photoError, 'error')
      return
    }

    setSaving(true)
    try {
      if (editing.id) {
        await api.put(`/admin/products/${editing.id}`, {
          categoryId: editing.categoryId || null,
          name: editing.name,
          slug: editing.slug,
          description: editing.description,
          basePrice: priceNum,
          isAvailable: editing.isAvailable
        })
        if (productPhoto) {
          const form = new FormData()
          form.append('file', productPhoto)
          form.append('isPrimary', 'true')
          await api.upload(`/admin/products/${editing.id}/photos`, form)
        }
        notify('Produto atualizado com sucesso.')
      } else {
        const form = new FormData()
        form.append('name', editing.name)
        form.append('description', editing.description)
        form.append('price', String(priceNum))
        form.append('photo', productPhoto!)
        await api.upload<{ id: string }>('/admin/products/simple', form)
        notify('Produto salvo e disponível para compra.')
      }

      setEditing(null)
      setProductPhoto(null)
      setPhotoPreview('')
      await products.reload()
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      setSaving(false)
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
        description="Preencha os dados básicos e salve. O produto já fica pronto para venda."
        actions={<button className="btn btn-primary" onClick={() => openEdit()}><Plus /> Novo produto</button>}
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
                        title="Editar dados"
                        onClick={() => openEdit(product)}
                      >
                        <Pencil />
                      </button>
                      <button
                        title="Opções avançadas"
                        onClick={() => setManageId(product.id)}
                      >
                        <SettingsIcon />
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

      {editing && (
        <Modal
          title={editing.id ? 'Editar produto' : 'Novo produto'}
          onClose={() => setEditing(null)}
          wide
        >
          <form onSubmit={save}>
            {!editing.id && <div className="product-modal-banner">Preencha, salve e pronto. O produto será publicado com uma opção padrão para compra.</div>}

            <div className="form-grid">
              <Field label="Nome do produto *">
                <input
                  required
                  value={editing.name}
                  onChange={e => setEditing({ ...editing, name: e.target.value })}
                  placeholder="Ex.: Camiseta Oficial Corsa Clube"
                />
              </Field>

              <Field label="Preço (R$) *">
                <input
                  required
                  min="0.01"
                  step="0.01"
                  type="number"
                  value={editing.basePrice}
                  onChange={e => setEditing({ ...editing, basePrice: e.target.value })}
                  placeholder="Ex.: 49.90"
                />
                <small className="field-hint">Preço mínimo de R$ 0,01.</small>
              </Field>

              <Field label="Descrição">
                <textarea
                  rows={3}
                  value={editing.description || ''}
                  onChange={e => setEditing({ ...editing, description: e.target.value })}
                  placeholder="Informações sobre material, medidas ou modelo..."
                />
              </Field>

            </div>

            {/* Upload de Foto Principal Obrigatória */}
            <div className="product-image-section">
              <div className="field-label">
                <b>{editing.id ? 'Atualizar foto principal (opcional)' : 'Foto principal do produto * (Obrigatória)'}</b>
                <small>Formatos aceitos: JPG, PNG, WebP • Tamanho máximo permitido: 5 MB</small>
              </div>

              <div className="product-upload-box">
                <input
                  id="product-main-photo-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: 'none' }}
                  onChange={e => handlePhotoSelect(e.target.files?.[0])}
                />
                <label htmlFor="product-main-photo-input" className="product-upload-trigger">
                  <UploadCloud size={24} />
                  <span>{productPhoto ? 'Substituir imagem selecionada' : 'Selecionar imagem do produto'}</span>
                  <small>Clique para escolher uma imagem do seu computador</small>
                </label>

                {photoPreview && (
                  <div className="product-photo-preview-box">
                    <img src={photoPreview} alt="Pré-visualização" className="product-form-preview" />
                    <div className="preview-meta">
                      <b>{productPhoto?.name}</b>
                      <small>{productPhoto ? (productPhoto.size / (1024 * 1024)).toFixed(2) : '0'} MB</small>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => handlePhotoSelect(undefined)}
                      >
                        Remover foto
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {photoError && (
                <div className="form-error-banner">
                  <AlertCircle size={18} />
                  <span>{photoError}</span>
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
                Cancelar
              </button>
              <button className="btn btn-primary" disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar produto'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {manageId && <ProductManager productId={manageId} onClose={() => setManageId(undefined)} />}
    </>
  )
}

function SettingsIcon() {
  return <Filter />
}

function ProductManager({ productId, onClose }: { productId: string; onClose(): void }) {
  const notify = useToast()
  const product = useApi(() => api.get<ProductDetail>(`/products/${productId}`), [productId])
  const [tab, setTab] = useState<'photos' | 'attributes' | 'variations' | 'discounts'>('photos')
  const [file, setFile] = useState<File>()
  const [filePreview, setFilePreview] = useState('')
  const [alt, setAlt] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [uploading, setUploading] = useState(false)

  const [attribute, setAttribute] = useState({ name: '', code: '', values: '' })
  const [variation, setVariation] = useState({
    displayName: '',
    sku: '',
    priceOverride: '',
    attributeValueIds: [] as string[]
  })
  const [discount, setDiscount] = useState({ minimumQuantity: '2', discountPerUnit: '' })

  function handleFileSelect(selected?: File) {
    setUploadError('')
    if (!selected) {
      setFile(undefined)
      setFilePreview('')
      return
    }
    const validTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!validTypes.includes(selected.type.toLowerCase())) {
      setUploadError('Formato de imagem não suportado. Por favor envie JPG, PNG ou WebP.')
      setFile(undefined)
      setFilePreview('')
      return
    }
    const MAX_SIZE = 5 * 1024 * 1024
    if (selected.size > MAX_SIZE) {
      const sizeMb = (selected.size / (1024 * 1024)).toFixed(2)
      setUploadError(`A imagem possui ${sizeMb} MB e ultrapassa o limite máximo permitido de 5 MB. Selecione uma imagem menor.`)
      setFile(undefined)
      setFilePreview('')
      return
    }
    setFile(selected)
    setFilePreview(URL.createObjectURL(selected))
  }

  async function upload() {
    if (!file) return notify('Selecione uma imagem para enviar.', 'error')
    if (uploadError) return notify(uploadError, 'error')
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('altText', alt)
      form.append('isPrimary', String(!product.data?.photos.length))
      await api.upload(`/admin/products/${productId}/photos`, form)
      notify('Foto enviada com sucesso.')
      setFile(undefined)
      setFilePreview('')
      setAlt('')
      await product.reload()
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      setUploading(false)
    }
  }

  async function addAttribute(event: FormEvent) {
    event.preventDefault()
    try {
      await api.post(`/admin/products/${productId}/attributes`, {
        name: attribute.name,
        code: attribute.code,
        sortOrder: product.data?.attributes.length || 0,
        isRequired: true,
        values: attribute.values
          .split(',')
          .map(v => v.trim())
          .filter(Boolean)
      })
      notify('Atributo criado com sucesso.')
      setAttribute({ name: '', code: '', values: '' })
      await product.reload()
    } catch (error) {
      notify(errorMessage(error), 'error')
    }
  }

  async function addVariation(event: FormEvent) {
    event.preventDefault()
    try {
      await api.post(`/admin/products/${productId}/variations`, {
        displayName: variation.displayName,
        sku: variation.sku,
        priceOverride: variation.priceOverride ? Number(variation.priceOverride) : null,
        isAvailable: true,
        attributeValueIds: variation.attributeValueIds
      })
      notify('Variação criada com sucesso.')
      setVariation({ displayName: '', sku: '', priceOverride: '', attributeValueIds: [] })
      await product.reload()
    } catch (error) {
      notify(errorMessage(error), 'error')
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

  return (
    <Modal title="Gerenciar produto" onClose={onClose} wide>
      {product.loading ? (
        <Loading />
      ) : product.error || !product.data ? (
        <ErrorState message={product.error} />
      ) : (
        <>
          <div className="tabs">
            <button
              className={tab === 'photos' ? 'active' : ''}
              onClick={() => setTab('photos')}
            >
              Fotos
            </button>
            <button
              className={tab === 'attributes' ? 'active' : ''}
              onClick={() => setTab('attributes')}
            >
              Atributos
            </button>
            <button
              className={tab === 'variations' ? 'active' : ''}
              onClick={() => setTab('variations')}
            >
              Variações
            </button>
            <button
              className={tab === 'discounts' ? 'active' : ''}
              onClick={() => setTab('discounts')}
            >
              Descontos
            </button>
          </div>

          {tab === 'photos' && (
            <div>
              <div className="photo-manager">
                {product.data.photos.map(photo => (
                  <div key={photo.id}>
                    <ProductImage photoId={photo.id} alt={photo.altText || product.data!.name} />
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
                <small>Formatos aceitos: JPG, PNG, WebP • Limite máximo por imagem: 5 MB</small>
              </div>

              <div className="inline-form">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={e => handleFileSelect(e.target.files?.[0])}
                />
                <input
                  value={alt}
                  onChange={e => setAlt(e.target.value)}
                  placeholder="Texto alternativo (opcional)"
                />
                <button
                  className="btn btn-primary"
                  onClick={upload}
                  disabled={uploading || !file}
                >
                  <UploadCloud /> {uploading ? 'Enviando...' : 'Enviar foto'}
                </button>
              </div>

              {filePreview && (
                <div className="product-photo-preview-box" style={{ marginTop: '12px' }}>
                  <img src={filePreview} alt="Preview" className="product-form-preview" />
                  <div className="preview-meta">
                    <b>{file?.name}</b>
                    <small>{file ? (file.size / (1024 * 1024)).toFixed(2) : '0'} MB</small>
                  </div>
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

          {tab === 'attributes' && (
            <>
              <div className="chip-list">
                {product.data.attributes.map(attr => (
                  <span key={attr.id}>
                    <b>{attr.name}:</b> {attr.values.map(v => v.value).join(', ')}
                  </span>
                ))}
              </div>
              <form className="stack-form" onSubmit={addAttribute}>
                <Field label="Nome">
                  <input
                    required
                    value={attribute.name}
                    onChange={e => setAttribute({ ...attribute, name: e.target.value })}
                    placeholder="Ex.: Tamanho"
                  />
                </Field>
                <Field label="Código">
                  <input
                    required
                    value={attribute.code}
                    onChange={e => setAttribute({ ...attribute, code: e.target.value })}
                    placeholder="tamanho"
                  />
                </Field>
                <Field label="Valores separados por vírgula">
                  <input
                    required
                    value={attribute.values}
                    onChange={e => setAttribute({ ...attribute, values: e.target.value })}
                    placeholder="P, M, G, GG"
                  />
                </Field>
                <button className="btn btn-primary">Adicionar atributo</button>
              </form>
            </>
          )}

          {tab === 'variations' && (
            <>
              <div className="variation-list">
                {product.data.variations.map(item => (
                  <div key={item.id}>
                    <div>
                      <b>{item.displayName}</b>
                      <small>
                        SKU {item.sku} • {item.attributes.map(a => a.value).join(' / ')}
                      </small>
                    </div>
                    <b>{currency(item.price)}</b>
                  </div>
                ))}
              </div>
              <form className="stack-form" onSubmit={addVariation}>
                <div className="form-grid">
                  <Field label="Nome da variação">
                    <input
                      required
                      value={variation.displayName}
                      onChange={e => setVariation({ ...variation, displayName: e.target.value })}
                      placeholder="Ex.: Tamanho G"
                    />
                  </Field>
                  <Field label="SKU">
                    <input
                      required
                      value={variation.sku}
                      onChange={e => setVariation({ ...variation, sku: e.target.value })}
                      placeholder="CAM-G"
                    />
                  </Field>
                  <Field label="Preço específico (opcional)">
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={variation.priceOverride}
                      onChange={e =>
                        setVariation({ ...variation, priceOverride: e.target.value })
                      }
                      placeholder="Se deixar vazio, usa o preço base"
                    />
                  </Field>
                </div>
                <div className="attribute-selector">
                  {product.data.attributes.map(attr => (
                    <Field key={attr.id} label={attr.name}>
                      <select
                        required
                        value={
                          variation.attributeValueIds.find(id =>
                            attr.values.some(v => v.id === id)
                          ) || ''
                        }
                        onChange={e =>
                          setVariation({
                            ...variation,
                            attributeValueIds: [
                              ...variation.attributeValueIds.filter(
                                id => !attr.values.some(v => v.id === id)
                              ),
                              e.target.value
                            ]
                          })
                        }
                      >
                        <option value="">Selecione</option>
                        {attr.values.map(v => (
                          <option key={v.id} value={v.id}>
                            {v.value}
                          </option>
                        ))}
                      </select>
                    </Field>
                  ))}
                </div>
                <button className="btn btn-primary">Criar variação</button>
              </form>
            </>
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
