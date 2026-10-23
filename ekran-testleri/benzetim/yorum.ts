import type { AdimSatiri, KosuOzeti } from './sozlesme.ts';

export const YORUM_ADIM_SINIRI = 60;

// Koşu sonu yorum istemi. Yorum karar değildir: bulgular kullanıcı onayıyla karta geçer.
export function yorumIstemi(ozet: KosuOzeti, adimlar: readonly AdimSatiri[]): string {
  const ilgili = adimlar.filter((a) => a.sonuc === 'dustu' || a.sonuc === 'ara-sira');
  const secilen = ilgili.slice(0, YORUM_ADIM_SINIRI).map((a) =>
    `- gün ${String(a.gun)} | ${a.rol} | ${a.senaryo} / ${a.adim} | ${a.sonuc} | ${a.yontem ?? ''} ${a.yol ?? ''} | beklenen ${a.beklenen ?? '-'} gelen ${a.gelen ?? '-'} | ${a.ileti ?? ''}`);
  const baglanmamis = [...new Set(adimlar.filter((a) => a.sonuc === 'baglanmamis').map((a) => `${a.senaryo} / ${a.adim}: ${a.ileti ?? ''}`))];
  return [
    'Bir CNC atölyesi üretim sisteminin test robotu koşusunu yorumluyorsun. Veri tamamen sentetiktir.',
    'Türkçe yaz. Her iddiayı DOĞRULANDI (satıra dayanarak), VARSAYIM (gerekçesiyle) ya da BİLMİYORUM diye işaretle; satırda olmayanı uydurma.',
    'Çıktı: 1) en çok 10 bulgu, önem sırasıyla; her biri: belirti, olası neden, hangi modül, tekrar üretme (gün, rol, senaryo, tohum).',
    '2) ara sıra düşenler için kırılganlık mı gerçek yarış mı, ayrımın gerekçesi. 3) en çok 5 kart önerisi, tek satır.',
    '"Bağlanmamış" adımlar bilinen eksiktir; hata sayma, yalnız sayısını an.',
    '',
    `Koşu ${ozet.kosuId}, taban ${ozet.taban ?? 'bilinmiyor'}, tohum ${String(ozet.tohum)}, ${String(ozet.gun)}/${String(ozet.gunSayisi)} gün, durum ${ozet.durum}.`,
    `Sayaç: geçti ${String(ozet.sayac.gecti)}, düştü ${String(ozet.sayac.dustu)}, ara sıra ${String(ozet.sayac['ara-sira'])}, bağlanmamış ${String(ozet.sayac.baglanmamis)}.`,
    '',
    `Düşen ve ara sıra düşen adımlar (${String(secilen.length)}/${String(ilgili.length)}):`,
    ...(secilen.length === 0 ? ['- yok'] : secilen),
    '',
    `Bağlanmamış adımlar (${String(baglanmamis.length)} tür):`,
    ...(baglanmamis.length === 0 ? ['- yok'] : baglanmamis.map((s) => `- ${s}`)),
  ].join('\n');
}
