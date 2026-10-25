import { describe, expect, it } from 'vitest';
import { planlamaMotoru } from './planlama-derle.ts';

// 483, 554 a: termini girilmemiş malzeme olması gereken tarihte gelmiş sayılır (motor/durum.betik tmUygula). (1) Siparişi verilmemiş eksiğin
// miktarı biten siparişi saymaz (bitenUygula sonrası yeniden yazılır); (2) olması gereken tarih son plandaki ilk işin başlangıcından muayene
// kadar öncedir, plan yoksa plan gününün ilk vardiya başı (07:00 değil). Tedarik süresi ve katsayı kullanılmaz. Veriler uydurmadır.

type Nesne = Record<string, unknown>;
interface Satir { kod: string; miktar: number; gelis: string | number | null; tm?: string; src?: number | null; tb?: number }
interface St { D: Nesne & { satinalma: Satir[] }; now: number }
interface Motor {
  tmUygula: (st: St, S: Nesne) => St;
  bitenUygula: (st: St, b: { siparis: Nesne; adim: Nesne }) => St;
}
const motor = new Function(`${planlamaMotoru()}\nreturn { tmUygula, bitenUygula };`)() as Motor;
const kopya = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

// 2026-10-19 Pazartesi
const veri = (ek: Nesne = {}): Nesne => ({
  meta: { baslangic: '2026-10-19' },
  vardiyalar: [{ id: 'V1', bas: '08:00', bit: '16:00' }, { id: 'V2', bas: '06:30', bit: '14:30' }],
  calismaGunleri: { pzt: ['V1'], sal: ['V1'], car: ['V1'], per: ['V1'], cum: ['V1'] },
  tatiller: [],
  malzemeler: [{ kod: 'H1', stok: 6, tedarikGun: 3 }],
  siparisler: [
    { id: 'O1', adet: 2, malzeme: [{ kod: 'H1', miktar: 5 }] },
    { id: 'O2', adet: 4, malzeme: [{ kod: 'H1', miktar: 5 }] },
  ],
  satinalma: [],
  ...ek,
});
const kur = (D: Nesne, plan: Nesne | null = null): St => {
  const S = { D, plan };
  return motor.tmUygula({ D: kopya(D) as St['D'], now: 7 }, S);
};
const eksik = (st: St) => st.D.satinalma.filter((p) => p.tm === 'siparis-yok');

describe('termini girilmemiş malzeme (483, 554 a)', () => {
  it('eksik satırı plan yoksa plan gününün ilk vardiya başında, termin beklenen satırdır', () => {
    expect(eksik(kur(veri()))).toEqual([expect.objectContaining({ kod: 'H1', miktar: 24, gelis: '2026-10-19 08:00', tb: 1 })]);
  });

  it('olması gereken tarih: son plandaki ilk işin başlangıcından muayene kadar önce; katsayı ve eşik kuralı yok', () => {
    const plan = { ops: { 'O1.10': { job: 'O1', S: 4 * 24 + 8 }, 'O2.10': { job: 'O2', S: 2 * 24 + 8 } } };
    const D = veri({ malzemeler: [{ kod: 'H1', stok: 6, tedarikGun: 30, muayeneGun: 1, terminKat: 5 }] });
    expect(eksik(kur(D, plan))[0]?.gelis).toBe('2026-10-20 08:00');
  });

  it('günün en erken vardiyası esas alınır', () => {
    const st = kur(veri({ calismaGunleri: { pzt: ['V1', 'V2'] } }));
    expect(eksik(st)[0]?.gelis).toBe('2026-10-19 06:30');
  });

  it('plan günü çalışılmıyorsa (hafta sonu ya da tatil) sonraki ilk çalışma günü', () => {
    // 2026-10-24 Cumartesi: ilk vardiya Pazartesi 26 Ekim 08:00
    expect(eksik(kur(veri({ meta: { baslangic: '2026-10-24' } })))[0]?.gelis).toBe('2026-10-26 08:00');
    expect(eksik(kur(veri({ tatiller: ['2026-10-19'] })))[0]?.gelis).toBe('2026-10-20 08:00');
  });

  it('takvimde vardiya yoksa 07:00', () => {
    expect(eksik(kur(veri({ calismaGunleri: {} })))[0]?.gelis).toBe('2026-10-19 07:00');
  });

  it('tarihsiz satın alma termin beklenen satır olur; tarihi olan değişmez', () => {
    const st = kur(veri({ satinalma: [{ kod: 'H1', miktar: 10, gelis: null }, { kod: 'H1', miktar: 4, gelis: '2026-10-30' }] }));
    expect(st.D.satinalma.slice(0, 2)).toEqual([
      expect.objectContaining({ gelis: '2026-10-19 08:00', tm: 'termin-bekleniyor', tb: 1, src: 0 }),
      expect.objectContaining({ gelis: '2026-10-30', src: 1 }),
    ]);
    expect(eksik(st)).toEqual([expect.objectContaining({ miktar: 10 })]);
  });

  it('biten sipariş tahmini miktardan düşer; satın alma satırları ve sırası kalır', () => {
    const st = kur(veri({ satinalma: [{ kod: 'H1', miktar: 2, gelis: '2026-10-30' }] }));
    expect(eksik(st)).toEqual([expect.objectContaining({ miktar: 22 })]);
    motor.bitenUygula(st, { siparis: { O2: 1 }, adim: {} });
    expect(st.D.satinalma).toEqual([
      expect.objectContaining({ kod: 'H1', miktar: 2, src: 0 }),
      expect.objectContaining({ kod: 'H1', miktar: 2, gelis: '2026-10-19 08:00', tm: 'siparis-yok' }),
    ]);
    // stok ve satın alma kalan siparişi karşılıyorsa eksik satırı kalmaz
    motor.bitenUygula(st, { siparis: { O1: 1 }, adim: {} });
    expect(eksik(st)).toEqual([]);
    expect(st.D.satinalma).toHaveLength(1);
  });

  it('biten adım (sipariş sürüyor) eksik satırına dokunmaz', () => {
    const st = kur(veri());
    const once = kopya(st.D.satinalma);
    motor.bitenUygula(st, { siparis: {}, adim: { 'O1.10': 1 } });
    expect(st.D.satinalma).toEqual(once);
  });
});
