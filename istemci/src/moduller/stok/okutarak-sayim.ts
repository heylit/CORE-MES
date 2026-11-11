import type { BakiyeSatiri, KodCozCevabi, SayimGovdesi } from '#paylasilan/sozlesme/stok.ts';
import { kodTuru } from '#paylasilan/kod-sozlugu.ts';

// Okutarak sayım (1905): göz okutulur, sonra o gözün lot ya da malzeme etiketleri. Kör sayımdır (1279 a): gözün sistem satırları
// yalnız hangi satırın okutulmadığını bulmak için tutulur, miktarları ekrana çıkmaz. Saf: okutmanın çözümünü duruma uygular.

export interface SayimSatiri { malzemeId: number; malzemeAd: string | null; partiId: number | null; partiEtiketi: string | null; birim: string | null; miktar: string; elle: boolean }
export interface SayilanGoz { konumId: number; kod: string; sistem: { malzemeId: number; partiId: number | null }[]; satirlar: SayimSatiri[] }
export interface SayimDurumu { gozler: SayilanGoz[]; acik: number | null }
export const SAYIM_BASI: SayimDurumu = { gozler: [], acik: null };
export type SonucTonu = 'tamam' | 'uyari' | 'hata';
export interface OkutmaSonucu { ton: SonucTonu; baslik: string; alt: string }

const anahtar = (malzemeId: number, partiId: number | null) => `${malzemeId}|${partiId ?? ''}`;

// Adet birimli malzemede her okutma bir sayılır; kg, metre gibi birimde okutma satırı açar, miktar elle yazılır (1905 onayı).
export function adetMi(birim: string | null): boolean {
  return birim !== null && ['adet', 'ad', 'ad.'].includes(birim.trim().toLocaleLowerCase('tr'));
}

function satirEkle(goz: SayilanGoz, s: Omit<SayimSatiri, 'miktar' | 'elle'>): { goz: SayilanGoz; satir: SayimSatiri } {
  const elle = !adetMi(s.birim);
  const var_ = goz.satirlar.find((x) => anahtar(x.malzemeId, x.partiId) === anahtar(s.malzemeId, s.partiId));
  const satir: SayimSatiri = var_
    ? { ...var_, miktar: elle ? var_.miktar : String(Number(var_.miktar || '0') + 1) }
    : { ...s, elle, miktar: elle ? '' : '1' };
  const satirlar = var_ ? goz.satirlar.map((x) => (x === var_ ? satir : x)) : [...goz.satirlar, satir];
  return { goz: { ...goz, satirlar }, satir };
}

const sonuc = (ton: SonucTonu, baslik: string, alt: string): OkutmaSonucu => ({ ton, baslik, alt });

export function okutmaUygula(d: SayimDurumu, kod: string, c: KodCozCevabi): { durum: SayimDurumu; sonuc: OkutmaSonucu } {
  if (c.tur === 'konum') {
    const var_ = d.gozler.find((g) => g.konumId === c.konum.id);
    const sistem = c.bakiyeler.map((b: BakiyeSatiri) => ({ malzemeId: b.malzemeId, partiId: b.partiId }));
    const gozler = var_ ? d.gozler : [...d.gozler, { konumId: c.konum.id, kod: c.konum.kod, sistem, satirlar: [] }];
    return { durum: { gozler, acik: c.konum.id }, sonuc: sonuc('tamam', `Göz ${c.konum.kod}`, 'Şimdi bu gözdeki lot ya da malzeme etiketlerini okut.') };
  }
  // Raf etiketi stok yeri değildir ve bu çözücüde tanınmaz; sayım gözün etiketiyle yapılır.
  if (c.tur === 'bilinmiyor') {
    const t = kodTuru(kod);
    if (t.tur === 'raf') return { durum: d, sonuc: sonuc('uyari', `Raf ${t.deger}`, 'Raf etiketi; sayım gözün etiketiyle yapılır, rafın gözündeki etiketi okut.') };
  }
  if (c.tur === 'bilinmiyor') return { durum: d, sonuc: sonuc('hata', 'Tanınmayan kod', `${kod}: sayımda göz, lot ya da malzeme etiketi okutulur.`) };
  const goz = d.gozler.find((g) => g.konumId === d.acik);
  if (!goz) return { durum: d, sonuc: sonuc('hata', 'Önce göz etiketini okut', `${kod} hangi göze yazılacağı bilinmediği için eklenmedi.`) };
  let partiId: number | null;
  let partiEtiketi: string | null;
  if (c.tur === 'lot') {
    partiId = c.parti.id;
    partiEtiketi = c.parti.etiket;
  } else {
    // Malzeme etiketi partiyi söylemez: gözde o malzemenin tek partisi varsa ona sayılır; birden çoksa hangisi olduğu bilinmez.
    const partiler = [...new Set(goz.sistem.filter((s) => s.malzemeId === c.ozet.id).map((s) => s.partiId))];
    if (partiler.length > 1) return { durum: d, sonuc: sonuc('hata', 'Lot etiketini okut', `${c.ozet.ad ?? c.ozet.kod}: bu gözde birden çok partisi var; hangisi olduğu malzeme etiketinden bilinmez.`) };
    partiId = partiler[0] ?? null;
    partiEtiketi = null;
  }
  const { goz: yeni, satir } = satirEkle(goz, { malzemeId: c.ozet.id, malzemeAd: c.ozet.ad ?? c.ozet.kod, partiId, partiEtiketi, birim: c.ozet.birim });
  const durum = { ...d, gozler: d.gozler.map((g) => (g === goz ? yeni : g)) };
  const ad = satir.malzemeAd ?? `Kart ${satir.malzemeId}`;
  const yer = `Göz ${goz.kod}${partiEtiketi ? ` · parti ${partiEtiketi}` : ''}`;
  return { durum, sonuc: satir.elle ? sonuc('uyari', `${ad}: miktarı yaz`, `${yer} · ${satir.birim ?? 'birimsiz'} birimde okutma sayılmaz.`) : sonuc('tamam', `${ad}: ${satir.miktar} ${satir.birim ?? ''}`.trim(), yer) };
}

export function miktarDegistir(d: SayimDurumu, konumId: number, sira: number, miktar: string): SayimDurumu {
  return { ...d, gozler: d.gozler.map((g) => (g.konumId !== konumId ? g : { ...g, satirlar: g.satirlar.map((s, i) => (i === sira ? { ...s, miktar } : s)) })) };
}

// Sayılan gözde sistemde olup okutulmayan satır 0 sayılır (1905 onayı); kayıttan önce sayısı gösterilir.
export function okutulmayanlar(g: SayilanGoz): { malzemeId: number; partiId: number | null }[] {
  const sayilan = new Set(g.satirlar.map((s) => anahtar(s.malzemeId, s.partiId)));
  const gorulen = new Set<string>();
  return g.sistem.filter((s) => {
    const k = anahtar(s.malzemeId, s.partiId);
    if (sayilan.has(k) || gorulen.has(k)) return false;
    gorulen.add(k);
    return true;
  });
}

const MIKTAR = /^\d{1,11}([.,]\d{1,3})?$/;
export const eksikMiktar = (g: SayilanGoz): SayimSatiri[] => g.satirlar.filter((s) => !MIKTAR.test(s.miktar.trim()));

export function sayimGovdesi(g: SayilanGoz): SayimGovdesi {
  return {
    konumId: g.konumId,
    satirlar: [
      ...g.satirlar.map((s) => ({ malzemeId: s.malzemeId, partiId: s.partiId, sayilanMiktar: s.miktar.trim().replace(',', '.') })),
      ...okutulmayanlar(g).map((s) => ({ malzemeId: s.malzemeId, partiId: s.partiId, sayilanMiktar: '0' })),
    ],
  };
}

// Okuyucunun hafızasından aktarılan metin: her okutma bir satırdır (okuyucu her kodun sonunda Enter basar).
export const aktarimKodlari = (metin: string): string[] => metin.split(/\r?\n|\r/).map((x) => x.trim()).filter((x) => x !== '');
