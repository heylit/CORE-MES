import { useState } from 'react';
import { Dugme, Girdi, Tablo, type Sutun } from '../../../../../ortak/arayuz/index.ts';
import type { Duzen } from '../duzen.ts';
import type { Ozellik } from '../kaynak.ts';
import { ozellikEkle, ozellikGizleDegistir, ozellikSil } from '../islemler.ts';
import { BolumBasligi, BosHucre, CokluSecim, EklendiIsareti, Kullan, Kutu, SilDugmesi, YeniDugmesi } from '../parcalar.tsx';

function YeniOzellik({ d }: { d: Duzen }) {
  const [g, gYaz] = useState({ ad: '', u: '', f: [] as string[] });
  const ekle = () => {
    const s = ozellikEkle(d.v, d.taban, d.t, g);
    if (d.uygula(s)) d.sec({ yeni: null });
  };
  return (
    <Kutu>
      <div className="tc-ma-alanlar">
        <Girdi etiket="Özellik adı" maxLength={40} placeholder="ör. Darbe enerjisi (−20 °C)" value={g.ad} onChange={(e) => gYaz({ ...g, ad: e.target.value })} />
        <Girdi etiket="Birim" maxLength={12} placeholder="J" value={g.u} onChange={(e) => gYaz({ ...g, u: e.target.value })} />
      </div>
      <CokluSecim
        etiket="Hangi ailelerde (seçmezsen hepsinde)" secili={g.f} degistir={(f) => gYaz({ ...g, f })}
        secenekler={Object.entries(d.t.FAMS).map(([k, x]) => ({ deger: k, baslik: x.ad }))}
      />
      <div className="tc-ma-eylemler"><Dugme tur="birincil" simge="plus" onClick={ekle}>Özelliği ekle</Dugme></div>
    </Kutu>
  );
}

export function Ozellikler({ d }: { d: Duzen }) {
  const gizli = new Set(d.v.gizliOzellikler);
  const tum: Ozellik[] = [...d.taban.PROPS, ...d.v.ozellikler.map((p) => ({ ...p, ozel: true }))];
  const aileAdi = (k: string) => d.t.FAMS[k]?.ad ?? d.taban.FAMS[k]?.ad ?? k;
  const sutunlar: Sutun<Ozellik>[] = [
    {
      anahtar: 'kullan', baslik: 'Kullan', hucre: (p) => (p.ozel
        ? <Kullan ad={p.ad} acik kilitli />
        : <Kullan ad={p.ad} acik={!gizli.has(p.k)} kilitli={d.ro} degistir={() => d.degis(ozellikGizleDegistir(d.v, p.k))} />),
    },
    { anahtar: 'ad', baslik: 'Özellik', hucre: (p) => <span className="tc-ma-ad">{p.ad}{p.ozel ? <EklendiIsareti /> : null}</span> },
    { anahtar: 'birim', baslik: 'Birim', hucre: (p) => (p.u === '*' ? 'aileye göre' : p.u ?? '') },
    { anahtar: 'aileler', baslik: 'Aileler', hucre: (p) => (p.f?.length ? p.f.map(aileAdi).join(', ') : 'Tümü') },
    { anahtar: 'sil', baslik: '', hucre: (p) => (p.ozel && !d.ro ? <SilDugmesi ad={p.ad} sil={() => d.degis(ozellikSil(d.v, p.k))} /> : <BosHucre />) },
  ];
  return (
    <>
      <BolumBasligi
        baslik="Teknik özellikler" aciklama="Kalite föylerinde ve teknik özellikler adımında görünen alanlar. Kapattığın özellik hiçbir yerde gösterilmez."
        eylem={!d.ro && <YeniDugmesi acik={d.secim.yeni === 'ozellik'} etiket="Yeni özellik" degistir={() => d.sec({ yeni: d.secim.yeni === 'ozellik' ? null : 'ozellik' })} />}
      />
      {d.secim.yeni === 'ozellik' && !d.ro && <YeniOzellik d={d} />}
      <Tablo etiket="Teknik özellikler" sutunlar={sutunlar} satirlar={tum} satirAnahtari={(p) => p.k} />
    </>
  );
}
