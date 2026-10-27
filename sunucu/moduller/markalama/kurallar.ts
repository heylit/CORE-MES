import type { AlanGovdesi, BirimDurumu, DurumKomutu, SayacKapsami } from '#paylasilan/sozlesme/markalama.ts';

// MRK-01: şablonun parçaları bilinir, sıra numarası tek kez geçer. Sayaç malzeme başına olduğundan (806 2a) parça kodu
// zorunludur; emir ya da yıl kapsamında o kapsamın parçası da şablonda olmalıdır, yoksa iki kapsam aynı numarayı üretir.
// Sabit karakterler markalanabilir ASCII ile sınırlıdır.
const PARCA_DESENI = /\{([A-Z]+)(?::(\d))?\}/g;
const SABIT_DESENI = /^[A-Za-z0-9._/-]*$/;
const BILINEN = new Set(['PARCA', 'EMIR', 'YY', 'YYYY', 'WW', 'MM', 'DD', 'SEQ']);

export function sablonHatasi(sablon: string, kapsam: SayacKapsami): string | null {
  const parcalar = [...sablon.matchAll(PARCA_DESENI)];
  const bilinmeyen = parcalar.find((p) => !BILINEN.has(p[1] ?? '') || (p[2] !== undefined && p[1] !== 'SEQ'));
  if (bilinmeyen) return `Şablonda bilinmeyen parça var: ${bilinmeyen[0]}.`;
  if (!SABIT_DESENI.test(sablon.replace(PARCA_DESENI, ''))) return 'Şablonda yalnız harf, rakam ve - _ . / kullanılır.';
  const adlar = parcalar.map((p) => p[1]);
  const seq = adlar.filter((a) => a === 'SEQ').length;
  if (seq !== 1) return 'Şablonda sıra numarası ({SEQ} ya da {SEQ:5}) tam bir kez geçer.';
  if (!adlar.includes('PARCA')) return 'Şablonda parça kodu ({PARCA}) olmalı; sayaç malzeme başınadır.';
  if (kapsam === 'emir' && !adlar.includes('EMIR')) return 'Sayaç emir başınaysa şablonda {EMIR} olmalı.';
  if (kapsam === 'yil' && !adlar.includes('YY') && !adlar.includes('YYYY')) return 'Sayaç yıl başınaysa şablonda {YY} ya da {YYYY} olmalı.';
  return null;
}

// MRK-02: sabit içerikli markanın metni vardır, seri içerikli markanınki yoktur; en az bir marka seri no taşımıyorsa
// tanım birim izlemez ve seri verilmez (MRK-07).
export function alanHatasi(alanlar: readonly AlanGovdesi[]): string | null {
  for (const [i, a] of alanlar.entries()) {
    if (a.icerik === 'sabit' && a.sabitMetin === null) return `${i + 1}. markanın sabit metni boş.`;
    if (a.icerik === 'seri' && a.sabitMetin !== null) return `${i + 1}. marka seri no taşır; sabit metin yazılmaz.`;
  }
  return null;
}

export const seriAlaniVarMi = (alanlar: readonly { icerik: string }[]): boolean => alanlar.some((a) => a.icerik === 'seri');

export interface SeriBaglami {
  parca: string;
  emir: string;
  // Tesis günü, YYYY-AA-GG.
  gun: string;
}

// ISO 8601 hafta numarası.
export function isoHafta(gun: string): number {
  const [y, a, g] = gun.split('-').map(Number);
  const t = new Date(Date.UTC(y ?? 1970, (a ?? 1) - 1, g ?? 1));
  const haftaGunu = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - haftaGunu);
  const yilBasi = Date.UTC(t.getUTCFullYear(), 0, 1);
  return Math.ceil(((t.getTime() - yilBasi) / 86400000 + 1) / 7);
}

// MRK-03: numara sunucuda, şablon ve sayaçtan üretilir; sıra şablondaki genişliğe sıfırla doldurulur, taşarsa kısalmaz.
export function seriNoUret(sablon: string, b: SeriBaglami, sira: number): string {
  const [yil = '', ay = '', gun = ''] = b.gun.split('-');
  const iki = (n: number) => String(n).padStart(2, '0');
  return sablon.replace(PARCA_DESENI, (_t, ad: string, genislik?: string) => {
    if (ad === 'SEQ') return String(sira).padStart(Number(genislik ?? 4), '0');
    if (ad === 'PARCA') return b.parca;
    if (ad === 'EMIR') return b.emir;
    if (ad === 'YYYY') return yil;
    if (ad === 'YY') return yil.slice(2);
    if (ad === 'MM') return ay;
    if (ad === 'DD') return gun;
    return iki(isoHafta(b.gun));
  });
}

export function kapsamAnahtari(kapsam: SayacKapsami, uretimEmriId: number, gun: string): string {
  if (kapsam === 'emir') return `E${uretimEmriId}`;
  if (kapsam === 'yil') return `Y${gun.slice(0, 4)}`;
  return '';
}

// MRK-04: birim durum geçişi. Red önce gelir; rework ancak red birime verilir; kabul red ya da rework birimi sağlama döndürür;
// hurda her açık durumdan verilir ve son durumdur.
const GECISLER: Readonly<Record<BirimDurumu, Partial<Record<DurumKomutu, BirimDurumu>>>> = {
  saglam: { red: 'red', hurda: 'hurda' },
  red: { rework: 'rework', kabul: 'saglam', hurda: 'hurda' },
  rework: { red: 'red', kabul: 'saglam', hurda: 'hurda' },
  hurda: {},
};

export function durumGecisi(durum: BirimDurumu, komut: DurumKomutu): BirimDurumu | null {
  return GECISLER[durum][komut] ?? null;
}

// MRK-05: hurdanın nedeni zorunludur; başka komutta neden yazılmaz.
export function hurdaNedeniHatasi(komut: DurumKomutu, hurdaNedeniId: number | null): string | null {
  if (komut === 'hurda' && hurdaNedeniId === null) return 'Hurda için neden seçilmeli.';
  if (komut !== 'hurda' && hurdaNedeniId !== null) return 'Hurda nedeni yalnız hurda kaydında yazılır.';
  return null;
}
