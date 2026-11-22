import { AYNI_BITIS, donemAnahtari, gecMi, ilkPlanaGore, saatTarihi, sonGunMu, type Donem, type SevkSatiri } from './kurallar.ts';

// 3537 a: Sevk takvimi listesinin saf parçaları. Sipariş başına tek satır; durum, süzgeç çipi sayıları, sıralama, arama ve dönem
// grupları burada (görünüm yalnız çizer). Hesaplar kurallar.ts'tendir (geç, son gün, ertelenen); burada yalnız sınıflama vardır.

export type SevkListeDurumu = 'sevk' | 'gec' | 'bitissiz' | 'son-gun' | 'ertelendi' | 'hafta' | 'zamaninda';
export type SevkListeTonu = 'hata' | 'uyari' | 'tamam' | 'bilgi';

// Çip sırası ekrandaki sıradır. "Bitişi yok" planın bitiş vermediği sipariştir (sıfır ya da tarih uydurulmaz); yalnız varsa çip çıkar.
export const SEVK_DURUMLARI: readonly (readonly [SevkListeDurumu, string, SevkListeTonu])[] = [
  ['gec', 'Geç', 'hata'], ['son-gun', 'Son gün', 'uyari'], ['hafta', 'Bu hafta', 'bilgi'], ['ertelendi', 'Ertelendi', 'uyari'],
  ['zamaninda', 'Zamanında', 'tamam'], ['sevk', 'Sevk edildi', 'bilgi'], ['bitissiz', 'Bitişi yok', 'bilgi'],
];
export const SEVK_ADI = Object.fromEntries(SEVK_DURUMLARI.map(([d, ad]) => [d, ad])) as Record<SevkListeDurumu, string>;
export const SEVK_TONU = Object.fromEntries(SEVK_DURUMLARI.map(([d, , t]) => [d, t])) as Record<SevkListeDurumu, SevkListeTonu>;

export interface SevkListeSatiri {
  x: SevkSatiri;
  durum: SevkListeDurumu;
  // Plana göre bitiş eksi termin (saat, artı geç); ikisinden biri yoksa null. Geç satırda planın kendi aşımıdır.
  fark: number | null;
}

// Satırın şimdiki haftasında mı: hafta pazartesi başlar (donemAnahtari ile aynı hafta).
export function buHaftaMi(taban: number, simdi: number, t: number): boolean {
  return donemAnahtari(saatTarihi(taban, t), 'hafta').anahtar === donemAnahtari(saatTarihi(taban, simdi), 'hafta').anahtar;
}

export const ertelendiMi = (x: SevkSatiri): boolean => (ilkPlanaGore(x.gecmis) ?? 0) > AYNI_BITIS;

// Çipler birbirini dışlar; sıra: Sevk edildi, Geç, Bitişi yok, Son gün, Ertelendi, Bu hafta, Zamanında (V2).
export function sevkListeDurumu(x: SevkSatiri, taban: number, simdi: number): SevkListeDurumu {
  if (x.sevk) return 'sevk';
  if (gecMi(x)) return 'gec';
  if (x.C === null) return 'bitissiz';
  if (sonGunMu(x)) return 'son-gun';
  if (ertelendiMi(x)) return 'ertelendi';
  return buHaftaMi(taban, simdi, x.C) ? 'hafta' : 'zamaninda';
}

export function sevkFarki(x: SevkSatiri): number | null {
  if (gecMi(x) && x.T !== null) return x.T;
  return x.C !== null && x.termin !== null ? x.C - x.termin : null;
}

// Sıra: sevk edilmeyenler önce; geç satırlar en üstte; sonra plana göre bitiş (bitişsiz sonda). Sevk edilenler en altta.
export function sevkListeSatirlari(l: readonly SevkSatiri[], taban: number, simdi: number): SevkListeSatiri[] {
  const sira = (s: SevkListeSatiri): number => (s.durum === 'sevk' ? 2 : s.durum === 'gec' ? 0 : 1);
  return l
    .map((x): SevkListeSatiri => ({ x, durum: sevkListeDurumu(x, taban, simdi), fark: sevkFarki(x) }))
    .sort((a, b) => sira(a) - sira(b) || (a.x.C ?? Infinity) - (b.x.C ?? Infinity) || a.x.id.localeCompare(b.x.id, 'tr'));
}

export function durumSayilari(l: readonly SevkListeSatiri[]): Record<SevkListeDurumu, number> {
  const s = Object.fromEntries(SEVK_DURUMLARI.map(([d]) => [d, 0])) as Record<SevkListeDurumu, number>;
  for (const x of l) s[x.durum] += 1;
  return s;
}

// Arama sipariş no (emir numarası ve kimlik), ürün ve müşteride; büyük küçük harf ve Türkçe harf duyarsız.
export function aramaUyar(s: SevkListeSatiri, ara: string, emirNo: (id: string) => string): boolean {
  const q = ara.trim().toLocaleLowerCase('tr-TR');
  if (q === '') return true;
  return [emirNo(s.x.id), s.x.id, s.x.ad ?? '', s.x.musteri].some((m) => m.toLocaleLowerCase('tr-TR').includes(q));
}

export interface SevkListeGrubu { anahtar: string; ad: string; satirlar: SevkListeSatiri[] }

// Başlıklar: geç kalanlar en üstte, sonra bitiş dönemleri zaman sırasıyla, bitişsizler, en altta sevk edilenler. Boş grup yoktur.
export function sevkListeGruplari(l: readonly SevkListeSatiri[], taban: number, k: Donem): SevkListeGrubu[] {
  const gec: SevkListeSatiri[] = [], bitissiz: SevkListeSatiri[] = [], sevk: SevkListeSatiri[] = [];
  const donemler = new Map<string, SevkListeGrubu>();
  for (const s of l) {
    if (s.durum === 'gec') gec.push(s);
    else if (s.durum === 'sevk') sevk.push(s);
    else if (s.x.C === null) bitissiz.push(s);
    else {
      const { anahtar, ad } = donemAnahtari(saatTarihi(taban, s.x.C), k);
      const g = donemler.get(anahtar) ?? { anahtar, ad, satirlar: [] };
      g.satirlar.push(s);
      donemler.set(anahtar, g);
    }
  }
  const sirali = [...donemler.values()].sort((a, b) => (a.anahtar < b.anahtar ? -1 : a.anahtar > b.anahtar ? 1 : 0));
  return [
    { anahtar: 'gec', ad: 'Geç kalanlar', satirlar: gec }, ...sirali,
    { anahtar: 'bitissiz', ad: 'Plana göre bitişi yok', satirlar: bitissiz }, { anahtar: 'sevk', ad: 'Sevk edildi', satirlar: sevk },
  ].filter((g) => g.satirlar.length > 0);
}
