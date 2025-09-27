'use client'
import { useEffect, useState } from 'react'

const PaymentSettings = () => {
  const [form, setForm] = useState({
    stripeKey: '',
    paypalKey: '',
    codEnabled: true,
    mode: 'sandbox',
  })

  const [logs, setLogs] = useState<string[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)

  useEffect(() => {
    const fetchSettings = async () => {
      const res = await fetch('/api/settings/payment/')
      if (res.ok) {
        const data = await res.json()
        setForm(data)
      }
    }
    fetchSettings()
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const target = e.target as HTMLInputElement | HTMLSelectElement
    const { name, value, type } = target
    const checked = (type === 'checkbox') ? (target as HTMLInputElement).checked : undefined
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  const handleSave = async () => {
    const res = await fetch('/api/settings/payment/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    alert(res.ok ? 'Payment settings saved.' : 'Failed to save.')
  }

  const fetchLogs = async () => {
    setLoadingLogs(true)
    const res = await fetch('/api/settings/payment/logs/')
    if (res.ok) {
      const data = await res.json()
      setLogs(data.logs || [])
    }
    setLoadingLogs(false)
  }

  return (
    <div className="space-y-10 max-w-3xl text-black">
      {/* MAIN SETTINGS */}
      <section className="bg-white p-6 rounded-2xl shadow border border-gray-200">
        <h2 className="text-2xl font-bold text-[#891F1A] mb-4">💳 Payment Gateways</h2>

        <div className="space-y-4">
          <div>
            <label className="block font-medium mb-1">Stripe API Key</label>
            <input
              type="text"
              name="stripeKey"
              value={form.stripeKey}
              onChange={handleChange}
              className="input-field"
              placeholder="sk_live_..."
            />
          </div>

          <div>
            <label className="block font-medium mb-1">PayPal API Key</label>
            <input
              type="text"
              name="paypalKey"
              value={form.paypalKey}
              onChange={handleChange}
              className="input-field"
              placeholder="paypal_client_id"
            />
          </div>

          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              name="codEnabled"
              checked={form.codEnabled}
              onChange={handleChange}
              className="w-5 h-5"
            />
            <label className="text-black font-medium">Cash on Delivery Enabled</label>
          </div>

          <div>
            <label className="block font-medium mb-1">Payment Mode</label>
            <select
              name="mode"
              value={form.mode}
              onChange={handleChange}
              className="input-field"
            >
              <option value="sandbox">Sandbox</option>
              <option value="live">Live</option>
            </select>
          </div>
        </div>
      </section>

      {/* LOGS */}
      <section className="bg-white p-6 rounded-2xl shadow border border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-[#891F1A]">📜 Payment Logs</h2>
          <button
            onClick={fetchLogs}
            className="bg-gray-200 text-sm px-4 py-1.5 rounded hover:bg-gray-300"
          >
            {loadingLogs ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        <div className="bg-gray-50 rounded p-3 max-h-60 overflow-y-auto text-sm">
          {logs.length === 0 ? (
            <p className="text-gray-500 italic">No logs found.</p>
          ) : (
            <ul className="list-disc pl-4 space-y-1">{logs.map((log, i) => <li key={i}>{log}</li>)}</ul>
          )}
        </div>
      </section>

      <div className="pt-2">
        <button onClick={handleSave} className="btn-primary">
          Save Payment Settings
        </button>
      </div>

      <style jsx>{`
        .input-field {
          width: 100%;
          padding: 0.5rem;
          border-radius: 0.5rem;
          border: 1px solid #d1d5db;
          background: white;
        }

        .btn-primary {
          background: #891f1a;
          color: white;
          padding: 0.6rem 1.5rem;
          border-radius: 0.5rem;
          font-weight: 600;
        }

        .btn-primary:hover {
          background: #6d1915;
        }
      `}</style>
    </div>
  )
}

export default PaymentSettings
