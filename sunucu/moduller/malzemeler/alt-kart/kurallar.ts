import type { AltKartTuru, RevizyonDurumu } from '#paylasilan/sozlesme/malzeme-alt-kart.ts';

// Saf kurallar: alt kart bağı ve revizyon yürürlüğü (3438 a). Satır sorgular.ts'teki AltKartSatiri'nin bu kurallara gereken kısmıdır.
export interface AltKartBilgisi {
  no: number;
  tur: string;
  onayDurumu: string;
  anaKartNo: number | null;
  altTur: AltKartTuru | null;
  altEtiket: string | null;
  revDurumu: RevizyonDurumu | null;
  cizimRev: string | null;
  altSayisi: number;
}

const ayni = (a: string | null, b: string | null): boolean => a !== null && b !== null && a.trim().toLocaleUpperCase('tr') === b.trim().toLocaleUpperCase('tr');

// Ana kartın etiketi alt etiket değil çizim revizyonudur; alt kartta alt etikettir.
export function revizyonEtiketi(k: Pick<AltKartBilgisi, 'altEtiket' | 'cizimRev'>): string | null {
  return k.altEtiket ?? k.cizimRev;
}

// Kart ana kartın altına bağlanabilir mi; olmazsa kullanıcıya gidecek ileti. `aile` ana kart ve şimdiki alt kartlarıdır.
export function altBagHatasi(kart: AltKartBilgisi, ana: AltKartBilgisi, tur: AltKartTuru, etiket: string, aile: readonly AltKartBilgisi[]): string | null {
  if (kart.no === ana.no) return 'Kart kendi altına bağlanamaz.';
  if (kart.onayDurumu === 'iptal' || ana.onayDurumu === 'iptal') return 'Silinmiş kart alt kart bağına girmez.';
  if (kart.anaKartNo !== null) return 'Kart zaten bir ana kartın alt kartı.';
  if (kart.altSayisi > 0) return 'Alt kartı olan kart başka kartın altına bağlanamaz; tek seviye.';
  if (kart.revDurumu !== null) return 'Kartın kendi revizyonları var; başka kartın altına bağlanamaz.';
  if (ana.anaKartNo !== null) return 'Seçilen ana kart da bir alt kart; ana kartını seçin.';
  if (kart.tur !== ana.tur) return 'Alt kart ana kartla aynı türde olmalı.';
  if (tur === 'revizyon' && aile.some((k) => (k.no === ana.no ? ayni(k.cizimRev, etiket) : k.altTur === 'revizyon' && ayni(k.altEtiket, etiket)))) {
    return `Bu ailede ${etiket} revizyonu zaten var.`;
  }
  if (tur === 'alternatif' && aile.some((k) => k.altTur === 'alternatif' && ayni(k.altEtiket, etiket))) return `Bu ailede ${etiket} alternatifi zaten var.`;
  return null;
}

// Revizyon bağında kartın ve ana kartın yeni durumu. İlk revizyon bağlanınca ana kart yürürlükteki revizyon olur (bugün kullanılan odur).
export function revizyonBagDurumlari(ana: AltKartBilgisi, eski: boolean): { kart: RevizyonDurumu; ana: RevizyonDurumu | null } {
  return { kart: eski ? 'eski' : 'taslak', ana: ana.revDurumu === null ? 'yururlukte' : null };
}

// Bağ yalnız henüz yürürlüğe girmemiş revizyondan ya da alternatiften kaldırılır; yürürlükte ya da eski revizyon izdir.
export function bagKaldirmaHatasi(kart: AltKartBilgisi): string | null {
  if (kart.anaKartNo === null) return 'Kart bir alt kart değil.';
  // Eski revizyonun bağı da kaldırılır (yanlış bağlanan kart ailede kalmaz); emir ve sipariş kart numarasını tuttuğu için iz bozulmaz.
  if (kart.altTur === 'revizyon' && kart.revDurumu === 'yururlukte') return 'Yürürlükteki revizyonun bağı kaldırılmaz; önce başka revizyonu yürürlüğe alın.';
  return null;
}

// Yürürlüğe alma: revizyonu olan ailede, onaylanmış (aktif) ve şimdi yürürlükte olmayan kart.
export function yururlugeAlmaHatasi(kart: AltKartBilgisi): string | null {
  if (kart.altTur === 'alternatif') return 'Alternatif kart yürürlüğe alınmaz; yalnız revizyon.';
  if (kart.revDurumu === null) return 'Kartın revizyon ailesi yok; önce revizyon ekleyin.';
  if (kart.revDurumu === 'yururlukte') return 'Bu revizyon zaten yürürlükte.';
  if (kart.onayDurumu !== 'aktif') return 'Yalnız onaylanmış (aktif) revizyon kartı yürürlüğe alınır.';
  return null;
}
