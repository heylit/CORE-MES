import { describe, expect, it } from 'vitest';
import { SAYFALAR } from '#paylasilan/sayfalar.ts';
import { GENEL_KONULAR } from './rehber-genel.ts';
import { IKINCI_MENU_TANIMLARI } from './ikinci-menu.ts';
import { rehberAra, rehberMaddeleri, rehberleriTopla, sayfaRehberleri, type SayfaRehberi } from './rehber.ts';

const tarif = (yol: string): SayfaRehberi => ({ yol, ozet: 'Özet.', nasil: ['Bir adım.'], sinirlar: [] });
const tumIslemler = [...new Set(IKINCI_MENU_TANIMLARI.flatMap((m) => m.gruplar.flatMap((g) => g.maddeler.flatMap((md) => [md.islem, ...(md.veya ?? [])]))))];

describe('rehberleriTopla', () => {
  it('modullerin tarifleri yuklenir; her biri kayitli bir sayfaya aittir', () => {
    expect(sayfaRehberleri.length).toBeGreaterThan(0);
    const yollar = new Set(SAYFALAR.map((s) => s.yol as string));
    for (const r of sayfaRehberleri) expect(yollar.has(r.yol), r.yol).toBe(true);
  });

  it('sayfa olmayan yolu, ayni sayfaya iki tarifi, bos ozeti ve adimsiz tarifi reddeder', () => {
    expect(() => rehberleriTopla({ 'a.ts': { rehber: [tarif('/yok-boyle')] } })).toThrow(/bir sayfa değil/);
    expect(() => rehberleriTopla({ 'a.ts': { rehber: [tarif('/stok')] }, 'b.ts': { rehber: [tarif('/stok')] } })).toThrow(/iki rehber/);
    expect(() => rehberleriTopla({ 'a.ts': { rehber: [{ ...tarif('/stok'), ozet: ' ' }] } })).toThrow(/özeti boş/);
    expect(() => rehberleriTopla({ 'a.ts': { rehber: [{ ...tarif('/stok'), nasil: [] }] } })).toThrow(/adımları boş/);
    expect(() => rehberleriTopla({ 'a.ts': {} })).toThrow(/rehber dizisi/);
  });
});

describe('rehberMaddeleri', () => {
  it('yalniz kisinin gordugu ve menude gorunen sayfalari verir', () => {
    const stok = SAYFALAR.filter((s) => s.yol === '/stok' || s.yol === '/terminal');
    const maddeler = rehberMaddeleri({ sayfalar: stok, menuler: IKINCI_MENU_TANIMLARI, islemler: ['sayfa.stok'], rehberler: sayfaRehberleri });
    expect(maddeler.map((m) => m.yol)).toEqual(['/stok']);
    expect(maddeler[0]?.yazili).toBe(true);
  });

  it('tarifi yazilmamis sayfa basligi ve kisinin gordugu bolumlerle rehberde durur', () => {
    const stok = SAYFALAR.filter((s) => s.yol === '/stok');
    const [madde] = rehberMaddeleri({ sayfalar: stok, menuler: IKINCI_MENU_TANIMLARI, islemler: ['sayfa.stok'], rehberler: [] });
    expect(madde?.yazili).toBe(false);
    expect(madde?.ozet).toContain('Stok Merkezi');
    // Mal kabul stok giriş yetkisi ister: yetkisizin bölüm listesinde yoktur.
    expect(madde?.bolumler.map((b) => b.baslik)).toContain('Okut');
    expect(madde?.bolumler.map((b) => b.baslik)).not.toContain('Mal kabul');
  });
});

describe('rehberAra', () => {
  const maddeler = rehberMaddeleri({ sayfalar: SAYFALAR, menuler: IKINCI_MENU_TANIMLARI, islemler: tumIslemler, rehberler: sayfaRehberleri });
  const kisayollar = [{ grup: 'Stok', isler: [{ anahtar: 'x', sira: 1, baslik: 'Malzeme geldi', aciklama: 'Mal kabul', simge: 'truck' as const, yol: '/stok/mal-kabul', islem: 'stok.giris' as const }] }];
  const ara = (q: string) => rehberAra(q, { maddeler, konular: GENEL_KONULAR, kisayollar });

  it('soru gibi yazilan aramada anlamli sozcugu bulur', () => {
    const sonuc = ara('nasıl izin isterim');
    expect(sonuc[0]?.tur).toBe('sayfa');
    expect(sonuc.some((s) => s.tur === 'sayfa' && s.madde.yol === '/ik-islemlerim')).toBe(true);
  });

  it('Turkce harf ve buyuk kucuk harf farkini yok sayar; kisayolu da getirir', () => {
    const sonuc = ara('MAL KABUL');
    expect(sonuc.some((s) => s.tur === 'sayfa' && s.madde.yol === '/stok')).toBe(true);
    expect(sonuc.some((s) => s.tur === 'kisayol' && s.yol === '/stok/mal-kabul')).toBe(true);
    expect(ara('sifre').some((s) => s.tur === 'genel' && s.konu.anahtar === 'hesap')).toBe(true);
  });

  it('eslesme yoksa bos, bos sorguda bos doner', () => {
    expect(ara('zzqqxx')).toEqual([]);
    expect(ara('  ')).toEqual([]);
  });
});
