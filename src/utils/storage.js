const STORAGE_KEYS = {
  PEOPLE: 'access_control_people',
  SCHEDULES: 'access_control_schedules',
  RECORDS: 'access_control_records',
  MENU_ITEMS: 'access_control_menu_items',
  VENUE_CONFIG: 'access_control_venue_config',
  ACCESS_URLS: 'access_control_urls',
}

const DEFAULT_PEOPLE = [
  { id: 1, nombres: 'Juan Carlos', apellidos: 'Pérez González', rut: '12.345.678-5', empresa: 'TechCorp Ltda.' },
  { id: 2, nombres: 'María Fernanda', apellidos: 'López Martínez', rut: '98.765.432-1', empresa: 'Innovaciones SA' },
  { id: 3, nombres: 'Carlos Alberto', apellidos: 'Rodríguez Silva', rut: '11.222.333-4', empresa: 'Construcciones XYZ' },
  { id: 4, nombres: 'Ana María', apellidos: 'González Pérez', rut: '15.678.901-2', empresa: 'Servicios Integrales' },
  { id: 5, nombres: 'Roberto Andrés', apellidos: 'Martínez López', rut: '87.654.321-0', empresa: 'Logística Express' },
]

const DEFAULT_SCHEDULES = [
  { id: 1, nombre: 'Horario de Colación', horaInicio: '13:00', horaFin: '14:00', descripcion: 'Tiempo de almuerzo' },
  { id: 2, nombre: 'Turno Mañana', horaInicio: '08:00', horaFin: '13:00', descripcion: 'Jornada matutina' },
  { id: 3, nombre: 'Turno Tarde', horaInicio: '14:00', horaFin: '18:00', descripcion: 'Jornada vespertina' },
]

const DEFAULT_MENU_ITEMS = [
  { id: 1, nombre: 'Inicio', icono: '🏠', ruta: 'inicio', activo: true },
  { id: 2, nombre: 'Personas', icono: '👥', ruta: 'personas', activo: true },
  { id: 3, nombre: 'Horarios', icono: '🕐', ruta: 'horarios', activo: true },
  { id: 4, nombre: 'Registros', icono: '📋', ruta: 'registros', activo: true },
  { id: 5, nombre: 'Configuración', icono: '⚙️', ruta: 'configuracion', activo: true },
]

const DEFAULT_VENUE_CONFIG = {
  nombre: 'Hospital Sur',
  direccion: 'Av. Principal 1234',
  logo: '',
}

const DEFAULT_ACCESS_URLS = [
  { id: 1, nombre: 'Acceso 1 - Puerta Norte', url: '/acceso-1', activo: true },
  { id: 2, nombre: 'Acceso 2 - Puerta Sur', url: '/acceso-2', activo: true },
]

export function getPeople() {
  const data = localStorage.getItem(STORAGE_KEYS.PEOPLE)
  if (!data) {
    localStorage.setItem(STORAGE_KEYS.PEOPLE, JSON.stringify(DEFAULT_PEOPLE))
    return DEFAULT_PEOPLE
  }
  return JSON.parse(data)
}

export function savePeople(people) {
  localStorage.setItem(STORAGE_KEYS.PEOPLE, JSON.stringify(people))
}

export function addPerson(person) {
  const people = getPeople()
  const newPerson = { ...person, id: Date.now() }
  people.push(newPerson)
  savePeople(people)
  return newPerson
}

export function updatePerson(id, updates) {
  const people = getPeople()
  const index = people.findIndex(p => p.id === id)
  if (index !== -1) {
    people[index] = { ...people[index], ...updates }
    savePeople(people)
    return people[index]
  }
  return null
}

export function deletePerson(id) {
  const people = getPeople()
  const filtered = people.filter(p => p.id !== id)
  savePeople(filtered)
}

export function findPersonByRut(rut) {
  const people = getPeople()
  const normalizedRut = rut.replace(/[.\-]/g, '').toLowerCase()
  return people.find(p => p.rut.replace(/[.\-]/g, '').toLowerCase() === normalizedRut)
}

export function getSchedules() {
  const data = localStorage.getItem(STORAGE_KEYS.SCHEDULES)
  if (!data) {
    localStorage.setItem(STORAGE_KEYS.SCHEDULES, JSON.stringify(DEFAULT_SCHEDULES))
    return DEFAULT_SCHEDULES
  }
  return JSON.parse(data)
}

export function saveSchedules(schedules) {
  localStorage.setItem(STORAGE_KEYS.SCHEDULES, JSON.stringify(schedules))
}

export function addSchedule(schedule) {
  const schedules = getSchedules()
  const newSchedule = { ...schedule, id: Date.now() }
  schedules.push(newSchedule)
  saveSchedules(schedules)
  return newSchedule
}

export function updateSchedule(id, updates) {
  const schedules = getSchedules()
  const index = schedules.findIndex(s => s.id === id)
  if (index !== -1) {
    schedules[index] = { ...schedules[index], ...updates }
    saveSchedules(schedules)
    return schedules[index]
  }
  return null
}

export function deleteSchedule(id) {
  const schedules = getSchedules()
  const filtered = schedules.filter(s => s.id !== id)
  saveSchedules(filtered)
}

export function getRecords() {
  const data = localStorage.getItem(STORAGE_KEYS.RECORDS)
  return data ? JSON.parse(data) : []
}

export function saveRecords(records) {
  localStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(records))
}

export function addRecord(record) {
  const records = getRecords()
  const newRecord = { ...record, id: Date.now(), timestamp: new Date().toISOString() }
  records.unshift(newRecord)
  saveRecords(records)
  return newRecord
}

export function getMenuItems() {
  const data = localStorage.getItem(STORAGE_KEYS.MENU_ITEMS)
  if (!data) {
    localStorage.setItem(STORAGE_KEYS.MENU_ITEMS, JSON.stringify(DEFAULT_MENU_ITEMS))
    return DEFAULT_MENU_ITEMS
  }
  return JSON.parse(data)
}

export function saveMenuItems(items) {
  localStorage.setItem(STORAGE_KEYS.MENU_ITEMS, JSON.stringify(items))
}

export function getVenueConfig() {
  const data = localStorage.getItem(STORAGE_KEYS.VENUE_CONFIG)
  if (!data) {
    localStorage.setItem(STORAGE_KEYS.VENUE_CONFIG, JSON.stringify(DEFAULT_VENUE_CONFIG))
    return DEFAULT_VENUE_CONFIG
  }
  return JSON.parse(data)
}

export function saveVenueConfig(config) {
  localStorage.setItem(STORAGE_KEYS.VENUE_CONFIG, JSON.stringify(config))
}

export function getAccessUrls() {
  const data = localStorage.getItem(STORAGE_KEYS.ACCESS_URLS)
  if (!data) {
    localStorage.setItem(STORAGE_KEYS.ACCESS_URLS, JSON.stringify(DEFAULT_ACCESS_URLS))
    return DEFAULT_ACCESS_URLS
  }
  return JSON.parse(data)
}

export function saveAccessUrls(urls) {
  localStorage.setItem(STORAGE_KEYS.ACCESS_URLS, JSON.stringify(urls))
}

export function addAccessUrl(url) {
  const urls = getAccessUrls()
  const newUrl = { ...url, id: Date.now() }
  urls.push(newUrl)
  saveAccessUrls(urls)
  return newUrl
}

export function updateAccessUrl(id, updates) {
  const urls = getAccessUrls()
  const index = urls.findIndex(u => u.id === id)
  if (index !== -1) {
    urls[index] = { ...urls[index], ...updates }
    saveAccessUrls(urls)
    return urls[index]
  }
  return null
}

export function deleteAccessUrl(id) {
  const urls = getAccessUrls()
  const filtered = urls.filter(u => u.id !== id)
  saveAccessUrls(filtered)
}

export function isWithinSchedule(schedules, date = new Date()) {
  const currentTime = date.toTimeString().slice(0, 5)
  return schedules.some(s => currentTime >= s.horaInicio && currentTime <= s.horaFin)
}

export function getCurrentSchedule(schedules, date = new Date()) {
  const currentTime = date.toTimeString().slice(0, 5)
  return schedules.find(s => currentTime >= s.horaInicio && currentTime <= s.horaFin)
}

export function hasRecentEntry(rut, minutesWindow = 5) {
  const records = getRecords()
  const normalizedRut = rut.replace(/[.\-]/g, '').toLowerCase()
  const now = new Date()
  const windowStart = new Date(now.getTime() - minutesWindow * 60000)

  return records.some(r => {
    const recordRut = r.rut.replace(/[.\-]/g, '').toLowerCase()
    const recordTime = new Date(r.timestamp)
    return recordRut === normalizedRut && recordTime >= windowStart && recordTime <= now
  })
}

export function getStats() {
  const records = getRecords()
  return {
    total: records.length,
    autorizados: records.filter(r => r.estado === 'autorizado').length,
    duplicados: records.filter(r => r.estado === 'duplicado').length,
    noEncontrados: records.filter(r => r.estado === 'no-encontrado').length,
  }
}

export { STORAGE_KEYS, DEFAULT_PEOPLE, DEFAULT_SCHEDULES, DEFAULT_MENU_ITEMS, DEFAULT_VENUE_CONFIG, DEFAULT_ACCESS_URLS }
