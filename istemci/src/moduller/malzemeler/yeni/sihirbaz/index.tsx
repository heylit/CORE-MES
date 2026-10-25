import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DurumKutusu, Dugme, useBildirim } from '../../../../ortak/arayuz/index.ts';
import * as K from '../kurallar/index.ts';
import * as S from '../sabitler/index.ts';
import { useKuralBaglami, type KuralBaglami } from '../kurallar/index.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import { sonaEkle, useBirimSistemi, useSonKullanilanlar, useYarimTaslak, type YarimTaslak } from '../tercihler.ts';
import type { KatalogKarti, Sablon } from '../tipler.ts';
import { useOturum } from '../../../../ortak/veri/oturum.ts';
import { useKartlar, useSablonlar } from '../veri.ts';
import { AdimCubugu, adimlariKur } from './AdimCubugu.tsx';
import { SihirbazBaglami, type EkranSecimi, type Sihirbaz } from './baglam.ts';
import { kopyala, useSihirbazDurumu, type Taslak } from './durum.ts';
import { FoyGorunumu } from './FoyGorunumu.tsx';
import { AdimGovdesi } from './adimlar/AdimGovdesi.tsx';
import { KategoriUyarisi } from './adimlar/KategoriUyarisi.tsx';
import { baslangicTaslagi, duzenlemeTaslagi, kopyaTaslagi, sablonTaslagi, type Acilis } from './acilis.ts';
import { odakla, useKaydet } from './kaydet.ts';
import './sihirbaz.css';

const ACILIS_SORGUSU = ['kopya', 'sablon', 'sablonYap', 'tur'] as const;

const SECIM_BOS: EkranSecimi = {
  kaliteArama: '', tumFormlar: false, tumSecenekler: false, sablonAcik: false, sonKayit: null, cokluKayit: null, katUyari: null,
};

// Yeni kart sihirbazı (envanter 2.1). Adres sorgusu: kart (düzenle, K6 a), kopya, sablon (uygula), sablonYap, tur.
export function YeniKart(o: EkranOzellikleri) {
  const kartlar = useKartlar();
  const sablonlar = useSablonlar();
  const [arama] = useSearchParams();
  // Şablon yalnız adreste istenince beklenir; okunamazsa hazır şablonlarla sürer.
  const sablonBekle = arama.has('sablon') && sablonlar.isPending;
  if (kartlar.isPending || sablonBekle) return <DurumKutusu durum="yukleniyor" />;
  if (kartlar.isError) return <DurumKutusu durum="hata" mesaj="Katalog okunamadı." />;
  return <SihirbazKabugu {...o} kartlar={kartlar.data} sablonlar={sablonlar.data?.sablonlar ?? []} />;
}

function SihirbazKabugu(o: EkranOzellikleri & { kartlar: readonly KatalogKarti[]; sablonlar: readonly Sablon[] }) {
  const { ortam, yetki, git, kartlar, sablonlar } = o;
  const oturum = useOturum();
  const [birim] = useBirimSistemi();
  const kisiId = oturum.data?.id ?? 0;
  const kisiAd = oturum.data?.ad ?? '';
  const kisi = useMemo(() => ({ id: kisiId, ad: kisiAd }), [kisiId, kisiAd]);
  const b = useKuralBaglami({ ortam, kartlar, sablonlar, kisi, birim, yetki });
  const { bildir: bildirOrtak } = useBildirim();
  const bildir = useCallback((m: string, ton: 'tamam' | 'bilgi' | 'hata' = 'bilgi') => bildirOrtak(ton, m), [bildirOrtak]);
  const [arama, aramaYaz] = useSearchParams();
  const [yarim, yarimYaz] = useYarimTaslak();
  const [sonlar, sonlarYaz] = useSonKullanilanlar();
  const [secim, secimYazHam] = useState<EkranSecimi>(() => ({ ...SECIM_BOS, sablonAcik: arama.get('sablonYap') !== null }));
  const secimYaz = useCallback((s: Partial<EkranSecimi>) => { secimYazHam((e) => ({ ...e, ...s })); }, []);

  // Açılışı adres belirler; adres yoksa yarım taslak sürer. Uygulanan sorgu (kart dışında) adresten silinir: sayfa
  // yenilenince yarım taslaktan devam edilir, aynı kopya ikinci kez kurulmaz. Sihirbaz açıkken gelen yeni sorgu
  // (katalogdan başka kartı düzenle, kopya, şablon) taslağı yeniden kurar.
  const acilisIletisi = useRef<string | null>(null);
  const durum = useSihirbazDurumu(() => {
    const a = acilisTaslagi(arama, kartlar, sablonlar, b, yarim);
    acilisIletisi.current = a.ileti;
    return { taslak: a.taslak, adim: a.adim };
  }, (t, adim) => { yarimYaz({ d: t, adim }); });
  const { taslak: d, adim, degistir, yenisiniKur, adimaGec } = durum;

  const oncekiKart = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const kart = arama.get('kart');
    const uygulanan = ACILIS_SORGUSU.filter((k) => arama.has(k));
    if (oncekiKart.current === undefined) {
      if (acilisIletisi.current) bildir(acilisIletisi.current);
      acilisIletisi.current = null;
    } else if (uygulanan.length > 0 || (kart !== null && kart !== oncekiKart.current)) {
      const a = acilisTaslagi(arama, kartlar, sablonlar, b, null);
      yenisiniKur(a.taslak, a.adim);
      secimYazHam({ ...SECIM_BOS, sablonAcik: arama.has('sablonYap') });
      if (a.ileti) bildir(a.ileti);
    }
    oncekiKart.current = kart;
    if (uygulanan.length > 0) {
      const yeni = new URLSearchParams(arama);
      uygulanan.forEach((k) => { yeni.delete(k); });
      aramaYaz(yeni, { replace: true });
    }
  }, [arama, aramaYaz, bildir, kartlar, sablonlar, b, yenisiniKur]);

  const sayi = useMemo(() => adimlariKur(d, b).length, [d, b]);
  const etkinAdim = Math.min(adim, sayi - 1);
  const adimlar = useMemo(() => adimlariKur(d, b, etkinAdim), [d, b, etkinAdim]);
  const son = adimlar.length - 1;

  const adimaGit = (i: number) => {
    if (i < 0 || i > son || !K.canGo(d, i, b)) return;
    adimaGec(i);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const sonaKoy = (fam: string, cls: string | null, grade: string) => {
    if (!grade || grade === '__ozel') return;
    const c = cls ?? K.clsOfGrade(fam, grade, b) ?? '';
    sonlarYaz(sonaEkle(sonlar, { fam, cls: c, grade }, Date.now()));
  };

  // Prototipte `selectGrade`: aile değişirse taslak yeniden kurulur (tedarikçi ve not korunur); kalite değişirse
  // elle değiştirilen teknik değerler sıfırlanır.
  const kaliteSec = (fam: string, cls: string | null, kod: string, gidilen?: number) => {
    let y: Taslak = kopyala(d);
    if (fam !== y.fam) {
      const bos = K.newDraft(b);
      y = { ...bos, fam, id: d.id };
      y.com = { ...bos.com, ted: d.com.ted, tedId: d.com.tedId, not: d.com.not };
      bildir(`Aile ${b.t.FAMS[fam]?.ad ?? fam} olarak değişti.`);
    }
    const ovVardi = Object.keys(y.ov).length > 0 && y.grade !== kod;
    if (y.grade !== kod) y.stds = [];
    y.cls = kod === '__ozel' ? (y.cls ?? Object.keys(b.t.FAMS[fam]?.classes ?? {})[0] ?? null) : (cls ?? K.clsOfGrade(fam, kod, b));
    y.grade = kod;
    if (ovVardi) {
      y.ov = {};
      bildir('Kalite değişti; değiştirdiğin teknik değerler sıfırlandı.');
    }
    if (kod !== '__ozel') {
      secimYaz({ kaliteArama: '' });
      sonaKoy(fam, y.cls, kod);
      if (!y.id) y = K.varsayilanlariUygula(y, b);
    }
    yenisiniKur(y, gidilen);
    if (kod === '__ozel') odakla('tc-my-ozel-ad');
  };

  // Prototipte `resetDraft`: düzenlenen kartın adresi de bırakılır.
  const sifirla = () => {
    yenisiniKur(K.newDraft(b), 0);
    secimYazHam(SECIM_BOS);
    if (arama.has('kart')) aramaYaz(new URLSearchParams(), { replace: true });
  };

  const s: Sihirbaz = {
    ...o, taslak: d, adim: etkinAdim, b, kartlar, degistir, yenisiniKur, adimaGec: adimaGit, secim, secimYaz, bildir,
    kartiAc: (k) => { git.katalog(k); },
    kurVeGit: (y, i) => { yenisiniKur(y, i); },
    kaliteSec, sifirla, sonKullanilanlar: sonlar, sonaKoy,
  };
  const kaydet = useKaydet(s, adimlar);

  const ileri = () => {
    if (etkinAdim === son) { void kaydet.calistir(); return; }
    if (!K.stepOk(etkinAdim, d, b)) {
      bildir(K.isGen(d, b)
        ? (etkinAdim === 0 ? 'Bir kategori seç.' : `Zorunlu alanı doldur: ${K.gEksik(etkinAdim, d, b)}.`)
        : etkinAdim === 0 ? 'Bir malzeme ailesi seç.'
          : etkinAdim === 1 ? (d.grade === '__ozel' ? 'Özel kaliteye bir ad ver.' : 'Bir kalite seç.')
            : K.dimsErr(d, b));
      return;
    }
    adimaGit(etkinAdim + 1);
  };

  const varyantSayisi = K.variantList(d, b).filter((v) => !K.dimsErr(v, b)).length;
  const kaydetMetni = d.id ? 'Değişiklikleri kaydet' : varyantSayisi ? `${Math.min(varyantSayisi, S.VMAX)} varyantı kataloğa kaydet` : 'Kataloğa kaydet';
  const ortaMetin = ortaSatir(d, b);
  const SD = adimlar[etkinAdim];

  return (
    <SihirbazBaglami.Provider value={s}>
      <div className="tc-my">
        <div className={K.isGen(d, b) && SD?.ozel === 'ops' ? 'tc-my-duzen tc-my-genis' : 'tc-my-duzen'}>
          <AdimCubugu adimlar={adimlar} etkin={etkinAdim} git={adimaGit} />
          <section className="tc-my-govde" aria-labelledby="tc-my-adim-baslik">
            <header className="tc-my-adim-ust">
              <h2 id="tc-my-adim-baslik">{SD?.ad}</h2>
              {SD?.help && <p className="tc-my-yardim">{SD.help}</p>}
            </header>
            <KategoriUyarisi />
            <AdimGovdesi />
            <nav className="tc-my-alt" aria-label="Sihirbaz">
              <Dugme simge="back" onClick={() => { adimaGit(etkinAdim - 1); }} disabled={etkinAdim === 0}>Geri</Dugme>
              <span className="tc-my-alt-orta" aria-live="polite">{ortaMetin}</span>
              {etkinAdim === son
                ? yetki.yaz && <Dugme tur="birincil" simge="check" onClick={ileri} yukleniyor={kaydet.suruyor}>{kaydet.suruyor ? kaydet.ilerleme ?? 'Kaydediliyor' : kaydetMetni}</Dugme>
                : <Dugme tur="birincil" onClick={ileri}>İleri</Dugme>}
            </nav>
          </section>
          <aside className="tc-my-foy" aria-label="Canlı föy önizlemesi"><FoyGorunumu d={d} kisa /></aside>
        </div>
      </div>
    </SihirbazBaglami.Provider>
  );
}

function ortaSatir(d: Taslak, b: KuralBaglami): string {
  if (K.isGen(d, b)) return K.stepOk(0, d, b) ? `${K.finalKod(d, b)}  ${K.finalAd(d, b) || ''}` : 'Bir kategori seç';
  if (!d.fam) return 'Bir malzeme ailesi seçerek başla';
  const vn = K.variantList(d, b).length;
  return vn ? `${vn} varyant: ${K.variantSummary(d, b)}` : K.finalKod(d, b);
}

function acilisTaslagi(
  arama: URLSearchParams, kartlar: readonly KatalogKarti[], sablonlar: readonly Sablon[], b: KuralBaglami, yarimHam: YarimTaslak | null,
): Acilis {
  const yarim = yarimHam ? { taslak: yarimHam.d as Taslak, adim: yarimHam.adim } : null;
  const bul = (k: string | null) => (k === null ? undefined : kartlar.find((x) => x.kimlik === k));
  const kart = bul(arama.get('kart'));
  if (kart) {
    // Aynı kartın yarım düzenlemesi sürüyorsa o açılır (sayfa yenilendi); yoksa kayıtlı kart.
    if (yarim && yarim.taslak.id === kart.kimlik) return { ...yarim, ileti: null };
    return duzenlemeTaslagi(kart, b);
  }
  const kopya = bul(arama.get('kopya'));
  if (kopya) return kopyaTaslagi(kopya, b);
  const sablonYap = bul(arama.get('sablonYap'));
  if (sablonYap) {
    const a = kopyaTaslagi(sablonYap, b);
    return { taslak: a.taslak, adim: K.isGen(a.taslak, b) ? adimlariKur(a.taslak, b).length - 1 : 6, ileti: 'Şablon adını kontrol edip kaydet.' };
  }
  const sablon = arama.get('sablon');
  if (sablon !== null) {
    const a = sablonTaslagi(sablon, sablonlar, b);
    if (a) return a;
  }
  const tur = arama.get('tur');
  if (tur !== null) return baslangicTaslagi(b, tur);
  // Düzenlenecek kart listede yoksa (iptal edildi ya da kimlik yanlış) yarım taslak kullanılmaz; boş kart açılır.
  if (arama.get('kart') !== null) return { ...baslangicTaslagi(b, null), ileti: 'Kart katalogda bulunamadı; yeni kart açıldı.' };
  if (yarim) return { taslak: kopyala(yarim.taslak), adim: yarim.adim, ileti: null };
  return baslangicTaslagi(b, null);
}
