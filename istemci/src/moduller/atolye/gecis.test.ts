import { describe, expect, it } from 'vitest';
import type { YerlesimCevabi } from '#paylasilan/sozlesme/atolye.ts';
import { fabrikaGovdesi, fabrikaTaslagiKur, govdeyeCevir, kaldir, konumu, ogeCiz, ogeEkle, taslakKur, tasi } from './duzenleyici-durumu.ts';
import { DIS, acikliklar, bolumYolu, disYolu, distaSerbestMi, kapiKusagindaMi, kapilar, kenaraOtur } from './gecis.ts';
import type { GecisliBolum } from './gecis.ts';

const SIFIR = { x: 0, z: 0, donus: 0 };

describe('geçişler', () => {
  it('nokta en yakın kenara oturur; geçiş kenardan taşmaz', () => {
    expect(kenaraOtur({ x: 10, z: 0.4 }, 4, 20, 10)).toEqual({ kenar: 'arka', ofset: 0 });
    expect(kenaraOtur({ x: 19.5, z: 6 }, 2, 20, 10)).toEqual({ kenar: 'sag', ofset: 1 });
    expect(kenaraOtur({ x: 1, z: 9.8 }, 4, 20, 10)).toEqual({ kenar: 'on', ofset: -8 });
    // Kenardan uzun geçiş ortada kalır.
    expect(kenaraOtur({ x: 0.1, z: 1 }, 12, 20, 10)).toEqual({ kenar: 'sol', ofset: 0 });
  });

  it('ortak duvardaki geçiş iki bölümü bağlar; komşunun duvarı da açılır; dış kapı dışarıya bağlar', () => {
    // A (20x10) solda, B (20x10) sağında; A'nın sağ duvarında açık geçiş, B'nin ön duvarında kepenk (dış kapı).
    const bolumler: GecisliBolum[] = [
      { salonId: 1, konum: SIFIR, g: 20, d: 10, gecisler: [{ tur: 'acik', kenar: 'sag', ofset: 1, genislik: 3 }] },
      { salonId: 2, konum: { x: 20, z: 0, donus: 0 }, g: 20, d: 10, gecisler: [{ tur: 'kepenk', kenar: 'on', ofset: 0, genislik: 4 }] },
    ];
    const ac = acikliklar(bolumler);
    expect(ac.get(1)).toEqual([{ kenar: 'sag', bas: 4.5, son: 7.5, tur: 'acik', komsu: 2, ortak: [4.5, 7.5], kendi: true }]);
    expect(ac.get(2)).toEqual([
      { kenar: 'sol', bas: 4.5, son: 7.5, tur: 'acik', komsu: 1, ortak: [4.5, 7.5], kendi: false },
      { kenar: 'on', bas: 8, son: 12, tur: 'kepenk', komsu: null, ortak: null, kendi: true },
    ]);
    const hepsi = kapilar(bolumler);
    expect(hepsi.map((o) => [o.bir, o.iki])).toEqual([[1, 2], [2, DIS]]);
    // Kepenk B'nin ön duvarında (z 10): içerideki yan 9,2'de, dışarıdaki 10,8'de.
    expect(hepsi[1]?.orta).toEqual({ x: 30, z: 10 });
    expect(hepsi[1]?.ikiYani.z).toBeCloseTo(10.8, 6);
    const k = hepsi.slice(0, 1);
    expect(k[0]?.orta).toEqual({ x: 20, z: 6 });
    expect(k[0]?.birYani.x).toBeCloseTo(19.2, 6);
    expect(k[0]?.ikiYani.x).toBeCloseTo(20.8, 6);
    expect(bolumYolu(k, 1, 2)).toEqual(k);
    expect(bolumYolu(k, 2, 2)).toEqual([]);
  });

  it('dönmüş ve aralı bölümler: duvarlar üst üste değilse bağlanmaz; dönmüş komşuda bağlanır', () => {
    const a: GecisliBolum = { salonId: 1, konum: SIFIR, g: 20, d: 10, gecisler: [{ tur: 'kapi', kenar: 'on', ofset: 0, genislik: 1 }] };
    // B 1 m aşağıda: arada boşluk var; kapı B'ye değil dışarıya açılır.
    expect(kapilar([a, { salonId: 2, konum: { x: 0, z: 11, donus: 0 }, g: 20, d: 10, gecisler: [] }]).map((o) => o.iki)).toEqual([DIS]);
    // B 90° dönmüş; sol üst köşesi (20, 10): yerel x ekseni aşağı, z ekseni sola. A'nın ön duvarı B'nin sol duvarıdır.
    const b: GecisliBolum = { salonId: 2, konum: { x: 20, z: 10, donus: 90 }, g: 10, d: 20, gecisler: [] };
    const ac = acikliklar([a, b]);
    expect(ac.get(2)?.map((o) => o.kenar)).toEqual(['sol']);
    expect(kapilar([a, b]).map((o) => o.iki)).toEqual([2]);
  });

  it('kapı kuşağı: açıklığın içinde ve duvarın iki yanında; dışında değil', () => {
    const bolumler: GecisliBolum[] = [
      { salonId: 1, konum: SIFIR, g: 20, d: 10, gecisler: [{ tur: 'acik', kenar: 'sag', ofset: 0, genislik: 3 }] },
      { salonId: 2, konum: { x: 20, z: 0, donus: 0 }, g: 20, d: 10, gecisler: [] },
    ];
    const [k] = kapilar(bolumler);
    if (!k) throw new Error('kapı yok');
    expect(kapiKusagindaMi(k, { x: 19.8, z: 5 }, 20, 10, 0.3, 0.75)).toBe(true);
    expect(kapiKusagindaMi(k, { x: 20.5, z: 5 }, 20, 10, 0.3, 0.75)).toBe(true);
    expect(kapiKusagindaMi(k, { x: 20, z: 3.6 }, 20, 10, 0.3, 0.75)).toBe(false);
    expect(kapiKusagindaMi(k, { x: 21, z: 5 }, 20, 10, 0.3, 0.75)).toBe(false);
  });

  it('aralı iki bölüm dış kapılarından dışarı üzerinden bağlanır; dışarıdaki yol bölüme çarpmadan dolaşır', () => {
    // A ve B arasında 5 m boşluk; A'nın sağ duvarında, B'nin sol duvarında kapı. C ikisinin arasındaki doğruyu keser.
    const bolumler: GecisliBolum[] = [
      { salonId: 1, konum: SIFIR, g: 20, d: 10, gecisler: [{ tur: 'kapi', kenar: 'sag', ofset: 0, genislik: 1 }] },
      { salonId: 2, konum: { x: 25, z: 0, donus: 0 }, g: 20, d: 10, gecisler: [{ tur: 'kepenk', kenar: 'sol', ofset: 0, genislik: 4 }] },
    ];
    const k = kapilar(bolumler);
    expect(k.map((o) => [o.bir, o.iki])).toEqual([[1, DIS], [2, DIS]]);
    expect(bolumYolu(k, 1, 2)?.map((o) => o.bir)).toEqual([1, 2]);
    expect(distaSerbestMi(bolumler, { x: 22.5, z: 5 })).toBe(true);
    expect(distaSerbestMi(bolumler, { x: 20.2, z: 5 })).toBe(false);
    expect(distaSerbestMi(bolumler, { x: 10, z: 5 })).toBe(false);
    expect(distaSerbestMi(bolumler, { x: 22.5, z: 60 })).toBe(false);
    expect(disYolu(bolumler, { x: 20.8, z: 5 }, { x: 24.2, z: 5 })).toEqual([{ x: 20.8, z: 5 }, { x: 24.2, z: 5 }]);
    // Doğru yol iki bölümün içinden geçer: yol köşelerden dolaşır, hiçbir parça bölüme girmez.
    const yol = disYolu(bolumler, { x: -5, z: 5 }, { x: 50, z: 5 });
    expect(yol?.length).toBeGreaterThan(2);
    for (const [i, p] of (yol ?? []).entries()) {
      const s = yol?.[i + 1];
      if (!s) continue;
      for (let t = 0; t <= 1; t += 0.05) expect(distaSerbestMi(bolumler, { x: p.x + (s.x - p.x) * t, z: p.z + (s.z - p.z) * t }, 0.3)).toBe(true);
    }
  });

  it('bölümler arası yol en az kapıdan geçer; bağlı değilse null', () => {
    const k = (bir: number, iki: number) => ({ bir, iki, kenar: 'sag' as const, bas: 0, son: 1, orta: { x: 0, z: 0 }, birYani: { x: 0, z: 0 }, ikiYani: { x: 0, z: 0 } });
    const liste = [k(1, 2), k(2, 3), k(1, 3), k(4, 5)];
    expect(bolumYolu(liste, 1, 3)).toEqual([liste[2]]);
    expect(bolumYolu(liste, 3, 1)).toEqual([liste[2]]);
    expect(bolumYolu(liste, 1, 5)).toBeNull();
  });
});

const yerlesim = (id: number, fabrika: { x: string; z: string; donus: string }, gecisler: YerlesimCevabi['gecisler'] = []): YerlesimCevabi => ({
  salon: {
    id, kod: `B${id}`, ad: `Bölüm ${id}`, genislik: '20.00', derinlik: '10.00', hucreBoyu: '5.00', surum: 1, fabrika, giris: null,
    kaydeden: { id: 1, ad: 'Deneme' }, kaydedildi: '2026-10-12T00:00:00Z', sutunlar: [], satirlar: [],
  },
  istasyonYerleri: [], makineYerleri: [], raflar: [], alanlar: [], duvarlar: [], gecisler,
});

describe('düzenleyicide geçiş', () => {
  it('eklenen geçiş en yakın duvara oturur, sürüklenince duvar boyunca kayar, kayda türüyle gider; kaldırılır', () => {
    let t = taslakKur(yerlesim(1, { x: '0.00', z: '0.00', donus: '0.00' }));
    const e = ogeEkle(t, 'gecis_yangin_kapisi', 19, 3);
    t = e.taslak;
    expect(t.gecisler).toEqual([{ anahtar: e.anahtar, salonId: null, tur: 'yangin_kapisi', kenar: 'sag', ofset: -2, genislik: 1.2 }]);
    expect(konumu(t, e.anahtar)).toEqual({ x: 20, z: 3 });
    t = tasi(t, e.anahtar, 7.25, 0.5);
    expect(t.gecisler[0]).toMatchObject({ kenar: 'arka', ofset: -2.75 });
    const h = govdeyeCevir(t);
    expect(h.govde.gecisler).toEqual([{ tur: 'yangin_kapisi', kenar: 'arka', ofset: -2.75, genislik: 1.2 }]);
    expect(h.eslesme.get('gecis:0')).toBe(e.anahtar);
    expect(kaldir(t, e.anahtar).gecisler).toEqual([]);
  });

  it('çizilen geçişin genişliği çizginin boyudur; kısa çizim geçiş olmaz', () => {
    const t = taslakKur(yerlesim(1, { x: '0.00', z: '0.00', donus: '0.00' }));
    const r = ogeCiz(t, 'gecis_kepenk', { x: 4, z: 9.9 }, { x: 9, z: 9.9 });
    expect(r?.taslak.gecisler[0]).toMatchObject({ tur: 'kepenk', kenar: 'on', ofset: -3.5, genislik: 5 });
    expect(ogeCiz(t, 'gecis_kapi', { x: 4, z: 9.9 }, { x: 4.5, z: 9.9 })).toBeNull();
  });

  it('fabrikada geçiş kendi bölümünde kalır: bölüm taşınsa da kayıt bölüm metresinde döner', () => {
    const t = fabrikaTaslagiKur([
      yerlesim(1, { x: '0.00', z: '0.00', donus: '0.00' }, [{ id: 5, tur: 'kepenk', kenar: 'on', ofset: '2.00', genislik: '4.00' }]),
      yerlesim(2, { x: '40.00', z: '0.00', donus: '90.00' }),
    ]);
    expect(t.gecisler.map((g) => g.salonId)).toEqual([1]);
    // İkinci bölüme (dönmüş) eklenen geçiş onun yerel kenarına oturur.
    const e = ogeEkle(t, 'gecis_acik', 31, 5);
    expect(e.taslak.gecisler[1]).toMatchObject({ salonId: 2, kenar: 'on' });
    const h = fabrikaGovdesi(e.taslak);
    expect(h.govde.bolumler.map((b) => b.yerlesim.gecisler)).toEqual([
      [{ tur: 'kepenk', kenar: 'on', ofset: 2, genislik: 4 }],
      [{ tur: 'acik', kenar: 'on', ofset: -5, genislik: 3 }],
    ]);
    expect(h.eslesme.get('salon:2/gecis:0')).toBe(e.anahtar);
  });
});
