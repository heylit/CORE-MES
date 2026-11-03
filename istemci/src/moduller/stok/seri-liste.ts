import type { BakiyeSatiri, KodCozCevabi, SayimGovdesi, SeriSatiri, TasimaGovdesi } from '#paylasilan/sozlesme/stok.ts';
import { kodTuru } from '#paylasilan/kod-sozlugu.ts';
import { miktarDegistir, okutmaUygula, SAYIM_BASI, sayimGovdesi } from './okutarak-sayim.ts';

// Seri liste (1915): telefonda seçimsiz toplanan okutmalar bilgisayarda anlamlandırılır. Saf: satırlar ve kod çözümleri girer,
// öneri ve işin gövdeleri çıkar. Okutma sırası anlamlıdır: gözden sonra okutulanlar o gözündür (göz bloğu).
export type SeriTuru = 'goz' | 'lot' | 'malzeme' | 'raf' | 'kart' | 'is-emri' | 'bilinmiyor';
export const SERI_TURU_ADI: Readonly<Record<SeriTuru, string>> = {
  goz: 'Göz', lot: 'Lot', malzeme: 'Malzeme', raf: 'Raf', kart: 'Refakat kartı', 'is-emri': 'İş emri', bilinmiyor: 'Tanınmayan kod',
};
export function seriTuru(kod: string): SeriTuru {
  const t = kodTuru(kod).tur;
  return t === 'konum' ? 'goz' : t === 'refakat-partisi' ? 'kart' : t === 'uretim-emri' ? 'is-emri' : t === 'komut' ? 'bilinmiyor' : t;
}
// İşe verilebilen satır: sayılan etiket (lot, malzeme) ve henüz işlenmemiş.
export const secilebilir = (s: SeriSatiri): boolean => s.islendi === null && (seriTuru(s.kod) === 'lot' || seriTuru(s.kod) === 'malzeme');

export interface SeriBlogu { goz: SeriSatiri | null; satirlar: SeriSatiri[] }
export function seriBloklari(satirlar: readonly SeriSatiri[]): SeriBlogu[] {
  const bloklar: SeriBlogu[] = [{ goz: null, satirlar: [] }];
  for (const s of satirlar) {
    if (seriTuru(s.kod) === 'goz') bloklar.push({ goz: s, satirlar: [] });
    else bloklar[bloklar.length - 1]!.satirlar.push(s);
  }
  return bloklar.filter((b) => b.goz !== null || b.satirlar.length > 0);
}

type Coz = (kod: string) => KodCozCevabi | undefined;
export type Stoklu = Extract<KodCozCevabi, { tur: 'lot' | 'malzeme' }>;
const stoklu = (c: KodCozCevabi | undefined): Stoklu | null => (c && (c.tur === 'lot' || c.tur === 'malzeme') ? c : null);

// Öneri yalnız yol gösterir; iş seçilmeden hiçbir şey yazılmaz.
export function blokOnerisi(b: SeriBlogu, coz: Coz): string | null {
  const acik = b.satirlar.filter(secilebilir);
  const goz = b.goz ? coz(b.goz.kod) : undefined;
  if (!b.goz) return acik.length > 0 ? 'Göz okutulmadan: taşınacak yeri seç ya da depo sepetine ekle' : null;
  if (b.goz.islendi !== null && acik.length === 0) return null;
  if (acik.length === 0) return 'Boş göz: sayılırsa kayıttaki her şey 0 olur';
  if (!goz || goz.tur !== 'konum') return null;
  const hepsiBurada = acik.every((s) => stoklu(coz(s.kod))?.bakiyeler.some((x) => x.konumId === goz.konum.id) ?? false);
  return hepsiBurada ? 'Lotlar bu gözde kayıtlı: say' : 'Bir kısmı başka yerde kayıtlı: bu göze taşı';
}

export interface Atlanan { satirId: number; neden: string }
// Taşımanın kaynağı satırın tek yeridir: etiketin hedef dışındaki tek, statüsüz bakiyesi. Birden çok yer varsa hangisinden
// alındığı bilinmez; satır atlanır ve Otomatik modda tek tek taşınır.
export function tekKaynak(c: Stoklu, hedefKonumId: number): BakiyeSatiri | string {
  const yerler = c.bakiyeler.filter((b) => b.konumId !== hedefKonumId && Number(b.miktar) > 0);
  if (yerler.length === 0) return c.bakiyeler.some((b) => b.konumId === hedefKonumId) ? 'Zaten hedef gözde' : 'Stokta yok';
  if (yerler.length > 1) return `${yerler.length} yerde kayıtlı; hangisinden alındığı bilinmez`;
  if (yerler[0]!.statuId !== null) return 'Adım statüsündeki parça; Okut ile teslim et';
  return yerler[0]!;
}
export function tasimaPlani(satirlar: readonly SeriSatiri[], coz: Coz, hedefKonumId: number): { isler: { satirId: number; govde: TasimaGovdesi }[]; atlanan: Atlanan[] } {
  const isler: { satirId: number; govde: TasimaGovdesi }[] = [], atlanan: Atlanan[] = [];
  for (const s of satirlar) {
    const c = stoklu(coz(s.kod));
    if (!c) { atlanan.push({ satirId: s.id, neden: 'Kod çözülemedi' }); continue; }
    if (!(Number(s.adet) > 0)) { atlanan.push({ satirId: s.id, neden: 'Adet sıfır' }); continue; }
    const k = tekKaynak(c, hedefKonumId);
    if (typeof k === 'string') { atlanan.push({ satirId: s.id, neden: k }); continue; }
    isler.push({ satirId: s.id, govde: { malzemeId: c.ozet.id, kaynakKonumId: k.konumId, partiId: k.partiId, hedefKonumId, miktar: s.adet!, aciklama: 'Seri liste' } });
  }
  return { isler, atlanan };
}

// Göz bloğu kör sayımdır (Okutarak say ile aynı motor): satırlar sırayla uygulanır, adet listedekidir. Gözde kayıtlı olup
// listede olmayan satır 0 sayılır.
export function sayimPlani(b: SeriBlogu, secili: ReadonlySet<number>, coz: Coz): { govde: SayimGovdesi; satirIdler: number[]; atlanan: Atlanan[] } | { hata: string } {
  if (!b.goz) return { hata: 'Göz okutulmadan sayım olmaz' };
  const goz = coz(b.goz.kod);
  if (!goz || goz.tur !== 'konum') return { hata: 'Göz çözülemedi' };
  let d = okutmaUygula(SAYIM_BASI, b.goz.kod, goz).durum;
  const satirIdler = [b.goz.id], atlanan: Atlanan[] = [];
  for (const s of b.satirlar.filter((x) => secili.has(x.id) && secilebilir(x))) {
    const c = coz(s.kod);
    if (!c) { atlanan.push({ satirId: s.id, neden: 'Kod çözülemedi' }); continue; }
    const r = okutmaUygula(d, s.kod, c);
    if (r.sonuc.ton === 'hata') { atlanan.push({ satirId: s.id, neden: r.sonuc.baslik }); continue; }
    d = r.durum;
    const g = d.gozler[0]!;
    const st = stoklu(c)!;
    const i = g.satirlar.findIndex((x) => x.malzemeId === st.ozet.id && (st.tur !== 'lot' || x.partiId === st.parti.id));
    d = miktarDegistir(d, g.konumId, i, s.adet ?? '0');
    satirIdler.push(s.id);
  }
  return { govde: sayimGovdesi(d.gozler[0]!), satirIdler, atlanan };
}

export function csvMetni(satirlar: readonly SeriSatiri[], ad: (s: SeriSatiri) => string): string {
  const alan = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return ['Sıra;Kod;Tür;Ad;Adet;İşlendi', ...satirlar.map((s) => [String(s.sira), s.kod, SERI_TURU_ADI[seriTuru(s.kod)], ad(s), s.adet ?? '', s.islendi ?? ''].map(alan).join(';'))].join('\n');
}
