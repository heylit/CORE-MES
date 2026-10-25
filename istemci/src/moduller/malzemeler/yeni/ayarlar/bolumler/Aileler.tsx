import { useState } from 'react';
import { Dugme, Girdi, OnayPenceresi, Secim, Tablo, type Sutun } from '../../../../../ortak/arayuz/index.ts';
import { gecerliAileSinif, type Duzen } from '../duzen.ts';
import { FORMS, type Aile, type Sinif } from '../kaynak.ts';
import { aileEkle, aileGizleDegistir, aileSil, sinifEkle, sinifGizleDegistir, sinifSil } from '../islemler.ts';
import { BolumBasligi, BosHucre, CokluSecim, EklendiIsareti, Kutu, Kullan, SilDugmesi, YeniDugmesi } from '../parcalar.tsx';

type AileSatiri = { anahtar: string; f: Aile };
type SinifSatiri = { anahtar: string; c: Sinif };
type Silinecek = { tur: 'aile'; anahtar: string; ad: string } | { tur: 'sinif'; anahtar: string; ad: string };

const sinifSayisi = (f: Aile) => Object.keys(f.classes).length;
const kaliteSayisi = (f: Aile) => Object.values(f.classes).reduce((a, c) => a + c.grades.length, 0);

// 465/2 b: prototipteki serbest renk seçici yerine tasarım değişkenleri. Kayda prototipteki gibi renk kodu yazılır (etiketin
// renk şeridi basılı çıktıda kodla çizilir); seçim anındaki temanın değeridir.
const AILE_RENKLERI = [
  { ad: 'Mavi', degisken: 'done' }, { ad: 'Yeşil', degisken: 'run' }, { ad: 'Sarı', degisken: 'hazard-ink' }, { ad: 'Pembe', degisken: 'grafik-2' },
  { ad: 'Gri', degisken: 'idle' }, { ad: 'Lacivert', degisken: 'grafik' }, { ad: 'Turuncu', degisken: 'hold' }, { ad: 'Kırmızı', degisken: 'stop' },
] as const;
const degiskenRengi = (degisken: string) => getComputedStyle(document.documentElement).getPropertyValue(`--${degisken}`).trim();

function RenkSecici({ secili, sec }: { secili: string; sec: (degisken: string) => void }) {
  return (
    <div className="tc-ma-renkler" role="radiogroup" aria-label="Renk">
      <span className="tc-ma-renkler-ad">Renk</span>
      {AILE_RENKLERI.map((r) => (
        <button
          key={r.degisken} type="button" role="radio" aria-checked={secili === r.degisken} aria-label={r.ad} title={r.ad}
          className="tc-ma-renk" data-renk={r.degisken} onClick={() => sec(r.degisken)}
        />
      ))}
    </div>
  );
}

function YeniAile({ d }: { d: Duzen }) {
  const [g, gYaz] = useState({ ad: '', kod: '', kaynak: 'diger', forms: [] as string[] });
  const [renk, renkYaz] = useState<string>(AILE_RENKLERI[3].degisken);
  const ekle = () => {
    const s = aileEkle(d.v, d.t, { ...g, renk: degiskenRengi(renk) });
    if (d.uygula(s) && s.tamam && s.anahtar) d.sec({ yeni: 'sinif', aile: s.anahtar, sinif: '' });
  };
  return (
    <Kutu baslik="Yeni hammadde ailesi">
      <div className="tc-ma-alanlar">
        <Girdi etiket="Aile adı" maxLength={40} placeholder="ör. Kauçuk-metal" value={g.ad} onChange={(e) => gYaz({ ...g, ad: e.target.value })} />
        <Girdi etiket="Kod (3 harf)" maxLength={3} placeholder="KMT" className="tc-ma-buyuk" value={g.kod} onChange={(e) => gYaz({ ...g, kod: e.target.value })} />
        <Secim
          etiket="Seçenekleri şu aileden al" value={g.kaynak} onChange={(e) => gYaz({ ...g, kaynak: e.target.value })}
          secenekler={Object.entries(d.taban.FAMS).map(([k, x]) => ({ deger: k, baslik: x.ad }))}
        />
      </div>
      <RenkSecici secili={renk} sec={renkYaz} />
      <CokluSecim
        etiket="Formlar (seçmezsen kaynak ailenin formları)" secili={g.forms} degistir={(forms) => gYaz({ ...g, forms })}
        secenekler={Object.entries(FORMS).map(([k, x]) => ({ deger: k, baslik: x.ad }))}
      />
      <div className="tc-ma-eylemler"><Dugme tur="birincil" simge="plus" onClick={ekle}>Aileyi ekle</Dugme></div>
    </Kutu>
  );
}

function YeniSinif({ d, aile }: { d: Duzen; aile: string }) {
  const [g, gYaz] = useState({ ad: '', kod: '' });
  const ekle = () => {
    const s = sinifEkle(d.v, d.t, aile, g);
    if (d.uygula(s) && s.tamam && s.anahtar) d.sec({ yeni: null, sinif: s.anahtar });
  };
  return (
    <Kutu>
      <div className="tc-ma-alanlar">
        <Girdi etiket="Sınıf adı" maxLength={50} placeholder="ör. Yüksek mukavemetli çelikler" value={g.ad} onChange={(e) => gYaz({ ...g, ad: e.target.value })} />
        <Girdi etiket="Kısaltma (kod grubu)" maxLength={3} placeholder="YMC" className="tc-ma-buyuk" value={g.kod} onChange={(e) => gYaz({ ...g, kod: e.target.value })} />
      </div>
      <p className="tc-ma-yardim">Kısaltma standart kod yapısında grup kodu olur: HM-YMC-00001.</p>
      <div className="tc-ma-eylemler"><Dugme tur="birincil" simge="plus" onClick={ekle}>Sınıfı ekle</Dugme></div>
    </Kutu>
  );
}

export function Aileler({ d }: { d: Duzen }) {
  const [silinecek, silinecekYaz] = useState<Silinecek | null>(null);
  const { aile } = gecerliAileSinif(d);
  const F = d.t.FAMS[aile];
  const yeniAc = (k: string) => d.sec({ yeni: d.secim.yeni === k ? null : k, kaliteDuz: null });

  const aileSutunlari: Sutun<AileSatiri>[] = [
    { anahtar: 'kullan', baslik: 'Kullan', hucre: (s) => <Kullan ad={s.f.ad} acik={!s.f.gizli} kilitli={d.ro} degistir={() => d.degis(aileGizleDegistir(d.v, s.anahtar))} /> },
    {
      anahtar: 'ad', baslik: 'Aile', hucre: (s) => (
        <span className="tc-ma-ad">
          <button type="button" className="tc-ma-bag" data-aile={s.anahtar} aria-pressed={s.anahtar === aile} onClick={() => d.sec({ aile: s.anahtar, sinif: '', kaliteDuz: null, yeni: d.secim.yeni === 'kalite' ? null : d.secim.yeni })}>{s.f.ad}</button>
          {s.f.ozel ? <EklendiIsareti /> : null}
        </span>
      ),
    },
    { anahtar: 'kod', baslik: 'Kod', mono: true, hucre: (s) => <b>{s.f.kod}</b> },
    { anahtar: 'sinif', baslik: 'Sınıf', hizala: 'sag', hucre: (s) => sinifSayisi(s.f) },
    { anahtar: 'kalite', baslik: 'Kalite', hizala: 'sag', hucre: (s) => kaliteSayisi(s.f) },
    { anahtar: 'sil', baslik: '', hucre: (s) => (s.f.ozel && !d.ro ? <SilDugmesi ad={s.f.ad} sil={() => silinecekYaz({ tur: 'aile', anahtar: s.anahtar, ad: s.f.ad })} /> : <BosHucre />) },
  ];
  const sinifSutunlari: Sutun<SinifSatiri>[] = [
    { anahtar: 'kullan', baslik: 'Kullan', hucre: (s) => <Kullan ad={s.c.ad} acik={!s.c.gizli} kilitli={d.ro} degistir={() => d.degis(sinifGizleDegistir(d.v, aile, s.anahtar))} /> },
    {
      anahtar: 'ad', baslik: 'Sınıf', hucre: (s) => (
        <span className="tc-ma-ad">
          <button type="button" className="tc-ma-bag" onClick={() => { d.sec({ sinif: s.anahtar, yeni: null }); d.o.git.ayarlar('kalite'); }}>{s.c.ad}</button>
          {s.c.ozel ? <EklendiIsareti /> : null}
        </span>
      ),
    },
    { anahtar: 'grup', baslik: 'Kod grubu', mono: true, hucre: (s) => <b>{d.t.HM_GRUP[aile]?.[s.anahtar] ?? s.c.kod ?? ''}</b> },
    { anahtar: 'kalite', baslik: 'Kalite', hizala: 'sag', hucre: (s) => s.c.grades.length },
    { anahtar: 'sil', baslik: '', hucre: (s) => (s.c.ozel && !d.ro ? <SilDugmesi ad={s.c.ad} sil={() => silinecekYaz({ tur: 'sinif', anahtar: s.anahtar, ad: s.c.ad })} /> : <BosHucre />) },
  ];

  const sil = () => {
    if (!silinecek) return;
    if (silinecek.tur === 'aile') {
      const n = d.b.kartlar.filter((x) => (x.kayit as { fam?: string }).fam === silinecek.anahtar).length;
      if (d.secim.aile === silinecek.anahtar) d.sec({ aile: 'metal', sinif: '' });
      d.degis(aileSil(d.v, silinecek.anahtar), n ? `Aile silindi; katalogdaki ${n} kart bu aileye bağlıydı.` : 'Aile silindi.');
    } else d.degis(sinifSil(d.v, aile, silinecek.anahtar));
    silinecekYaz(null);
  };

  return (
    <>
      <BolumBasligi
        baslik="Aileler ve sınıflar" aciklama="Kullanmadığın aile ve sınıfları kapat; yeni kart oluştururken listelenmezler."
        eylem={!d.ro && <YeniDugmesi acik={d.secim.yeni === 'aile'} etiket="Yeni aile" degistir={() => yeniAc('aile')} />}
      />
      {d.secim.yeni === 'aile' && !d.ro && <YeniAile d={d} />}
      <Tablo etiket="Hammadde aileleri" sutunlar={aileSutunlari} satirlar={Object.entries(d.t.FAMS).map(([anahtar, f]) => ({ anahtar, f }))} satirAnahtari={(s) => s.anahtar} />
      {F && (
        <div className="tc-ma-alt">
          <BolumBasligi
            baslik={`${F.ad} sınıfları`}
            eylem={!d.ro && <YeniDugmesi acik={d.secim.yeni === 'sinif'} etiket="Yeni sınıf" degistir={() => yeniAc('sinif')} />}
          />
          {d.secim.yeni === 'sinif' && !d.ro && <YeniSinif d={d} aile={aile} />}
          <Tablo
            etiket={`${F.ad} sınıfları`} sutunlar={sinifSutunlari} bosMesaj="Sınıf yok."
            satirlar={Object.entries(F.classes).map(([anahtar, c]) => ({ anahtar, c }))} satirAnahtari={(s) => s.anahtar}
          />
        </div>
      )}
      <OnayPenceresi acik={silinecek !== null} baslik={`${silinecek?.ad ?? ''} silinsin mi?`} tehlikeli onayMetni="Sil" onayla={sil} vazgec={() => silinecekYaz(null)}>
        <p>{silinecek?.tur === 'aile' ? 'Ailenin eklenen sınıfları ve kaliteleri de silinir.' : 'Sınıfın eklenen kaliteleri de silinir.'}</p>
      </OnayPenceresi>
    </>
  );
}
