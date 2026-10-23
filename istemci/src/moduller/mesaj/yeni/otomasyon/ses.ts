// Hatırlatmanın kısa sesi (prototip `beep`): tarayıcının ses birimiyle üretilir, dosya ya da dış kaynak yoktur.
let baglam: AudioContext | null = null;

export function sesCal(): void {
  try {
    baglam = baglam ?? new AudioContext();
    const o = baglam.createOscillator();
    const g = baglam.createGain();
    o.connect(g);
    g.connect(baglam.destination);
    o.frequency.value = 880;
    const t = baglam.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.15, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.start();
    o.stop(t + 0.5);
  } catch {
    // Ses birimi yoksa ya da kullanıcı etkileşimi olmadan açılamıyorsa hatırlatma sessiz kalır.
  }
}
