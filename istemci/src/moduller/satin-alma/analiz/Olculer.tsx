import { useState } from 'react';
import type { SatinAlmaAnaliziCevabi } from '#paylasilan/sozlesme/satin-alma-analiz.ts';
import { Kart } from '../../../ortak/arayuz/Kart.tsx';
import { SayiKarti } from '../../../ortak/arayuz/SayiKarti.tsx';
import { Sekmeler, type Sekme } from '../../../ortak/arayuz/Sekmeler.tsx';
import { Tablo, type Sutun } from '../../../ortak/arayuz/Tablo.tsx';
import { YatayCubukKarti } from '../../../ortak/arayuz/grafik/grafikler.tsx';
import { tarihMetni } from '../../../ortak/veri/zaman-metni.ts';
import {
  ASAMA_ADLARI, BANT_ADLARI, KIRILIM_ADLARI, bantDisiOrani, gunMetni, isaretliTl, isaretliYuzde, kuralDisiMetni, miktarMetni, oncekiMetni, sapmaAltMetni,
  sureOzetiMetni, tlMetni, tutarAltMetni, tutarMetni, yuzdeMetni,
} from './kurallar.ts';

// 2471: süreç ve fiyat ölçüleri. Hesap sunucuda (satin-alma/analiz-kurallar.ts); burada yalnız gösterim. Her ölçü tanımını ve örneğini yazar.

export function Ozet({ c }: { c: SatinAlmaAnaliziCevabi }) {
  const t = c.tasarruf, s = c.fiyatSapmasi.donem, k = c.kuralDisi.donem, a = c.asamaSureleri;
  const bantDisi = bantDisiOrani(s.simdi);
  const darbogaz = a.tumu.darbogaz === null ? null : a.tumu.asamalar.find((x) => x.asama === a.tumu.darbogaz) ?? null;
  return (
    <>
      <div className="tc-pano-izgara">
        <SayiKarti baslik="Harcama (12 ay)" simge="lira" metin={c.harcama.toplamTl === null ? 'Veri yok' : tlMetni(c.harcama.toplamTl)}
          altMetin={oncekiMetni(c.oncekiHarcamaTl === null ? null : tlMetni(c.oncekiHarcamaTl))} />
        <SayiKarti baslik="Son alışa göre fiyat farkı" simge="chart" metin={tutarMetni(t.fiyatFarki.simdi)}
          altMetin={tutarAltMetni(t.fiyatFarki.simdi, 'satır; eksi gerçek azalma, kur etkisi hariç', t.fiyatFarki.onceki)} />
        <SayiKarti baslik="Kaçınılan maliyet" simge="check" metin={tutarMetni(t.kacinilan.simdi)}
          altMetin={tutarAltMetni(t.kacinilan.simdi, 'satır; en düşük öteki teklife göre, nakliye ve vade hariç', t.kacinilan.onceki)} />
        <SayiKarti baslik="Talepten tam teslime" simge="clock" metin={sureOzetiMetni(a.tumu.toplam, c.asamaGereken)}
          altMetin={oncekiMetni(a.oncekiToplam.ortancaGun === null ? null : gunMetni(a.oncekiToplam.ortancaGun), `${String(a.tumu.toplam.ornek)} talep`)} />
        <SayiKarti baslik="Hedef dışı alım" simge="alert" metin={bantDisi === null ? 'Veri yok' : yuzdeMetni(bantDisi)}
          ton={bantDisi !== null && bantDisi > 0 ? 'uyari' : 'bilgi'} altMetin={sapmaAltMetni(s.simdi)} />
        <SayiKarti baslik="Kural dışı alım (vekil)" simge="flag" metin={kuralDisiMetni(k.simdi)}
          altMetin={oncekiMetni(k.onceki.payYuzde === null ? null : yuzdeMetni(k.onceki.payYuzde), 'tutar payı')} />
      </div>
      <Kart baslik="Dikkat" simge="alert">
        <ul className="sa-analiz-dikkat">
          <li>{darbogaz === null
            ? `Darboğaz için yeterli veri yok: her aşamada en az ${String(c.asamaGereken)} talep gerekir.`
            : `Darboğaz: ${ASAMA_ADLARI[darbogaz.asama]}, ortanca ${gunMetni(darbogaz.ortancaGun)}. Aşamalar Tedarik sekmesinde.`}</li>
          {s.simdi.endeksYok > 0 && <li>{`Enflasyon endeksi olmadığından ${String(s.simdi.endeksYok)} ₺ satırın hedef fiyatı hesaplanmadı.`}</li>}
          {a.tumu.hataliAralik > 0 && <li>{`${String(a.tumu.hataliAralik)} aşama aralığında tarih sırası bozuk (eksi süre); sayılmadı.`}</li>}
        </ul>
        <p className="sa-analiz-aciklama">{`Dönem ${tarihMetni(c.donem.bas)} - ${tarihMetni(c.donem.bit)}; kıyas ${tarihMetni(c.donem.oncekiBas)} - ${tarihMetni(c.donem.oncekiBit)}.`}</p>
      </Kart>
    </>
  );
}

type Asama = SatinAlmaAnaliziCevabi['asamaSureleri']['tumu']['asamalar'][number];
const asamaSutunlari = (gereken: number, darbogaz: string | null): readonly Sutun<Asama>[] => [
  { anahtar: 'asama', baslik: 'Aşama', hucre: (x) => (x.asama === darbogaz ? `${ASAMA_ADLARI[x.asama]} (darboğaz)` : ASAMA_ADLARI[x.asama]) },
  { anahtar: 'sure', baslik: 'Ortanca, P80', hucre: (x) => sureOzetiMetni(x, gereken) },
  { anahtar: 'ornek', baslik: 'Örnek', hucre: (x) => x.ornek, hizala: 'sag' },
];
type Kirilim = SatinAlmaAnaliziCevabi['asamaSureleri']['kirilimlar'][number];
const kirilimSutunlari = (gereken: number): readonly Sutun<Kirilim>[] => [
  { anahtar: 'ad', baslik: 'Grup', hucre: (x) => x.ad },
  { anahtar: 'toplam', baslik: 'Talepten tam teslime', hucre: (x) => sureOzetiMetni(x.ozet.toplam, gereken) },
  { anahtar: 'darbogaz', baslik: 'Darboğaz', hucre: (x) => (x.ozet.darbogaz === null ? '-' : ASAMA_ADLARI[x.ozet.darbogaz]) },
  { anahtar: 'ornek', baslik: 'Talep', hucre: (x) => x.ozet.toplam.ornek, hizala: 'sag' },
];
type KirilimTuru = Kirilim['tur'];
const KIRILIM_SEKMELERI: readonly Sekme<KirilimTuru>[] = (['kategori', 'birim', 'alici'] as const).map((k) => ({ anahtar: k, baslik: KIRILIM_ADLARI[k] }));

export function SurecSureleri({ c }: { c: SatinAlmaAnaliziCevabi }) {
  const [tur, turSec] = useState<KirilimTuru>('kategori');
  const a = c.asamaSureleri;
  return (
    <>
      <YatayCubukKarti baslik="Aşama süreleri (ortanca)" simge="clock" yuklendi siralama={false} bicim={(n) => gunMetni(n)}
        satirlar={a.tumu.asamalar.filter((x) => x.ortancaGun !== null).map((x) => ({ etiket: ASAMA_ADLARI[x.asama], deger: x.ortancaGun! }))}
        alt={`Her aşama bir önceki var olan uçtan ölçülür; en az ${String(c.asamaGereken)} talep gerekir.`} />
      <Kart baslik="Aşamalar" simge="list">
        <Tablo etiket="Aşama süreleri" sutunlar={asamaSutunlari(c.asamaGereken, a.tumu.darbogaz)} satirlar={a.tumu.asamalar} satirAnahtari={(x) => x.asama} />
        <p className="sa-analiz-aciklama">
          Gün, tesis gününe göre. Atlanan aşama sayılmaz, süresi sonrakine yazılır; tarih sırası bozuk aralık sayılmaz. Talepten tam teslime ayrıca
          ölçülür: {sureOzetiMetni(a.tumu.toplam, c.asamaGereken)}. Darboğaz ortancası en uzun aşamadır.
        </p>
      </Kart>
      <Kart baslik="Kırılım" simge="grid">
        <Sekmeler etiket="Kırılım türü" sekmeler={KIRILIM_SEKMELERI} secili={tur} sec={turSec} />
        <Tablo etiket="Kırılım" sutunlar={kirilimSutunlari(c.asamaGereken)} satirlar={a.kirilimlar.filter((x) => x.tur === tur)}
          satirAnahtari={(x) => `${x.tur}:${x.anahtar}`} bosMesaj="Bu dönemde talep yok." />
      </Kart>
    </>
  );
}

type Sapma = SatinAlmaAnaliziCevabi['fiyatSapmasi']['kalemler'][number];
const SAPMA_SUTUNLARI: readonly Sutun<Sapma>[] = [
  { anahtar: 'ad', baslik: 'Kalem', hucre: (x) => x.ad },
  { anahtar: 'tarih', baslik: 'Sipariş', hucre: (x) => tarihMetni(x.siparisTarihi), kirilmaz: true },
  { anahtar: 'hedef', baslik: 'Hedef', hucre: (x) => `${miktarMetni(x.hedef)} ${x.paraBirimi}/${x.birim}`, hizala: 'sag', kirilmaz: true },
  { anahtar: 'fiili', baslik: 'Fiili', hucre: (x) => `${miktarMetni(x.fiili)} ${x.paraBirimi}/${x.birim}`, hizala: 'sag', kirilmaz: true },
  { anahtar: 'fark', baslik: 'Fark', hucre: (x) => isaretliYuzde(x.farkYuzde), hizala: 'sag' },
  { anahtar: 'sapma', baslik: 'Sapma', hucre: (x) => isaretliTl(x.sapmaTl), hizala: 'sag' },
  { anahtar: 'kur', baslik: 'Kur etkisi', hucre: (x) => isaretliTl(x.kurEtkisiTl), hizala: 'sag' },
  { anahtar: 'bant', baslik: 'Bant', hucre: (x) => BANT_ADLARI[x.bant] },
];

export function FiyatSapmasi({ c }: { c: SatinAlmaAnaliziCevabi }) {
  const f = c.fiyatSapmasi, d = f.donem;
  const bantDisi = bantDisiOrani(d.simdi);
  return (
    <>
      <div className="tc-pano-izgara">
        <SayiKarti baslik="Hedefe göre net sapma" simge="lira" metin={d.simdi.toplamTl === null ? 'Veri yok' : isaretliTl(d.simdi.toplamTl)}
          altMetin={oncekiMetni(d.onceki.toplamTl === null ? null : isaretliTl(d.onceki.toplamTl), `eksi: hedefin altında alındı · ${sapmaAltMetni(d.simdi)}`)} />
        <SayiKarti baslik="Hedef dışı" simge="alert" metin={bantDisi === null ? 'Veri yok' : yuzdeMetni(bantDisi)} ton={bantDisi !== null && bantDisi > 0 ? 'uyari' : 'bilgi'}
          altMetin={`Bant hedef ±${yuzdeMetni(f.esikYuzde)} (Satın alma ayarları)`} />
      </div>
      <Kart baslik="Hedefe göre en çok sapan kalemler" simge="chart">
        <Tablo etiket="Hedef fiyat sapması" sutunlar={SAPMA_SUTUNLARI} satirlar={f.kalemler} satirAnahtari={(x) => `${x.katalogId}:${x.siparisTarihi}:${String(x.sapmaTl)}`}
          bosMesaj="Bu dönemde hedefi hesaplanan alış yok: kalemin aynı para birimi ve birimde önceki alışı gerekir." />
        <p className="sa-analiz-aciklama">
          Hedef, kalemin önceki alışının döviz fiyatıdır (sipariş günü kuruyla ₺'ye çevrilir); sapma (fiili - hedef) x miktar. Kur etkisi önceki alışa göre
          ₺ değişimin kurdan gelen payıdır, sapmaya girmez. ₺ kalemde hedef enflasyon endeksi ister; endeks girilene kadar hesaplanmaz.
        </p>
      </Kart>
    </>
  );
}

export function KuralDisiAlim({ c }: { c: SatinAlmaAnaliziCevabi }) {
  const k = c.kuralDisi, s = k.donem.simdi;
  const satirlar = [
    { anahtar: 'az', ad: `En az teklif sayısının altında karar (ayar: ${String(k.enAzTeklif)})`, ...s.azTeklif },
    { anahtar: 'once', ad: 'Sipariş günü talepten önce', ...s.talepOncesi },
  ];
  return (
    <Kart baslik="Kural dışı alım (vekil ölçü)" simge="flag">
      <Tablo etiket="Kural dışı alım" satirlar={satirlar} satirAnahtari={(x) => x.anahtar} sutunlar={[
        { anahtar: 'ad', baslik: 'Durum', hucre: (x) => x.ad },
        { anahtar: 'siparis', baslik: 'Sipariş', hucre: (x) => x.siparis, hizala: 'sag' },
        { anahtar: 'tutar', baslik: 'Tutar', hucre: (x) => tlMetni(x.tutarTl), hizala: 'sag' },
      ]} />
      <p className="sa-analiz-aciklama">
        {`İkisinden birine giren siparişlerin harcamaya payı ${kuralDisiMetni(s)}. Bu sistemde her sipariş bir talepten doğar; gerçek talep dışı alım ancak
        siparişsiz gelen faturadan görülür (üç yollu eşleşme). O gelene kadar vekil ölçü gösterilir.`}
      </p>
    </Kart>
  );
}
