// 3437: alternatif motoru, saf. Bir kartın kabul zarfı kurallardan hesaplanır (dar kapsam geniş olanı ezer: kart > kalite > sınıf > aile);
// aday kart zarfa göre "ayni", "icinde", "sartli" (izin ister) ya da "disi" çıkar. Kesit ölçüsü istenenden küçük olamaz, en çok pay kadar
// büyük olabilir; lama ve blokta ölçüler sıralanıp eşlenir, boruda iç çap istenenden büyük olamaz (3398 stok kontrolüyle aynı kural).
import type { AlternatifZarfi, DurumMuadili, KaliteMuadili, KapsamTuru, MuadilTuru, ZarfSonucu } from '#paylasilan/sozlesme/malzeme-alternatifleri.ts';
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

export const olculuFormMu = (f: string | null): f is OlculuForm => f !== null && (OLCULU_FORMLAR as readonly string[]).includes(f);

export function payMm(pay: { tur: PayTuru; deger: number; enAzMm: number }, istenen: number): number {
  if (pay.tur === 'tam') return 0;
  if (pay.tur === 'mm') return pay.deger;
  return Math.max((istenen * pay.deger) / 100, pay.enAzMm);
}
const yuvarla = (x: number) => Math.round(x * 1000) / 1000;

export function zarfHesapla(k: ZarfKarti, kurallar: readonly KuralSatiri[], km: readonly KaliteMuadili[], dm: readonly DurumMuadili[]): AlternatifZarfi {
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
  return {
    kapali: kapali?.deger ?? false,
    gerekce: kapaliKural?.gerekce ?? null,
    kapaliKaynak: kapali?.kaynak ?? null,
    sartliAcik: sartli?.deger ?? false,
    sartliKaynak: sartli?.kaynak ?? null,
    kalite: {
      istenen: k.kalite, acik: kaliteAcik?.deger ?? true, kaynak: kaliteAcik?.kaynak ?? null,
      secenekler: k.kalite === null ? [] : secenek(km.filter((m) => m.kalite === k.kalite)),
    },
    durum: {
      istenen: k.durum, acik: durumAcik?.deger ?? true, kaynak: durumAcik?.kaynak ?? null,
      secenekler: k.durum === null ? [] : secenek(dm.filter((m) => m.durum === k.durum).map((m) => ({ muadil: m.muadil, tur: m.tur, notu: m.notu }))),
    },
    form: k.form,
    olcu: form === null ? [] : form.kesit.flatMap((a) => {
      const v = k.olcu[a];
      return v === undefined ? [] : [{ anahtar: a, istenen: v, enCok: yuvarla(v + payMm(pay, v)) }];
    }),
    pay,
    boy: form?.boy ? { anahtar: form.boy, istenen: k.olcu[form.boy] ?? null, uzunKesilir: uzun?.deger ?? true, kaynak: uzun?.kaynak ?? null } : null,
    yuzey: { istenen: k.yuzey, serbest: yuzey?.deger ?? false, kaynak: yuzey?.kaynak ?? null },
  };
}

type Adim = 'ayni' | 'icinde' | 'sartli' | 'disi';
const SONUC_SIRASI: Readonly<Record<Adim, number>> = { ayni: 0, icinde: 1, sartli: 2, disi: 3 };

function muadilAdimi(acik: boolean, sartliAcik: boolean, istenen: string | null, aday: string | null,
  secenekler: AlternatifZarfi['kalite']['secenekler'], ad: string): { adim: Adim; neden: string | null } {
  if (istenen === null || aday === istenen) return { adim: 'ayni', neden: null };
  if (aday === null) return { adim: 'disi', neden: `${ad} yok` };
  if (!acik) return { adim: 'disi', neden: `${ad} yalnız ${istenen}` };
  const m = secenekler.find((s) => s.deger === aday);
  if (!m) return { adim: 'disi', neden: `${ad} ${aday} muadil değil` };
  if (m.tur === 'sartli') return { adim: sartliAcik ? 'icinde' : 'sartli', neden: `${ad} ${aday} şartlı muadil` };
  return { adim: 'icinde', neden: `${ad} ${aday} ${m.tur === 'tam' ? 'tam' : 'üst'} muadil` };
}

function olcuAdimi(z: AlternatifZarfi, aday: ZarfKarti): { adim: Adim; nedenler: string[] } {
  if (z.olcu.length === 0) return { adim: 'ayni', nedenler: [] };
  const n: string[] = [];
  let adim: Adim = 'ayni';
  const lamaBlok = z.form === 'lama' || z.form === 'blok';
  const ciftler: [string, number, number, number][] = [];
  if (lamaBlok) {
    const iv = [...z.olcu].sort((x, y) => y.istenen - x.istenen);
    const av = z.olcu.map((o) => aday.olcu[o.anahtar]);
    if (av.some((v) => v === undefined)) return { adim: 'disi', nedenler: ['Ölçü eksik'] };
    const as = (av as number[]).sort((x, y) => y - x);
    iv.forEach((o, i) => ciftler.push([o.anahtar, o.istenen, o.enCok, as[i]!]));
  } else {
    for (const o of z.olcu) {
      const v = aday.olcu[o.anahtar];
      if (v === undefined) return { adim: 'disi', nedenler: ['Ölçü eksik'] };
      ciftler.push([o.anahtar, o.istenen, o.enCok, v]);
    }
  }
  for (const [a, ist, enCok, v] of ciftler) {
    if (z.form === 'boru' && a === 't') continue;
    if (v + AYNI < ist) return { adim: 'disi', nedenler: [`${a} ${v} < ${ist}`] };
    if (v > enCok + AYNI) return { adim: 'disi', nedenler: [`${a} +${yuvarla(v - ist)} mm pay dışı`] };
    if (v > ist + AYNI) { adim = 'icinde'; n.push(`${a} +${yuvarla(v - ist)} mm`); }
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
  const ka = muadilAdimi(z.kalite.acik, z.sartliAcik, z.kalite.istenen, aday.kalite, z.kalite.secenekler, 'Kalite');
  isle(ka.adim, ka.neden);
  const du = muadilAdimi(z.durum.acik, z.sartliAcik, z.durum.istenen, aday.durum, z.durum.secenekler, 'Durum');
  isle(du.adim, du.neden);
  const o = olcuAdimi(z, aday);
  o.nedenler.forEach((x) => nedenler.push(x));
  if (SONUC_SIRASI[o.adim] > SONUC_SIRASI[en]) en = o.adim;
  if (z.boy && z.boy.istenen !== null) {
    const v = aday.olcu[z.boy.anahtar];
    if (v !== undefined && Math.abs(v - z.boy.istenen) > AYNI) {
      if (v < z.boy.istenen) isle('disi', 'Boy kısa');
      else isle(z.boy.uzunKesilir ? 'icinde' : 'disi', z.boy.uzunKesilir ? 'Uzun boy, kesilir' : 'Boy farklı');
    }
  }
  if (z.yuzey.istenen !== null && aday.yuzey !== z.yuzey.istenen) isle(z.yuzey.serbest ? 'icinde' : 'disi', `Yüzey ${aday.yuzey ?? 'yok'}`);
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
export interface AlternatifNitelikleri { kalite: string | null; durum: string | null; yuzey: string | null; olcu: Record<string, number> }
const sayi = (v: number): string => v.toLocaleString('tr-TR');
// Ailede alternatifin etiketi: istenenden farklı nitelikler ("6262 T651 d 52 mm"); ölçü biçimi Taleplerim'deki şartlı alternatifle aynı.
export const alternatifEtiketi = (a: AlternatifNitelikleri): string =>
  [a.kalite, a.durum, a.yuzey, ...Object.entries(a.olcu).sort(([x], [y]) => (x < y ? -1 : 1)).map(([k, v]) => `${k} ${sayi(v)} mm`)]
    .filter((x): x is string => !!x).join(' ').slice(0, 60) || 'alternatif';
const AD_EN_COK = 200;
// Ad sınırında ana ad kesilmez, etiket kısalır (ana ad tek başına sınırı aşıyorsa yalnız o kalır).
export const alternatifKartAdi = (anaAd: string, etiket: string): string => {
  const kalan = AD_EN_COK - anaAd.length - ' (alternatif )'.length;
  if (kalan <= 0) return anaAd.slice(0, AD_EN_COK);
  return `${anaAd} (alternatif ${etiket.slice(0, kalan).trim()})`.trim();
};
