import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { SatinAlmaAnaliziCevabi, SatinAlmaTedarikcisi, SatinAlmaTuketimMalzemesi } from '#paylasilan/sozlesme/satin-alma-analiz.ts';
import { DurumKutusu } from '../../../ortak/arayuz/DurumKutusu.tsx';
import { Kart } from '../../../ortak/arayuz/Kart.tsx';
import { SayfaBasligi } from '../../../ortak/arayuz/SayfaBasligi.tsx';
import { SayiKarti } from '../../../ortak/arayuz/SayiKarti.tsx';
import { Tablo, type Sutun } from '../../../ortak/arayuz/Tablo.tsx';
import { CizgiGrafikKarti, YatayCubukKarti } from '../../../ortak/arayuz/grafik/grafikler.tsx';
import { api } from '../../../ortak/veri/api.ts';
import {
  XYZ_ACIKLAMA, ayEtiketi, bayesMetni, gecikmeMetni, guvenlikMetni, gunMetni, harcamaAltMetni, isaretliTl, karneMetni, miktarMetni, sureMetni,
  tahminMetni, tlMetni, yuzdeMetni,
} from './kurallar.ts';
import './analiz.css';

// Satın alma analizi (2151, 2151-1 b): tedarikçi başarımı (firma karnesinden, 2151-2 a), harcama, fiyat değişimi ve tüketim tahmini
// (2151-3 b). Yalnız okur; her bölüm neyi ölçtüğünü ve verinin yetip yetmediğini yazar.
export const SATIN_ALMA_ANALIZI_YOLU = '/satin-alma-analiz';

export function SatinAlmaAnalizi() {
  const q = useQuery({ queryKey: ['satin-alma', 'analiz'], queryFn: () => api.get<SatinAlmaAnaliziCevabi>(SATIN_ALMA_ANALIZI_YOLU) });
  const yenile = () => { void q.refetch(); };
  return (
    <div>
      <SayfaBasligi baslik="Satın alma analizi" simge="chart" alt="Tedarikçi başarımı, harcama dağılımı, fiyat değişimi ve tüketim tahmini."
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
  { anahtar: 'onceki', baslik: 'Önceki', hucre: (f) => `${f.onceki.tarih}: ${miktarMetni(f.onceki.birimFiyat)} ${f.paraBirimi}/${f.birim}`, kirilmaz: true },
  { anahtar: 'son', baslik: 'Son', hucre: (f) => `${f.son.tarih}: ${miktarMetni(f.son.birimFiyat)} ${f.paraBirimi}/${f.birim}`, kirilmaz: true },
  { anahtar: 'degisim', baslik: 'TL değişim', hucre: (f) => `${isaretliTl(f.degisimTl)} (${f.degisimYuzde === null ? '-' : `${f.degisimYuzde > 0 ? '+' : ''}${yuzdeMetni(f.degisimYuzde)}`})`, hizala: 'sag' },
  { anahtar: 'fiyat', baslik: 'Fiyat etkisi', hucre: (f) => isaretliTl(f.fiyatEtkisiTl), hizala: 'sag' },
  { anahtar: 'kur', baslik: 'Kur etkisi', hucre: (f) => (f.paraBirimi === 'TRY' ? '-' : isaretliTl(f.kurEtkisiTl)), hizala: 'sag' },
];

const tuketimSutunlari = (gereken: number): readonly Sutun<SatinAlmaTuketimMalzemesi>[] => [
  { anahtar: 'ad', baslik: 'Malzeme', hucre: (m) => m.ad },
  { anahtar: 'xyz', baslik: 'XYZ', hucre: (m) => (m.xyz === null ? '-' : `${m.xyz} (${XYZ_ACIKLAMA[m.xyz]})`) },
  { anahtar: 'tahmin', baslik: 'Beklenen tüketim', hucre: (m) => tahminMetni(m, gereken) },
  { anahtar: 'sure', baslik: 'Tedarik süresi', hucre: (m) => gunMetni(m.tedarikSuresiGun) },
  { anahtar: 'guvenlik', baslik: 'Güvenlik stoğu (%95)', hucre: guvenlikMetni },
];

function Rapor({ c }: { c: SatinAlmaAnaliziCevabi }) {
  const [secili, sec] = useState<number | null>(null);
  const malzeme = c.tuketim.malzemeler.find((m) => m.malzemeNo === secili) ?? c.tuketim.malzemeler[0];
  const h = c.harcama;
  return (
    <>
      <div className="tc-pano-izgara">
        <SayiKarti baslik="Harcama (12 ay)" simge="lira" metin={h.toplamTl === null ? 'Veri yok' : tlMetni(h.toplamTl)} altMetin={harcamaAltMetni(h)} />
        <SayiKarti baslik="Tedarikçi" simge="truck" sayi={c.tedarikciler.length}
          altMetin={c.firmasizSatir > 0 ? `Firmaya bağlı olmayan ${String(c.firmasizSatir)} sipariş satırı karneye girmez.` : 'Son 24 ayda siparişi olan firmalar.'} />
        <YatayCubukKarti baslik="En çok harcanan kalemler" simge="chart" yuklendi bicim={(n) => tlMetni(n)}
          satirlar={h.kalemler.slice(0, 8).map((k) => ({ etiket: `${k.ad} (${k.sinif})`, deger: k.tutarTl }))}
          alt={`${h.basTarih} - ${h.bitTarih}. A: harcamanın ilk %80'i, B: sonraki %15, C: kalan.`} />
      </div>
      <Kart baslik="Tedarikçi başarımı" simge="truck">
        <Tablo etiket="Tedarikçi başarımı" sutunlar={tedarikciSutunlari(c.sureGereken)} satirlar={c.tedarikciler} satirAnahtari={(t) => t.firmaId}
          bosMesaj="Son 24 ayda firmaya bağlı sipariş yok." />
        <p className="sa-analiz-aciklama">
          Zamanında oranı ve puan firma karnesinden (son 12 ay). Bayes kestirimi az teslimde temkinlidir: "en az" değeri %90 olasılıkla aşılır.
          Tedarik süresi sipariş gününden son teslime, yalnız tam teslimden; ortanca ve %80 için en az {c.sureGereken} teslim gerekir.
        </p>
      </Kart>
      <Kart baslik="Fiyat değişimi" simge="lira">
        <Tablo etiket="Fiyat değişimi" sutunlar={FIYAT_SUTUNLARI} satirlar={c.fiyatDegisimleri} satirAnahtari={(f) => f.katalogId}
          bosMesaj="Aynı para birimi ve birimde iki siparişi olan malzeme yok." />
        <p className="sa-analiz-aciklama">Son iki siparişin TL birim fiyat farkı: fiyat etkisi (yeni kurla) ve kur etkisi (eski fiyatla) toplamı değişime eşittir. İskonto düşülmüştür.</p>
      </Kart>
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
