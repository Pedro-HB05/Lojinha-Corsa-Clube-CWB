import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { CartItem } from '../types'

interface CartContextValue {
  items: CartItem[]
  itemCount: number
  subtotal: number
  discountTotal: number
  total: number
  unitPrice(item: CartItem): number
  lineTotal(item: CartItem): number
  add(item: CartItem): void
  update(variationId: string, quantity: number): void
  remove(variationId: string): void
  clear(): void
}

const CartContext = createContext<CartContextValue | null>(null)
const KEY = 'corsa.cart'

function initialItems(): CartItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '[]') as CartItem[]
    return parsed.map(item => ({ ...item, discounts: item.discounts || [] }))
  } catch { return [] }
}

function discountFor(items: CartItem[], item: CartItem) {
  const productQuantity = items.filter(current => current.productId === item.productId)
    .reduce((sum, current) => sum + current.quantity, 0)
  return [...(item.discounts || [])]
    .filter(rule => productQuantity >= rule.minimumQuantity)
    .sort((a, b) => b.minimumQuantity - a.minimumQuantity)[0]?.discountPerUnit || 0
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(initialItems)
  const persist = (next: CartItem[]) => { setItems(next); localStorage.setItem(KEY, JSON.stringify(next)) }
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  const total = items.reduce((sum, item) => sum + item.quantity * Math.max(0, item.unitPrice - discountFor(items, item)), 0)

  const value = useMemo<CartContextValue>(() => ({
    items,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal,
    discountTotal: subtotal - total,
    total,
    unitPrice(item) { return Math.max(0, item.unitPrice - discountFor(items, item)) },
    lineTotal(item) { return item.quantity * Math.max(0, item.unitPrice - discountFor(items, item)) },
    add(item) {
      const found = items.find(current => current.variationId === item.variationId)
      const next = found
        ? items.map(current => current.variationId === item.variationId
          ? { ...current, quantity: current.quantity + item.quantity, discounts: item.discounts }
          : current.productId === item.productId ? { ...current, discounts: item.discounts } : current)
        : [...items.map(current => current.productId === item.productId ? { ...current, discounts: item.discounts } : current), item]
      persist(next)
    },
    update(id, quantity) { persist(quantity <= 0 ? items.filter(item => item.variationId !== id) : items.map(item => item.variationId === id ? { ...item, quantity } : item)) },
    remove(id) { persist(items.filter(item => item.variationId !== id)) },
    clear() { persist([]) },
  }), [items, subtotal, total])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const value = useContext(CartContext)
  if (!value) throw new Error('useCart deve ser usado dentro de CartProvider')
  return value
}
