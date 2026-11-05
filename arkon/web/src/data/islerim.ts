/* 2125-1 b: terminal çarkının "İşlerim" şeridi. Kişinin şu an çalıştığı işler, istasyon fark etmeksizin makine başına bir kart
   (sunucunun GET /arkon/islerim cevabı). Şerit yalnız gösterir ve götürür: sayım ve düğmeler yine ekrandaki işe yazılır.
   Başka istasyondaki iş, o istasyon bu cihazda seçilebiliyorsa istasyona geçilerek açılır; seçilemiyorsa yalnız görünür. */
export interface IslerimSatiri {
  emirId: number;
  emirNo: string;
  isEmriId: number | null;
  opNo: number | null;
  istasyon: string;
  istasyonAd: string;
  mc: string | null;
  makineAd: string | null;
  giris: string;
}

export type IsimDurumu = 'ekranda' | 'burada' | 'baska' | 'kapali';

export interface IsimOrtami {
  // Terminalin istasyonu (cihazın `station`).
  istasyon: string;
  // Ekrandaki işin TMI kimlikleri; ekranda TMI işi yoksa null.
  ekrandaki: { emirId: number; isEmriId: number | null } | null;
  // Bu cihazda geçilebilen istasyonlar (çarkın İstasyonlar şeridiyle aynı liste).
  gecilebilir: readonly string[];
}

const ayniIs = (s: IslerimSatiri, e: IsimOrtami['ekrandaki']): boolean =>
  e !== null && e.emirId === s.emirId && (s.isEmriId === null || e.isEmriId === null || e.isEmriId === s.isEmriId);

export function isimDurumu(s: IslerimSatiri, o: IsimOrtami): IsimDurumu {
  if (s.istasyon === o.istasyon) return ayniIs(s, o.ekrandaki) ? 'ekranda' : 'burada';
  return o.gecilebilir.includes(s.istasyon) ? 'baska' : 'kapali';
}

export const isimEtiketi = (s: Pick<IslerimSatiri, 'emirNo' | 'opNo'>): string => (s.opNo === null ? s.emirNo : `${s.emirNo} · Op ${s.opNo}`);

// Kartın başlığı makinedir; makinesiz işte istasyon.
export const isimYeri = (s: IslerimSatiri): { kod: string; ad: string } =>
  s.mc === null ? { kod: s.istasyon, ad: s.istasyonAd } : { kod: s.mc, ad: s.makineAd ?? s.mc };

// Liste saatle değişmez ama başka cihazda başlatılan ya da durdurulan iş buraya düşer: şerit açıkken yarım dakikada bir okunur.
export const ISLERIM_YENILEME_MS = 30_000;

// Kartın süresi: işe girişten bu yana; saat sapmasıyla eksiye düşerse sıfırdır.
export function isimSuresi(girisMs: number, simdi: number): string {
  if (!Number.isFinite(girisMs)) return '—';
  const dk = Math.max(0, Math.floor((simdi - girisMs) / 60_000));
  if (dk < 1) return '1 dk\'dan az';
  return dk < 60 ? `${dk} dk` : `${Math.floor(dk / 60)} sa ${dk % 60} dk`;
}
