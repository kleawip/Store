/** A short, original two-note cart chime. Called only from a user-initiated cart action. */
export function playCartSound() {
  try {
    const context = new AudioContext();
    if (context.state === "suspended") void context.resume();
    const notes = [
      { frequency: 587.33, delay: 0, duration: 0.11 },
      { frequency: 880, delay: 0.075, duration: 0.16 },
    ];

    notes.forEach(({ frequency, delay, duration }, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + delay;
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.055, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.005);
      if (index === notes.length - 1) oscillator.onended = () => { void context.close(); };
    });
  } catch {
    // An unavailable or blocked audio device must never block the cart action.
  }
}
