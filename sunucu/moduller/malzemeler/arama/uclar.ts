import { uc } from '#cekirdek/uc.ts';
import { kayitAramaCevapSemasi, kayitAramaSorguSemasi } from '#paylasilan/ikinci-menu.ts';
import { KAYIT_ARAMA_EN_COK_SONUC } from '#paylasilan/sayfa-tanimi.ts';
import { malzemeAra } from '../servis.ts';

// Okuma uçlarıyla aynı yetki (`uclar.ts` OKUMA).
const OKUMA = { biri: ['sayfa.malzemeler'] } as const;
const TUR_ADI: Record<string, string> = {
  hammadde: 'Hammadde', yarimamul: 'Yarı mamul', mamul: 'Mamul', sarf: 'Sarf', demirbas: 'Demirbaş', hizmet: 'Hizmet', ticari_mal: 'Ticari mal',
};
const ONAY_ADI: Record<string, string> = { taslak: 'taslak', onayda: 'onayda', pasif: 'pasif' };

// Üst çubuktaki genel aramanın malzeme kaynağı (kart #1221). Katalog çerçevesinde karta doğrudan açılan adres bugün yok: sonuç
// katalog sayfasını açar.
export const aramaUclari = [
  uc({
    yontem: 'GET',
    yol: '/malzemeler/ara',
    yetki: OKUMA,
    sorgu: kayitAramaSorguSemasi,
    cevap: kayitAramaCevapSemasi,
    isle: async ({ db, sorgu }) => ({
      sonuclar: (await malzemeAra(db, { metin: sorgu.q, sayfa: 1, sayfaBoyu: KAYIT_ARAMA_EN_COK_SONUC })).satirlar.map((m) => ({
        anahtar: String(m.id),
        baslik: m.ad === null ? m.kod : `${m.kod} ${m.ad}`,
        aciklama: [TUR_ADI[m.tur] ?? m.tur, ONAY_ADI[m.onayDurumu]].filter((p) => p !== undefined).join(' · '),
        yol: '/malzemeler' as const,
      })),
    }),
  }),
];
