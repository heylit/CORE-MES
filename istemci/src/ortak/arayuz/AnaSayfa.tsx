import { useCallback, useId, useState } from 'react';
import { bolumlereAyir, gorunenKartlar, type AnaSayfaKarti, type KartGrubu } from '../rota/ana-sayfa.ts';
import { Dugme } from './Dugme.tsx';
import { DurumKutusu } from './DurumKutusu.tsx';
import { Kart } from './Kart.tsx';
import { Simge } from './Simge.tsx';
import { PanoKartiBaglami } from './pano-baglami.ts';
import './ana-sayfa.css';

// Pano görev odaklıdır (kullanıcı kararı): işler ve uyarılar yalnız yapılacak olanı gösterir, özet kısa başlar.
const SIFIRI_GIZLENEN: ReadonlySet<string> = new Set(['is', 'uyari']);
const BOS_METNI: Readonly<Record<string, string>> = { is: 'Bekleyen işiniz yok.', uyari: 'Uyarı yok.' };
const OZET_SINIRI = 6;

function selam(saat: number): string {
  if (saat < 5) return 'İyi geceler';
  if (saat < 12) return 'Günaydın';
  if (saat < 18) return 'İyi günler';
  return 'İyi akşamlar';
}

function Karsilama({ ad }: { ad: string }) {
  const simdi = new Date();
  const tarih = simdi.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <div className="tc-pano-karsilama">
      <p className="tc-pano-selam">{selam(simdi.getHours())}, {ad}</p>
      <p className="tc-pano-tarih">{tarih}</p>
    </div>
  );
}

// Kartın içeriği ve verisi modülündür; kabuk yalnız yeri, sırayı ve görünürlüğü verir.
export function AnaSayfa({ kartlar, islemler, ad }: { kartlar: readonly AnaSayfaKarti[]; islemler: readonly string[]; ad?: string }) {
  const gorunen = gorunenKartlar(kartlar, islemler);
  const [sifirlar, sifirlarYaz] = useState<ReadonlySet<string>>(() => new Set());
  const bildir = useCallback((anahtar: string, sifir: boolean) => {
    sifirlarYaz((onceki) => {
      if (onceki.has(anahtar) === sifir) return onceki;
      const yeni = new Set(onceki);
      if (sifir) yeni.add(anahtar); else yeni.delete(anahtar);
      return yeni;
    });
  }, []);
  if (gorunen.length === 0) {
    return (
      <Kart baslik="Ana sayfa">
        <DurumKutusu durum="bos" mesaj="Ana sayfada size açık bir kart yok. Menüden bir sayfa seçin." />
      </Kart>
    );
  }
  return (
    <div className="tc-pano">
      {ad !== undefined && <Karsilama ad={ad} />}
      {bolumlereAyir(gorunen).map((g) => (
        <Bolum key={g.bolum?.anahtar ?? 'genel'} grup={g} sifirlar={sifirlar} bildir={bildir} />
      ))}
    </div>
  );
}

function KartYeri({ kart, gizli, bildir }: { kart: AnaSayfaKarti; gizli: boolean; bildir: (anahtar: string, sifir: boolean) => void }) {
  const { anahtar } = kart;
  const kendi = useCallback((sifir: boolean) => { bildir(anahtar, sifir); }, [bildir, anahtar]);
  // Gizlenen kart çizili kalır: sayısı değişince kendini yeniden gösterebilsin.
  return (
    <div className={kart.genis ? 'tc-ana-sayfa-genis' : undefined} data-kart={anahtar} hidden={gizli || undefined}>
      <PanoKartiBaglami.Provider value={kendi}>
        <kart.ekran />
      </PanoKartiBaglami.Provider>
    </div>
  );
}

function Bolum({ grup, sifirlar, bildir }: {
  grup: KartGrubu;
  sifirlar: ReadonlySet<string>;
  bildir: (anahtar: string, sifir: boolean) => void;
}) {
  const baslikKimlik = useId();
  const [tumu, tumuYaz] = useState(false);
  const anahtar = grup.bolum?.anahtar;
  const sifirGizli = anahtar !== undefined && SIFIRI_GIZLENEN.has(anahtar);
  const kisaltilir = anahtar === 'ozet' && grup.kartlar.length > OZET_SINIRI;
  const cizilen = kisaltilir && !tumu ? grup.kartlar.slice(0, OZET_SINIRI) : grup.kartlar;
  const gizliMi = (k: AnaSayfaKarti) => sifirGizli && sifirlar.has(k.anahtar);
  const kartlar = cizilen.map((k) => <KartYeri key={k.anahtar} kart={k} gizli={gizliMi(k)} bildir={bildir} />);
  if (grup.bolum === null) return <div className="tc-ana-sayfa">{kartlar}</div>;
  const hepsiSifir = sifirGizli && grup.kartlar.every(gizliMi);
  return (
    <section className="tc-pano-bolum" aria-labelledby={baslikKimlik} data-bolum={grup.bolum.anahtar}>
      <h2 id={baslikKimlik} className="tc-pano-baslik">{grup.bolum.baslik}</h2>
      {hepsiSifir && (
        <p className="tc-pano-bos"><Simge ad="check" boyut="k" />{BOS_METNI[grup.bolum.anahtar]}</p>
      )}
      <div className="tc-pano-izgara" hidden={hepsiSifir || undefined}>{kartlar}</div>
      {kisaltilir && (
        <Dugme className="tc-pano-tumu" simge="dash" onClick={() => tumuYaz((a) => !a)} aria-expanded={tumu}>
          {tumu ? 'Daha az göster' : `Tüm özet (${grup.kartlar.length})`}
        </Dugme>
      )}
    </section>
  );
}
