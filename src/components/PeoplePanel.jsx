import { useState, useEffect, useCallback } from 'react'
import api from '../utils/api'
import { normalizar } from '../utils/identificador'

export default function PeoplePanel() {
  const [people, setPeople] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState(null)
  const [formData, setFormData] = useState({ nombres: '', apellidos: '', rut: '', empresa: '' })
  const [search, setSearch] = useState('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [auditoria, setAuditoria] = useState(null)
  const [aviso, setAviso] = useState('')

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      setPeople(await api.personas())
      setError('')
      // La auditoria de RUTs es exclusiva del panel admin: solo se pide
      // si hay sesion iniciada, para no generar errores en la pantalla principal.
      if (localStorage.getItem('control_acceso_token')) {
        try {
          setAuditoria(await api.auditarRuts())
        } catch {
          setAuditoria(null)
        }
      }
    } catch (e) {
      setError(e.offline ? 'Sin conexión con el servidor de base de datos.' : e.message)
    } finally {
      setCargando(false)
    }
  }, [])

  const avisar = (texto) => {
    setAviso(texto)
    setTimeout(() => setAviso(''), 4000)
  }

  useEffect(() => {
    cargar()
  }, [cargar])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      if (editando) {
        await api.actualizarPersona(editando.id, formData)
        avisar(`"${formData.nombres} ${formData.apellidos}" fue actualizado correctamente en la base de datos`)
      } else {
        const nueva = await api.crearPersona(formData)
        avisar(`"${nueva.nombres} ${nueva.apellidos}" fue ingresado de manera correcta en la base de datos`)
      }
      resetForm()
      await cargar()
    } catch (err) {
      setError(err.message)
    }
  }

  const resetForm = () => {
    setFormData({ nombres: '', apellidos: '', rut: '', empresa: '' })
    setShowForm(false)
    setEditando(null)
  }

  const handleEdit = (p) => {
    setFormData({
      nombres: p.nombres,
      apellidos: p.apellidos,
      rut: p.rut,
      empresa: p.empresa || '',
    })
    setEditando(p)
    setShowForm(true)
  }

  const handleDelete = async (p) => {
    if (!confirm(`¿Eliminar a ${p.nombres} ${p.apellidos}?\n\nLos registros de sus ingresos se conservan.`))
      return
    try {
      await api.eliminarPersona(p.id)
      avisar(`"${p.nombres} ${p.apellidos}" fue eliminado de la base de datos`)
      await cargar()
    } catch (err) {
      setError(err.message)
    }
  }

  const filtrados = people.filter((p) =>
    `${p.nombres} ${p.apellidos} ${p.rut} ${p.empresa || ''}`
      .toLowerCase()
      .includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="gamer-title">Gestión de Personas</h2>
          <p className="text-gray-400 text-sm mt-1">
            {people.length} {people.length === 1 ? 'persona registrada' : 'personas registradas'}
          </p>
        </div>
        <button onClick={() => setShowForm(true)} className="gamer-btn-success flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nueva Persona
        </button>
      </div>

      {error && (
        <div className="gamer-card p-4 border-gamer-danger/50 bg-gamer-danger/5 text-gamer-danger text-sm">
          {error}
        </div>
      )}

      {aviso && (
        <div className="gamer-card p-4 border-gamer-success/50 bg-gamer-success/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gamer-success/20 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-gamer-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className="text-gamer-success text-sm font-medium animate-pulse">{aviso}</span>
          </div>
        </div>
      )}

      {auditoria && auditoria.problemas?.length > 0 && (
        <div className="gamer-card p-4 border-gamer-warning/50 bg-gamer-warning/5">
          <div className="text-gamer-warning font-semibold text-sm mb-1">
            ⚠ {auditoria.problemas.length} identificador(es) vacío(s) o repetido(s)
          </div>
          <ul className="text-gray-400 text-xs space-y-0.5">
            {auditoria.problemas.map((p, i) => (
              <li key={p.id ?? i}>
                {p.nombres || '(sin nombre)'} — <span className="font-mono">{p.rut || '(vacío)'}</span>:{' '}
                {p.motivo}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="relative">
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Buscar por nombre, RUT o empresa..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="gamer-input pl-12"
        />
      </div>

      {showForm && (
        <div className="gamer-card p-6 fade-in">
          <h3 className="text-lg font-semibold text-white mb-4">
            {editando ? 'Editar Persona' : 'Nueva Persona'}
          </h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Nombres</label>
              <input
                type="text"
                required
                value={formData.nombres}
                onChange={(e) => setFormData({ ...formData, nombres: e.target.value })}
                className="gamer-input"
                placeholder="Juan Carlos"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Apellidos</label>
              <input
                type="text"
                required
                value={formData.apellidos}
                onChange={(e) => setFormData({ ...formData, apellidos: e.target.value })}
                className="gamer-input"
                placeholder="Pérez González"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Identificador / RUT
                <span className="text-gray-600 text-xs ml-1">
                  (cualquier formato, con o sin verificador)
                </span>
              </label>
              <input
                type="text"
                required
                value={formData.rut}
                onChange={(e) => setFormData({ ...formData, rut: e.target.value })}
                className="gamer-input"
                placeholder="12.345.678-5  ·  13874809-K  ·  123"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Empresa</label>
              <input
                type="text"
                value={formData.empresa}
                onChange={(e) => setFormData({ ...formData, empresa: e.target.value })}
                className="gamer-input"
                placeholder="Nombre de la empresa"
              />
            </div>
            <div className="md:col-span-2 flex gap-3 justify-end">
              <button type="button" onClick={resetForm} className="gamer-btn-danger">
                Cancelar
              </button>
              <button type="submit" className="gamer-btn-success">
                {editando ? 'Actualizar' : 'Guardar'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="gamer-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gamer-light-gray/50">
                <th className="text-left p-4 text-sm font-semibold text-gray-400 uppercase tracking-wider">Nombre</th>
                <th className="text-left p-4 text-sm font-semibold text-gray-400 uppercase tracking-wider">RUT</th>
                <th className="text-left p-4 text-sm font-semibold text-gray-400 uppercase tracking-wider">Empresa</th>
                <th className="text-right p-4 text-sm font-semibold text-gray-400 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p) => (
                <tr key={p.id} className="border-b border-gamer-light-gray/30 hover:bg-gamer-light-gray/20 transition-colors">
                  <td className="p-4">
                    <div className="text-white font-medium">
                      {p.nombres} {p.apellidos}
                    </div>
                    {!p.activo && <span className="text-xs text-gray-500">inactivo</span>}
                  </td>
                  <td className="p-4">
                    <span className="text-gray-300 font-mono text-sm">{p.rut}</span>
                  </td>
                  <td className="p-4">
                    <span className="text-gray-400">{p.empresa || '—'}</span>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleEdit(p)}
                        className="p-2 rounded-lg bg-gamer-accent/10 text-gamer-accent hover:bg-gamer-accent/20 transition-colors"
                        title="Editar"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(p)}
                        className="p-2 rounded-lg bg-gamer-danger/10 text-gamer-danger hover:bg-gamer-danger/20 transition-colors"
                        title="Eliminar"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!cargando && filtrados.length === 0 && (
          <div className="p-8 text-center text-gray-500">No se encontraron personas</div>
        )}
        {cargando && <div className="p-8 text-center text-gray-500">Cargando…</div>}
      </div>
    </div>
  )
}
