let audioContext = null

export const playNotificationSound = () => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) return

  try {
    if (!audioContext) audioContext = new AudioContextClass()
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {})

    const now = audioContext.currentTime
    const gain = audioContext.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28)
    gain.connect(audioContext.destination)

    const first = audioContext.createOscillator()
    first.type = 'sine'
    first.frequency.setValueAtTime(880, now)
    first.connect(gain)
    first.start(now)
    first.stop(now + 0.12)

    const second = audioContext.createOscillator()
    second.type = 'sine'
    second.frequency.setValueAtTime(1175, now + 0.1)
    second.connect(gain)
    second.start(now + 0.1)
    second.stop(now + 0.28)
  } catch {
    // Browsers may block audio until the user has interacted with the page.
  }
}
