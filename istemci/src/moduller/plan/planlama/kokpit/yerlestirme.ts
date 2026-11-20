import { fasonMu, ilkBosluk, tasimaSaati, tasinabilir, type AdimSecimi, type EmirDurumu, type KokpitAdimi, type KokpitEmri, type KokpitModeli } from './kurallar.ts';

// Kokpit'in yukarıdan aşağı düzeninin saf kuralları (3297): üstte sıra kartları, altında seçilen kartın emirleri ve adımları, en altta
// tezgâhlar. Kart müşteri siparişidir (3297-5 a): aynı siparişin bütün emirleri tek kartta toplanır. Siparişe bağlı olmayan emrin kartı kök
// emirdir: çok katmanlı emrin düğümleri ("<emir>-Y<n>") ve parçaları ("<emir>/<n>") kökünün kartında toplanır.

export const kokKimligi = (id: string): string => (/^(.*?)(?:-Y\d+)*(?:\/\d+)?$/.exec(id)?.[1] ?? id) || id;

// Partiye bölünen emrin partisi planda kendi kimliğiyle gelir (sunucudaki ayrı emir), kimliğinde "/<n>" yoktur; kökünü yalnız numarası
// ("<kök no>/<n>") söyler. Çözücü kimliği önce numarayla kök emrin kimliğine, bulamazsa kimliğin kendi köküne indirir.
export type KokCozucu = (id: string) => string;
const partiNo = (no: string): number | null => { const p = /\/(\d+)$/.exec(no); return p ? Number(p[1]) : null; };
export function kokCozucu(emirler: readonly Pick<KokpitEmri, 'id' | 'no'>[]): KokCozucu {
  const noIle = new Map(emirler.map((e) => [e.no, e.id]));
  // Kök emir modelde yoksa (bitti ya da plana gelmedi) kardeş partiler en küçük numaralısının kimliğinde toplanır.
  const kardes = new Map<string, string>();
  for (const e of [...emirler].sort((x, y) => (partiNo(x.no) ?? 0) - (partiNo(y.no) ?? 0))) {
    const kokNo = partiNo(e.no) === null ? null : e.no.replace(/\/\d+$/, '');
    if (kokNo !== null && !kardes.has(kokNo)) kardes.set(kokNo, noIle.get(kokNo) ?? e.id);
  }
  const kok = new Map<string, string>();
  for (const e of emirler) {
    const k = partiNo(e.no) === null ? undefined : kardes.get(e.no.replace(/\/\d+$/, ''));
    if (k !== undefined && k !== e.id) kok.set(e.id, k);
  }
  // Partinin partisi ("<kök>/1/2") üst partisinin köküne iner.
  return (id) => { let k = id; for (let i = 0; i < 16 && kok.has(k); i++) k = kok.get(k)!; return kokKimligi(k); };
}

// Emrin sipariş bağı (sunucudan, kök emir kimliğiyle): `siparis` gruplama anahtarıdır; no ve müşteri siparişi okuyamayan kişide null gelir.
export interface SiparisBagi { siparis: string; no: string | null; musteri: string | null; kalem: number | null }
export type SiparisBaglari = Readonly<Record<string, SiparisBagi>>;
// Kartın anahtarı: emir siparişe bağlıysa sipariş, değilse kök emir. Sipariş anahtarı emir kimliğiyle çakışmasın diye ön eklidir.
export const kartAnahtari = (id: string, bag?: SiparisBaglari | null, kokBul: KokCozucu = kokKimligi): string => {
  const kok = kokBul(id), b = bag?.[kok] ?? bag?.[id];
  return b ? `sp:${b.siparis}` : kok;
};

const AGIRLIK: Record<EmirDurumu, number> = { gec: 0, risk: 1, plansiz: 2, iyi: 3 };

export interface SiraKarti {
  // Kartın anahtarı (kartAnahtari): sipariş kartında "sp:<sipariş>", emir kartında kök emir kimliği.
  kok: string;
  // Sipariş kartında siparişin no ve müşterisi (okuyamayan kişide null); emir kartında null.
  siparis: { no: string | null; musteri: string | null } | null;
  // Kartın emirleri. Emir kartında kök başta, düğümler ve parçalar modeldeki sırasıyla. Sipariş kartında her kök kendi düğümleriyle;
  // yerleşmesi eksik kökler önce, sonra termine göre (sipariş çok emirliyse iş bekleyen emir aranmasın).
  emirler: KokpitEmri[];
  // Emir kartında kökün terminidir; kök modelde yoksa (yalnız düğümü kaldıysa) emirlerin en erkeni. Sipariş kartında emirlerin en erkeni.
  // Hiçbirinde yoksa null.
  termin: number | null;
  // Tezgâhta yapılan (fason olmayan) adım sayısı ve planda yeri olanlar.
  adim: number; yerlesen: number;
  // En ağır emrin durumu (geç, riskli, plansız, iyi).
  durum: EmirDurumu;
}

const tezgahAdimi = (a: KokpitAdimi): boolean => !a.adaylar.every(fasonMu);

const SONSUZ = Number.POSITIVE_INFINITY;
const enErken = (l: readonly KokpitEmri[]): number | null => {
  const t = l.flatMap((e) => (e.termin === null ? [] : [e.termin]));
  return t.length > 0 ? Math.min(...t) : null;
};

export function siraKartlari(m: Pick<KokpitModeli, 'emirler' | 'isler'>, bag: SiparisBaglari | null = null): SiraKarti[] {
  const kokBul = kokCozucu(m.emirler);
  const grup = new Map<string, KokpitEmri[]>();
  for (const e of m.emirler) {
    const k = kartAnahtari(e.id, bag, kokBul);
    const l = grup.get(k);
    if (l) l.push(e); else grup.set(k, [e]);
  }
  const eksik = (l: readonly KokpitEmri[]): boolean => l.some((e) => e.adimlar.some((a) => tezgahAdimi(a) && m.isler[a.id] === undefined));
  const kartlar = [...grup].map(([kok, l]): SiraKarti => {
    const b = bag?.[kokBul(l[0]?.id ?? '')] ?? bag?.[l[0]?.id ?? ''] ?? null;
    // Emirler köklerine göre öbeklenir: kök başta, düğümleri ardında, partileri numara sırasıyla (/2, /10'dan önce).
    const kokler = new Map<string, KokpitEmri[]>();
    for (const e of l) { const k = kokBul(e.id), o = kokler.get(k); if (o) o.push(e); else kokler.set(k, [e]); }
    const obekler = [...kokler].map(([k, o]) => [...o].sort((x, y) => Number(y.id === k) - Number(x.id === k) || (partiNo(x.no) ?? 0) - (partiNo(y.no) ?? 0)));
    if (b) obekler.sort((x, y) => Number(eksik(y)) - Number(eksik(x)) || (enErken(x) ?? SONSUZ) - (enErken(y) ?? SONSUZ));
    const emirler = obekler.flat();
    const kokEmri = b ? undefined : emirler.find((e) => e.id === kok);
    const adimlar = emirler.flatMap((e) => e.adimlar.filter(tezgahAdimi));
    return {
      kok, emirler, siparis: b ? { no: b.no, musteri: b.musteri } : null,
      termin: kokEmri ? kokEmri.termin : enErken(emirler),
      adim: adimlar.length, yerlesen: adimlar.filter((a) => m.isler[a.id] !== undefined).length,
      durum: emirler.reduce<EmirDurumu>((d, e) => (AGIRLIK[e.durum] < AGIRLIK[d] ? e.durum : d), 'iyi'),
    };
  });
  // Sıra termine göredir, terminsiz sonda; aynı terminde sorunlu olan önce. Sıralama kararlıdır: eşitlikte modeldeki sıra kalır.
  return kartlar.sort((a, b) => (a.termin ?? SONSUZ) - (b.termin ?? SONSUZ) || AGIRLIK[a.durum] - AGIRLIK[b.durum]);
}

// Arama sipariş no ve müşteri adıyla da bulur: emrin siparişi aranan metni taşıyorsa emir görünür kalır.
export function siparisAramasi(id: string, bag: SiparisBaglari | null, ara: string): boolean {
  const q = ara.trim().toLocaleLowerCase('tr-TR'), b = bag?.[kokKimligi(id)] ?? bag?.[id];
  return q !== '' && b !== undefined && `${b.no ?? ''} ${b.musteri ?? ''}`.toLocaleLowerCase('tr-TR').includes(q);
}

// Açılışta seçilen kart: yerleşmemiş adımı olan ilk kart (yeni gelen iş), yoksa ilk kart.
export const ilkKart = (l: readonly SiraKarti[]): string | null => (l.find((k) => k.yerlesen < k.adim) ?? l[0])?.kok ?? null;

export type AdimYeri = 'yerli' | 'secili' | 'bos' | 'fason';
// Adımın çipi: planda yeri varsa dolu, plansız emirde kişi tezgâh seçtiyse seçili, değilse boş. Fason adımı sistem yerleştirir.
export function adimYeri(m: Pick<KokpitModeli, 'isler'>, a: KokpitAdimi, sec: Readonly<Record<string, AdimSecimi>>): AdimYeri {
  if (m.isler[a.id] !== undefined) return 'yerli';
  if (!tezgahAdimi(a)) return 'fason';
  return sec[a.id]?.tezgah !== undefined ? 'secili' : 'bos';
}

// Plansız emirde sıradaki adım: tezgâhı seçilmemiş ilk tezgâh adımı. Hepsi seçildiyse null (emir taslağa yazılabilir).
export function siradakiAdim(m: Pick<KokpitModeli, 'isler'>, e: Pick<KokpitEmri, 'adimlar'>, sec: Readonly<Record<string, AdimSecimi>>): string | null {
  return e.adimlar.find((a) => adimYeri(m, a, sec) === 'bos')?.id ?? null;
}

// Seçilen adımı yapabilen tezgâhlar (tahtada işaretlenir); fason adayı tezgâh değildir.
export const uygunTezgahlar = (e: Pick<KokpitEmri, 'adimlar'>, adimId: string | null): string[] =>
  e.adimlar.find((a) => a.id === adimId)?.adaylar.filter((t) => !fasonMu(t)) ?? [];

export interface BosYer { adimId: string; tezgah: string; S: number; C: number; enErken: boolean }
// Bir adımın boş yer adayları: her aday tezgâh için sunucu önizlemesinin o adıma verdiği yer. Geçersiz ya da okunamayan önizleme aday
// vermez. En erken biten başta ve işaretli; eşitlikte adayların rota sırası kalır.
export function bosYerler(
  adimId: string,
  onizlemeler: readonly { tezgah: string; gecerli: boolean; isler: readonly { isId: string; tezgah: string; S: number; C: number }[] }[],
): BosYer[] {
  const l = onizlemeler.flatMap((o) => {
    const y = o.gecerli ? o.isler.find((x) => x.isId === adimId && x.tezgah === o.tezgah) : undefined;
    return y ? [{ adimId, tezgah: o.tezgah, S: y.S, C: y.C, enErken: false }] : [];
  }).sort((a, b) => a.C - b.C);
  return l.map((y, i) => ({ ...y, enErken: i === 0 }));
}

// Planlı adımın taşınabileceği yer adayları (3297-4): her aday tezgâhta, rotadaki önceki adımlar bittikten sonra adımın süresine yeten
// ilk boşluk. Adımın bugünkü yeri aday değildir. Yeri ve itilen adımları sunucu önizlemesi denetler; burada yalnız sorulacak yerler seçilir.
export function tasimaAdaylari(m: KokpitModeli, e: Pick<KokpitEmri, 'adimlar'>, isId: string, enCok: number): { tezgah: string; baslangic: number }[] {
  const x = m.isler[isId], k = e.adimlar.findIndex((a) => a.id === isId);
  if (!x || k < 0 || tasinabilir(x) !== null) return [];
  const onceki = e.adimlar.slice(0, k).reduce((t, a) => Math.max(t, m.isler[a.id]?.C ?? t), m.simdi);
  return uygunTezgahlar(e, isId).slice(0, enCok)
    .map((tezgah) => ({ tezgah, baslangic: tasimaSaati(ilkBosluk(m, tezgah, x.C - x.S, onceki, x.id), m.simdi) }))
    .filter((a) => a.tezgah !== x.m || Math.abs(a.baslangic - x.S) > 0.25);
}
