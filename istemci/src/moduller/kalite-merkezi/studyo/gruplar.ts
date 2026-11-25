import type { KmGruplarGovdesi, KmResim } from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';

// 3693: grup planı ekranda taslak olarak düzenlenir, Kaydet'le resim başına bütün yazılır. Taslak yerel anahtarla izlenir (yeni grubun kimliği yoktur).
export interface GrupTaslagi { anahtar: string; id: number | null; ad: string; balonlar: number[]; operasyonlar: number[] }
export interface RotaOperasyonu { operasyonId: number; opNo: number; ad?: string | undefined }
export const operasyonMetni = (o: Pick<RotaOperasyonu, 'opNo' | 'ad'>): string => (o.ad ? `Op ${String(o.opNo)} · ${o.ad}` : `Op ${String(o.opNo)}`);

// Resimde balonun yanında yazan kısa kod: grubun sırası (A, B, ... Z, AA); ad uzun olabilir, kod hep kısadır.
export function grupKodu(sira: number): string {
  let n = sira, kod = '';
  do { kod = String.fromCharCode(65 + (n % 26)) + kod; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return kod;
}

export function taslakOlustur(resim: KmResim): GrupTaslagi[] {
  return (resim.gruplar ?? []).map((g) => ({ anahtar: `g${String(g.id)}`, id: g.id, ad: g.ad, balonlar: [...g.balonlar], operasyonlar: g.operasyonlar.map((o) => o.operasyonId) }));
}

// Kayıtlı plan ile taslak aynı mı: değişiklik çubuğunu açar.
export function degisti(resim: KmResim, taslak: readonly GrupTaslagi[]): boolean {
  const s = (t: readonly GrupTaslagi[]) => JSON.stringify(t.map((g) => [g.id, g.ad, [...g.balonlar].sort((a, b) => a - b), [...g.operasyonlar].sort((a, b) => a - b)]));
  return s(taslakOlustur(resim)) !== s(taslak);
}

// Yeni grup için kullanılmamış ilk harf (A, B, ...), sonra sayılı ad.
export function yeniGrupAdi(taslak: readonly GrupTaslagi[]): string {
  const kullanilan = new Set(taslak.map((g) => g.ad.trim().toLowerCase()));
  for (let i = 0; i < 26; i += 1) { const ad = String.fromCharCode(65 + i); if (!kullanilan.has(ad.toLowerCase())) return ad; }
  let n = 1;
  while (kullanilan.has(`grup ${String(n)}`)) n += 1;
  return `Grup ${String(n)}`;
}

// Sunucunun reddedeceği hâli kaydetmeden gösterir (kural sunucuda da vardır, kesin hüküm oradadır).
export function taslakHatasi(taslak: readonly GrupTaslagi[]): string | null {
  const adlar = taslak.map((g) => g.ad.trim().toLowerCase());
  if (adlar.some((a) => a === '')) return 'Grup adı boş olamaz.';
  if (taslak.some((g) => g.ad.trim().length > 60)) return 'Grup adı en çok 60 karakter olur.';
  if (new Set(adlar).size !== adlar.length) return 'Bu adla grup zaten var.';
  return null;
}

export function govdeOlustur(surum: number, taslak: readonly GrupTaslagi[]): KmGruplarGovdesi {
  return {
    surum,
    gruplar: taslak.map((g) => ({ ...(g.id === null ? {} : { id: g.id }), ad: g.ad.trim(), balonlar: [...g.balonlar].sort((a, b) => a - b) })),
    atamalar: taslak.flatMap((g) => g.operasyonlar.map((operasyonId) => ({ operasyonId, grup: g.ad.trim() }))),
  };
}

// Bir operasyon bir gruba bağlıdır: başka gruptaysa oradan alınır.
export function operasyonBagla(taslak: readonly GrupTaslagi[], anahtar: string, operasyonId: number): GrupTaslagi[] {
  return taslak.map((g) => ({ ...g, operasyonlar: g.anahtar === anahtar ? [...g.operasyonlar.filter((o) => o !== operasyonId), operasyonId] : g.operasyonlar.filter((o) => o !== operasyonId) }));
}

// Hiçbir operasyona grup bağlı değilse (eski parça) uyarı yoktur; bağlı olanlar varken grupsuz kalan operasyon uyarı alır.
export function grupsuzOperasyonlar(taslak: readonly GrupTaslagi[], rota: readonly RotaOperasyonu[]): RotaOperasyonu[] {
  const bagli = new Set(taslak.flatMap((g) => g.operasyonlar));
  return bagli.size === 0 ? [] : rota.filter((o) => !bagli.has(o.operasyonId));
}
