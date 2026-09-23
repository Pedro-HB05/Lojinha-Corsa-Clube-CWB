export type Role = 'member' | 'administrator'

export interface AuthResponse {
  accessToken: string
  expiresAt: string
  userId: string
  memberId: string | null
  fullName: string
  email: string
  roles: Role[]
}

export interface Category {
  id: string
  name: string
  slug: string
  description?: string
  isActive?: boolean
}

export interface ProductPhoto {
  id: string
  altText?: string
  isPrimary?: boolean
  sortOrder?: number
}

export interface AttributeValue {
  id: string
  value: string
  isActive: boolean
}

export interface ProductAttribute {
  id: string
  name: string
  code: string
  isRequired: boolean
  values: AttributeValue[]
}

export interface ProductVariation {
  id: string
  sku: string
  displayName: string
  priceOverride?: number | null
  price: number
  isAvailable?: boolean
  attributes: Array<{
    attributeDefinitionId: string
    attributeValueId: string
    value: string
  }>
}

export interface QuantityDiscount {
  id: string
  minimumQuantity: number
  discountPerUnit: number
}

export interface ProductSummary {
  id: string
  name: string
  slug: string
  description: string
  basePrice: number
  categoryId: string | null
  isAvailable?: boolean
  photo?: ProductPhoto | null
  discounts: QuantityDiscount[]
}

export interface ProductDetail extends ProductSummary {
  isAvailable: boolean
  category?: Category
  photos: ProductPhoto[]
  attributes: ProductAttribute[]
  variations: ProductVariation[]
}

export interface PagedResult<T> {
  items: T[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

export interface MemberSummary {
  id: string
  fullName: string
  email?: string
  phone?: string
}

export interface Receipt {
  id: string
  sequenceNumber: number
  statusCode: string
  submittedAt: string
  reviewedAt?: string | null
  rejectionReasonCode?: string | null
  rejectionDetails?: string | null
  reportedAmount?: number
}

export interface OrderSummary {
  id: string
  orderNumber: string
  statusCode: string
  totalAmount: number
  placedAt: string
  member: Pick<MemberSummary, 'id' | 'fullName'>
  itemCount: number
}

export interface OrderDetail extends Omit<OrderSummary, 'itemCount'> {
  notes?: string
  member: MemberSummary
  items: Array<{
    id: string
    productId: string
    variationId: string
    productNameSnapshot: string
    variationNameSnapshot: string
    variationAttributesSnapshot?: string
    quantity: number
    unitPrice: number
    subtotal: number
  }>
  receipts: Receipt[]
}

export interface OrderHistory {
  id: number
  statusCode: string
  notes?: string
  createdAt: string
  changedBy?: string
}

export interface PixSettings {
  pixKey: string
  keyType: string
  beneficiaryName: string
  beneficiaryCity: string
  instructions?: string
}

export interface PendingPayment {
  id: string
  orderId: string
  orderNumber: string
  memberName: string
  statusCode: string
  submittedAt: string
  reportedAmount?: number
  orderTotal?: number
  sequenceNumber?: number
}

export interface DashboardData {
  [key: string]: number | string | null | undefined
}

export interface AdministratorSummary {
  id: string
  fullName: string
  email: string
  statusCode: string
  grantedAt: string
}

export interface BatchSummary {
  id: string
  batchNumber: string
  productId: string
  productName: string
  statusCode: string
  notes?: string
  totalQuantity: number
  createdAt: string
  closedAt?: string | null
}

export interface BatchDetail extends BatchSummary {
  orders: Array<{
    orderId: string
    orderNumber: string
    fullName: string
    items: unknown[]
  }>
  consolidation: Array<Record<string, unknown>>
}

export interface DeliveryReady {
  orderId: string
  orderNumber: number
  memberName: string
  totalAmount: number
  placedAt: string
  itemCount: number
  items: Array<{
    productNameSnapshot: string
    variationNameSnapshot: string
    quantity: number
  }>
}

export interface CartItem {
  productId: string
  productName: string
  photoId?: string
  variationId: string
  variationName: string
  unitPrice: number
  quantity: number
  discounts: QuantityDiscount[]
}
