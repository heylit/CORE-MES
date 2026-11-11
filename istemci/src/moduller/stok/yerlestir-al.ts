import type { KodCozCevabi, TasimaGovdesi } from '#paylasilan/sozlesme/stok.ts';
import { kodTuru } from '#paylasilan/kod-sozlugu.ts';
import type { OkutmaSonucu } from './okutarak-sayim.ts';
import { tekKaynak, type Stoklu } from './seri-liste.ts';

// Yerleştir (1916): önce göz, sonra o göze konanlar; Kaydet her satırı tek kaynağından göze taşır (POST /stok/tasima). Saf.
// Lot satırı kaynaktaki miktarın tamamıyla gelir (mal kabulden rafa bütün lot konur); partisiz malzeme her okutmada bir artar.
export interface YerSatiri {
  kod: string; ad: string; malzemeId: number; partiId: number | null; kaynakKonumId: number | null; kaynakKod: string | null;
  miktar: string; lot: boolean; neden: string | null;
}
export interface YerlestirDurumu { goz: { id: number; kod: string } | null; satirlar: YerSatiri[] }
export const YERLESTIR_BASI: YerlestirDurumu = { goz: null, satirlar: [] };

const ad = (c: Stoklu): string => (c.tur === 'lot' ? `${c.ozet.ad ?? c.ozet.kod} · ${c.parti.etiket}` : c.ozet.ad ?? c.ozet.kod);
const artir = (m: string, n: number): string => String(Math.max(0, Math.round((Number(m) + n) * 1000) / 1000));

export function yerlestirOkut(d: YerlestirDurumu, kod: string, c: KodCozCevabi): { durum: YerlestirDurumu; sonuc: OkutmaSonucu } {
  if (c.tur === 'konum') {
    if (d.satirlar.length > 0 && d.goz?.id !== c.konum.id) return { durum: d, sonuc: { ton: 'uyari', baslik: 'Önce bu gözü kaydet', alt: `${d.satirlar.length} satır ${d.goz?.kod ?? ''} gözüne bekliyor; Kaydet ya da sil.` } };
    return { durum: { ...d, goz: { id: c.konum.id, kod: c.konum.kod } }, sonuc: { ton: 'tamam', baslik: `Göz ${c.konum.kod}`, alt: 'Şimdi bu göze konanları okut.' } };
  }
  // Raf etiketi stok yeri değildir ve bu çözücüde tanınmaz; kullanıcıya gözü okutması söylenir.
  const t = kodTuru(kod);
  if (t.tur === 'raf') return { durum: d, sonuc: { ton: 'uyari', baslik: `Raf ${t.deger}`, alt: 'Raf etiketi; rafın gözündeki etiketi okut.' } };
  if (c.tur !== 'lot' && c.tur !== 'malzeme') return { durum: d, sonuc: { ton: 'hata', baslik: 'Göz, lot ya da malzeme okut', alt: kod } };
  if (!d.goz) return { durum: d, sonuc: { ton: 'uyari', baslik: 'Önce gözü okut', alt: 'Bu modda ilk adım: göz' } };
  const i = d.satirlar.findIndex((s) => s.malzemeId === c.ozet.id && (c.tur === 'lot' ? s.lot && s.partiId === c.parti.id : !s.lot));
  if (i >= 0) {
    const s = d.satirlar[i]!;
    if (s.lot) return { durum: d, sonuc: { ton: 'uyari', baslik: 'Bu lot zaten listede', alt: 'Miktarı satırdan değiştir.' } };
    const satirlar = d.satirlar.map((x, n) => (n === i ? { ...x, miktar: artir(x.miktar, 1) } : x));
    return { durum: { ...d, satirlar }, sonuc: { ton: 'tamam', baslik: s.ad, alt: `Miktar ${satirlar[i]!.miktar}` } };
  }
  const k = tekKaynak(c, d.goz.id);
  const satir: YerSatiri = {
    kod, ad: ad(c), malzemeId: c.ozet.id, lot: c.tur === 'lot',
    // Malzeme etiketinde parti kaynaktan gelir: tek yerdeki bakiye hangi partiyse odur.
    partiId: c.tur === 'lot' ? c.parti.id : typeof k === 'string' ? null : k.partiId,
    kaynakKonumId: typeof k === 'string' ? null : k.konumId, kaynakKod: typeof k === 'string' ? null : k.konumKod,
    miktar: typeof k === 'string' || c.tur !== 'lot' ? '1' : k.miktar, neden: typeof k === 'string' ? k : null,
  };
  return {
    durum: { ...d, satirlar: [...d.satirlar, satir] },
    sonuc: satir.neden ? { ton: 'uyari', baslik: satir.ad, alt: `${satir.neden}; kaydedilmez` } : { ton: 'tamam', baslik: satir.ad, alt: `${satir.kaynakKod ?? ''} → ${d.goz.kod}` },
  };
}

export function yerlestirMiktar(d: YerlestirDurumu, sira: number, miktar: string): YerlestirDurumu {
  return { ...d, satirlar: d.satirlar.map((s, n) => (n === sira ? { ...s, miktar } : s)) };
}
export const yerlestirArtir = (d: YerlestirDurumu, n: number): YerlestirDurumu =>
  (d.satirlar.length === 0 ? d : yerlestirMiktar(d, d.satirlar.length - 1, artir(d.satirlar.at(-1)!.miktar, n)));
export const yerlestirGeriAl = (d: YerlestirDurumu): YerlestirDurumu =>
  (d.satirlar.length > 0 ? { ...d, satirlar: d.satirlar.slice(0, -1) } : { ...d, goz: null });

const MIKTAR = /^\d{1,11}(\.\d{1,3})?$/;
export function yerlestirGovdeleri(d: YerlestirDurumu): { govdeler: { sira: number; govde: TasimaGovdesi }[]; atlanan: number } {
  const govdeler: { sira: number; govde: TasimaGovdesi }[] = [];
  let atlanan = 0;
  d.satirlar.forEach((s, sira) => {
    const m = s.miktar.trim().replace(',', '.');
    if (!d.goz || s.kaynakKonumId === null || !MIKTAR.test(m) || !(Number(m) > 0)) { atlanan += 1; return; }
    govdeler.push({ sira, govde: { malzemeId: s.malzemeId, kaynakKonumId: s.kaynakKonumId, partiId: s.partiId, hedefKonumId: d.goz.id, miktar: m, aciklama: 'Yerleştir' } });
  });
  return { govdeler, atlanan };
}

// Al (1916): malzeme ya da lot etiketi "ne", geri kalan her etiket "nereden" (istasyon ya da yer). Yeni malzeme okutulunca yer korunur.
export interface AlKodlari { kod: string; yerKodu: string }
export function alOkutmasi(k: AlKodlari, ham: string): AlKodlari {
  const t = kodTuru(ham).tur;
  return t === 'lot' || t === 'malzeme' ? { ...k, kod: ham.trim() } : { ...k, yerKodu: ham.trim() };
}
