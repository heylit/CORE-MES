import type { ResourceLimits } from 'node:worker_threads';

// Hesap iş parçacığı bellek sınırı (3668-1): sınırsız iş parçacığı taşarsa bütün süreç düşebilir; sınırla yalnız o hesap
// ERR_WORKER_OUT_OF_MEMORY ile biter, süreç sürer. 2 GB, bugünkü hesapların çok üstünde bırakıldı: VARSAYIM, canlıda ölçülmedi;
// sağlık ekranındaki "bellek" sayacı sınırın yakın kalıp kalmadığını gösterir.
export const ISCI_BELLEK_SINIRI_MB = 2048;

export const isciSinirlari = (): ResourceLimits => ({ maxOldGenerationSizeMb: ISCI_BELLEK_SINIRI_MB });

export type HesapTuru = 'motor' | 'degerlendirme' | 'teklif' | 'yillik';
export type HesapSonucu = 'tamam' | 'zaman-asimi' | 'bellek' | 'hata';

export interface HesapTuruDurumu {
  calisan: number;
  toplam: number;
  zamanAsimi: number;
  bellek: number;
  hata: number;
  // Biten son hesabın süresi; hiç bitmediyse null (sıfır uydurulmaz).
  sonSureMs: number | null;
  enUzunSureMs: number | null;
}

export type PlanHesapDurumu = Record<HesapTuru, HesapTuruDurumu>;

const bos = (): HesapTuruDurumu => ({ calisan: 0, toplam: 0, zamanAsimi: 0, bellek: 0, hata: 0, sonSureMs: null, enUzunSureMs: null });
const durum: PlanHesapDurumu = { motor: bos(), degerlendirme: bos(), teklif: bos(), yillik: bos() };

export function hataSonucu(hata: unknown): HesapSonucu {
  return typeof hata === 'object' && hata !== null && 'code' in hata && (hata as { code?: unknown }).code === 'ERR_WORKER_OUT_OF_MEMORY' ? 'bellek' : 'hata';
}

// Hesap başlarken çağrılır; dönen işlev hesap bitince bir kez çağrılır. Yalnız bellekte sayar: süreç yeniden açılınca sıfırlanır.
export function hesapBasladi(tur: HesapTuru, simdi: () => number = Date.now): (sonuc: HesapSonucu) => void {
  const d = durum[tur];
  const basla = simdi();
  d.calisan += 1;
  let bitti = false;
  return (sonuc) => {
    if (bitti) return;
    bitti = true;
    const sure = simdi() - basla;
    d.calisan -= 1;
    d.toplam += 1;
    if (sonuc === 'zaman-asimi') d.zamanAsimi += 1;
    else if (sonuc === 'bellek') d.bellek += 1;
    else if (sonuc === 'hata') d.hata += 1;
    d.sonSureMs = sure;
    d.enUzunSureMs = d.enUzunSureMs === null ? sure : Math.max(d.enUzunSureMs, sure);
  };
}

// Kopya döner: okuyan sayacı değiştiremez.
export function planHesapDurumu(): PlanHesapDurumu {
  return { motor: { ...durum.motor }, degerlendirme: { ...durum.degerlendirme }, teklif: { ...durum.teklif }, yillik: { ...durum.yillik } };
}
