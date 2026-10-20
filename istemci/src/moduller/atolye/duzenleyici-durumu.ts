import type {
  AlanTuru, Bulgu, FabrikaKayitGovdesi, GecisTuru, KapiKenari, RafTuru, YerlesimCevabi, YerlesimGovdesi,
} from '#paylasilan/sozlesme/atolye.ts';
import type { Istasyon, IstasyonTipi, Makine } from '#paylasilan/sozlesme/istasyonlar.ts';
import { bolumIcinde, bolumeCevir, fabrikaKutusu, fabrikayaCevir, konumOku } from './fabrika.ts';
import type { BolumKonumu, Kutu } from './fabrika.ts';
import { GECIS_ENAZ, GECIS_ENCOK, GECIS_GENISLIGI, GECIS_TURU_ADI, gecisOrtasi, kenaraOtur } from './gecis.ts';
import { sayi } from './kurallar.ts';

// Düzenleyicinin taslağı: kayıtlı yerleşimin düzenlenebilir kopyası. Her öğenin taslakta yerel bir anahtarı vardır;
// kayıt gövdesine dizi sırasıyla çevrilir, sunucunun bulgu anahtarları (raf:<sıra>) bu sırayla geri eşlenir.

export interface TaslakIstasyon {
  anahtar: string;
  istasyonId: number;
  kod: string;
  ad: string;
  tip: IstasyonTipi;
  aktif: boolean;
  x: number;
  z: number;
  donus: number;
  genislik: number;
  derinlik: number;
  // Atanmış 3B model; null: istasyon tipinden çizilir.
  modelId: number | null;
}

// Makinenin yeri (kart #1120). Makinesi yerleşik istasyon haritada çerçeve olur; nesne makinedir.
export interface TaslakMakine {
  anahtar: string;
  makineId: number;
  kod: string;
  ad: string;
  // Bağlı istasyon; canlı üretim ve çizim tipi istasyondan gelir.
  istasyonId: number | null;
  tip: IstasyonTipi | null;
  aktif: boolean;
  x: number;
  z: number;
  donus: number;
  genislik: number;
  derinlik: number;
  modelId: number | null;
}

export interface TaslakRaf {
  anahtar: string;
  id: number | null;
  kod: string;
  ad: string;
  tur: RafTuru;
  bolmeSayisi: number;
  katSayisi: number;
  gozSayisi: number;
  bolmeGenisligi: number;
  derinlik: number;
  yukseklik: number;
  // Ölçülmüş net değerler (isteğe bağlı). Kat dizisi kat sayısı uzunluğundadır; boş kutu null.
  katYukseklikleri: (number | null)[] | null;
  gozGenisligi: number | null;
  gozDerinligi: number | null;
  x: number;
  z: number;
  donus: number;
  aktif: boolean;
}

// Kat sayısı değişince net kat dizisi yeni uzunluğa getirilir (eklenen kat boş); hiç değer kalmazsa null.
export function katDizisi(katlar: readonly (number | null)[] | null, katSayisi: number): (number | null)[] | null {
  if (!katlar) return null;
  const yeni = Array.from({ length: Math.max(0, katSayisi) }, (_, i) => katlar[i] ?? null);
  return yeni.some((v) => v !== null) ? yeni : null;
}

// Gövdeye yalnız girilmiş kat değerleri gider: hepsi boşsa null; eksik girişte dizi kısa kalır ve sunucu ATL-33 ile
// hangi rafta kaç kat eksik olduğunu söyler.
export function katlariGonder(katlar: readonly (number | null)[] | null): number[] | null {
  const dolu = (katlar ?? []).filter((v): v is number => v !== null);
  return dolu.length > 0 ? dolu : null;
}

export interface TaslakKapi {
  kenar: KapiKenari;
  ofset: number;
  genislik: number;
}

export interface TaslakAlan {
  anahtar: string;
  // Kayıtlı alanın kimliği (stok konumu alana bağlıdır); yeni alan null.
  id: number | null;
  tur: AlanTuru;
  ad: string;
  x: number;
  z: number;
  donus: number;
  genislik: number;
  derinlik: number;
  kapi: TaslakKapi | null;
}

export interface TaslakDuvar {
  anahtar: string;
  basX: number;
  basZ: number;
  sonX: number;
  sonZ: number;
  kalinlik: number;
  cam: boolean;
}

// Bölümün dış kenarındaki geçiş; konumu kenar ve ofsetle bölüme göredir, bölüm taşınınca kendiliğinden gelir.
// Tek bölüm düzenlemesinde bölüm null (salonun kendisi), fabrikada geçişin bölümü.
export interface TaslakGecis {
  anahtar: string;
  salonId: number | null;
  tur: GecisTuru;
  kenar: KapiKenari;
  ofset: number;
  genislik: number;
}

// Fabrika düzenlemesinde bölüm: fabrika planındaki yeri (sol üst köşe, dönüş) ve girişi (fabrika metresinde).
export interface TaslakBolum {
  anahtar: string;
  salonId: number;
  surum: number;
  kod: string;
  ad: string;
  genislik: number;
  derinlik: number;
  hucreBoyu: number;
  sutunlar: readonly string[];
  satirlar: readonly string[];
  x: number;
  z: number;
  donus: number;
  giris: { x: number; z: number } | null;
}

export interface Taslak {
  surum: number;
  salon: { kod: string; ad: string; genislik: number; derinlik: number; hucreBoyu: number; giris: { x: number; z: number } | null };
  istasyonlar: TaslakIstasyon[];
  makineler: TaslakMakine[];
  raflar: TaslakRaf[];
  alanlar: TaslakAlan[];
  duvarlar: TaslakDuvar[];
  gecisler: TaslakGecis[];
  // Yalnız fabrika düzenlemesinde: bütün bölümler tek taslakta, öğeler fabrika metresinde. Öğenin bölümü kayıtta
  // ortasının düştüğü bölümdür (öğe bölümden bölüme sürüklenerek taşınır).
  bolumler?: TaslakBolum[];
}

let sayac = 0;
const yeniAnahtar = (onek: string): string => `${onek}:t${(sayac += 1)}`;

export function taslakKur(y: YerlesimCevabi): Taslak {
  return {
    surum: y.salon.surum,
    salon: {
      kod: y.salon.kod, ad: y.salon.ad, genislik: sayi(y.salon.genislik), derinlik: sayi(y.salon.derinlik), hucreBoyu: sayi(y.salon.hucreBoyu),
      giris: y.salon.giris ? { x: sayi(y.salon.giris.x), z: sayi(y.salon.giris.z) } : null,
    },
    istasyonlar: y.istasyonYerleri.map((i) => ({
      anahtar: `istasyon:${i.istasyonId}`, istasyonId: i.istasyonId, kod: i.kod, ad: i.ad, tip: i.tip, aktif: i.aktif,
      x: sayi(i.x), z: sayi(i.z), donus: sayi(i.donus), genislik: sayi(i.genislik), derinlik: sayi(i.derinlik), modelId: i.model?.id ?? null,
    })),
    makineler: y.makineYerleri.map((m) => ({
      anahtar: `makine:${m.makineId}`, makineId: m.makineId, kod: m.kod, ad: m.ad, istasyonId: m.istasyon?.id ?? null, tip: m.istasyon?.tip ?? null,
      aktif: m.aktif, x: sayi(m.x), z: sayi(m.z), donus: sayi(m.donus), genislik: sayi(m.genislik), derinlik: sayi(m.derinlik), modelId: m.model?.id ?? null,
    })),
    raflar: y.raflar.map((r) => ({
      anahtar: yeniAnahtar('raf'), id: r.id, kod: r.kod, ad: r.ad, tur: r.tur, bolmeSayisi: r.bolmeSayisi, katSayisi: r.katSayisi,
      gozSayisi: r.gozSayisi, bolmeGenisligi: sayi(r.bolmeGenisligi), derinlik: sayi(r.derinlik), yukseklik: sayi(r.yukseklik),
      katYukseklikleri: r.katYukseklikleri?.map(sayi) ?? null,
      gozGenisligi: r.gozGenisligi === null ? null : sayi(r.gozGenisligi),
      gozDerinligi: r.gozDerinligi === null ? null : sayi(r.gozDerinligi),
      x: sayi(r.x), z: sayi(r.z), donus: sayi(r.donus), aktif: r.aktif,
    })),
    alanlar: y.alanlar.map((a) => ({
      anahtar: yeniAnahtar('alan'), id: a.id, tur: a.tur, ad: a.ad, x: sayi(a.x), z: sayi(a.z), donus: sayi(a.donus),
      genislik: sayi(a.genislik), derinlik: sayi(a.derinlik),
      kapi: a.kapi ? { kenar: a.kapi.kenar, ofset: sayi(a.kapi.ofset), genislik: sayi(a.kapi.genislik) } : null,
    })),
    duvarlar: y.duvarlar.map((d) => ({
      anahtar: yeniAnahtar('duvar'), basX: sayi(d.basX), basZ: sayi(d.basZ), sonX: sayi(d.sonX), sonZ: sayi(d.sonZ), kalinlik: sayi(d.kalinlik), cam: d.cam,
    })),
    gecisler: y.gecisler.map((g) => ({ anahtar: yeniAnahtar('gecis'), salonId: null, tur: g.tur, kenar: g.kenar, ofset: sayi(g.ofset), genislik: sayi(g.genislik) })),
  };
}

export interface KayitHazirligi {
  govde: YerlesimGovdesi;
  // Sunucu bulgu anahtarı -> taslak anahtarı.
  eslesme: Map<string, string>;
}

export function govdeyeCevir(t: Taslak): KayitHazirligi {
  const eslesme = new Map<string, string>([['giris', 'giris']]);
  t.istasyonlar.forEach((i) => eslesme.set(`istasyon:${i.istasyonId}`, i.anahtar));
  t.makineler.forEach((m) => eslesme.set(`makine:${m.makineId}`, m.anahtar));
  t.raflar.forEach((r, i) => eslesme.set(`raf:${i}`, r.anahtar));
  t.alanlar.forEach((a, i) => eslesme.set(`alan:${i}`, a.anahtar));
  t.duvarlar.forEach((d, i) => eslesme.set(`duvar:${i}`, d.anahtar));
  t.gecisler.forEach((g, i) => eslesme.set(`gecis:${i}`, g.anahtar));
  return {
    eslesme,
    govde: {
      surum: t.surum,
      salon: { ...t.salon },
      istasyonYerleri: t.istasyonlar.map(({ istasyonId, x, z, donus, genislik, derinlik, modelId }) => ({ istasyonId, x, z, donus, genislik, derinlik, modelId })),
      makineYerleri: t.makineler.map(({ makineId, x, z, donus, genislik, derinlik, modelId }) => ({ makineId, x, z, donus, genislik, derinlik, modelId })),
      raflar: t.raflar.map(({ anahtar: _a, katYukseklikleri, ...r }) => ({ ...r, katYukseklikleri: katlariGonder(katYukseklikleri) })),
      alanlar: t.alanlar.map(({ anahtar: _a, ...a }) => a),
      duvarlar: t.duvarlar.map(({ anahtar: _a, ...d }) => d),
      gecisler: t.gecisler.map(({ tur, kenar, ofset, genislik }) => ({ tur, kenar, ofset, genislik })),
    },
  };
}

export function bulgulariEsle(bulgular: readonly Bulgu[], eslesme: ReadonlyMap<string, string>): { mesaj: string; kural: string; ogeler: string[] }[] {
  return bulgular.map((b) => ({ kural: b.kural, mesaj: b.mesaj, ogeler: b.ogeler.flatMap((o) => { const k = eslesme.get(o); return k ? [k] : []; }) }));
}

// ---------- öğe ekleme ----------

export type EklenecekTur =
  | 'duvar' | 'cam_duvar' | 'oda' | 'cam_oda' | 'yuruyus_yolu' | 'bolge' | 'karantina' | 'sevkiyat' | 'palet'
  | 'kabul' | 'uretim_cikisi' | 'depo_zemini' | 'fason' | 'ara_alan' | 'hurda'
  | 'raf_palet' | 'raf_kucuk_parca' | 'raf_konsol' | 'raf_zemin'
  | `gecis_${GecisTuru}`;

export const PALET_GRUPLARI: readonly { baslik: string; ogeler: readonly { tur: EklenecekTur; ad: string }[] }[] = [
  { baslik: 'Yapı', ogeler: [{ tur: 'duvar', ad: 'Duvar' }, { tur: 'cam_duvar', ad: 'Cam bölme' }, { tur: 'oda', ad: 'Oda' }, { tur: 'cam_oda', ad: 'Cam oda' }] },
  { baslik: 'Geçiş', ogeler: (['kepenk', 'acik', 'kapi', 'yangin_kapisi'] as const).map((g) => ({ tur: `gecis_${g}` as const, ad: GECIS_TURU_ADI[g] })) },
  { baslik: 'Yol ve bölge', ogeler: [{ tur: 'yuruyus_yolu', ad: 'Yürüyüş yolu' }, { tur: 'bolge', ad: 'Bölge' }, { tur: 'karantina', ad: 'Karantina' }, { tur: 'sevkiyat', ad: 'Sevkiyat alanı' }] },
  { baslik: 'Depolama', ogeler: [{ tur: 'raf_palet', ad: 'Palet rafı' }, { tur: 'raf_kucuk_parca', ad: 'Küçük parça rafı' }, { tur: 'raf_konsol', ad: 'Konsol raf' }, { tur: 'raf_zemin', ad: 'Sac alanı' }, { tur: 'palet', ad: 'Palet' }] },
  { baslik: 'Stok alanı', ogeler: [{ tur: 'kabul', ad: 'Mal kabul' }, { tur: 'uretim_cikisi', ad: 'Üretim çıkışı' }, { tur: 'depo_zemini', ad: 'Depo zemini' }, { tur: 'fason', ad: 'Fason' }, { tur: 'ara_alan', ad: 'Bekleme' }, { tur: 'hurda', ad: 'Hurda' }] },
];

const RAF_VARSAYILAN: Record<RafTuru, Pick<TaslakRaf, 'bolmeSayisi' | 'katSayisi' | 'gozSayisi' | 'bolmeGenisligi' | 'derinlik' | 'yukseklik'> & { onek: string; ad: string }> = {
  palet: { onek: 'R', ad: 'Palet rafı', bolmeSayisi: 3, katSayisi: 4, gozSayisi: 2, bolmeGenisligi: 2.7, derinlik: 1.1, yukseklik: 5 },
  kucuk_parca: { onek: 'R', ad: 'Küçük parça rafı', bolmeSayisi: 4, katSayisi: 5, gozSayisi: 3, bolmeGenisligi: 1, derinlik: 0.6, yukseklik: 2.2 },
  konsol: { onek: 'K', ad: 'Konsol raf', bolmeSayisi: 3, katSayisi: 4, gozSayisi: 1, bolmeGenisligi: 1.6, derinlik: 1.2, yukseklik: 3.5 },
  zemin: { onek: 'S', ad: 'Sac stok alanı', bolmeSayisi: 4, katSayisi: 1, gozSayisi: 1, bolmeGenisligi: 1.5, derinlik: 3, yukseklik: 0.25 },
};

const ALAN_VARSAYILAN: Record<Exclude<AlanTuru, never>, { ad: string; genislik: number; derinlik: number; kapi: TaslakKapi | null }> = {
  yuruyus_yolu: { ad: 'Yürüyüş yolu', genislik: 6, derinlik: 2, kapi: null },
  bolge: { ad: 'Bölge', genislik: 4, derinlik: 3, kapi: null },
  karantina: { ad: 'Karantina', genislik: 4, derinlik: 3, kapi: null },
  sevkiyat: { ad: 'Sevkiyat alanı', genislik: 4, derinlik: 3, kapi: null },
  oda: { ad: 'Oda', genislik: 5, derinlik: 4, kapi: { kenar: 'on', ofset: 0, genislik: 1 } },
  cam_oda: { ad: 'Cam oda', genislik: 5, derinlik: 4, kapi: { kenar: 'on', ofset: 0, genislik: 1.2 } },
  palet: { ad: 'Palet', genislik: 1.2, derinlik: 0.8, kapi: null },
  kabul: { ad: 'Mal kabul alanı', genislik: 6, derinlik: 4, kapi: null },
  uretim_cikisi: { ad: 'Üretim çıkış alanı', genislik: 4, derinlik: 3, kapi: null },
  depo_zemini: { ad: 'Depo zemini', genislik: 4, derinlik: 3, kapi: null },
  fason: { ad: 'Fason alanı', genislik: 2, derinlik: 1, kapi: null },
  ara_alan: { ad: 'Ara alan', genislik: 3, derinlik: 2, kapi: null },
  hurda: { ad: 'Hurda alanı', genislik: 2, derinlik: 2, kapi: null },
};

// İstasyon tipine göre önerilen ayak izi (metre); düzenleyicide değiştirilebilir.
export const AYAK_IZI: Record<IstasyonTipi, [number, number]> = {
  talasli: [3.5, 2.6], kalite: [3, 2.4], montaj: [2.4, 1.2], boya: [3, 3], markalama: [2, 1.4], depo: [3, 2],
};

export function sonrakiRafKodu(onek: string, kodlar: readonly string[]): string {
  const kullanilan = new Set(kodlar);
  for (let n = 1; n < 10000; n++) if (!kullanilan.has(`${onek}${n}`)) return `${onek}${n}`;
  return onek;
}

// Geçişin çizildiği bölüm: tek bölümde salon, fabrikada verilen ya da noktanın düştüğü (yoksa ortası en yakın) bölüm.
interface GecisCercevesi {
  salonId: number | null;
  g: number;
  d: number;
  yerel: (p: Konum) => Konum;
  dunya: (p: Konum) => Konum;
}

function gecisCercevesi(t: Taslak, salonId: number | null, p?: Konum): GecisCercevesi | null {
  if (!t.bolumler) return { salonId: null, g: t.salon.genislik, d: t.salon.derinlik, yerel: (q) => q, dunya: (q) => q };
  const uzaklik = (b: TaslakBolum, q: Konum) => { const o = fabrikayaCevir(b, { x: b.genislik / 2, z: b.derinlik / 2 }); return Math.hypot(o.x - q.x, o.z - q.z); };
  const b = salonId !== null
    ? t.bolumler.find((o) => o.salonId === salonId)
    : p ? bolumunu(t, p) ?? [...t.bolumler].sort((a, c) => uzaklik(a, p) - uzaklik(c, p))[0] : undefined;
  if (!b) return null;
  return { salonId: b.salonId, g: b.genislik, d: b.derinlik, yerel: (q) => bolumeCevir(b, q), dunya: (q) => fabrikayaCevir(b, q) };
}

function gecisEkle(t: Taslak, tur: GecisTuru, p: Konum, genislik = GECIS_GENISLIGI[tur]): { taslak: Taslak; anahtar: string } {
  const anahtar = yeniAnahtar('gecis');
  const c = gecisCercevesi(t, null, p);
  if (!c) return { taslak: t, anahtar };
  const w = Math.min(genislik, Math.max(GECIS_ENAZ, Math.min(c.g, c.d)));
  const yer = kenaraOtur(c.yerel(p), w, c.g, c.d);
  return { anahtar, taslak: { ...t, gecisler: [...t.gecisler, { anahtar, salonId: c.salonId, tur, genislik: w, ...yer }] } };
}

export function ogeEkle(t: Taslak, tur: EklenecekTur, x: number, z: number): { taslak: Taslak; anahtar: string } {
  if (tur.startsWith('gecis_')) return gecisEkle(t, tur.slice(6) as GecisTuru, { x, z });
  if (tur === 'duvar' || tur === 'cam_duvar') {
    const anahtar = yeniAnahtar('duvar');
    return { anahtar, taslak: { ...t, duvarlar: [...t.duvarlar, { anahtar, basX: x - 2, basZ: z, sonX: x + 2, sonZ: z, kalinlik: tur === 'cam_duvar' ? 0.1 : 0.2, cam: tur === 'cam_duvar' }] } };
  }
  if (tur.startsWith('raf_')) {
    const rafTuru = tur.slice(4) as RafTuru;
    const v = RAF_VARSAYILAN[rafTuru];
    const anahtar = yeniAnahtar('raf');
    const kod = sonrakiRafKodu(v.onek, t.raflar.map((r) => r.kod));
    const { onek: _o, ad, ...olcu } = v;
    const raf: TaslakRaf = {
      anahtar, id: null, kod, ad: `${ad} ${kod}`, tur: rafTuru, ...olcu, katYukseklikleri: null, gozGenisligi: null, gozDerinligi: null, x, z, donus: 0, aktif: true,
    };
    return { anahtar, taslak: { ...t, raflar: [...t.raflar, raf] } };
  }
  const alanTuru = tur as AlanTuru;
  const v = ALAN_VARSAYILAN[alanTuru];
  const anahtar = yeniAnahtar('alan');
  return { anahtar, taslak: { ...t, alanlar: [...t.alanlar, { anahtar, id: null, tur: alanTuru, ad: v.ad, x, z, donus: 0, genislik: v.genislik, derinlik: v.derinlik, kapi: v.kapi }] } };
}

export function istasyonEkle(t: Taslak, i: Istasyon, x: number, z: number): { taslak: Taslak; anahtar: string } {
  const [g, d] = AYAK_IZI[i.tip];
  const anahtar = `istasyon:${i.id}`;
  return {
    anahtar,
    taslak: { ...t, istasyonlar: [...t.istasyonlar, { anahtar, istasyonId: i.id, kod: i.kod, ad: i.ad, tip: i.tip, aktif: i.aktif, x, z, donus: 0, genislik: g, derinlik: d, modelId: null }] },
  };
}

// ---------- çizerek ekleme (krokinin üstünde) ----------

const r2 = (n: number): number => Math.round(n * 100) / 100;
const sinirla = (n: number, enaz: number, encok: number): number => Math.min(encok, Math.max(enaz, n));

// İki köşeden eksene paralel dikdörtgen: orta nokta ve kenarlar (0,01 m).
export function dikdortgen(a: Konum, b: Konum): { x: number; z: number; g: number; d: number } {
  return { x: r2((a.x + b.x) / 2), z: r2((a.z + b.z) / 2), g: r2(Math.abs(b.x - a.x)), d: r2(Math.abs(b.z - a.z)) };
}

export const CIZIM_ENAZ = 0.2;

// Çizilen dikdörtgen (duvarda çizgi) öğe olur. Raf uzun kenarı boyunca yatar (dikeyse 90°); bölme sayısı türün olağan
// bölme genişliğinden, bölme genişliği boy / bölme sayısı. Çok küçük çizim öğe olmaz (null).
export function ogeCiz(t: Taslak, tur: EklenecekTur, a: Konum, b: Konum): { taslak: Taslak; anahtar: string } | null {
  // Geçiş duvar boyunca çizilir: çizginin ortası en yakın kenara oturur, boyu geçişin genişliğidir.
  if (tur.startsWith('gecis_')) {
    const boy = Math.hypot(b.x - a.x, b.z - a.z);
    if (boy < GECIS_ENAZ) return null;
    return gecisEkle(t, tur.slice(6) as GecisTuru, { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }, Math.min(GECIS_ENCOK, r2(boy)));
  }
  if (tur === 'duvar' || tur === 'cam_duvar') {
    if (Math.hypot(b.x - a.x, b.z - a.z) < CIZIM_ENAZ) return null;
    const r = ogeEkle(t, tur, a.x, a.z);
    return { anahtar: r.anahtar, taslak: guncelle(r.taslak, r.anahtar, { basX: r2(a.x), basZ: r2(a.z), sonX: r2(b.x), sonZ: r2(b.z) }) };
  }
  const k = dikdortgen(a, b);
  if (k.g < CIZIM_ENAZ || k.d < CIZIM_ENAZ) return null;
  const r = ogeEkle(t, tur, k.x, k.z);
  if (tur.startsWith('raf_')) {
    const v = RAF_VARSAYILAN[tur.slice(4) as RafTuru];
    const uzun = Math.max(k.g, k.d);
    const bolmeSayisi = sinirla(Math.round(uzun / v.bolmeGenisligi), 1, 99);
    return {
      anahtar: r.anahtar,
      taslak: guncelle(r.taslak, r.anahtar, {
        donus: k.g >= k.d ? 0 : 90, bolmeSayisi, bolmeGenisligi: sinirla(r2(uzun / bolmeSayisi), 0.2, 10), derinlik: sinirla(Math.min(k.g, k.d), 0.2, 10),
      }),
    };
  }
  return { anahtar: r.anahtar, taslak: guncelle(r.taslak, r.anahtar, { genislik: sinirla(k.g, 0.2, 500), derinlik: sinirla(k.d, 0.2, 500) }) };
}

export function istasyonCiz(t: Taslak, i: Istasyon, a: Konum, b: Konum): { taslak: Taslak; anahtar: string } | null {
  const k = dikdortgen(a, b);
  if (k.g < CIZIM_ENAZ || k.d < CIZIM_ENAZ) return null;
  const r = istasyonEkle(t, i, k.x, k.z);
  return { anahtar: r.anahtar, taslak: guncelle(r.taslak, r.anahtar, { genislik: sinirla(k.g, 0.2, 50), derinlik: sinirla(k.d, 0.2, 50) }) };
}

// Makinenin önerilen ayak izi istasyonun tipinden gelir; istasyonsuz makine talaşlı sayılır.
export function makineEkle(t: Taslak, m: Makine, tip: IstasyonTipi | null, x: number, z: number): { taslak: Taslak; anahtar: string } {
  const [g, d] = AYAK_IZI[tip ?? 'talasli'];
  const anahtar = `makine:${m.id}`;
  return {
    anahtar,
    taslak: {
      ...t,
      makineler: [...t.makineler, {
        anahtar, makineId: m.id, kod: m.kod, ad: m.ad, istasyonId: m.istasyonId, tip, aktif: m.aktif, x, z, donus: 0, genislik: g, derinlik: d, modelId: null,
      }],
    },
  };
}

export function makineCiz(t: Taslak, m: Makine, tip: IstasyonTipi | null, a: Konum, b: Konum): { taslak: Taslak; anahtar: string } | null {
  const k = dikdortgen(a, b);
  if (k.g < CIZIM_ENAZ || k.d < CIZIM_ENAZ) return null;
  const r = makineEkle(t, m, tip, k.x, k.z);
  return { anahtar: r.anahtar, taslak: guncelle(r.taslak, r.anahtar, { genislik: sinirla(k.g, 0.2, 50), derinlik: sinirla(k.d, 0.2, 50) }) };
}

// Öğenin eksene paralel sınır kutusu (yapışma için); dönüşü 90'ın katı değilse null.
export function eksenKutusu(t: Taslak, anahtar: string): { x0: number; x1: number; z0: number; z1: number } | null {
  const tur = ogeTuru(anahtar);
  const o = tur === 'istasyon' ? t.istasyonlar.find((x) => x.anahtar === anahtar)
    : tur === 'makine' ? t.makineler.find((x) => x.anahtar === anahtar)
    : tur === 'alan' ? t.alanlar.find((x) => x.anahtar === anahtar)
      : tur === 'raf' ? (() => { const r = t.raflar.find((x) => x.anahtar === anahtar); return r ? { ...r, genislik: r.bolmeSayisi * r.bolmeGenisligi } : undefined; })()
        : undefined;
  if (!o || Math.abs(((o.donus % 90) + 90) % 90) > 1e-6) return null;
  const yan = Math.round(o.donus / 90) % 2 === 1;
  const g = yan ? o.derinlik : o.genislik;
  const d = yan ? o.genislik : o.derinlik;
  return { x0: o.x - g / 2, x1: o.x + g / 2, z0: o.z - d / 2, z1: o.z + d / 2 };
}

// ---------- öğe değiştirme ----------

export type OgeTuru = 'istasyon' | 'makine' | 'raf' | 'alan' | 'duvar' | 'gecis' | 'giris' | 'bolum';
export const ogeTuru = (anahtar: string): OgeTuru => anahtar.split(':')[0] as OgeTuru;
const bolumAl = (t: Taslak, anahtar: string): TaslakBolum | undefined => {
  const id = Number(anahtar.split(':')[1]);
  return t.bolumler?.find((b) => b.salonId === id);
};

export interface Konum {
  x: number;
  z: number;
}

export function konumu(t: Taslak, anahtar: string): Konum | null {
  const tur = ogeTuru(anahtar);
  if (tur === 'bolum') { const b = bolumAl(t, anahtar); return b ? { x: b.x, z: b.z } : null; }
  if (tur === 'giris' && t.bolumler) return bolumAl(t, anahtar)?.giris ?? null;
  if (tur === 'giris') return t.salon.giris;
  if (tur === 'gecis') {
    const g = t.gecisler.find((o) => o.anahtar === anahtar);
    const c = g ? gecisCercevesi(t, g.salonId) : null;
    return g && c ? c.dunya(gecisOrtasi(g, c.g, c.d)) : null;
  }
  if (tur === 'duvar') {
    const d = t.duvarlar.find((o) => o.anahtar === anahtar);
    return d ? { x: (d.basX + d.sonX) / 2, z: (d.basZ + d.sonZ) / 2 } : null;
  }
  return kutuListesi(t, tur).find((o) => o.anahtar === anahtar) ?? null;
}

// Ortası ve dönüşüyle yerleşen öğelerin listesi (istasyon, makine, raf, alan).
function kutuListesi(t: Taslak, tur: OgeTuru): readonly { anahtar: string; x: number; z: number; donus: number }[] {
  return tur === 'istasyon' ? t.istasyonlar : tur === 'makine' ? t.makineler : tur === 'raf' ? t.raflar : t.alanlar;
}

export function tasi(t: Taslak, anahtar: string, x: number, z: number): Taslak {
  const tur = ogeTuru(anahtar);
  if (tur === 'bolum') { const b = bolumAl(t, anahtar); return b ? bolumYerlestir(t, b.salonId, { x, z, donus: b.donus }) : t; }
  if (tur === 'giris' && t.bolumler) return bolumDegistir(t, anahtar, { giris: { x, z } });
  if (tur === 'giris') return { ...t, salon: { ...t.salon, giris: { x, z } } };
  if (tur === 'gecis') {
    return {
      ...t,
      gecisler: t.gecisler.map((g) => {
        const c = g.anahtar === anahtar ? gecisCercevesi(t, g.salonId) : null;
        return c ? { ...g, ...kenaraOtur(c.yerel({ x, z }), g.genislik, c.g, c.d) } : g;
      }),
    };
  }
  if (tur === 'duvar') {
    return {
      ...t,
      duvarlar: t.duvarlar.map((d) => {
        if (d.anahtar !== anahtar) return d;
        const dx = x - (d.basX + d.sonX) / 2;
        const dz = z - (d.basZ + d.sonZ) / 2;
        return { ...d, basX: d.basX + dx, basZ: d.basZ + dz, sonX: d.sonX + dx, sonZ: d.sonZ + dz };
      }),
    };
  }
  return guncelle(t, anahtar, { x, z });
}

export function duvarUcuTasi(t: Taslak, anahtar: string, uc: 'bas' | 'son', x: number, z: number): Taslak {
  return {
    ...t,
    duvarlar: t.duvarlar.map((d) => (d.anahtar !== anahtar ? d : uc === 'bas' ? { ...d, basX: x, basZ: z } : { ...d, sonX: x, sonZ: z })),
  };
}

export function guncelle(t: Taslak, anahtar: string, degisim: Record<string, unknown>): Taslak {
  const tur = ogeTuru(anahtar);
  if (tur === 'istasyon') return { ...t, istasyonlar: t.istasyonlar.map((o) => (o.anahtar === anahtar ? { ...o, ...degisim } : o)) };
  if (tur === 'makine') return { ...t, makineler: t.makineler.map((o) => (o.anahtar === anahtar ? { ...o, ...degisim } : o)) };
  if (tur === 'raf') {
    return {
      ...t,
      raflar: t.raflar.map((o) => {
        if (o.anahtar !== anahtar) return o;
        const yeni = { ...o, ...degisim };
        return typeof degisim.katSayisi === 'number' ? { ...yeni, katYukseklikleri: katDizisi(yeni.katYukseklikleri, yeni.katSayisi) } : yeni;
      }),
    };
  }
  if (tur === 'alan') return { ...t, alanlar: t.alanlar.map((o) => (o.anahtar === anahtar ? { ...o, ...degisim } : o)) };
  if (tur === 'duvar') return { ...t, duvarlar: t.duvarlar.map((o) => (o.anahtar === anahtar ? { ...o, ...degisim } : o)) };
  if (tur === 'gecis') return { ...t, gecisler: t.gecisler.map((o) => (o.anahtar === anahtar ? { ...o, ...degisim } : o)) };
  if (tur === 'giris' && t.bolumler) {
    const g = bolumAl(t, anahtar)?.giris;
    return g ? bolumDegistir(t, anahtar, { giris: { ...g, ...degisim } }) : t;
  }
  if (tur === 'bolum') {
    const b = bolumAl(t, anahtar);
    if (!b) return t;
    const { x, z, donus, ...oteki } = degisim as Partial<TaslakBolum>;
    const yer = x !== undefined || z !== undefined || donus !== undefined
      ? bolumYerlestir(t, b.salonId, { x: x ?? b.x, z: z ?? b.z, donus: donus ?? b.donus })
      : t;
    return Object.keys(oteki).length > 0 ? bolumDegistir(yer, anahtar, oteki) : yer;
  }
  return t;
}

export const donusIndir = (derece: number): number => ((Math.round(derece * 10) / 10) % 360 + 360) % 360;

export function dondur(t: Taslak, anahtar: string, derece: number): Taslak {
  const tur = ogeTuru(anahtar);
  if (tur === 'duvar') {
    return {
      ...t,
      duvarlar: t.duvarlar.map((d) => {
        if (d.anahtar !== anahtar) return d;
        const ox = (d.basX + d.sonX) / 2;
        const oz = (d.basZ + d.sonZ) / 2;
        const a = (derece * Math.PI) / 180;
        const cevir = (x: number, z: number): [number, number] => [ox + (x - ox) * Math.cos(a) - (z - oz) * Math.sin(a), oz + (x - ox) * Math.sin(a) + (z - oz) * Math.cos(a)];
        const [bx, bz] = cevir(d.basX, d.basZ);
        const [sx, sz] = cevir(d.sonX, d.sonZ);
        return { ...d, basX: bx, basZ: bz, sonX: sx, sonZ: sz };
      }),
    };
  }
  if (tur === 'bolum') {
    const b = bolumAl(t, anahtar);
    if (!b) return t;
    // Bölüm ortası çevresinde döner (içindekilerle birlikte).
    const orta = fabrikayaCevir(b, { x: b.genislik / 2, z: b.derinlik / 2 });
    const yeniDonus = donusIndir(b.donus + derece);
    const kose = fabrikayaCevir({ x: 0, z: 0, donus: yeniDonus }, { x: -b.genislik / 2, z: -b.derinlik / 2 });
    return bolumYerlestir(t, b.salonId, { x: r2(orta.x + kose.x), z: r2(orta.z + kose.z), donus: yeniDonus });
  }
  const k = konumu(t, anahtar);
  if (!k || tur === 'giris' || tur === 'gecis') return t;
  const simdiki = kutuListesi(t, tur).find((o) => o.anahtar === anahtar)?.donus ?? 0;
  return guncelle(t, anahtar, { donus: donusIndir(simdiki + derece) });
}

// Raf silinmez, pasife alınır (ATL-13); istasyonun ve makinenin yeri kaldırılır (kaydı kalır); öbürleri silinir.
export function kaldir(t: Taslak, anahtar: string): Taslak {
  const tur = ogeTuru(anahtar);
  if (tur === 'raf') {
    const raf = t.raflar.find((r) => r.anahtar === anahtar);
    if (raf && raf.id !== null) return guncelle(t, anahtar, { aktif: false });
    return { ...t, raflar: t.raflar.filter((r) => r.anahtar !== anahtar) };
  }
  if (tur === 'istasyon') return { ...t, istasyonlar: t.istasyonlar.filter((o) => o.anahtar !== anahtar) };
  if (tur === 'makine') return { ...t, makineler: t.makineler.filter((o) => o.anahtar !== anahtar) };
  if (tur === 'alan') return { ...t, alanlar: t.alanlar.filter((o) => o.anahtar !== anahtar) };
  if (tur === 'duvar') return { ...t, duvarlar: t.duvarlar.filter((o) => o.anahtar !== anahtar) };
  if (tur === 'gecis') return { ...t, gecisler: t.gecisler.filter((o) => o.anahtar !== anahtar) };
  if (tur === 'giris' && t.bolumler) return bolumDegistir(t, anahtar, { giris: null });
  if (tur === 'giris') return { ...t, salon: { ...t.salon, giris: null } };
  return t;
}

export const izgarayaOtur = (deger: number, adim: number): number => Math.round(Math.round(deger / adim) * adim * 100) / 100;

// ---------- geri al / yinele ----------

export interface Gecmis {
  onceki: Taslak[];
  simdi: Taslak;
  sonraki: Taslak[];
}

const GECMIS_SINIRI = 100;

export const gecmisKur = (t: Taslak): Gecmis => ({ onceki: [], simdi: t, sonraki: [] });
export function gecmiseYaz(g: Gecmis, yeni: Taslak): Gecmis {
  if (yeni === g.simdi) return g;
  return { onceki: [...g.onceki, g.simdi].slice(-GECMIS_SINIRI), simdi: yeni, sonraki: [] };
}
// Sürükleme sırasında ara konumlar geçmişe yazılmaz; yalnız son hali.
export const gecmisiDegistir = (g: Gecmis, yeni: Taslak): Gecmis => ({ ...g, simdi: yeni });
export function geriAl(g: Gecmis): Gecmis {
  const onceki = g.onceki.at(-1);
  return onceki ? { onceki: g.onceki.slice(0, -1), simdi: onceki, sonraki: [g.simdi, ...g.sonraki] } : g;
}
export function yinele(g: Gecmis): Gecmis {
  const sonraki = g.sonraki[0];
  return sonraki ? { onceki: [...g.onceki, g.simdi], simdi: sonraki, sonraki: g.sonraki.slice(1) } : g;
}

// ---------- fabrika (bütün bölümler tek taslakta) ----------

function bolumDegistir(t: Taslak, anahtar: string, degisim: Partial<TaslakBolum>): Taslak {
  const id = Number(anahtar.split(':')[1]);
  return { ...t, bolumler: t.bolumler?.map((b) => (b.salonId === id ? { ...b, ...degisim } : b)) };
}

// Fabrika noktasının düştüğü bölüm (kenardaki nokta ilk bölüme; bölümler yalnız kenarda değebilir).
export function bolumunu(t: Taslak, p: Konum): TaslakBolum | null {
  return t.bolumler?.find((b) => bolumIcinde(b, b.genislik, b.derinlik, p)) ?? null;
}

const duvarOrtasi = (d: TaslakDuvar): Konum => ({ x: (d.basX + d.sonX) / 2, z: (d.basZ + d.sonZ) / 2 });

// Bölümün yeri değişir; ortası o bölümde olan öğeler ve giriş birlikte, katı cisim gibi taşınır ve döner.
export function bolumYerlestir(t: Taslak, salonId: number, yeni: BolumKonumu): Taslak {
  const b = t.bolumler?.find((o) => o.salonId === salonId);
  if (!b) return t;
  const fark = donusIndir(yeni.donus - b.donus);
  const cevir = (p: Konum): Konum => { const f = fabrikayaCevir(yeni, bolumeCevir(b, p)); return { x: r2(f.x), z: r2(f.z) }; };
  const uye = (p: Konum) => bolumunu(t, p)?.salonId === salonId;
  const oge = <T extends { x: number; z: number; donus: number }>(o: T): T => (uye(o) ? { ...o, ...cevir(o), donus: donusIndir(o.donus + fark) } : o);
  return {
    ...t,
    istasyonlar: t.istasyonlar.map(oge),
    makineler: t.makineler.map(oge),
    raflar: t.raflar.map(oge),
    alanlar: t.alanlar.map(oge),
    duvarlar: t.duvarlar.map((d) => {
      if (!uye(duvarOrtasi(d))) return d;
      const a = cevir({ x: d.basX, z: d.basZ });
      const s = cevir({ x: d.sonX, z: d.sonZ });
      return { ...d, basX: a.x, basZ: a.z, sonX: s.x, sonZ: s.z };
    }),
    bolumler: t.bolumler?.map((o) => (o.salonId === salonId ? { ...o, x: yeni.x, z: yeni.z, donus: donusIndir(yeni.donus), giris: o.giris ? cevir(o.giris) : null } : o)),
  };
}

// Görünen alan: tek bölümde salonun kendisi, fabrikada bölümlerin sınır kutusu.
export function kapsamKutusu(t: Taslak): Kutu {
  const k = t.bolumler ? fabrikaKutusu(t.bolumler.map((b) => ({ konum: b, g: b.genislik, d: b.derinlik }))) : null;
  return k ?? { x0: 0, z0: 0, x1: t.salon.genislik, z1: t.salon.derinlik };
}

export function fabrikaTaslagiKur(bolumler: readonly YerlesimCevabi[]): Taslak {
  const t: Taslak = { surum: 0, salon: { kod: '', ad: 'Fabrika', genislik: 0, derinlik: 0, hucreBoyu: 1, giris: null }, istasyonlar: [], makineler: [], raflar: [], alanlar: [], duvarlar: [], gecisler: [], bolumler: [] };
  for (const y of bolumler) {
    const k = konumOku(y.salon);
    const yt = taslakKur(y);
    const f = (p: Konum): Konum => { const n = fabrikayaCevir(k, p); return { x: r2(n.x), z: r2(n.z) }; };
    const oge = <T extends { x: number; z: number; donus: number }>(o: T): T => ({ ...o, ...f(o), donus: donusIndir(o.donus + k.donus) });
    t.istasyonlar.push(...yt.istasyonlar.map(oge));
    t.makineler.push(...yt.makineler.map(oge));
    t.raflar.push(...yt.raflar.map(oge));
    t.alanlar.push(...yt.alanlar.map(oge));
    t.duvarlar.push(...yt.duvarlar.map((d) => {
      const a = f({ x: d.basX, z: d.basZ });
      const s = f({ x: d.sonX, z: d.sonZ });
      return { ...d, basX: a.x, basZ: a.z, sonX: s.x, sonZ: s.z };
    }));
    t.gecisler.push(...yt.gecisler.map((g) => ({ ...g, salonId: y.salon.id })));
    t.bolumler?.push({
      anahtar: `bolum:${y.salon.id}`, salonId: y.salon.id, surum: y.salon.surum, kod: yt.salon.kod, ad: yt.salon.ad,
      genislik: yt.salon.genislik, derinlik: yt.salon.derinlik, hucreBoyu: yt.salon.hucreBoyu, sutunlar: y.salon.sutunlar, satirlar: y.salon.satirlar,
      x: k.x, z: k.z, donus: k.donus, giris: yt.salon.giris ? f(yt.salon.giris) : null,
    });
  }
  const kutu = kapsamKutusu(t);
  return { ...t, salon: { ...t.salon, genislik: kutu.x1 - kutu.x0, derinlik: kutu.z1 - kutu.z0 } };
}

export interface FabrikaHazirligi {
  govde: FabrikaKayitGovdesi;
  // Sunucu bulgu anahtarı (salon:<id>/raf:<sıra>, bolum:<id>) -> taslak anahtarı.
  eslesme: Map<string, string>;
  // Hiçbir bölümün içinde olmayan öğeler (kayıt gönderilmez).
  disarida: string[];
}

// Her öğe ortasının düştüğü bölüme, o bölümün metresine çevrilir; bütün bölümler tek kayıtta gider.
export function fabrikaGovdesi(t: Taslak): FabrikaHazirligi {
  const bolumler = t.bolumler ?? [];
  const eslesme = new Map<string, string>();
  const disarida: string[] = [];
  const gruplar = new Map<number, Taslak>(bolumler.map((b) => [b.salonId, {
    surum: b.surum,
    salon: { kod: b.kod, ad: b.ad, genislik: b.genislik, derinlik: b.derinlik, hucreBoyu: b.hucreBoyu, giris: b.giris ? yuvarlaNokta(bolumeCevir(b, b.giris)) : null },
    istasyonlar: [], makineler: [], raflar: [], alanlar: [], duvarlar: [], gecisler: [],
  }]));
  const yer = (p: Konum, anahtar: string): { b: TaslakBolum; g: Taslak } | null => {
    const b = bolumunu(t, p);
    const g = b ? gruplar.get(b.salonId) : undefined;
    if (!b || !g) { disarida.push(anahtar); return null; }
    return { b, g };
  };
  const yerel = <T extends { anahtar: string; x: number; z: number; donus: number }>(o: T, b: TaslakBolum): T =>
    ({ ...o, ...yuvarlaNokta(bolumeCevir(b, o)), donus: donusIndir(o.donus - b.donus) });
  for (const o of t.istasyonlar) { const y = yer(o, o.anahtar); if (y) y.g.istasyonlar.push(yerel(o, y.b)); }
  for (const o of t.makineler) { const y = yer(o, o.anahtar); if (y) y.g.makineler.push(yerel(o, y.b)); }
  for (const o of t.raflar) { const y = yer(o, o.anahtar); if (y) y.g.raflar.push(yerel(o, y.b)); }
  for (const o of t.alanlar) { const y = yer(o, o.anahtar); if (y) y.g.alanlar.push(yerel(o, y.b)); }
  for (const d of t.duvarlar) {
    const y = yer(duvarOrtasi(d), d.anahtar);
    if (!y) continue;
    const a = yuvarlaNokta(bolumeCevir(y.b, { x: d.basX, z: d.basZ }));
    const s = yuvarlaNokta(bolumeCevir(y.b, { x: d.sonX, z: d.sonZ }));
    y.g.duvarlar.push({ ...d, basX: a.x, basZ: a.z, sonX: s.x, sonZ: s.z });
  }
  for (const g of t.gecisler) gruplar.get(g.salonId ?? -1)?.gecisler.push(g);
  const govde: FabrikaKayitGovdesi = { bolumler: [] };
  for (const b of bolumler) {
    const g = gruplar.get(b.salonId);
    if (!g) continue;
    const h = govdeyeCevir(g);
    for (const [sunucu, taslak] of h.eslesme) eslesme.set(`salon:${b.salonId}/${sunucu}`, sunucu === 'giris' ? `giris:${b.salonId}` : taslak);
    eslesme.set(`bolum:${b.salonId}`, b.anahtar);
    govde.bolumler.push({ salonId: b.salonId, fabrika: { x: r2(b.x), z: r2(b.z), donus: donusIndir(b.donus) }, yerlesim: h.govde });
  }
  return { govde, eslesme, disarida };
}

// -0 yazılmaz (+0 eklemek işareti siler).
const yuvarlaNokta = (p: Konum): Konum => ({ x: r2(p.x) + 0, z: r2(p.z) + 0 });
