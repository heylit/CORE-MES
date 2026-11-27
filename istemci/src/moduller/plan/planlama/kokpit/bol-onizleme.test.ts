import { describe, expect, it } from 'vitest';
import { bolOkYolu, bolOnizlemesiKur, BOL_UYGULA_NOTU } from './bol-onizleme.ts';
import type { KokpitModeli } from './kurallar.ts';

// 3792: önce ve sonra modelinden önizleme. Veri uydurmadır (ORN-).
type Model = Pick<KokpitModeli, 'isler' | 'emirler' | 'tezgahlar'>;
const tezgahlar = [{ id: 'ORN-T2', kod: 'T-02', ad: '', fason: false }, { id: 'ORN-T4', kod: 'T-04', ad: '', fason: false }, { id: 'ORN-T5', kod: 'T-05', ad: '', fason: false }, { id: 'ORN-T9', kod: 'T-09', ad: '', fason: false }];
const is = (id: string, m: string, S: number, C: number, ek: Record<string, unknown> = {}) => ({ id, job: 'ORN-E1', ad: 'Freze', m, S, C, basladi: false, fason: false, kilitli: false, sira: 0, ...ek });
const emir = (bitis: number) => ({ id: 'ORN-E1', no: 'ORN-E101', urun: '', adet: 120, termin: 20, bitis, durum: 'iyi', gecikme: null, adimlar: [] });
const zaman = (t: number) => `01.01 Pzt ${String(Math.floor(t)).padStart(2, '0')}:${t % 1 === 0.5 ? '30' : '00'}`;

const once = {
  tezgahlar, emirler: [emir(16.25)],
  isler: { 'ORN-E1.20': is('ORN-E1.20', 'ORN-T2', 8, 14), 'ORN-E1.30': is('ORN-E1.30', 'ORN-T5', 14, 16.25, { sira: 1 }) },
} as unknown as Model;
const pay = (no: number, adet: number) => ({ no, n: 2, asil: 'ORN-E1.20', adet });
const sonra = {
  tezgahlar, emirler: [emir(13.75)],
  isler: {
    'ORN-E1.20': is('ORN-E1.20', 'ORN-T2', 8, 11, { pay: pay(1, 60) }),
    'ORN-E1.20~2': is('ORN-E1.20~2', 'ORN-T4', 8.5, 11.5, { adim: 'ORN-E1.20', pay: pay(2, 60) }),
    'ORN-E1.30': is('ORN-E1.30', 'ORN-T5', 11.5, 13.75, { sira: 1 }),
  },
} as unknown as Model;

describe('bolOnizlemesiKur (3792)', () => {
  it('paylar taslak, eski yer bölünen adımın eski yeri; kayan iş eskiYer kalıbıyla; etkilenen tezgâhlar paylar, eski yer ve kayan iştir', () => {
    const o = bolOnizlemesiKur(once, sonra, 'ORN-E1.20', zaman)!;
    expect([...o.taslak].sort()).toEqual(['ORN-E1.20', 'ORN-E1.20~2']);
    expect(o.eski).toEqual([{ id: 'ORN-E1.20', m: 'ORN-T2', S: 8, C: 14 }]);
    expect(o.kayanEski).toEqual({ 'ORN-E1.30': { m: 'ORN-T5', S: 14, C: 16.25 } });
    expect(o.kayanSayisi).toBe(1);
    expect([...o.tezgahlar].sort()).toEqual(['ORN-T2', 'ORN-T4', 'ORN-T5']);
    expect(o.aralik).toEqual({ bas: 8, son: 16.25 });
  });

  it('cümle: paylar, eski yer, kayan iş, emir bitişi, termin ve Uygula taslağa yazar notu; kısa cümle notu taşımaz', () => {
    const o = bolOnizlemesiKur(once, sonra, 'ORN-E1.20', zaman)!;
    expect(o.cumle).toBe(`ORN-E101 · Freze 2 paya bölünür: T-02 60 adet, T-04 60 adet (eski yer: T-02 Pzt 08:00–14:00) · 1 iş erkene çekilir (Freze −2 sa 30 dk) · emir bitişi 16:00 → 13:00, termine yetişir · ${BOL_UYGULA_NOTU}`);
    expect(o.kisa).not.toContain('Uygula');
    expect(o.kisa).toContain('eski yer: T-02');
  });

  it('bolOkYolu: hedef sağdaysa kenar ortasından, üst üste biniyorsa dikey kenardan çıkar; uç hedefte biter; boş kutuda bozulmaz', () => {
    const sag = bolOkYolu({ x1: 0, x2: 10, y1: 0, y2: 10 }, { x1: 30, x2: 50, y1: 0, y2: 10 });
    expect(sag.yol).toBe('M5,5 L24,5');
    expect(sag.uc.startsWith('M30,5 ')).toBe(true);
    const alt = bolOkYolu({ x1: 0, x2: 40, y1: 40, y2: 44 }, { x1: 10, x2: 30, y1: 0, y2: 20 });
    expect(alt.yol).toBe('M20,40 L20,26');
    // Bitişik kutularda ok görünmez kalmaz: en az 14 px uzar.
    const bitisik = bolOkYolu({ x1: 0, x2: 40, y1: 21, y2: 25 }, { x1: 10, x2: 30, y1: 0, y2: 20 });
    expect(bitisik.yol).toBe('M20,34 L20,26');
    const bos = bolOkYolu({ x1: 5, x2: 5, y1: 5, y2: 5 }, { x1: 5, x2: 5, y1: 5, y2: 5 });
    expect(bos.yol).not.toContain('NaN');
    expect(bos.uc).not.toContain('NaN');
  });

  it('adım tek parçaya dönüyorsa ya da planda yoksa önizleme kurulmaz (Bölmeyi kaldır panelde etkisiyle kalır)', () => {
    expect(bolOnizlemesiKur(sonra, once, 'ORN-E1.20', zaman)).toBeNull();
    expect(bolOnizlemesiKur(once, sonra, 'ORN-YOK', zaman)).toBeNull();
  });
});
