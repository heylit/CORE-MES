import type { AktarimSatiri, KonumDagilimi, TakimSatiri } from '#paylasilan/sozlesme/takimhane.ts';

// Saf iş kuralları (3613). Veritabanı ve zaman bilmez.
export type StokDurumu = 'sifir' | 'kritik' | 'yeterli' | 'esiksiz';

// Sipariş noktası girilmemişse (null) durum uydurulmaz: yalnız sıfır bilinir, gerisi "esiksiz" (tanımsız) sayılır.
export function stokDurumu(toplam: number, kritikSeviye: number | null): StokDurumu {
  if (toplam <= 0) return 'sifir';
  if (kritikSeviye === null) return 'esiksiz';
  return toplam <= kritikSeviye ? 'kritik' : 'yeterli';
}

// Stok konum türü -> takımhane konum grubu (bilemede/onarımda = fason). Başka türler (yolda, hurda...) gruba girmez.
export function konumGrubu(tur: string): keyof KonumDagilimi | null {
  switch (tur) {
    case 'raf_gozu': return 'raf';
    case 'istasyon': return 'tezgah';
    case 'kisi': return 'kisi';
    case 'fason': return 'bileme';
    case 'ara_alan': return 'ara';
    default: return null;
  }
}

export const bosDagilim = (): KonumDagilimi => ({ raf: null, tezgah: null, kisi: null, bileme: null, ara: null });

export function dagilimaEkle(d: KonumDagilimi, grup: keyof KonumDagilimi, adet: number): void {
  d[grup] = (d[grup] ?? 0) + adet;
}

// Toplam, konumların toplamıdır; hurda dahil değildir (hurda konum grubu yok).
export const dagilimToplami = (d: KonumDagilimi): number => (d.raf ?? 0) + (d.tezgah ?? 0) + (d.kisi ?? 0) + (d.bileme ?? 0) + (d.ara ?? 0);

export const kritikMi = (t: Pick<TakimSatiri, 'toplam' | 'kritikSeviye'>): boolean => stokDurumu(t.toplam, t.kritikSeviye) === 'kritik';

// Takım kartı: katalog kartının stok kodu TKM ile başlar (varsayım; kategori bu işte tanımlanmaz).
export const takimKoduMu = (kod: string): boolean => /^TKM/i.test(kod.trim());

const SADE = (m: string): string => m.trim().replace(/\s+/g, ' ');

// Başlangıç stoğu ön izlemesi: bulgu satır satır görünür, hiçbir şey kendiliğinden toplanmaz (aynı kod iki satırsa ikisi de işaretlenir).
// Uygun: hiçbir satırda karar bekleyen bulgu yok. Bulgular yazmayı engeller; "bosluk" yazımda temizlenir ve engellemez.
export function aktarimOnizle(satirlar: readonly { kod: string; ad: string; kategori: string | null; adet: number; rafKodu: string | null }[]): { satirlar: AktarimSatiri[]; uygun: boolean } {
  const sayac = new Map<string, number>();
  for (const s of satirlar) {
    const k = SADE(s.kod).toLocaleUpperCase('tr-TR');
    sayac.set(k, (sayac.get(k) ?? 0) + 1);
  }
  let uygun = true;
  const sonuc = satirlar.map((s, i): AktarimSatiri => {
    const kod = SADE(s.kod);
    let bulgu: AktarimSatiri['bulgu'] = null;
    let karar: string | null = null;
    if ((sayac.get(kod.toLocaleUpperCase('tr-TR')) ?? 0) > 1) {
      bulgu = 'yinelenen-kod'; karar = 'Aynı kod birden çok satırda; elle tek satıra indirilir (toplanmaz).'; uygun = false;
    } else if (s.kategori === null || s.kategori.trim() === '') {
      bulgu = 'bos-kategori'; karar = 'Kategori seçilir.'; uygun = false;
    } else if (kod !== s.kod || SADE(s.ad) !== s.ad) {
      bulgu = 'bosluk'; karar = 'Baştaki, sondaki ve çift boşluk temizlenir.';
    }
    return { satir: i + 1, kod, ad: SADE(s.ad), kategori: s.kategori === null ? null : s.kategori.trim() || null, adet: s.adet, rafKodu: s.rafKodu, bulgu, karar };
  });
  return { satirlar: sonuc, uygun };
}
