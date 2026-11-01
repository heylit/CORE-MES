import { useMemo } from 'react';
import type { KatalogAyarlariCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import type { BirimSistemi, GenelAyar, KartKaydi, KartOzeti, KatalogKarti, KatalogOrtami, MalzemeAyari, Sablon } from '../tipler.ts';
import type { MalzemeYetkisi } from '../yetki.ts';
import { cekirdekSec, derinKopya, type BaslatGirdisi } from './cekirdek/baglam.ts';
import { SABIT_NESNELER } from './cekirdek/hepsi.ts';
import type * as C from './cekirdek/hepsi.ts';

// Prototipin işlevleri aynı ad ve aynı parametre sırasıyla (PARCA-SOZLESMESI.md, imza kuralı): taslağa (prototipte genel `D`) bakan
// işlev taslağı parametre olarak alır, genel duruma bakan her işlev son parametre olarak bağlamı alır. Çekirdek (cekirdek/) prototipin
// kural kodudur, tiplidir; dönüş tipleri çekirdeğin işlevlerinden gelir. Girdi nesneleri değiştirilmez: taslak
// her çağrıda kopyalanır, kartı değiştiren işlev (withRev, onayAta, kodlariSabitle) kopyayı döndürür.

// Parçaların kullandığı çekirdek tipleri (sihirbaz, katalog, şablonlar yerel tip yazmasın diye).
export type {
  Agirlik, Aile, AileSecenegi, Alan, Ayar, DemirbasKategorisi, Form, FormOlcusu, HizmetCesidi, HizmetKategorisi, Kalite, Kategori, Olcu, OlcuTanimi,
  OperasyonGrubu, OperasyonTanimi, Ozellik, OzellikDegerleri, Sinif, Sozluk, Taslak, Tur, TurAdimi,
} from './cekirdek/tipler.ts';
export type { UyumSorunu } from './cekirdek/uyumluluk.ts';
export type { BenzerKart, MukerrerGrubu, MuadilKart } from './cekirdek/onay.ts';
export type { OlcuGrubu, VaryantSecimi } from './cekirdek/varyant.ts';
export type { RotaAdimi } from './cekirdek/operasyon.ts';
export type { Belge, BomSatiri, Maliyet, TakvimKaydi, TurDegerleri, TurTaslagi } from './cekirdek/turler.ts';
export type { HizliAramaSonucu, HizliAyristirma } from './cekirdek/hizli-arama.ts';
export type { XlExcelJS } from './cekirdek/excel.ts';

export interface Operasyon { kod: string; ad: string; grup: string; grupAdi: string; fason: boolean; aktif: boolean }

export interface KuralBaglami {
  ortam: KatalogOrtami;
  // Malzeme ayarı uygulanmış tanımlar (prototipin FAMS, PROPS, SERTIFIKA ... tablolarının taze kopyası).
  t: Tanimlar;
  genel: GenelAyar;
  birim: BirimSistemi;
  kartlar: readonly KatalogKarti[];
  sablonlar: readonly Sablon[];
  kisi: { id: number; ad: string };
  operasyonlar: readonly Operasyon[];
  yetki: MalzemeYetkisi;
}

// Çekirdeğin dışa verdiği adlar prototipin genel adlarıdır; tip denetimi kabuktaki sarmallardadır.
type Cekirdek = typeof C;
export type Motor = Cekirdek & { __taslak: { yaz: (d: KartKaydi) => void; oku: () => KartKaydi } };
// Verilen başlangıçla kurulmuş çekirdeğin tablolarının kopyası (sabitler/index.ts taban hâli için).
// Tablolar kopyalanır (bağlam değişince değişmesinler); işlevler ve sabit değerler çekirdeğin kendisidir.
export function tablolariKopyala(girdi: BaslatGirdisi): Cekirdek {
  const c = cekirdekSec({}, girdi);
  return { ...c, ...derinKopya(Object.fromEntries(SABIT_NESNELER.map((a) => [a, c[a]]))) };
}

let cephe: Motor | null = null;
function motorKur(anahtar: object, girdi: BaslatGirdisi): Motor {
  const c = cekirdekSec(anahtar, girdi);
  cephe ??= Object.assign(Object.create(c) as Cekirdek, { __taslak: { yaz: (d: KartKaydi) => { c.ayarla_D(d); }, oku: (): KartKaydi => c.D } });
  return cephe;
}

// Prototipin `hazir` cevabı (köprünün kurduğu nesne): çekirdeğin başlangıcı bunu okur.
function hazirCevabi(ortam: KatalogOrtami, kisi: { id: number; ad: string }, yetki: MalzemeYetkisi): Record<string, unknown> {
  return {
    kullanici: kisi,
    rol: ortam.rol,
    saltOkunur: ortam.rol === null,
    ayarlarSunucuda: true,
    ayarKaydedilir: ortam.ayarYazabilir,
    malzemeAyarlari: ortam.malzemeAyari,
    operasyonlar: operasyonlariEsle(ortam.operasyonTipleri),
    operasyonKaynagi: 'İstasyonlar > Operasyon tipleri',
    depoYeriStoktan: true,
    sablonlar: true,
    rotaSablonlari: true,
    belgeler: false,
    genel: ortam.genel,
    onay: { dortGoz: ortam.dortGoz },
    kgFiyati: yetki.kgFiyatiOkur,
  };
}

// MKK-18: liste yalnız istasyonlardan gelir ve salt okunurdur (kart #544).
export function operasyonlariEsle(tipler: readonly KatalogAyarlariCevabi['operasyonTipleri'][number][]): Operasyon[] {
  return tipler.map((o) => ({ kod: o.kod, ad: o.ad, grup: o.grup, grupAdi: o.grupAdi, fason: o.grup === 'FAS', aktif: o.aktif }));
}

const girdiler = new WeakMap<object, BaslatGirdisi>();

function motorGirdisi(b: Omit<KuralBaglami, 't'>, ayar: MalzemeAyari): BaslatGirdisi {
  return {
    hazir: { ...hazirCevabi(b.ortam, b.kisi, b.yetki), malzemeAyarlari: ayar },
    birim: b.birim,
    kartlar: b.kartlar.map((k) => k.kayit),
    sablonlar: [...b.sablonlar],
    kaldirabilir: null,
  };
}

// Çekirdek tek durumla çalışır; bağlam değişince durum yeniden kurulur (cekirdek/baglam.ts).
export function cekirdek(b: KuralBaglami): Motor {
  let g = girdiler.get(b);
  if (!g) { g = motorGirdisi(b, b.ortam.malzemeAyari); girdiler.set(b, g); }
  return motorKur(b, g);
}

const clone = <T>(x: T): T => (x === undefined || x === null ? x : structuredClone(x));

function taslakla<T>(b: KuralBaglami, d: KartKaydi, f: (m: Motor, d: KartKaydi) => T): T {
  const m = cekirdek(b);
  const onceki = m.__taslak.oku() as KartKaydi;
  const k = clone(d);
  m.__taslak.yaz(k);
  try {
    return f(m, k);
  } finally {
    m.__taslak.yaz(onceki);
  }
}

// Ayarla birleşmiş tanım tabloları; prototipte yerinde değiştirilen genel tabloların karşılığı. Ad prototipteki tablo adıdır.
export const TANIM_ADLARI = [
  'FAMS', 'PROPS', 'SERTIFIKA', 'BIRIMLER', 'BIRIM_T', 'DOCTIPS', 'TOLP', 'HM_GRUP', 'SARF_KAT', 'DB_KAT', 'HZ_KAT', 'ALAN', 'FORMS', 'TURLER', 'KOD_TUR',
  'ROLLER', 'YETKI', 'YETKI_AD', 'OPS', 'YM_TIP', 'KONTROL', 'STDS', 'CLS_STDS', 'SYS_TPL', 'MODS', 'INFO', 'LINFO', 'DEFBIRIM',
] as const;
export type Tanimlar = { [A in (typeof TANIM_ADLARI)[number]]: Cekirdek[A] };

function tanimlariAl(m: Motor): Tanimlar {
  const t = {} as Record<string, unknown>;
  for (const ad of TANIM_ADLARI) t[ad] = (m as unknown as Record<string, unknown>)[ad];
  // Tablolar çekirdeğin canlı nesneleridir; bağlam değişince değişmesinler diye kopyalanır.
  return derinKopya(t) as Tanimlar;
}

// Malzeme ayarını taban tablolara uygular (prototipin malzemeAyarUygula'sı); taban tablolar değişmez.
export function malzemeAyarUygula(v: MalzemeAyari, b: Omit<KuralBaglami, 't'>): Tanimlar {
  return tanimlariAl(motorKur({}, motorGirdisi(b, v)));
}

export interface BaglamGirdisi {
  ortam: KatalogOrtami;
  kartlar: readonly KatalogKarti[] | undefined;
  sablonlar?: readonly Sablon[] | undefined;
  kisi: { id: number; ad: string };
  birim: BirimSistemi;
  yetki: MalzemeYetkisi;
}

export function kuralBaglami(g: BaglamGirdisi): KuralBaglami {
  const yari = {
    ortam: g.ortam, genel: g.ortam.genel, birim: g.birim, kartlar: g.kartlar ?? [], sablonlar: g.sablonlar ?? [], kisi: g.kisi,
    operasyonlar: operasyonlariEsle(g.ortam.operasyonTipleri), yetki: g.yetki,
  };
  const b = { ...yari, t: {} as Tanimlar };
  b.t = tanimlariAl(cekirdek(b));
  return b;
}

// Bağlam ortam, kartlar, şablonlar, kişi, birim ya da yetki değişince yeniden kurulur; aynı girdide aynı nesne kalır.
export function useKuralBaglami(g: BaglamGirdisi): KuralBaglami {
  const { ortam, kartlar, sablonlar, kisi, birim, yetki } = g;
  return useMemo(() => kuralBaglami({ ortam, kartlar, sablonlar, kisi, birim, yetki }), [ortam, kartlar, sablonlar, kisi, birim, yetki]);
}

// Kaydet ucunun özeti (prototipin Store.put'u): M1 ve M2 aynı işlevi kullanır.
export function kartOzeti(kayit: KartKaydi, b: KuralBaglami): KartOzeti {
  const m = cekirdek(b);
  const o = m.stokOzeti(clone(kayit)) as Record<string, unknown>;
  const metin = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
  return {
    stok_kodu: metin(o['stok_kodu']),
    tur: kayit.tur || 'hammadde',
    onay_durumu: m.onayDurum(kayit),
    benzersiz_anahtar: metin(m.kartAnahtari(clone(kayit))),
    mukerrer_gerekcesi: metin(kayit.mukerrerOnay?.neden),
    uygulanmayan_zorunlu: m.uygulanmayanZorunlu(clone(kayit)),
    birim_agirlik_kg: typeof o['birim_agirlik_kg'] === 'number' ? o['birim_agirlik_kg'] : null,
    kalite_adi: metin(o['kalite_adi']),
    form_adi: metin(o['form_adi']),
    aciklama_1: metin(o['aciklama_1']),
    aciklama_2: metin(o['aciklama_2']),
    aciklama_3: metin(o['aciklama_3']),
  };
}

// Prototipin removeIncompatible'ı (taslağı yerinde değiştirir) saf karşılığı: yeni taslak döner.
export function uyumsuzlariKaldir(d: KartKaydi, b: KuralBaglami): KartKaydi {
  return taslakla(b, d, (m) => { m.removeIncompatible(); return m.__taslak.oku() as KartKaydi; });
}

// Föy (prototipin specHTML'i ve ona eklenen kod-açıklama ile kg fiyatı ekleri) yapılandırılmış veri olarak: ekran HTML dizesi
// basmaz, bileşen bu veriyi çizer. Bölüm sırası, başlıklar ve satır koşulları prototiptekiyle aynıdır.
export interface FoySatiri { ad: string; deger: string; degisti?: true }
export interface FoyBolumu { baslik: string; satirlar: FoySatiri[]; not?: string }
export interface FoyAgirligi { ad: string; deger: string }
export interface FoyVerisi {
  kod: string;
  ad: string;
  tur: string;
  // Renk anahtarı: hammaddede aile, diğer türlerde tür (tasarım değişkenine eşlenir).
  aile: string | null;
  // Aile ya da tür seçilmemiş taslak: prototip "Föy, seçimlerini yaptıkça burada oluşur." yazar.
  bos: boolean;
  agirliklar: FoyAgirligi[];
  bolumler: FoyBolumu[];
}

const ESDEGER_NOTU = '≈ işareti yakın eşdeğeri gösterir; bileşim ve mekanik sınırlar normlar arasında birebir aynı olmayabilir.';

function doluMu(v: unknown): boolean { return v === 0 || (v !== undefined && v !== null && v !== '' && v !== false); }
function satirlar(ciftler: readonly (readonly [string, unknown, boolean?])[]): FoySatiri[] {
  return ciftler.filter(([, v]) => doluMu(v)).map(([ad, v, ch]) => (ch ? { ad, deger: String(v), degisti: true } : { ad, deger: String(v) }));
}

// Prototipte belgeler köprüde kapalıdır (hazır cevabında belgeler: false); föyde Belgeler bölümü çizilmez.
export function foyVerisi(d: KartKaydi, b: KuralBaglami, kisa = false): FoyVerisi {
  return taslakla(b, d, (m, d) => {
    const kod = String(m.finalKod(d) ?? '');
    const tur = d.tur || 'hammadde';
    if (m.isGen(d)) {
      const t: Partial<(typeof m.TURLER)[string]> = m.TURLER[d.tur] ?? {};
      const ad = String(m.finalAd(d) || t.ad || '');
      const rows = (m.gFlat(d) as [string, string, string][]).filter(([s, k]) => s !== 'Tanım' || (k !== 'Kod' && k !== 'Ad'));
      const bolumler: FoyBolumu[] = [];
      if (kisa) bolumler.push({ baslik: '', satirlar: rows.slice(0, 9).map(([, ad, deger]) => ({ ad, deger })) });
      else for (const [s, k, v] of rows) {
        const son = bolumler[bolumler.length - 1];
        if (son && son.baslik === s) son.satirlar.push({ ad: k, deger: v });
        else bolumler.push({ baslik: s, satirlar: [{ ad: k, deger: v }] });
      }
      if (!kisa) kodVeAciklama(m, d, kod, bolumler);
      return { kod, ad, tur, aile: tur, bos: false, agirliklar: [], bolumler };
    }
    const s = m.specData(d);
    if (!s.f) return { kod, ad: '', tur, aile: null, bos: true, agirliklar: [], bolumler: [] };
    const ad = String(s.ad || `${s.f.ad} (kalite seçilmedi)`);
    const w = s.w;
    const props = (s.props as { ad: string; v: unknown; u: string; ch: boolean }[]).map((p) => [p.ad, m.propDisp(p.v, p.u), p.ch] as const);
    const esdeger = Object.entries(s.eq as Record<string, string>);
    if (kisa) {
      const agirliklar: FoyAgirligi[] = [];
      if (w) {
        agirliklar.push({ ad: s.fm?.mass ? 'Ambalaj' : 'Parça', deger: m.kgFmt(w.kg) });
        if (m.isNum(w.perM)) agirliklar.push({ ad: 'Metre', deger: m.perMFmt(w.perM) });
        if (m.isNum(w.perM2)) agirliklar.push({ ad: 'Metrekare', deger: m.perM2Fmt(w.perM2) });
      }
      const ciftler = [['Aile', s.f.ad], ['Sınıf', s.c?.ad], ...esdeger.slice(0, 3), ['Form', s.fm?.ad], ['Ölçü', m.dimsStr(d)], ...props.slice(0, 6)] as const;
      return { kod, ad, tur, aile: d.fam, bos: false, agirliklar, bolumler: [{ baslik: '', satirlar: satirlar(ciftler) }] };
    }
    const bolumler: FoyBolumu[] = [{ baslik: 'Tanım', satirlar: satirlar([['Aile', s.f.ad], ['Sınıf', s.c?.ad], ['Kalite', s.g?.ad], ['Standart', s.std]]) }];
    if (esdeger.length) bolumler.push({ baslik: 'Eşdeğerler ve diğer adlar', satirlar: satirlar(esdeger), not: ESDEGER_NOTU });
    if (s.fm) {
      const agir = w ? [[s.fm.mass ? 'Ambalaj / rulo ağırlığı' : 'Parça ağırlığı', m.kgFmt(w.kg)], ...(m.isNum(w.perM) ? [['Metre ağırlığı', m.perMFmt(w.perM)]] : []), ...(m.isNum(w.perM2) ? [['Metrekare ağırlığı', m.perM2Fmt(w.perM2)]] : [])] : [];
      bolumler.push({ baslik: 'Form ve ölçüler', satirlar: satirlar([['Form', s.fm.ad], ['Ölçüler', m.dimsStr(d)], ['Tolerans', d.tol], ...agir] as [string, unknown][]) });
    }
    if (s.opts.length) bolumler.push({ baslik: 'Durum ve işlem', satirlar: satirlar((s.opts as { ad: string; v: string }[]).map((o) => [o.ad, o.v] as const)) });
    if (props.length) bolumler.push({ baslik: 'Teknik özellikler', satirlar: satirlar(props) });
    const ekler = ((d.extra ?? []) as { ad?: string; v?: unknown; u?: string }[]).filter((e) => e.ad);
    if (ekler.length) bolumler.push({ baslik: 'Ek özellikler', satirlar: satirlar(ekler.map((e) => [String(e.ad), `${String(e.v)}${e.u ? ` ${e.u}` : ''}`] as const)) });
    const cm = (d.com ?? {}) as { ted?: string; sertifika?: string[]; not?: string };
    bolumler.push({ baslik: 'Ticari', satirlar: satirlar([['Tedarikçi', cm.ted], ['Stok birimi', s.birim], ['Sertifikalar', (cm.sertifika ?? []).join(', ')], ['Notlar', cm.not]]) });
    kodVeAciklama(m, d, kod, bolumler);
    return { kod, ad, tur, aile: d.fam, bos: false, agirliklar: [], bolumler };
  });
}

function kodVeAciklama(m: Motor, d: KartKaydi, kod: string, bolumler: FoyBolumu[]): void {
  const ac = [0, 1, 2].map((i) => m.finalAc(d, i) as string);
  const tk = m.teknikKod(d) as string;
  if (!ac.some(Boolean) && !tk) return;
  bolumler.push({ baslik: 'Kod ve açıklamalar', satirlar: satirlar([['Teknik kod', tk && tk !== kod ? tk : ''], ...ac.map((v, i) => [`Açıklama ${i + 1}`, v] as const)]) });
}

// kg-fiyati-eki.ts'in satırları: yalnız hammaddede ve yalnız fiyatı okuyabilen rolde (fiyatlar null değilken). Fiyatı bilinmeyen
// tutar "—" yazılır, sıfır yazılmaz. Satırlar Ticari bölümünde stok biriminden sonra, sertifikalardan önce durur.
export interface FoyKgFiyati { kgFiyati: string | null; birimFiyati: string | null; paraBirimi: string; gecerlilik: string | null }
function tutarMetni(v: string | null, para: string): string {
  const n = Number(v);
  return v !== null && v !== '' && Number.isFinite(n) ? `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${para}` : '';
}
function gunMetni(t: string): string {
  const p = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  return p ? `${p[3]}.${p[2]}.${p[1]}` : t;
}
export function kgFiyatiSatirlari(veri: FoyVerisi, f: FoyKgFiyati | null | undefined): FoySatiri[] {
  if (veri.tur !== 'hammadde' || veri.bos) return [];
  if (!f) return [{ ad: 'Birim fiyat', deger: '—' }];
  const birim = veri.bolumler.find((x) => x.baslik === 'Ticari')?.satirlar.find((x) => x.ad === 'Stok birimi')?.deger;
  const bf = tutarMetni(f.birimFiyati, f.paraBirimi);
  const s: FoySatiri[] = [{ ad: 'Birim fiyat', deger: bf ? bf + (birim ? ` / ${birim}` : '') : '—' }];
  const kf = tutarMetni(f.kgFiyati, f.paraBirimi);
  if (kf) s.push({ ad: 'kg fiyatı (satın alma)', deger: kf + (f.gecerlilik ? `, ${gunMetni(f.gecerlilik)} itibarıyla` : '') });
  return s;
}
export function kgFiyatiEkle(veri: FoyVerisi, satirlar: readonly FoySatiri[]): FoyVerisi {
  const i = veri.bolumler.findIndex((x) => x.baslik === 'Ticari');
  const ticari = veri.bolumler[i];
  if (!satirlar.length || !ticari) return veri;
  const yer = ticari.satirlar.findIndex((x) => x.ad === 'Sertifikalar' || x.ad === 'Notlar');
  const yeni = [...ticari.satirlar];
  yeni.splice(yer < 0 ? yeni.length : yer, 0, ...satirlar);
  return { ...veri, bolumler: veri.bolumler.map((x, j) => (j === i ? { ...x, satirlar: yeni } : x)) };
}

// Prototipin yardımcı biçim ve arama işlevleri (M1 isteği); ad başındaki alt çizgi düşer.
export function asc(s: Parameters<Cekirdek['_asc']>[0], b: KuralBaglami): string { return cekirdek(b)._asc(s); }
export function nm(s: Parameters<Cekirdek['_nm']>[0], b: KuralBaglami): string { return cekirdek(b)._nm(s); }
export function normQ(s: Parameters<Cekirdek['normQ']>[0], b: KuralBaglami): string { return cekirdek(b).normQ(s); }
export function tStr(t: Date | null | undefined, b: KuralBaglami): string { return cekirdek(b)._tStr(t); }
export function fmtSize(bayt: Parameters<Cekirdek['fmtSize']>[0], b: KuralBaglami): string { return cekirdek(b).fmtSize(bayt); }
export function opGrupAd(k: Parameters<Cekirdek['opGrupAd']>[0], b: KuralBaglami): string { return cekirdek(b).opGrupAd(k); }

// M2 isteği: katalogun kullandığı tür kategorisi, simge, tür özeti ve kişi damgası.
export function sarfKat(d: Parameters<Cekirdek['sarfKat']>[0], b: KuralBaglami): ReturnType<Cekirdek['sarfKat']> { return cekirdek(b).sarfKat(d); }
export function dbKat(d: Parameters<Cekirdek['dbKat']>[0], b: KuralBaglami): ReturnType<Cekirdek['dbKat']> { return cekirdek(b).dbKat(d); }
export function hzKat(d: Parameters<Cekirdek['hzKat']>[0], b: KuralBaglami): ReturnType<Cekirdek['hzKat']> { return cekirdek(b).hzKat(d); }
export function kartIkon(x: Parameters<Cekirdek['kartIkon']>[0], b: KuralBaglami): ReturnType<Cekirdek['kartIkon']> { return cekirdek(b).kartIkon(x); }
export function gStokOzeti(d: Parameters<Cekirdek['gStokOzeti']>[0], b: KuralBaglami): ReturnType<Cekirdek['gStokOzeti']> { return cekirdek(b).gStokOzeti(d); }
export function kim(b: KuralBaglami): ReturnType<Cekirdek['_kim']> { return cekirdek(b)._kim(); }

export function newDraft(b: KuralBaglami): ReturnType<Cekirdek['newDraft']> { return cekirdek(b).newDraft(); }
export function grade(d: KartKaydi, b: KuralBaglami): ReturnType<Cekirdek['grade']> { return taslakla(b, d, (m, d) => m.grade(d)); }
export function clsObj(d: Parameters<Cekirdek['clsObj']>[0], b: KuralBaglami): ReturnType<Cekirdek['clsObj']> { return cekirdek(b).clsObj(d); }
export function clsOfGrade(fam: Parameters<Cekirdek['clsOfGrade']>[0], kod: Parameters<Cekirdek['clsOfGrade']>[1], b: KuralBaglami): ReturnType<Cekirdek['clsOfGrade']> { return cekirdek(b).clsOfGrade(fam, kod); }
export function clsKeyFor(d: Parameters<Cekirdek['clsKeyFor']>[0], b: KuralBaglami): ReturnType<Cekirdek['clsKeyFor']> { return cekirdek(b).clsKeyFor(d); }
export function gradeLabel(d: KartKaydi, b: KuralBaglami): ReturnType<Cekirdek['gradeLabel']> { return taslakla(b, d, (m, d) => m.gradeLabel(d)); }
export function keyFigure(d: KartKaydi, g: Parameters<Cekirdek['keyFigure']>[0], fam: Parameters<Cekirdek['keyFigure']>[1], b: KuralBaglami): ReturnType<Cekirdek['keyFigure']> { return taslakla(b, d, (m, d) => m.keyFigure(g, fam)); }
export function propsFor(fam: Parameters<Cekirdek['propsFor']>[0], b: KuralBaglami): ReturnType<Cekirdek['propsFor']> { return cekirdek(b).propsFor(fam); }
export function unitOf(p: Parameters<Cekirdek['unitOf']>[0], fam: Parameters<Cekirdek['unitOf']>[1], b: KuralBaglami): ReturnType<Cekirdek['unitOf']> { return cekirdek(b).unitOf(p, fam); }
export function propDisp<T>(v: T, u: string | undefined, b: KuralBaglami): string | Exclude<NonNullable<T>, number> { return cekirdek(b).propDisp(v, u); }
export function computed(k: Parameters<Cekirdek['computed']>[0], d: KartKaydi, b: KuralBaglami): ReturnType<Cekirdek['computed']> { return taslakla(b, d, (m, d) => m.computed(k, d)); }
export function modded(k: Parameters<Cekirdek['modded']>[0], d: KartKaydi, b: KuralBaglami): ReturnType<Cekirdek['modded']> { return taslakla(b, d, (m, d) => m.modded(k, d)); }
export function val(k: Parameters<Cekirdek['val']>[0], d: KartKaydi, b: KuralBaglami): ReturnType<Cekirdek['val']> { return taslakla(b, d, (m, d) => m.val(k, d)); }
export function dimVals(d: KartKaydi, b: KuralBaglami): ReturnType<Cekirdek['dimVals']> { return taslakla(b, d, (m, d) => m.dimVals(d)); }
export function dimsErr(d: KartKaydi, b: KuralBaglami): ReturnType<Cekirdek['dimsErr']> { return taslakla(b, d, (m, d) => m.dimsErr(d)); }
export function dimWarns(d: KartKaydi, b: KuralBaglami): ReturnType<Cekirdek['dimWarns']> { return taslakla(b, d, (m, d) => m.dimWarns(d)); }
export function weight(d: KartKaydi, b: KuralBaglami): ReturnType<Cekirdek['weight']> { return taslakla(b, d, (m, d) => m.weight(d)); }
export function dimsStr(d: KartKaydi, metric: Parameters<Cekirdek['dimsStr']>[1], b: KuralBaglami): ReturnType<Cekirdek['dimsStr']> { return taslakla(b, d, (m, d) => m.dimsStr(d, metric)); }
export function autoKod(d: KartKaydi, b: KuralBaglami): ReturnType<Cekirdek['autoKod']> { return taslakla(b, d, (m, d) => m.autoKod(d)); }
export function autoAd(d: KartKaydi, b: KuralBaglami): ReturnType<Cekirdek['autoAd']> { return taslakla(b, d, (m, d) => m.autoAd(d)); }
export function autoStd(d: KartKaydi, b: KuralBaglami): ReturnType<Cekirdek['autoStd']> { return taslakla(b, d, (m, d) => m.autoStd(d)); }
export function mainOpts(d: KartKaydi, b: KuralBaglami): ReturnType<Cekirdek['mainOpts']> { return taslakla(b, d, (m, d) => m.mainOpts(d)); }
export function finalKod(d: KartKaydi, b: KuralBaglami): ReturnType<Cekirdek['finalKod']> { return taslakla(b, d, (m, d) => m.finalKod(d)); }
export function kayitliKod(d: Parameters<Cekirdek['kayitliKod']>[0], b: KuralBaglami): ReturnType<Cekirdek['kayitliKod']> { return cekirdek(b).kayitliKod(d); }
export function finalAd(d: KartKaydi, b: KuralBaglami): ReturnType<Cekirdek['finalAd']> { return taslakla(b, d, (m, d) => m.finalAd(d)); }
export function finalStd(d: KartKaydi, b: KuralBaglami): ReturnType<Cekirdek['finalStd']> { return taslakla(b, d, (m, d) => m.finalStd(d)); }
export function finalBirim(d: KartKaydi, b: KuralBaglami): ReturnType<Cekirdek['finalBirim']> { return taslakla(b, d, (m, d) => m.finalBirim(d)); }
export function birimIstenir(d: KartKaydi, b: KuralBaglami): ReturnType<Cekirdek['birimIstenir']> { return taslakla(b, d, (m, d) => m.birimIstenir(d)); }
export function uygulanmayanZorunlu(d: Parameters<Cekirdek['uygulanmayanZorunlu']>[0], b: KuralBaglami): ReturnType<Cekirdek['uygulanmayanZorunlu']> { return cekirdek(b).uygulanmayanZorunlu(d); }
export function stepOk(i: Parameters<Cekirdek['stepOk']>[0], d: KartKaydi, b: KuralBaglami): ReturnType<Cekirdek['stepOk']> { return taslakla(b, d, (m, d) => m.stepOk(i, d)); }
export function canGo(d: KartKaydi, i: Parameters<Cekirdek['canGo']>[0], b: KuralBaglami): ReturnType<Cekirdek['canGo']> { return taslakla(b, d, (m, d) => m.canGo(i)); }
export function isGen(d: Parameters<Cekirdek['isGen']>[0], b: KuralBaglami): ReturnType<Cekirdek['isGen']> { return cekirdek(b).isGen(d); }
export function turAdimlari(d: KartKaydi, b: KuralBaglami): ReturnType<Cekirdek['turAdimlari']> { return taslakla(b, d, (m, d) => m.turAdimlari(d)); }
export function gStepOk(i: Parameters<Cekirdek['gStepOk']>[0], d: KartKaydi, b: KuralBaglami): ReturnType<Cekirdek['gStepOk']> { return taslakla(b, d, (m, d) => m.gStepOk(i, d)); }
export function gEksik(i: Parameters<Cekirdek['gEksik']>[0], d: KartKaydi, b: KuralBaglami): ReturnType<Cekirdek['gEksik']> { return taslakla(b, d, (m, d) => m.gEksik(i, d)); }
export function gAlanGorunur(d: Parameters<Cekirdek['gAlanGorunur']>[0], a: Parameters<Cekirdek['gAlanGorunur']>[1], b: KuralBaglami): ReturnType<Cekirdek['gAlanGorunur']> { return cekirdek(b).gAlanGorunur(d, a); }
export function alanZorunlu(d: Parameters<Cekirdek['alanZorunlu']>[0], a: Parameters<Cekirdek['alanZorunlu']>[1], b: KuralBaglami): ReturnType<Cekirdek['alanZorunlu']> { return cekirdek(b).alanZorunlu(d, a); }
export function hzAlanlari(d: Parameters<Cekirdek['hzAlanlari']>[0], b: KuralBaglami): ReturnType<Cekirdek['hzAlanlari']> { return cekirdek(b).hzAlanlari(d); }
export function gAmortisman(d: KartKaydi, b: KuralBaglami): ReturnType<Cekirdek['gAmortisman']> { return taslakla(b, d, (m, d) => m.gAmortisman(d)); }
export function gTarihler(d: KartKaydi, b: KuralBaglami): ReturnType<Cekirdek['gTarihler']> { return taslakla(b, d, (m, d) => m.gTarihler(d)); }
export function gtinGecerli(s: Parameters<Cekirdek['gtinGecerli']>[0], b: KuralBaglami): ReturnType<Cekirdek['gtinGecerli']> { return cekirdek(b).gtinGecerli(s); }
export function bomSatirlari(b: KuralBaglami): ReturnType<Cekirdek['bomSatirlari']> { return cekirdek(b).bomSatirlari(); }
export function rota(d: KartKaydi, b: KuralBaglami): ReturnType<Cekirdek['rota']> { return taslakla(b, d, (m, d) => m.rota(d)); }
export function money(v: Parameters<Cekirdek['money']>[0], pb: Parameters<Cekirdek['money']>[1], b: KuralBaglami): ReturnType<Cekirdek['money']> { return cekirdek(b).money(v, pb); }
export function prices(d: KartKaydi, b: KuralBaglami): ReturnType<Cekirdek['prices']> { return taslakla(b, d, (m, d) => m.prices(d)); }
export function feOf(d: KartKaydi, b: KuralBaglami): ReturnType<Cekirdek['feOf']> { return taslakla(b, d, (m, d) => m.feOf(d)); }
export function compatIssues(d: KartKaydi, b: KuralBaglami): ReturnType<Cekirdek['compatIssues']> { return taslakla(b, d, (m, d) => m.compatIssues(d)); }
export function formStatus(f: Parameters<Cekirdek['formStatus']>[0], d: KartKaydi, b: KuralBaglami): ReturnType<Cekirdek['formStatus']> { return taslakla(b, d, (m, d) => m.formStatus(f, d)); }
export function optStatus(k: Parameters<Cekirdek['optStatus']>[0], v: Parameters<Cekirdek['optStatus']>[1], d: KartKaydi, b: KuralBaglami): ReturnType<Cekirdek['optStatus']> { return taslakla(b, d, (m, d) => m.optStatus(k, v, d)); }
export function varsayilanlariUygula(d: Parameters<Cekirdek['varsayilanlariUygula']>[0], b: KuralBaglami): ReturnType<Cekirdek['varsayilanlariUygula']> { return cekirdek(b).varsayilanlariUygula(d); }
export function presetGroups(d: KartKaydi, b: KuralBaglami): ReturnType<Cekirdek['presetGroups']> { return taslakla(b, d, (m, d) => m.presetGroups(d)); }
export function variantList(d: KartKaydi, b: KuralBaglami): ReturnType<Cekirdek['variantList']> { return taslakla(b, d, (m, d) => m.variantList(d)); }
export function variantKod(d: KartKaydi, vd: Parameters<Cekirdek['variantKod']>[0], ekstra: Parameters<Cekirdek['variantKod']>[1], b: KuralBaglami): ReturnType<Cekirdek['variantKod']> { return taslakla(b, d, (m, d) => m.variantKod(vd, ekstra)); }
export function variantAd(d: KartKaydi, vd: Parameters<Cekirdek['variantAd']>[0], b: KuralBaglami): ReturnType<Cekirdek['variantAd']> { return taslakla(b, d, (m, d) => m.variantAd(vd)); }
export function variantSummary(d: KartKaydi, b: KuralBaglami): ReturnType<Cekirdek['variantSummary']> { return taslakla(b, d, (m, d) => m.variantSummary(d)); }
export function vkey(v: Parameters<Cekirdek['vkey']>[0], b: KuralBaglami): ReturnType<Cekirdek['vkey']> { return cekirdek(b).vkey(v); }
export function mmi(x: Parameters<Cekirdek['mmi']>[0], b: KuralBaglami): ReturnType<Cekirdek['mmi']> { return cekirdek(b).mmi(x); }
export function teknikKod(d: KartKaydi, b: KuralBaglami): ReturnType<Cekirdek['teknikKod']> { return taslakla(b, d, (m, d) => m.teknikKod(d)); }
export function kodGrubu(d: KartKaydi, b: KuralBaglami): ReturnType<Cekirdek['kodGrubu']> { return taslakla(b, d, (m, d) => m.kodGrubu(d)); }
export function kodOnek(d: Parameters<Cekirdek['kodOnek']>[0], b: KuralBaglami): ReturnType<Cekirdek['kodOnek']> { return cekirdek(b).kodOnek(d); }
export function firmaKodluTur(d: Parameters<Cekirdek['firmaKodluTur']>[0], b: KuralBaglami): ReturnType<Cekirdek['firmaKodluTur']> { return cekirdek(b).firmaKodluTur(d); }
export function finalAc(d: Parameters<Cekirdek['finalAc']>[0], i: Parameters<Cekirdek['finalAc']>[1], b: KuralBaglami): ReturnType<Cekirdek['finalAc']> { return cekirdek(b).finalAc(d, i); }
export function opListe(b: KuralBaglami): ReturnType<Cekirdek['opListe']> { return cekirdek(b).opListe(); }
export function opGruplar(b: KuralBaglami): ReturnType<Cekirdek['opGruplar']> { return cekirdek(b).opGruplar(); }
export function opBul(kod: Parameters<Cekirdek['opBul']>[0], b: KuralBaglami): ReturnType<Cekirdek['opBul']> { return cekirdek(b).opBul(kod); }
export function opKod(o: Parameters<Cekirdek['opKod']>[0], b: KuralBaglami): ReturnType<Cekirdek['opKod']> { return cekirdek(b).opKod(o); }
export function opSonrakiNo(d: Parameters<Cekirdek['opSonrakiNo']>[0], b: KuralBaglami): ReturnType<Cekirdek['opSonrakiNo']> { return cekirdek(b).opSonrakiNo(d); }
export function opNoDuzenle(d: Parameters<Cekirdek['opNoDuzenle']>[0], b: KuralBaglami): ReturnType<Cekirdek['opNoDuzenle']> { return cekirdek(b).opNoDuzenle(d); }
export function opSirala(d: Parameters<Cekirdek['opSirala']>[0], b: KuralBaglami): ReturnType<Cekirdek['opSirala']> { return cekirdek(b).opSirala(d); }
export function benzerKartlar(d: KartKaydi, liste: Parameters<Cekirdek['benzerKartlar']>[1], b: KuralBaglami): ReturnType<Cekirdek['benzerKartlar']> { return taslakla(b, d, (m, d) => m.benzerKartlar(d, liste)); }
export function muadilKaliteler(d: KartKaydi, b: KuralBaglami): ReturnType<Cekirdek['muadilKaliteler']> { return taslakla(b, d, (m, d) => m.muadilKaliteler(d)); }
export function diffItems(a: Parameters<Cekirdek['diffItems']>[0], ikinci: Parameters<Cekirdek['diffItems']>[1], b: KuralBaglami): ReturnType<Cekirdek['diffItems']> { return cekirdek(b).diffItems(a, ikinci); }
export function birimFarki(onceki: Parameters<Cekirdek['birimFarki']>[0], yeni: Parameters<Cekirdek['birimFarki']>[1], b: KuralBaglami): ReturnType<Cekirdek['birimFarki']> { return cekirdek(b).birimFarki(onceki, yeni); }
export function talepVar(x: Parameters<Cekirdek['talepVar']>[0], b: KuralBaglami): ReturnType<Cekirdek['talepVar']> { return cekirdek(b).talepVar(x); }
export function hizliAra(metin: Parameters<Cekirdek['hizliAra']>[0], liste: Parameters<Cekirdek['hizliAra']>[1], b: KuralBaglami): ReturnType<Cekirdek['hizliAra']> { return cekirdek(b).hizliAra(metin, liste); }
export function metinAyristir(metin: Parameters<Cekirdek['metinAyristir']>[0], b: KuralBaglami): ReturnType<Cekirdek['metinAyristir']> { return cekirdek(b).metinAyristir(metin); }
export function hizliTaslak(p: Parameters<Cekirdek['hizliTaslak']>[0], b: KuralBaglami): ReturnType<Cekirdek['hizliTaslak']> { return cekirdek(b).hizliTaslak(p); }
export function tplSummary(t: Parameters<Cekirdek['tplSummary']>[0], b: KuralBaglami): ReturnType<Cekirdek['tplSummary']> { return cekirdek(b).tplSummary(t); }
export function gSablonOzet(t: Parameters<Cekirdek['gSablonOzet']>[0], b: KuralBaglami): ReturnType<Cekirdek['gSablonOzet']> { return cekirdek(b).gSablonOzet(t); }
export function flatItem(d: Parameters<Cekirdek['flatItem']>[0], metric: Parameters<Cekirdek['flatItem']>[1], b: KuralBaglami): ReturnType<Cekirdek['flatItem']> { return cekirdek(b).flatItem(d, metric); }
export function gFlat(d: Parameters<Cekirdek['gFlat']>[0], b: KuralBaglami): ReturnType<Cekirdek['gFlat']> { return cekirdek(b).gFlat(d); }
export function eqText(eq: Parameters<Cekirdek['eqText']>[0], b: KuralBaglami): ReturnType<Cekirdek['eqText']> { return cekirdek(b).eqText(eq); }
export function onayYetkili(x: Parameters<Cekirdek['onayYetkili']>[0], b: KuralBaglami): ReturnType<Cekirdek['onayYetkili']> { return cekirdek(b).onayYetkili(x); }
export function pasifKilitli(x: Parameters<Cekirdek['pasifKilitli']>[0], b: KuralBaglami): ReturnType<Cekirdek['pasifKilitli']> { return cekirdek(b).pasifKilitli(x); }
export function onayUygula(x: Parameters<Cekirdek['onayUygula']>[0], islem: Parameters<Cekirdek['onayUygula']>[1], neden: Parameters<Cekirdek['onayUygula']>[2], b: KuralBaglami): ReturnType<Cekirdek['onayUygula']> { return cekirdek(b).onayUygula(x, islem, neden); }
export function talepYetkili(x: Parameters<Cekirdek['talepYetkili']>[0], b: KuralBaglami): ReturnType<Cekirdek['talepYetkili']> { return cekirdek(b).talepYetkili(x); }
export function talepUygula(kart: Parameters<Cekirdek['talepUygula']>[0], islem: Parameters<Cekirdek['talepUygula']>[1], neden: Parameters<Cekirdek['talepUygula']>[2], b: KuralBaglami): ReturnType<Cekirdek['talepUygula']> { return cekirdek(b).talepUygula(kart, islem, neden); }
export function onayDurum(x: Parameters<Cekirdek['onayDurum']>[0], b: KuralBaglami): ReturnType<Cekirdek['onayDurum']> { return cekirdek(b).onayDurum(x); }
export function mukerrerGruplari(liste: Parameters<Cekirdek['mukerrerGruplari']>[0], b: KuralBaglami): ReturnType<Cekirdek['mukerrerGruplari']> { return cekirdek(b).mukerrerGruplari(liste); }
export function muadilKartlar(d: KartKaydi, liste: Parameters<Cekirdek['muadilKartlar']>[1], b: KuralBaglami): ReturnType<Cekirdek['muadilKartlar']> { return taslakla(b, d, (m, d) => m.muadilKartlar(d, liste)); }
export function birlestir(asil: Parameters<Cekirdek['birlestir']>[0], digerleri: Parameters<Cekirdek['birlestir']>[1], neden: Parameters<Cekirdek['birlestir']>[2], b: KuralBaglami): ReturnType<Cekirdek['birlestir']> { return cekirdek(b).birlestir(asil, digerleri, neden); }
export function birlesmeListesi(liste: Parameters<Cekirdek['birlesmeListesi']>[0], b: KuralBaglami): ReturnType<Cekirdek['birlesmeListesi']> { return cekirdek(b).birlesmeListesi(liste); }
export function fasetSayilari(liste: Parameters<Cekirdek['fasetSayilari']>[0], sec: Parameters<Cekirdek['fasetSayilari']>[1], b: KuralBaglami): ReturnType<Cekirdek['fasetSayilari']> { return cekirdek(b).fasetSayilari(liste, sec); }
export function filtreUygula(liste: Parameters<Cekirdek['filtreUygula']>[0], sec: Parameters<Cekirdek['filtreUygula']>[1], haric: Parameters<Cekirdek['filtreUygula']>[2], b: KuralBaglami): ReturnType<Cekirdek['filtreUygula']> { return cekirdek(b).filtreUygula(liste, sec, haric); }
export function filtreEtiketleri(sec: Parameters<Cekirdek['filtreEtiketleri']>[0], b: KuralBaglami): ReturnType<Cekirdek['filtreEtiketleri']> { return cekirdek(b).filtreEtiketleri(sec); }
export function filtreOlcuAnahtarlari(sec: Parameters<Cekirdek['filtreOlcuAnahtarlari']>[0], b: KuralBaglami): ReturnType<Cekirdek['filtreOlcuAnahtarlari']> { return cekirdek(b).filtreOlcuAnahtarlari(sec); }
export function qrMetni(x: Parameters<Cekirdek['qrMetni']>[0], b: KuralBaglami): ReturnType<Cekirdek['qrMetni']> { return cekirdek(b).qrMetni(x); }
export function qrKartBul(metin: Parameters<Cekirdek['qrKartBul']>[0], liste: Parameters<Cekirdek['qrKartBul']>[1], b: KuralBaglami): ReturnType<Cekirdek['qrKartBul']> { return cekirdek(b).qrKartBul(metin, liste); }
export function labelSVG(x: Parameters<Cekirdek['labelSVG']>[0], sz: Parameters<Cekirdek['labelSVG']>[1], b: KuralBaglami): ReturnType<Cekirdek['labelSVG']> { return cekirdek(b).labelSVG(x, sz); }
export function gLabelSVG(x: Parameters<Cekirdek['gLabelSVG']>[0], p1: Parameters<Cekirdek['gLabelSVG']>[1], b: KuralBaglami): ReturnType<Cekirdek['gLabelSVG']> { return cekirdek(b).gLabelSVG(x, p1); }
export function turKat(d: Parameters<Cekirdek['turKat']>[0], b: KuralBaglami): ReturnType<Cekirdek['turKat']> { return cekirdek(b).turKat(d); }
export function hzCesitAdi(d: Parameters<Cekirdek['hzCesitAdi']>[0], b: KuralBaglami): ReturnType<Cekirdek['hzCesitAdi']> { return cekirdek(b).hzCesitAdi(d); }
export function stokOzeti(x: Parameters<Cekirdek['stokOzeti']>[0], b: KuralBaglami): ReturnType<Cekirdek['stokOzeti']> { return cekirdek(b).stokOzeti(x); }
export function xlCalismaKitabi<K>(d: KartKaydi, ExcelJS: { Workbook: new () => K }, p1: Parameters<Cekirdek['xlCalismaKitabi']>[1], b: KuralBaglami): K { return taslakla(b, d, (m, d) => m.xlCalismaKitabi(ExcelJS, p1)); }
export function xlSatirlariOku(sayfalar: Parameters<Cekirdek['xlSatirlariOku']>[0], b: KuralBaglami): ReturnType<Cekirdek['xlSatirlariOku']> { return cekirdek(b).xlSatirlariOku(sayfalar); }
export function xlPlan(satirlar: Parameters<Cekirdek['xlPlan']>[0], katalog: Parameters<Cekirdek['xlPlan']>[1], b: KuralBaglami): ReturnType<Cekirdek['xlPlan']> { return cekirdek(b).xlPlan(satirlar, katalog); }
export function siradakiKod(d: KartKaydi, ekstra: Parameters<Cekirdek['siradakiKod']>[1], b: KuralBaglami): ReturnType<Cekirdek['siradakiKod']> { return taslakla(b, d, (m, d) => m.siradakiKod(d, ekstra)); }
export function specData(d: Parameters<Cekirdek['specData']>[0], b: KuralBaglami): ReturnType<Cekirdek['specData']> { return cekirdek(b).specData(d); }
export function curSteps(d: KartKaydi, b: KuralBaglami): ReturnType<Cekirdek['curSteps']> { return taslakla(b, d, (m, d) => m.curSteps()); }
export function curLast(d: KartKaydi, b: KuralBaglami): ReturnType<Cekirdek['curLast']> { return taslakla(b, d, (m, d) => m.curLast()); }
export function kartAnahtari(d: Parameters<Cekirdek['kartAnahtari']>[0], b: KuralBaglami): ReturnType<Cekirdek['kartAnahtari']> { return cekirdek(b).kartAnahtari(d); }
export function turAlanlari(t: Parameters<Cekirdek['turAlanlari']>[0], b: KuralBaglami): ReturnType<Cekirdek['turAlanlari']> { return cekirdek(b).turAlanlari(t); }
export function turKurali(t: Parameters<Cekirdek['turKurali']>[0], b: KuralBaglami): ReturnType<Cekirdek['turKurali']> { return cekirdek(b).turKurali(t); }
export function cakismaAlanAdi(t: Parameters<Cekirdek['cakismaAlanAdi']>[0], k: Parameters<Cekirdek['cakismaAlanAdi']>[1], b: KuralBaglami): ReturnType<Cekirdek['cakismaAlanAdi']> { return cekirdek(b).cakismaAlanAdi(t, k); }
export function firmaKodluTurler(b: KuralBaglami): ReturnType<Cekirdek['firmaKodluTurler']> { return cekirdek(b).firmaKodluTurler(); }
export function katIkon(tur: Parameters<Cekirdek['katIkon']>[0], kat: Parameters<Cekirdek['katIkon']>[1], b: KuralBaglami): ReturnType<Cekirdek['katIkon']> { return cekirdek(b).katIkon(tur, kat); }
export function optIcon(fam: Parameters<Cekirdek['optIcon']>[0], o: Parameters<Cekirdek['optIcon']>[1], b: KuralBaglami): ReturnType<Cekirdek['optIcon']> { return cekirdek(b).optIcon(fam, o); }
export function gAlanIkon(a: Parameters<Cekirdek['gAlanIkon']>[0], d: KartKaydi, b: KuralBaglami): ReturnType<Cekirdek['gAlanIkon']> { return taslakla(b, d, (m, d) => m.gAlanIkon(a, d)); }
export function kartTamamla(x: Parameters<Cekirdek['kartTamamla']>[0], b: KuralBaglami): ReturnType<Cekirdek['kartTamamla']> { return cekirdek(b).kartTamamla(x); }
export function yetki(e: Parameters<Cekirdek['yetki']>[0], b: KuralBaglami): ReturnType<Cekirdek['yetki']> { return cekirdek(b).yetki(e); }
export function withRev(item: KartKaydi, prev: Parameters<Cekirdek['withRev']>[1], b: KuralBaglami): ReturnType<Cekirdek['withRev']> { const k = clone(item); return cekirdek(b).withRev(k, prev) ?? k; }
export function onayAta(item: KartKaydi, prev: Parameters<Cekirdek['onayAta']>[1], b: KuralBaglami): ReturnType<Cekirdek['onayAta']> { const k = clone(item); return cekirdek(b).onayAta(k, prev) ?? k; }
export function kodlariSabitle(item: KartKaydi, b: KuralBaglami): ReturnType<Cekirdek['kodlariSabitle']> { const k = clone(item); return cekirdek(b).kodlariSabitle(k) ?? k; }
export function talepOlustur(onceki: Parameters<Cekirdek['talepOlustur']>[0], yeni: Parameters<Cekirdek['talepOlustur']>[1], b: KuralBaglami): ReturnType<Cekirdek['talepOlustur']> { return cekirdek(b).talepOlustur(onceki, yeni); }
