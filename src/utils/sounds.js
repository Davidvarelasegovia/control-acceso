let audioContext = null

function getAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)()
  }
  return audioContext
}

function playTone(frequency, duration, type = 'sine', volume = 0.3) {
  try {
    const ctx = getAudioContext()
    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    oscillator.frequency.value = frequency
    oscillator.type = type

    gainNode.gain.setValueAtTime(volume, ctx.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration)

    oscillator.start(ctx.currentTime)
    oscillator.stop(ctx.currentTime + duration)
  } catch (e) {
    console.warn('Error reproduciendo sonido:', e)
  }
}

export function playAuthorizedSound() {
  // Sonido positivo - tono ascendente agradable
  const ctx = getAudioContext()
  
  // Tono base
  playTone(523.25, 0.15, 'sine', 0.25) // C5
  setTimeout(() => playTone(659.25, 0.15, 'sine', 0.25), 100) // E5
  setTimeout(() => playTone(783.99, 0.3, 'sine', 0.3), 200) // G5
}

export function playDuplicateSound() {
  // Sonido de advertencia - tono medio repetitivo
  playTone(440, 0.2, 'square', 0.2) // A4
  setTimeout(() => playTone(440, 0.2, 'square', 0.2), 250)
  setTimeout(() => playTone(349.23, 0.4, 'square', 0.25), 500) // F4
}

export function playNotFoundSound() {
  // Sonido de error - tono grave descendente
  playTone(220, 0.3, 'sawtooth', 0.25) // A3
  setTimeout(() => playTone(196, 0.3, 'sawtooth', 0.25), 200) // G3
  setTimeout(() => playTone(164.81, 0.5, 'sawtooth', 0.3), 400) // E3
}

/**
 * ALARMA NEGATIVA: rechazo de acceso.
 * Sirve para RUT invalido y para cualquier negativa explicita.
 * patron de sirena: dos notas graves alternando, pulsos cortos y agresivos.
 */
export function playAlarmSound() {
  const ctx = getAudioContext()
  const pulso = (f, ini, dur, vol = 0.4, tipo = 'square') => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = f
    osc.type = tipo
    gain.gain.setValueAtTime(vol, ctx.currentTime + ini)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + ini + dur)
    osc.start(ctx.currentTime + ini)
    osc.stop(ctx.currentTime + ini + dur)
  }

  // 4 pulsos de sirena descendente-reAscendente
  const t = [0, 180, 360, 540]
  const f = [392, 311, 392, 261]
  t.forEach((ini, i) => pulso(f[i], ini / 1000, 0.16))

  // remate grave
  setTimeout(() => playTone(155.56, 0.55, 'sawtooth', 0.4), 760) // Eb3
}

/** RUT invalido: pitido corto y seco, distinto al de persona no encontrada. */
export function playInvalidRutSound() {
  playTone(1046.5, 0.12, 'square', 0.28) // C6
  setTimeout(() => playTone(1046.5, 0.12, 'square', 0.28), 190)
  setTimeout(() => playTone(880, 0.3, 'square', 0.3), 380) // A5
}

export function playScanSound() {
  // Sonido de escaneo - beep corto
  playTone(880, 0.1, 'sine', 0.15)
}

export function playSyncSound() {
  // Sonido de sincronización exitosa
  playTone(523.25, 0.1, 'sine', 0.2)
  setTimeout(() => playTone(659.25, 0.1, 'sine', 0.2), 100)
  setTimeout(() => playTone(783.99, 0.2, 'sine', 0.25), 200)
}

export function playOfflineSound() {
  // Sonido de conexión perdida
  playTone(392, 0.2, 'triangle', 0.2)
  setTimeout(() => playTone(330, 0.3, 'triangle', 0.2), 150)
}

export function playOnlineSound() {
  // Sonido de conexión restaurada
  playTone(330, 0.15, 'triangle', 0.2)
  setTimeout(() => playTone(392, 0.15, 'triangle', 0.2), 100)
  setTimeout(() => playTone(523.25, 0.25, 'triangle', 0.25), 200)
}
