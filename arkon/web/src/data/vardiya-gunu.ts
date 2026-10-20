const GUN_MS = 864e5;

export interface GunPenceresi { s: number; e: number }
export interface GunAraligi<P extends GunPenceresi> { d: number; from: number; to: number; pencereler: P[] }

// Vardiya tanımsızken boş liste: geçen süre ya da 24 saat "planlı süre" sayılmaz, OEE hesaplanmaz.
export function anlikPencereler(sh: { s: number; e: number; breaks: { s: number; e: number }[]; tanimsiz?: boolean }): { s: number; e: number; breaks: { s: number; e: number }[] }[] {
  return sh.tanimsiz ? [] : [{ s: sh.s, e: sh.e, breaks: sh.breaks }];
}

// Gün satırları [from, to) üzerinde ardışık ve çakışmasızdır. Gece yarısını aşan vardiyanın tamamı başladığı günün satırına yazılır:
// satır, o vardiyanın bittiği ana kadar uzar, sonraki satır orada başlar. Aralıktan önce başlayıp aralığa taşan vardiya ilk satıra girer.
export function gunAraliklari<P extends GunPenceresi>(from: number, to: number, pencereler: readonly P[]): GunAraligi<P>[] {
  const d0 = new Date(from).setHours(0, 0, 0, 0);
  const sayi = Math.max(0, Math.ceil((to - d0) / GUN_MS));
  const satirlar: GunAraligi<P>[] = Array.from({ length: sayi }, (_, i) => ({ d: d0 + i * GUN_MS, from: 0, to: 0, pencereler: [] }));
  for (const p of pencereler) {
    const i = Math.min(sayi - 1, Math.max(0, Math.floor((p.s - d0) / GUN_MS)));
    if (i >= 0) satirlar[i]?.pencereler.push(p);
  }
  let sinir = from;
  for (const satir of satirlar) {
    const dogal = satir.d + GUN_MS;
    const bitis = Math.min(to, Math.max(dogal, ...satir.pencereler.map((p) => p.e)));
    satir.from = sinir;
    satir.to = Math.max(sinir, bitis);
    sinir = satir.to;
  }
  return satirlar.filter((s) => s.to > s.from);
}
