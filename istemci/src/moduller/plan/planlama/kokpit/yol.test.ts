import { describe, expect, it } from 'vitest';
import type { OkunanPlan } from '../motor/kurallar.ts';
import type { KokpitEmri, KokpitIsi, KokpitModeli } from './kurallar.ts';
import type { SiraKarti } from './yerlestirme.ts';
import { kartSonucu, yolAdimi } from './yol.ts';

const zaman = (t: number): string => `g${String(Math.floor(t / 24))} ${String(t % 24).padStart(2, '0')}:00`;
const is = (id: string, m: string, S: number, C: number, sira: number): KokpitIsi => ({ id, job: id.split('.')[0] ?? '', ad: `Adım ${String(sira + 1)}`, m, S, C, basladi: false, fason: false, kilitli: false, sira });
const emir = (id: string, x: Partial<KokpitEmri>): KokpitEmri => ({
  id, no: `ORN-${id}`, urun: 'Deneme', adet: 1, termin: 100, bitis: null, durum: 'plansiz', gecikme: null,
  adimlar: [{ id: `${id}.1`, ad: 'Torna', adaylar: ['T1'] }, { id: `${id}.2`, ad: 'Freze', adaylar: ['T2'] }], ...x,
});
const model = (emirler: KokpitEmri[], isler: KokpitIsi[]): KokpitModeli => ({
  simdi: 0, bas: 0, son: 24 * 14, emirler, isler: Object.fromEntries(isler.map((x) => [x.id, x])), acik: {}, durus: {},
  tezgahlar: [{ id: 'T1', kod: 'T-01', ad: 'Torna', fason: false }, { id: 'T2', kod: 'T-02', ad: 'Freze', fason: false }],
});
const kart = (emirler: KokpitEmri[]): SiraKarti => ({ kok: emirler[0]?.id ?? '', siparis: null, emirler, termin: emirler[0]?.termin ?? null, adim: 2, yerlesen: 2 } as SiraKarti);
const plan = (ops: Record<string, { why: { t: string; r?: string } | null }>): OkunanPlan => ({ ops } as unknown as OkunanPlan);

describe('planlama yolu (3414)', () => {
  it('adım: seçim yokken Seç, plansız emirde Sistem önersin, hepsi plandaysa Düzelt', () => {
    const a = emir('1', {}), b = emir('2', { durum: 'iyi', bitis: 50, gecikme: -50 });
    expect(yolAdimi(null, false)).toBe('sec');
    expect(yolAdimi(kart([a]), false)).toBe('sec');
    expect(yolAdimi(kart([a]), true)).toBe('oner');
    expect(yolAdimi(kart([b, a]), true)).toBe('oner');
    expect(yolAdimi(kart([b]), true)).toBe('duzelt');
  });

  it('zamanında biten siparişte sonuç cümlesi erken süreyi yazar, neden ve seçenek yoktur', () => {
    const e = emir('1', { durum: 'iyi', bitis: 76, gecikme: -24 });
    const s = kartSonucu(model([e], [is('1.1', 'T1', 0, 10, 0), is('1.2', 'T2', 10, 76, 1)]), null, kart([e]), zaman);
    expect(s).toEqual({ tur: 'iyi', baslik: '2 operasyon planda. Bitiş g3 04:00, termin g4 04:00: 1 gün erken.', neden: null, emir: null });
  });

  it('geç siparişte neden motorun kaydından okunur: tezgâh bekleyen adım, tezgâhın kodu ve önündeki emir', () => {
    const e = emir('1', { durum: 'gec', bitis: 130, gecikme: 30 }), o = emir('9', { durum: 'iyi', bitis: 60, gecikme: -40 });
    const m = model([e, o], [is('1.1', 'T1', 0, 10, 0), is('1.2', 'T2', 60, 130, 1), is('9.1', 'T2', 0, 60, 0)]);
    const s = kartSonucu(m, plan({ '1.2': { why: { t: 'tezgah', r: '9.1' } } }), kart([e]), zaman);
    expect(s.tur).toBe('gec');
    expect(s.baslik).toBe('2 operasyon planda. Bitiş g5 10:00, termin g4 04:00: 1 gün 6 sa geç.');
    expect(s.neden).toBe('2. adım (Freze) T-02 tezgâhının boşalmasını 2 gün 2 sa bekledi (önündeki iş ORN-9).');
    expect(s.emir).toBe(e);
  });

  it('bekleme yoksa neden toplam süredir; operatör beklemesinde motorun cümlesi yazar; malzeme beklemesi önce gelir', () => {
    const e = emir('1', { durum: 'gec', bitis: 130, gecikme: 30 });
    expect(kartSonucu(model([e], [is('1.1', 'T1', 0, 10, 0), is('1.2', 'T2', 10, 130, 1)]), null, kart([e]), zaman).neden)
      .toBe('Adımlar arasında uzun bekleme yok; işlerin toplam süresi termine sığmıyor.');
    const m = model([e], [is('1.1', 'T1', 0, 10, 0), is('1.2', 'T2', 60, 130, 1)]);
    expect(kartSonucu(m, plan({ '1.2': { why: { t: 'personel' } } }), kart([e]), zaman).neden).toBe('2. adım (Freze) 2 gün 2 sa bekledi: Boş operatör bekledi.');
    expect(kartSonucu(m, plan({ '1.2': { why: { t: 'malzeme' } } }), kart([e]), zaman, { '1.2': 60 }).neden).toBe('2. adım (Freze) malzemeyi bekliyor; malzeme g2 12:00 geliyor.');
  });

  it('termini olmayan emirde termin girilmemiş yazar', () => {
    const e = emir('1', { durum: 'iyi', termin: null, bitis: 76, gecikme: null });
    expect(kartSonucu(model([e], [is('1.1', 'T1', 0, 10, 0), is('1.2', 'T2', 10, 76, 1)]), null, kart([e]), zaman).baslik).toBe('2 operasyon planda. Bitiş g3 04:00; termin girilmemiş.');
  });
});
