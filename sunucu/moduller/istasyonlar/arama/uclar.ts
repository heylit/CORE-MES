import { uc } from '#cekirdek/uc.ts';
import { kayitAramaCevapSemasi, kayitAramaSorguSemasi } from '#paylasilan/ikinci-menu.ts';
import { KAYIT_ARAMA_EN_COK_SONUC } from '#paylasilan/sayfa-tanimi.ts';
import { SECIM_SAYFA_BOYU, tesisSecimCevabi, tesisSecimSorgusu } from '#paylasilan/sozlesme/istasyonlar.ts';
import { tesisAra, tesisSecimAra } from './sorgular.ts';

// Tanım listelerini okuyabilen arar (`uclar.ts` OKUMA ile aynı).
const OKUMA = { biri: ['sayfa.istasyonlar', 'istasyonlar.yaz'] } as const;
// Seçiciyi çağıran modüller (1321 b): istasyonlar, bugün istasyon ya da makine seçen Arkon, markalama ve stok.
const SECIM_OKUMA = { biri: [...OKUMA.biri, 'sayfa.arkon', 'sayfa.markalama', 'sayfa.stok'] } as const;
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
  // Ortak seçici (kart #1318): yalnız kod, ad ve üst kayıt döner. Karar 1321 b: çağıran modüllerin işlemlerinden biri gerekir; modül
  // seçiciyi kullanmaya başlayınca (A5) işlemi SECIM_OKUMA'ya eklenir. Kişinin iş merkezi kısıtı burada uygulanmaz: kısıt iş başlatmayı
  // sınırlar, tanım seçimini değil (terminal seçimi `/istasyonlar/secim`'dedir).
  uc({
    yontem: 'GET',
    yol: '/istasyonlar/secim-ara',
    yetki: SECIM_OKUMA,
    sorgu: tesisSecimSorgusu,
    cevap: tesisSecimCevabi,
    isle: async ({ db, sorgu }) => {
      const satirlar = await tesisSecimAra(db, {
        tur: sorgu.tur, metin: sorgu.q, istasyonId: sorgu.tur === 'makine' ? (sorgu.istasyonId ?? null) : null, pasifler: sorgu.pasifler,
        sinir: SECIM_SAYFA_BOYU + 1, atla: (sorgu.sayfa - 1) * SECIM_SAYFA_BOYU,
      });
      return { sonuclar: satirlar.slice(0, SECIM_SAYFA_BOYU), dahaVar: satirlar.length > SECIM_SAYFA_BOYU };
    },
  }),
];
