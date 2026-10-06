const SYNC_KEY = 'access_control_pending_sync'
const SYNC_STATUS_KEY = 'access_control_sync_status'

export function getPendingSync() {
  const data = localStorage.getItem(SYNC_KEY)
  return data ? JSON.parse(data) : []
}

export function addPendingSync(record) {
  const pending = getPendingSync()
  pending.push({ ...record, syncId: Date.now(), synced: false })
  localStorage.setItem(SYNC_KEY, JSON.stringify(pending))
  updateSyncStatus()
}

export function markAsSynced(syncIds) {
  const pending = getPendingSync()
  const updated = pending.map(p => 
    syncIds.includes(p.syncId) ? { ...p, synced: true } : p
  )
  localStorage.setItem(SYNC_KEY, JSON.stringify(updated))
  updateSyncStatus()
}

export function getSyncStatus() {
  const pending = getPendingSync()
  const unsynced = pending.filter(p => !p.synced)
  return {
    pending: unsynced.length,
    total: pending.length,
    isSynced: unsynced.length === 0,
  }
}

export function updateSyncStatus() {
  const status = getSyncStatus()
  localStorage.setItem(SYNC_STATUS_KEY, JSON.stringify({
    ...status,
    lastUpdate: new Date().toISOString()
  }))
  window.dispatchEvent(new Event('syncStatusChanged'))
}

export function syncData() {
  const pending = getPendingSync()
  const unsynced = pending.filter(p => !p.synced)

  if (unsynced.length === 0) {
    return Promise.resolve({ success: true, message: 'No hay datos para sincronizar' })
  }

  // Simular sincronización con servidor
  // En producción, aquí iría la lógica real de sincronización con el backend
  return new Promise((resolve) => {
    setTimeout(() => {
      const syncIds = unsynced.map(p => p.syncId)
      markAsSynced(syncIds)
      resolve({ 
        success: true, 
        message: `${unsynced.length} registros sincronizados correctamente`,
        count: unsynced.length 
      })
    }, 1500)
  })
}

export function clearSyncData() {
  localStorage.removeItem(SYNC_KEY)
  localStorage.removeItem(SYNC_STATUS_KEY)
  updateSyncStatus()
}
