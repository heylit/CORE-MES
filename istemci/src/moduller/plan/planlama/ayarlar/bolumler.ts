import type { MotorAyarlariCevabi, PlanSistemAyariSatiri } from '#paylasilan/sozlesme/plan.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { ACIL_PAY, AYAR_SECENEKLERI, FASON_GUN, degerAdi, gunMetni, yuzdeMetni, type SecimAyari } from '../../motor-ayarlari/kurallar.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import {
  AYAR_ALANLARI, PANEL_KISITLARI, alanAnahtari, alanDegeri, alanYazisi, ayarTaslagi, kaynakAdi, kaynakMi, kaynakSecimi, panelKisitAdi, secimAdi, type AyarAlani,
} from './alanlar.ts';

// Planlama ayarları sayfasının bölümleri ve kontrol tablosu (3561). Saf: ekran yalnız çizer. Bölüm bir ayarı hangi kapıyla yazdığını da söyler;
// ekran yalnız pasif yapar, denetim uçtadır.

export const BOLUMLER = [
  { anahtar: 'kontrol', baslik: 'Kontrol: tüm ayarlar', simge: 'list' },
  { anahtar: 'zaman', baslik: 'Planlama yönü ve zaman', simge: 'clock' },
  { anahtar: 'tampon', baslik: 'Tampon ve risk', simge: 'gauge' },
  { anahtar: 'kisitlar', baslik: 'Kısıtlar', simge: 'layers' },
  { anahtar: 'motor', baslik: 'Motor', simge: 'gear' },
  { anahtar: 'oncelik', baslik: 'Öncelik ve bedel', simge: 'lira' },
  { anahtar: 'sistem', baslik: 'Sistem', simge: 'cpu' },
] as const satisfies readonly { anahtar: string; baslik: string; simge: SimgeAdi }[];
export type BolumAnahtari = (typeof BOLUMLER)[number]['anahtar'];
export const bolumOku = (v: string | null): BolumAnahtari => BOLUMLER.find((b) => b.anahtar === v)?.anahtar ?? 'kontrol';
export const bolumBasligi = (k: BolumAnahtari): string => BOLUMLER.find((b) => b.anahtar === k)!.baslik;

// Çalışma ayarlarının bölümlere dağılımı (KURGU 3); her alan tam bir bölümdedir.
const ZAMAN = ['w.yon', 'param.geriTamponGun', 'w.dondurma', 'w.gerideTasinir', 'ayarlar.tasimaSaat', 'ayarlar.transferOran', 'ayarlar.programSaat', 'ayarlar.faiSaat'];
const TAMPON = ['param.tampon', 'param.tamponZ', 'param.mesaiHafta', 'param.maxChg', 'param.chgTL'];
const KISIT_ALANLARI = ['w.famK', 'w.mat'];
export type CalismaBolumu = 'zaman' | 'tampon' | 'kisitlar';
const ALAN_BOLUMLERI: Record<CalismaBolumu, readonly string[]> = { zaman: ZAMAN, tampon: TAMPON, kisitlar: KISIT_ALANLARI };
export const bolumAlanlari = (b: CalismaBolumu): AyarAlani[] => ALAN_BOLUMLERI[b].flatMap((k) => AYAR_ALANLARI.filter((a) => alanAnahtari(a) === k));
export const alanBolumu = (a: AyarAlani): CalismaBolumu => (ZAMAN.includes(alanAnahtari(a)) ? 'zaman' : TAMPON.includes(alanAnahtari(a)) ? 'tampon' : 'kisitlar');

// Bölümün yazma kapısı: hangi işlem değiştirir, kim değiştirdiğini ekranda söylemek için rol adı.
export interface BolumKapisi { islem: string; kim: string }
export const BOLUM_KAPILARI: Record<CalismaBolumu | 'motor' | 'oncelik', BolumKapisi> = {
  zaman: { islem: 'plan.yaz', kim: 'planlamacı, müdür ve üstü' },
  tampon: { islem: 'plan.yaz', kim: 'planlamacı, müdür ve üstü' },
  kisitlar: { islem: 'plan.yaz', kim: 'planlamacı, müdür ve üstü' },
  motor: { islem: 'plan.motor-ayari', kim: 'planlamacı, müdür ve üstü' },
  oncelik: { islem: 'plan.bedel-ayari', kim: 'müdür ve üstü' },
};

export type Kaynak = 'Çalışma' | 'Motor' | 'Sistem' | 'Öncelik';
export interface KontrolSatiri {
  id: string;
  bolum: BolumAnahtari;
  ad: string;
  // Şu an geçerli değer: çalışma ayarında ortak çalışmanın, öteki kaynaklarda kayıtlı değer. Taslak ayrı yazılır, geçerli sayılmaz (Risk Z11).
  deger: string;
  // Taslağın görünümündeki farklı değer; fark yoksa null.
  taslakta: string | null;
  kaynak: Kaynak;
  degistiren: string | null;
  zaman: string | null;
}

export const zamanYazisi = (z: string | null): string => (z === null ? '' : new Date(z).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'short' }));

const MOTOR_SECIMLERI: readonly SecimAyari[] = ['kural', 'amac', 'bolmeKip', 'bolmeMaks', 'eksikStok', 'ogrenme'];
type Motor = MotorAyarlariCevabi['guncel'];
export function motorSatirlari(m: Motor): KontrolSatiri[] {
  const ortak = { bolum: 'motor' as const, kaynak: 'Motor' as const, taslakta: null, degistiren: m.yazan, zaman: m.zaman };
  return [
    ...MOTOR_SECIMLERI.map((k) => ({ ...ortak, id: `motor.${k}`, ad: AYAR_SECENEKLERI[k].baslik, deger: degerAdi(k, m.degerler[k] as never) })),
    { ...ortak, id: 'motor.acilPay', ad: ACIL_PAY.baslik, deger: `%${yuzdeMetni(m.degerler.acilPay)}` },
    { ...ortak, id: 'motor.fasonGun', ad: FASON_GUN.baslik, deger: gunMetni(m.degerler.fasonGun) },
  ];
}

export function sistemDegeri(s: PlanSistemAyariSatiri['ayar']): string {
  if (s.deger === null) return '—';
  if (s.tur === 'boolean') return s.deger ? 'açık' : 'kapalı';
  if (s.tur === 'secim') return s.secenekler.find((x) => x.deger === s.deger)?.etiket ?? String(s.deger);
  return String(s.deger);
}
export function sistemSatirlari(l: readonly PlanSistemAyariSatiri[]): KontrolSatiri[] {
  return l.map((x) => ({
    id: x.ayar.anahtar, bolum: 'sistem', ad: x.ayar.baslik, deger: sistemDegeri(x.ayar), taslakta: null, kaynak: 'Sistem', degistiren: x.guncelleyen, zaman: x.zaman,
  }));
}

// Çalışma ayarları ve kısıtlar: değer ortak çalışmadan, taslakta fark taslağın görünümünden. Kısıt satırı açık/kapalıdır.
export function calismaSatirlari(ortak: PlanlamaCalismasi, gorunum: PlanlamaCalismasi): KontrolSatiri[] {
  const o = ayarTaslagi(ortak), g = ayarTaslagi(gorunum);
  const alan = AYAR_ALANLARI.map((a): KontrolSatiri => {
    const bu = alanDegeri(o, a), tas = alanDegeri(g, a);
    return {
      id: alanAnahtari(a), bolum: alanBolumu(a), ad: a.etiket, deger: alanYazisi(a, bu), taslakta: bu === tas ? null : alanYazisi(a, tas),
      kaynak: 'Çalışma', degistiren: null, zaman: null,
    };
  });
  const kisit = PANEL_KISITLARI.map((k): KontrolSatiri => ({
    id: `kisit.${k}`, bolum: 'kisitlar', ad: kaynakMi(k) ? kaynakAdi(k) : panelKisitAdi(k),
    deger: kaynakMi(k) ? secimAdi(kaynakSecimi(o, k)) : o.acik[k] ? 'açık' : 'kapalı',
    taslakta: o.acik[k] === g.acik[k] ? null : kaynakMi(k) ? secimAdi(kaynakSecimi(g, k)) : g.acik[k] ? 'açık' : 'kapalı',
    kaynak: 'Çalışma', degistiren: null, zaman: null,
  }));
  return [...alan, ...kisit];
}

export function acikKisitOzeti(ortak: PlanlamaCalismasi, gorunum: PlanlamaCalismasi): { acik: number; toplam: number; taslakta: number | null } {
  const o = ayarTaslagi(ortak).acik, g = ayarTaslagi(gorunum).acik;
  const say = (x: Record<string, boolean>) => PANEL_KISITLARI.filter((k) => x[k] === true).length;
  return { acik: say(o), toplam: PANEL_KISITLARI.length, taslakta: say(o) === say(g) ? null : say(g) };
}

// Bölüm rozeti: bölümde taslakta farklı satır sayısı.
export function bolumFarklari(satirlar: readonly KontrolSatiri[]): Record<BolumAnahtari, number> {
  const r = Object.fromEntries(BOLUMLER.map((b) => [b.anahtar, 0])) as Record<BolumAnahtari, number>;
  for (const s of satirlar) if (s.taslakta !== null) { r[s.bolum] += 1; r.kontrol += 1; }
  return r;
}

export type KontrolSuzgeci = 'hepsi' | 'taslakta';
export const suz = (l: readonly KontrolSatiri[], s: KontrolSuzgeci): KontrolSatiri[] => (s === 'taslakta' ? l.filter((x) => x.taslakta !== null) : [...l]);

// Bedel (öncelik) ayarının okunan değeri: para alanları maliyet göremeyene null gelir, "Yetkin yok" diye yazılır (Risk Z6).
export interface BedelSatiri { ad: string; deger: string }
export function bedelSatirlari(b: { tabanBedelSaat: number | null; finansmanOraniGun: number | null; karRiskiOraniGun: number | null; yuksekEsigi: number; dusukEsigi: number; yuksekCarpani: number; normalCarpani: number; dusukCarpani: number }): BedelSatiri[] {
  const sayi = (n: number | null, birim = ''): string => (n === null ? 'Yetkin yok' : `${String(n).replace('.', ',')}${birim}`);
  return [
    { ad: 'Taban bedel', deger: sayi(b.tabanBedelSaat, ' TL/sa') }, { ad: 'Finansman oranı', deger: sayi(b.finansmanOraniGun, ' %/gün') },
    { ad: 'Kâr riski oranı', deger: sayi(b.karRiskiOraniGun, ' %/gün') }, { ad: 'Yüksek öncelik eşiği', deger: sayi(b.yuksekEsigi) },
    { ad: 'Düşük öncelik eşiği', deger: sayi(b.dusukEsigi) }, { ad: 'Yüksek öncelik çarpanı', deger: sayi(b.yuksekCarpani) },
    { ad: 'Normal öncelik çarpanı', deger: sayi(b.normalCarpani) }, { ad: 'Düşük öncelik çarpanı', deger: sayi(b.dusukCarpani) },
  ];
}
export function bedelKontrolSatirlari(l: readonly BedelSatiri[]): KontrolSatiri[] {
  return l.map((x, i) => ({ id: `bedel.${String(i)}`, bolum: 'oncelik', ad: x.ad, deger: x.deger, taslakta: null, kaynak: 'Öncelik', degistiren: null, zaman: null }));
}

// Sistem ayarlarının yazma kapısı (paylasilan/sozlesme/plan.ts PLAN_SISTEM_AYARI_KAPISI ile aynı; sunucu kapıyı denetler). Yönetici iki kapıyı da taşır.
export const SISTEM_KAPILARI: Record<string, { islem: string; kim: string }> = {
  'plan.dort-goz': { islem: 'ayarlar.yaz', kim: 'sistem yöneticisi' },
  'plan.motor-ufuk-gun': { islem: 'plan.sistem-ayari', kim: 'planlama müdürü ve sistem yöneticisi' },
  'plan.motor-dilim-dk': { islem: 'plan.sistem-ayari', kim: 'planlama müdürü ve sistem yöneticisi' },
  'plan.tipli-girdi': { islem: 'ayarlar.yaz', kim: 'sistem yöneticisi' },
  'plan.bakim-girdisi': { islem: 'ayarlar.yaz', kim: 'sistem yöneticisi' },
};
export const sistemYazabilir = (anahtar: string, islemVar: (i: string) => boolean): boolean => {
  const k = SISTEM_KAPILARI[anahtar];
  return k !== undefined && (islemVar(k.islem) || islemVar('ayarlar.yaz'));
};
// Ufuk ve dilim motorun ölçeğidir: değişince plan süresi uzayabilir (ayarın kendi açıklaması da söyler).
export const SISTEM_UYARILARI: Record<string, string> = {
  'plan.motor-ufuk-gun': 'Değişiklik sonraki Planı güncelle ile plana girer.',
  'plan.motor-dilim-dk': 'Değişiklik sonraki Planı güncelle ile plana girer.',
};
