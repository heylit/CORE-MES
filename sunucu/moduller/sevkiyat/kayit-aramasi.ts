import type { Db } from '#cekirdek/db.ts';
import { eslesmePuani, type KayitAramaIstegi, type KayitAramaKaynagi } from '#paylasilan/kayit-aramasi.ts';
import type { KayitAramaSonucu } from '#paylasilan/sayfa-tanimi.ts';
import type { KalemKaynagi, TumIsAsamasi, TumIsSatiri } from '#paylasilan/sozlesme/sevkiyat.ts';
import { SERBEST_BIRAKMA_ISLEMLERI } from './kurallar.ts';
import * as sorgu from './sorgular.ts';
import * as tumIsler from './tum-isler.ts';

// Üst çubuktaki genel aramanın sevkiyat kaynağı: emir numarasıyla o emrin sevk kalemleri (932 a) ve irsaliye numarasıyla sevk işi (1239).

const KAYNAK_ADI: Record<KalemKaynagi, string> = { urun: 'Ürün', fason: 'Fason gidişi', 'fason-donus': 'Fason dönüşü', alim: 'Alım', elle: 'Elle iş' };
const ASAMA_ADI: Record<TumIsAsamasi, string> = {
  hazir: 'Hazır', 'hazir-degil': 'Hazır değil', bekliyor: 'Hazır olunca', havuzda: 'Havuzda', planlandi: 'Planlandı', yolda: 'Yolda', depoda: 'Depoda',
  tamamlandi: 'Tamamlandı',
};
const IS_TURU_ADI: Record<sorgu.IrsaliyeSatiri['tur'], string> = { teslimat: 'Teslimat', alim: 'Alım', aktarma: 'Aktarma' };
const IS_DURUMU_ADI: Record<sorgu.IrsaliyeSatiri['durum'], string> = { havuzda: 'Havuzda', planlandi: 'Planlandı', yolda: 'Yolda', tamamlandi: 'Tamamlandı' };
const gunMetni = (gun: string): string => gun.split('-').reverse().join('.');

// Sonuç Tüm işler'i o emirle süzülmüş açar; karar bekleyen kalem "Serbest bırakılacak", gerisi "Sevkiyattaki" görünümündedir.
const emirSonucu = (r: TumIsSatiri & { emirNo: string }): KayitAramaSonucu => {
  const aday = r.asama === 'hazir' || r.asama === 'hazir-degil';
  const gun = r.is?.tarih ?? r.istenenTarih;
  return {
    anahtar: r.anahtar,
    baslik: r.emirNo,
    aciklama: [KAYNAK_ADI[r.kaynak], r.opNo === null ? null : `OP ${String(r.opNo)}`, ASAMA_ADI[r.asama], gun === null ? null : gunMetni(gun)]
      .filter((p) => p !== null).join(' · '),
    yol: `/sevkiyat/tum-isler?ara=${encodeURIComponent(r.emirNo)}&gorunum=${aday ? 'karar' : 'sevkiyat'}`,
  };
};

// Sonuç işin gününün planını açar; plan, yazabilene ve iş değişebilirse işin formunu dolu açar (1230 a).
const irsaliyeSonucu = (r: sorgu.IrsaliyeSatiri): KayitAramaSonucu => ({
  anahtar: `irsaliye:${String(r.id)}`,
  baslik: r.belgeNo,
  aciklama: ['İrsaliye', IS_TURU_ADI[r.tur], r.noktaAdi, IS_DURUMU_ADI[r.durum], gunMetni(r.tarih)].filter((p) => p !== null).join(' · '),
  yol: `/sevkiyat?tarih=${r.tarih}&is=${String(r.id)}`,
});

// Emir kalemlerini serbest bırakan modüller de arar (Tüm işler onlara açık); irsaliye gün planını açtığı için yalnız sevkiyatı okuyana gelir.
// Tam tutan irsaliye başa, sonra emirler, sonra kalan irsaliyeler.
async function ara(db: Db, istek: KayitAramaIstegi): Promise<KayitAramaSonucu[]> {
  const irsaliyeler = istek.kullanici.islemler.includes('sevkiyat.oku') ? await sorgu.irsaliyeAra(db, istek) : [];
  const emirler = (await tumIsler.emirSevkAramasi(db, istek.q, istek.sinir)).filter((r): r is TumIsSatiri & { emirNo: string } => r.emirNo !== null);
  const tamTutan = irsaliyeler.filter((r) => eslesmePuani(istek.q, r.belgeNo) === 3);
  const kalan = irsaliyeler.filter((r) => !tamTutan.includes(r));
  return [...tamTutan.map(irsaliyeSonucu), ...emirler.map(emirSonucu), ...kalan.map(irsaliyeSonucu)].slice(0, istek.sinir);
}

// Yetki Tüm işler'inkidir (932 a): sevkiyatı okuyan ya da kalem serbest bırakan modül.
export const sevkAramaKaynagi: KayitAramaKaynagi<Db> = { tur: 'sevk', yetki: ['sevkiyat.oku', ...SERBEST_BIRAKMA_ISLEMLERI], ara };
