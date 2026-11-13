// R2 parçasının saf hesapları (Süreler, Malzemeler, Kaynaklar). Ekran çizmez, istek atmaz; birim testlidir. Veri yoksa null döner,
// sıfır uydurulmaz.
import { sirali, statuNo, tasinanMalzeme, TUR_KISA, type Adim } from '../rotalar/kurallar.ts';

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

/* ---------------- Süreler (2564 a) ---------------- */

// Girdi kutusundaki ondalık virgüllüdür (2566 S-4: 0.71 değil 0,71); sayiGirdisi ikisini de okur.
export const virgullu = (v: number | null): string => (v === null ? '' : String(v).replace('.', ','));

// Ölçüm türünün karşılaştırıldığı teorik süre. "İşlem" ölçümü değişim dahil birim süredir (170 b): teorik işlem + değişim.
export interface TeorikSure { hazirlikDk: number | null; islemDk: number | null; degisimDk: number | null }
export function karsilastirmaTeorigi(t: TeorikSure, tur: 'hazirlik' | 'islem' | 'degisim'): number | null {
  if (tur === 'hazirlik') return t.hazirlikDk;
  if (tur === 'degisim') return t.degisimDk;
  return t.islemDk === null ? null : Math.round((t.islemDk + (t.degisimDk ?? 0)) * 1e4) / 1e4;
}

// Sapma % = (gerçekleşen − teorik) ÷ teorik × 100, tam sayıya yuvarlı. Teorik yoksa ya da 0 ise null (oran tanımsız).
export const SAPMA_ESIGI_YUZDE = 15;
export function sapmaYuzdesi(gercek: number | null, teorik: number | null): number | null {
  if (gercek === null || teorik === null || teorik <= 0) return null;
  return Math.round(((gercek - teorik) / teorik) * 100);
}
export const sapiyor = (s: number | null): boolean => s !== null && Math.abs(s) > SAPMA_ESIGI_YUZDE;
export const sapmaMetni = (s: number): string => `${s > 0 ? '+' : s < 0 ? '−' : ''}%${String(Math.abs(s))}`;

// Ortanca 3'ten az ölçümdense güvenilir değildir; kabul yine yapılır, sunucu da uyarır (2564 a).
export const AZ_OLCUM = 3;

// Plan teorik süreyle hesaplanır (169 c); plan sütunu yalnız planın kullandığı süre teorikten farklıysa bir şey söyler.
export interface EtkinSure { hazirlikDk: number | null; birimSureDk: number | null; islemDk: number | null; degisimDk: number | null }
// Boş süre ile 0 plan için aynıdır (adım o süreyi kullanmaz).
export function planTeoriktenFarkli(t: TeorikSure, e: EtkinSure): boolean {
  const f = (a: number | null, b: number | null): boolean => (a ?? 0) !== (b ?? 0);
  return f(t.hazirlikDk, e.hazirlikDk) || f(t.islemDk, e.islemDk ?? e.birimSureDk) || f(t.degisimDk, e.degisimDk);
}

// Süzgeç: bekleyen ölçümü olan adım ya da bir türü eşiği aşan adım.
export type SureSuzgeci = '' | 'bekleyen' | 'sapan';
export function sureSuzgecindenGecer(s: SureSuzgeci, bekleyenVar: boolean, sapmalar: ReadonlyArray<number | null>): boolean {
  if (s === 'bekleyen') return bekleyenVar;
  if (s === 'sapan') return sapmalar.some(sapiyor);
  return true;
}

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

// Statülü kart satırı (eski ekranın "Statülü kartlar" satırı). Kart üçlüdür: bu malzeme, hangi ürünün rotasında, hangi OP. Statü yalnız
// rota tanımından gelir (256 a): rotanın son adımı dışındaki her adım taşıdığı malzemenin kartını kendiliğinden açar. Stokta bakiyesi olan
// statü de karttır (bakiye Stok'tadır). Miktar yalnız stok okunduysa vardır; okunamadıysa null (sıfır yazılmaz). Ara kart adetle sayılır (520 1 a).
export interface StatuluKart {
  anahtar: string; urunId: string | null; urunKodu: string | null; opNo: number | null; baslik: string; miktar: number | null; birim: string; rotaAdimi: boolean;
}
interface KartMalzemesi { id: string; code: string; type: string; unit: string | null }
interface KartStatusu { id: number; malzemeNo: string; kaynakAdim: string; ad: string; urunKodu?: string | null }
interface KartKirilimi { statuId: number | null; miktar: string | number }
export interface StatuluKartGirdisi {
  malzemeler: readonly KartMalzemesi[];
  rotalar: Readonly<Record<string, { steps: readonly Adim[] }>> | null;
  opAdi: (opId: string) => string | null;
  statuler: readonly KartStatusu[] | null;
  // Malzemenin statü kırılımı; stok okunmadıysa undefined ya da null.
  kirilim: (malzemeId: string) => readonly KartKirilimi[] | null | undefined;
}
export function statuluKartlar(m: KartMalzemesi, g: StatuluKartGirdisi): StatuluKart[] {
  const var_ = new Set(g.malzemeler.map((x) => x.id));
  const malzemeVar = (id: string) => var_.has(id);
  const kirilim = g.kirilim(m.id) ?? null;
  const miktar = (statuId: number): number | null => {
    if (kirilim === null) return null;
    return kirilim.filter((k) => k.statuId === statuId).reduce((t, k) => t + (Number(k.miktar) || 0), 0);
  };
  // Aynı malzeme farklı ürünlerde ayrı statüdür: ürün kodu biliniyorsa o da tutmalı.
  const statuBul = (adimId: string, urunKodu: string) => g.statuler?.find((x) => x.malzemeNo === m.code && x.kaynakAdim === adimId
    && (x.urunKodu === undefined || x.urunKodu === null || x.urunKodu === urunKodu)) ?? null;
  const out: StatuluKart[] = [];
  const gorulen = new Set<string>();
  const kullanilan = new Set<number>();
  for (const [rid, r] of Object.entries(g.rotalar ?? {})) {
    const sahip = g.malzemeler.find((x) => x.id === rid);
    if (!sahip || sahip.type === 'ham') continue;
    const ss = sirali(r.steps);
    ss.slice(0, -1).forEach((a, i) => {
      if (tasinanMalzeme(rid, ss, i, malzemeVar) !== m.id) return;
      const anahtar = `${rid}|${a.id}`;
      if (gorulen.has(anahtar)) return;
      gorulen.add(anahtar);
      const st = statuBul(a.id, sahip.code);
      if (st) kullanilan.add(st.id);
      out.push({
        anahtar, urunId: rid, urunKodu: rid === m.id ? null : sahip.code, opNo: statuNo(a),
        baslik: `${TUR_KISA[m.type] ?? ''} OP ${String(statuNo(a))} ${g.opAdi(a.opId) ?? 'Adım'}`.trim(),
        miktar: st ? miktar(st.id) : (kirilim === null ? null : 0), birim: 'adet', rotaAdimi: true,
      });
    });
  }
  // Rotada karşılığı kalmamış ama bakiyesi olan statü.
  for (const k of kirilim ?? []) {
    if (k.statuId === null || kullanilan.has(k.statuId) || !(Number(k.miktar) > 0)) continue;
    const st = g.statuler?.find((x) => x.id === k.statuId) ?? null;
    const anahtar = `statu|${String(k.statuId)}`;
    if (gorulen.has(anahtar)) continue;
    gorulen.add(anahtar);
    out.push({
      anahtar, urunId: null, urunKodu: null, opNo: null, baslik: st ? st.ad : `Statü ${String(k.statuId)}`, miktar: miktar(k.statuId), birim: 'adet', rotaAdimi: false,
    });
  }
  return out;
}

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
const INSAN_TURLERI = ['kalite', 'montaj', 'tesviye', 'depo'];
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

// Vardiya çubuğu (24 saatlik şerit) için dakika aralıkları: gece yarısını geçen aralık iki parçaya bölünür. Geçersiz saat boş liste verir.
export function gunParcalari(baslangic: string, bitis: string): [number, number][] {
  const a = saatDakika(baslangic);
  const sure = aralikDakika(baslangic, bitis);
  if (a === null || sure === null) return [];
  const b = a + sure;
  return b <= 1440 ? [[a, b]] : [[a, 1440], [0, b - 1440]];
}

/* ---------------- İkincil kaynaklar (3199 A + D) ---------------- */

// Aparat ve özel takım planın ikincil kaynağıdır: tezgâhla birlikte boş olmalı. Satır İstasyonlar'ın aparat kapasitesi kaydıdır.
export const IKINCIL_TUR_ADI = { aparat: 'Aparat', ozel_takim: 'Özel takım' } as const;
export const KISIT_ADI = { sert: 'Sert', izle: 'İzle' } as const;
export const KESINTI_NEDEN_ADI = { bakim: 'Bakım', kalibrasyon: 'Kalibrasyon', odunc: 'Ödünç' } as const;
export const OMUR_BIRIM_ADI = { dk: 'dk', adet: 'adet' } as const;

export interface KesintiSatiri { neden: keyof typeof KESINTI_NEDEN_ADI; baslangic: string; bitis: string; adet: number }

const ikiHane = (n: number) => String(n).padStart(2, '0');
// Kısa tarih ve saat: "13.11 08:00" (yerel saat).
export function kisaZaman(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : `${ikiHane(d.getDate())}.${ikiHane(d.getMonth() + 1)} ${ikiHane(d.getHours())}:${ikiHane(d.getMinutes())}`;
}
// Aynı gün biten aralıkta bitiş yalnız saattir: "13.11 08:00 – 11:00".
export function kesintiAraligi(k: Pick<KesintiSatiri, 'baslangic' | 'bitis'>): string {
  const b = kisaZaman(k.baslangic);
  const s = kisaZaman(k.bitis);
  return b.slice(0, 5) === s.slice(0, 5) ? `${b} – ${s.slice(6)}` : `${b} – ${s}`;
}

// Takvim hücresi: şu an süren kesinti, yoksa en yakın gelecek kesinti; ikisi de yoksa "Açık". Geçmiş kesinti yazılmaz.
export function takvimDurumu(kesintiler: readonly KesintiSatiri[], simdi: number): { metin: string; acik: boolean } {
  const gelecek = kesintiler.filter((k) => Date.parse(k.bitis) > simdi).sort((a, b) => Date.parse(a.baslangic) - Date.parse(b.baslangic));
  const k = gelecek[0];
  if (!k) return { metin: 'Açık', acik: true };
  return { metin: `${KESINTI_NEDEN_ADI[k.neden]} · ${kesintiAraligi(k)}`, acik: false };
}

// Ömür hücresi: yalnız özel takımda; birim dakika (kesme) ya da adet (V15). Değişim süresi yanında.
// Ömür sütunu: "600 dk · kalan 120" (on izleme v7). Kalan şimdiki ömürdür (planın başlangıç ömrü); okunmadıysa (undefined) yazılmaz,
// CNC Kurulum'da yük kaydı yoksa (null) "kalan bilinmiyor".
export function omurMetni(k: { tur: string; omur: number | null; omurBirimi: keyof typeof OMUR_BIRIM_ADI | null }, kalan?: number | null): string | null {
  if (k.tur !== 'ozel_takim' || k.omur === null || k.omurBirimi === null) return null;
  const say = (x: number) => x.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
  const omur = `${say(k.omur)} ${OMUR_BIRIM_ADI[k.omurBirimi]}`;
  return kalan === undefined ? omur : `${omur} · kalan ${kalan === null ? 'bilinmiyor' : say(Math.round(kalan))}`;
}

// <input type="datetime-local"> değeri (yerel) ile sunucunun ISO zamanı arasında.
export function yerelGirdi(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getFullYear())}-${ikiHane(d.getMonth() + 1)}-${ikiHane(d.getDate())}T${ikiHane(d.getHours())}:${ikiHane(d.getMinutes())}`;
}
export function yereldenIso(v: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
