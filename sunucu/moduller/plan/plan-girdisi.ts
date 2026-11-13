import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { KAYNAK_DEGISIKLIK_ALANLARI, KAYNAK_FARKI_EN_COK, type KaynakDegisikligi, type KaynakDegisiklikAlani } from '#paylasilan/sozlesme/planlama.ts';
import { TESIS_SAAT_DILIMI, tesisGunu } from '#paylasilan/zaman.ts';
import { tipliKaynakBirlestir, type KaynakBirlestir } from './girdi/birlestirme.ts';
import { girdiFarki, type GirdiFarki } from './girdi/esdegerlik.ts';
import type { KaynakDilimiOkumasi } from './girdi/kaynaklar-kurallar.ts';
import { taslakEkMesaisi } from './planlama-kurallar.ts';
import type { MotorDurumu, MotorPlani } from './plan-motoru.ts';

// Planın girdisi (st) planlama çerçevesindeki kodla kurulur: motor/girdi.js çerçeveye de gömülür (planlama-derle.ts), aynı kayıt,
// çalışma ve kaynak okuması iki yerde aynı st'yi verir. Motor gibi boş `vm` bağlamında yüklenir; duvar saati tesisin saat dilimindedir.
const MOTOR = join(dirname(fileURLToPath(import.meta.url)), 'motor');
const DOSYALAR = ['engine', 'kisitlar', 'girdi', 'durum'] as const;

let kod: string | null = null;
function girdiKodu(): string {
  kod ??= `${DOSYALAR.map((m) => readFileSync(join(MOTOR, `${m}.js`), 'utf8')).join('\n')}\n;({ girdiKur, yeniCalismaKur });`;
  return kod;
}
// Sunucu çözücüsünün çevirisi (motor/emirler.js) aynı dosyalarla aynı bağlamda yüklenir; çerçeveye de gömülür (planlamaMotoru).
let cozumKod: string | null = null;
function cozumKodu(): string {
  cozumKod ??= `${[...DOSYALAR, 'emirler'].map((m) => readFileSync(join(MOTOR, `${m}.js`), 'utf8')).join('\n')}\n;({ sunucuCozumGirdisi });`;
  return cozumKod;
}

export interface KaynakOkumasi { durum: unknown; ek: unknown }
export interface GirdiIstegi {
  // Ortak çalışma kaydı (recete-rota-motoru-v1:planlama) ve Reçete ve Rota kaydı (recete-rota-motoru-v1), kayıttaki biçimiyle.
  calisma: unknown;
  kayit: unknown;
  kaynak: KaynakOkumasi | null;
  // Başlangıcı olmayan çalışmanın başlangıç günü ('GGGG-AA-GG'); verilmezse tesisin bugünü.
  bugun?: string;
  // 1720 kaynak: bayrak (plan.tipli-girdi) açıksa tipli kaynak dilimi okuması; kaynak alanlarını o kurar (girdi/birlestirme.ts).
  kaynakDilimi?: KaynakDilimiOkumasi | null;
}
// kaynakDegisikligi: birleşme planı eskittiyse neyin değiştiği (1962); eskitmediyse null.
export interface PlanGirdisi { S: Record<string, unknown>; st: MotorDurumu; kaynakDegisikligi?: KaynakDegisikligi | null }

// 1962: birleşmenin bulduğu değişiklik atılmasın. Betik değişmez: kaynakBirlestir, otoArizaUygula ve otoBakimUygula bağlamın genel nesnesindedir, girdiKur
// onları adıyla çağırır (tipli dilim de aynı yolla sarılır). Sarmalayan çağrıdan önceki değeri alır, değişen alanın farkını toplar.
interface Izci { alanlar: Set<KaynakDegisiklikAlani>; farklar: GirdiFarki[]; kesik: boolean; artis: number }
const KAYNAK_ALANI = new Set<string>(KAYNAK_DEGISIKLIK_ALANLARI);
const jsonKopya = <T>(x: T): T => (x === undefined ? x : (JSON.parse(JSON.stringify(x)) as T));

// B-2500-4: kaynak listelerinin öğesi her düzeyde kimliğiyle (id, yoksa kod) eşlenir; sırayla eşlenseydi araya giren bir tezgâh bütün
// tezgâhları değişmiş gösterirdi. Kimliği olmayan ya da tekrarlayan listede sıra kalır; nesne ve ilkel değerde girdiFarki'nin kuralı geçer.
function kimlikle(l: readonly unknown[]): Map<string, unknown> | null {
  const m = new Map<string, unknown>();
  for (const x of l) {
    const o = x !== null && typeof x === 'object' ? (x as { id?: unknown; kod?: unknown }) : null;
    const k = o === null ? undefined : o.id ?? o.kod;
    if ((typeof k !== 'string' && typeof k !== 'number') || m.has(String(k))) return null;
    m.set(String(k), x);
  }
  return m;
}
const nesne = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);
const altYol = (ust: string, k: string): string => (k.startsWith('[') ? `${ust}${k}` : `${ust}.${k}`);

function kimlikFarki(eski: unknown, yeni: unknown, yol: string, l: GirdiFarki[], sinir: number): void {
  if (l.length >= sinir) return;
  if (Array.isArray(eski) && Array.isArray(yeni)) {
    const e = kimlikle(eski), y = kimlikle(yeni);
    if (e === null || y === null) {
      if (eski.length !== yeni.length) l.push({ yol: `${yol}.length`, eski: eski.length, yeni: yeni.length });
      for (let i = 0; i < Math.min(eski.length, yeni.length); i++) kimlikFarki(eski[i], yeni[i], `${yol}[${String(i)}]`, l, sinir);
      return;
    }
    if (e.size !== y.size) l.push({ yol: `${yol}.length`, eski: e.size, yeni: y.size });
    for (const k of new Set([...y.keys(), ...e.keys()])) kimlikFarki(e.get(k), y.get(k), `${yol}[${k}]`, l, sinir);
    return;
  }
  if (nesne(eski) && nesne(yeni)) {
    for (const k of [...new Set([...Object.keys(eski), ...Object.keys(yeni)])].sort()) kimlikFarki(eski[k], yeni[k], altYol(yol, k), l, sinir);
    return;
  }
  for (const f of girdiFarki(eski, yeni, 1)) if (l.length < sinir) l.push({ ...f, yol });
}

function farkEkle(izci: Izci, eski: unknown, yeni: unknown, yol: KaynakDegisiklikAlani): void {
  const kalan = KAYNAK_FARKI_EN_COK - izci.farklar.length;
  if (kalan <= 0) { izci.kesik = true; return; }
  const l: GirdiFarki[] = [];
  kimlikFarki(eski, yeni, yol, l, kalan + 1);
  if (l.length > kalan) izci.kesik = true;
  izci.farklar.push(...l.slice(0, kalan));
}

function izle(baglam: object, izci: Izci): void {
  const g = baglam as {
    kaynakBirlestir: KaynakBirlestir;
    otoArizaUygula: (S: Record<string, unknown>, ...x: unknown[]) => boolean;
    otoBakimUygula: (S: Record<string, unknown>, ...x: unknown[]) => boolean;
  };
  const birlestir = g.kaynakBirlestir;
  g.kaynakBirlestir = (D0, kayit, kaynak, bugun) => {
    const once = jsonKopya(D0);
    const alanlar = birlestir(D0, kayit, kaynak, bugun);
    if (alanlar.length > 0) izci.artis += 1;
    for (const a of alanlar) {
      if (!KAYNAK_ALANI.has(a)) continue;
      const alan = a as KaynakDegisiklikAlani;
      izci.alanlar.add(alan);
      farkEkle(izci, once[a], jsonKopya(D0[a]), alan);
    }
    return alanlar;
  };
  const ariza = g.otoArizaUygula;
  g.otoArizaUygula = (S, ...x) => {
    const once = jsonKopya(S.down);
    const oldu = ariza(S, ...x);
    if (oldu) { izci.artis += 1; izci.alanlar.add('ariza'); farkEkle(izci, once, jsonKopya(S.down), 'ariza'); }
    return oldu;
  };
  // 2319 (S10): Arkon periyodik bakımı da tezgâh duruşudur; şeritte motorun kısıt adıyla aynı alanda (arıza ve planlı bakım) görünür.
  const bakim = g.otoBakimUygula;
  g.otoBakimUygula = (S, ...x) => {
    const once = jsonKopya(S.down);
    const oldu = bakim(S, ...x);
    if (oldu) { izci.artis += 1; izci.alanlar.add('ariza'); farkEkle(izci, once, jsonKopya(S.down), 'ariza'); }
    return oldu;
  };
}

// Veri sürümü arttıysa değişiklik vardır. Sarılan iki çağrının açıklamadığı artış Reçete ve Rota kaydının yeniden çevrilmesidir (girdiKur ilk adımı).
function kaynakDegisikligiKur(oncekiSurum: unknown, S: Record<string, unknown>, izci: Izci): KaynakDegisikligi | null {
  const once = Number(oncekiSurum), sonra = Number(S.dataVer);
  if (!Number.isFinite(once) || !Number.isFinite(sonra) || sonra <= once) return null;
  if (sonra - once > izci.artis) izci.alanlar.add('receteRotaKaydi');
  return { alanlar: KAYNAK_DEGISIKLIK_ALANLARI.filter((a) => izci.alanlar.has(a)), farklar: izci.farklar, kesik: izci.kesik };
}

// Bağlam kurulur ve betikler yüklenir. Tipli dilim verilmişse bağlamın kaynakBirlestir'i onu da uygulayan sürümle değişir: betiğin
// işlevleri bağlamın genel nesnesindedir, girdiKur onu adıyla çağırır. Betik dosyası değişmez; eski yol bayrak kapalıyken aynen koşar.
function baglamla<T>(kod: string, dosya: string, kaynakDilimi: KaynakDilimiOkumasi | null | undefined, izci?: Izci): T {
  const baglam = vm.createContext({ GIRDI_SAAT_DILIMI: TESIS_SAAT_DILIMI });
  const sonuc = vm.runInContext(kod, baglam, { filename: dosya }) as T;
  if (kaynakDilimi) {
    const g = baglam as { kaynakBirlestir: KaynakBirlestir };
    g.kaynakBirlestir = tipliKaynakBirlestir(g.kaynakBirlestir, kaynakDilimi);
  }
  if (izci) izle(baglam, izci);
  return sonuc;
}

type GirdiKur = (calisma: unknown, kayit: unknown, kaynak: KaynakOkumasi | null, bugun: string) => PlanGirdisi | null;

// Her çağrı yeni bağlam kurar; girdiler kopyalanır, çağıranın nesneleri değişmez. Çalışma yoksa null.
export function planGirdisi(istek: GirdiIstegi, simdi: number = Date.now()): PlanGirdisi | null {
  const izci: Izci = { alanlar: new Set(), farklar: [], kesik: false, artis: 0 };
  const { girdiKur } = baglamla<{ girdiKur: GirdiKur }>(girdiKodu(), 'plan-girdisi.js', istek.kaynakDilimi, izci);
  const sonuc = girdiKur(jsonKopya(istek.calisma), jsonKopya(istek.kayit), jsonKopya(istek.kaynak), istek.bugun ?? tesisGunu(simdi));
  if (sonuc === null) return null;
  // Bağlamın nesneleri onun dizi ve nesne türlerindendir; sunucunun türlerine yapılandırılmış kopyayla geçer (sonsuz değer korunur).
  const g = structuredClone(sonuc);
  const oncekiSurum = (istek.calisma as { dataVer?: unknown } | null)?.dataVer;
  return { ...g, kaynakDegisikligi: structuredClone(kaynakDegisikligiKur(oncekiSurum, g.S, izci)) };
}

// 657 a: kayıt yoksa sayfanın açacağı boş çalışma (çerçevenin yeniCalisma'sı); veri Reçete ve Rota kaydından ve kaynak okumasından.
export function yeniCalisma(kayit: unknown, kaynak: KaynakOkumasi | null, bugun: string): Record<string, unknown> {
  const baglam = vm.createContext({ GIRDI_SAAT_DILIMI: TESIS_SAAT_DILIMI });
  const { yeniCalismaKur } = vm.runInContext(girdiKodu(), baglam, { filename: 'plan-girdisi.js' }) as {
    yeniCalismaKur: (kayit: unknown, kaynak: KaynakOkumasi | null, bugun: string) => Record<string, unknown>;
  };
  return structuredClone(yeniCalismaKur(kayit === undefined ? null : structuredClone(kayit), kaynak === null ? null : structuredClone(kaynak), bugun));
}

// Asıl plana yazan komutun isteği motorun diline (ADR 0018 karar 3): anahtar "emir no|OP no", makine kimliği metin, anlar ISO.
export interface CozumIstegi extends PlanBenzetimi {
  simdi: string;
  kuyruklar: { makineId: number; anahtarlar: string[] }[];
  sabitler: { anahtar: string; makineId: number; baslangic: string; bitis: string }[];
  calisanlar: { anahtar: string; makineId: number | null; baslangic: string | null; sayimAni: string | null; kalanVerimliDk: number }[];
  // 512 1 a: plan taslağının kabul edilmiş ek vardiyaları (gün takvim günü); verilirse çalışmanın ek vardiyalarının yerine geçer.
  ekMesai?: { makineId: number; gun: string; vardiyaId: number }[];
  // 690 b: emirler arası öncül (parti kolu); anahtar, oncul bitmeden başlamaz.
  baglar?: { anahtar: string; oncul: string }[];
  // 686 a: rotada olmayan ek adım (emrin kendi adımı); öncül ve ardıl emrin içindeki komşu adımların anahtarı, süreler dakika.
  ekAdimlar?: EkAdim[];
  // 1202: kuyruk işinin önündeki bitmemiş fasonun kalan süresi (gün; Üretim Emirleri'nin fasonBekleGun'u). Motor öncülü fason değilse uygular.
  fasonBekleme?: { anahtar: string; gun: number }[];
  // 1888 b: kişiye yerleşen işler kişinin el tezgâhında dizilir. kisiAdaylari: anahtarın aday kişileri (yoksa yalnız kuyruğun kişisi);
  // kisiSabitleri kişinin yeri sabit işleridir (el tezgâhı o aralıkta doludur).
  kisiKuyruklari?: { kisiId: number; anahtarlar: string[] }[];
  kisiAdaylari?: { anahtar: string; kisiIdler: number[] }[];
  kisiSabitleri?: { anahtar: string; kisiId: number; baslangic: string; bitis: string }[];
}
// 1408: taslağın denemesi ve emir önizlemesi (eski motorun yerine). Sanal emrin adımları kuyrukta "no|OP no" anahtarıyla geçer; makine
// kimliği ve günler metin değil sayı ve 'GGGG-AA-GG'.
export interface PlanBenzetimi {
  // adimAdetleri: OP no -> adımın adedi, yalnız emir adedinden farklı olanlar (dal çarpanı, 1257 a); motor gerçek emirdeki gibi okur.
  sanalEmirler?: { no: string; malzemeId: number; adet: number; baslangic: string | null; teslim: string | null; oncelik: number; adimAdetleri?: Record<string, number> }[];
  emirDegisiklikleri?: { emirNo: string; oncelik?: number; teslim?: string }[];
  kapaliMakineler?: number[];
  kapaliGunler?: string[];
}
export interface EkAdim { anahtar: string; ad: string; oncul: string | null; ardil: string | null; ayarDk: number; birimDk: number; adet: number }
export interface CozumGirdisi {
  st: MotorDurumu;
  taban: MotorPlani;
  // Planın saat ekseninin başlangıç günü ('GGGG-AA-GG'); motorun saatleri bu günün 00:00'ından, tesisin duvar saatiyle.
  baslangic: string;
  // Motorda karşılığı olmayan kuyruk işleri (rotasız emir, emirde değişen adım, Reçete ve Rota'da ürünü olmayan emir).
  yerlesmeyen: string[];
  // Vardiyası tanımsız tezgâhtaki kuyruk işleri (168 b): dizilmez; plan komutu durmaz, uyarıyla boş bırakır.
  vardiyasiz: string[];
  // Motorun işlem kimliği -> istekteki anahtar.
  kimlik: Record<string, string>;
  // Kuyruktaki işlerin motor kimlikleri.
  sira: string[];
  // Kuyruktaki işin öncüllerinin motor kimlikleri (rota bağı ve emirler arası öncül).
  oncul: Record<string, string[]>;
}

// Çalışma planının çevirisi (motor/calisma.js) de çerçeveye gömülmez.
let calismaKod: string | null = null;
function calismaKodu(): string {
  calismaKod ??= `${[...DOSYALAR, 'calisma'].map((m) => readFileSync(join(MOTOR, `${m}.js`), 'utf8')).join('\n')}\n;({ sunucuCalismaPlani });`;
  return calismaKod;
}
// takim (3199 D): motorun işe yazdığı özel takım ömrü kaydı; n değişim sayısı (0: ömür yetti), at değişimin plan eksenindeki saati.
export interface CalismaIslemi { id: string; m: string; S: number; C: number; bitti: boolean; takim?: { id: string; n: number; dk: number; at: number | null }[] }
export interface CalismaPlani {
  // Planın saat ekseninin başlangıç günü ('GGGG-AA-GG').
  baslangic: string;
  guncel: boolean;
  // Motorun işlem kimliği (sipariş.k) -> "emir no|OP no"; yalnız sunucuda karşılığı olanlar.
  kimlik: Record<string, string>;
  // Çalışmada plan yoksa null.
  ops: CalismaIslemi[] | null;
  // Ek vardiyalar (507 2 a): m tezgâh kimliği, gun planın ekseninde gün, vardiya kimliği; ikisi de metin.
  ekMesai: { m: string; gun: number; vardiya: string }[];
}

// Girdiler kopyalanır, çağıranın nesneleri değişmez. Çalışma yoksa null.
export function calismaPlani(istek: GirdiIstegi, simdi: number = Date.now()): CalismaPlani | null {
  const { sunucuCalismaPlani } = baglamla<{
    sunucuCalismaPlani: (calisma: unknown, kayit: unknown, kaynak: KaynakOkumasi | null, bugun: string) => CalismaPlani | null;
  }>(calismaKodu(), 'calisma-plani.js', istek.kaynakDilimi);
  const kopya = <T>(x: T): T => (x === undefined ? x : (JSON.parse(JSON.stringify(x)) as T));
  const sonuc = sunucuCalismaPlani(kopya(istek.calisma), kopya(istek.kayit), kopya(istek.kaynak), istek.bugun ?? tesisGunu(simdi));
  return sonuc === null ? null : structuredClone(sonuc);
}

// Girdiler kopyalanır, çağıranın nesneleri değişmez. Çalışma yoksa null.
export function cozumGirdisi(g: Omit<GirdiIstegi, 'bugun'> & { istek: CozumIstegi }): CozumGirdisi | null {
  const { sunucuCozumGirdisi } = baglamla<{
    sunucuCozumGirdisi: (calisma: unknown, kayit: unknown, kaynak: KaynakOkumasi | null, istek: CozumIstegi, bugun: string) => CozumGirdisi | null;
  }>(cozumKodu(), 'plan-cozumu.js', g.kaynakDilimi);
  const kopya = <T>(x: T): T => (x === undefined ? x : (JSON.parse(JSON.stringify(x)) as T));
  const sonuc = sunucuCozumGirdisi(kopya(g.istek.ekMesai ? taslakEkMesaisi(g.calisma, g.istek.ekMesai) : g.calisma), kopya(g.kayit), kopya(g.kaynak), kopya(g.istek), tesisGunu(Date.parse(g.istek.simdi)));
  return sonuc === null ? null : structuredClone(sonuc);
}

// 2790: elle taşımanın takvimi (motor/tasima.js) aynı dosyalarla aynı bağlamda kurulur; yer işlevi bağlamın derlemesini kullanır.
let tasimaKod: string | null = null;
function tasimaKodu(): string {
  tasimaKod ??= `${[...DOSYALAR, 'tasima'].map((m) => readFileSync(join(MOTOR, `${m}.js`), 'utf8')).join('\n')}\n;({ sunucuTasimaTakvimi });`;
  return tasimaKod;
}
export interface TasimaTakvimi {
  donuk: number; ufuk: number; tasimaSaat: number;
  onculler: Record<string, [string, 'b' | 'o'][]>;
  opNo: Record<string, string>;
  // Emrin adımları rota sırasında; fas: adım yalnız fasonda yapılır.
  emirler: Record<string, { id: string; adaylar: string[]; fas: boolean }[]>;
  yer: (id: string, m: string, t: number) => { S: number; C: number; lot1: number } | null;
  saatMetni: (h: number) => string;
  tezgahAdi: (m: string) => string;
}
// Girdi birleşmiş çalışmadır (planlamaCalismasi); kopyalanır. Şimdi planın ekseninde saattir.
export function tasimaTakvimi(calisma: unknown, simdi: number): TasimaTakvimi {
  const { sunucuTasimaTakvimi } = baglamla<{ sunucuTasimaTakvimi: (S: unknown, now: number) => TasimaTakvimi }>(tasimaKodu(), 'tasima-takvimi.js', null);
  const t = sunucuTasimaTakvimi(jsonKopya(calisma), simdi);
  const yer: TasimaTakvimi['yer'] = (id, m, h) => { const y = t.yer(id, m, h); return y === null ? null : { S: y.S, C: y.C, lot1: y.lot1 }; };
  return { donuk: t.donuk, ufuk: t.ufuk, tasimaSaat: t.tasimaSaat, onculler: structuredClone(t.onculler), opNo: structuredClone(t.opNo), emirler: structuredClone(t.emirler), yer, saatMetni: (h) => String(t.saatMetni(h)), tezgahAdi: (m) => String(t.tezgahAdi(m)) };
}
