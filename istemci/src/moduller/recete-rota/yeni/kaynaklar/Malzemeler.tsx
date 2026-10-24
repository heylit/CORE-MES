import { useState } from 'react';
import { DurumKutusu, Dugme, Rozet, Tablo, useBildirim, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { sayi, YOK } from '../bicim.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import { useEskiKayit, type RrDurumu } from '../veri.ts';
import type { RrYetkisi } from '../yetki.ts';
import {
  eskiKalemler, kategoriler, malzemeSuz, MALZEME_TURLERI, minimumAltinda, sayiGirdisi, turAdi, type EskiKalem,
} from './kurallar.ts';
import { SahibindeDuzenle, SatirGirdisi, useR2Komutu } from './parcalar.tsx';
import { Statuler } from './Statuler.tsx';

// Malzemeler (envanter 2.6): kartlar Malzemeler ve Hizmetler'den okunur, burada yalnız okunur. Bu bölümde yazılanlar sahibinin
// komutlarıdır: birim maliyet (finans) ve elle tanımlanan statü (Reçete ve Rota'nın kendi tablosu). Statülü kart satırı yoktur (statü
// işi 256 kartı ayrı modele taşıyor). Kayıt belgesindeki kartı olmayan eski kalemler yalnız okunur (204 a); karta bağlama yoktur.
type Malzeme = NonNullable<RrDurumu['items']>[number];

export const MALZEMELER_ACIKLAMASI = 'Kalemler Malzemeler ve Hizmetler kartlarından okunur; kod, ad, birim ve kategori orada değişir. Stok miktarı salt '
  + 'okunurdur. Birim maliyet Finans\'ta tutulur: rotası olan yarı mamul ve mamullerin malzeme maliyeti adımlara giren malzemelerden toplanır.';

export function Malzemeler({ veri, yetki, git }: EkranOzellikleri) {
  const { durum } = veri;
  const [arama, aramaYaz] = useState('');
  const [tur, turYaz] = useState('');
  const [kategori, kategoriYaz] = useState('');

  if (durum.items === null) {
    return (
      <div className="tc-rr2" data-parca="R2">
        <DurumKutusu durum="bos" mesaj="Malzeme kartları için okuma yetkiniz yok; bu bölüm boş görünür. Yetki yöneticiden istenir." />
      </div>
    );
  }
  const kartlar = durum.items;
  const kats = kategoriler(kartlar, tur);
  const suzulen = malzemeSuz(kartlar, { arama, tur, kategori });
  const turler = MALZEME_TURLERI.filter(([t]) => !tur || t === tur);

  return (
    <div className="tc-rr2" data-parca="R2">
      <p className="tc-rr2-not">{MALZEMELER_ACIKLAMASI}</p>
      {durum.malzemeKesildi && <p className="tc-rr2-uyari" role="status">Kart listesi üst sınırda kesildi; aramayla daraltın.</p>}
      <div className="tc-rr2-arac">
        <input
          className="tc-alan-kutu tc-rr2-arama" type="search" value={arama} placeholder="Kod ya da ad ara…" aria-label="Malzeme ara"
          onChange={(o) => { aramaYaz(o.target.value); }}
        />
        <SahibindeDuzenle sahip="malzeme" />
      </div>
      <div className="tc-rr2-cipler" role="group" aria-label="Tür">
        <Dugme aria-pressed={!tur} onClick={() => { turYaz(''); kategoriYaz(''); }}>Tümü {kartlar.length}</Dugme>
        {MALZEME_TURLERI.map(([t, ad]) => (
          <Dugme key={t} aria-pressed={tur === t} onClick={() => { turYaz(t); kategoriYaz(''); }}>
            {ad} {kartlar.filter((k) => k.type === t).length}
          </Dugme>
        ))}
      </div>
      {kats.length > 0 && (
        <div className="tc-rr2-cipler" role="group" aria-label="Kategori">
          <Dugme aria-pressed={!kategori} onClick={() => kategoriYaz('')}>Tüm kategoriler</Dugme>
          {kats.map(([k, ad]) => <Dugme key={k} aria-pressed={kategori === k} onClick={() => kategoriYaz(k)}>{ad}</Dugme>)}
        </div>
      )}
      {kartlar.length === 0 && (
        <DurumKutusu durum="bos" mesaj="Henüz onaylı malzeme kartı yok. Kartı Malzemeler ve Hizmetler'de açın; onaylanınca burada görünür." />
      )}
      {kartlar.length > 0 && suzulen.length === 0 && !tur && <DurumKutusu durum="bos" mesaj="Aramaya uyan kart yok." />}
      {kartlar.length > 0 && turler.map(([t, ad]) => {
        const tum = kartlar.filter((k) => k.type === t);
        const liste = suzulen.filter((k) => k.type === t);
        if (liste.length === 0 && tur !== t) return null;
        return (
          <section key={t} className="tc-rr2-grup" aria-label={ad}>
            <h3 className="tc-rr2-grup-baslik">
              <span>{ad}</span>
              <Rozet ton="pasif">{liste.length === tum.length ? String(tum.length) : `${String(liste.length)} / ${String(tum.length)}`}</Rozet>
            </h3>
            <KartTablosu baslik={ad} kartlar={liste} durum={durum} yetki={yetki} semadaAc={(id) => git('schema', id)} />
          </section>
        );
      })}
      <EskiKayitlar kartlar={kartlar} />
      <Statuler durum={durum} yetki={yetki} />
    </div>
  );
}

function KartTablosu({ baslik, kartlar, durum, yetki, semadaAc }: {
  baslik: string; kartlar: readonly Malzeme[]; durum: RrDurumu; yetki: RrYetkisi; semadaAc: (id: string) => void;
}) {
  const { calistir } = useR2Komutu();
  const { bildir } = useBildirim();
  const maliyet = durum.maliyet;
  const maliyetYazar = maliyet !== null && maliyet.yazabilir && yetki.maliyetYaz;
  const rotali = (id: string) => durum.routes?.[id] !== undefined;

  const maliyetYaz = async (m: Malzeme, ham: string): Promise<boolean> => {
    const eski = maliyet?.malzeme[m.id] ?? null;
    const g = sayiGirdisi(ham, 1_000_000_000);
    if (!g.tamam) { bildir('hata', g.ileti); return false; }
    if (g.deger === null) { if (eski !== null) bildir('hata', 'Maliyet boş bırakılamaz; kaldırmak için 0 gir.'); return false; }
    return (await calistir('maliyet-yaz', { tur: 'malzeme', anahtar: m.id, birimMaliyet: g.deger })) === null;
  };

  const sutunlar: Sutun<Malzeme>[] = [
    { anahtar: 'kod', baslik: 'Kod', hucre: (m) => m.code, kirilmaz: true },
    { anahtar: 'ad', baslik: 'Ad', hucre: (m) => m.name },
    { anahtar: 'birim', baslik: 'Birim', hucre: (m) => m.unit ?? YOK },
    { anahtar: 'kategori', baslik: 'Kategori', hucre: (m) => m.kategoriAdi ?? YOK },
    {
      anahtar: 'stok', baslik: 'Stok', hizala: 'sag',
      hucre: (m) => (
        <span className="tc-rr2-satir">
          {sayi(m.stock)}{minimumAltinda(m.stock, m.min) && <Rozet ton="uyari">az</Rozet>}
        </span>
      ),
    },
    {
      anahtar: 'maliyet', baslik: 'Birim maliyet', hizala: 'sag',
      hucre: (m) => {
        if (rotali(m.id)) return <span title="Rotaya giren malzemelerden hesaplanır">Rotadan hesaplanır</span>;
        const k = maliyet?.malzeme[m.id];
        const deger = k ? String(Number(k.birimMaliyet)) : '';
        if (maliyetYazar) return <SatirGirdisi sayi deger={deger} etiket={`${m.code} birim maliyet`} kaydet={(v) => maliyetYaz(m, v)} />;
        if (maliyet === null) return <span title="Birim maliyetleri görme yetkin yok">{YOK}</span>;
        return k ? `${sayi(Number(k.birimMaliyet))} ${k.paraBirimi}` : YOK;
      },
    },
    {
      anahtar: 'eylem', baslik: 'Eylem', csv: false,
      hucre: (m) => (m.type === 'yari' || m.type === 'mamul'
        ? <Dugme simge="route" onClick={() => semadaAc(m.id)} aria-label={`${m.code} akış şemasında aç`}>Şemada aç</Dugme>
        : null),
    },
  ];
  return <Tablo<Malzeme> etiket={`${baslik} kartları`} sutunlar={sutunlar} satirlar={kartlar} satirAnahtari={(m) => m.id} bosMesaj="Bu süzgeçle kart yok." />;
}

function EskiKayitlar({ kartlar }: { kartlar: readonly Malzeme[] }) {
  const kayit = useEskiKayit();
  if (!kayit.data) return null;
  const eskiler = eskiKalemler(kayit.data.deger, new Set(kartlar.map((k) => k.id)));
  if (eskiler.length === 0) return null;
  const sutunlar: Sutun<EskiKalem>[] = [
    { anahtar: 'kod', baslik: 'Kod', hucre: (e) => e.kod || YOK, kirilmaz: true },
    { anahtar: 'ad', baslik: 'Ad', hucre: (e) => e.ad || YOK },
    { anahtar: 'tur', baslik: 'Tür', hucre: (e) => (e.tur ? turAdi(e.tur) : YOK) },
  ];
  return (
    <section className="tc-rr2-grup" aria-label="Kartı olmayan eski kayıtlar">
      <h3 className="tc-rr2-grup-baslik"><span>Kartı olmayan eski kayıtlar</span><Rozet ton="pasif">{String(eskiler.length)}</Rozet></h3>
      <p className="tc-rr2-not">Rotalarda kullanılan eski kalemler. Bu ekranda yalnız okunur; karşılığı olan karta bağlama bu ekranda yapılmaz.</p>
      <Tablo<EskiKalem> etiket="Eski kalemler" sutunlar={sutunlar} satirlar={eskiler} satirAnahtari={(e) => e.id} />
    </section>
  );
}
