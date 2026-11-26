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

// İş parçacığı çalışmadan biten hesap (yer beklerken süre doldu ya da iş parçacığı kurulamadı): süre ölçülmedi, çalışan sayısı değişmez;
// yalnız toplam ve sonucun sayacı artar.
export function beklerkenBitti(tur: HesapTuru, sonuc: HesapSonucu): void {
  const d = durum[tur];
  d.toplam += 1;
  if (sonuc === 'zaman-asimi') d.zamanAsimi += 1;
  else if (sonuc === 'bellek') d.bellek += 1;
  else if (sonuc === 'hata') d.hata += 1;
}

// Ortak üst sınır (3723): motor, değerlendirme (4 parça), teklif ve yıllık kendi kuyruklarıyla aynı anda 8 iş parçacığına çıkabiliyordu;
// tek sunucuda veritabanı ve ana iş parçacığıyla işlemci ve bellek (8 x 2 GB) için yarışıyordu. Şimdi en çok 6: motor kendi tek yerinde
// (plan kilidini tutan işlemin içinde koşar, başka hesabın arkasında beklemez), yıllık çözücü kendi tek yerinde (yillik-cozucu
// ESZAMANLI_AZAMI), değerlendirme ve teklif ise bu havuzun 4 yerini geliş sırasıyla paylaşır. 4, plan seçeneklerinin parça sayısıdır:
// tek değerlendirme bugünkü kadar sürede biter; yalnız aynı anda teklif denemesi koşarken bir parçası sıra bekler. Bekleme hesabın kendi
// süresine dahildir. Değer VARSAYIM, canlıda ölçülmedi; sağlık ekranındaki süre ve zaman aşımı sayaçları dar kalıp kalmadığını gösterir.
export const ISCI_HAVUZU = 4;

export interface IsciYeri {
  // Yer verilince çözülür.
  hazir: Promise<void>;
  // Yer verildiyse bırakır, hâlâ bekliyorsa sıradan çıkar; birden çok çağrı zararsızdır.
  birak: () => void;
}

export interface YerHavuzu {
  yerIste: () => IsciYeri;
  durum: () => { calisan: number; bekleyen: number };
}

export function yerHavuzu(enCok: number): YerHavuzu {
  let calisan = 0;
  const sira: (() => void)[] = [];
  const ilerlet = (): void => {
    while (calisan < enCok && sira.length > 0) sira.shift()?.();
  };
  return {
    yerIste: () => {
      let verildi = false;
      let birakildi = false;
      let ver: (() => void) | null = null;
      const hazir = new Promise<void>((coz) => {
        ver = () => { verildi = true; calisan += 1; coz(); };
        if (calisan < enCok && sira.length === 0) ver();
        else sira.push(ver);
      });
      const birak = (): void => {
        if (birakildi) return;
        birakildi = true;
        if (verildi) { calisan -= 1; ilerlet(); return; }
        const i = ver === null ? -1 : sira.indexOf(ver);
        if (i >= 0) sira.splice(i, 1);
      };
      return { hazir, birak };
    },
    durum: () => ({ calisan, bekleyen: sira.length }),
  };
}

const havuz = yerHavuzu(ISCI_HAVUZU);
export const isciYeriIste = (): IsciYeri => havuz.yerIste();

// Kopya döner: okuyan sayacı değiştiremez.
export function planHesapDurumu(): PlanHesapDurumu {
  return { motor: { ...durum.motor }, degerlendirme: { ...durum.degerlendirme }, teklif: { ...durum.teklif }, yillik: { ...durum.yillik } };
}
