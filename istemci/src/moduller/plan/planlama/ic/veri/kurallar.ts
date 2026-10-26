import type { ExtraAlanlar, PlanVerisi, PlanlamaCalismasi, Siparis } from '../../tipler.ts';
import type { SimgeAdi } from '../../../../../ortak/tasarim/simgeler.ts';
import { saatOku, tabanMs, UFUK_GUN, type Derleme } from '../../motor/kurallar.ts';

// "Veri ve kısıtlar" ekranının saf hesapları (bugünkü sayfa: cerceve/planlama/parca/02-orta.betik, d-kisitlar.betik, 05-olaylar.betik).
// Görünümler yalnız okur ve çalışma komutuna değişiklik işlevi verir; burada yazma yoktur.

const nesne = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const metin = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const sayi = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const nesneler = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(nesne) : []);

// --- ekranın görünümleri (b-kabuk.betik EKRANLAR veri): sıra, ad ve simge bugünkü sayfanındır ---
export const VERI_BOLUMLERI = [
  ['siparisler', 'Siparişler', 'list'], ['kisitlar', 'Kısıtlar', 'target'], ['tezgahlar', 'Tezgâhlar', 'cpu'], ['rotalar', 'Ürün ve rota', 'layers'],
  ['takvim', 'Takvim', 'clock'], ['personel', 'Personel', 'user'], ['malzeme', 'Malzeme', 'box'], ['fason', 'Fason ve aparat', 'truck'],
  ['ayar', 'Ayar matrisi', 'grid'], ['denetim', 'Veri denetimi', 'scan'],
] as const satisfies readonly (readonly [string, string, SimgeAdi])[];
export type VeriBolumu = (typeof VERI_BOLUMLERI)[number][0];
export const ILK_BOLUM: VeriBolumu = 'siparisler';
export const bolumAdi = (b: VeriBolumu): string => VERI_BOLUMLERI.find((x) => x[0] === b)?.[1] ?? b;
export const bolumOku = (v: unknown): VeriBolumu | null => VERI_BOLUMLERI.find((x) => x[0] === v)?.[0] ?? null;

// --- kaynak verisinin sahibi (222 a) ---
// Her açılışta sahibinden yeniden kurulan alanlar (sunucu girdi.betik TMI_KAYNAK_ALANLARI): ekranda yalnız okunur. Öteki alanlar (ayar matrisi,
// aparat, tedarikçi, plan ayarları, arıza ve ek mesai) yalnız planlama çalışmasındadır ve çalışma komutuyla yazılır.
export const KAYNAK_ALANLARI = [
  'tezgahlar', 'personel', 'vardiyalar', 'calismaGunleri', 'tatiller', 'urunler', 'malzemeler', 'siparisler', 'fasoncular', 'opAdet', 'devamsizlik', 'satinalma',
] as const;

// --- çalışmanın genişletilmiş alanları (tipler.ts ExtraAlanlar ile taşınan) ---
export interface Vardiya { id: string; bas: string; bit: string }
export interface Aparat { id: string; ad: string; adet: number | null }
export interface Tedarikci { id: string; ad: string; ortGecikmeGun: number | null; sapmaGun: number | null }
export interface SatinAlma { kod: string; miktar: number | null; gelis: string | null; tedarikci: string | null; tb: boolean }
export interface AyarGecisi { den: string; ye: string; dk: number }
export interface Devamsizlik { personel: string; gun: string }

export function vardiyalar(D: PlanVerisi): Vardiya[] {
  return nesneler(D.vardiyalar).flatMap((v) => (typeof v.id === 'string' ? [{ id: v.id, bas: String(v.bas ?? ''), bit: String(v.bit ?? '') }] : []));
}
export function aparatlar(D: PlanVerisi): Aparat[] {
  return nesneler(D.aparatlar).flatMap((a) => (typeof a.id === 'string' ? [{ id: a.id, ad: metin(a.ad) ?? '', adet: sayi(a.adet) }] : []));
}
export function tedarikciler(D: PlanVerisi): Tedarikci[] {
  return nesneler(D.tedarikciler).flatMap((t) => (typeof t.id === 'string'
    ? [{ id: t.id, ad: metin(t.ad) ?? '', ortGecikmeGun: sayi(t.ortGecikmeGun), sapmaGun: sayi(t.sapmaGun) }] : []));
}
export function satinalmalar(D: PlanVerisi): SatinAlma[] {
  return nesneler(D.satinalma).flatMap((p) => (typeof p.kod === 'string'
    ? [{ kod: p.kod, miktar: sayi(p.miktar), gelis: metin(p.gelis), tedarikci: metin(p.tedarikci), tb: !!p.tb }] : []));
}
export function ayarMatrisi(D: PlanVerisi): AyarGecisi[] {
  return nesneler(D.ayarMatrisi).flatMap((e) => (typeof e.den === 'string' && typeof e.ye === 'string' && sayi(e.dk) !== null
    ? [{ den: e.den, ye: e.ye, dk: e.dk as number }] : []));
}
export function devamsizliklar(D: PlanVerisi): Devamsizlik[] {
  return nesneler(D.devamsizlik).flatMap((d) => (typeof d.personel === 'string' ? [{ personel: d.personel, gun: String(d.gun ?? '') }] : []));
}
export const ayarlar = (D: PlanVerisi): Record<string, unknown> => (nesne(D.ayarlar) ? D.ayarlar : {});

// --- gün ve saat (fmtDT, girdiDT, DTgirdi, gunIndeks) ---
export const GUNLER = ['pzt', 'sal', 'car', 'per', 'cum', 'cmt', 'paz'] as const;
export const GUN_AD: Record<(typeof GUNLER)[number], string> = { pzt: 'Pzt', sal: 'Sal', car: 'Çar', per: 'Per', cum: 'Cum', cmt: 'Cmt', paz: 'Paz' };
const iki = (x: number) => String(x).padStart(2, '0');
// Plan saatini tarih-saat kutusunun değerine çevirir ("YYYY-AA-GGTSS:DD"); başlangıç yoksa boş.
export function girdiSaati(D: PlanVerisi, t: number): string {
  const b = tabanMs(D); if (b === null) return '';
  const d = new Date(b + t * 3_600_000);
  return `${d.getUTCFullYear()}-${iki(d.getUTCMonth() + 1)}-${iki(d.getUTCDate())}T${iki(d.getUTCHours())}:${iki(d.getUTCMinutes())}`;
}
export const girdidenSaat = (D: PlanVerisi, v: string): number | null => (v ? saatOku(D, v.replace('T', ' ')) : null);
// Planın d. gününün tarihi ("YYYY-AA-GG") ve tarihin gün sırası.
export const gunTarihi = (D: PlanVerisi, d: number): string => girdiSaati(D, d * 24).slice(0, 10);
export function gunSirasi(D: PlanVerisi, v: string): number | null {
  const t = saatOku(D, v); return t === null ? null : Math.round(t / 24);
}
export function vardiyaSuresi(v: Vardiya): number {
  const hm = (s: string) => { const [h, m] = s.split(':').map(Number); return (h ?? 0) + (m || 0) / 60; };
  let h = hm(v.bit) - hm(v.bas); if (h <= 0) h += 24; return h;
}

// --- siparişler (sSiparisler) ---
export type SiparisSuzgeci = 'hepsi' | 'gec' | 'yuksek';
export const SIPARIS_SUZGECLERI: readonly [SiparisSuzgeci, string][] = [['hepsi', 'Hepsi'], ['gec', 'Gecikenler'], ['yuksek', 'Yüksek öncelik']];
export type PlanJ = Record<string, { C: number | null; T: number | null }>;
// Arama sipariş no, ürün kodu ve ürün adında (data-ara).
export function siparisSuz(l: readonly Siparis[], J: PlanJ, f: SiparisSuzgeci, ara: string, urunAd: (id: string) => string = (id) => id): Siparis[] {
  const q = ara.trim().toLocaleLowerCase('tr-TR');
  return l.filter((s) => {
    if (f === 'gec') { const j = J[s.id]; if (!j || !(j.T == null || j.T > 0.01)) return false; }
    if (f === 'yuksek' && s.oncelik !== 1) return false;
    return !q || `${s.id} ${s.urun} ${urunAd(s.urun)}`.toLocaleLowerCase('tr-TR').includes(q);
  });
}
export type SiparisDurumu = { ad: string; ton: 'pasif' | 'hata' | 'tamam' } | null;
export function siparisDurumu(J: PlanJ | null, id: string): SiparisDurumu {
  if (!J) return null;
  const j = J[id];
  if (!j) return { ad: 'Planda yok', ton: 'pasif' };
  if (j.T == null) return { ad: 'Planlanmadı', ton: 'hata' };
  return j.T > 0.01 ? { ad: `${j.T.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} sa geç`, ton: 'hata' } : { ad: 'Zamanında', ton: 'tamam' };
}
export const ONCELIK: Record<number, [string, 'hata' | 'bilgi' | 'pasif']> = { 1: ['Yüksek', 'hata'], 2: ['Normal', 'bilgi'], 3: ['Düşük', 'pasif'] };

// --- kısıtlar (d-kisitlar.betik KATALOG; araştırma notu cnc/1-kisitlar.md bölüm 2) ---
// durum: tam (motor aynen uygular), yaklasik, karar (kullanıcı kararına bağlı), yok (modelde yok). g: kapatılabilir. p: parametreler.
export type KisitDurumu = 'tam' | 'yaklasik' | 'karar' | 'yok';
export type ParametreYeri = 'w' | 'param' | 'ayarlar';
export type Parametre =
  | { tur: 'sayi'; yer: ParametreYeri; k: string; etiket: string; birim: string; min: number; max: number; adim: number }
  | { tur: 'sec'; yer: ParametreYeri; k: string; etiket: string; secenekler: [string, string][] }
  | { tur: 'fason'; yer: ParametreYeri; k: string; etiket: string };
export interface Kisit { id: string; ad: string; durum: KisitDurumu; g?: true; not?: string; p?: Parametre[]; sayfa?: VeriBolumu }
export interface KisitGrubu { grup: string; simge: SimgeAdi; l: Kisit[] }
const sayiP = (yer: ParametreYeri, k: string, etiket: string, birim: string, min: number, max: number, adim: number): Parametre => ({ tur: 'sayi', yer, k, etiket, birim, min, max, adim });
export const KATALOG: readonly KisitGrubu[] = [
  { grup: 'Makine ve takvim', simge: 'cpu', l: [
    { id: 'tek', ad: 'Tezgâhta aynı anda tek iş', durum: 'tam', not: 'Fiziksel kısıt; kapatılamaz.' },
    { id: 'uygun', ad: 'Tezgâh uygunluğu, alternatif tezgâh ve farklı süre', durum: 'tam', not: 'Rotada her adımın uygun tezgâhları ve çevrimi; motor en iyisini seçer. Verim katsayısı süreyi böler.', sayfa: 'rotalar' },
    { id: 'vardiya', ad: 'Vardiya ve çalışma günü', durum: 'tam', not: 'Fabrika kapalıyken iş yerleşmez; kapatılamaz.', sayfa: 'takvim' },
    { id: 'tvardiya', ad: 'Tezgâhın kendi vardiyası', durum: 'tam', g: true, not: 'Kapatılırsa her tezgâh fabrikanın bütün vardiyalarında çalışır.', sayfa: 'tezgahlar' },
    { id: 'tatil', ad: 'Tatil günleri', durum: 'tam', g: true, sayfa: 'takvim' },
    { id: 'ariza', ad: 'Arıza ve planlı bakım', durum: 'tam', g: true, not: 'Bilinen kapalı pencere takvimden düşülür.', sayfa: 'takvim' },
    { id: 'isiksiz', ad: 'Işıksız (gözetimsiz) çalışma', durum: 'tam', not: 'İşaretli tezgâh vardiya dışında da işler; ayar vardiyada yapılır.', sayfa: 'tezgahlar' },
    { id: 'ekmesai', ad: 'Ek mesai', durum: 'tam', not: 'Tezgâhı, bir operatörü ve bir ayarcıyı o vardiyada açar.', sayfa: 'takvim' },
    { id: 'tampon', ad: 'Arıza payı ve termin tamponu', durum: 'yaklasik', g: true, not: 'Tezgâhın arıza geçmişinden süreye pay; süre sapmasından termin tamponu.', p: [sayiP('param', 'acilPay', 'Acil iş payı', 'oran', 0, 0.3, 0.01), sayiP('param', 'tamponZ', 'Tampon katsayısı (z)', '', 0, 3, 0.05)] },
    { id: 'toplu', ad: 'Toplu işlem (fırın partisi)', durum: 'yaklasik', not: 'Isıl işlem fasonda kapasite ve çıkış günüyle; parti birleştirme yok.' },
    { id: 'enerji', ad: 'Enerji ve puant saat', durum: 'yok' },
  ] },
  { grup: 'İnsan', simge: 'user', l: [
    { id: 'personel', ad: 'Operatör sayısı', durum: 'tam', g: true, not: 'Çalışan tezgâhların operatör oranı toplamı vardiyadaki operatörü aşamaz.', sayfa: 'personel' },
    { id: 'yetkin', ad: 'Operatör yetkinliği (tezgâh grubu)', durum: 'tam', g: true, not: 'Kapatılırsa herkes her grupta çalışabilir sayılır.', sayfa: 'personel' },
    { id: 'devam', ad: 'Devamsızlık', durum: 'tam', g: true, sayfa: 'personel' },
    { id: 'ayarci', ad: 'Ayarcı sayısı', durum: 'tam', g: true, not: 'Aynı anda yapılan ayar vardiyadaki ayarcıyı aşamaz.', sayfa: 'personel' },
    { id: 'cokmakine', ad: 'Çok tezgâha bakan operatör', durum: 'yaklasik', not: 'Operatör oranıyla (ör. 0,5); yükleme ve boşaltma çakışması modellenmez.', sayfa: 'tezgahlar' },
    { id: 'verim', ad: 'Kişiye göre verim', durum: 'yok' },
  ] },
  { grup: 'Yardımcı kaynaklar', simge: 'tool', l: [
    { id: 'aparat', ad: 'Bağlama aparatı ve fikstür adedi', durum: 'tam', g: true, sayfa: 'fason' },
    { id: 'program', ad: 'NC programının hazır olması', durum: 'tam', g: true, not: 'Programı hazır olmayan adım program süresi dolmadan başlamaz.', p: [sayiP('ayarlar', 'programSaat', 'Program hazırlama', 'sa', 0, 72, 1)] },
    { id: 'fai', ad: 'İlk parça onayı', durum: 'tam', g: true, not: 'Ayardan sonra bir parça işlenir, onay süresi beklenir.', p: [sayiP('ayarlar', 'faiSaat', 'Onay süresi', 'sa', 0, 24, 0.5)] },
    { id: 'cmm', ad: 'CMM ve ölçüm kapasitesi', durum: 'yaklasik', not: 'Rotada ayrı adım ve tezgâh olarak tanımlanırsa tam uygulanır.' },
    { id: 'takim', ad: 'Kesici takım ve magazin', durum: 'yok' },
    { id: 'omur', ad: 'Takım ömrü', durum: 'yok' },
    { id: 'kalibrasyon', ad: 'Ölçü aleti ve kalibrasyon', durum: 'yok' },
  ] },
  { grup: 'Malzeme, rota ve akış', simge: 'layers', l: [
    { id: 'malzeme', ad: 'Malzeme hazır olması', durum: 'karar', g: true, not: 'Kullanıcı 16:50 (4 c): geliş tarihi belli olan malzeme (stok ya da söz tarihli satın alma) sert kısıttır, iş malzemeden önce başlamaz; tedariki olmayan ya da gelişi yalnız tahmin edilen malzemede iş başlar, uyarı verilir.', p: [{ tur: 'sec', yer: 'w', k: 'mat', etiket: 'Kural', secenekler: [['karma', 'Belliyse sert'], ['uyari', 'Yalnız uyarı'], ['sert', 'Her zaman sert']] }], sayfa: 'malzeme' },
    { id: 'serbest', ad: 'Serbest bırakma zamanı', durum: 'tam', g: true, sayfa: 'siparisler' },
    { id: 'rota', ad: 'Rota sırası (bitince başla)', durum: 'tam', not: 'Kapatılamaz.', sayfa: 'rotalar' },
    { id: 'ortusme', ad: 'Örtüşmeli geçiş ve son parti kuralı', durum: 'tam', not: 'Sonraki adım ilk transfer partisi gelince başlar; önceki bitmeden son partiyi bitiremez.', p: [sayiP('ayarlar', 'transferOran', 'Transfer partisi', 'oran', 0.05, 1, 0.05)] },
    { id: 'tasima', ad: 'Taşıma süresi', durum: 'tam', g: true, p: [sayiP('ayarlar', 'tasimaSaat', 'Taşıma', 'sa', 0, 24, 0.25)] },
    { id: 'fasonGun', ad: 'Fason çıkış günü ve süresi', durum: 'tam', g: true, not: 'Kapatılırsa fasona her gün çıkış var sayılır.', sayfa: 'fason' },
    { id: 'fasonKap', ad: 'Fason kapasitesi', durum: 'tam', g: true, sayfa: 'fason' },
    { id: 'fasonTalas', ad: 'Talaşlı işi fasona verme', durum: 'karar', not: '"Gerekirse fasona verilebilir" işaretli adımlar için.', p: [{ tur: 'fason', yer: 'ayarlar', k: 'fasonTalas', etiket: 'Talaşlı fasoncu' }] },
    { id: 'bekleme', ad: 'En az ve en çok bekleme (soğuma, kuruma)', durum: 'yok' },
    { id: 'nowait', ad: 'Ara beklemesiz akış', durum: 'yok' },
    { id: 'bolme', ad: 'Parti bölme', durum: 'yok', not: 'Elle bölme dondurma istisnası; bu denemede yok.' },
    { id: 'wip', ad: 'Alan ve WIP sınırı', durum: 'yok' },
  ] },
  { grup: 'Ayar ve sıralama', simge: 'wrench', l: [
    { id: 'ayar', ad: 'Ayar süresi', durum: 'tam', g: true, not: 'Kapatılırsa bütün ayarlar sıfır sayılır; ayarın plana bedeli ölçülür.', sayfa: 'rotalar' },
    { id: 'sdst', ad: 'Sıraya bağlı ayar (aile matrisi)', durum: 'tam', not: 'Önceki işin ailesine göre ayar süresi.', sayfa: 'ayar' },
    { id: 'aile', ad: 'Aynı aile kısalması', durum: 'tam', p: [sayiP('w', 'famK', 'Aynı aile katsayısı', '', 0, 1, 0.05)] },
    { id: 'kampanya', ad: 'Kampanya uzunluğu (en az, en çok)', durum: 'yok' },
  ] },
  { grup: 'Zaman ve plan politikası', simge: 'clock', l: [
    { id: 'termin', ad: 'Termin ve öncelik ağırlığı', durum: 'tam', not: 'Amaç ağırlıklı gecikme: yüksek ×4, normal ×2, düşük ×1.', sayfa: 'siparisler' },
    { id: 'dondurma', ad: 'Dondurulmuş bölge', durum: 'tam', not: 'Onarımda bu süre içinde başlayan işler yerinden oynamaz.', p: [sayiP('w', 'dondurma', 'Dondurma ufku', 'sa', 0, 72, 1)] },
    { id: 'kilit', ad: 'Elle kilit', durum: 'tam', not: 'Plan masasında taşınan ya da kilitlenen iş.' },
    { id: 'degisim', ad: 'Değişiklik bütçesi (canlıya göre)', durum: 'tam', not: 'Onarım kipinde en çok bu kadar iş değişir. Olay toparlamasında sınır yerine her yeri değişen iş TL toplamına değişiklik bedeli ekler.', p: [sayiP('param', 'maxChg', 'Bütçe', 'iş', 0, 500, 1), sayiP('param', 'chgTL', 'Değişiklik bedeli (olayda)', 'TL/iş', 0, 5000, 10)] },
    { id: 'belge', ad: 'Belge onayı', durum: 'yaklasik', not: 'Serbest bırakma zamanıyla girilir.' },
    { id: 'karantina', ad: 'Kalite bekletme', durum: 'yok' },
    { id: 'yeniden', ad: 'Yeniden işleme', durum: 'yok' },
  ] },
];
const KATALOG_DUZ: Record<string, Kisit> = Object.fromEntries(KATALOG.flatMap((g) => g.l.map((k) => [k.id, k])));
export const kisitBul = (id: string): Kisit | null => KATALOG_DUZ[id] ?? null;
export const DURUM_ROZETI: Record<KisitDurumu, [string, 'tamam' | 'uyari' | 'bilgi' | 'pasif']> = {
  tam: ['Modelde', 'tamam'], yaklasik: ['Yaklaşık', 'uyari'], karar: ['Karara bağlı', 'bilgi'], yok: ['Modelde yok', 'pasif'],
};
export function durumSayilari(): Record<KisitDurumu, number> {
  const say: Record<KisitDurumu, number> = { tam: 0, yaklasik: 0, karar: 0, yok: 0 };
  for (const g of KATALOG) for (const k of g.l) say[k.durum]++;
  return say;
}
export const AMAC_SIRASI = ['Ağırlıklı gecikme (öncelik ağırlığıyla)', 'Termin tamponu ihlali', 'Canlı plana göre değişiklik sayısı', 'Toplam ayar süresi', 'Bilinen maliyet (TL)'];

export function parametreDegeri(c: PlanlamaCalismasi, yer: ParametreYeri, k: string): unknown {
  return yer === 'w' ? c.w[k] : yer === 'param' ? c.param[k] : ayarlar(c.D)[k];
}
// Girilen değerin denetimi (05-olaylar.betik param): sayı alanı sınırlar içinde olmalı; boş fason seçimi null'dır.
export function parametreOku(p: Parametre, girdi: string): { deger: string | number | null } | { hata: string } {
  if (p.tur === 'sec') return { deger: girdi };
  if (p.tur === 'fason') return { deger: girdi || null };
  const v = Number(girdi);
  if (girdi.trim() === '' || !Number.isFinite(v) || v < p.min || v > p.max) return { hata: `Değer ${p.min} ile ${p.max} arasında olmalı.` };
  return { deger: v };
}
// Değişikliği çalışmanın kopyasına uygular; değer aynıysa false (değişiklik yok).
export function parametreYaz(t: PlanlamaCalismasi, yer: ParametreYeri, k: string, v: unknown): boolean {
  if (parametreDegeri(t, yer, k) === v) return false;
  if (yer === 'w') (t.w as Record<string, unknown>)[k] = v;
  else if (yer === 'param') (t.param as Record<string, unknown>)[k] = v;
  else (t.D as Record<string, unknown>).ayarlar = { ...ayarlar(t.D), [k]: v };
  return true;
}
export function kisitDegistir(t: PlanlamaCalismasi, id: string, ac: boolean): void {
  t.kapali = ac ? t.kapali.filter((x) => x !== id) : [...t.kapali.filter((x) => x !== id), id];
}

// Kısıt bedeli (c.bedel): kısıt tek tek kapatılıp kısa çözümle ölçülür; motor ister. Kayıttaki bedel yalnız veri sürümü aynıysa gösterilir.
export interface KisitBedeli { temel: { wT: number; late: number }; zaman: number | null; liste: { id: string; dW: number }[] }
export function bedelOku(c: PlanlamaCalismasi): KisitBedeli | null {
  const b = c.bedel;
  if (!nesne(b) || b.dataVer !== c.dataVer || !nesne(b.temel) || sayi(b.temel.wT) === null) return null;
  return {
    temel: { wT: b.temel.wT as number, late: sayi(b.temel.late) ?? 0 }, zaman: sayi(b.zaman),
    liste: nesneler(b.liste).flatMap((x) => (typeof x.id === 'string' && sayi(x.dW) !== null ? [{ id: x.id, dW: x.dW as number }] : [])),
  };
}
// Kısa çözüm gürültülüdür: temelin %3'ünden (en az 1 saat) küçük fark etki sayılmaz.
export const bedelEsigi = (b: KisitBedeli): number => Math.max(1, 0.03 * b.temel.wT);

// --- ürün ve rota (sRotalar) ---
export type BagTuru = 'o' | 'b';
export const bagTuru = (b: unknown[]): BagTuru => (b[1] === 'o' ? 'o' : 'b');
export function adimEkleri(o: ExtraAlanlar): string[] {
  return [o.aparat ? `aparat ${String(o.aparat)}` : '', o.fai ? 'ilk parça onayı' : '', o.program === false ? 'NC program yok' : '', o.fasonIzin ? 'fasona verilebilir' : ''].filter(Boolean);
}

// --- personel (sPersonel): vardiya × yetkinlik kapasitesi ---
export interface KapasiteHucresi { acik: boolean; kisi: number; ihtiyac: number; ton: 'hata' | 'uyari' | null }
export function kapasiteMatrisi(D: PlanVerisi): { gruplar: string[]; vardiyalar: string[]; hucre: (g: string, v: string) => KapasiteHucresi; ayarci: (v: string) => { acik: boolean; kisi: number } } {
  const gruplar = [...new Set(D.tezgahlar.map((t) => t.grup ?? ''))];
  const vs = vardiyalar(D).map((v) => v.id);
  const per = D.personel ?? [];
  const gunler = D.calismaGunleri ?? {};
  const vardiyaAcik = (v: string) => GUNLER.some((g) => (gunler[g] ?? []).map(String).includes(v));
  const tezgahta = (t: PlanVerisi['tezgahlar'][number], v: string) => !t.vardiyalar?.length || t.vardiyalar.includes(v);
  return {
    gruplar, vardiyalar: vs,
    hucre: (g, v) => {
      const acik = D.tezgahlar.some((t) => (t.grup ?? '') === g && (t.opOran == null || Number(t.opOran) > 0) && tezgahta(t, v)) && vardiyaAcik(v);
      const kisi = per.filter((p) => p.vardiya === v && (p.gruplar ?? []).includes(g)).length;
      const ihtiyac = D.tezgahlar.filter((t) => (t.grup ?? '') === g && tezgahta(t, v)).reduce((a, t) => a + (t.opOran == null ? 1 : Number(t.opOran)), 0);
      return { acik, kisi, ihtiyac, ton: acik && kisi === 0 ? 'hata' : acik && kisi < ihtiyac ? 'uyari' : null };
    },
    ayarci: (v) => ({ acik: vardiyaAcik(v), kisi: per.filter((p) => p.vardiya === v && p.ayar).length }),
  };
}

// --- malzeme (sMalzeme; motor engine.betik matAlloc): siparişlere karşılama ---
// Stok ve satın alma, öncelik ve termin sırasıyla dağıtılır. Etkin geliş: söz + tedarikçinin ortalama gecikmesi + olay gecikmesi + giriş muayenesi;
// termini beklenen satır (tb, 554 a) gelmiş sayılır.
export type KarsilamaKaynagi = 'stok' | 'satın alma' | 'eksik';
export interface Karsilama { siparis: string; kod: string; ad: string; birim: string; ihtiyac: number; kaynak: KarsilamaKaynagi; eksik: number; hazir: number | null }
export function karsilama(cx: Derleme): Karsilama[] {
  const D = cx.g.D;
  const mats = new Map((D.malzemeler ?? []).map((m) => [m.kod, m]));
  const ted = new Map(tedarikciler(D).map((t) => [t.id, t]));
  const sup: Record<string, { t: number; kalan: number; sa: boolean; tb: boolean }[]> = {};
  for (const m of D.malzemeler ?? []) sup[m.kod] = [{ t: -1e9, kalan: Number(m.stok) || 0, sa: false, tb: false }];
  for (const p of satinalmalar(D)) {
    const soz = saatOku(D, p.gelis);
    const gec = (ted.get(p.tedarikci ?? '')?.ortGecikmeGun ?? 0) * 24 + (cx.g.saGecik[p.kod] ?? 0);
    const mu = (Number(mats.get(p.kod)?.muayeneGun) || 0) * 24;
    (sup[p.kod] ??= []).push({ t: p.tb ? -1e9 : soz === null ? 1e9 : Math.max(soz + gec, soz) + mu, kalan: p.miktar ?? 0, sa: true, tb: p.tb });
  }
  for (const l of Object.values(sup)) l.sort((a, b) => a.t - b.t);
  const sira = Object.values(cx.jobs).sort((a, b) => (a.oncelik - b.oncelik) || ((a.due ?? 1e9) - (b.due ?? 1e9)));
  const det: Record<string, Karsilama[]> = {};
  for (const j of sira) {
    const l: Karsilama[] = (det[j.id] = []);
    for (const r of j.malzeme) {
      const ihtiyac = (Number(r.miktar) || 0) * j.adet; let kalan = ihtiyac, t = -1e9; let sa = false, tb = false;
      for (const x of sup[r.kod] ?? []) {
        if (kalan <= 1e-9) break; if (x.kalan <= 1e-9) continue;
        const q = Math.min(x.kalan, kalan); x.kalan -= q; kalan -= q; t = Math.max(t, x.t); if (x.sa) { sa = true; tb ||= x.tb; }
      }
      const eksik = kalan > 1e-9 ? kalan : 0;
      const hazir = eksik ? null : Math.max(t, cx.now);
      const kaynak: KarsilamaKaynagi = eksik ? 'eksik' : hazir !== null && hazir <= cx.now + 1e-9 && !(sa && tb) ? 'stok' : 'satın alma';
      const m = mats.get(r.kod);
      l.push({ siparis: j.id, kod: r.kod, ad: m?.ad ?? r.kod, birim: m?.birim ?? '', ihtiyac, kaynak, eksik, hazir });
    }
  }
  // Satırlar siparişlerin sırasıyla (bugünkü sayfa D.siparisler sırasıyla yazar).
  return D.siparisler.flatMap((s) => det[s.id] ?? []);
}

// --- ayar matrisi (sAyar) ---
export function aileler(D: PlanVerisi): string[] {
  return [...new Set(D.urunler.flatMap((u) => (u.rota ?? []).map((o) => o.aile)).filter((a): a is string => typeof a === 'string' && a !== ''))].sort();
}
export function matrisOku(D: PlanVerisi): Map<string, number> {
  return new Map(ayarMatrisi(D).map((e) => [`${e.den}|${e.ye}`, e.dk]));
}
export function tanimsizGecis(D: PlanVerisi): number {
  const a = aileler(D); const mx = matrisOku(D); let n = 0;
  for (const x of a) for (const y of a) if (x !== y && !mx.has(`${x}|${y}`)) n++;
  return n;
}
export function matrisDenetle(girdi: string): { dk: number | null } | { hata: string } {
  const v = girdi.trim();
  if (v === '') return { dk: null };
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? { dk: n } : { hata: 'Ayar süresi sıfır ya da pozitif dakika olmalı.' };
}
// Boş değer geçişi siler (tam ayar alınır).
export function matrisYaz(t: PlanlamaCalismasi, den: string, ye: string, dk: number | null): void {
  const l = ayarMatrisi(t.D).filter((e) => !(e.den === den && e.ye === ye));
  (t.D as Record<string, unknown>).ayarMatrisi = dk === null ? l : [...l, { den, ye, dk }];
}

// --- takvim (sTakvim): arıza ve planlı bakım, ek mesai (planlama çalışmasının alanları) ---
export interface Durus { m: string; from: number; to: number }
export interface EkMesai { m: string; gun: number; vardiya: string }
export const duruslar = (c: PlanlamaCalismasi): Durus[] =>
  c.down.flatMap((d) => (typeof d.m === 'string' && sayi(d.from) !== null && sayi(d.to) !== null ? [{ m: d.m, from: d.from as number, to: d.to as number }] : []));
export const ekMesailer = (c: PlanlamaCalismasi): EkMesai[] =>
  c.ekMesai.flatMap((e) => (typeof e.m === 'string' && sayi(e.gun) !== null && typeof e.vardiya === 'string' ? [{ m: e.m, gun: e.gun as number, vardiya: e.vardiya }] : []));
export function durusDenetle(a: number | null, b: number | null): string | null {
  if (a === null || b === null) return 'Başlangıç ve bitişi girin.';
  if (b <= a) return 'Bitiş başlangıçtan sonra olmalı.';
  if (a < 0) return 'Plan başlangıcından önce olamaz.';
  return null;
}
export function ekMesaiDenetle(c: PlanlamaCalismasi, e: { m: string; gun: number | null; vardiya: string }): string | null {
  if (e.gun === null || !(e.gun >= 0 && e.gun < UFUK_GUN)) return 'Gün plan ufku içinde olmalı.';
  if (ekMesailer(c).some((x) => x.m === e.m && x.gun === e.gun && x.vardiya === e.vardiya)) return 'Bu ek mesai zaten var.';
  return null;
}

// --- listeler: planlamaya özgü kayıtlar (aparat, tedarikçi) ---
export type ListeTuru = 'aparat' | 'tedarikci';
export interface ListeAlani { k: string; ad: string; tur: 'metin' | 'sayi'; zorunlu?: true; min?: number; adim?: number; vars?: number }
export const LISTE_TANIMI: Record<ListeTuru, { ad: string; alan: 'aparatlar' | 'tedarikciler'; alanlar: ListeAlani[] }> = {
  aparat: { ad: 'Aparat', alan: 'aparatlar', alanlar: [
    { k: 'id', ad: 'Kod', tur: 'metin', zorunlu: true }, { k: 'ad', ad: 'Ad', tur: 'metin', zorunlu: true }, { k: 'adet', ad: 'Adet', tur: 'sayi', min: 1, zorunlu: true, vars: 1 },
  ] },
  tedarikci: { ad: 'Tedarikçi', alan: 'tedarikciler', alanlar: [
    { k: 'id', ad: 'Kod', tur: 'metin', zorunlu: true }, { k: 'ad', ad: 'Ad', tur: 'metin', zorunlu: true },
    { k: 'ortGecikmeGun', ad: 'Ortalama gecikme (gün)', tur: 'sayi', min: 0, adim: 0.5, vars: 0 }, { k: 'sapmaGun', ad: 'Gecikme sapması (gün)', tur: 'sayi', min: 0, adim: 0.5, vars: 0 },
  ] },
};
// Form değerlerini okur (02-orta.betik formOku): boş zorunlu alan, sayı ve sınır hatası, kod tekrarı.
export function listeFormuOku(c: PlanlamaCalismasi, tur: ListeTuru, girdi: Record<string, string>, eski: string | null): { kayit: Record<string, string | number> } | { hata: string[] } {
  const T = LISTE_TANIMI[tur]; const kayit: Record<string, string | number> = {}; const hata: string[] = [];
  for (const a of T.alanlar) {
    const v = (girdi[a.k] ?? '').trim();
    if (v === '') { if (a.zorunlu) hata.push(`${a.ad} boş olamaz.`); continue; }
    if (a.tur === 'sayi') {
      const n = Number(v);
      if (!Number.isFinite(n)) { hata.push(`${a.ad} sayı olmalı.`); continue; }
      if (a.min != null && n < a.min) hata.push(`${a.ad} en az ${a.min}.`);
      kayit[a.k] = n;
    } else kayit[a.k] = v;
  }
  const liste = nesneler(c.D[T.alan]);
  if (typeof kayit.id === 'string' && kayit.id !== eski && liste.some((x) => x.id === kayit.id)) hata.push(`${kayit.id} zaten var.`);
  return hata.length ? { hata } : { kayit };
}
export function listeYaz(t: PlanlamaCalismasi, tur: ListeTuru, kayit: Record<string, string | number>, eski: string | null): void {
  const T = LISTE_TANIMI[tur]; const D = t.D as Record<string, unknown>;
  const liste = nesneler(D[T.alan]);
  const i = eski === null ? -1 : liste.findIndex((x) => x.id === eski);
  // Formda olmayan alan korunur; formdaki alan boş bırakıldıysa düşer (bugünkü sayfadaki gibi).
  if (i >= 0) {
    const yeni: Record<string, unknown> = { ...liste[i] };
    for (const a of T.alanlar) if (!(a.k in kayit)) delete yeni[a.k];
    liste[i] = { ...yeni, ...kayit };
  } else liste.push(kayit);
  D[T.alan] = liste;
}
// Silme engeli (silKontrol): aparat rotada kullanılıyorsa, tedarikçiye satın alma bağlıysa silinmez.
export function silmeEngeli(D: PlanVerisi, tur: ListeTuru, id: string): string | null {
  if (tur === 'aparat') {
    const u = D.urunler.filter((x) => (x.rota ?? []).some((o) => o.aparat === id));
    return u.length ? `${u.map((z) => z.id).join(', ')} rotasında kullanılıyor.` : null;
  }
  return satinalmalar(D).some((p) => p.tedarikci === id) ? 'Bu tedarikçiye bağlı satın alma var.' : null;
}
export function listedenSil(t: PlanlamaCalismasi, tur: ListeTuru, id: string): void {
  const T = LISTE_TANIMI[tur]; const D = t.D as Record<string, unknown>;
  D[T.alan] = nesneler(D[T.alan]).filter((x) => x.id !== id);
}

// --- veri denetimi (sDenetim): bulgu türünün düzeltildiği görünüm ve tonu ---
export const DENETIM_SAYFASI: Record<string, VeriBolumu> = {
  personel: 'personel', ayarci: 'personel', tezgah: 'rotalar', aparat: 'fason', rota: 'rotalar', ayar: 'ayar', malzeme: 'malzeme', fason: 'fason', amac: 'siparisler',
};
// Bulgu türünün adı motorun kısıt listesindendir (sunucu motor/kisitlar.betik KISITLAR), Kısıtlar katalogundan değil.
const DENETIM_AD: Record<string, string> = {
  takvim: 'Vardiya, tatil, tezgâh vardiyası, ek mesai', ariza: 'Arıza ve planlı bakım', tezgah: 'Alternatif tezgâh, verim, tek tezgâhta tek iş',
  rota: 'Rota sırası, örtüşmeli geçiş, taşıma süresi', ayar: 'Sıraya bağlı ayar (aile matrisi, aynı aile kısalması)', fai: 'İlk parça onayı', ayarci: 'Ayarcı sayısı',
  personel: 'Operatör sayısı ve yetkinlik grubu, ışıksız tezgâh', aparat: 'Aparat ve fikstür adedi', fason: 'Fason çıkış günü, süre, kapasite',
  program: 'CNC programı hazır olmadan başlamaz', serbest: 'Siparişin serbest bırakılma zamanı', malzeme: 'Malzeme (stok, satın alma, tedarikçi gecikmesi)',
  sabit: 'Başlamış, kilitli, dondurulmuş işler', amac: 'Sıralı amaç: gecikme > değişiklik > ayar > maliyet', butce: 'Değişiklik ve haftalık mesai bütçesi',
};
export const denetimAdi = (k: string): string => DENETIM_AD[k] ?? k;
export const denetimTonu = (k: string): 'hata' | 'uyari' => (['personel', 'tezgah', 'rota', 'hata'].includes(k) ? 'hata' : 'uyari');
export function denetimGruplari<T extends { k: string }>(l: readonly T[]): [string, T[]][] {
  const g = new Map<string, T[]>();
  for (const b of l) { const x = g.get(b.k); if (x) x.push(b); else g.set(b.k, [b]); }
  return [...g.entries()];
}
