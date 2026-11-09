import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { SatinAlmaAnaliziCevabi, SatinAlmaTedarikcisi, SatinAlmaTuketimMalzemesi } from '#paylasilan/sozlesme/satin-alma-analiz.ts';
import { tarihMetni } from '../../../ortak/veri/zaman-metni.ts';
import { DurumKutusu } from '../../../ortak/arayuz/DurumKutusu.tsx';
import { Sekmeler, type Sekme } from '../../../ortak/arayuz/Sekmeler.tsx';
import { Kart } from '../../../ortak/arayuz/Kart.tsx';
import { SayfaBasligi } from '../../../ortak/arayuz/SayfaBasligi.tsx';
import { SayiKarti } from '../../../ortak/arayuz/SayiKarti.tsx';
import { Tablo, type Sutun } from '../../../ortak/arayuz/Tablo.tsx';
import { CizgiGrafikKarti, YatayCubukKarti } from '../../../ortak/arayuz/grafik/grafikler.tsx';
import { api } from '../../../ortak/veri/api.ts';
import {
  XYZ_ACIKLAMA, ayEtiketi, bayesMetni, gecikmeMetni, guvenlikMetni, gunMetni, harcamaAltMetni, isaretliBirimTl, isaretliYuzde, karneMetni, miktarMetni,
  sureMetni, tahminMetni, tlMetni, yuzdeMetni,
} from './kurallar.ts';
import { FiyatSapmasi, KuralDisiAlim, Ozet, SurecSureleri } from './Olculer.tsx';
import './analiz.css';

// Satın alma analizi (2151, 2151-1 b): tedarikçi başarımı (firma karnesinden, 2151-2 a), harcama, fiyat değişimi ve tüketim tahmini
// (2151-3 b); 2471 ile sekmeler, süreç süreleri, tasarruf, hedef fiyat sapması ve kural dışı alım. Yalnız okur; her bölüm neyi ölçtüğünü
// ve verinin yetip yetmediğini yazar. Seçili sekme adreste durur.
export const SATIN_ALMA_ANALIZI_YOLU = '/satin-alma-analiz';

export function SatinAlmaAnalizi() {
  const q = useQuery({ queryKey: ['satin-alma', 'analiz'], queryFn: () => api.get<SatinAlmaAnaliziCevabi>(SATIN_ALMA_ANALIZI_YOLU) });
  const yenile = () => { void q.refetch(); };
  return (
    <div>
      <SayfaBasligi baslik="Satın alma analizi" simge="chart" alt="Son 12 ay, önceki 12 ayla kıyas: süreç, harcama, fiyat, tedarikçi ve tüketim."
        birincil={{ etiket: 'Yenile', simge: 'rotate', yap: yenile, yukleniyor: q.isFetching }} />
      {q.isPending ? <DurumKutusu durum="yukleniyor" />
        : q.isError ? <DurumKutusu durum="hata" yenile={yenile} />
          : <Rapor c={q.data} />}
    </div>
  );
}

const tedarikciSutunlari = (gereken: number): readonly Sutun<SatinAlmaTedarikcisi>[] => [
  { anahtar: 'ad', baslik: 'Tedarikçi', hucre: (t) => t.ad },
  { anahtar: 'siparis', baslik: 'Sipariş satırı', hucre: (t) => t.siparisSatiri, hizala: 'sag' },
  { anahtar: 'karne', baslik: 'Zamanında (karne)', hucre: karneMetni },
  { anahtar: 'bayes', baslik: 'Zamanında (Bayes)', hucre: bayesMetni },
  { anahtar: 'gecikme', baslik: 'Gecikme', hucre: gecikmeMetni },
  { anahtar: 'sure', baslik: 'Tedarik süresi', hucre: (t) => sureMetni(t, gereken) },
  { anahtar: 'puan', baslik: 'Karne puanı', hucre: (t) => (t.karne?.puan === null || t.karne === null ? '-' : `${yuzdeMetni(t.karne.puan)} ${t.karne.sinif ?? ''}`.trim()) },
];

type Fiyat = SatinAlmaAnaliziCevabi['fiyatDegisimleri'][number];
const FIYAT_SUTUNLARI: readonly Sutun<Fiyat>[] = [
  { anahtar: 'ad', baslik: 'Malzeme', hucre: (f) => f.ad },
  { anahtar: 'onceki', baslik: 'Önceki', hucre: (f) => `${tarihMetni(f.onceki.tarih)}: ${miktarMetni(f.onceki.birimFiyat)} ${f.paraBirimi}/${f.birim}`, kirilmaz: true },
  { anahtar: 'son', baslik: 'Son', hucre: (f) => `${tarihMetni(f.son.tarih)}: ${miktarMetni(f.son.birimFiyat)} ${f.paraBirimi}/${f.birim}`, kirilmaz: true },
  { anahtar: 'degisim', baslik: 'Birim değişim (₺)', hucre: (f) => `${isaretliBirimTl(f.degisimTl)} (${isaretliYuzde(f.degisimYuzde)})`, hizala: 'sag' },
  { anahtar: 'fiyat', baslik: 'Fiyat etkisi', hucre: (f) => isaretliBirimTl(f.fiyatEtkisiTl), hizala: 'sag' },
  { anahtar: 'kur', baslik: 'Kur etkisi', hucre: (f) => (f.paraBirimi === 'TRY' ? '-' : isaretliBirimTl(f.kurEtkisiTl)), hizala: 'sag' },
];

const tuketimSutunlari = (gereken: number): readonly Sutun<SatinAlmaTuketimMalzemesi>[] => [
  { anahtar: 'ad', baslik: 'Malzeme', hucre: (m) => m.ad },
  { anahtar: 'xyz', baslik: 'XYZ', hucre: (m) => (m.xyz === null ? '-' : `${m.xyz} (${XYZ_ACIKLAMA[m.xyz]})`) },
  { anahtar: 'tahmin', baslik: 'Beklenen tüketim', hucre: (m) => tahminMetni(m, gereken) },
  { anahtar: 'sure', baslik: 'Tedarik süresi', hucre: (m) => gunMetni(m.tedarikSuresiGun) },
  { anahtar: 'guvenlik', baslik: 'Güvenlik stoğu (%95)', hucre: guvenlikMetni },
];

type SekmeAnahtari = 'ozet' | 'harcama' | 'fiyat' | 'tedarik' | 'tuketim';
const SEKMELER: readonly Sekme<SekmeAnahtari>[] = [
  { anahtar: 'ozet', baslik: 'Özet', simge: 'gauge' },
  { anahtar: 'harcama', baslik: 'Harcama', simge: 'lira' },
  { anahtar: 'fiyat', baslik: 'Fiyat', simge: 'chart' },
  { anahtar: 'tedarik', baslik: 'Tedarik', simge: 'truck' },
  { anahtar: 'tuketim', baslik: 'Tüketim', simge: 'box' },
];
const sekmeMi = (x: string | null): x is SekmeAnahtari => SEKMELER.some((s) => s.anahtar === x);

function Rapor({ c }: { c: SatinAlmaAnaliziCevabi }) {
  const [adres, adresYaz] = useSearchParams();
  const ham = adres.get('sekme');
  const sekme: SekmeAnahtari = sekmeMi(ham) ? ham : 'ozet';
  const sec = (a: SekmeAnahtari) => { adresYaz((o) => { const y = new URLSearchParams(o); y.set('sekme', a); return y; }, { replace: true }); };
  return (
    <>
      <Sekmeler etiket="Analiz bölümleri" sekmeler={SEKMELER} secili={sekme} sec={sec} />
      {sekme === 'ozet' && <Ozet c={c} />}
      {sekme === 'harcama' && <Harcama c={c} />}
      {sekme === 'fiyat' && (
        <>
          <FiyatSapmasi c={c} />
          <Kart baslik="Fiyat değişimi (son iki alış)" simge="lira">
            <Tablo etiket="Fiyat değişimi" sutunlar={FIYAT_SUTUNLARI} satirlar={c.fiyatDegisimleri} satirAnahtari={(f) => f.katalogId}
              bosMesaj="Aynı para birimi ve birimde iki siparişi olan malzeme yok." />
            <p className="sa-analiz-aciklama">Son iki siparişin ₺ birim fiyat farkı: fiyat etkisi (yeni kurla) ve kur etkisi (eski fiyatla) toplamı değişime eşittir. İskonto düşülmüştür.</p>
          </Kart>
        </>
      )}
      {sekme === 'tedarik' && (
        <>
          <SurecSureleri c={c} />
          <Kart baslik="Tedarikçi başarımı" simge="truck">
            <Tablo etiket="Tedarikçi başarımı" sutunlar={tedarikciSutunlari(c.sureGereken)} satirlar={c.tedarikciler} satirAnahtari={(t) => t.firmaId}
              bosMesaj="Son 24 ayda firmaya bağlı sipariş yok." />
            <p className="sa-analiz-aciklama">
              Zamanında oranı ve puan firma karnesinden (son 12 ay). Bayes kestirimi az teslimde temkinlidir: "en az" değeri %90 olasılıkla aşılır.
              Tedarik süresi sipariş gününden son teslime, yalnız tam teslimden; ortanca ve %80 için en az {c.sureGereken} teslim gerekir.
            </p>
          </Kart>
          <KuralDisiAlim c={c} />
        </>
      )}
      {sekme === 'tuketim' && <Tuketim c={c} />}
    </>
  );
}

function Harcama({ c }: { c: SatinAlmaAnaliziCevabi }) {
  const h = c.harcama;
  return (
    <div className="tc-pano-izgara">
      <SayiKarti baslik="Harcama (12 ay)" simge="lira" metin={h.toplamTl === null ? 'Veri yok' : tlMetni(h.toplamTl)} altMetin={harcamaAltMetni(h)} />
      <SayiKarti baslik="Tedarikçi" simge="truck" sayi={c.tedarikciler.length}
        altMetin={c.firmasizSatir > 0 ? `Firmaya bağlı olmayan ${String(c.firmasizSatir)} sipariş satırı karneye girmez.` : 'Son 24 ayda siparişi olan firmalar.'} />
      <YatayCubukKarti baslik="En çok harcanan kalemler" simge="chart" yuklendi bicim={(n) => tlMetni(n)}
        satirlar={h.kalemler.slice(0, 8).map((k) => ({ etiket: `${k.ad} (${k.sinif})`, deger: k.tutarTl }))}
        alt={`${h.basTarih} - ${h.bitTarih}. A: harcamanın ilk %80'i, B: sonraki %15, C: kalan.`} />
    </div>
  );
}

function Tuketim({ c }: { c: SatinAlmaAnaliziCevabi }) {
  const [secili, sec] = useState<number | null>(null);
  const malzeme = c.tuketim.malzemeler.find((m) => m.malzemeNo === secili) ?? c.tuketim.malzemeler[0];
  return (
    <>
      <Kart baslik="Tüketim tahmini" simge="box">
        <Tablo etiket="Tüketim tahmini" sutunlar={tuketimSutunlari(c.tuketim.gereken)} satirlar={c.tuketim.malzemeler} satirAnahtari={(m) => m.malzemeNo}
          satirSec={(m) => { sec(m.malzemeNo); }} bosMesaj={c.tuketim.stokBagi ? 'Kataloğa bağlı satın alınan malzeme yok.' : 'Stok bağlantısı kurulmamış: tüketim okunamıyor.'} />
        <p className="sa-analiz-aciklama">
          Aylık net tüketim stok hareketlerinden (tedarikçiye iade sayılmaz), stok biriminde. Tahmin aralıklı talebe uygun TSB yöntemiyle;
          en az {c.tuketim.gereken} ay geçmiş gerekir. Güvenlik stoğu %95 hizmet düzeyi için, malzemenin kendi tedarik süresiyle.
        </p>
      </Kart>
      {malzeme && (
        <CizgiGrafikKarti baslik={`Aylık tüketim: ${malzeme.ad}`} simge="chart" yuklendi genis
          etiketler={c.tuketim.aylar.map(ayEtiketi)} seriler={[{ ad: 'Tüketim', degerler: malzeme.seri }]}
          bicim={(n) => miktarMetni(n)} alt={tahminMetni(malzeme, c.tuketim.gereken)} />
      )}
    </>
  );
}
