import { useMemo } from 'react';
import { SayiKarti, Tablo } from '../../../../ortak/arayuz/index.ts';
import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { gunSutunlari, MOTOR_KAPALI } from './EkMesaiPlani.tsx';
import { fasonKararFormu, fasonTerminFormu } from './formlar.ts';
import {
  baslangicMs, fasoncular, fasonDurumu, fasonIsleri, fasonTutari, gunYaz, isoSaat, isTanimlari, kucukHarf, planIsleri, sayi, takvimKur, tl, YOK,
  type FasoncuBilgisi, type FasonIsi, type IsTanimi,
} from './kurallar.ts';
import { hucreKoy, IsiSayfasi, TonRozeti, yazici, type Acilim, type FormTanimi, type Hucre, type IsiBos, type IsiSatiri, type IsiVerisi } from './ortak.tsx';

interface Satir { f: FasoncuBilgisi; L: FasonIsi[]; kotu: number; ak: Record<string, FasonIsi[]> }
interface Hazirlik { I: Map<string, IsTanimi>; L: FasonIsi[] }
const tonKd = (x: FasonIsi): number => { const t = fasonDurumu(x)[1]; return t === 'hata' ? 4 : t === 'uyari' ? 2 : 1; };
const oncelik = (x: FasonIsi): number => (fasonDurumu(x)[1] === 'hata' ? 0 : x.T === null ? 1 : 2);

export function fasonHazirligi(c: PlanlamaCalismasi | null): Hazirlik | null {
  if (!c || !c.plan || baslangicMs(c.D) === null) return null;
  const I = isTanimlari(c, takvimKur(c));
  return { I, L: fasonIsleri(c, I) };
}

// Fasoncu × gün; hücredeki sayı o gün fasoncuda olan iş sayısı, kademe en kötü dönüş durumu (zz30-isi ISI.fasonplan).
export function fasonIsisi(c: PlanlamaCalismasi, h: Hazirlik): IsiVerisi<Satir> | IsiBos {
  const FS = fasoncular(c.D);
  if (!FS.length) return { bos: 'Fasoncu tanımlı değil; fason firmaları tanımlanınca işler burada gün gün görünür.' };
  const G = gunSutunlari(c, 21);
  const satirlar: IsiSatiri<Satir>[] = FS.map((fs) => {
    const L = h.L.filter((x) => x.f?.id === fs.id);
    const hc: Record<string, Hucre> = {};
    const akm: Record<string, FasonIsi[]> = {};
    let kotu = 0;
    for (const col of G.l) {
      const a = col.g * 24, b = a + 24;
      const ak = L.filter((x) => x.r.S < b && (x.T ?? x.r.C) > a);
      if (!ak.length) continue;
      const fazla = fs.kapasite !== null && ak.length > fs.kapasite;
      const kd = Math.max(...ak.map(tonKd), fazla ? 3 : 0);
      kotu = Math.max(kotu, kd);
      akm[col.k] = ak;
      hucreKoy(hc, col.k, {
        v: String(ak.length), kd, sm: fazla ? 'alert' : undefined, tahmin: ak.some((x) => x.T === null) ? 'fasoncu dönüş tarihi vermedi' : undefined,
        etiket: `${String(ak.length)} iş fasoncuda${fs.kapasite !== null ? ` (kapasite ${String(fs.kapasite)})` : ''}`,
      });
    }
    return {
      k: fs.id, ad: fs.ad, alt: `${String(L.length)} iş · ${fs.sureGun === null ? YOK : String(fs.sureGun)} gün`, simge: 'truck' as const,
      ton: kotu >= 4 ? 'hata' as const : kotu >= 2 ? 'uyari' as const : '' as const, h: hc, veri: { f: fs, L, kotu, ak: akm },
    };
  }).sort((a, b) => b.veri.kotu - a.veri.kotu);
  const tah = h.L.filter((x) => x.T === null).length;
  const gec = h.L.filter((x) => fasonDurumu(x)[1] === 'hata').length;
  const en = satirlar[0];
  const blok = en ? G.l.filter((col) => (en.h[col.k]?.kd ?? 0) >= Math.max(en.veri.kotu, 1)) : [];
  const ilk = blok[0], son = blok[blok.length - 1];
  const metin = `${en && en.veri.kotu >= 2 && ilk && son ? `En sıcak blok ${en.ad}, ${ilk.ad}${blok.length > 1 ? `–${son.ad}` : ''}: ${en.h[ilk.k]?.etiket ?? ''}. ` : ''}${String(h.L.length)} fason işinden ${String(gec)} tanesi siparişi geciktiriyor, ${String(tah)} tanesinin dönüş tarihi yok.`;
  return {
    baslik: 'Fasoncu × gün, kapasite ve gecikme', satirAd: 'Fasoncu', sutunlar: G.l, satirlar,
    ust: { ton: gec ? 'hata' : tah ? 'uyari' : 'tamam', simge: 'truck', metin },
    lejant: { kdAd: { 1: 'Zamanında', 2: 'Plandan geç', 3: 'Kapasite aşılıyor', 4: 'Siparişi geciktirir' }, tahmin: 'Dönüş tarihi yok', simge: [['alert', 'Kapasite aşımı']] },
    not: 'Hücredeki sayı o gün fasoncuda olan iş sayısıdır.',
  };
}

export function FasonPlani(o: PlanlamaEkranOzellikleri) {
  const c = o.calisma;
  const H = useMemo(() => fasonHazirligi(c), [c]);
  const V = useMemo(() => (c && H ? fasonIsisi(c, H) : { bos: 'Plan kurulunca fasona giden işler burada gün gün görünür.' }), [c, H]);
  const yaz = yazici(o.komut);
  const yazabilir = o.komut !== null;
  const kim = o.depo.ben.kisi.ad;
  const F = useMemo(() => {
    if (!c || !H || !yazabilir) return null;
    const gy = (t: number | null) => gunYaz(c.D, t);
    return { termin: fasonTerminFormu(c, H.L, yaz, gy, (t) => isoSaat(c.D, t)), karar: fasonKararFormu(c, H.I, planIsleri(c), yaz, kim) };
  // yaz her çizimde yeniden kurulur; formlar çalışma ve yetkiyle değişir.
  }, [c, H, yazabilir, kim]);

  const acilim = (r: IsiSatiri<Satir>, ck: string): Acilim | null => {
    if (!c) return null;
    const D = c.D;
    const cel = r.h[ck];
    const ak = [...(r.veri.ak[ck] ?? [])].sort((a, b) => oncelik(a) - oncelik(b));
    const gAd = gunYaz(D, Number(ck.slice(1)) * 24);
    const x = ak[0];
    const kd = cel?.kd ?? 0;
    return {
      baslik: `${r.ad} · ${gAd}`, simge: 'truck', ton: kd >= 4 ? 'hata' : kd >= 2 ? 'uyari' : '',
      neden: x
        ? `${r.ad} ${gAd}: ${cel?.etiket ?? ''}. ${x.id} ${kucukHarf(fasonDurumu(x)[0])}; dönüş ${gunYaz(D, x.T ?? x.r.C)}${x.T === null ? ' (tahmini)' : ''}, sonraki adım ${gunYaz(D, x.ger)}.`
        : `${r.ad} ${gAd}: iş yok.`,
      bilgi: ak.slice(0, 4).map((z) => [z.id, `${fasonDurumu(z)[0]} · dönüş ${gunYaz(D, z.T ?? z.r.C)}`]),
      formlar: F?.termin ? ak.slice(0, 3).map((z) => ({ tanim: { ...(F.termin as FormTanimi), ad: `${z.id} dönüş tarihi` }, deg: { is: z.id }, etki: 'Girilen gün kesin süre sayılır; plan onu kullanır.' })) : [],
      secenekler: x ? [{ ad: `${x.r.job} çizelgede`, etki: 'Planlama motorunun tezgâh çizelgesine gider.', simge: 'gantt', yap: () => { o.git('plan'); } }] : [],
      kilitli: ak.length > 0 && !yazabilir,
    };
  };

  const formlar = F ? [F.termin, F.karar].filter((x): x is FormTanimi => x !== null) : [];
  return (
    <IsiSayfasi
      ad="Fason planı" simge="truck" veri={V} acilim={acilim} formlar={formlar}
      eylemler={[{ anahtar: 'oner', baslik: 'Fason önerilerini hesapla', simge: 'play', sec: () => undefined, pasif: true, pasifNedeni: MOTOR_KAPALI }]}
      tum={c && H ? <TumFasonlar c={c} H={H} para={o.yetki.maliyetOku} /> : null}
    />
  );
}

function TumFasonlar({ c, H, para }: { c: PlanlamaCalismasi; H: Hazirlik; para: boolean }) {
  const D = c.D;
  const gec = H.L.filter((x) => fasonDurumu(x)[1] === 'hata').length;
  const tah = H.L.filter((x) => x.T === null).length;
  return (
    <>
      <div className="tc-pyk-kartlar">
        <SayiKarti baslik="Fasondaki iş" simge="truck" sayi={H.L.length} altMetin={`${String(fasoncular(D).length)} fasoncu`} />
        <SayiKarti baslik="Siparişi geciktiren" simge="alert" sayi={gec} ton={gec ? 'hata' : 'bilgi'} />
        <SayiKarti baslik="Dönüş tarihi yok" simge="flag" sayi={tah} ton={tah ? 'uyari' : 'bilgi'} />
      </div>
      <Tablo
        etiket="Fason işleri" satirlar={H.L} satirAnahtari={(x) => x.id} bosMesaj="Planda fasona giden iş yok."
        sutunlar={[
          { anahtar: 'id', baslik: 'İş', mono: true, hucre: (x) => x.id },
          { anahtar: 'ad', baslik: 'Adım', hucre: (x) => x.tanim?.ad || YOK },
          { anahtar: 'f', baslik: 'Fasoncu', hucre: (x) => x.f?.ad ?? x.r.m },
          { anahtar: 'adet', baslik: 'Adet', hizala: 'sag', hucre: (x) => sayi(x.tanim?.adet ?? null, 0) },
          { anahtar: 'cikis', baslik: 'Çıkış', hucre: (x) => gunYaz(D, x.r.S) },
          { anahtar: 'donus', baslik: 'Dönüş', hucre: (x) => `${gunYaz(D, x.T ?? x.r.C)}${x.T === null ? ' (tahmini)' : ''}` },
          { anahtar: 'ger', baslik: 'Sonraki adım', hucre: (x) => gunYaz(D, x.ger) },
          { anahtar: 'tahmini', baslik: 'Olağan süreyle', hucre: (x) => gunYaz(D, x.tahmini) },
          ...(para ? [{ anahtar: 'tutar', baslik: 'Tutar', hizala: 'sag' as const, hucre: (x: FasonIsi) => tl(fasonTutari(D, x.r, x.tanim)) }] : []),
          { anahtar: 'durum', baslik: 'Durum', csv: (x) => fasonDurumu(x)[0], hucre: (x) => { const [m, t] = fasonDurumu(x); return <TonRozeti ton={t}>{m}</TonRozeti>; } },
        ]}
      />
    </>
  );
}
