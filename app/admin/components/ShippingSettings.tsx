'use client'
import { useState, useEffect } from 'react'

const defaultZone = { zoneName: '', country: '', type: 'flat', price: 0 }

const ShippingSettings = () => {
  const [zones, setZones] = useState([defaultZone])
  const [integrations, setIntegrations] = useState({ aramex: false, dhl: false })

  useEffect(() => {
    const fetchSettings = async () => {
      const res = await fetch('/api/settings/shipping/')
      if (res.ok) {
        const data = await res.json()
        setZones(data.zones || [defaultZone])
        setIntegrations(data.integrations || { aramex: false, dhl: false })
      }
    }
    fetchSettings()
  }, [])

  const updateZone = (index: number, field: string, value: any) => {
    const updated = [...zones]
    updated[index] = { ...updated[index], [field]: value }
    setZones(updated)
  }

  const addZone = () => setZones([...zones, defaultZone])
  const removeZone = (index: number) => {
    const updated = zones.filter((_, i) => i !== index)
    setZones(updated.length ? updated : [defaultZone])
  }

  const toggleIntegration = (key: string) => {
    setIntegrations(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSave = async () => {
    const res = await fetch('/api/settings/shipping/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zones, integrations }),
    })
    alert(res.ok ? 'Shipping settings saved successfully!' : 'Failed to save.')
  }

  return (
    <div className="space-y-10 max-w-4xl text-black">
      {/* ZONES */}
      <section className="bg-white p-6 rounded-2xl shadow border border-gray-200">
        <h2 className="text-2xl font-bold text-[#891F1A] mb-4">🚚 Shipping Zones</h2>

        {zones.map((zone, idx) => (
          <div key={idx} className="relative p-4 border rounded-lg border-gray-300 bg-gray-50 mb-4 shadow-sm">
            <button
              onClick={() => removeZone(idx)}
              className="absolute top-2 right-2 text-red-600 text-sm hover:underline"
            >
              Remove
            </button>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium mb-1">Zone Name</label>
                <input
                  type="text"
                  value={zone.zoneName}
                  onChange={e => updateZone(idx, 'zoneName', e.target.value)}
                  className="input-field"
                  placeholder="e.g. UAE Zone"
                />
              </div>

              <div>
                <label className="block font-medium mb-1">Country</label>
                <select
                  value={zone.country}
                  onChange={e => updateZone(idx, 'country', e.target.value)}
                  className="input-field"
                >
                  <option value="">Select country</option>
                  <option value="UAE">UAE</option>
                  <option value="Saudi Arabia">Saudi Arabia</option>
                  <option value="Kuwait">Kuwait</option>
                  <option value="Qatar">Qatar</option>
                  <option value="Bahrain">Bahrain</option>
                </select>
              </div>

              <div>
                <label className="block font-medium mb-1">Shipping Type</label>
                <select
                  value={zone.type}
                  onChange={e => updateZone(idx, 'type', e.target.value)}
                  className="input-field"
                >
                  <option value="flat">Flat Rate</option>
                  <option value="weight">Weight-Based</option>
                </select>
              </div>

              <div>
                <label className="block font-medium mb-1">
                  {zone.type === 'flat' ? 'Flat Rate Price' : 'Price per KG'}
                </label>
                <input
                  type="number"
                  value={zone.price}
                  onChange={e => updateZone(idx, 'price', parseFloat(e.target.value))}
                  className="input-field"
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>
        ))}

        <button onClick={addZone} className="text-sm px-4 py-2 rounded bg-gray-200 hover:bg-gray-300">
          + Add Zone
        </button>
      </section>

      {/* INTEGRATIONS */}
      <section className="bg-white p-6 rounded-2xl shadow border border-gray-200">
        <h2 className="text-2xl font-bold text-[#891F1A] mb-4">🔌 API Integrations</h2>

        <div className="space-y-4">
          {['aramex', 'dhl'].map((provider) => (
            <div key={provider} className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={integrations[provider as keyof typeof integrations]}
                onChange={() => toggleIntegration(provider)}
                className="w-5 h-5"
              />
              <label className="text-black font-medium capitalize">Enable {provider} API</label>
            </div>
          ))}
        </div>
      </section>

      <div className="pt-2">
        <button onClick={handleSave} className="btn-primary">
          Save Shipping Settings
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

export default ShippingSettings
