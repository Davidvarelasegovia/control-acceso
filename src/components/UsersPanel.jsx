import { useState, useEffect, useCallback } from 'react'
import { apiAuth } from '../utils/auth'

const vacio = { usuario: '', nombre: '', clave: '', rol: 'agente' }

const PERMISOS = {
  admin: {
    titulo: 'Administrador',
    color: 'text-gamer-danger',
    descripcion: 'Acceso total: personas, horarios, servicios, base de datos y usuarios.',
  },
  agente: {
    titulo: 'Agente',
    color: 'text-gamer-accent',
    descripcion: 'Solo puede editar horarios y servicios. Sin acceso a personas ni a la base de datos.',
  },
}

/**
 * Gestion de Agentes y administradores.
 * Solo un administrador puede ver y usar esta pantalla.
 */
export default function UsersPanel() {
  const [usuarios, setUsuarios] = useState([])
  const [form, setForm] = useState(vacio)
  const [editando, setEditando] = useState(null)
  const [nuevaClave, setNuevaClave] = useState('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [copiado, setCopiado] = useState('')

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      setUsuarios(await apiAuth.usuarios())
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const avisar = (t) => {
    setAviso(t)
    setTimeout(() => setAviso(''), 3500)
  }

  const crear = async (e) => {
    e.preventDefault()
    try {
      const nuevo = await apiAuth.crearUsuario(form)
      avisar(`Credenciales creadas para "${nuevo.usuario}"`)
      setForm(vacio)
      await cargar()
    } catch (err) {
      setError(err.message)
    }
  }

  const guardarEdicion = async (e) => {
    e.preventDefault()
    try {
      const datos = { nombre: form.nombre, rol: form.rol }
      if (nuevaClave) datos.clave = nuevaClave

      await apiAuth.actualizarUsuario(editando.id, datos)
      avisar(`Usuario "${editando.usuario}" actualizado`)
      setEditando(null)
      setForm(vacio)
      setNuevaClave('')
      await cargar()
    } catch (err) {
      setError(err.message)
    }
  }

  const alternarActivo = async (u) => {
    try {
      await apiAuth.actualizarUsuario(u.id, { activo: u.activo ? 0 : 1 })
      avisar(`"${u.usuario}" ${u.activo ? 'desactivado' : 'activado'}`)
      await cargar()
    } catch (err) {
      setError(err.message)
    }
  }

  const eliminar = async (u) => {
    if (!confirm(`¿Eliminar a "${u.nombre}" (${u.usuario})?\n\nNo podrá volver a entrar al sistema.`))
      return
    try {
      await apiAuth.eliminarUsuario(u.id)
      avisar('Usuario eliminado')
      await cargar()
    } catch (err) {
      setError(err.message)
    }
  }

  const copiar = async (texto) => {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(texto)
      setTimeout(() => setCopiado(''), 2000)
    } catch {
      avisar('No se pudo copiar, selecciónalo manualmente')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Usuarios y Agentes</h2>
        <p className="text-gray-400 text-sm mt-1">
          Crea credenciales de ingreso. El <strong className="text-gamer-danger">administrador</strong>{' '}
          tiene acceso total; el <strong className="text-gamer-accent">agente</strong> solo puede
          editar horarios y servicios.
        </p>
      </div>

      {error && (
        <div className="gamer-card p-4 border-gamer-danger/50 bg-gamer-danger/5 text-gamer-danger text-sm">
          {error}
        </div>
      )}
      {aviso && (
        <div className="gamer-card p-4 border-gamer-success/50 bg-gamer-success/5 text-gamer-success text-sm">
          {aviso}
        </div>
      )}

      {/* Credenciales de la última creación */}
      {copiado && (
        <div className="gamer-card p-4 border-gamer-accent/50 bg-gamer-accent/5">
          <div className="text-sm text-gray-300 mb-2">
            Entrega estos datos a la persona. Se muestran una sola vez en pantalla:
          </div>
          <div className="flex flex-wrap gap-2">
            <code className="px-3 py-1.5 rounded bg-gamer-darker border border-gamer-light-gray/40 text-gamer-accent font-mono text-sm">
              {copiado}
            </code>
            <button onClick={() => copiar(copiado)} className="gamer-btn text-xs">
              Copiar
            </button>
          </div>
        </div>
      )}

      {/* Formulario */}
      <form onSubmit={editando ? guardarEdicion : crear} className="gamer-card p-6">
        <h3 className="text-sm uppercase tracking-wider text-gray-400 mb-4">
          {editando ? `Editar: ${editando.usuario}` : 'Generar credenciales'}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Usuario</label>
            <input
              required
              disabled={!!editando}
              value={form.usuario}
              onChange={(e) => setForm({ ...form, usuario: e.target.value.toLowerCase() })}
              className="gamer-input"
              placeholder="jperez"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Nombre</label>
            <input
              required
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              className="gamer-input"
              placeholder="Juan Pérez"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Contraseña {editando && <span className="text-gray-600">(opcional)</span>}
            </label>
            <input
              type="text"
              required={!editando}
              value={editando ? nuevaClave : form.clave}
              onChange={(e) =>
                editando ? setNuevaClave(e.target.value) : setForm({ ...form, clave: e.target.value })
              }
              className="gamer-input font-mono"
              placeholder="mínimo 4 caracteres"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Permisos</label>
            <select
              value={form.rol}
              onChange={(e) => setForm({ ...form, rol: e.target.value })}
              className="gamer-input"
            >
              <option value="agente">Agente — horarios y servicios</option>
              <option value="admin">Administrador — acceso total</option>
            </select>
          </div>
        </div>

        <p className="text-xs text-gray-500 mt-3">{PERMISOS[form.rol]?.descripcion}</p>

        <div className="flex gap-2 justify-end mt-4">
          {editando && (
            <button
              type="button"
              onClick={() => {
                setEditando(null)
                setForm(vacio)
                setNuevaClave('')
              }}
              className="gamer-btn-danger"
            >
              Cancelar
            </button>
          )}
          <button type="submit" className="gamer-btn-success">
            {editando ? 'Guardar cambios' : 'Crear credenciales'}
          </button>
        </div>
      </form>

      {/* Lista */}
      <div className="gamer-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gamer-light-gray/50">
                {['Usuario', 'Nombre', 'Rol', 'Último ingreso', 'Estado', 'Acciones'].map((h) => (
                  <th key={h} className="text-left p-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className="border-b border-gamer-light-gray/20 hover:bg-gamer-light-gray/10">
                  <td className="p-3 text-white font-mono">{u.usuario}</td>
                  <td className="p-3 text-gray-300">{u.nombre}</td>
                  <td className="p-3">
                    <span className={`text-xs font-bold ${PERMISOS[u.rol]?.color || 'text-gray-400'}`}>
                      {PERMISOS[u.rol]?.titulo || u.rol}
                    </span>
                  </td>
                  <td className="p-3 text-gray-500 text-xs">
                    {u.ultimo_acceso ? new Date(u.ultimo_acceso).toLocaleString('es-CL') : 'nunca'}
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => alternarActivo(u)}
                      className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        u.activo
                          ? 'bg-gamer-success/20 text-gamer-success'
                          : 'bg-gamer-gray/30 text-gray-500'
                      }`}
                    >
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </button>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditando(u)
                          setForm({ usuario: u.usuario, nombre: u.nombre, clave: '', rol: u.rol })
                          setNuevaClave('')
                          window.scrollTo({ top: 0, behavior: 'smooth' })
                        }}
                        className="px-3 py-1.5 rounded-lg bg-gamer-accent/10 text-gamer-accent hover:bg-gamer-accent/25 text-xs"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => eliminar(u)}
                        className="px-3 py-1.5 rounded-lg bg-gamer-danger/10 text-gamer-danger hover:bg-gamer-danger/25 text-xs"
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {cargando && <div className="p-8 text-center text-gray-500">Cargando…</div>}
      </div>
    </div>
  )
}
