// Dilim 3b (F): tahtanın görünen aralığı ile genel bakış şeridi arasındaki küçük depo. Kaydırma ve sürükleme Kokpit'i yeniden çizdirmez
// (Test 3b B1: her harekette bütün Kokpit çiziliyordu); yalnız şerit abone olur, tahta kendi kaydırıcısını kaydeder.
export interface Pencere { S: number; C: number }
export interface PencereDeposu {
  al: () => Pencere | null;
  yaz: (S: number, C: number) => void;
  abone: (dinle: () => void) => () => void;
  // Görünen başı bu saate getirir; tahta açıkken kaydedilir.
  kaydir: (S: number) => void;
  kaydiriciKur: (f: ((S: number) => void) | null) => void;
}
export function pencereDeposuKur(): PencereDeposu {
  let p: Pencere | null = null, kaydirici: ((S: number) => void) | null = null;
  const dinleyenler = new Set<() => void>();
  return {
    al: () => p,
    yaz: (S, C) => {
      if (p && Math.abs(p.S - S) < 1e-3 && Math.abs(p.C - C) < 1e-3) return;
      p = { S, C };
      for (const f of dinleyenler) f();
    },
    abone: (f) => { dinleyenler.add(f); return () => { dinleyenler.delete(f); }; },
    kaydir: (S) => { kaydirici?.(S); },
    kaydiriciKur: (f) => { kaydirici = f; },
  };
}
