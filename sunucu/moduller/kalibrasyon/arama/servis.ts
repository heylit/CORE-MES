import type { Db } from '#cekirdek/db.ts';
import type { KayitAramaKaynagi, KayitAramaIstegi } from '#paylasilan/kayit-aramasi.ts';
import { aramaSade } from '#paylasilan/kayit-aramasi.ts';
import type { KayitAramaSonucu } from '#paylasilan/sayfa-tanimi.ts';
import type { Durum } from '#paylasilan/sozlesme/kalibrasyon.ts';
import { aleteCevir } from '../servis.ts';
import { aletAra } from './sorgular.ts';

const DURUM_ADI: Record<Durum, string> = {
  'kullanim-disi': 'kullanım dışı',
  'kayit-yok': 'kalibrasyon kaydı yok',
  gecmis: 'kalibrasyonu geçmiş',
  yaklasan: 'vadesi yaklaşıyor',
  gecerli: 'geçerli',
};
// Kalibrasyon formunu açan satır yalnız yazabilene gösterilir; kaydı ekrandaki form yazar (1230 a), yetkiyi yine yazma ucu denetler.
const YAZMA = 'kalibrasyon.yaz';
// Sonuç aleti ayrıntı penceresiyle açar; numarayı tam yazan ve yazabilen için ilk satır aletin kalibrasyon formudur.
async function olcuAletiAra(db: Db, istek: KayitAramaIstegi): Promise<KayitAramaSonucu[]> {
  const satirlar = await aletAra(db, { sade: istek.sade, icinde: istek.icindeDeseni, bas: istek.basDeseni, sinir: istek.sinir });
  const sonuclar: KayitAramaSonucu[] = satirlar.map((s) => {
    const a = aleteCevir(s);
    const ek = s.sertifika_no === null ? [a.ad, a.yer] : [`Sertifika ${s.sertifika_no}`];
    return {
      anahtar: `alet-${a.id}`,
      baslik: a.no,
      aciklama: [a.tur, ...ek, DURUM_ADI[a.durum]].filter((m) => m !== null && m !== '').join(' · '),
      yol: `/kalibrasyon?alet=${a.id}`,
    };
  });
  const tam = satirlar[0];
  if (tam !== undefined && istek.kullanici.islemler.includes(YAZMA) && aramaSade(tam.no) === istek.sade) {
    sonuclar.unshift({
      anahtar: `kalibrasyon-kaydet-${tam.id}`,
      baslik: tam.no,
      aciklama: 'Kalibrasyon kaydet: formu açar, kayıt formda onaylanır',
      yol: `/kalibrasyon?alet=${tam.id}&form=kalibrasyon`,
    });
  }
  return sonuclar.slice(0, istek.sinir);
}

// Okuma uçlarıyla aynı yetki (`uclar.ts` OKUMA).
export const kayitAramaKaynaklari: readonly KayitAramaKaynagi<Db>[] = [
  { tur: 'olcuAleti', yetki: ['sayfa.kalibrasyon', 'kalibrasyon.oku'], ara: olcuAletiAra },
];
