// Arkon'dan emir açılmaz (A5, kart #541): paket TMI'de açılan emrin (`tmi-ue`) ya da iş emrinin (`tmi-ie`) paketidir. "Yeni paket" TMI'nin
// emir açma sayfasına götürür; emir açılınca paketi Hazırlık'ta taslak olarak görünür. Sunucu emir dışı yeni paketi zaten reddeder.
// 'plan': canlı plan ekranı (kart #1257, Hazırlık'ın plan dışı gönderim penceresi). 'istasyonlar': tesis (iş merkezi, istasyon, makine) TMI'dedir.
export type TmiHedefi = 'emir-ac' | 'plan' | 'istasyonlar';

// TMI köprüsü (istemci/src/moduller/arkon/baglanti.ts `bagla`) Arkon penceresine `__tmiGit` koyar; köprü yoksa (TMI dışında) false.
export function tmiyeGit(hedef: TmiHedefi, pencere: Window = window): boolean {
  try {
    const git = (pencere as unknown as { __tmiGit?: (h: string) => boolean }).__tmiGit;
    return typeof git === 'function' && git(hedef) === true;
  } catch {
    return false;
  }
}

export const tmiPaketiMi = (p: { id?: unknown } | null | undefined): boolean => !!p && typeof p.id === 'string' && /^tmi-(ue|ie)-[1-9]\d*$/.test(p.id);

// Paket dosyası (.arkon) yeni paket açmaz: seçili TMI paketine şablon olarak uygulanır. TMI'den gelen alanlar (no, parça, adet, istasyon)
// dosyadan alınmaz; sunucunun şablon alanlarıyla aynıdır (sunucu/moduller/arkon/kurallar.ts SABLON_ALANLARI).
export const SABLON_ALANLARI = ['files', 'primary', 'plan', 'steps', 'rules', 'samp', 'readCfg', 'derived', 'material', 'note'] as const;

export function sablonUygula<T extends object>(paket: T, sablon: Record<string, unknown>, simdi: number): T {
  const kopya = Object.fromEntries(SABLON_ALANLARI.filter((a) => a in sablon).map((a) => [a, sablon[a]]));
  return Object.assign({}, paket, kopya, { dirty: true, updatedAt: simdi });
}
