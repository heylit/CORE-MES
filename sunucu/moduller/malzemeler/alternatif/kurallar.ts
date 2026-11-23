// 3437: alternatif motoru, saf. Bir kartın kabul zarfı kurallardan hesaplanır (dar kapsam geniş olanı ezer: kart > kalite > sınıf > aile);
// aday kart zarfa göre "ayni", "icinde", "sartli" (izin ister) ya da "disi" çıkar. Kesit ölçüsü istenenden küçük olamaz, en çok pay kadar
// büyük olabilir; lama ve blokta ölçüler sıralanıp eşlenir, boruda iç çap istenenden büyük olamaz (3398 stok kontrolüyle aynı kural).
import type {
  AlternatifKarti, AlternatifZarfi, DurumMuadili, KaliteMuadili, KapsamTuru, KullanimYeri, MuadilTuru, SetKipi, SetNiteligi, SinirDegeri, SinirNiteligi, ZarfSonucu,
} from '#paylasilan/sozlesme/malzeme-alternatifleri.ts';
import { SET_LISTE_NITELIKLERI } from '#paylasilan/sozlesme/malzeme-alternatifleri.ts';
import { olcuEtiketi } from '#paylasilan/malzeme-alternatif-ozeti.ts';
import { FORM_OLCULERI, OLCULU_FORMLAR, VARSAYILAN_PAY, type OlculuForm, type PayTuru } from '#paylasilan/sozlesme/stok-kontrol-sabitleri.ts';

export interface ZarfKarti {
  no: number;
  aile: string | null;
  sinif: string | null;
  kalite: string | null;
  durum: string | null;
  yuzey: string | null;
  form: string | null;
  olcu: Readonly<Record<string, number>>;
}

export interface KuralSatiri {
  kapsamTuru: KapsamTuru;
  kapsam: string;
  kaliteAcik: boolean | null;
  durumAcik: boolean | null;
  sartliAcik: boolean | null;
  boyUzunKesilir: boolean | null;
  yuzeySerbest: boolean | null;
  payTuru: PayTuru | null;
  payDeger: number | null;
  payEnAzMm: number | null;
  kapali: boolean | null;
  gerekce: string | null;
}

// 3463: kartta seçilen kabul sınırı; nitelik başına en dar kapsamdaki satır geçer ve kural/muadil değerini ezer.
export interface SinirSatiri {
  kapsamTuru: KapsamTuru;
  kapsam: string;
  nitelik: SinirNiteligi;
  degerler: readonly SinirDegeri[] | null;
  alt: number | null;
  ust: number | null;
}

type Kaynak = { kapsamTuru: KapsamTuru; kapsam: string } | null;
const AYNI = 1e-6;
const SIRA: readonly KapsamTuru[] = ['kart', 'kalite', 'sinif', 'aile'];

// Sınıf kapsamı "aile/sınıf" biçimindedir: aynı sınıf adı başka ailede başka malzemedir.
export const sinifAnahtari = (aile: string | null, sinif: string | null): string | null => (aile && sinif ? `${aile}/${sinif}` : null);

function kapsamDegeri(k: ZarfKarti, t: KapsamTuru): string | null {
  switch (t) {
    case 'kart': return String(k.no);
    case 'kalite': return k.kalite;
    case 'sinif': return sinifAnahtari(k.aile, k.sinif);
    case 'aile': return k.aile;
  }
}

// Karta uyan kurallar, en dardan en genişe.
export function uyanKurallar(k: ZarfKarti, kurallar: readonly KuralSatiri[]): KuralSatiri[] {
  return SIRA.flatMap((t) => {
    const d = kapsamDegeri(k, t);
    return d === null ? [] : kurallar.filter((r) => r.kapsamTuru === t && r.kapsam === d);
  });
}

function sec<A extends keyof KuralSatiri>(uyan: readonly KuralSatiri[], alan: A): { deger: NonNullable<KuralSatiri[A]>; kaynak: Kaynak } | null {
  for (const r of uyan) {
    const v = r[alan];
    if (v !== null) return { deger: v as NonNullable<KuralSatiri[A]>, kaynak: { kapsamTuru: r.kapsamTuru, kapsam: r.kapsam } };
  }
  return null;
}

const LISTE = new Set<string>(['kalite', 'durum', 'yuzey']);
// Sınır yazımının biçimi: liste niteliğine tekrarsız değer listesi, ölçüye alt ya da üst (alt <= üst).
export function sinirHatasi(nitelik: SinirNiteligi, degerler: readonly SinirDegeri[] | null, alt: number | null, ust: number | null):
  { ileti: string; alan: 'degerler' | 'alt' } | null {
  if (LISTE.has(nitelik)) {
    if (degerler === null || alt !== null || ust !== null) return { ileti: 'Bu niteliğe izinli değerler seçilir.', alan: 'degerler' };
    if (new Set(degerler.map((d) => d.deger)).size !== degerler.length) return { ileti: 'Aynı değer iki kez seçilmiş.', alan: 'degerler' };
    return null;
  }
  if (degerler !== null) return { ileti: 'Ölçüye değer listesi değil, alt ve üst sınır girilir.', alan: 'alt' };
  if (alt === null && ust === null) return { ileti: 'Alt ya da üst sınırdan en az birini girin.', alan: 'alt' };
  if (alt !== null && ust !== null && alt > ust) return { ileti: 'Alt sınır üst sınırdan büyük olamaz.', alan: 'alt' };
  return null;
}

// Karta uyan en dar kapsamdaki sınır (nitelik başına).
export function uyanSinir(k: ZarfKarti, siniri: readonly SinirSatiri[], nitelik: SinirNiteligi): SinirSatiri | null {
  for (const t of SIRA) {
    const d = kapsamDegeri(k, t);
    if (d === null) continue;
    const r = siniri.find((x) => x.nitelik === nitelik && x.kapsamTuru === t && x.kapsam === d);
    if (r) return r;
  }
  return null;
}
const sinirKaynagi = (r: SinirSatiri | null): Kaynak => (r ? { kapsamTuru: r.kapsamTuru, kapsam: r.kapsam } : null);

export const olculuFormMu = (f: string | null): f is OlculuForm => f !== null && (OLCULU_FORMLAR as readonly string[]).includes(f);

export function payMm(pay: { tur: PayTuru; deger: number; enAzMm: number }, istenen: number): number {
  if (pay.tur === 'tam') return 0;
  if (pay.tur === 'mm') return pay.deger;
  return Math.max((istenen * pay.deger) / 100, pay.enAzMm);
}
const yuvarla = (x: number) => Math.round(x * 1000) / 1000;

export function zarfHesapla(
  k: ZarfKarti, kurallar: readonly KuralSatiri[], km: readonly KaliteMuadili[], dm: readonly DurumMuadili[], siniri: readonly SinirSatiri[] = [],
): AlternatifZarfi {
  const uyan = uyanKurallar(k, kurallar);
  const kapali = sec(uyan, 'kapali');
  const kapaliKural = kapali?.deger === true ? uyan.find((r) => r.kapsamTuru === kapali.kaynak!.kapsamTuru && r.kapsam === kapali.kaynak!.kapsam) : undefined;
  const sartli = sec(uyan, 'sartliAcik');
  const kaliteAcik = sec(uyan, 'kaliteAcik');
  const durumAcik = sec(uyan, 'durumAcik');
  const payKurali = uyan.find((r) => r.payTuru !== null);
  const pay = payKurali
    ? { tur: payKurali.payTuru!, deger: payKurali.payDeger ?? 0, enAzMm: payKurali.payEnAzMm ?? 0, kaynak: { kapsamTuru: payKurali.kapsamTuru, kapsam: payKurali.kapsam } }
    : { ...VARSAYILAN_PAY, kaynak: null };
  const uzun = sec(uyan, 'boyUzunKesilir');
  const yuzey = sec(uyan, 'yuzeySerbest');
  const secenek = (l: readonly { muadil: string; tur: MuadilTuru; notu: string | null }[]) => l.map((m) => ({ deger: m.muadil, tur: m.tur, notu: m.notu }));
  const form = olculuFormMu(k.form) ? FORM_OLCULERI[k.form] : null;
  const listeSiniri = (n: 'kalite' | 'durum' | 'yuzey', istenen: string | null) => {
    const r = uyanSinir(k, siniri, n);
    if (r === null) return null;
    return { kaynak: sinirKaynagi(r), secenekler: (r.degerler ?? []).filter((d) => d.deger !== istenen).map((d) => ({ deger: d.deger, tur: d.tur, notu: null })) };
  };
  const ks = listeSiniri('kalite', k.kalite), ds = listeSiniri('durum', k.durum), ys = listeSiniri('yuzey', k.yuzey);
  const boyS = form?.boy ? uyanSinir(k, siniri, form.boy as SinirNiteligi) : null;
  return {
    kapali: kapali?.deger ?? false,
    gerekce: kapaliKural?.gerekce ?? null,
    kapaliKaynak: kapali?.kaynak ?? null,
    sartliAcik: sartli?.deger ?? false,
    sartliKaynak: sartli?.kaynak ?? null,
    kalite: ks ? { istenen: k.kalite, acik: true, kaynak: ks.kaynak, secenekler: ks.secenekler, sinir: true } : {
      istenen: k.kalite, acik: kaliteAcik?.deger ?? true, kaynak: kaliteAcik?.kaynak ?? null, sinir: false,
      secenekler: k.kalite === null ? [] : secenek(km.filter((m) => m.kalite === k.kalite)),
    },
    durum: ds ? { istenen: k.durum, acik: true, kaynak: ds.kaynak, secenekler: ds.secenekler, sinir: true } : {
      istenen: k.durum, acik: durumAcik?.deger ?? true, kaynak: durumAcik?.kaynak ?? null, sinir: false,
      secenekler: k.durum === null ? [] : secenek(dm.filter((m) => m.durum === k.durum).map((m) => ({ muadil: m.muadil, tur: m.tur, notu: m.notu }))),
    },
    form: k.form,
    olcu: form === null ? [] : form.kesit.flatMap((a) => {
      const v = k.olcu[a];
      if (v === undefined) return [];
      const r = uyanSinir(k, siniri, a as SinirNiteligi);
      return [{ anahtar: a, istenen: v, enAz: r?.alt ?? v, enCok: r?.ust ?? yuvarla(v + payMm(pay, v)), sinirKaynak: sinirKaynagi(r) }];
    }),
    pay,
    boy: form?.boy ? {
      anahtar: form.boy, istenen: k.olcu[form.boy] ?? null, uzunKesilir: uzun?.deger ?? true, kaynak: uzun?.kaynak ?? null,
      enAz: boyS?.alt ?? null, enCok: boyS?.ust ?? null, sinirKaynak: sinirKaynagi(boyS),
    } : null,
    yuzey: ys
      ? { istenen: k.yuzey, serbest: false, kaynak: ys.kaynak, secenekler: ys.secenekler, sinir: true }
      : { istenen: k.yuzey, serbest: yuzey?.deger ?? false, kaynak: yuzey?.kaynak ?? null, secenekler: [], sinir: false },
  };
}

type Adim = 'ayni' | 'icinde' | 'sartli' | 'disi';
const SONUC_SIRASI: Readonly<Record<Adim, number>> = { ayni: 0, icinde: 1, sartli: 2, disi: 3 };

function muadilAdimi(acik: boolean, sartliAcik: boolean, istenen: string | null, aday: string | null,
  secenekler: AlternatifZarfi['kalite']['secenekler'], ad: string, sinir = false): { adim: Adim; neden: string | null } {
  if (istenen === null || aday === istenen) return { adim: 'ayni', neden: null };
  if (aday === null) return { adim: 'disi', neden: `${ad} yok` };
  if (!acik) return { adim: 'disi', neden: `${ad} yalnız ${istenen}` };
  const m = secenekler.find((s) => s.deger === aday);
  if (!m) return { adim: 'disi', neden: sinir ? `${ad} ${aday} sınır dışı` : `${ad} ${aday} muadil değil` };
  if (m.tur === 'sartli') return { adim: sartliAcik ? 'icinde' : 'sartli', neden: `${ad} ${aday} şartlı muadil` };
  return { adim: 'icinde', neden: `${ad} ${aday} ${m.tur === 'tam' ? 'tam' : 'üst'} muadil` };
}

function olcuAdimi(z: AlternatifZarfi, aday: ZarfKarti): { adim: Adim; nedenler: string[] } {
  if (z.olcu.length === 0) return { adim: 'ayni', nedenler: [] };
  const n: string[] = [];
  let adim: Adim = 'ayni';
  const lamaBlok = z.form === 'lama' || z.form === 'blok';
  const ciftler: [string, number, number, number, number][] = [];
  if (lamaBlok) {
    const iv = [...z.olcu].sort((x, y) => y.istenen - x.istenen);
    const av = z.olcu.map((o) => aday.olcu[o.anahtar]);
    if (av.some((v) => v === undefined)) return { adim: 'disi', nedenler: ['Ölçü eksik'] };
    const as = (av as number[]).sort((x, y) => y - x);
    iv.forEach((o, i) => ciftler.push([o.anahtar, o.istenen, o.enAz, o.enCok, as[i]!]));
  } else {
    for (const o of z.olcu) {
      const v = aday.olcu[o.anahtar];
      if (v === undefined) return { adim: 'disi', nedenler: ['Ölçü eksik'] };
      ciftler.push([o.anahtar, o.istenen, o.enAz, o.enCok, v]);
    }
  }
  for (const [a, ist, enAz, enCok, v] of ciftler) {
    if (z.form === 'boru' && a === 't' && enAz === ist) continue;
    if (v + AYNI < enAz) return { adim: 'disi', nedenler: [`${a} ${v} < ${enAz}`] };
    if (v > enCok + AYNI) return { adim: 'disi', nedenler: [`${a} +${yuvarla(v - ist)} mm pay dışı`] };
    if (v > ist + AYNI) { adim = 'icinde'; n.push(`${a} +${yuvarla(v - ist)} mm`); }
    else if (v + AYNI < ist) { adim = 'icinde'; n.push(`${a} -${yuvarla(ist - v)} mm`); }
  }
  if (z.form === 'boru') {
    const D = z.olcu.find((o) => o.anahtar === 'D')?.istenen, t = z.olcu.find((o) => o.anahtar === 't')?.istenen;
    const aD = aday.olcu['D'], at = aday.olcu['t'];
    if (D !== undefined && t !== undefined && aD !== undefined && at !== undefined) {
      if (aD - 2 * at > D - 2 * t + AYNI) return { adim: 'disi', nedenler: ['İç çap büyük'] };
      if (Math.abs(at - t) > AYNI) { adim = 'icinde'; n.push(`t +${yuvarla(at - t)} mm`); }
    }
  }
  return { adim, nedenler: n };
}

// Adayın zarfa göre sonucu ve nedenleri. Kapalı zarfta yalnız aynı kart (aynı nitelikler) geçer.
export function zarfDegerlendir(z: AlternatifZarfi, aday: ZarfKarti): { sonuc: ZarfSonucu; nedenler: string[] } {
  const nedenler: string[] = [];
  let en: Adim = 'ayni';
  const isle = (adim: Adim, neden: string | null) => {
    if (neden) nedenler.push(neden);
    if (SONUC_SIRASI[adim] > SONUC_SIRASI[en]) en = adim;
  };
  if (aday.form !== z.form) return { sonuc: 'disi', nedenler: ['Form farklı'] };
  const ka = muadilAdimi(z.kalite.acik, z.sartliAcik, z.kalite.istenen, aday.kalite, z.kalite.secenekler, 'Kalite', z.kalite.sinir);
  isle(ka.adim, ka.neden);
  const du = muadilAdimi(z.durum.acik, z.sartliAcik, z.durum.istenen, aday.durum, z.durum.secenekler, 'Durum', z.durum.sinir);
  isle(du.adim, du.neden);
  const o = olcuAdimi(z, aday);
  o.nedenler.forEach((x) => nedenler.push(x));
  if (SONUC_SIRASI[o.adim] > SONUC_SIRASI[en]) en = o.adim;
  if (z.boy && (z.boy.enAz !== null || z.boy.enCok !== null)) {
    const v = aday.olcu[z.boy.anahtar];
    if (v !== undefined) {
      if (z.boy.enAz !== null && v + AYNI < z.boy.enAz) isle('disi', 'Boy kısa');
      else if (z.boy.enCok !== null && v > z.boy.enCok + AYNI) isle('disi', 'Boy uzun');
      else if (z.boy.istenen !== null && Math.abs(v - z.boy.istenen) > AYNI) isle('icinde', 'Boy sınır içinde');
    }
  } else if (z.boy && z.boy.istenen !== null) {
    const v = aday.olcu[z.boy.anahtar];
    if (v !== undefined && Math.abs(v - z.boy.istenen) > AYNI) {
      if (v < z.boy.istenen) isle('disi', 'Boy kısa');
      else isle(z.boy.uzunKesilir ? 'icinde' : 'disi', z.boy.uzunKesilir ? 'Uzun boy, kesilir' : 'Boy farklı');
    }
  }
  if (z.yuzey.sinir) {
    const yu = muadilAdimi(true, z.sartliAcik, z.yuzey.istenen, aday.yuzey, z.yuzey.secenekler, 'Yüzey', true);
    isle(yu.adim, yu.neden);
  } else if (z.yuzey.istenen !== null && aday.yuzey !== z.yuzey.istenen) isle(z.yuzey.serbest ? 'icinde' : 'disi', `Yüzey ${aday.yuzey ?? 'yok'}`);
  if (z.kapali && en !== 'ayni') return { sonuc: 'disi', nedenler: ['Alternatif kapalı', ...nedenler] };
  return { sonuc: en, nedenler };
}

// Zarfa giren kartlar (kartın kendisi hariç); sıra: aynı, içinde, şartlı; eşitte kart no.
export function zarfaGirenler<T extends ZarfKarti>(z: AlternatifZarfi, kart: ZarfKarti, adaylar: readonly T[]): (T & { sonuc: ZarfSonucu; nedenler: string[] })[] {
  return adaylar
    .filter((a) => a.no !== kart.no)
    .map((a) => ({ ...a, ...zarfDegerlendir(z, a) }))
    .filter((a) => a.sonuc !== 'disi')
    .sort((x, y) => SONUC_SIRASI[x.sonuc] - SONUC_SIRASI[y.sonuc] || x.no - y.no);
}

export const KAPSAM_DOGRULAMA = {
  // Kart kapsamı kartın sayı kimliğidir; sınıf kapsamı "aile/sınıf".
  kapsamHatasi(turu: KapsamTuru, kapsam: string): string | null {
    if (turu === 'kart' && !/^[1-9][0-9]{0,9}$/.test(kapsam)) return 'Kart kapsamı kart numarası olmalı.';
    if (turu === 'sinif' && !/^[^/]+\/[^/]+$/.test(kapsam)) return 'Sınıf kapsamı "aile/sınıf" biçiminde olmalı.';
    return null;
  },
  payHatasi(tur: PayTuru | null, deger: number | null, enAz: number | null): string | null {
    if (tur === null) return deger === null && enAz === null ? null : 'Pay türü seçilmeden değer girilemez.';
    if (tur === 'tam') return deger === null && enAz === null ? null : 'Yalnız aynı ölçüde değer girilmez.';
    if (deger === null) return 'Pay değeri girin.';
    if (tur === 'mm' && enAz !== null) return 'En az mm yalnız yüzdeli payda girilir.';
    return null;
  },
};

// 3437 a (dilim 3b-2): onaylanan alternatifin kartı.
export interface AlternatifNitelikleri { kalite: string | null; durum: string | null; yuzey: string | null; islem?: readonly string[] | null | undefined; olcu: Record<string, number> }
const sayi = (v: number): string => v.toLocaleString('tr-TR');
// Ailede alternatifin etiketi: istenenden farklı nitelikler ("6262 T651 d 52 mm"); ölçü biçimi Taleplerim'deki şartlı alternatifle aynı.
export const alternatifEtiketi = (a: AlternatifNitelikleri): string =>
  [a.kalite, a.durum, a.yuzey, ...(a.islem ? [a.islem.length ? a.islem.join('+') : 'işlemsiz'] : []), ...Object.entries(a.olcu).sort(([x], [y]) => (x < y ? -1 : 1)).map(([k, v]) => `${k} ${sayi(v)} mm`)]
    .filter((x): x is string => !!x).join(' ').slice(0, 60) || 'alternatif';
const AD_EN_COK = 200;
// Ad sınırında ana ad kesilmez, etiket kısalır (ana ad tek başına sınırı aşıyorsa yalnız o kalır).
export const alternatifKartAdi = (anaAd: string, etiket: string): string => {
  const kalan = AD_EN_COK - anaAd.length - ' (alternatif )'.length;
  if (kalan <= 0) return anaAd.slice(0, AD_EN_COK);
  return `${anaAd} (alternatif ${etiket.slice(0, kalan).trim()})`.trim();
};

// 3572 a: alternatif seti. Satırı olan nitelik dolu sayılır; dolu niteliklerin hepsi tutmalı, listede değerlerden biri yeter.
// Ölçüde boş uç sınırsızdır; kartta o ölçü yoksa uymaz. Standartta kartın standartlarından biri listede olmalı.
// 3593: kip 'birebir' ana kartın değerini, 'pay' ana ölçünün altını ve üstünü izler; ana kart değişirse set de değişir. Kip boşsa bugünkü
// anlam. İşlem: istenen işlemlerin hepsi kartta olmalı (yanlış kabul pahalı); birebirde kartın işlemleri ana kartınkilerle aynı olmalı.
export interface SetNiteligiSatiri {
  nitelik: SetNiteligi; kip?: SetKipi | null; degerler: readonly string[] | null; alt: number | null; ust: number | null;
  payAlt?: number | null; payUst?: number | null;
}
export interface SetKarti {
  form: string | null; kalite: string | null; durum: string | null; yuzey: string | null; standartlar: readonly string[];
  islemler: readonly string[]; olcu: Readonly<Record<string, number>>;
}
const SET_LISTESI = new Set<string>(SET_LISTE_NITELIKLERI);
const SET_ADI: Record<string, string> = { form: 'form', kalite: 'kalite', durum: 'durum', standart: 'standart', yuzey: 'yüzey', islem: 'işlem' };

export function setHatasi(n: readonly SetNiteligiSatiri[]): { ileti: string; alan: string } | null {
  if (n.length === 0) return { ileti: 'Sette en az bir alan doldurun.', alan: 'nitelikler' };
  if (new Set(n.map((x) => x.nitelik)).size !== n.length) return { ileti: 'Aynı alan iki kez girilmiş.', alan: 'nitelikler' };
  for (const x of n) {
    const kip = x.kip ?? null, payVar = (x.payAlt ?? null) !== null || (x.payUst ?? null) !== null;
    if (SET_LISTESI.has(x.nitelik)) {
      if (kip === 'pay' || kip === 'aralik') return { ileti: `${SET_ADI[x.nitelik]} için pay ya da aralık girilmez.`, alan: x.nitelik };
      if (x.alt !== null || x.ust !== null || payVar) return { ileti: `${SET_ADI[x.nitelik]} için değer seçin.`, alan: x.nitelik };
      if (kip === 'birebir') {
        if (x.degerler !== null) return { ileti: `${SET_ADI[x.nitelik]} birebirse değer seçilmez; ana kartın değeri geçer.`, alan: x.nitelik };
        continue;
      }
      if (x.degerler === null || x.degerler.length === 0) return { ileti: `${SET_ADI[x.nitelik]} için değer seçin.`, alan: x.nitelik };
      if (new Set(x.degerler).size !== x.degerler.length) return { ileti: 'Aynı değer iki kez seçilmiş.', alan: x.nitelik };
    } else {
      if (x.degerler !== null) return { ileti: 'Ölçüye değer listesi değil, en az ve en çok girilir.', alan: x.nitelik };
      if (kip === 'birebir') {
        if (x.alt !== null || x.ust !== null || payVar) return { ileti: 'Birebir ölçüde sayı girilmez; ana kartın ölçüsü geçer.', alan: x.nitelik };
        continue;
      }
      if (kip === 'pay') {
        if (x.alt !== null || x.ust !== null) return { ileti: 'Payda en az ve en çok değil, aşağı ve yukarı pay girilir.', alan: x.nitelik };
        if ((x.payAlt ?? null) === null || (x.payUst ?? null) === null) return { ileti: 'Aşağı ve yukarı payı girin (0 olabilir).', alan: x.nitelik };
        continue;
      }
      if (payVar) return { ileti: 'Aralıkta pay girilmez.', alan: x.nitelik };
      if (x.alt === null && x.ust === null) return { ileti: 'En az ya da en çoktan birini girin.', alan: x.nitelik };
      if (x.alt !== null && x.ust !== null && x.alt > x.ust) return { ileti: 'En az en çoktan büyük olamaz.', alan: x.nitelik };
    }
  }
  return null;
}

const tek = (v: string | null): readonly string[] => (v === null ? [] : [v]);
const LISTE_DEGERI: Record<(typeof SET_LISTE_NITELIKLERI)[number], (k: SetKarti) => readonly string[]> = {
  form: (k) => tek(k.form), kalite: (k) => tek(k.kalite), durum: (k) => tek(k.durum), yuzey: (k) => tek(k.yuzey), standart: (k) => k.standartlar,
  islem: (k) => k.islemler,
};
const ayniKume = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x)) && b.every((x) => a.includes(x));

// Birebir ve Pay ana kartın bugünkü değeriyle çözülür. Ana kartta değer yoksa: birebir listede "yok" ister, ölçüde set uymaz.
function olcuSiniri(x: SetNiteligiSatiri, ana: SetKarti | null): { alt: number | null; ust: number | null } | null {
  const kip = x.kip ?? null;
  if (kip !== 'birebir' && kip !== 'pay') return { alt: x.alt, ust: x.ust };
  const a = ana?.olcu[x.nitelik];
  if (a === undefined) return null;
  return kip === 'birebir' ? { alt: a, ust: a } : { alt: a - (x.payAlt ?? 0), ust: a + (x.payUst ?? 0) };
}

// Uyuyorsa neden, uyan alanların kart değerleridir ("d 42 · kalite 6082"); uymuyorsa ilk tutmayan alan.
export function setUyumu(n: readonly SetNiteligiSatiri[], k: SetKarti, ana: SetKarti | null = null): { uyar: boolean; neden: string } {
  if (n.length === 0) return { uyar: false, neden: 'Boş set' };
  const parca: string[] = [];
  for (const x of n) {
    if (SET_LISTESI.has(x.nitelik)) {
      const ad = x.nitelik as (typeof SET_LISTE_NITELIKLERI)[number];
      const v = LISTE_DEGERI[ad](k);
      const birebir = (x.kip ?? null) === 'birebir';
      if (birebir && ana === null) return { uyar: false, neden: 'Ana kart okunamadı' };
      const istenen = birebir ? LISTE_DEGERI[ad](ana!) : x.degerler!;
      if (ad === 'islem') {
        const tutar = birebir ? ayniKume(v, istenen) : istenen.every((d) => v.includes(d));
        if (!tutar) return { uyar: false, neden: `işlem ${v.join(' + ') || 'yok'}` };
        if (v.length > 0) parca.push(`işlem ${v.join(' + ')}`);
        continue;
      }
      if (birebir && istenen.length === 0) {
        if (v.length > 0) return { uyar: false, neden: `${SET_ADI[ad]} ${v.join(', ')}` };
        continue;
      }
      const tutan = v.find((d) => istenen.includes(d));
      if (tutan === undefined) return { uyar: false, neden: `${SET_ADI[ad]} ${v.join(', ') || 'yok'}` };
      if (ad !== 'form') parca.push(`${SET_ADI[ad]} ${tutan}`);
    } else {
      const sinir = olcuSiniri(x, ana);
      if (sinir === null) return { uyar: false, neden: `ana kartta ${x.nitelik} yok` };
      const v = k.olcu[x.nitelik];
      if (v === undefined) return { uyar: false, neden: `${x.nitelik} yok` };
      if ((sinir.alt !== null && v + AYNI < sinir.alt) || (sinir.ust !== null && v > sinir.ust + AYNI)) return { uyar: false, neden: `${x.nitelik} ${sayi(v)}` };
      parca.unshift(`${x.nitelik} ${sayi(v)}`);
    }
  }
  return { uyar: true, neden: parca.join(' · ') || 'Bütün alanlar serbest' };
}

// Z4: setin türü tek başına belirler; şartlı muadil bir değer işaretliyse set şartlı kaydedilir.
export function setTuru(tur: MuadilTuru, n: readonly SetNiteligiSatiri[], zarf: AlternatifZarfi | null): MuadilTuru {
  if (zarf === null) return tur;
  const sartli = (x: AlternatifZarfi['kalite'], ad: 'kalite' | 'durum') => n.some((s) => s.nitelik === ad
    && (s.degerler ?? []).some((d) => x.secenekler.some((m) => m.deger === d && m.tur === 'sartli')));
  return sartli(zarf.kalite, 'kalite') || sartli(zarf.durum, 'durum') ? 'sartli' : tur;
}

// K4 öncelik: Önerilmesin her şeyden ağır (eşdeğer bağ hariç: bağ üstündür); tekil kart satırı uyduğu setin türünü ve yerini ezer;
// set kuraldan geleni ezer. Setler ve tekil kartlar kullanıcının sırasıyla, sonra kuraldan gelenler. İptal kart seçimde gelmez.
type KartBilgisi = { no: number; kod: string | null; ad: string | null };
export interface OncelikGirdisi {
  kullanimYeri: KullanimYeri;
  esdeger: readonly KartBilgisi[];
  secili: readonly (KartBilgisi & { iptal: boolean; onerilmez: boolean; tur: MuadilTuru | null; sira: number | null; kullanimYerleri: readonly KullanimYeri[] | null })[];
  setler: readonly { id: number; ad: string; tur: MuadilTuru; sira: number; kullanimYerleri: readonly KullanimYeri[]; uyanlar: readonly (KartBilgisi & { neden: string })[] }[];
  kuraldan: readonly (KartBilgisi & { sonuc: 'ayni' | 'icinde' | 'sartli'; nedenler: string[] })[];
}
const turSonucu = (t: MuadilTuru): 'icinde' | 'sartli' => (t === 'sartli' ? 'sartli' : 'icinde');
const TUR_METNI: Record<MuadilTuru, string> = { tam: 'tam', ust: 'üst', sartli: 'şartlı' };

export function alternatifOnceligi(g: OncelikGirdisi): AlternatifKarti[] {
  const cikti: AlternatifKarti[] = g.esdeger.map((e) => ({ ...e, tur: 'esdeger', sonuc: 'ayni', nedenler: ['Aynı malzeme'], muadilTuru: null, setId: null }));
  const gorulen = new Set(cikti.map((x) => x.no));
  for (const s of g.secili) if (s.onerilmez || s.iptal) gorulen.add(s.no);
  // Tekil satırı olan kart, yeri tutmasa da sette tekrar edilmez (en dar kural).
  const tekil = new Set(g.secili.filter((s) => !s.onerilmez).map((s) => s.no));
  // Sete uyan kart kuraldan gelmez: setin türü ve yeri geçer (yeri tutmayan yerde de kuraldan dönmez).
  const setli = new Set(g.setler.flatMap((t) => t.uyanlar.map((u) => u.no)));
  const ogeler = [
    ...g.secili.filter((s) => !s.onerilmez && !s.iptal).map((s) => ({ sira: s.sira ?? 0, tur: 0, s })),
    ...g.setler.map((t) => ({ sira: t.sira, tur: 1, t })),
  ].sort((a, b) => a.sira - b.sira || a.tur - b.tur);
  for (const o of ogeler) {
    if ('s' in o && o.s) {
      const s = o.s;
      if (gorulen.has(s.no) || !(s.kullanimYerleri ?? []).includes(g.kullanimYeri)) continue;
      gorulen.add(s.no);
      cikti.push({ no: s.no, kod: s.kod, ad: s.ad, tur: 'secili', sonuc: turSonucu(s.tur!), nedenler: [`Elle eklendi · ${TUR_METNI[s.tur!]}`], muadilTuru: s.tur, setId: null });
    } else if ('t' in o && o.t) {
      const t = o.t;
      if (!t.kullanimYerleri.includes(g.kullanimYeri)) continue;
      for (const u of t.uyanlar) {
        if (gorulen.has(u.no) || tekil.has(u.no)) continue;
        gorulen.add(u.no);
        cikti.push({ no: u.no, kod: u.kod, ad: u.ad, tur: 'set', sonuc: turSonucu(t.tur), nedenler: [`${t.ad} · ${u.neden}`], muadilTuru: t.tur, setId: t.id });
      }
    }
  }
  for (const k of g.kuraldan) {
    if (gorulen.has(k.no) || tekil.has(k.no) || setli.has(k.no)) continue;
    gorulen.add(k.no);
    cikti.push({ ...k, tur: 'alternatif', muadilTuru: null, setId: null });
  }
  return cikti;
}

// 3593 (Risk K1): Aralık (ve kipi boş eski satır) mutlak mm taşır; başka karta kopyalanınca hedefin kendi ölçüsü aralığın içinde değilse
// kopya o karta yanlış sınır yazar. Hedefte ölçü yoksa ya da aralık dışındaysa kopya reddedilir; Birebir ve Pay hedefin ölçüsünü izler.
export function kopyaAralikHatasi(n: readonly SetNiteligiSatiri[], hedefOlcu: Readonly<Record<string, number>>): string | null {
  const sayi = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 3 });
  for (const x of n) {
    if (SET_LISTE_NITELIKLERI.includes(x.nitelik as (typeof SET_LISTE_NITELIKLERI)[number])) continue;
    if (x.kip === 'birebir' || x.kip === 'pay') continue;
    const e = olcuEtiketi(x.nitelik);
    const v = hedefOlcu[x.nitelik];
    if (v === undefined) return `kartta ${e} yok; ${e} için Aralık kopyalanmaz, Pay ya da Birebir kullanın`;
    if ((x.alt !== null && v < x.alt) || (x.ust !== null && v > x.ust)) {
      const ara = x.alt !== null && x.ust !== null ? `${sayi(x.alt)}–${sayi(x.ust)}` : x.alt !== null ? `en az ${sayi(x.alt)}` : `en çok ${sayi(x.ust!)}`;
      return `${e} ${sayi(v)} aralığın (${ara}) dışında; bu ölçü için Pay ya da Birebir kullanın`;
    }
  }
  return null;
}

// 3593 (Risk S3, S5): teklif satırına dondurulan alternatif kartı sınırı: setin nitelikleri ve ana kartın o anki değerleri. Birebir ve Pay
// bu ana değerlerle çözülür; set ya da ana kart sonra değişse de teklif ve onaydaki kart açma bu sınırla denetlenir.
export interface DondurulmusSinir { nitelikler: readonly SetNiteligiSatiri[]; ana: SetKarti }
export const dondurulmusUyum = (d: DondurulmusSinir, aday: SetKarti): { uyar: boolean; neden: string } => setUyumu(d.nitelikler, aday, d.ana);
// Teklif edilen alternatifin aday kartı: boş nitelik ve gelmeyen işlem ana kartınkidir (S7); ölçü ana ölçünün üstüne yazılır.
export interface TeklifNitelikleri { kalite: string | null; durum: string | null; yuzey: string | null; islem?: readonly string[] | null | undefined; olcu: Readonly<Record<string, number>> }
export const teklifAdayi = (ana: SetKarti, a: TeklifNitelikleri): SetKarti => ({
  ...ana, kalite: a.kalite ?? ana.kalite, durum: a.durum ?? ana.durum, yuzey: a.yuzey ?? ana.yuzey,
  islemler: a.islem ?? ana.islemler, olcu: { ...ana.olcu, ...a.olcu },
});
export const islemFarkliMi = (a: readonly string[], b: readonly string[]): boolean => !ayniKume(a, b);
// Ekranın ön denetimi için çözülmüş sınır: listede izinli değerler (birebirde ana kartın değerleri), ölçüde en az ve en çok. Ana kartta
// olmayan ölçünün satırı gelmez (sunucu o setle teklifi reddeder).
export interface CozulmusSinir { nitelik: SetNiteligi; birebir: boolean; degerler: string[] | null; alt: number | null; ust: number | null }
export function sinirCoz(d: DondurulmusSinir): CozulmusSinir[] {
  return d.nitelikler.flatMap((x): CozulmusSinir[] => {
    const birebir = (x.kip ?? null) === 'birebir';
    if (SET_LISTESI.has(x.nitelik)) {
      const ad = x.nitelik as (typeof SET_LISTE_NITELIKLERI)[number];
      return [{ nitelik: x.nitelik, birebir, degerler: [...(birebir ? LISTE_DEGERI[ad](d.ana) : x.degerler ?? [])], alt: null, ust: null }];
    }
    const s = olcuSiniri(x, d.ana);
    return s === null ? [] : [{ nitelik: x.nitelik, birebir, degerler: null, alt: s.alt, ust: s.ust }];
  });
}
