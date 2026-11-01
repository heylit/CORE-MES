import { GUN_ADLARI, type Dilim, type GunAdi, type MotorDevamsizligi, type MotorKisisi, type MotorTezgahi, type MotorVardiyasi, type MotorVerisi } from './tipler.ts';

// Kaynak dilimi (1716): takvim, tezgâh ve kişi. Saf: okuma (kaynaklar.ts) sahibi modüllerden gelir, elle veri açık çalışmadandır. Kurallar
// eski yolunkiyle (motor/girdi.betik tmiKaynakIle, rrCevir, tmiOperatorOrani, tmiDevamsizlik) aynıdır; eşdeğerliği kaynaklar.test.ts ve
// kaynaklar-vt.test.ts sınar. Sayı kimlikler motorun diline metin olarak geçer.

export const KAYNAK_ALANLARI = ['vardiyalar', 'calismaGunleri', 'tatiller', 'tezgahlar', 'personel', 'devamsizlik'] as const;
export type KaynakAlani = (typeof KAYNAK_ALANLARI)[number];

// Haftanın günü: 0 pazar ... 6 cumartesi (Vardiya'nın matrisinde 7 pazar, okuma 0'a çevirir).
export type HaftaGunu = 0 | 1 | 2 | 3 | 4 | 5 | 6;
const GUN_SIRASI: Readonly<Record<GunAdi, HaftaGunu>> = { pzt: 1, sal: 2, car: 3, per: 4, cum: 5, cmt: 6, paz: 0 };

export interface KaynakDilimiOkumasi {
  // Aktif vardiyalar, Vardiya'nın sırasıyla.
  vardiyalar: { id: number; bas: string; bit: string; molalar: { bas: string; bit: string }[] }[];
  tatiller: string[];
  // İstasyon okunamazsa (yetki yok) null.
  istasyon: {
    merkezler: { id: number }[];
    istasyonlar: { id: number; merkezId: number | null; verimYuzde: number | null; operatorOrani: number | null }[];
    makineler: { id: number; ad: string; istasyonId: number | null }[];
  } | null;
  // İş merkezi haftası ve kişinin vardiyası; okunmadıysa null (takvim bilinmez).
  takvim: { hafta: { merkezId: number; gun: HaftaGunu; vardiyaId: number }[]; kisiVardiyasi: { kisiId: number; vardiyaId: number }[] } | null;
  // İstasyonun TL saat maliyeti; satırı olmayan ya da TL olmayan istasyon yoktur. Maliyet okunamazsa null.
  istasyonMaliyeti: ReadonlyMap<number, number> | null;
  // Aktif kişiler; kişi okunamazsa null. Yetkinlik, makine ve sınır istasyon okunamazsa boştur.
  kisiler: { id: number; ad: string; gorev: string | null; yetkinlikler: number[]; makineler: number[]; enCok: number | null }[] | null;
  // Onaylı izinli günler (İK ve Vardiya'nın kişi takvimi); okunamazsa null.
  izinler: { kisiId: string; gunler: string[] }[] | null;
}

// Açık çalışmanın aynı alanları, kayıttaki biçimiyle (tipsiz): motor ayarları aynı kimlikte korunur.
export interface KaynakElleVerisi {
  tezgahlar?: readonly Record<string, unknown>[];
  personel?: readonly Record<string, unknown>[];
  devamsizlik?: readonly Record<string, unknown>[];
}

const sirala = (ids: Iterable<number>, sira: ReadonlyMap<number, number>): string[] =>
  [...ids].filter((id) => sira.has(id)).sort((a, b) => sira.get(a)! - sira.get(b)!).map(String);

// Eski yolun rrKur'u gibi: değeri undefined olan alan silinir, öteki yeni alanlar eskinin üstüne yazılır.
function ustuneYaz<T>(eski: Record<string, unknown> | undefined, yeni: Record<string, unknown>): T {
  const o: Record<string, unknown> = { ...(eski ?? {}) };
  for (const [k, v] of Object.entries(yeni)) { if (v === undefined) delete o[k]; else o[k] = v; }
  return o as T;
}
const kopya = <T>(x: T): T => structuredClone(x);
const kimlikle = (l: readonly Record<string, unknown>[] | undefined, id: string): Record<string, unknown> | undefined => {
  const x = l?.find((y) => String(y['id']) === id);
  return x === undefined ? undefined : kopya(x);
};

// 650 a: iş merkezinin haftası (gün adı -> vardiyalar). Haftası okunmayan merkezde tezgâh atölyenin takvimiyle çalışır (undefined).
function merkezHaftasi(o: KaynakDilimiOkumasi, merkezId: number | null, sira: ReadonlyMap<number, number>): MotorTezgahi['hafta'] {
  if (o.takvim === null || o.istasyon === null || merkezId === null || !o.istasyon.merkezler.some((m) => m.id === merkezId)) return undefined;
  const satir = o.takvim.hafta.filter((h) => h.merkezId === merkezId);
  return Object.fromEntries(GUN_ADLARI.map((g) => [g, sirala(satir.filter((h) => h.gun === GUN_SIRASI[g]).map((h) => h.vardiyaId), sira)]));
}

// Atölyenin tek takvimi aktif iş merkezlerinin haftalarının birleşimidir. Hiç vardiyası olmayan hafta boş nesnedir; istasyon ya da takvim
// okunamazsa da boştur (eski yol bu durumda da boş takvim yazar; yeni yol aynısını yapar, düzeltmek davranış değişikliğidir).
function calismaGunleri(o: KaynakDilimiOkumasi, sira: ReadonlyMap<number, number>): MotorVerisi['calismaGunleri'] {
  if (o.takvim === null || o.istasyon === null) return {};
  const merkez = new Set(o.istasyon.merkezler.map((m) => m.id));
  const satir = o.takvim.hafta.filter((h) => merkez.has(h.merkezId));
  const hafta = Object.fromEntries(GUN_ADLARI.map((g) => [g, sirala(new Set(satir.filter((h) => h.gun === GUN_SIRASI[g]).map((h) => h.vardiyaId)), sira)]));
  return GUN_ADLARI.some((g) => hafta[g]!.length > 0) ? hafta : {};
}

// 71 b: elle değiştirilmemiş tezgâhın ücreti istasyon maliyetini izler (girdi.betik ucretIzle); maliyet okunamazsa son ücret kalır.
function ucretIzle(a: Record<string, unknown>, maliyet: number | null): void {
  if (maliyet === null) return;
  const izler = a['ucretIst'] !== undefined ? a['ucret'] === a['ucretIst'] : a['ucret'] === maliyet;
  if (izler) { a['ucret'] = maliyet; a['ucretIst'] = maliyet; }
}

function tezgahlar(o: KaynakDilimiOkumasi, elle: KaynakElleVerisi, sira: ReadonlyMap<number, number>): MotorTezgahi[] {
  if (o.istasyon === null) return (elle.tezgahlar ?? []).map((t) => kopya(t) as unknown as MotorTezgahi);
  const istasyon = new Map(o.istasyon.istasyonlar.map((i) => [i.id, i]));
  return o.istasyon.makineler.flatMap((m) => {
    const ist = m.istasyonId === null ? undefined : istasyon.get(m.istasyonId);
    if (ist === undefined) return [];
    const id = String(m.id);
    const maliyet = o.istasyonMaliyeti?.get(ist.id) ?? null;
    const a = kimlikle(elle.tezgahlar, id);
    if (a !== undefined) ucretIzle(a, maliyet);
    // 69 a: ilk kurulumda ücret istasyon maliyetinden (yoksa null), verim istasyonun verimi, vardiyalar takvimin bütün vardiyaları.
    const ilk = a === undefined
      ? { ucret: maliyet, ucretIst: maliyet, verim: (ist.verimYuzde || 100) / 100, vardiyalar: o.vardiyalar.map((v) => String(v.id)) }
      : {};
    // 561 1 b: operatör oranı istasyonun plan ayarıdır; yoksa 1.
    const opOran = ist.operatorOrani === null || !Number.isFinite(ist.operatorOrani) ? 1 : ist.operatorOrani;
    return [ustuneYaz<MotorTezgahi>(a, { id, ad: m.ad, grup: String(ist.id), ...ilk, hafta: merkezHaftasi(o, ist.merkezId, sira), opOran })];
  });
}

function personel(o: KaynakDilimiOkumasi, elle: KaynakElleVerisi): MotorKisisi[] {
  if (o.kisiler === null) return (elle.personel ?? []).map((p) => kopya(p) as unknown as MotorKisisi);
  const vardiya = new Map((o.takvim?.kisiVardiyasi ?? []).map((k) => [k.kisiId, String(k.vardiyaId)]));
  return o.kisiler.map((k) => {
    const id = String(k.id);
    const a = kimlikle(elle.personel, id);
    return ustuneYaz<MotorKisisi>(a, {
      id, ad: k.ad, vardiya: vardiya.get(k.id) ?? '', gruplar: k.yetkinlikler.map(String), makineler: k.makineler.map(String), enCok: k.enCok,
      // İlk kurulumda ayarcı görevden; sonra planlamacının elle değeri kalır.
      ...(a === undefined ? { ayar: k.gorev === 'Ayarcı' } : {}),
    });
  });
}

// 13.4: onaylı izin motorda devamsızlıktır; sunucu satırı işaretlidir ve her okumada yeniden kurulur, elle satır kalır.
function devamsizlik(o: KaynakDilimiOkumasi, elle: KaynakElleVerisi): MotorDevamsizligi[] | undefined {
  if (o.izinler === null) return elle.devamsizlik === undefined ? undefined : elle.devamsizlik.map((d) => kopya(d) as unknown as MotorDevamsizligi);
  const elleSatir = (elle.devamsizlik ?? []).filter((d) => !d['sunucu']).map((d) => kopya(d) as unknown as MotorDevamsizligi & { kisi?: string });
  const elleGun = new Set(elleSatir.map((d) => `${d.personel || d.kisi || ''}@${d.gun}`));
  const sunucu = o.izinler.flatMap((p) => p.gunler.filter((g) => !elleGun.has(`${p.kisiId}@${g}`)).map((gun) => ({ personel: p.kisiId, gun, sunucu: true as const })));
  return [...elleSatir, ...sunucu];
}

export function kaynakDilimiKur(o: KaynakDilimiOkumasi, elle: KaynakElleVerisi): Pick<MotorVerisi, KaynakAlani> {
  const sira = new Map(o.vardiyalar.map((v, i) => [v.id, i]));
  const vardiyalar: MotorVardiyasi[] = o.vardiyalar.map((v) => ({ id: String(v.id), bas: v.bas, bit: v.bit, molalar: v.molalar.map((m) => ({ bas: m.bas, bit: m.bit })) }));
  const d = devamsizlik(o, elle);
  return {
    vardiyalar, calismaGunleri: calismaGunleri(o, sira), tatiller: o.tatiller.slice(), tezgahlar: tezgahlar(o, elle, sira), personel: personel(o, elle),
    ...(d === undefined ? {} : { devamsizlik: d }),
  };
}

export const KAYNAK_DILIMI = {
  ad: 'kaynaklar', kart: 1716, alanlar: KAYNAK_ALANLARI, kur: kaynakDilimiKur,
} as const satisfies Dilim<KaynakDilimiOkumasi, KaynakElleVerisi, KaynakAlani>;
