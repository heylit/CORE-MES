import type { MetrikDakikasi, SaatlikAralik, SaatOzeti } from '#paylasilan/sozlesme/saglik.ts';

// Sistem durumu grafikleri (1664, prototip 1673 a). 1 saat bellekteki dakikalardan, diğer aralıklar saatlik özetten gelir.
export type Aralik = 'saat' | SaatlikAralik;
export const ARALIKLAR: readonly { anahtar: Aralik; baslik: string }[] = [
  { anahtar: 'saat', baslik: '1 saat' },
  { anahtar: 'gun', baslik: '24 saat' },
  { anahtar: 'hafta', baslik: '7 gün' },
  { anahtar: 'yil', baslik: '13 ay' },
];

// Yanıt süresi eşiği sunucudaki eşik kuralıyla aynıdır (saglik kurallar.ts, yanit-suresi); çizgi yalnız gösterir.
export const YANIT_ESIGI_MS = 1000;
// Olay döngüsü eşiği sunucudaki "Sunucu tıkanıyor" kuralıyla aynıdır (saglik kurallar.ts, olay-dongusu).
export const OLAY_DONGUSU_ESIGI_MS = 500;

export interface Nokta { an: Date; deger: number | null }
export interface Seriler {
  istek: Nokta[];
  p95: Nokta[];
  surec: Nokta[];
  makine: Nokta[];
  havuz: Nokta[];
  anaIs: Nokta[];
  dongu: Nokta[];
}

export function dakikaSerileri(d: readonly MetrikDakikasi[]): Seriler {
  const seri = (oku: (m: MetrikDakikasi) => number | null): Nokta[] => d.map((m) => ({ an: new Date(m.an), deger: oku(m) }));
  return {
    istek: seri((m) => m.istek.sayi),
    p95: seri((m) => m.istek.p95Ms),
    surec: seri((m) => m.surecIslemciYuzde),
    makine: seri((m) => m.makineIslemciYuzde),
    havuz: seri((m) => m.havuz?.kullanimda ?? null),
    anaIs: seri((m) => m.anaIsParcacigiYuzde ?? null),
    dongu: seri((m) => m.olayDongusuP99Ms),
  };
}

// Saatlik özet: istek saatin toplamı, p95 saatin en kötü dakikası, işlemci ortalama, havuz en çok kullanım.
export function saatSerileri(s: readonly SaatOzeti[]): Seriler {
  const seri = (oku: (o: SaatOzeti) => number | null): Nokta[] => s.map((o) => ({ an: new Date(o.saat), deger: oku(o) }));
  return {
    istek: seri((o) => o.istek.sayi),
    p95: seri((o) => o.istek.p95MsEnCok),
    surec: seri((o) => o.surecIslemciYuzde?.ort ?? null),
    makine: seri((o) => o.makineIslemciYuzde?.ort ?? null),
    havuz: seri((o) => o.havuz?.kullanimdaEnCok ?? null),
    anaIs: seri((o) => o.anaIsParcacigiYuzde?.ort ?? null),
    dongu: seri((o) => o.olayDongusuP99MsEnCok),
  };
}

const enCok = (n: readonly (number | null)[]): number | null => {
  const dolu = n.filter((x): x is number => x !== null);
  return dolu.length === 0 ? null : Math.max(...dolu);
};

export interface Ozet {
  saniyede: number | null;
  saniyedeEnCok: number | null;
  p95Ms: number | null;
  p95MsEnCok: number | null;
  sunucuHatasi: number | null;
  havuzKullanimda: number | null;
  havuzBoyut: number | null;
  havuzBekleyen: number | null;
  havuzReddi: number | null;
  olayDongusuP99Ms: number | null;
  olayDongusuP99MsEnCok: number | null;
  anaIsYuzde: number | null;
  anaIsYuzdeEnCok: number | null;
}

const BOS_OZET: Ozet = {
  saniyede: null, saniyedeEnCok: null, p95Ms: null, p95MsEnCok: null, sunucuHatasi: null,
  havuzKullanimda: null, havuzBoyut: null, havuzBekleyen: null, havuzReddi: null,
  olayDongusuP99Ms: null, olayDongusuP99MsEnCok: null, anaIsYuzde: null, anaIsYuzdeEnCok: null,
};

const topla = (n: readonly number[]): number => n.reduce((a, b) => a + b, 0);

// Kutular: son ölçü ve aralığın en kötüsü. Ölçü yoksa null; sıfır uydurulmaz.
export function dakikaOzeti(d: readonly MetrikDakikasi[]): Ozet {
  const son = d.at(-1);
  if (son === undefined) return BOS_OZET;
  const havuzlu = d.flatMap((m) => (m.havuz === null ? [] : [m.havuz]));
  return {
    saniyede: son.istek.saniyede,
    saniyedeEnCok: enCok(d.map((m) => m.istek.saniyede)),
    p95Ms: son.istek.p95Ms,
    p95MsEnCok: enCok(d.map((m) => m.istek.p95Ms)),
    sunucuHatasi: topla(d.map((m) => m.istek.sunucuHatasi)),
    havuzKullanimda: son.havuz?.kullanimda ?? null,
    havuzBoyut: son.havuz?.boyut ?? null,
    havuzBekleyen: havuzlu.length === 0 ? null : Math.max(...havuzlu.map((h) => h.bekleyen)),
    havuzReddi: havuzlu.length === 0 ? null : topla(havuzlu.map((h) => h.mesgul)),
    olayDongusuP99Ms: son.olayDongusuP99Ms,
    olayDongusuP99MsEnCok: enCok(d.map((m) => m.olayDongusuP99Ms)),
    anaIsYuzde: son.anaIsParcacigiYuzde ?? null,
    anaIsYuzdeEnCok: enCok(d.map((m) => m.anaIsParcacigiYuzde ?? null)),
  };
}

export function saatOzetiKutulari(s: readonly SaatOzeti[]): Ozet {
  const son = s.at(-1);
  if (son === undefined) return BOS_OZET;
  const havuzlu = s.flatMap((o) => (o.havuz === null ? [] : [o.havuz]));
  return {
    saniyede: son.istek.saniyede,
    saniyedeEnCok: enCok(s.map((o) => o.istek.saniyede)),
    p95Ms: son.istek.p95MsEnCok,
    p95MsEnCok: enCok(s.map((o) => o.istek.p95MsEnCok)),
    sunucuHatasi: topla(s.map((o) => o.istek.sunucuHatasi)),
    havuzKullanimda: son.havuz?.kullanimdaEnCok ?? null,
    havuzBoyut: null,
    havuzBekleyen: havuzlu.length === 0 ? null : Math.max(...havuzlu.map((h) => h.bekleyenEnCok)),
    havuzReddi: havuzlu.length === 0 ? null : topla(havuzlu.map((h) => h.mesgul)),
    olayDongusuP99Ms: son.olayDongusuP99MsEnCok,
    olayDongusuP99MsEnCok: enCok(s.map((o) => o.olayDongusuP99MsEnCok)),
    anaIsYuzde: son.anaIsParcacigiYuzde?.ort ?? null,
    anaIsYuzdeEnCok: enCok(s.map((o) => o.anaIsParcacigiYuzde?.enCok ?? null)),
  };
}

export interface YavasUc { yontem: string; yol: string; sayi: number; p95Ms: number | null }

// Son saatin en yavaş uçları: istek toplanır, p95 dakikaların en kötüsüdür (dakikalık yüzdelikler birleştirilemez).
// Kalıbı bilinmeyen (yol null) istekler listeye girmez.
export function enYavasUclar(d: readonly MetrikDakikasi[], enCokSatir = 5): YavasUc[] {
  const gruplar = new Map<string, YavasUc>();
  for (const m of d) {
    for (const u of m.uclar) {
      if (u.yol === null) continue;
      const anahtar = `${u.yontem} ${u.yol}`;
      const o = gruplar.get(anahtar);
      gruplar.set(anahtar, { yontem: u.yontem, yol: u.yol, sayi: (o?.sayi ?? 0) + u.sayi, p95Ms: enCok([o?.p95Ms ?? null, u.p95Ms]) });
    }
  }
  return [...gruplar.values()]
    .sort((a, b) => (b.p95Ms ?? -1) - (a.p95Ms ?? -1) || b.sayi - a.sayi || `${a.yontem} ${a.yol}`.localeCompare(`${b.yontem} ${b.yol}`))
    .slice(0, enCokSatir);
}

// Eksen için yuvarlak üst sınır: 1, 2, 2,5, 5 × 10^n. Değer yoksa 1.
export function yuvarlakTavan(deger: number): number {
  if (!(deger > 0)) return 1;
  const us = 10 ** Math.floor(Math.log10(deger));
  const adim = [1, 2, 2.5, 5, 10].find((k) => k * us >= deger) ?? 10;
  return adim * us;
}

export function zamanEtiketi(an: Date, aralik: Aralik): string {
  if (aralik === 'saat' || aralik === 'gun') return an.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  if (aralik === 'hafta') return an.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
  return an.toLocaleDateString('tr-TR', { month: 'short', year: '2-digit' });
}

export const sayiMetni = (n: number): string => n.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
