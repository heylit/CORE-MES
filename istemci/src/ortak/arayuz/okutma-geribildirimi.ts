import { useCallback, useRef, useState, useSyncExternalStore } from 'react';

// Okutmanın sonucu (1906): depocu ekrana bakmadan doğruyu yanlıştan ayırsın. Sonucu çağıran ekran söyler (okuyucu kodun ne
// olduğunu bilmez); okuyucu rengi yakar, sesi çalar, son beş okutmayı şeritte gösterir. Geçmiş yalnız o ekranda ve bellekte
// tutulur, sunucuya yazılmaz. Ses tercihi cihazındır: aynı bilgisayardaki bütün okutma ekranları uyar.
export type OkutmaTonu = 'tamam' | 'uyari' | 'hata';
export interface OkutmaKaydi { kimlik: number; kod: string; ton: OkutmaTonu; metin: string; zaman: string }
export interface OkutmaGecmisi {
  son: readonly OkutmaKaydi[];
  bildir: (kod: string, ton: OkutmaTonu, metin: string) => void;
  sesAcik: boolean;
  sesDegistir: () => void;
}

export const SON_OKUTMA_SAYISI = 5;
const SES_ANAHTARI = 'tmiv2.okutma-sesi';

// Tınılar Arkon terminalinin bip'ine benzer; modül sınırı gereği burada ayrıca yazılır.
const DIZILER: Readonly<Record<OkutmaTonu, readonly (readonly [number, number])[]>> = {
  tamam: [[880, 0.08], [1320, 0.12]], uyari: [[660, 0.1], [660, 0.1]], hata: [[300, 0.18], [220, 0.25]],
};
let baglam: AudioContext | null = null;

// Ses açılamazsa (izin, eski tarayıcı, test ortamı) sessiz geçer; renk ve metin yine gösterilir.
export function okutmaSesi(ton: OkutmaTonu): void {
  try {
    const Kurucu = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Kurucu) return;
    baglam ??= new Kurucu();
    let t = baglam.currentTime;
    for (const [f, d] of DIZILER[ton]) {
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

let sesGecerli: boolean | null = null;
const sesDinleyenler = new Set<() => void>();
export function okutmaSesiAcik(): boolean {
  if (sesGecerli === null) {
    try { sesGecerli = localStorage.getItem(SES_ANAHTARI) !== 'kapali'; } catch { sesGecerli = true; }
  }
  return sesGecerli;
}
export function okutmaSesiYaz(acik: boolean): void {
  sesGecerli = acik;
  try { localStorage.setItem(SES_ANAHTARI, acik ? 'acik' : 'kapali'); } catch { /* depolama kapalı: bu sekmede bellekte kalır */ }
  for (const d of sesDinleyenler) d();
}
const sesAboneligi = (d: () => void) => { sesDinleyenler.add(d); return () => { sesDinleyenler.delete(d); }; };

const ikiHane = (n: number) => String(n).padStart(2, '0');
const saatDakika = (t: Date) => `${ikiHane(t.getHours())}:${ikiHane(t.getMinutes())}`;

// Saf: yeni kayıt başa gelir, liste beşi geçmez.
export function gecmiseEkle(son: readonly OkutmaKaydi[], kayit: OkutmaKaydi): OkutmaKaydi[] {
  return [kayit, ...son].slice(0, SON_OKUTMA_SAYISI);
}

export function useOkutmaGecmisi(): OkutmaGecmisi {
  const [son, setSon] = useState<readonly OkutmaKaydi[]>([]);
  const sayac = useRef(0);
  const sesAcik = useSyncExternalStore(sesAboneligi, okutmaSesiAcik);
  const bildir = useCallback((kod: string, ton: OkutmaTonu, metin: string) => {
    sayac.current += 1;
    const kayit: OkutmaKaydi = { kimlik: sayac.current, kod: kod.trim(), ton, metin, zaman: saatDakika(new Date()) };
    setSon((s) => gecmiseEkle(s, kayit));
    if (okutmaSesiAcik()) okutmaSesi(ton);
  }, []);
  const sesDegistir = useCallback(() => okutmaSesiYaz(!okutmaSesiAcik()), []);
  return { son, bildir, sesAcik, sesDegistir };
}
