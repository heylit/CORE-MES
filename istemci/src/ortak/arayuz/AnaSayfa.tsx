import { useCallback, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { GidisatOlcusu, IsKalemi } from '#paylasilan/sozlesme/pano.ts';
import {
  bolumlereAyir, gorunenKaynaklar, gorunenKartlar, islerSirala,
  type AnaSayfaKaynagi, type AnaSayfaKarti, type IsSatiri, type KartGrubu,
} from '../rota/ana-sayfa.ts';
import { Dugme } from './Dugme.tsx';
import { DurumKutusu } from './DurumKutusu.tsx';
import { GidisatKarti } from './GidisatKarti.tsx';
import { GostergeSeridi } from './grafik/GostergeSeridi.tsx';
import { IsListesi } from './IsListesi.tsx';
import { Kart } from './Kart.tsx';
import { Simge } from './Simge.tsx';
import { YonlendirmeSeridi } from './YonlendirmeSeridi.tsx';
import { PanoKaynakBaglami, PanoKartiBaglami, type KaynakVerisi } from './pano-baglami.ts';
import './ana-sayfa.css';
import './rol-panosu.css';
import './grafik/grafik.css';

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
// Kişiye görünen bir rol panosu kaynağı varsa yeni düzen çizilir (kart 1585); yoksa bölümlü kart panosu kalır.
export function AnaSayfa({ kartlar, kaynaklar = [], islemler, ad }: {
  kartlar: readonly AnaSayfaKarti[];
  kaynaklar?: readonly AnaSayfaKaynagi[];
  islemler: readonly string[];
  ad?: string;
}) {
  const gorunenKaynak = gorunenKaynaklar(kaynaklar, islemler);
  if (gorunenKaynak.length > 0) return <RolPanosu kaynaklar={gorunenKaynak} kartlar={gorunenKartlar(kartlar, islemler)} ad={ad} />;
  return <KartPanosu kartlar={kartlar} islemler={islemler} ad={ad} />;
}

// Sıfır bildiren kartlar: "Bana düşen işler" ve "Uyarılar" yalnız yapılacak olanı gösterir.
function useSifirlar(): [ReadonlySet<string>, (anahtar: string, sifir: boolean) => void] {
  const [sifirlar, sifirlarYaz] = useState<ReadonlySet<string>>(() => new Set());
  const bildir = useCallback((anahtar: string, sifir: boolean) => {
    sifirlarYaz((onceki) => {
      if (onceki.has(anahtar) === sifir) return onceki;
      const yeni = new Set(onceki);
      if (sifir) yeni.add(anahtar); else yeni.delete(anahtar);
      return yeni;
    });
  }, []);
  return [sifirlar, bildir];
}

function KartPanosu({ kartlar, islemler, ad }: { kartlar: readonly AnaSayfaKarti[]; islemler: readonly string[]; ad?: string }) {
  const gorunen = gorunenKartlar(kartlar, islemler);
  const [sifirlar, bildir] = useSifirlar();
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

function KaynakYeri({ kaynak, bildir }: { kaynak: AnaSayfaKaynagi; bildir: (anahtar: string, veri: KaynakVerisi) => void }) {
  const { anahtar } = kaynak;
  const kendi = useCallback((veri: KaynakVerisi) => { bildir(anahtar, veri); }, [bildir, anahtar]);
  return (
    <PanoKaynakBaglami.Provider value={kendi}>
      <kaynak.kaynak />
    </PanoKaynakBaglami.Provider>
  );
}

// Rol panosu (kart 1585): yönlendirme, İşlerim, Gidişat. Eski iş, uyarı, özet ve eğilim bölümleri çizilmez (1594 a);
// şirket özeti altta kapalı kalır (1593 c), bölümsüz kartlar (talep formu, sistem durumu) en altta yerinde durur.
// Kademeli geçiş: kaynağı henüz olmayan modülün iş ve uyarı kartları eski bölümleriyle kalır; yerini alan kaynak gelince düşer.
// Grafik kaynağı görünen kişide (kart 1773, 1772) gidişat "Bir bakışta" kutularına döner, altta açık grafik bölgesi çizilir.
function RolPanosu({ kaynaklar, kartlar, ad }: { kaynaklar: readonly AnaSayfaKaynagi[]; kartlar: readonly AnaSayfaKarti[]; ad?: string }) {
  const [veriler, verilerYaz] = useState<ReadonlyMap<string, KaynakVerisi>>(() => new Map());
  // Kaynak her çizimde yeni dizi verebilir: içerik aynıysa durum değişmez, döngü kurulmaz.
  const bildir = useCallback((anahtar: string, veri: KaynakVerisi) => {
    verilerYaz((onceki) => {
      if (onceki.has(anahtar) && JSON.stringify(onceki.get(anahtar)) === JSON.stringify(veri)) return onceki;
      return new Map(onceki).set(anahtar, veri);
    });
  }, []);
  const [sifirlar, sifirBildir] = useSifirlar();
  const veriKaynaklari = kaynaklar.filter((k) => k.tur !== 'grafik');
  const grafikler = kaynaklar.filter((k) => k.tur === 'grafik');
  const ozet = useMemo(() => {
    const isler: IsSatiri[] = [];
    const olcular: GidisatOlcusu[] = [];
    const yolunda: string[] = [];
    const alinamayanIs: string[] = [];
    const alinamayanOlcu: string[] = [];
    let yukleniyor = false;
    for (const kaynak of kaynaklar) {
      if (kaynak.tur === 'grafik') continue;
      const veri = veriler.get(kaynak.anahtar);
      if (kaynak.tur === 'is') {
        if (veri === undefined) { yukleniyor = true; continue; }
        if (veri === null) { alinamayanIs.push(kaynak.baslik); continue; }
        const kalemler = veri as readonly IsKalemi[];
        if (kalemler.length === 0 && kaynak.yolunda !== undefined) yolunda.push(kaynak.yolunda);
        for (const kalem of kalemler) isler.push({ kalem, kaynak });
      } else if (veri === null) {
        alinamayanOlcu.push(kaynak.baslik);
      } else if (veri !== undefined) {
        olcular.push(...(veri as readonly GidisatOlcusu[]));
      }
    }
    return { isler: islerSirala(isler), olcular, yolunda, alinamayanIs, alinamayanOlcu, yukleniyor };
  }, [kaynaklar, veriler]);
  const [ilk, ...kalan] = ozet.isler;
  const grafikVar = grafikler.length > 0;
  const gidisatVar = !grafikVar && kaynaklar.some((k) => k.tur === 'gidisat');
  const kaynakliModuller = new Set(kaynaklar.map((k) => k.modul));
  const eskiIsler = kartlar.filter((k) => (k.bolum === 'is' || k.bolum === 'uyari') && !kaynakliModuller.has(k.modul));
  const sirketOzeti = kartlar.filter((k) => k.bolum === 'yonetim');
  const bolumsuz = kartlar.filter((k) => k.bolum === undefined);
  const ozetGrafikler = grafikler.filter((k) => k.anaSayfada === true);
  const sifirYok = useCallback(() => {}, []);
  return (
    <div className="tc-pano tc-rol-panosu">
      {(ad !== undefined || grafikVar) && (
        <div className="tc-pano-ust">
          {ad !== undefined && <Karsilama ad={ad} />}
          {grafikVar && <Link className="tc-dugme tc-dugme-ikincil tc-dugme-normal" to="/pano"><Simge ad="chart" boyut="k" />Yönetim panosu</Link>}
        </div>
      )}
      <div hidden>{veriKaynaklari.map((k) => <KaynakYeri key={k.anahtar} kaynak={k} bildir={bildir} />)}</div>
      {ilk !== undefined && <YonlendirmeSeridi satir={ilk} />}
      {grafikVar && <GostergeSeridi olcular={ozet.olcular} />}
      <div className={gidisatVar ? 'tc-rol-panosu-izgara' : undefined}>
        <IsListesi satirlar={kalan} yolunda={ozet.yolunda} alinamayan={ozet.alinamayanIs} yukleniyor={ozet.yukleniyor && ilk === undefined} />
        {gidisatVar && <GidisatKarti olcular={ozet.olcular} alinamayan={ozet.alinamayanOlcu} />}
      </div>
      {bolumlereAyir(eskiIsler).map((g) => <Bolum key={g.bolum?.anahtar ?? 'genel'} grup={g} sifirlar={sifirlar} bildir={sifirBildir} />)}
      {ozetGrafikler.length > 0 && (
        <section className="tc-pano-bolum" aria-label="Gidişat grafikleri">
          <h2 className="tc-pano-baslik tc-gp-bolge-baslik"><Simge ad="chart" boyut="k" />Gidişat</h2>
          <div className="tc-gp-izgarasi">{ozetGrafikler.map((g) => <g.kaynak key={g.anahtar} />)}</div>
        </section>
      )}
      {sirketOzeti.length > 0 && (
        <details className="tc-pano-katlanir">
          <summary className="tc-pano-baslik">Şirket özeti</summary>
          <div className="tc-pano-izgara">
            {sirketOzeti.map((k) => <KartYeri key={k.anahtar} kart={k} gizli={false} bildir={sifirYok} />)}
          </div>
        </details>
      )}
      {bolumsuz.length > 0 && <div className="tc-ana-sayfa">{bolumsuz.map((k) => <KartYeri key={k.anahtar} kart={k} gizli={false} bildir={sifirYok} />)}</div>}
    </div>
  );
}
