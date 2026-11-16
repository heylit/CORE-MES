// Katalog tablosunun gruplama, sıra ve sütun metinleri (3275): saf hesaplar, ekran yalnız çizer.
import type { Siralama } from '../../../../ortak/veri/liste-durumu.ts';
import { tlc } from '../bicim.ts';
import * as K from '../kurallar/index.ts';
import type { KuralBaglami } from '../kurallar/index.ts';
import type { KatalogKarti, KartKaydi } from '../tipler.ts';

export type Gruplama = 'tur-kategori' | 'tur' | 'yok';
export const GRUPLAMALAR: readonly { deger: Gruplama; ad: string }[] = [
  { deger: 'tur-kategori', ad: 'Tür ve kategori' },
  { deger: 'tur', ad: 'Yalnız tür' },
  { deger: 'yok', ad: 'Gruplama yok' },
];
export const gruplamaMi = (v: unknown): v is Gruplama => GRUPLAMALAR.some((g) => g.deger === v);

export const KATEGORISIZ = 'Kategorisiz';

export const turOf = (x: KartKaydi): string => x.tur ?? 'hammadde';

// Hammaddede aile, sarf, demirbaş ve hizmette kategori, yarı mamulde parça tipi; ötekinde yok.
export function kategoriAdi(x: KartKaydi, b: KuralBaglami): string | null {
  const g = (x.g ?? {}) as Record<string, unknown>;
  switch (turOf(x)) {
    case 'hammadde': return x.fam ? b.t.FAMS[x.fam]?.ad ?? x.fam : null;
    case 'sarf': return K.sarfKat(x, b)?.ad ?? null;
    case 'demirbas': return K.dbKat(x, b)?.ad ?? null;
    case 'hizmet': return K.hzKat(x, b)?.ad ?? null;
    case 'yarimamul': return typeof g.tip === 'string' && g.tip ? g.tip : null;
    default: return null;
  }
}

export function grupYolu(x: KartKaydi, b: KuralBaglami, g: Gruplama): string[] {
  if (g === 'yok') return [];
  if (g === 'tur') return [turOf(x)];
  return [turOf(x), kategoriAdi(x, b) ?? KATEGORISIZ];
}

export function turAdi(tur: string, b: KuralBaglami): string {
  return b.t.TURLER[tur]?.ad ?? tur;
}

// Kod önekindeki tür kısaltması (HM, YM, MM ...); ayarda yoksa boş, künye tam adı yazar.
export function turKisa(tur: string, b: KuralBaglami): string {
  return b.t.KOD_TUR[tur] ?? '';
}

const yolAnahtari = (yol: readonly string[]) => yol.join('\u001f');

// Grup başlığındaki sayı süzülmüş listenin tamamıdır, yalnız görünen sayfanın değil.
export function grupSayilari(liste: readonly KatalogKarti[], b: KuralBaglami, g: Gruplama): (yol: readonly string[]) => number {
  const say = new Map<string, number>();
  for (const k of liste) {
    const yol = grupYolu(k.kayit, b, g);
    for (let n = 1; n <= yol.length; n++) {
      const a = yolAnahtari(yol.slice(0, n));
      say.set(a, (say.get(a) ?? 0) + 1);
    }
  }
  return (yol) => say.get(yolAnahtari(yol)) ?? 0;
}

export function kaliteMetni(x: KartKaydi, b: KuralBaglami): { kalite: string; sinif: string } | null {
  if (turOf(x) !== 'hammadde' || !x.grade) return null;
  const ozel = x.custom as { kod?: string; ad?: string } | undefined;
  const kalite = x.grade === '__ozel' ? `${ozel?.kod || ozel?.ad || ''} (özel)` : K.grade(x, b)?.ad ?? x.grade;
  return { kalite, sinif: K.clsObj(x, b)?.ad ?? '' };
}

export function formMetni(x: KartKaydi, b: KuralBaglami): { form: string; olcu: string } | null {
  const olcu = K.dimsStr(x, b.birim === 'met', b);
  const form = turOf(x) === 'hammadde' && x.form ? b.t.FORMS[x.form]?.ad ?? x.form : '';
  return form || olcu ? { form, olcu } : null;
}

type Karsilastir = (a: KatalogKarti, z: KatalogKarti) => number;
const metin = (s: string | null | undefined) => tlc(s ?? '');
const metinSira = (f: (k: KatalogKarti) => string | null | undefined): Karsilastir => (a, z) => metin(f(a)).localeCompare(metin(f(z)), 'tr');

export type SiralamaAlani = 'malzeme' | 'kalite' | 'form' | 'agirlik' | 'birim' | 'onay' | 'guncelleme';

function alanSirasi(alan: string, b: KuralBaglami): Karsilastir | null {
  switch (alan) {
    case 'malzeme': return metinSira((k) => k.kayit.com.kod);
    case 'kalite': return metinSira((k) => kaliteMetni(k.kayit, b)?.kalite);
    case 'form': return metinSira((k) => { const f = formMetni(k.kayit, b); return f ? `${f.form} ${f.olcu}` : null; });
    case 'agirlik': return (a, z) => {
      const wa = K.weight(a.kayit, b)?.kg;
      const wz = K.weight(z.kayit, b)?.kg;
      if (typeof wa !== 'number' || typeof wz !== 'number') return (typeof wa === 'number' ? 0 : 1) - (typeof wz === 'number' ? 0 : 1);
      return wa - wz;
    };
    case 'birim': return metinSira((k) => K.finalBirim(k.kayit, b));
    case 'onay': return metinSira((k) => K.onayDurum(k.kayit, b));
    case 'guncelleme': return (a, z) => (a.kayit.updatedAt ?? 0) - (z.kayit.updatedAt ?? 0);
    default: return null;
  }
}

// Gruplar bir arada kalır (tür sırası türlerin tanım sırası, kategori adına göre, kategorisiz sonda); grup içinde seçilen
// sütun, seçilmemişse gelen sıra (son güncellenen üstte) korunur. Sayfalama bu sıradan sonra yapılır.
export function tabloSirasi(liste: readonly KatalogKarti[], b: KuralBaglami, g: Gruplama, siralama: Siralama | null): KatalogKarti[] {
  const turSirasi = Object.keys(b.t.TURLER);
  const grupKars: Karsilastir = (a, z) => {
    const ya = grupYolu(a.kayit, b, g);
    const yz = grupYolu(z.kayit, b, g);
    if (ya.length === 0) return 0;
    const t = turSirasi.indexOf(ya[0]!) - turSirasi.indexOf(yz[0]!);
    if (t || ya.length < 2) return t;
    const ka = ya[1] === KATEGORISIZ ? 1 : 0;
    const kz = yz[1] === KATEGORISIZ ? 1 : 0;
    return ka - kz || metin(ya[1]).localeCompare(metin(yz[1]), 'tr');
  };
  const alan = siralama ? alanSirasi(siralama.alan, b) : null;
  const yon = siralama?.yon === 'azalan' ? -1 : 1;
  return liste
    .map((k, i) => ({ k, i }))
    .sort((a, z) => grupKars(a.k, z.k) || (alan ? yon * alan(a.k, z.k) : 0) || a.i - z.i)
    .map((s) => s.k);
}
