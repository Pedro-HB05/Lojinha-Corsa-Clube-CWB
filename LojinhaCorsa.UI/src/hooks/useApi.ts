import { useCallback, useEffect, useState } from 'react'
import { errorMessage } from '../utils/format'

export function useApi<T>(loader: () => Promise<T>, dependencies: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setData(await loader()) }
    catch (reason) { setError(errorMessage(reason)) }
    finally { setLoading(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies)

  useEffect(() => { void load() }, [load])
  return { data, setData, loading, error, reload: load }
}
