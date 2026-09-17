import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, Phone, UserRound } from 'lucide-react'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Field } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'
import { errorMessage } from '../utils/format'

export function LoginPage() {
  const { user, login, loading, hasRole } = useAuth()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const navigate = useNavigate(); const location = useLocation()
  if (user) return <Navigate to={hasRole('administrator') ? '/admin' : '/'} replace />
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('')
    try {
      const session = await login(form.email, form.password)
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname
      navigate(from || (session.roles.includes('administrator') ? '/admin' : '/'), { replace: true })
    } catch (reason) { setError(errorMessage(reason)) }
  }
  return (
    <section className="auth-card" aria-labelledby="login-title">
      <header className="auth-card-header">
        <span className="eyebrow">Bem-vindo de volta</span>
        <h2 id="login-title">Entre na sua conta</h2>
        <p>Acompanhe seus pedidos e acesse os produtos do clube.</p>
      </header>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <form className="auth-form" onSubmit={submit}>
        <Field label="E-mail">
          <div className="input-icon">
            <Mail aria-hidden="true" />
            <input required autoComplete="email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="voce@email.com" />
          </div>
        </Field>
        <Field label="Senha">
          <PasswordInput autoComplete="current-password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Digite sua senha" />
        </Field>
        <button type="submit" className="btn btn-primary btn-block auth-submit" disabled={loading}>{loading ? 'Entrando...' : <>Entrar <ArrowRight size={18} /></>}</button>
      </form>

      <div className="auth-switch">Ainda não tem uma conta? <Link to="/cadastro">Cadastre-se</Link></div>
    </section>
  )
}

export function RegisterPage() {
  const { user, register, loading } = useAuth()
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const navigate = useNavigate()
  if (user) return <Navigate to="/" replace />
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('')
    if (form.password !== form.confirm) return setError('As senhas não coincidem.')
    try { await register(form); navigate('/') } catch (reason) { setError(errorMessage(reason)) }
  }
  const change = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: event.target.value })
  return (
    <section className="auth-card auth-card-wide" aria-labelledby="register-title">
      <header className="auth-card-header">
        <span className="eyebrow">Faça parte</span>
        <h2 id="register-title">Crie sua conta</h2>
        <p>Preencha seus dados para começar. Leva menos de um minuto.</p>
      </header>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <form className="auth-form" onSubmit={submit}>
        <div className="form-grid auth-register-grid">
          <Field label="Nome completo">
            <div className="input-icon"><UserRound aria-hidden="true" /><input required autoComplete="name" value={form.fullName} onChange={change('fullName')} placeholder="Seu nome completo" /></div>
          </Field>
          <Field label="E-mail">
            <div className="input-icon"><Mail aria-hidden="true" /><input required autoComplete="email" type="email" value={form.email} onChange={change('email')} placeholder="voce@email.com" /></div>
          </Field>
          <Field label="Telefone (opcional)">
            <div className="input-icon"><Phone aria-hidden="true" /><input autoComplete="tel" inputMode="tel" value={form.phone} onChange={change('phone')} placeholder="(41) 99999-9999" /></div>
          </Field>
          <Field label="Senha">
            <PasswordInput autoComplete="new-password" value={form.password} onChange={change('password')} placeholder="Mínimo de 8 caracteres" />
          </Field>
          <Field label="Confirme a senha">
            <PasswordInput autoComplete="new-password" value={form.confirm} onChange={change('confirm')} placeholder="Repita sua senha" />
          </Field>
        </div>
        <button type="submit" className="btn btn-primary btn-block auth-submit" disabled={loading}>{loading ? 'Criando conta...' : <>Criar conta <ArrowRight size={18} /></>}</button>
      </form>

      <div className="auth-switch">Já tem uma conta? <Link to="/entrar">Entrar</Link></div>
    </section>
  )
}

type PasswordInputProps = {
  autoComplete: 'current-password' | 'new-password'
  value: string
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  placeholder: string
}

function PasswordInput({ autoComplete, value, onChange, placeholder }: PasswordInputProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="input-icon input-with-action">
      <LockKeyhole aria-hidden="true" />
      <input
        required
        autoComplete={autoComplete}
        minLength={8}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />
      <button
        className="password-toggle"
        type="button"
        onClick={() => setVisible(current => !current)}
        aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
        aria-pressed={visible}
        title={visible ? 'Ocultar senha' : 'Mostrar senha'}
      >
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </button>
    </div>
  )
}
