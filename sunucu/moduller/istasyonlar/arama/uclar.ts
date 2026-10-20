import { uc } from '#cekirdek/uc.ts';
import { kayitAramaCevapSemasi, kayitAramaSorguSemasi } from '#paylasilan/ikinci-menu.ts';
import { KAYIT_ARAMA_EN_COK_SONUC } from '#paylasilan/sayfa-tanimi.ts';
import { tesisAra } from './sorgular.ts';

// Tanım listelerini okuyabilen arar (`uclar.ts` OKUMA ile aynı).
const OKUMA = { biri: ['sayfa.istasyonlar', 'istasyonlar.yaz'] } as const;
// Kayda doğrudan açılan adres yok; sonuç kaydın bölümünü açar.
const BOLUM = { istasyon: '/istasyonlar/is-merkezleri', makine: '/istasyonlar/makineler' } as const;
const TUR_ADI = { istasyon: 'İstasyon', makine: 'Makine' } as const;

// Üst çubuktaki genel aramanın istasyon ve makine kaynağı (kart #1221).
export const aramaUclari = [
  uc({
    yontem: 'GET',
    yol: '/istasyonlar/ara',
    yetki: OKUMA,
    sorgu: kayitAramaSorguSemasi,
    cevap: kayitAramaCevapSemasi,
    isle: async ({ db, sorgu }) => ({
      sonuclar: (await tesisAra(db, sorgu.q, KAYIT_ARAMA_EN_COK_SONUC)).map((t) => ({
        anahtar: `${t.tur}-${t.id}`,
        baslik: `${t.kod} ${t.ad}`,
        aciklama: t.aktif ? TUR_ADI[t.tur] : `${TUR_ADI[t.tur]} · pasif`,
        yol: BOLUM[t.tur],
      })),
    }),
  }),
];
