import { describe, expect, it, vi } from 'vitest';
import { KITAPLIK_KIMLIKLERI, sayfaKur } from './sayfa.ts';
import { KM_PAKETI } from './uygulama/paket.ts';

// Kullanıcı isteği 17.10.2026: forma eklenen fotoğraf kaydedilmeden önce küçültülür. Uygulama bunu zaten yapar (en uzun kenar
// 1600 piksel, JPEG; tarayıcıda 36 MB'lık fotoğraf 0,7 MB kaydedildi). Fotoğraf ortak dosya deposuna gider; kayıt yalnız dosya
// kimliğini taşır, gövde sınırına (1 MB) fotoğraf girmez. Uygulamanın addBelge işlevi kurulan sayfadan alınıp sahte nesnelerle koşturulur.
const kitapliklar = Object.fromEntries(KITAPLIK_KIMLIKLERI.map((k) => [k, ''])) as Parameters<typeof sayfaKur>[0]['kitapliklar'];
const sayfa = sayfaKur({ paket: KM_PAKETI, koken: 'http://localhost:4101', grafik: '', kitapliklar, kimlik: { kisi: { id: 7, ad: 'Deneme Kişi' }, yonetici: false, kisiler: [], onaylayabilir: false } });

function islev(ad: string): string {
  const bas = sayfa.indexOf(`async function ${ad}(`);
  const son = sayfa.indexOf('\n}\n', bas);
  if (bas < 0 || son < 0) throw new Error(`Sayfadan ayıklanamadı: ${ad}`);
  return sayfa.slice(bas, son + 2);
}

function kur(kucuk: { size: number; type: string }) {
  const yuklenen: unknown[] = [];
  const kayitlar: [string, Record<string, unknown>][] = [];
  const downscale = vi.fn(async () => kucuk);
  const toast = vi.fn();
  const ASSETS = { upload: async (b: unknown) => { yuklenen.push(b); return { id: 'dosya1' }; } };
  const addBelge = new Function('ASSETS', 'downscale', 'toast', 'save', 'TODAY', 'USER', 'ME', `${islev('addBelge')}; return addBelge;`)(
    ASSETS, downscale, toast, async (c: string, r: Record<string, unknown>) => { kayitlar.push([c, r]); return 'b1'; }, () => '2026-10-17', { ad: 'Deneme Kişi' }, {},
  ) as (f: { size: number; type: string; name: string }, m: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  return { addBelge, downscale, toast, yuklenen, kayitlar };
}

describe('Kalite Merkezi fotoğraf ekleme', () => {
  it('fotoğraf yüklenmeden önce küçültülür; depoya küçük hâli gider, kayıt yalnız dosya kimliğini taşır', async () => {
    const kucuk = { size: 700_000, type: 'image/jpeg' };
    const { addBelge, downscale, yuklenen, kayitlar } = kur(kucuk);
    const buyuk = { size: 36_000_000, type: 'image/png', name: 'foto.png' };
    const r = await addBelge(buyuk, { tur: 'Fotoğraf', bagli: { col: 'insp', id: 'i1' } });
    expect(downscale).toHaveBeenCalledWith(buyuk);
    expect(yuklenen).toEqual([kucuk]);
    expect(r).toMatchObject({ assetId: 'dosya1', mime: 'image/jpeg', boyut: 700_000 });
    expect(kayitlar).toHaveLength(1);
    expect(JSON.stringify(kayitlar[0]?.[1]).length).toBeLessThan(1000);
  });

  it('küçültülemeyen ve 20 MB\'ı aşan fotoğraf yüklenmez, kayıt yazılmaz', async () => {
    const { addBelge, toast, yuklenen, kayitlar } = kur({ size: 25 * 1024 * 1024, type: 'image/png' });
    expect(await addBelge({ size: 25 * 1024 * 1024, type: 'image/png', name: 'foto.png' }, {})).toBeNull();
    expect(toast).toHaveBeenCalledWith('Dosya 20 MB sınırını aşıyor.', 'bad');
    expect(yuklenen).toEqual([]);
    expect(kayitlar).toEqual([]);
  });

  it('küçültme en uzun kenarı 1600 piksele indirir ve JPEG yazar; SVG ve resim olmayan dosya olduğu gibi kalır', () => {
    const k = islev('downscale');
    expect(k).toContain('async function downscale(file,max=1600,q=0.82){');
    expect(k).toContain("file.type==='image/svg+xml')return file;");
    expect(k).toContain("c.toBlob(r,'image/jpeg',q)");
  });
});
