// 3243 a: yeni hammadde kartında parçanın 3B modelinden ham önerisi. Saf hesap: ölçü 3B analizinin döndürülmüş kutusundan
// (a uzun eksen, b ve c kesit, cap kesiti kapsayan dairenin çapı), standart ölçüler sihirbazın kendi hazır listelerinden gelir.
// Kesit ölçüsü sığan en küçük standarda yukarı yuvarlanır; listede sığan yoksa 1 mm'ye yuvarlanır ve "standart dışı" işaretlenir.
// Boy (kesim boyu) = uzun eksen + iki pay + kesme payı; stoktaki boy hazır listenin ilk boyudur. Sıra ham hacmine göre (en az talaş önce).

export interface ModelOlcusu { a: number; b: number; c: number; cap: number; hacimMm3: number | null }
export interface HazirGrup { id: string; keys: readonly string[]; vals: readonly (readonly number[])[] }
export const ONERI_FORMLARI = ['cubuk', 'altigen', 'lama', 'levha', 'blok'] as const;
export type OneriFormu = (typeof ONERI_FORMLARI)[number];

export interface ModelHamOnerisi {
  form: OneriFormu;
  // Forma yazılacak ölçüler (sihirbazın form ölçü adlarıyla).
  dims: Record<string, number>;
  // Kesit ölçüsü hazır listede yoksa true.
  standartDisi: boolean;
  // Parça başına kesilen boy; blokta null (blok bütün kullanılır).
  kesimBoyuMm: number | null;
  // Levhadan kesilen parçanın en ve boyu; öbür formlarda null.
  kesimEnMm: number | null;
  hamHacimMm3: number;
  // Parça hacmi yoksa null.
  talas: number | null;
}

const AYNI = 1e-9;
const yukari = (x: number): number => Math.ceil(x - AYNI);
const blokYuvarla = (x: number): number => Math.ceil(x / 5 - AYNI) * 5;

function tekOlcu(gruplar: readonly HazirGrup[], anahtar: string, gereken: number): { deger: number; standartDisi: boolean } {
  const g = gruplar.find((x) => x.keys.length === 1 && x.keys[0] === anahtar);
  const v = g?.vals.map((x) => x[0] ?? 0).filter((x) => x + AYNI >= gereken).sort((p, q) => p - q)[0];
  return v === undefined ? { deger: yukari(gereken), standartDisi: true } : { deger: v, standartDisi: false };
}

function stokBoyu(gruplar: readonly HazirGrup[], anahtar: string, varsayilan: number): number {
  const g = gruplar.find((x) => x.keys.length === 1 && x.keys[0] === anahtar);
  return g?.vals[0]?.[0] ?? varsayilan;
}

// gruplar(form): o formun hazır ölçü grupları (sihirbazın presetGroups'u, aile ve sınıfa göre). formlar: ailenin izin verdiği formlar.
export function modelHamOnerileri(
  m: ModelOlcusu, payMm: number, kesmeMm: number, formlar: readonly string[], gruplar: (form: OneriFormu) => readonly HazirGrup[],
): ModelHamOnerisi[] {
  if (!(payMm >= 0) || !(kesmeMm >= 0) || !(m.a > 0) || !(m.b > 0) || !(m.c > 0)) return [];
  const kesitB = Math.max(m.b, m.c) + 2 * payMm, kesitC = Math.min(m.b, m.c) + 2 * payMm;
  const D = Math.max(m.cap, kesitB - 2 * payMm) + 2 * payMm;
  const parcaBoyu = m.a + 2 * payMm, L = parcaBoyu + kesmeMm;
  const sonuc: ModelHamOnerisi[] = [];
  const ekle = (form: OneriFormu, dims: Record<string, number>, standartDisi: boolean, kesimBoyuMm: number | null, kesimEnMm: number | null, hamHacimMm3: number) => {
    const talas = m.hacimMm3 === null || hamHacimMm3 <= 0 ? null : Math.max(0, 1 - m.hacimMm3 / hamHacimMm3);
    sonuc.push({ form, dims, standartDisi, kesimBoyuMm, kesimEnMm, hamHacimMm3, talas });
  };
  for (const form of ONERI_FORMLARI) {
    if (!formlar.includes(form)) continue;
    const g = gruplar(form);
    if (form === 'cubuk') {
      const d = tekOlcu(g, 'd', D);
      ekle(form, { d: d.deger, l: stokBoyu(g, 'l', 3000) }, d.standartDisi, L, null, (Math.PI * d.deger ** 2 / 4) * L);
    } else if (form === 'altigen') {
      // Altıgenin iç teğet dairesi anahtar ağzıdır: parçanın kesitini kapsayan daire buna sığmalı.
      const s = tekOlcu(g, 's', D);
      ekle(form, { s: s.deger, l: stokBoyu(g, 'l', 3000) }, s.standartDisi, L, null, (Math.sqrt(3) / 2) * s.deger ** 2 * L);
    } else if (form === 'lama') {
      const kesit = g.find((x) => x.keys.length === 2 && x.keys[0] === 'a' && x.keys[1] === 'b');
      const uyan = (kesit?.vals ?? []).map((v) => [Math.max(v[0] ?? 0, v[1] ?? 0), Math.min(v[0] ?? 0, v[1] ?? 0)] as const)
        .filter(([gen, kal]) => gen + AYNI >= kesitB && kal + AYNI >= kesitC).sort((p, q) => p[0] * p[1] - q[0] * q[1])[0];
      const [gen, kal] = uyan ?? [yukari(kesitB), yukari(kesitC)];
      ekle(form, { a: gen, b: kal, l: stokBoyu(g, 'l', 6000) }, uyan === undefined, L, null, gen * kal * L);
    } else if (form === 'levha') {
      // Levhadan kesilen parça: kalınlık standarda yuvarlanır, en ve boy kesim ölçüsüdür; plaka ölçüsü hazır listenin ilkidir.
      const t = tekOlcu(g, 't', kesitC);
      if (t.standartDisi) continue;
      const plaka = g.find((x) => x.id === 'plaka')?.vals[0];
      const en = kesitB, boy = parcaBoyu + kesmeMm;
      if (plaka !== undefined && (Math.max(en, boy) > Math.max(plaka[0] ?? 0, plaka[1] ?? 0) || Math.min(en, boy) > Math.min(plaka[0] ?? 0, plaka[1] ?? 0))) continue;
      ekle(form, { t: t.deger, w: plaka?.[0] ?? 1000, l: plaka?.[1] ?? 2000 }, false, boy, en, t.deger * en * boy);
    } else {
      const a = blokYuvarla(parcaBoyu), b = blokYuvarla(kesitB), h = blokYuvarla(kesitC);
      ekle(form, { a, b, h }, false, null, null, a * b * h);
    }
  }
  return sonuc.sort((p, q) => p.hamHacimMm3 - q.hamHacimMm3);
}

// Parçanın kesiti yuvarlak mı (yalnız çizim için): kesit kenarları eşit ve kapsayan daire kenara eşitse tornalanmış parça sayılır.
// Kare kesitte daire köşegene eşittir, yuvarlak sayılmaz.
export const kesitYuvarlak = (m: ModelOlcusu): boolean => {
  const u = Math.max(m.b, m.c);
  return Math.abs(m.b - m.c) <= u * 0.03 && m.cap <= u * 1.02;
};
