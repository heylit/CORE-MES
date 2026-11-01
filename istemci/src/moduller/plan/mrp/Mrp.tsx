import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { MrpIhtiyaciCevabi } from '#paylasilan/sozlesme/plan.ts';
import { DurumKutusu } from '../../../ortak/arayuz/DurumKutusu.tsx';
import { Kart } from '../../../ortak/arayuz/Kart.tsx';
import { Rozet } from '../../../ortak/arayuz/Rozet.tsx';
import { SayfaBasligi } from '../../../ortak/arayuz/SayfaBasligi.tsx';
import { SayiKarti } from '../../../ortak/arayuz/SayiKarti.tsx';
import { Simge } from '../../../ortak/arayuz/Simge.tsx';
import { Tablo, type Sutun, type TabloSuzgeci } from '../../../ortak/arayuz/Tablo.tsx';
import { api } from '../../../ortak/veri/api.ts';
import { gunMetni, mrpOzeti, netGorunur, sayiMetni, suz, turAdi, yetkiNotu, zamanMetni, type MrpSatiri, type MrpSuzgeci } from './kurallar.ts';
import './mrp.css';

// Malzeme ihtiyacı (1472 M1, ekran 1560, 1564 a): açık emirlerin brüt ve net malzeme ihtiyacı. Yalnız okur; görünmeyen stok ve satın alma
// alanlarının (1545 a) sütunu listeden çıkar.
export const MRP_YOLU = '/plan/mrp';
const UC = '/plan/mrp-ihtiyaci';

export function Mrp() {
  const q = useQuery({ queryKey: ['plan', 'mrp-ihtiyaci'], queryFn: () => api.get<MrpIhtiyaciCevabi>(UC) });
  const yenile = () => { void q.refetch(); };
  return (
    <div className="tc-mrp">
      <SayfaBasligi baslik="Malzeme ihtiyacı" simge="box" alt="Açık emirlerin malzeme ihtiyacı; stok ve açık siparişle netlenir. Yalnız okur."
        birincil={{ etiket: 'Yenile', simge: 'rotate', yap: yenile, yukleniyor: q.isFetching }} />
      {q.isPending ? <DurumKutusu durum="yukleniyor" />
        : q.isError ? <DurumKutusu durum="hata" yenile={yenile} />
          : <Rapor c={q.data} />}
    </div>
  );
}

function Rapor({ c }: { c: MrpIhtiyaciCevabi }) {
  const not = yetkiNotu(c);
  const ozet = mrpOzeti(c);
  return (
    <>
      {not && <p className="tc-mrp-not" role="status"><Simge ad="lock" boyut="k" /><span><b>{not.baslik}</b> {not.metin}</span></p>}
      {c.urunsuzEmir > 0 && (
        <p className="tc-mrp-not" role="status">
          <Simge ad="alert" boyut="k" />
          <span><b>{`${String(c.urunsuzEmir)} açık emrin ürünü yok:`}</b> malzeme ihtiyacı hesaplanamadı, listeye girmedi.</span>
        </p>
      )}
      <div className="tc-pano-izgara">
        <SayiKarti baslik="Malzeme" simge="box" sayi={ozet.malzeme} altMetin="Açık emirlerde ihtiyacı olan malzeme" />
        <SayiKarti baslik="Eksik malzeme" simge="alert" sayi={ozet.eksik} ton="uyari"
          altMetin={ozet.eksik === null ? 'Stok ve satın alma okuma yetkisi gerekir' : 'Stok ve zamanında gelen siparişle karşılanmayan'} />
        {ozet.ilkEksikGunu === null
          ? <SayiKarti baslik="İlk eksik günü" simge="calendar" sayi={null} altMetin="Karşılanamayan ilk tüketim" />
          : <SayiKarti baslik="İlk eksik günü" simge="calendar" metin={ozet.ilkEksikGunu === 'yok' ? 'Eksik yok' : gunMetni(ozet.ilkEksikGunu)!}
            altMetin="Karşılanamayan ilk tüketim" />}
        <SayiKarti baslik="Ürünsüz emir" simge="flag" sayi={c.urunsuzEmir} ton="uyari" altMetin="İhtiyacı hesaplanamayan açık emir" />
      </div>
      <Liste c={c} />
    </>
  );
}

function Miktar({ n, birim }: { n: number; birim: string | null }) {
  return <span className="tc-mrp-miktar"><span className="mono">{sayiMetni(n)}</span> <span className="tc-mrp-birim">{birim ?? ''}</span></span>;
}

const miktar = (n: number | null, s: MrpSatiri) => (n === null ? null : <Miktar n={n} birim={s.malzeme.birim} />);

function sutunlar(c: MrpIhtiyaciCevabi): Sutun<MrpSatiri>[] {
  const net = netGorunur(c);
  const l: (Sutun<MrpSatiri> | false)[] = [
    { anahtar: 'malzeme', baslik: 'Malzeme', csv: (s) => `${s.malzeme.kod ?? ''} ${s.malzeme.ad ?? ''}`.trim(), hucre: (s) => (
      <span className="tc-mrp-malzeme">
        <span><span className="mono">{s.malzeme.kod ?? '-'}</span> {s.malzeme.ad ?? ''}</span>
        {s.malzeme.tur !== null && <small>{turAdi(s.malzeme.tur)}</small>}
        {(s.acildi || s.acilanlar.length > 0) && (
          <span className="tc-mrp-kaynak">
            {s.acildi && <Rozet gorunum="cizgi">Ağaçla açıldı</Rozet>}
            {s.acilanlar.map((x) => <Rozet key={x.id} ton="pasif" gorunum="cizgi">{`Ağaçtan: ${x.kod ?? String(x.id)}`}</Rozet>)}
          </span>
        )}
      </span>
    ) },
    { anahtar: 'brut', baslik: 'Brüt', hizala: 'sag', csv: (s) => s.brut, hucre: (s) => miktar(s.brut, s) },
    c.stokGorunur && { anahtar: 'serbest', baslik: 'Serbest stok', hizala: 'sag', csv: (s) => s.serbest, hucre: (s) => miktar(s.serbest, s) },
    c.satinAlmaGorunur && { anahtar: 'siparis', baslik: 'Açık sipariş', hizala: 'sag', csv: (s) => s.acikSiparis, hucre: (s) => miktar(s.acikSiparis, s) },
    c.stokGorunur && { anahtar: 'emniyet', baslik: 'Emniyet payı', hizala: 'sag', csv: (s) => s.emniyetPayi,
      hucre: (s) => (s.emniyetPayi === 0 ? <span className="mono">0</span> : miktar(s.emniyetPayi, s)) },
    net && { anahtar: 'net', baslik: 'Net ihtiyaç', hizala: 'sag', csv: (s) => s.net, hucre: (s) => {
      if (s.net === null) return null;
      if (s.net === 0) return <Rozet ton="tamam">Yeterli</Rozet>;
      return <span className="tc-mrp-net"><Rozet ton={s.acildi ? 'bilgi' : 'uyari'}>{s.acildi ? 'Üretilecek' : 'Eksik'}</Rozet><Miktar n={s.net} birim={s.malzeme.birim} /></span>;
    } },
    { anahtar: 'ihtiyac', baslik: 'İhtiyaç günü', kirilmaz: true, csv: (s) => s.ihtiyacTarihi,
      hucre: (s) => gunMetni(s.ihtiyacTarihi) ?? <span className="tc-mrp-soluk">planda değil</span> },
    net && { anahtar: 'eksik', baslik: 'Eksik günü', kirilmaz: true, csv: (s) => s.eksikTarihi,
      hucre: (s) => (s.net === null || s.net === 0 ? null : gunMetni(s.eksikTarihi) ?? <span className="tc-mrp-soluk">günü bilinmiyor</span>) },
    { anahtar: 'emirler', baslik: 'Emirler', csv: (s) => s.emirler.join(' '), hucre: (s) => (s.emirler.length === 1
      ? <span className="mono">{s.emirler[0]}</span>
      : <details><summary>{`${String(s.emirler.length)} emir`}</summary><ul>{s.emirler.map((e) => <li key={e} className="mono">{e}</li>)}</ul></details>) },
  ];
  return l.filter((s): s is Sutun<MrpSatiri> => s !== false);
}

function Liste({ c }: { c: MrpIhtiyaciCevabi }) {
  const [ara, araYaz] = useState('');
  const [suzgec, suzgecYaz] = useState<MrpSuzgeci>('tum');
  const satirlar = suz(c.satirlar, suzgec, ara);
  const secenekler: TabloSuzgeci[] = [
    { deger: 'tum', baslik: 'Tümü', simge: 'list' },
    ...(netGorunur(c) ? [{ deger: 'eksik', baslik: 'Eksik', simge: 'alert' } as const] : []),
    { deger: 'agac', baslik: 'Ağaçtan', simge: 'layers' },
  ];
  const zaman = <span className="tc-mrp-zaman"><Simge ad="clock" boyut="k" />{`Hesaplandı ${zamanMetni(c.hesaplanan)}`}</span>;
  return (
    <Kart baslik="Malzeme listesi" simge="list" sag={zaman}>
      {c.satirlar.length === 0 ? <DurumKutusu durum="bos" mesaj="Açık emirlerde malzeme ihtiyacı yok." /> : (
        <Tablo<MrpSatiri>
          etiket="Malzeme ihtiyacı"
          satirlar={satirlar}
          satirAnahtari={(s) => s.malzeme.id}
          bosMesaj="Süzgece uyan malzeme yok."
          sutunlar={sutunlar(c)}
          arac={{
            arama: { deger: ara, degistir: araYaz, etiket: 'Malzeme ara', yerTutucu: 'Kod ya da ad' },
            suzgec: { etiket: 'Süz', secenekler, secili: suzgec, sec: (d) => { suzgecYaz(d as MrpSuzgeci); } },
            csv: { ad: 'malzeme-ihtiyaci' },
          }}
        />
      )}
    </Kart>
  );
}
