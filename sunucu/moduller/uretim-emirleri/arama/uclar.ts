import { uc } from '#cekirdek/uc.ts';
import { kayitAramaCevapSemasi, kayitAramaSorguSemasi } from '#paylasilan/ikinci-menu.ts';
import { KAYIT_ARAMA_EN_COK_SONUC, type KayitAramaSonucu } from '#paylasilan/sayfa-tanimi.ts';
import { ADIMLI_OKUMA_ISLEMLERI, type EmirDurumu } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { istasyonKisiAtamalari } from '../../istasyonlar/disari.ts';
import { kisininIstasyonu } from '../kurallar.ts';
import { emirAra, istasyondaEmirAra, type EmirAramaSatiri } from './sorgular.ts';

const DURUM_ADI: Record<EmirDurumu, string> = { taslak: 'Taslak', planli: 'Planlı', basladi: 'Başladı', bitti: 'Bitti', iptal: 'İptal' };
const ISTASYON_ARAMASI = 'uretim-emirleri.ara-istasyon';

const sonuc = (e: EmirAramaSatiri, yol: KayitAramaSonucu['yol']): KayitAramaSonucu => ({
  anahtar: String(e.id),
  baslik: e.emirNo,
  aciklama: [[e.parcaNo, e.parcaAd].filter((p) => p !== null && p.trim() !== '').join(' '), DURUM_ADI[e.durum]].filter((p) => p !== '').join(' · '),
  yol,
});

// Üst çubuktaki genel aramanın emir kaynağı (kart #1221). Emir listesini (`/adimli-emirler`) okuyabilen bütün emirleri arar.
// Listeyi göremeyen operatör (ara-istasyon) yalnız bugün atandığı istasyonun açık emirlerini bulur; sonuç emir ayrıntısını
// değil (o sayfa ona kapalı) Üretim Terminali'ni o emir seçili açar. Atanmış istasyonu yoksa sonuç boştur.
export const aramaUclari = [
  uc({
    yontem: 'GET',
    yol: '/uretim-emirleri/ara',
    yetki: { biri: [...ADIMLI_OKUMA_ISLEMLERI, ISTASYON_ARAMASI] },
    sorgu: kayitAramaSorguSemasi,
    cevap: kayitAramaCevapSemasi,
    isle: async ({ db, sorgu, kullanici }) => {
      if (ADIMLI_OKUMA_ISLEMLERI.some((i) => kullanici.islemler.includes(i))) {
        return { sonuclar: (await emirAra(db, sorgu.q, KAYIT_ARAMA_EN_COK_SONUC)).map((e) => sonuc(e, `/uretim-emirleri/${e.id}`)) };
      }
      const istasyonId = kisininIstasyonu(await istasyonKisiAtamalari(db, { kisiId: kullanici.id }), kullanici.id);
      if (istasyonId === null) return { sonuclar: [] };
      return {
        sonuclar: (await istasyondaEmirAra(db, sorgu.q, istasyonId, KAYIT_ARAMA_EN_COK_SONUC)).map((e) => sonuc(e, `/uretim-terminali?emir=${e.id}`)),
      };
    },
  }),
];
