import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OKUMA_VARSAYILANI, ayarDuzelt } from './kurallar.ts';

const pdf = vi.hoisted(() => ({ ac: vi.fn(), ciz: vi.fn(), birakilan: 0 }));
vi.mock('./pdf.ts', () => ({ pdfAc: pdf.ac, pdfCiz: pdf.ciz }));
vi.mock('./model.ts', () => ({ dosyaOzeti: async () => 'ozet1' }));

const { pdfHazirla, pdfKaydiAnahtari, saklananiAc } = await import('./pdf-hazir.ts');

// 4x2 piksellik sayfa: sol yarı siyah, sağ yarı beyaz; metin katmanı yok.
function sayfa() {
  const data = new Uint8ClampedArray(4 * 2 * 4).fill(255);
  for (const p of [0, 1, 4, 5]) data.set([0, 0, 0, 255], p * 4);
  return { w: 4, h: 2, img: { data, width: 4, height: 2 }, items: [], pages: 3, scale: 2, junk: false, ms: 5 };
}
const belge = (sayfaSayisi = 3) => ({ numPages: sayfaSayisi, loadingTask: { destroy: async () => { pdf.birakilan += 1; } } });
const ayar = ayarDuzelt(OKUMA_VARSAYILANI);

beforeEach(() => { pdf.ac.mockReset(); pdf.ciz.mockReset(); pdf.birakilan = 0; });

describe('hazır PDF okuması (731)', () => {
  it('yayında sayfa okunur, cihaz önbelleğiyle aynı anahtar ve biçimde döner; görüntü pakete girmez; belge bırakılır', async () => {
    pdf.ac.mockResolvedValue(belge()); pdf.ciz.mockResolvedValue(sayfa());
    const kayit = await pdfHazirla(new Uint8Array([1]), 2, ayar);
    expect(Object.keys(kayit)).toEqual([pdfKaydiAnahtari('ozet1', 2, ayar)]);
    expect(pdfKaydiAnahtari('ozet1', 2, ayar)).toBe('pdf:ozet1#2');
    const k = Object.values(kayit)[0]!;
    expect(k.png).toEqual({});
    expect(k.textless).toBe(true);
    expect(k.inkBits).toBeInstanceOf(Uint8Array);
    expect(pdf.ciz).toHaveBeenCalledWith(expect.anything(), 2, ayar);
    // Pakettenki kayıt görüntüleyicide aynı mürekkep haritasıyla açılır.
    expect(Array.from(saklananiAc(k)!.ink)).toEqual([1, 1, 0, 0, 1, 1, 0, 0]);
    expect(pdf.birakilan).toBe(1);
  });

  it('sayfa numarası belgenin sınırına çekilir', async () => {
    pdf.ac.mockResolvedValue(belge(1)); pdf.ciz.mockResolvedValue(sayfa());
    expect(Object.keys(await pdfHazirla(new Uint8Array([1]), 5, ayar))).toEqual(['pdf:ozet1#1']);
  });

  it('şifreli ya da okunamayan PDF yayını durdurmaz: hazır veri boş döner', async () => {
    pdf.ac.mockRejectedValue(new Error('PDF şifreli · şifre girilmedi'));
    expect(await pdfHazirla(new Uint8Array([1]), 1, ayar)).toEqual({});
    pdf.ac.mockResolvedValue(belge()); pdf.ciz.mockRejectedValue(new Error('çizilemedi'));
    expect(await pdfHazirla(new Uint8Array([1]), 1, ayar)).toEqual({});
    expect(pdf.birakilan).toBe(1);
  });

  it('biçimi tutmayan saklı kayıt yok sayılır', () => {
    for (const k of [null, undefined, {}, { w: 4, h: 2 }, { w: 4, h: 2, inkBits: [1] }, { w: 400, h: 2, inkBits: new Uint8Array(1) }]) expect(saklananiAc(k)).toBeNull();
    expect(saklananiAc({ w: 4, h: 2, inkBits: new Uint8Array([0b11001100]) })?.ink.length).toBe(8);
  });
});
