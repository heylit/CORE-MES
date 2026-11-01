// 1714 (1684 b): gerçek sürelerden öğrenme, saf. Biten adımın gerçek / planlı net süre oranı (plan sapması, 782) ürün ve rota adımı başına
// toplanır; motor bunu adımın süre belirsizliği olarak okur (engine.betik compile: ogren[ürün + ' ' + adım] = { n, f, v }) ve yalnız
// tamponu ile risk benzetimini değiştirir; rota süresi değişmez. Sınırlar kullanıcı kararıdır (1684 teyit): aşırı sapan oran dışarıda,
// pencere ve örnek sayısı sınırlı, en az üç örnek, belirsizliğin tavanı var.
export const OGRENME_SINIRI = {
  // Son bu kadar günde biten adımlar.
  pencereGun: 90,
  // Ürün ve adım başına en yeni bu kadar örnek.
  enCokOrnek: 20,
  // Bundan az örneği olan adım öğrenilmez (motorun eşiğiyle aynı).
  enAzOrnek: 3,
  // Bu aralığın dışındaki oran duruş, yanlış sayım ya da elle düzeltme sayılır, örneğe girmez.
  altOran: 0.3,
  ustOran: 3,
  // Göreli belirsizlik (standart sapma / ortalama) bu değeri geçmez: tek kötü hafta tamponu şişirmesin.
  belirsizlikTavani: 0.5,
} as const;

// opNo yalnız gösterim içindir; anahtar ürün ve rota sırasıdır.
export interface SureOrnegi { urun: string; adim: string; opNo: number; oran: number; bitis: number }
// Motorun biçimi: n örnek sayısı, f ortalama oran, v oranın varyansı.
export interface OgrenilenSure { n: number; f: number; v: number }

const anahtar = (o: Pick<SureOrnegi, 'urun' | 'adim'>): string => `${o.urun} ${o.adim}`;

// Motor belirsizliği sqrt(v) / max(0,3, f) diye okur; tavan aynı paydayla uygulanır.
const MOTOR_ORAN_TABANI = 0.3;

export function ogrenilenSureler(ornekler: readonly SureOrnegi[], simdi: number): Map<string, OgrenilenSure> {
  const s = OGRENME_SINIRI;
  const pencereBasi = simdi - s.pencereGun * 86_400_000;
  const gruplar = new Map<string, SureOrnegi[]>();
  for (const o of ornekler) {
    if (!Number.isFinite(o.oran) || o.oran < s.altOran || o.oran > s.ustOran || o.bitis < pencereBasi || o.bitis > simdi) continue;
    const k = anahtar(o);
    gruplar.set(k, [...(gruplar.get(k) ?? []), o]);
  }
  const sonuc = new Map<string, OgrenilenSure>();
  for (const [k, l] of gruplar) {
    const son = [...l].sort((a, b) => b.bitis - a.bitis).slice(0, s.enCokOrnek);
    if (son.length < s.enAzOrnek) continue;
    const n = son.length;
    const f = son.reduce((t, o) => t + o.oran, 0) / n;
    const ham = son.reduce((t, o) => t + (o.oran - f) ** 2, 0) / (n - 1);
    const tavan = (s.belirsizlikTavani * Math.max(MOTOR_ORAN_TABANI, f)) ** 2;
    sonuc.set(k, { n, f: yuvarla(f), v: yuvarla(Math.min(ham, tavan)) });
  }
  return sonuc;
}

const yuvarla = (x: number): number => Math.round(x * 1e6) / 1e6;

export interface OgrenmeSatiri { urun: string; adim: string; opNo: number; ornek: number; oran: number; dagilim: number }

// Gölge görünüm (plan sağlığı): öğrenilen adımlar, ortalama oranı bire en uzak olandan; eşitlikte örneği çok olan önce. opNo en yeni
// örneğinkidir.
export function ogrenmeSatirlari(ornekler: readonly SureOrnegi[], sureler: ReadonlyMap<string, OgrenilenSure>, enCok: number): OgrenmeSatiri[] {
  const opNo = new Map<string, { opNo: number; bitis: number }>();
  for (const o of ornekler) {
    const k = anahtar(o), e = opNo.get(k);
    if (e === undefined || o.bitis > e.bitis) opNo.set(k, { opNo: o.opNo, bitis: o.bitis });
  }
  const uzaklik = (f: number) => Math.abs(Math.log(f));
  return [...sureler].map(([k, s]) => {
    const [urun = '', adim = ''] = k.split(' ');
    return { urun, adim, opNo: opNo.get(k)?.opNo ?? 0, ornek: s.n, oran: Math.round(s.f * 1000) / 1000, dagilim: Math.round(Math.sqrt(s.v) * 1000) / 1000 };
  }).sort((a, b) => uzaklik(b.oran) - uzaklik(a.oran) || b.ornek - a.ornek).slice(0, enCok);
}
