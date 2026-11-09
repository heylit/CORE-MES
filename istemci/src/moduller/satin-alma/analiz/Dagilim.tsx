import type { SatinAlmaAnaliziCevabi } from '#paylasilan/sozlesme/satin-alma-analiz.ts';
import { Kart } from '../../../ortak/arayuz/Kart.tsx';
import { SayiKarti } from '../../../ortak/arayuz/SayiKarti.tsx';
import { Tablo, type Sutun } from '../../../ortak/arayuz/Tablo.tsx';
import { CubukGrafikKarti, YatayCubukKarti } from '../../../ortak/arayuz/grafik/grafikler.tsx';
import { tarihMetni } from '../../../ortak/veri/zaman-metni.ts';
import { ayEtiketi, kategoriAdi, teklifAltMetni, tlMetni, yogunlasmaMetni } from './kurallar.ts';

// 2477 (2467 a): Raporlar'dan taşınan dağılımlar. Hesap sunucuda (satin-alma/analiz-kurallar.ts); Raporlar bunları okur.

export function AylikHarcama({ c }: { c: SatinAlmaAnaliziCevabi }) {
  const d = c.harcamaDagilimi;
  return (
    <CubukGrafikKarti baslik="Aylık harcama" simge="chart" yuklendi etiketler={d.aylar.map((a) => ayEtiketi(a.ay))}
      seriler={[{ ad: 'Harcama', degerler: d.aylar.map((a) => a.tutarTl) }]} bicim={(n) => tlMetni(n)}
      alt="Son 12 takvim ayı; bu ay sürüyor. İlk siparişten önceki ay boştur." />
  );
}

export function HarcamaDagilimi({ c }: { c: SatinAlmaAnaliziCevabi }) {
  const d = c.harcamaDagilimi;
  const donem = `${tarihMetni(c.donem.bas)} - ${tarihMetni(c.donem.bit)}`;
  return (
    <>
      <YatayCubukKarti baslik="Kategoriye göre" simge="box" yuklendi bicim={(n) => tlMetni(n)}
        satirlar={d.kategoriler.slice(0, 10).map((k) => ({ etiket: kategoriAdi(k.ad), deger: k.tutarTl }))}
        alt={donem} />
      <YatayCubukKarti baslik="Tedarikçiye göre" simge="truck" yuklendi bicim={(n) => tlMetni(n)}
        satirlar={d.tedarikciler.slice(0, 10).map((k) => ({ etiket: k.ad, deger: k.tutarTl }))}
        alt={`${donem}. ${yogunlasmaMetni(d)}`} />
    </>
  );
}

type TekKaynak = SatinAlmaAnaliziCevabi['tedarikRiski']['tekKaynak']['kalemler'][number];
const TEK_KAYNAK_SUTUNLARI: readonly Sutun<TekKaynak>[] = [
  { anahtar: 'ad', baslik: 'Kalem', hucre: (x) => x.ad },
  { anahtar: 'tedarikci', baslik: 'Tek tedarikçi', hucre: (x) => x.tedarikci },
  { anahtar: 'satir', baslik: 'Sipariş satırı', hucre: (x) => x.siparisSatiri, hizala: 'sag' },
  { anahtar: 'tutar', baslik: 'Harcama', hucre: (x) => tlMetni(x.tutarTl), hizala: 'sag' },
];

export function TedarikRiski({ c }: { c: SatinAlmaAnaliziCevabi }) {
  const r = c.tedarikRiski;
  return (
    <>
      <div className="tc-pano-izgara">
        <SayiKarti baslik="Talep başına teklif" simge="list" metin={r.teklif.ortanca === null ? 'Veri yok' : `${String(r.teklif.ortanca).replace('.', ',')} teklif`}
          ton={r.teklif.hedefAlti > 0 ? 'uyari' : 'bilgi'} altMetin={teklifAltMetni(r.teklif, c.kuralDisi.enAzTeklif)} />
        <SayiKarti baslik="Tek kaynak kalem" simge="alert" sayi={r.tekKaynak.kalemSayisi} ton={r.tekKaynak.kalemSayisi > 0 ? 'uyari' : 'bilgi'}
          altMetin="Son 12 ayda aldığı her talepte fiyatı tek tedarikçiden gelen kalem." />
      </div>
      <Kart baslik="Tek kaynak riski" simge="alert">
        <Tablo etiket="Tek kaynak riski" sutunlar={TEK_KAYNAK_SUTUNLARI} satirlar={r.tekKaynak.kalemler} satirAnahtari={(x) => x.anahtar}
          bosMesaj="Son 12 ayda tek kaynağa bağlı kalem yok." />
        <p className="sa-analiz-aciklama">
          Harcamaya göre ilk {String(r.tekKaynak.kalemler.length)} kalem. Kalem katalogla, katalogsuzsa adıyla eşlenir; aynı firmanın birden çok teklifi tek kaynak sayılır.
        </p>
      </Kart>
    </>
  );
}
