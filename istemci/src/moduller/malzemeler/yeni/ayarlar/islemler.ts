// Malzeme ayarı üzerinde yapılan her değişiklik: girdi ayarı bozmaz, yeni ayar döner. Ekran yalnız sonucu kaydeder.
import type { AyarliTablolar, Deger, HamTablolar, MalzemeAyari } from './kaynak.ts';

export interface ListeAyari { ekle: Deger[]; gizle: Deger[] }
export interface EkAile { key: string; ad: string; kod: string; renk?: string; kaynak: string; forms: string[] }
export interface EkSinif { fam: string; key: string; ad: string; kod: string }
export interface EkKalite {
  fam: string; cls: string; kod: string; ad: string; std: string; stds: string[]; eq: Record<string, string>; p: Record<string, Deger>;
}
export interface EkOzellik { k: string; ad: string; u: string; f: string[] }
export interface EkKategori { key: string; ad: string; kod: string; kal?: true }
export interface TurKurali { ad?: string; ac?: string[]; zorunlu?: Record<string, boolean>; cakisma?: string[] }
export type KategoriTuru = 'sarf' | 'demirbas';

// MA_BOS biçimi; kayıtlı ayarın eksik alanları bununla tamamlanır.
export interface AyarVerisi {
  surum: number;
  aileler: EkAile[]; gizliAileler: string[];
  siniflar: EkSinif[]; gizliSiniflar: string[];
  kaliteler: EkKalite[]; gizliKaliteler: string[];
  ozellikler: EkOzellik[]; gizliOzellikler: string[];
  kategoriler: { sarf: EkKategori[]; demirbas: EkKategori[] }; gizliKategoriler: string[];
  listeler: Record<string, Partial<ListeAyari>>;
  varsayilanlar: Record<string, { opts: Record<string, string> }>;
  favoriler: string[];
  kurallar?: Record<string, TurKurali>;
  [ek: string]: unknown;
}

export const bosAyar = (): AyarVerisi => ({
  surum: 1, aileler: [], gizliAileler: [], siniflar: [], gizliSiniflar: [], kaliteler: [], gizliKaliteler: [], ozellikler: [], gizliOzellikler: [],
  kategoriler: { sarf: [], demirbas: [] }, gizliKategoriler: [], listeler: {}, varsayilanlar: {}, favoriler: [],
});

export function ayarVerisi(a: MalzemeAyari | null | undefined): AyarVerisi {
  const v = { ...bosAyar(), ...((a ?? {}) as Partial<AyarVerisi>) };
  v.kategoriler = { sarf: v.kategoriler?.sarf ?? [], demirbas: v.kategoriler?.demirbas ?? [] };
  return v;
}

export const kayitBicimi = (v: AyarVerisi): MalzemeAyari => v as unknown as MalzemeAyari;

function degistir(v: AyarVerisi, fn: (k: AyarVerisi) => void): AyarVerisi {
  const k = structuredClone(v);
  fn(k);
  return k;
}

const tersle = <T>(l: T[], x: T): T[] => (l.includes(x) ? l.filter((y) => y !== x) : [...l, x]);

export type Sonuc = { tamam: true; ayar: AyarVerisi; ileti?: string } | { tamam: false; ileti: string };
const hata = (ileti: string): Sonuc => ({ tamam: false, ileti });
const tamam = (ayar: AyarVerisi, ileti?: string): Sonuc => ({ tamam: true, ayar, ileti });

/* ---------------- Türkçe büyük harf, kod ve anahtar ---------------- */

export const asc = (s: string): string => String(s || '').toLocaleUpperCase('tr')
  .replace(/Ç/g, 'C').replace(/Ğ/g, 'G').replace(/İ/g, 'I').replace(/Ö/g, 'O').replace(/Ş/g, 'S').replace(/Ü/g, 'U');
export const kisaKod = (s: string): string => asc(s).replace(/[^A-Z0-9]/g, '').slice(0, 3);
export const kaliteKodu = (s: string): string => asc(s).replace(/[^A-Z0-9.\-/]/g, '').slice(0, 16);

// Yeni kayıt anahtarı addan kurulur (oz_<ad>); doluysa sonuna sıra eklenir.
export function anahtarUret(on: string, ad: string, varMi: (k: string) => boolean, simdi: () => number = Date.now): string {
  let k = on + asc(ad).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 20);
  if (!k || k === on) k = on + simdi().toString(36);
  let s = k;
  let i = 2;
  while (varMi(s)) s = `${k}_${i++}`;
  return s;
}

/* ---------------- Liste düzenleyici ---------------- */
// Liste kimliği: sertifika | belge | birim | birim|<tür> | tol|<form>|<aile> | opt|<aile>|<seçenek> | alan|<ALAN.x|SARF.x|DB.x>|<alan>

function alanBul(t: HamTablolar, yol: string, k: string) {
  const [tablo, x = ''] = yol.split('.');
  const l = tablo === 'ALAN' ? t.ALAN[x] : tablo === 'SARF' ? t.SARF_KAT[x]?.alanlar : tablo === 'DB' ? t.DB_KAT[x]?.alanlar : undefined;
  return (l ?? []).find((a) => a.k === k) ?? null;
}

// Listenin yerleşik değerleri; tanınmayan kimlikte null.
export function listeTabani(id: string, t: HamTablolar): Deger[] | null {
  const p = id.split('|');
  if (id === 'sertifika') return [...t.SERTIFIKA];
  if (id === 'belge') return [...t.DOCTIPS];
  if (id === 'birim') return [...t.BIRIMLER];
  if (p[0] === 'birim') return [...(t.BIRIM_T[p[1] ?? ''] ?? [])];
  if (p[0] === 'tol') return [...(t.TOLP[p[1] ?? '']?.[p[2] ?? ''] ?? [])];
  if (p[0] === 'opt') {
    const f = t.FAMS[p[1] ?? ''];
    const o = f?.opts.find((x) => x.k === p[2]);
    if (!f || !o) return null;
    if (o.from) {
      const kaynak = o.from;
      const tb: Deger[] = [];
      Object.values(f.classes).forEach((c) => ((c[kaynak] as Deger[] | undefined) ?? []).forEach((v) => { if (!tb.includes(v)) tb.push(v); }));
      return tb;
    }
    return [...(o.opts ?? [])];
  }
  if (p[0] === 'alan') {
    const a = alanBul(t, p[1] ?? '', p[2] ?? '');
    if (!a) return null;
    return [...(Array.isArray(a.opts) ? a.opts : a.oneri ?? [])];
  }
  return null;
}

// Alanın düzenlenebilir listesi var mı; seçim listesi mi, yalnız öneri mi.
export function alanListesiTuru(a: { opts?: unknown; oneri?: unknown }): 'secim' | 'oneri' | null {
  if (Array.isArray(a.opts)) return 'secim';
  if (Array.isArray(a.oneri)) return 'oneri';
  return null;
}

export const listeAyari = (v: AyarVerisi, id: string): ListeAyari => ({ ekle: [...(v.listeler[id]?.ekle ?? [])], gizle: [...(v.listeler[id]?.gizle ?? [])] });

function listeYaz(v: AyarVerisi, id: string, fn: (l: ListeAyari) => void): AyarVerisi {
  return degistir(v, (k) => {
    const l = listeAyari(k, id);
    fn(l);
    k.listeler[id] = l;
  });
}

export function listeDegerEkle(v: AyarVerisi, id: string, ham: string, taban: readonly Deger[]): Sonuc {
  const deger = ham.trim();
  if (!deger) return hata('Eklenecek değeri yaz.');
  const l = listeAyari(v, id);
  const tabandaki = taban.find((x) => String(x) === deger);
  if ((tabandaki !== undefined && !l.gizle.includes(tabandaki)) || l.ekle.some((x) => String(x) === deger)) return hata(`"${deger}" zaten listede.`);
  return tamam(listeYaz(v, id, (y) => {
    if (tabandaki !== undefined) y.gizle = y.gizle.filter((x) => x !== tabandaki);
    else y.ekle.push(deger);
  }), `"${deger}" eklendi.`);
}

export const listeGizleDegistir = (v: AyarVerisi, id: string, deger: Deger) => listeYaz(v, id, (l) => { l.gizle = tersle(l.gizle, deger); });
export const listeEkiSil = (v: AyarVerisi, id: string, deger: Deger) => listeYaz(v, id, (l) => { l.ekle = l.ekle.filter((x) => x !== deger); });
export const listeHepsiniKullan = (v: AyarVerisi, id: string) => listeYaz(v, id, (l) => { l.gizle = []; });
export const listeHicbiriniKullanma = (v: AyarVerisi, id: string, taban: readonly Deger[]) => listeYaz(v, id, (l) => { l.gizle = [...taban]; });
export const listeVarsayilanaDon = (v: AyarVerisi, id: string) => degistir(v, (k) => { delete k.listeler[id]; });

export function listeDegistiMi(v: AyarVerisi, id: string): boolean {
  const l = listeAyari(v, id);
  return l.ekle.length > 0 || l.gizle.length > 0;
}

/* ---------------- Aç / kapa ---------------- */

export const aileGizleDegistir = (v: AyarVerisi, aile: string) => degistir(v, (k) => { k.gizliAileler = tersle(k.gizliAileler, aile); });
export const sinifGizleDegistir = (v: AyarVerisi, aile: string, sinif: string) =>
  degistir(v, (k) => { k.gizliSiniflar = tersle(k.gizliSiniflar, `${aile}|${sinif}`); });
export const kaliteKimligi = (aile: string, sinif: string, kod: string) => `${aile}|${sinif}|${kod}`;
export const kaliteGizleDegistir = (v: AyarVerisi, kimlik: string) => degistir(v, (k) => { k.gizliKaliteler = tersle(k.gizliKaliteler, kimlik); });
export const favoriDegistir = (v: AyarVerisi, kimlik: string) => degistir(v, (k) => { k.favoriler = tersle(k.favoriler, kimlik); });
export const ozellikGizleDegistir = (v: AyarVerisi, ozellik: string) => degistir(v, (k) => { k.gizliOzellikler = tersle(k.gizliOzellikler, ozellik); });
export const kategoriGizleDegistir = (v: AyarVerisi, tur: KategoriTuru, kat: string) =>
  degistir(v, (k) => { k.gizliKategoriler = tersle(k.gizliKategoriler, `${tur}|${kat}`); });

// Sınıfın yerleşik kalitelerinin hepsi açılır ya da kapanır; eklenen kalite hep açıktır.
export function kalitelerTopluGizle(v: AyarVerisi, aile: string, sinif: string, yerlesikKodlar: readonly string[], gizle: boolean): AyarVerisi {
  const kimlikler = yerlesikKodlar.map((kod) => kaliteKimligi(aile, sinif, kod));
  return degistir(v, (k) => {
    k.gizliKaliteler = k.gizliKaliteler.filter((x) => !kimlikler.includes(x));
    if (gizle) k.gizliKaliteler.push(...kimlikler);
  });
}

/* ---------------- Sınıf varsayılanları ---------------- */

export function varsayilanYaz(v: AyarVerisi, aile: string, sinif: string, secenek: string, deger: string): AyarVerisi {
  const anahtar = `${aile}|${sinif}`;
  return degistir(v, (k) => {
    const o = { ...(k.varsayilanlar[anahtar]?.opts ?? {}) };
    if (deger) o[secenek] = deger;
    else delete o[secenek];
    if (Object.keys(o).length) k.varsayilanlar[anahtar] = { opts: o };
    else delete k.varsayilanlar[anahtar];
  });
}
export const sinifVarsayilanlari = (v: AyarVerisi, aile: string, sinif: string): Record<string, string> => v.varsayilanlar[`${aile}|${sinif}`]?.opts ?? {};

/* ---------------- Aile, sınıf, kalite, özellik, kategori ---------------- */

export function aileEkle(
  v: AyarVerisi, t: AyarliTablolar, g: { ad: string; kod: string; renk?: string; kaynak: string; forms: string[] },
): Sonuc & { anahtar?: string } {
  const ad = g.ad.trim();
  const kod = kisaKod(g.kod);
  if (!ad || kod.length < 2) return hata('Aile adı ve en az 2 harfli kod gir.');
  if (Object.values(t.FAMS).some((f) => f.kod === kod)) return hata(`${kod} kodu başka bir ailede kullanılıyor.`);
  const key = anahtarUret('oz_', ad, (k) => k in t.FAMS);
  return {
    ...tamam(degistir(v, (k) => { k.aileler.push({ key, ad, kod, ...(g.renk ? { renk: g.renk } : {}), kaynak: g.kaynak, forms: g.forms }); }), `${ad} eklendi. Şimdi bir sınıf ekle.`),
    anahtar: key,
  };
}

export const aileSil = (v: AyarVerisi, aile: string) => degistir(v, (k) => {
  k.aileler = k.aileler.filter((a) => a.key !== aile);
  k.siniflar = k.siniflar.filter((c) => c.fam !== aile);
  k.kaliteler = k.kaliteler.filter((g) => g.fam !== aile);
});

export function sinifEkle(v: AyarVerisi, t: AyarliTablolar, aile: string, g: { ad: string; kod: string }): Sonuc & { anahtar?: string } {
  const ad = g.ad.trim();
  const kod = kisaKod(g.kod);
  if (!ad || kod.length < 2) return hata('Sınıf adı ve en az 2 harfli kısaltma gir.');
  const siniflar = t.FAMS[aile]?.classes ?? {};
  const key = anahtarUret('oz_', ad, (k) => k in siniflar);
  return {
    ...tamam(degistir(v, (k) => { k.siniflar.push({ fam: aile, key, ad, kod }); }), `${ad} sınıfı eklendi. Kaliteler bölümünden kalite ekleyebilirsin.`),
    anahtar: key,
  };
}

export const sinifSil = (v: AyarVerisi, aile: string, sinif: string) => degistir(v, (k) => {
  k.siniflar = k.siniflar.filter((c) => !(c.fam === aile && c.key === sinif));
  k.kaliteler = k.kaliteler.filter((g) => !(g.fam === aile && g.cls === sinif));
});

export interface KaliteGirdisi { kod: string; ad: string; std: string; stds: string; eq: Record<string, string>; p: Record<string, string> }

// Teknik değer sayıya benziyorsa sayı olarak (virgül de ondalık), seçimden geliyorsa yazıldığı gibi saklanır.
const sayiyaCevir = (s: string): number | null => {
  const t = s.trim().replace(/\s/g, '').replace(',', '.');
  if (t === '' || t === '-') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export function kaliteKaydet(
  v: AyarVerisi, t: AyarliTablolar, aile: string, sinif: string, g: KaliteGirdisi, duzenlenen: string | null, secimliOzellikler: ReadonlySet<string>,
): Sonuc & { yogunlukYok?: boolean } {
  const kod = duzenlenen ?? kaliteKodu(g.kod);
  if (!kod) return hata('Kalite kodunu yaz.');
  if (!duzenlenen && Object.values(t.FAMS[aile]?.classes ?? {}).some((c) => c.grades.some((x) => x.kod === kod))) return hata(`${kod} kodu bu ailede zaten var.`);
  const std = g.std.trim();
  const stds = [std, ...g.stds.split(',').map((x) => x.trim())].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i);
  const eq: Record<string, string> = {};
  Object.entries(g.eq).forEach(([k, x]) => { if (x.trim()) eq[k] = x.trim(); });
  const p: Record<string, Deger> = {};
  Object.entries(g.p).forEach(([k, x]) => {
    const d = x.trim();
    if (!d) return;
    const n = sayiyaCevir(d);
    p[k] = secimliOzellikler.has(k) || n === null ? d : n;
  });
  const yeni: EkKalite = { fam: aile, cls: sinif, kod, ad: g.ad.trim() || kod, std, stds, eq, p };
  const ayar = degistir(v, (k) => {
    const i = k.kaliteler.findIndex((x) => x.fam === aile && x.cls === sinif && x.kod === kod);
    if (i >= 0) k.kaliteler[i] = yeni;
    else k.kaliteler.push(yeni);
  });
  return { ...tamam(ayar, `${kod} ${duzenlenen ? 'güncellendi' : 'eklendi'}.`), yogunlukYok: typeof p['ro'] !== 'number' };
}

export const kaliteSil = (v: AyarVerisi, aile: string, sinif: string, kod: string) =>
  degistir(v, (k) => { k.kaliteler = k.kaliteler.filter((g) => !(g.fam === aile && g.cls === sinif && g.kod === kod)); });

export function ozellikEkle(v: AyarVerisi, taban: HamTablolar, t: AyarliTablolar, g: { ad: string; u: string; f: string[] }): Sonuc {
  const ad = g.ad.trim();
  if (!ad) return hata('Özellik adını yaz.');
  const k = anahtarUret('oz_', ad, (x) => t.PROPS.some((p) => p.k === x) || taban.PROPS.some((p) => p.k === x) || v.ozellikler.some((p) => p.k === x));
  return tamam(degistir(v, (y) => { y.ozellikler.push({ k, ad, u: g.u.trim(), f: g.f }); }), `${ad} özelliği eklendi.`);
}

export const ozellikSil = (v: AyarVerisi, ozellik: string) => degistir(v, (k) => { k.ozellikler = k.ozellikler.filter((p) => p.k !== ozellik); });

export function kategoriEkle(v: AyarVerisi, t: AyarliTablolar, tur: KategoriTuru, g: { ad: string; kod: string; kal: boolean }): Sonuc & { anahtar?: string } {
  const ad = g.ad.trim();
  const kod = kisaKod(g.kod);
  if (!ad || kod.length < 2) return hata('Kategori adı ve en az 2 harfli kısaltma gir.');
  const T = tur === 'sarf' ? t.SARF_KAT : t.DB_KAT;
  if (Object.values(T).some((c) => c.kod === kod)) return hata(`${kod} kısaltması kullanılıyor.`);
  const key = anahtarUret('oz_', ad, (k) => k in T);
  const kal = tur === 'demirbas' && g.kal;
  return {
    ...tamam(degistir(v, (k) => { k.kategoriler[tur].push({ key, ad, kod, ...(kal ? { kal: true as const } : {}) }); }), `${ad} kategorisi eklendi.`),
    anahtar: key,
  };
}

export const kategoriSil = (v: AyarVerisi, tur: KategoriTuru, kat: string) =>
  degistir(v, (k) => { k.kategoriler[tur] = k.kategoriler[tur].filter((c) => c.key !== kat); });

/* ---------------- Tür kuralları (ad, açıklama, zorunlu alan, çakışma) ---------------- */

export const turKurali = (v: AyarVerisi, tur: string): TurKurali => {
  const k = v.kurallar?.[tur];
  return k && typeof k === 'object' ? k : {};
};

// Boşalan parça silinir: kural yoksa bugünkü otomatik davranış geçerlidir.
export function kuralDegistir(v: AyarVerisi, tur: string, fn: (k: TurKurali) => void): AyarVerisi {
  return degistir(v, (y) => {
    const kurallar = { ...(y.kurallar ?? {}) };
    const k: TurKurali = { ...(kurallar[tur] ?? {}) };
    fn(k);
    if (k.ad === '') delete k.ad;
    if (k.ac && !k.ac.some(Boolean)) delete k.ac;
    if (k.cakisma && !k.cakisma.length) delete k.cakisma;
    if (k.zorunlu && !Object.keys(k.zorunlu).length) delete k.zorunlu;
    if (Object.keys(k).length) kurallar[tur] = k;
    else delete kurallar[tur];
    y.kurallar = kurallar;
  });
}

export const kalipYaz = (v: AyarVerisi, tur: string, yol: 'ad' | 'ac0' | 'ac1' | 'ac2', deger: string) => kuralDegistir(v, tur, (k) => {
  const d = deger.trim();
  if (yol === 'ad') k.ad = d;
  else {
    const ac = [...(k.ac ?? ['', '', ''])];
    ac[Number(yol.slice(2))] = d;
    k.ac = ac;
  }
});

// Alanın kendi varsayılanıyla aynı seçim kayda yazılmaz.
export const zorunluYaz = (v: AyarVerisi, tur: string, alan: { k: string; gerekli?: boolean }, zorunlu: boolean) => kuralDegistir(v, tur, (k) => {
  const z = { ...(k.zorunlu ?? {}) };
  if (zorunlu === !!alan.gerekli) delete z[alan.k];
  else z[alan.k] = zorunlu;
  k.zorunlu = z;
});

export const cakismaYaz = (v: AyarVerisi, tur: string, alan: string, secili: boolean) => kuralDegistir(v, tur, (k) => {
  const l = (Array.isArray(k.cakisma) ? k.cakisma : []).filter((x) => x !== alan);
  if (secili) l.push(alan);
  k.cakisma = l;
});

export const kuralVarsayilanaDon = (v: AyarVerisi, tur: string) => kuralDegistir(v, tur, (k) => { delete k.ad; delete k.ac; delete k.zorunlu; delete k.cakisma; });

/* ---------------- Yedek ---------------- */

export function iceAktar(metin: string): AyarVerisi | null {
  try {
    const o: unknown = JSON.parse(metin);
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
    return ayarVerisi(o as MalzemeAyari);
  } catch {
    return null;
  }
}

export const tumunuSifirla = (): AyarVerisi => bosAyar();

/* ---------------- Genel bakış sayıları ---------------- */

export function ozetSayilari(v: AyarVerisi, t: AyarliTablolar) {
  const aileler = Object.values(t.FAMS);
  const kalite = aileler.reduce((a, f) => a + Object.values(f.classes).reduce((b, c) => b + c.grades.length, 0), 0);
  return {
    aile: aileler.filter((f) => !f.gizli).length,
    kalite: kalite - v.gizliKaliteler.length,
    ozellik: t.PROPS.length,
    liste: Object.values(v.listeler).filter((l) => (l.ekle ?? []).length || (l.gizle ?? []).length).length,
    sarf: Object.values(t.SARF_KAT).filter((c) => !c.gizli).length,
    demirbas: Object.values(t.DB_KAT).filter((c) => !c.gizli).length,
  };
}

// Sayaç alt yazısı: "2 eklendi, 1 gizli".
export const ekGizliMetni = (eklenen: number, gizli: number) =>
  [eklenen ? `${eklenen} eklendi` : '', gizli ? `${gizli} gizli` : ''].filter(Boolean).join(', ');
