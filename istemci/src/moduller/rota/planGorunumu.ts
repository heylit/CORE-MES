import type { PlanCevabi, PlanEmri, PlanKaynagi, PlanYerlesimi } from '#paylasilan/sozlesme/plan.ts';
import { tesisGunBasi, tesisGunu } from '#paylasilan/tesis-zamani.ts';

// Plan çizelgesi ve matrisinin saf kuralları: doluluk eşiği, aralık penceresi, süzgeç, vurgu durumu ve toplamlar.
// Hepsi /plan cevabındaki veriden hesaplanır; cevapta olmayan değer uydurulmaz.

export const GUN_MS = 86_400_000;
export const ONCELIK_ADI: Record<number, string> = { 1: 'Acil', 2: 'Yüksek', 3: 'Normal', 4: 'Düşük' };

// Doluluk eşikleri tek yerdedir: istasyon, personel ve makine/kişi matrisleri aynı sınıflara bölünür.
export const YUK_ESIKLERI = { orta: 0.5, yuksek: 0.85, tam: 1 } as const;
export type YukSinifi = 0 | 1 | 2 | 3 | 4;

export function yukSinifi(oran: number): YukSinifi {
  if (oran <= 0) return 0;
  if (oran < YUK_ESIKLERI.orta) return 1;
  if (oran < YUK_ESIKLERI.yuksek) return 2;
  return oran <= YUK_ESIKLERI.tam + 0.0001 ? 3 : 4;
}

const yuzde = (o: number): string => `%${Math.round(o * 100)}`;
export const YUK_EFSANESI: readonly { sinif: YukSinifi; ad: string; aralik: string }[] = [
  { sinif: 0, ad: 'Boş', aralik: '%0' },
  { sinif: 1, ad: 'Düşük', aralik: `%0-${yuzde(YUK_ESIKLERI.orta).slice(1)}` },
  { sinif: 2, ad: 'Orta', aralik: `${yuzde(YUK_ESIKLERI.orta)}-${yuzde(YUK_ESIKLERI.yuksek).slice(1)}` },
  { sinif: 3, ad: 'Dolu', aralik: `${yuzde(YUK_ESIKLERI.yuksek)}-${yuzde(YUK_ESIKLERI.tam).slice(1)}` },
  { sinif: 4, ad: 'Aşırı', aralik: `${yuzde(YUK_ESIKLERI.tam)} üstü` },
];

export interface Hucre { dolu: number; kapasite: number }
// Ortalama kapasite ağırlıklıdır (toplam dolu / toplam kapasite); kapasite yoksa oran yoktur, sıfır uydurulmaz.
export function toplamla(hucreler: readonly Hucre[]): Hucre & { oran: number | null } {
  const dolu = hucreler.reduce((t, h) => t + h.dolu, 0);
  const kapasite = hucreler.reduce((t, h) => t + h.kapasite, 0);
  return { dolu, kapasite, oran: kapasite > 0 ? dolu / kapasite : null };
}

// Pencere

export const ARALIK_HAFTALARI = [1, 2, 4] as const;
export type AralikHaftasi = (typeof ARALIK_HAFTALARI)[number];

export interface Pencere { kaydirma: number; gun: number; gunler: string[]; baslangic: number; bitis: number }

const birinciGun = (p: Pick<PlanCevabi, 'gunler' | 'simdi'>): string => p.gunler[0] ?? tesisGunu(Date.parse(p.simdi));

// Plan gününden n gün sonrası; cevabın ufkunun dışındaki günlerin tarihi takvimden gelir, yükü yoktur.
export function gunTarihi(p: Pick<PlanCevabi, 'gunler' | 'simdi'>, n: number): string {
  return p.gunler[n] ?? tesisGunu(tesisGunBasi(birinciGun(p)) + n * GUN_MS + GUN_MS / 2);
}

export function pencereKur(p: Pick<PlanCevabi, 'gunler' | 'simdi'>, hafta: AralikHaftasi, kaydirma: number): Pencere {
  const gun = hafta * 7;
  const gunler = Array.from({ length: gun }, (_, i) => gunTarihi(p, kaydirma + i));
  return { kaydirma, gun, gunler, baslangic: tesisGunBasi(gunler[0]!), bitis: tesisGunBasi(gunTarihi(p, kaydirma + gun)) };
}

// Gezinme sınırı veriye bağlıdır: planın ufku ile yerleşimlerin ilk ve son günü arası.
export function gezinmeSiniri(p: Pick<PlanCevabi, 'gunler' | 'simdi' | 'yerlesimler'>): { ilk: number; son: number } {
  const g0 = tesisGunBasi(birinciGun(p));
  const gunNo = (ms: number) => Math.floor((ms - g0) / GUN_MS);
  let ilk = 0;
  let son = Math.max(0, p.gunler.length - 1);
  for (const y of p.yerlesimler) {
    ilk = Math.min(ilk, gunNo(Date.parse(y.baslangic)));
    son = Math.max(son, gunNo(Date.parse(y.bitis) - 1));
  }
  return { ilk, son };
}

export function gezinebilir(p: Pick<PlanCevabi, 'gunler' | 'simdi' | 'yerlesimler'>, hafta: AralikHaftasi, kaydirma: number): { geri: boolean; ileri: boolean } {
  const { ilk, son } = gezinmeSiniri(p);
  return { geri: kaydirma > ilk, ileri: kaydirma + hafta * 7 <= son };
}

// yon: -1 geri, 1 ileri; sınır dışına çıkmaz. Aralık değişince de aynı kuralla sınır içine alınır.
export function kaydir(p: Pick<PlanCevabi, 'gunler' | 'simdi' | 'yerlesimler'>, hafta: AralikHaftasi, kaydirma: number, yon: -1 | 0 | 1): number {
  const { ilk, son } = gezinmeSiniri(p);
  const sinirli = Math.min(Math.max(kaydirma, ilk), Math.max(ilk, son));
  if (yon === 1) return sinirli + hafta * 7 <= son ? sinirli + hafta * 7 : sinirli;
  return yon === -1 ? Math.max(ilk, sinirli - hafta * 7) : sinirli;
}

// Gün n için /plan'ın istasyon ve personel dizisindeki sıra; ufkun dışında null (orada veri yok).
export const ufukSirasi = (p: Pick<PlanCevabi, 'gunler'>, tarih: string): number | null => {
  const i = p.gunler.indexOf(tarih);
  return i < 0 ? null : i;
};

export function gunAraligi(tarih: string): { baslangic: number; bitis: number } {
  const baslangic = tesisGunBasi(tarih);
  return { baslangic, bitis: tesisGunBasi(tesisGunu(baslangic + GUN_MS * 1.5)) };
}

export const gundeMi = (y: Pick<PlanYerlesimi, 'baslangic' | 'bitis'>, tarih: string): boolean => {
  const a = gunAraligi(tarih);
  return Date.parse(y.baslangic) < a.bitis && Date.parse(y.bitis) > a.baslangic;
};

export function gunDakikasi(y: Pick<PlanYerlesimi, 'baslangic' | 'bitis'>, tarih: string): number {
  const a = gunAraligi(tarih);
  return Math.max(0, Math.min(Date.parse(y.bitis), a.bitis) - Math.max(Date.parse(y.baslangic), a.baslangic)) / 60_000;
}

export const gunDakikasiToplami = (yerlesimler: readonly PlanYerlesimi[], tarih: string): Hucre => {
  const a = gunAraligi(tarih);
  return { dolu: Math.min((a.bitis - a.baslangic) / 60_000, yerlesimler.reduce((t, y) => t + gunDakikasi(y, tarih), 0)), kapasite: (a.bitis - a.baslangic) / 60_000 };
};

// Süzgeç

export interface Suzgec { arama: string; istasyonId: number | null }
export const BOS_SUZGEC: Suzgec = { arama: '', istasyonId: null };

const kucuk = (s: string): string => s.toLocaleLowerCase('tr-TR').trim();
export function aramaUyar(arama: string, ...alanlar: (string | null)[]): boolean {
  const a = kucuk(arama);
  return a === '' || alanlar.some((x) => x !== null && kucuk(x).includes(a));
}
const kaynakAnahtar = (k: { tur: string; id: number }): string => `${k.tur}:${k.id}`;
export const istasyonuOlan = (k: PlanKaynagi): number | null => k.istasyon?.id ?? null;

export function istasyonSecenekleri(p: Pick<PlanCevabi, 'kaynaklar' | 'istasyonYuku'>): { id: number; etiket: string }[] {
  const harita = new Map<number, string>();
  for (const k of p.kaynaklar) if (k.istasyon) harita.set(k.istasyon.id, `${k.istasyon.kod} ${k.istasyon.ad}`);
  for (const s of p.istasyonYuku) harita.set(s.istasyonId, `${s.kod} ${s.ad}`);
  return [...harita].map(([id, etiket]) => ({ id, etiket })).sort((a, b) => a.etiket.localeCompare(b.etiket, 'tr'));
}

type Plan = Pick<PlanCevabi, 'kaynaklar' | 'yerlesimler' | 'emirler'>;

export function gorunenYerlesimler(p: Plan, s: Suzgec): PlanYerlesimi[] {
  const kaynakIstasyon = new Map(p.kaynaklar.map((k) => [kaynakAnahtar(k), istasyonuOlan(k)]));
  return p.yerlesimler.filter((y) => aramaUyar(s.arama, y.emirNo, y.urunKodu, y.urunAdi)
    && (s.istasyonId === null || kaynakIstasyon.get(kaynakAnahtar(y.kaynak)) === s.istasyonId));
}

// Arama varken işi olmayan kaynak satırı gizlenir; yoksa yalnız istasyon süzgeci uygulanır.
export function gorunenKaynaklar(p: Plan, s: Suzgec): PlanKaynagi[] {
  const isli = new Set(gorunenYerlesimler(p, s).map((y) => kaynakAnahtar(y.kaynak)));
  return p.kaynaklar.filter((k) => (s.istasyonId === null || istasyonuOlan(k) === s.istasyonId) && (kucuk(s.arama) === '' || isli.has(kaynakAnahtar(k))));
}

// İstasyon süzgeci emri, o istasyonda işi olan emir olarak bırakır.
export function gorunenEmirler(p: Plan, s: Suzgec): PlanEmri[] {
  const istasyondakiler = new Set(gorunenYerlesimler(p, { arama: '', istasyonId: s.istasyonId }).map((y) => y.uretimEmriId));
  return p.emirler.filter((e) => aramaUyar(s.arama, e.emirNo, e.urunKodu, e.urunAdi) && (s.istasyonId === null || istasyondakiler.has(e.uretimEmriId)));
}

// Kaynakları istasyona göre gruplar: istasyonu olmayanlar (kişiler) sonda ayrı grupta.
export interface KaynakGrubu { anahtar: string; baslik: string; kaynaklar: PlanKaynagi[] }
export function kaynakGruplari(kaynaklar: readonly PlanKaynagi[]): KaynakGrubu[] {
  const gruplar = new Map<string, KaynakGrubu>();
  for (const k of kaynaklar) {
    const anahtar = k.istasyon ? `istasyon:${k.istasyon.id}` : 'yok';
    const g = gruplar.get(anahtar) ?? { anahtar, baslik: k.istasyon ? `${k.istasyon.kod} ${k.istasyon.ad}` : 'İstasyonu olmayan', kaynaklar: [] };
    g.kaynaklar.push(k);
    gruplar.set(anahtar, g);
  }
  return [...gruplar.values()].sort((a, b) => (a.anahtar === 'yok' ? 1 : b.anahtar === 'yok' ? -1 : a.baslik.localeCompare(b.baslik, 'tr')));
}

// Vurgu

export type IsDurumu = 'gec' | 'uyari' | 'normal';
// Geciken: iş emrinin teslim gününden sonra bitiyor; uyarılı: sunucu uyarı yazmış. Yeşil hiçbirine verilmez.
export function yerlesimDurumu(y: Pick<PlanYerlesimi, 'teslim' | 'bitis' | 'uyarilar'>): IsDurumu {
  if (y.teslim !== null && tesisGunu(Date.parse(y.bitis) - 1) > y.teslim) return 'gec';
  return y.uyarilar.length > 0 ? 'uyari' : 'normal';
}
// Emir geciktiyse geciken; yerleşemediyse ya da işlerinden biri uyarılı ya da geciken ise uyarılı.
export function emirDurumu(e: Pick<PlanEmri, 'tamponGun' | 'engelli'>, isleri: readonly Pick<PlanYerlesimi, 'teslim' | 'bitis' | 'uyarilar'>[] = []): IsDurumu {
  if (e.tamponGun !== null && e.tamponGun < 0) return 'gec';
  return e.engelli || isleri.some((y) => yerlesimDurumu(y) !== 'normal') ? 'uyari' : 'normal';
}

// Sunucu yerleşemeyen işi hem yerlesmemis listesinde hem uyarıda yazar; uyarı listesinde yinelenmesin.
export function yerlesmeyenDisindakiUyarilar(p: Pick<PlanCevabi, 'uyarilar' | 'yerlesmemis'>): string[] {
  const oneklar = p.yerlesmemis.map((x) => `${x.emirNo} OP ${x.opNo}: yerleşmedi`);
  return p.uyarilar.filter((u) => !oneklar.some((o) => u.startsWith(o)));
}
export const DURUM_ADI: Record<IsDurumu, string> = { gec: 'Gecikiyor', uyari: 'Uyarılı', normal: 'Normal' };
export const durumSinifi = (d: IsDurumu): string => (d === 'normal' ? '' : ` tc-g-durum-${d}`);

// Komut sonucu: önceki ve sonraki plan karşılaştırılır; önceki yoksa (önbellekte değilse) yalnız sonraki plandan söylenebilenler yazılır.
type SonucPlani = Pick<PlanCevabi, 'yerlesimler' | 'yerlesmemis' | 'gostergeler'>;
export interface PlanSonucu { yerDegisen: number; yeniYerlesen: number; yerlesmemis: number; yerlesmemisFarki: number | null; geciken: number; gecikenFarki: number | null }

// Önceki planda yerleşik olup sonrakinde yerleşmeyen iş de yer değiştirmiş sayılır.
export function planSonucu(once: SonucPlani | undefined, sonra: SonucPlani): PlanSonucu {
  const eski = new Map((once?.yerlesimler ?? []).map((y) => [y.isEmriId, y]));
  const yeni = new Set(sonra.yerlesimler.map((y) => y.isEmriId));
  let yerDegisen = once ? [...eski.keys()].filter((id) => !yeni.has(id)).length : 0;
  let yeniYerlesen = 0;
  for (const y of sonra.yerlesimler) {
    const o = eski.get(y.isEmriId);
    if (!o) { if (once) yeniYerlesen += 1; continue; }
    if (o.baslangic !== y.baslangic || o.kaynak.tur !== y.kaynak.tur || o.kaynak.id !== y.kaynak.id) yerDegisen += 1;
  }
  return {
    yerDegisen, yeniYerlesen, yerlesmemis: sonra.yerlesmemis.length, geciken: sonra.gostergeler.geciken,
    yerlesmemisFarki: once ? sonra.yerlesmemis.length - once.yerlesmemis.length : null,
    gecikenFarki: once ? sonra.gostergeler.geciken - once.gostergeler.geciken : null,
  };
}

const farkMetni = (f: number | null): string => (f === null || f === 0 ? '' : ` (öncekine göre ${f > 0 ? '+' : '-'}${Math.abs(f)})`);

export function sonucMetni(s: PlanSonucu, onceVar: boolean): string {
  const parcalar: string[] = [];
  if (onceVar) parcalar.push(s.yerDegisen === 0 ? 'Hiçbir işin yeri değişmedi' : `${s.yerDegisen} iş yer değiştirdi`);
  if (s.yeniYerlesen > 0) parcalar.push(`${s.yeniYerlesen} iş yeni yerleşti`);
  if (s.yerlesmemis > 0) parcalar.push(`${s.yerlesmemis} iş yerleşmedi${farkMetni(s.yerlesmemisFarki)}`);
  parcalar.push(s.geciken === 0 ? `gecikme yok${farkMetni(s.gecikenFarki)}` : `${s.geciken} emir gecikiyor${farkMetni(s.gecikenFarki)}`);
  const metin = parcalar.join(', ');
  return `${metin.charAt(0).toLocaleUpperCase('tr-TR')}${metin.slice(1)}.`;
}
