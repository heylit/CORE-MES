import type { AyarTanimi } from '../ayar-tanimi.ts';
import { KROKI_SAYDAMLIGI } from '../sozlesme/atolye.ts';

// 2122-2 b: kroki saydamlığı herkes için tek değer (fabrika ve bütün bölümler); her açılışta yeniden ayarlanmaz.
// Değiştiren haritayı düzenleyendir (2122-5 a): Fabrika Haritası düzenleyicisinden, kroki hizalamasıyla aynı yetkiyle.

export const ATOLYE_AYARLARI = {
  'atolye.kroki-saydamligi': {
    modul: 'atolye',
    tur: 'sayi',
    varsayilan: KROKI_SAYDAMLIGI.varsayilan,
    enAz: KROKI_SAYDAMLIGI.enAz,
    enCok: KROKI_SAYDAMLIGI.enCok,
    ondalik: 0,
    baslik: 'Fabrika Haritası: kroki saydamlığı (%)',
    aciklama: 'Krokinin plan altında görünme oranı; fabrikada ve bütün bölümlerde aynı. Haritayı düzenleyen düzenleyicideki kaydırıcıyla da değiştirir.',
  },
} as const satisfies Record<string, AyarTanimi>;
