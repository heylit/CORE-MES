import { lazy } from 'react';
import type { KategoriAgaciTuru } from '#paylasilan/sozlesme/kategori-agaci-sabitleri.ts';
// Başka modül ekranlarının ithal edebildiği tek dosya.
// 1480: yerleşik kalitenin yoğunluğu (g/cm³) yalnız bu modülün kalite tablosundadır; tablo büyük olduğu için ilk istekte ayrı parça
// olarak yüklenir. Aile ya da kod tabloda yoksa ya da yoğunluk yazılı değilse null.
export async function yerlesikKaliteYogunlugu(aile: string, kod: string): Promise<number | null> {
  const { FAMS } = await import('./yeni/sabitler/index.ts');
  const a = FAMS[aile];
  if (a === undefined) return null;
  for (const sinif of Object.values(a.classes)) {
    const ro = sinif.grades.find((g) => g.kod === kod)?.p?.ro;
    if (typeof ro === 'number' && Number.isFinite(ro) && ro > 0) return ro;
  }
  return null;
}

// 3321-2: 3D Atölyesi Ham kartının Malzeme seçimi. Yerleşik kaliteler aile ve sınıf sırasıyla; sinif "aile/sinif" anahtarıdır (sunucunun
// kesme katsayısı tablosu bu anahtarla bakar). Yoğunluk yazılı değilse null. Tablo ilk istekte ayrı parça olarak yüklenir.
export interface KaliteSecenegi { aile: string; aileAdi: string; sinif: string; sinifAdi: string; kod: string; ad: string; yogunluk: number | null }
export async function yerlesikKaliteSecenekleri(): Promise<KaliteSecenegi[]> {
  const { FAMS } = await import('./yeni/sabitler/index.ts');
  return Object.entries(FAMS).flatMap(([aile, a]) => Object.entries(a.classes).flatMap(([sinif, c]) => c.grades.map((g) => {
    const ro = g.p?.ro;
    return {
      aile, aileAdi: a.ad, sinif: `${aile}/${sinif}`, sinifAdi: c.ad, kod: g.kod, ad: g.ad,
      yogunluk: typeof ro === 'number' && Number.isFinite(ro) && ro > 0 ? ro : null,
    };
  })));
}

// 2465 (2459 a): kategori ağacının "Malzemeler'de düzenle" bağlantısı, türün Malzeme ayarları bölümü. Hizmet grupları yerleşiktir,
// ayarda düzenlenmez: null (bağlantı çizilmez). Yol sabit yazılır; ekran parçalarını yüklememek için sekmeler ithal edilmez (test denetler).
export function kategoriAgaciDuzenleYolu(tur: KategoriAgaciTuru): string | null {
  const bolum = KATEGORI_DUZENLEME_BOLUMU[tur];
  return bolum === null ? null : `/malzemeler/ayarlar?${new URLSearchParams({ bolum }).toString()}`;
}
const KATEGORI_DUZENLEME_BOLUMU: Readonly<Record<KategoriAgaciTuru, string | null>> = { hammadde: 'aile', sarf: 'sarf', demirbas: 'db', hizmet: null };

// 3215 c: hammaddenin biçim ve ölçüsünden ölçülü kesit çizimi (mal kabul); çizim parçası ilk kullanımda yüklenir, Suspense içinde kullanılır.
export const MalzemeKesiti = lazy(() => import('./yeni/olcu-modeli/KesitGorunumu.tsx').then((m) => ({ default: m.KesitGorunumu })));

// 3706-2: hizmet, sarf ve demirbaş kartının türe özel alanları föyün satırlarıyla (grup, çeşit, yön, standart, çeşit alanları ...). Satın alma
// kartın kaydını sunucudan kısaltılmış alır; adlar ve görünür alanlar bu modülün tanımlarındandır. Parça ilk kullanımda yüklenir. Yerleşik
// tanımlarla kurulur (hizmet grupları zaten yerleşiktir); Ayarlar'da değiştirilmiş sarf ve demirbaş kategori adları bu satırlara yansımaz.
export interface KartKaydiKisaltmasi {
  tur: string; g: Record<string, unknown>; com: { ad: string | null; kod: string | null; birim: string | null; sertifika: string[] };
}
export async function kartAyrintiSatirlari(kart: KartKaydiKisaltmasi): Promise<{ ad: string; deger: string }[]> {
  const [{ kuralBaglami, foyVerisi }, { ortamKur }, { malzemeYetkisi }] = await Promise.all([
    import('./yeni/kurallar/index.ts'), import('./yeni/veri.ts'), import('./yeni/yetki.ts'),
  ]);
  const ortam = ortamKur({ surumler: { malzeme: null, operasyonlar: null, genel: null }, malzeme: null, operasyonlar: null, operasyonTipleri: [], genel: null, dortGoz: false, rol: '', ayarYazabilir: false } as never);
  const b = kuralBaglami({ ortam, kartlar: [], kisi: { id: 0, ad: '' }, birim: 'met', yetki: malzemeYetkisi(() => false, ortam) });
  const kayit = { tur: kart.tur, g: kart.g, bom: [], ops: [], opts: {}, ov: {}, extra: [], stds: [], com: { kod: kart.com.kod ?? '', ad: kart.com.ad ?? '', std: '', ted: '', birim: kart.com.birim ?? '', sertifika: kart.com.sertifika, not: '' }, onay: { durum: 'aktif' } };
  const kod = kart.com.kod ?? '';
  return foyVerisi(kayit as never, b).bolumler.flatMap((bolum) => bolum.satirlar)
    .filter((s) => s.deger.trim() !== '' && s.deger !== '—' && s.ad !== 'Kod' && s.ad !== 'Ad' && s.deger !== kod);
}
