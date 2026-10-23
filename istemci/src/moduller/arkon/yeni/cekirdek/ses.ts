// Terminal sesleri (operator-parcalar.ts beep): onay, ret, kontrol zamanı, çağrı. Ses açılamazsa (izin, eski tarayıcı) sessiz geçer.
export type SesTuru = 'ok' | 'nok' | 'due' | 'call';
const DIZILER: Readonly<Record<SesTuru, readonly (readonly [number, number])[]>> = {
  ok: [[880, 0.08], [1320, 0.12]], nok: [[300, 0.18], [220, 0.25]], due: [[660, 0.1], [0, 0.05], [660, 0.1], [990, 0.16]], call: [[520, 0.1], [780, 0.14]],
};
let baglam: AudioContext | null = null;

export function bip(tur: SesTuru | string): void {
  try {
    // Eski Safari yalnız önekli kurucuyu verir.
    const Kurucu = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    baglam ??= new Kurucu();
    const sira = DIZILER[tur as SesTuru] ?? [[700, 0.1]];
    let t = baglam.currentTime;
    for (const [f, d] of sira) {
      if (f) {
        const o = baglam.createOscillator();
        const g = baglam.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g).connect(baglam.destination);
        o.start(t);
        o.stop(t + d + 0.02);
      }
      t += d;
    }
  } catch { /* ses kapalı */ }
}
