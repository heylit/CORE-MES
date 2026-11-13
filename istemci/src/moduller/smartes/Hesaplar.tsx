import { useQuery } from '@tanstack/react-query';
import type { HesaplarCevabi } from '#paylasilan/sozlesme/smartes.ts';
import { DurumKutusu, Kart, Rozet, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { YOK, sayiMetni } from './gosterim.ts';
import './smartes.css';

type Oee = HesaplarCevabi['oee'][number];
type Cevrim = HesaplarCevabi['cevrim'][number];

const TARIH = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const yuzde = (n: number | null): string => (n === null ? YOK : `%${Math.round(n)}`);
const saniye = (n: number | null): string => (n === null ? YOK : `${n.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} sn`);
// Fark işaretiyle ve kelimeyle yazılır; küçük fark (OEE'de 5 puan, çevrimde %10) uyarı sayılmaz.
const Fark = ({ fark, esik, birim }: { fark: number | null; esik: number; birim: string }) => {
  if (fark === null) return <>{YOK}</>;
  const metin = `${fark > 0 ? '+' : ''}${fark.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} ${birim}`;
  return Math.abs(fark) > esik ? <Rozet ton="uyari" gorunum="cizgi">{metin}</Rozet> : <span className="tc-sm-mono">{metin}</span>;
};

const OEE_SUTUNLARI: readonly Sutun<Oee>[] = [
  { anahtar: 'tarih', baslik: 'Vardiya', hucre: (o) => `${TARIH.format(new Date(`${o.vardiyaTarihi}T12:00:00`))} · ${o.vardiya}. vardiya`, kirilmaz: true },
  { anahtar: 'makine', baslik: 'Makine', hucre: (o) => o.makineKodu, mono: true },
  { anahtar: 'k', baslik: 'Kullanılabilirlik', hucre: (o) => yuzde(o.kullanilabilirlik), hizala: 'sag', mono: true },
  { anahtar: 'p', baslik: 'Performans', hucre: (o) => yuzde(o.performans), hizala: 'sag', mono: true },
  { anahtar: 'q', baslik: 'Kalite', hucre: (o) => yuzde(o.kalite), hizala: 'sag', mono: true },
  { anahtar: 'oee', baslik: 'SmartES OEE', hucre: (o) => yuzde(o.oee), hizala: 'sag', mono: true },
  { anahtar: 'core', baslik: 'CORE OEE', hucre: (o) => yuzde(o.coreOee), hizala: 'sag', mono: true },
  { anahtar: 'fark', baslik: 'Fark', hucre: (o) => <Fark fark={o.oee === null || o.coreOee === null ? null : o.oee - o.coreOee} esik={5} birim="puan" />, hizala: 'sag' },
];

const cevrimFarki = (c: Cevrim): number | null => (c.gercekSaniye === null || c.tanimliSaniye === null ? null : c.gercekSaniye - c.tanimliSaniye);
const CEVRIM_SUTUNLARI: readonly Sutun<Cevrim>[] = [
  { anahtar: 'stok', baslik: 'Stok', hucre: (c) => c.stokNo ?? YOK, mono: true },
  { anahtar: 'yer', baslik: 'Operasyon · makine', hucre: (c) => `${c.operasyonKodu ?? YOK} · ${c.makineKodu ?? YOK}`, mono: true },
  { anahtar: 'tanimli', baslik: 'CORE’da tanımlı', hucre: (c) => saniye(c.tanimliSaniye), hizala: 'sag', mono: true },
  // Birimi belli olmayan süre saniyeye çevrilmez; SmartES’in gönderdiği haliyle gösterilir ve fark hesaplanmaz.
  { anahtar: 'gercek', baslik: 'SmartES’in ölçtüğü', hucre: (c) => (c.gercekSaniye === null ? (c.gercekMetni ?? YOK) : saniye(c.gercekSaniye)), hizala: 'sag', mono: true },
  {
    anahtar: 'fark', baslik: 'Fark', hizala: 'sag',
    hucre: (c) => <Fark fark={cevrimFarki(c)} esik={c.tanimliSaniye === null ? 0 : c.tanimliSaniye * 0.1} birim="sn" />,
  },
  { anahtar: 'parca', baslik: 'Parça', hucre: (c) => sayiMetni(c.parcaSayisi), hizala: 'sag', mono: true },
  { anahtar: 'gun', baslik: 'Kaç günden', hucre: (c) => sayiMetni(c.gunSayisi), hizala: 'sag', mono: true },
];

export function Hesaplar() {
  const h = useQuery({ queryKey: anahtarlar.hesaplar, queryFn: () => api.get<HesaplarCevabi>('/smartes/hesaplar') });
  return (
    <div className="tc-sg-sayfa">
      <Kart baslik="OEE: SmartES’in hesabı ve CORE’un hesabı">
        <div className="tc-smartes">
          <p className="tc-smartes-aciklama">
            SmartES OEE’yi kendi vardiyasına ve kendi ölçtüğü çevrime göre hesaplar; CORE vardiya takvimine, tanımlı birim süreye ve kalite kararlarına göre. İkisi aynı çıkmayabilir; CORE’un raporlarında CORE’un hesabı kullanılır.
          </p>
          {h.isPending && <DurumKutusu durum="yukleniyor" />}
          {h.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(h.error, 'Hesaplar alınamadı')} yenile={() => { void h.refetch(); }} />}
          {h.data && <Tablo etiket="OEE karşılaştırması" sutunlar={OEE_SUTUNLARI} satirlar={h.data.oee} satirAnahtari={(o) => `${o.vardiyaTarihi}-${o.vardiya}-${o.makineKodu}`} bosMesaj="SmartES’ten OEE okunmadı." />}
        </div>
      </Kart>
      <Kart baslik="Çevrim süresi: tanımlı ve gerçek">
        <div className="tc-smartes">
          <p className="tc-smartes-aciklama">SmartES’in makinede ölçtüğü çevrim, plandaki iş emirlerinin tanımlı birim süresiyle karşılaştırılır. Tanımlı süre kendiliğinden değişmez; farkı büyük olanlar işaretlenir.</p>
          {h.data && <Tablo etiket="Çevrim süresi farkları" sutunlar={CEVRIM_SUTUNLARI} satirlar={h.data.cevrim} satirAnahtari={(c) => `${c.stokNo}-${c.operasyonKodu}-${c.makineKodu}`} bosMesaj="SmartES’ten çevrim süresi okunmadı." />}
        </div>
      </Kart>
    </div>
  );
}
