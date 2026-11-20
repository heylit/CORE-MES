import type { LogoCariListeSatiri, LogoCariSatiri, LogoCariTopluGovdesi } from '#paylasilan/sozlesme/musteri-tedarikci.ts';

// Logo geçişi cariler sekmesi (3343, 3474-1): satırın durumu Logo'dan okunan kartın eşleşmesinden çıkar; sunucu aynı kuralları komutta yeniden uygular.
export type CariDurumu = 'bagli' | 'baglanabilir' | 'yeni' | 'eslesik' | 'alinamaz' | 'pasif';

// Sıra önemlidir: kodu CORE'a sığmayan cari hiçbir şekilde işlenmez; Logo kaydıyla bağlı olan pasif olsa da bağlı görünür.
// Logo'da kullanım dışı cari toplu işe girmez; gerekiyorsa Müşteriler ve Tedarikçiler'den tek tek alınır.
export function cariDurumu(c: LogoCariSatiri): CariDurumu {
  if (c.alinamaz !== null) return 'alinamaz';
  const e = c.eslesme;
  if (e?.neden === 'kayit-no') return 'bagli';
  if (!c.aktif) return 'pasif';
  if (e === null) return 'yeni';
  return e.baglanabilir ? 'baglanabilir' : 'eslesik';
}

export const ATLAMA_NEDENI: Record<Exclude<CariDurumu, 'baglanabilir' | 'yeni'>, string> = {
  bagli: 'Zaten bağlı',
  eslesik: 'CORE firması başka cariye bağlı ya da Logo cari kodu farklı',
  alinamaz: 'Kodu CORE\'a sığmıyor',
  pasif: 'Logo\'da kullanım dışı',
};

// 3474-1: tam listede satırın işlemi. Öneri durumdan gelir (yeni -> al, bağlanabilir -> tek adaya bağla); kullanıcı satırda değiştirir.
export type CariIslemi = { tur: 'al' } | { tur: 'bagla'; firmaId: number; surum: number } | { tur: 'atla' };
export const islemDegeri = (i: CariIslemi): string => (i.tur === 'bagla' ? `bagla:${i.firmaId}` : i.tur);

export function oneriIslemi(s: LogoCariListeSatiri): CariIslemi | null {
  if (s.durum === 'yeni') return { tur: 'al' };
  const a = s.adaylar[0];
  if (s.durum === 'baglanabilir' && a) return { tur: 'bagla', firmaId: a.firmaId, surum: a.surum };
  return null;
}

// Satırın seçenekleri: bağlanabilir her aday ayrı seçenektir; adayı olan cari için yeni firma açılmaz (sunucu da reddeder).
export function islemSecenekleri(s: LogoCariListeSatiri): { deger: string; baslik: string; islem: CariIslemi }[] {
  if (s.durum === 'bagli' || s.durum === 'alinamaz') return [];
  const bagla = s.adaylar.filter((a) => a.baglanabilir).map((a) => ({
    deger: `bagla:${a.firmaId}`, baslik: `Bağla: ${a.kod ?? a.ad}`, islem: { tur: 'bagla' as const, firmaId: a.firmaId, surum: a.surum },
  }));
  const ac = s.adaylar.length === 0 ? [{ deger: 'al', baslik: 'Yeni firma aç', islem: { tur: 'al' as const } }] : [];
  if (bagla.length + ac.length === 0) return [];
  return [...ac, ...bagla, { deger: 'atla', baslik: 'Atla', islem: { tur: 'atla' } }];
}

export interface OnKontrolSatiri { kod: string; ad: string | null; islem: 'al' | 'bagla' | 'atla'; karsilik: string | null; neden: string | null }
export interface OnKontrolPlani { govde: LogoCariTopluGovdesi; satirlar: OnKontrolSatiri[] }

// Ön kontrol: seçilen cariler Logo'dan okunduktan sonra (vergi no dahil) bugünkü eşleşmeyle yeniden bakılır. Okunamayan, bağlı, Logo'da
// pasif ya da CORE'da zaten olan cari atlanır ve nedeni yazılır; komut yalnız kalanları taşır. Sunucu aynı kuralları komutta yeniden uygular.
export function onKontrolPlani(
  secim: ReadonlyMap<string, CariIslemi>, okunan: readonly LogoCariSatiri[], okunamayan: readonly { kod: string; ileti: string }[],
): OnKontrolPlani {
  const kartlar = new Map(okunan.map((c) => [c.kod.toUpperCase(), c]));
  const hatalar = new Map(okunamayan.map((o) => [o.kod.toUpperCase(), o.ileti]));
  const bagla: LogoCariTopluGovdesi['bagla'] = [];
  const al: LogoCariTopluGovdesi['al'] = [];
  const satirlar: OnKontrolSatiri[] = [];
  for (const [kod, islem] of secim) {
    if (islem.tur === 'atla') continue;
    const c = kartlar.get(kod.toUpperCase());
    const atla = (neden: string, ad: string | null = c?.ad ?? null) => satirlar.push({ kod, ad, islem: 'atla', karsilik: null, neden });
    if (!c) { atla(hatalar.get(kod.toUpperCase()) ?? 'Logo\'dan okunamadı.'); continue; }
    const d = cariDurumu(c);
    if (d === 'alinamaz' || d === 'pasif' || d === 'bagli') { atla(ATLAMA_NEDENI[d]); continue; }
    const e = c.eslesme;
    if (islem.tur === 'al') {
      if (e !== null) {
        atla(`CORE'da var: ${e.kod ?? ''} ${e.ad} (${ESLESME_ADI[e.neden]}). Yeni firma açılmaz; bağlayın.`.replace('  ', ' '));
        continue;
      }
      al.push({ logoKodu: c.kod });
      satirlar.push({ kod: c.kod, ad: c.ad, islem: 'al', karsilik: `Kod ${c.kod} · ${TUR_ADI[c.oneri.tur]}`, neden: null });
      continue;
    }
    bagla.push({ logoKodu: c.kod, firmaId: islem.firmaId, surum: islem.surum });
    satirlar.push({ kod: c.kod, ad: c.ad, islem: 'bagla', karsilik: e && e.firmaId === islem.firmaId ? `${e.kod ?? ''} ${e.ad}`.trim() : null, neden: null });
  }
  return { govde: { bagla, al }, satirlar };
}

const ESLESME_ADI: Record<LogoCariSatiri['eslesme'] extends infer E ? E extends { neden: infer N } ? N & string : never : never, string> = {
  'kayit-no': 'Logo kaydıyla bağlı', 'cari-kodu': 'aynı Logo cari kodu', kod: 'aynı kod', 'vergi-no': 'aynı vergi no',
};
const TUR_ADI = { musteri: 'müşteri', tedarikci: 'tedarikçi', ikisi: 'müşteri ve tedarikçi' } as const;
