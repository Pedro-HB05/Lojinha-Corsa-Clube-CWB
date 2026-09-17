import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './guards/ProtectedRoute'
import { AdminLayout } from './layouts/AdminLayout'
import { MemberLayout } from './layouts/MemberLayout'
import { PublicLayout } from './layouts/PublicLayout'
import { LoginPage, RegisterPage } from './pages/AuthPages'
import { CartPage, CheckoutPage, HomePage, OrderDetailPage, OrdersPage, ProductDetailPage, ProductsPage } from './pages/MemberPages'
import { AdminBatchesPage, AdminBatchDetailPage, AdminDashboardPage, AdminDeliveriesPage, AdminOrdersPage, AdminPaymentsPage, AdminProductsPage, AdminSettingsPage } from './pages/AdminPages'

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/entrar" element={<LoginPage />} />
        <Route path="/cadastro" element={<RegisterPage />} />
      </Route>

      <Route element={<MemberLayout />}>
        <Route index element={<HomePage />} />
        <Route path="/produtos" element={<ProductsPage />} />
        <Route path="/produtos/:id" element={<ProductDetailPage />} />
        <Route path="/carrinho" element={<CartPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/finalizar" element={<CheckoutPage />} />
          <Route path="/pedidos" element={<OrdersPage />} />
          <Route path="/pedidos/:id" element={<OrderDetailPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute role="administrator" />}>
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<AdminDashboardPage />} />
          <Route path="/admin/produtos" element={<AdminProductsPage />} />
          <Route path="/admin/pedidos" element={<AdminOrdersPage />} />
          <Route path="/admin/pagamentos" element={<AdminPaymentsPage />} />
          <Route path="/admin/lotes" element={<AdminBatchesPage />} />
          <Route path="/admin/lotes/:id" element={<AdminBatchDetailPage />} />
          <Route path="/admin/entregas" element={<AdminDeliveriesPage />} />
          <Route path="/admin/configuracoes" element={<AdminSettingsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
