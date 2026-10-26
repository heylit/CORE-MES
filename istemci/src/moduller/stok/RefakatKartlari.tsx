import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { RefakatKartlariCevabi, RefakatKartlariSatiri } from '#paylasilan/sozlesme/stok.ts';
import { DurumKutusu, Kart, Rozet, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { birimliMiktar, zamanMetni } from './gorunum.ts';
import { SayfaBasi, hataMetni } from './ortak.tsx';
import { RefakatKartPenceresi } from './RefakatKarti.tsx';
import './stok.css';

// Refakat kartları (kart #708): bütün kartlar tek listede; kart adına basınca kartın penceresi (lot, iz, baskı) açılır.
// Arama gelen listede yapılır: kart, emir, lot ve ürün; liste en yeni kartlarla sınırlıdır.
type Durum = 'acik' | 'tumu';
const SUZGECLER = [{ deger: 'acik', baslik: 'Açık', simge: 'route' }, { deger: 'tumu', baslik: 'Tümü', simge: 'list' }] as const;
const tarih = (t: string | null): string => (t === null ? '—' : new Date(`${t}T00:00:00`).toLocaleDateString('tr-TR'));
const kucuk = (s: string): string => s.toLocaleLowerCase('tr-TR');

function DurumRozeti({ k }: { k: RefakatKartlariSatiri }) {
  const r = k.refakat;
  if (r.durum === 'iptal') return <Rozet ton="pasif">İptal</Rozet>;
  if (r.birlestigi) return <Rozet ton="pasif">{r.birlestigi.etiket} kartına birleşti</Rozet>;
  if (r.lotNo === null) return <Rozet ton="uyari">Lot bekliyor</Rozet>;
  return <Rozet ton="tamam">Açık</Rozet>;
}

export const kartAramaMetni = (k: RefakatKartlariSatiri): string =>
  kucuk([k.refakat.etiket, k.refakat.emirNo, k.refakat.lotNo, k.urun.kod, k.urun.ad, k.refakat.malzemeKod].filter(Boolean).join(' '));

export function RefakatKartlari() {
  const [durum, setDurum] = useState<Durum>('acik');
  const [arama, setArama] = useState('');
  const [secili, setSecili] = useState<number | null>(null);
  const l = useQuery({
    queryKey: anahtarlar.liste('refakat-kartlari', { durum }),
    queryFn: () => api.get<RefakatKartlariCevabi>(`/stok/refakat-kartlari?durum=${durum}`),
  });
  const aranan = kucuk(arama.trim());
  const satirlar = (l.data?.kartlar ?? []).filter((k) => aranan === '' || kartAramaMetni(k).includes(aranan));
  const sutunlar: Sutun<RefakatKartlariSatiri>[] = [
    { anahtar: 'kart', baslik: 'Kart', mono: true, kirilmaz: true, csv: (k) => k.refakat.etiket,
      hucre: (k) => <button type="button" className="tc-stok-bag" onClick={() => setSecili(k.refakat.id)}>{k.refakat.etiket}</button> },
    { anahtar: 'urun', baslik: 'Ürün', hucre: (k) => <span>{k.urun.ad} <span className="tc-stok-not">{k.urun.kod}</span></span>, csv: (k) => `${k.urun.kod} ${k.urun.ad}` },
    { anahtar: 'lot', baslik: 'Lot', mono: true, hucre: (k) => k.refakat.lotNo ?? '—' },
    { anahtar: 'verilen', baslik: 'Verilen', hizala: 'sag', hucre: (k) => birimliMiktar(k.refakat.verilen, k.refakat.birim) },
    { anahtar: 'rota', baslik: 'Rota', hizala: 'sag', hucre: (k) => `${k.adimSayisi} adım`, csv: (k) => k.adimSayisi },
    { anahtar: 'adet', baslik: 'Emir adedi', hizala: 'sag', hucre: (k) => k.adet },
    { anahtar: 'termin', baslik: 'Termin', kirilmaz: true, hucre: (k) => tarih(k.teslim) },
    { anahtar: 'acilis', baslik: 'Açılış', kirilmaz: true, hucre: (k) => zamanMetni(k.refakat.kayitZamani) },
    { anahtar: 'durum', baslik: 'Durum', hucre: (k) => <DurumRozeti k={k} />, csv: (k) => k.refakat.durum },
  ];
  return (
    <section className="tc-stok">
      <SayfaBasi baslik="Refakat kartları" alt="Lotla emre verilen her kart. Kartı açınca lotu, izi ve baskısı görünür; akış ve süreler sonraki adımda bu sayfaya gelir." />
      {l.isError && <DurumKutusu durum="hata" mesaj={hataMetni(l.error)} yenile={() => void l.refetch()} />}
      {l.isPending && <DurumKutusu durum="yukleniyor" />}
      {l.data && (
        <Kart baslik={durum === 'acik' ? 'Açık kartlar' : 'Bütün kartlar'}>
          {l.data.sinirda && <p className="tc-stok-not">Yalnız en yeni kartlar gösteriliyor; arama bu kartlarda yapılır.</p>}
          <Tablo
            etiket="Refakat kartları" sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(k) => k.refakat.id}
            bosMesaj={aranan === '' ? 'Kart yok.' : 'Aramaya uyan kart yok.'}
            arac={{
              arama: { deger: arama, degistir: setArama, yerTutucu: 'Kart, emir, lot ya da ürün' },
              suzgec: { etiket: 'Durum', secenekler: SUZGECLER, secili: durum, sec: (d) => setDurum(d as Durum) },
              csv: { ad: 'refakat-kartlari' },
            }}
          />
        </Kart>
      )}
      {secili !== null && <RefakatKartPenceresi id={secili} kapat={() => setSecili(null)} />}
    </section>
  );
}
