// Çizim Merkezi'nden alınan paket dosyaları (kart #800). Saf yardımcılar: ağ ve ekran yok.
// Paketin dosya kaydı `merkez` (belge no) ve `merkezOzet` (alındığı andaki yayındaki dosyanın özeti) taşır; yerel yüklemede ikisi de yoktur.
export interface MerkezDosyasi { kind: string; name: string; merkez?: unknown; merkezOzet?: unknown; [k: string]: unknown }
export interface MerkezDurumu { belgeId: number; durum: 'guncel' | 'yeni-revizyon' | 'yayindan-kalkti'; ozet: string | null }

const OZET = /^[0-9a-f]{64}$/;

export function merkezBagi(f: MerkezDosyasi): { belgeId: number; ozet: string } | null {
  if (typeof f.merkez !== 'number' || !Number.isSafeInteger(f.merkez) || f.merkez < 1) return null;
  if (typeof f.merkezOzet !== 'string' || !OZET.test(f.merkezOzet)) return null;
  return { belgeId: f.merkez, ozet: f.merkezOzet };
}

// Sunucu kontrolü en çok 50 çift alır; aynı belge bir kez sorulur.
export function merkezKontrolIstegi(files: readonly MerkezDosyasi[]): { belgeId: number; ozet: string }[] {
  const gorulen = new Set<number>();
  const istek: { belgeId: number; ozet: string }[] = [];
  for (const f of files) {
    const bag = merkezBagi(f);
    if (bag === null || gorulen.has(bag.belgeId)) continue;
    gorulen.add(bag.belgeId);
    istek.push(bag);
  }
  return istek.slice(0, 50);
}

// Belge no -> durum; yalnız "Yeni revizyon var" ve "Yayından kalktı" ekranda görünür, güncel olan görünmez.
export function merkezUyarilari(durumlar: readonly MerkezDurumu[]): Record<number, 'yeni-revizyon' | 'yayindan-kalkti'> {
  const uyari: Record<number, 'yeni-revizyon' | 'yayindan-kalkti'> = {};
  for (const d of durumlar) if (d.durum !== 'guncel') uyari[d.belgeId] = d.durum;
  return uyari;
}

// Merkezden gelen dosya pakete girer. Aynı belgenin kaydı varsa YERİNE geçer (sıra ve ana resim seçimi korunur, ad değiştiyse ana resim yeni ada
// taşınır, kontrol planı kalır); yoksa yerel yüklemedeki gibi aynı türdekinin yerini alır ve ana resim o kurala göre seçilir.
export function merkezDosyasiniKoy<T extends MerkezDosyasi>(
  paket: { files: readonly T[]; primary: string | null }, yeni: T,
): { files: T[]; primary: string | null; planSifirla: boolean; yerineGecti: boolean } {
  const sira = paket.files.findIndex((f) => f.merkez === yeni.merkez && yeni.merkez !== undefined);
  if (sira >= 0) {
    const eski = paket.files[sira]!;
    const files = paket.files.map((f, i) => (i === sira ? yeni : f));
    return { files, primary: paket.primary === eski.name ? yeni.name : paket.primary, planSifirla: false, yerineGecti: true };
  }
  const files = paket.files.filter((f) => f.kind !== yeni.kind).concat([yeni]);
  const primary = yeni.kind === 'pdf' ? yeni.name : (paket.primary !== null && files.some((f) => f.name === paket.primary) ? paket.primary : yeni.name);
  return { files, primary, planSifirla: primary !== paket.primary, yerineGecti: false };
}

// Pakete ve stüdyoya dosya yalnız belge merkezinden eklenir; yerel yükleme ve örnek dosya yoktur.
export const MERKEZDEN_EKLENIR = 'Dosyalar TMI belge merkezinden eklenir';
