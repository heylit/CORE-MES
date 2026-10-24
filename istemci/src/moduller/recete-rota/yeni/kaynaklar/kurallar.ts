// R2 parçasının saf hesapları (Süreler, Malzemeler, Kaynaklar). Ekran çizmez, istek atmaz; birim testlidir. Veri yoksa null döner,
// sıfır uydurulmaz.

/* ---------------- sayı girişi ---------------- */

// Kullanıcının yazdığı süre ya da tutar ("3,5", "12.25"). Boş: null (alan boşaltıldı). Geçersiz ya da eksi: hata iletisi.
export type SayiGirdisi = { tamam: true; deger: number | null } | { tamam: false; ileti: string };
export function sayiGirdisi(ham: string, azami = 99_999): SayiGirdisi {
  const t = ham.trim().replace(',', '.');
  if (t === '') return { tamam: true, deger: null };
  if (!/^\d+(\.\d+)?$/.test(t)) return { tamam: false, ileti: 'Sıfır ya da sıfırdan büyük bir sayı girin.' };
  const v = Number(t);
  if (!Number.isFinite(v) || v > azami) return { tamam: false, ileti: `En çok ${String(azami)} girilebilir.` };
  return { tamam: true, deger: Math.round(v * 1e4) / 1e4 };
}

// Sunucunun ondalık metni ("12.50") sayıya; yoksa null.
export const ondalik = (v: string | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export const oranMetni = (v: number | null): string => (v === null ? '—' : `%${v.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`);

/* ---------------- Malzemeler ---------------- */

export const MALZEME_TURLERI = [
  ['ham', 'Hammadde'], ['yari', 'Yarı mamul'], ['mamul', 'Mamul'], ['sarf', 'Sarf malzemesi'], ['demirbas', 'Demirbaş'], ['hizmet', 'Hizmet'],
] as const;
export type MalzemeTuru = (typeof MALZEME_TURLERI)[number][0];
export const turAdi = (t: string): string => MALZEME_TURLERI.find(([k]) => k === t)?.[1] ?? t;

interface AranabilirMalzeme { code: string; name: string; type: string; kategori: string | null; kategoriAdi: string | null }
const kucuk = (s: string) => s.toLocaleLowerCase('tr-TR');

export function malzemeSuz<M extends AranabilirMalzeme>(liste: readonly M[], s: { arama: string; tur: string; kategori: string }): M[] {
  const q = kucuk(s.arama.trim());
  return liste.filter((m) => (!s.tur || m.type === s.tur) && (!s.kategori || m.kategori === s.kategori)
    && (!q || kucuk(`${m.code} ${m.name}`).includes(q)));
}

// Seçili türün kartlarındaki kategoriler (ilk görülme sırasıyla); tür seçili değilse boş (bugünkü ekran kategori çiplerini tür seçince çizer).
export function kategoriler(liste: readonly AranabilirMalzeme[], tur: string): Array<[string, string]> {
  if (!tur) return [];
  const sonuc = new Map<string, string>();
  for (const m of liste) if (m.type === tur && m.kategori && !sonuc.has(m.kategori)) sonuc.set(m.kategori, m.kategoriAdi ?? m.kategori);
  return [...sonuc.entries()];
}

// Stok minimumun altında mı: stok ya da minimum yoksa hayır.
export const minimumAltinda = (stok: number | null, min: number | null): boolean => stok !== null && min !== null && min > 0 && stok < min;

// Kayıt belgesinde kalan, kartı olmayan eski kalemler (204 a: yalnız okunur). Belgenin biçimi prototipindir; beklenmeyen satır atlanır.
export interface EskiKalem { id: string; kod: string; ad: string; tur: string }
export function eskiKalemler(belge: unknown, kartKimlikleri: ReadonlySet<string>): EskiKalem[] {
  const items = (belge as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];
  const sonuc: EskiKalem[] = [];
  for (const ham of items as unknown[]) {
    const i = ham as Record<string, unknown> | null;
    if (i === null || typeof i !== 'object' || typeof i['id'] !== 'string' || kartKimlikleri.has(i['id'])) continue;
    sonuc.push({ id: i['id'], kod: typeof i['code'] === 'string' ? i['code'] : '', ad: typeof i['name'] === 'string' ? i['name'] : '', tur: typeof i['type'] === 'string' ? i['type'] : '' });
  }
  return sonuc;
}

// Elle tanımlanan statünün türleri (tablonun kısıtı) ve yeni statünün varsayılan rengi. Statü rengi tabloda tutulan veridir (#RRGGBB),
// ekranın rengi değildir; liste bugünkü ekranın sırasıdır.
export const STATU_TURLERI = [['uretim', 'Üretim aşaması'], ['kalite', 'Kalite'], ['ret', 'Ret / hurda'], ['giris', 'Giriş']] as const;
export const STATU_RENKLERI = ['#2F6FEB', '#0E7F81', '#C96A00', '#8A4FD3', '#C8102E', '#3E8E2E', '#9A7400', '#C2408A', '#4B5D7A', '#1F9E6A'] as const;

/* ---------------- Kaynaklar ---------------- */

// Gün sırası pazartesiden pazara; gün numarası 0 pazar ... 6 cumartesi (vardiya takviminin köprüdeki biçimi).
export const GUNLER = [[1, 'Pzt'], [2, 'Sal'], [3, 'Çar'], [4, 'Per'], [5, 'Cum'], [6, 'Cmt'], [0, 'Paz']] as const;
export const GUN_ADI: Readonly<Record<number, string>> = { 0: 'Pazar', 1: 'Pazartesi', 2: 'Salı', 3: 'Çarşamba', 4: 'Perşembe', 5: 'Cuma', 6: 'Cumartesi' };

export interface Vardiya { id: string; netDakika: number }
export type Hafta = Readonly<Record<number, readonly string[]>>;

// İş merkezinin o günkü net saati: o gün açık vardiyaların molası düşülmüş süresi. Takvimde olmayan vardiya sayılmaz.
export function gunSaati(hafta: Hafta | undefined, gun: number, vardiyalar: readonly Vardiya[]): number {
  return (hafta?.[gun] ?? []).reduce((t, id) => t + (vardiyalar.find((v) => v.id === id)?.netDakika ?? 0) / 60, 0);
}
export function haftaSaati(hafta: Hafta | undefined, vardiyalar: readonly Vardiya[]): number {
  return GUNLER.reduce((t, [g]) => t + gunSaati(hafta, g, vardiyalar), 0);
}
// Vardiyanın o hafta açık olduğu günlerin toplam net saati (matrisin satır toplamı).
export function vardiyaHaftaSaati(hafta: Hafta | undefined, v: Vardiya): number {
  return GUNLER.reduce((t, [g]) => t + ((hafta?.[g] ?? []).includes(v.id) ? v.netDakika / 60 : 0), 0);
}

// Kapasite kaynağı (İstasyonlar modülü): seçilmemişse türden türetilir. Elle yapılan işler personel saatiyle, ötekiler makine saatiyle.
const INSAN_TURLERI = ['kalite', 'montaj', 'depo'];
export type KapasiteKaynagi = 'makine' | 'insan';
export function kapasiteKaynagi(tip: string | null, secili: string | null): KapasiteKaynagi {
  if (secili === 'insan' || secili === 'makine') return secili;
  return tip !== null && INSAN_TURLERI.includes(tip) ? 'insan' : 'makine';
}

interface MakineDurumlu { stationId: string | null; status: string }
// İstasyonun çalışabilir makine sayısı: makine tanımlıysa aktif olanlar, değilse istasyonun paralel adedi (en az 1).
export function etkinMakine(istasyonId: string, adet: number, makineler: readonly MakineDurumlu[]): number {
  const ms = makineler.filter((m) => m.stationId === istasyonId);
  return ms.length === 0 ? Math.max(1, Math.round(adet || 1)) : ms.filter((m) => m.status === 'aktif').length;
}

interface Yetkin { skills: readonly string[]; active: boolean }
export const yetkinler = <K extends Yetkin>(istasyonId: string, kisiler: readonly K[]): K[] =>
  kisiler.filter((k) => k.active && k.skills.includes(istasyonId));

// Önerilen yeni kod: önekin en büyük numarasından bir adım sonrası ("IM-10" -> "IM-20"); bugünkü ekranın önerisi.
export function sonrakiKod(kodlar: readonly string[], onek: string, adim = 10): string {
  let enBuyuk = 0;
  const desen = new RegExp(`^${onek}-(\\d+)$`);
  for (const k of kodlar) { const m = desen.exec(k); if (m) enBuyuk = Math.max(enBuyuk, Number(m[1])); }
  return `${onek}-${String(enBuyuk + adim).padStart(2, '0')}`;
}

// Ad soyaddan baş harfler (personel kartı).
export const basHarfler = (ad: string): string =>
  ad.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0] ?? '').join('').toLocaleUpperCase('tr-TR') || '?';

// Yetkinlik listesine istasyon ekler ya da çıkarır (sayı kimlikleri; sıra korunur).
export function yetkinlikDegistir(mevcut: readonly string[], istasyonId: string): number[] {
  const yeni = mevcut.includes(istasyonId) ? mevcut.filter((x) => x !== istasyonId) : [...mevcut, istasyonId];
  return yeni.map(Number);
}

// Kayıt belgesindeki plan ekleri (Fason ve aparat): yalnız okunur. Biçim prototipindir; beklenmeyen satır atlanır.
export interface FasonEki { id: string; ad: string; kapasite: number | null; sureGun: number | null; cikisSaat: string | null; cikisGunleri: string[] }
export interface AparatEki { id: string; ad: string; adet: number | null }
const sayiYaDaNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
export function planEkleri(belge: unknown): { fasoncular: FasonEki[]; aparatlar: AparatEki[] } {
  const plan = (belge as { plan?: unknown } | null)?.plan as { fasoncular?: unknown; aparatlar?: unknown } | null | undefined;
  const liste = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).filter((x): x is Record<string, unknown> => x !== null && typeof x === 'object') : []);
  return {
    fasoncular: liste(plan?.fasoncular).filter((f) => typeof f['id'] === 'string').map((f) => ({
      id: f['id'] as string, ad: typeof f['ad'] === 'string' ? f['ad'] : '', kapasite: sayiYaDaNull(f['kapasite']), sureGun: sayiYaDaNull(f['sureGun']),
      cikisSaat: typeof f['cikisSaat'] === 'string' ? f['cikisSaat'] : null,
      cikisGunleri: Array.isArray(f['cikisGunleri']) ? (f['cikisGunleri'] as unknown[]).filter((g): g is string => typeof g === 'string') : [],
    })),
    aparatlar: liste(plan?.aparatlar).filter((a) => typeof a['id'] === 'string').map((a) => ({
      id: a['id'] as string, ad: typeof a['ad'] === 'string' ? a['ad'] : '', adet: sayiYaDaNull(a['adet']),
    })),
  };
}

// "08:30" -> 510 dakika; geçersizse null. Bitiş başlangıçtan önce ya da eşitse süre gece yarısını geçer (bugünkü ekranın kuralı).
export function saatDakika(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const sa = Number(m[1]);
  const dk = Number(m[2]);
  return sa > 24 || dk > 59 ? null : sa * 60 + dk;
}
export function aralikDakika(baslangic: string, bitis: string): number | null {
  const a = saatDakika(baslangic);
  const b = saatDakika(bitis);
  if (a === null || b === null) return null;
  return b > a ? b - a : b + 1440 - a;
}

// Fason firmanın çıkış günleri kayıtta bu anahtarlarla durur.
export const PLAN_GUNLERI = [['pzt', 'Pzt'], ['sal', 'Sal'], ['car', 'Çar'], ['per', 'Per'], ['cum', 'Cum'], ['cmt', 'Cmt'], ['paz', 'Paz']] as const;
export const gunListesi = (gunler: readonly string[]): string =>
  PLAN_GUNLERI.filter(([g]) => gunler.includes(g)).map(([, ad]) => ad).join(', ');
export function geceyiGecer(baslangic: string, bitis: string): boolean {
  const a = saatDakika(baslangic);
  const b = saatDakika(bitis);
  return a !== null && b !== null && b <= a;
}
