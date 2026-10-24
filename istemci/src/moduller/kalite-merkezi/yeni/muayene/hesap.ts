import { aqlMetni, aqlPlani } from '../aql.ts';
import { rozetTonu } from '../bicim.ts';
import { karakteristikSonucu, sonucTonu as kuralTonu } from '../kurallar.ts';
import { FAI_CHK, GIRIS_CHK, INSP_TUR } from '../sabitler.ts';
import type { Karakteristik, KmAyarlari, Muayene } from '../tipler.ts';

// `satirlar` formdaki düzenlenen tablo (boş satırlar dahil); kayda `chars` olarak, boş satırlar düşerek girer.
// Uygulamanın muayene gövdesinde K0 tipinde adı geçmeyen alanlar da vardır (numune planı metni, not, ölçüme başlanan resim).
export const FAI_KAPSAM = ['Tam FAI', 'Kısmi FAI (yalnız değişen karakteristikler)'] as const;

export type MuayeneDegeri = Partial<Muayene> & { satirlar?: Karakteristik[]; aqlPlan?: string; not?: string; cizimId?: string };

export const satirDolu = (c: Karakteristik) => !!(c.ad ?? '').trim();

const belgeEksik = (d: MuayeneDegeri) =>
  (d.tur === 'Giriş' && (d.gchk ?? []).length < GIRIS_CHK.length) || (d.tur === 'FAI' && (d.fchk ?? []).length < FAI_CHK.length);

// Uygulamadaki toplama: boş satırlar düşer, her karakteristiğin sonucu toleranstan hesaplanır, muayene sonucu çıkar.
// Ret: bir karakteristik uygun değil. Beklemede: belge kontrolü eksik. Devam ediyor: sonuç eksik.
export function muayeneTopla(d: MuayeneDegeri): MuayeneDegeri {
  const chars = (d.satirlar ?? d.chars ?? []).filter(satirDolu).map((c) => ({ ...c, ad: (c.ad ?? '').trim(), sonuc: karakteristikSonucu(c) }));
  const nok = chars.some((c) => c.sonuc === 'NOK');
  const sonuc = !chars.length || chars.some((c) => !c.sonuc) ? 'Devam ediyor' : nok ? 'Ret' : belgeEksik(d) ? 'Beklemede' : 'Kabul';
  // Uygulamada belge kontrolü alanları her türde formdadır; kayda boş da olsa yazılır.
  return {
    ...d, chars, sonuc, not: (d.not ?? '').trim(), aqlPlan: d.aqlPlan ?? '',
    gchk: d.gchk ?? [], fchk: d.fchk ?? [], faiNeden: d.faiNeden ?? '', faiKapsam: d.faiKapsam || FAI_KAPSAM[0],
  };
}

export interface Eksik { metin: string; adim: number; alan?: string }

// Kontrol adımında listelenen eksikler; adım numaraları formdaki sıradır (0 parça, 1 belge, 2 ölçüm).
export function muayeneEksikleri(d: MuayeneDegeri): Eksik[] {
  const ch = d.chars ?? [];
  const e: Eksik[] = [];
  if (!ch.length) e.push({ metin: 'En az bir karakteristik girin', adim: 2 });
  if (ch.some((c) => !c.sonuc)) e.push({ metin: 'Bazı karakteristiklerin ölçüm sonucu eksik', adim: 2 });
  if (ch.some((c) => !c.cihaz && c.tip !== 'Nitel')) e.push({ metin: 'Değişken ölçümlerde cihaz seçilmemiş', adim: 2 });
  if (d.tur === 'Giriş' && (d.gchk ?? []).length < GIRIS_CHK.length) {
    e.push({ metin: `Belge kontrolünde ${GIRIS_CHK.length - (d.gchk ?? []).length} madde işaretsiz: sonuç "Beklemede" olur`, adim: 1 });
  }
  if (d.tur === 'FAI' && (d.fchk ?? []).length < FAI_CHK.length) e.push({ metin: 'AS9102 form kontrolleri tamamlanmadı: sonuç "Beklemede" olur', adim: 1 });
  return e;
}

export function kayitGovdesi(d: MuayeneDegeri): Partial<Muayene> {
  const { satirlar: _, ...govde } = d;
  return govde;
}

// Kaydetmeyi durduran kurallar (uygulamadaki sıra ve iletiler). Geçersiz cihaz yalnız yeni kayıtta durdurur.
export function kayitEngeli(d: MuayeneDegeri, yeni: boolean, cihazGecerli: (kimlik: string) => boolean): string | null {
  const ch = d.chars ?? [];
  if (!ch.length) return 'En az bir karakteristik girin.';
  if (yeni && ch.some((c) => c.cihaz && !cihazGecerli(c.cihaz))) return 'Kalibrasyonu geçersiz cihazla ölçüm kaydedilemez.';
  if (ch.some((c) => !c.cihaz && c.tip !== 'Nitel')) return 'Değişken karakteristiklerin her biri için ölçüm cihazı seçin.';
  if (ch.some((c) => !c.sonuc)) return 'Tüm karakteristikler için ölçüm sonucunu girin.';
  if (d.tur === 'FAI' && !d.faiNeden) return 'FAI nedenini seçin.';
  return null;
}

// Kayıtta önceki çok ölçümlü değerler (stüdyodan gelen) tek değer değişmediyse korunur.
export function olcumleriKoru(chars: readonly Karakteristik[], onceki: readonly Karakteristik[] | undefined): Karakteristik[] {
  return chars.map((c) => {
    const pv = (onceki ?? []).find((p) => p.balon && p.balon === c.balon);
    return pv?.olcumler && pv.olcum === c.olcum ? { ...c, olcumler: pv.olcumler } : c;
  });
}

export function aqlIleNumune(miktar: unknown, ayarlar: KmAyarlari): { numune: number; metin: string } | null {
  const lvl = ayarlar.seviye || 'II';
  const mj = ayarlar.major || '1.0';
  const p = aqlPlani(Number(miktar), lvl, mj, 'Normal');
  if (!p) return null;
  return { numune: p.n, metin: `Seviye ${lvl}, AQL ${aqlMetni(mj)} (majör), kod ${p.kodK}, n ${p.n}, Ac ${p.ac} / Re ${p.re}` };
}

export const muayeneSirasi = (liste: readonly Muayene[]): Muayene[] => [...liste].sort((a, b) => (b.tarih ?? '').localeCompare(a.tarih ?? ''));
export const muayeneAranan = (i: Muayene): string => [i.no, i.parcaNo, i.parcaAdi, i.lot, i.muayeneci].join(' ');

// Kapı bazında ilk geçiş oranı: tür başına kabul / toplam (yüzde, tam sayı); kaydı olmayan kapı 0 değil boş.
export function ilkGecis(liste: readonly Muayene[]): { tur: string; oran: number | null }[] {
  return INSP_TUR.map((t) => {
    const a = liste.filter((i) => i.tur === t);
    return { tur: t, oran: a.length ? Math.round((100 * a.filter((i) => i.sonuc === 'Kabul').length) / a.length) : null };
  });
}

export function ncrKaynagi(tur?: string): string {
  return tur === 'Giriş' ? 'Giriş muayene' : tur === 'FAI' ? 'FAI' : tur === 'Final' ? 'Final muayene' : 'Proses muayene';
}

// Ret çıkan yeni muayeneden açılan NCR'nin ön değerleri.
export function retNcrOnDegeri(d: MuayeneDegeri): Record<string, unknown> {
  const liste = (d.chars ?? []).filter((c) => c.sonuc === 'NOK')
    .map((c) => `${c.ad}: ölçülen ${c.olcum}${c.tip !== 'Nitel' ? ` (nominal ${c.nominal} −${c.alt || 0}/+${c.ust || 0})` : ''}`).join('; ');
  return {
    kaynak: ncrKaynagi(d.tur), parcaNo: d.parcaNo, parcaAdi: d.parcaAdi, rev: d.rev, lot: d.lot, miktar: d.miktar, tedarikci: d.tedarikci,
    hataTipi: 'Boyutsal', tanim: `${d.no} muayenesinde ret: ${liste}`,
  };
}

export const sonucTonu = (s?: string) => rozetTonu(kuralTonu(s));
