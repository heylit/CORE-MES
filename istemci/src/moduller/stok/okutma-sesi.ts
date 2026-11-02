// Okutma sonucu sesi (1905): depocu ekrana bakmadan doğruyu yanlıştan ayırsın. Arkon terminalinin sesleriyle aynı tınılar; modül
// sınırı gereği ayrı yazılır. Ses açılamazsa (izin, eski tarayıcı, test ortamı) sessiz geçer, renk ve metin yine gösterilir.
export type OkutmaSesi = 'tamam' | 'uyari' | 'hata';
const DIZILER: Readonly<Record<OkutmaSesi, readonly (readonly [number, number])[]>> = {
  tamam: [[880, 0.08], [1320, 0.12]], uyari: [[660, 0.1], [660, 0.1]], hata: [[300, 0.18], [220, 0.25]],
};
let baglam: AudioContext | null = null;

export function okutmaSesi(tur: OkutmaSesi): void {
  try {
    const Kurucu = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Kurucu) return;
    baglam ??= new Kurucu();
    let t = baglam.currentTime;
    for (const [f, d] of DIZILER[tur]) {
      const o = baglam.createOscillator();
      const g = baglam.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(baglam.destination);
      o.start(t);
      o.stop(t + d + 0.02);
      t += d;
    }
  } catch { /* ses kapalı */ }
}
