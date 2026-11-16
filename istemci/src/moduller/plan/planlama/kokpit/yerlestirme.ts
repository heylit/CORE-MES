import { fasonMu, ilkBosluk, tasimaSaati, tasinabilir, type AdimSecimi, type EmirDurumu, type KokpitAdimi, type KokpitEmri, type KokpitModeli } from './kurallar.ts';

// Kokpit'in yukarıdan aşağı düzeninin saf kuralları (3297): üstte sıra kartları, altında seçilen kartın emirleri ve adımları, en altta
// tezgâhlar. Kart kök emirdir: çok katmanlı emrin düğümleri ("<emir>-Y<n>") ve parçaları ("<emir>/<n>") kökünün kartında toplanır.

export const kokKimligi = (id: string): string => (/^(.*?)(?:-Y\d+)*(?:\/\d+)?$/.exec(id)?.[1] ?? id) || id;

const AGIRLIK: Record<EmirDurumu, number> = { gec: 0, risk: 1, plansiz: 2, iyi: 3 };

export interface SiraKarti {
  kok: string;
  // Kartın emirleri: kök başta, düğümler ve parçalar modeldeki sırasıyla.
  emirler: KokpitEmri[];
  // Kartın termini kökün terminidir; kök modelde yoksa (yalnız düğümü kaldıysa) emirlerin en erkeni. Hiçbirinde yoksa null.
  termin: number | null;
  // Tezgâhta yapılan (fason olmayan) adım sayısı ve planda yeri olanlar.
  adim: number; yerlesen: number;
  // En ağır emrin durumu (geç, riskli, plansız, iyi).
  durum: EmirDurumu;
}

const tezgahAdimi = (a: KokpitAdimi): boolean => !a.adaylar.every(fasonMu);

export function siraKartlari(m: Pick<KokpitModeli, 'emirler' | 'isler'>): SiraKarti[] {
  const grup = new Map<string, KokpitEmri[]>();
  for (const e of m.emirler) {
    const k = kokKimligi(e.id);
    const l = grup.get(k);
    if (l) l.push(e); else grup.set(k, [e]);
  }
  const kartlar = [...grup].map(([kok, l]): SiraKarti => {
    const emirler = [...l].sort((a, b) => Number(b.id === kok) - Number(a.id === kok));
    const kokEmri = emirler.find((e) => e.id === kok);
    const terminler = emirler.flatMap((e) => (e.termin === null ? [] : [e.termin]));
    const adimlar = emirler.flatMap((e) => e.adimlar.filter(tezgahAdimi));
    return {
      kok, emirler,
      termin: kokEmri ? kokEmri.termin : terminler.length > 0 ? Math.min(...terminler) : null,
      adim: adimlar.length, yerlesen: adimlar.filter((a) => m.isler[a.id] !== undefined).length,
      durum: emirler.reduce<EmirDurumu>((d, e) => (AGIRLIK[e.durum] < AGIRLIK[d] ? e.durum : d), 'iyi'),
    };
  });
  // Sıra termine göredir, terminsiz sonda; aynı terminde sorunlu olan önce. Sıralama kararlıdır: eşitlikte modeldeki sıra kalır.
  return kartlar.sort((a, b) => (a.termin ?? Number.POSITIVE_INFINITY) - (b.termin ?? Number.POSITIVE_INFINITY) || AGIRLIK[a.durum] - AGIRLIK[b.durum]);
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
