// Yarı mamul, mamul, sarf ve demirbaş alanlarının listeleri; sarf ve demirbaş kategorileri.
import { useState } from 'react';
import { Dugme, Girdi, IsaretKutusu, OnayPenceresi, Tablo, type Sutun } from '../../../../../ortak/arayuz/index.ts';
import { kategoriTablosu, type Duzen } from '../duzen.ts';
import type { Kategori } from '../kaynak.ts';
import { alanListesiTuru, kategoriEkle, kategoriGizleDegistir, kategoriSil, type KategoriTuru } from '../islemler.ts';
import { ListeDuzenleyici } from '../ListeDuzenleyici.tsx';
import { BolumBasligi, BosHucre, EklendiIsareti, Kullan, Kutu, SilDugmesi, YeniDugmesi } from '../parcalar.tsx';
import { FirmaKodu } from './Kurallar.tsx';

// Yollar: ALAN.<grup>, SARF.<kategori>, DB.<kategori>. Yalnız seçim listesi ya da önerisi olan alan düzenlenir.
function AlanListeleri({ d, yollar }: { d: Duzen; yollar: readonly string[] }) {
  const ogeler = yollar.flatMap((yol) => {
    const [tablo, x = ''] = yol.split('.');
    const l = tablo === 'ALAN' ? d.taban.ALAN[x] : tablo === 'SARF' ? d.taban.SARF_KAT[x]?.alanlar : d.taban.DB_KAT[x]?.alanlar;
    return (l ?? []).flatMap((a) => {
      const tur = alanListesiTuru(a);
      return tur ? [{ id: `alan|${yol}|${a.k}`, ad: a.ad, aciklama: tur === 'secim' ? 'seçim listesi' : 'öneriler; serbest yazım da mümkün' }] : [];
    });
  });
  if (!ogeler.length) return <p className="tc-ma-yardim">Bu bölümde düzenlenebilir liste yok.</p>;
  return <>{ogeler.map((o) => <ListeDuzenleyici key={o.id} d={d} id={o.id} baslik={o.ad} aciklama={o.aciklama} />)}</>;
}

export function YariMamulAlanlari({ d }: { d: Duzen }) {
  return (
    <>
      <BolumBasligi baslik="Yarı mamul alanları" aciklama="Yarı mamul adımlarındaki seçim listeleri ve öneriler." />
      <AlanListeleri d={d} yollar={['ALAN.ym_tanim', 'ALAN.ym_olcu']} />
    </>
  );
}

export function MamulAlanlari({ d }: { d: Duzen }) {
  return (
    <>
      <BolumBasligi baslik="Mamul alanları" aciklama="Mamul adımlarındaki seçim listeleri ve öneriler." />
      <Kutu baslik="Mamul kodu"><FirmaKodu d={d} kilitli={d.ro} /></Kutu>
      <AlanListeleri d={d} yollar={['ALAN.mm_tanim', 'ALAN.mm_ambalaj']} />
    </>
  );
}

function YeniKategori({ d, tur }: { d: Duzen; tur: KategoriTuru }) {
  const [g, gYaz] = useState({ ad: '', kod: '', kal: false });
  const ekle = () => {
    const s = kategoriEkle(d.v, d.t, tur, g);
    if (d.uygula(s) && s.tamam && s.anahtar) d.sec({ yeni: null, kat: s.anahtar });
  };
  const sarf = tur === 'sarf';
  return (
    <Kutu>
      <div className="tc-ma-alanlar">
        <Girdi etiket="Kategori adı" maxLength={40} placeholder={sarf ? 'ör. Elektrik sarfı' : 'ör. Laboratuvar cihazı'} value={g.ad} onChange={(e) => gYaz({ ...g, ad: e.target.value })} />
        <Girdi etiket="Kısaltma (kod grubu)" maxLength={3} placeholder={sarf ? 'ELK' : 'LAB'} className="tc-ma-buyuk" value={g.kod} onChange={(e) => gYaz({ ...g, kod: e.target.value })} />
      </div>
      {!sarf && <IsaretKutusu etiket="Kalibrasyon gerekir" checked={g.kal} onChange={(e) => gYaz({ ...g, kal: e.target.checked })} />}
      <p className="tc-ma-yardim">{sarf ? 'Yeni sarf kategorisi "Diğer sarf" alanlarını kullanır.' : 'Yeni demirbaş kategorisi ortak demirbaş alanlarını kullanır.'}</p>
      <div className="tc-ma-eylemler"><Dugme tur="birincil" simge="plus" onClick={ekle}>Kategoriyi ekle</Dugme></div>
    </Kutu>
  );
}

type KategoriSatiri = { anahtar: string; c: Kategori };

export function Kategoriler({ d, tur }: { d: Duzen; tur: KategoriTuru }) {
  const [silinecek, silinecekYaz] = useState<KategoriSatiri | null>(null);
  const T = kategoriTablosu(d.t, tur);
  const ks = Object.keys(T);
  const kat = ks.includes(d.secim.kat) ? d.secim.kat : ks.find((k) => !T[k]?.gizli) ?? ks[0] ?? '';
  const c = T[kat];
  const sarf = tur === 'sarf';
  const yeniAnahtari = `kat-${tur}`;
  const sutunlar: Sutun<KategoriSatiri>[] = [
    { anahtar: 'kullan', baslik: 'Kullan', hucre: (s) => <Kullan ad={s.c.ad} acik={!s.c.gizli} kilitli={d.ro} degistir={() => d.degis(kategoriGizleDegistir(d.v, tur, s.anahtar))} /> },
    {
      anahtar: 'ad', baslik: 'Kategori', hucre: (s) => (
        <span className="tc-ma-ad">
          <button type="button" className="tc-ma-bag" aria-pressed={s.anahtar === kat} onClick={() => d.sec({ kat: s.anahtar })}>{s.c.ad}</button>
          {s.c._ozel && <EklendiIsareti />}
        </span>
      ),
    },
    { anahtar: 'kod', baslik: 'Kod', mono: true, hucre: (s) => <b>{s.c.kod}</b> },
    { anahtar: 'sil', baslik: '', hucre: (s) => (s.c._ozel && !d.ro ? <SilDugmesi ad={s.c.ad} sil={() => silinecekYaz(s)} /> : <BosHucre />) },
  ];
  const yollar = [`${sarf ? 'SARF' : 'DB'}.${kat}`, ...(sarf ? [] : ['ALAN.db_kimlik', 'ALAN.db_alis', 'ALAN.db_bakim'])];
  return (
    <>
      <BolumBasligi
        baslik={sarf ? 'Sarf kategorileri' : 'Demirbaş kategorileri'}
        aciklama="Kullanmadığın kategorileri kapat. Kategorinin adına dokununca alanlarındaki listeler açılır."
        eylem={!d.ro && <YeniDugmesi acik={d.secim.yeni === yeniAnahtari} etiket="Yeni kategori" degistir={() => d.sec({ yeni: d.secim.yeni === yeniAnahtari ? null : yeniAnahtari })} />}
      />
      {d.secim.yeni === yeniAnahtari && !d.ro && <YeniKategori d={d} tur={tur} />}
      <Tablo etiket={sarf ? 'Sarf kategorileri' : 'Demirbaş kategorileri'} sutunlar={sutunlar} satirlar={Object.entries(T).map(([anahtar, x]) => ({ anahtar, c: x }))} satirAnahtari={(s) => s.anahtar} />
      {c && (
        <div className="tc-ma-alt">
          <BolumBasligi baslik={`${c.ad} alanları`} />
          {c._ozel
            ? <p className="tc-ma-yardim">Bu kategori {sarf ? '"Diğer sarf"' : 'ortak demirbaş'} alanlarını kullanır{sarf ? '; listelerini "Diğer sarf" kategorisinden düzenleyebilirsin' : ''}.</p>
            : <AlanListeleri d={d} yollar={yollar} />}
        </div>
      )}
      <OnayPenceresi
        acik={silinecek !== null} baslik={`${silinecek?.c.ad ?? ''} silinsin mi?`} tehlikeli onayMetni="Sil" vazgec={() => silinecekYaz(null)}
        onayla={() => { if (silinecek) d.degis(kategoriSil(d.v, tur, silinecek.anahtar)); silinecekYaz(null); }}
      />
    </>
  );
}
