import { describe, expect, it } from 'vitest';
import type { Personel } from '../tipler.ts';
import { ayEkle, besGirdisiDenetle, besOzeti, besSatiri, besSatirlari, caymaYaklasanlar, otomatikKapsamda, type BesHareketi } from './kurallar.ts';

// Uydurma örnek: kişiler gerçek değildir.
const p = (id: string, ek: Partial<Personel> = {}): Personel => ({ id, kind: 'emp', ad: `Ad ${id}`, soyad: 'Deneme', ...ek } as Personel);
let no = 0;
const h = (personel: string, tur: BesHareketi['tur'], tarih: string, ek: Partial<BesHareketi> = {}): BesHareketi =>
  ({ id: ++no, personel, tur, tarih, oran: null, sirket: null, aciklama: null, iptal: false, surum: 1, yazan: null, ...ek });
const GUN = '2026-11-03';
const bos = { personel: 'emp_a', tur: '' as const, tarih: GUN, oran: '', sirket: '', aciklama: '' };

describe('BES kuralları', () => {
  it('ay ekleme ay sonunu taşırmaz', () => {
    expect(ayEkle('2026-12-31', 2)).toBe('2027-02-28');
    expect(ayEkle('2026-01-15', 2)).toBe('2026-03-15');
  });

  it('durum son geçerli hareketten çıkar; iptal edilen sayılmaz', () => {
    const a = p('emp_a');
    expect(besSatiri(a, []).durum).toBe('hic');
    const giris = h('emp_a', 'otomatik_katilim', '2026-09-01', { oran: 3 });
    const r1 = besSatiri(a, [giris]);
    expect([r1.durum, r1.giris?.tarih, r1.caymaSonu]).toEqual(['bes', '2026-09-01', '2026-11-01']);
    const cikis = h('emp_a', 'cayma', '2026-10-01');
    const r2 = besSatiri(a, [giris, cikis]);
    expect([r2.durum, r2.giris?.tarih, r2.cikis?.tarih, r2.caymaSonu]).toEqual(['cikti', '2026-09-01', '2026-10-01', null]);
    expect(besSatiri(a, [giris, { ...cikis, iptal: true }]).durum).toBe('bes');
    expect(besSatiri(a, [h('emp_a', 'gonullu_katilim', '2026-09-01')]).caymaSonu).toBeNull();
  });

  it('süzgeç durum, arama ve işten ayrılanlara göre süzer', () => {
    const kisiler = [p('emp_a', { sicilNo: '1001' }), p('emp_b'), p('emp_c', { cikisTarihi: '2026-01-31' })];
    const hs = [h('emp_a', 'otomatik_katilim', '2026-01-01'), h('emp_b', 'gonullu_katilim', '2025-01-01'), h('emp_b', 'ayrilma', '2026-01-01')];
    const sec = (s: Partial<Parameters<typeof besSatirlari>[2]>) => besSatirlari(kisiler, hs, { ara: '', durum: '', ayrilanlar: false, ...s }, GUN).map((r) => r.personel.id);
    expect(sec({})).toEqual(['emp_a', 'emp_b']);
    expect(sec({ ayrilanlar: true })).toEqual(['emp_a', 'emp_b', 'emp_c']);
    expect(sec({ durum: 'cikti' })).toEqual(['emp_b']);
    expect(sec({ ara: '1001' })).toEqual(['emp_a']);
    expect(besOzeti(besSatirlari(kisiler, hs, { ara: '', durum: '', ayrilanlar: true }, GUN))).toEqual({ bes: 1, cikti: 1, hic: 1 });
  });

  it('cayma süresi 15 gün içinde dolanlar uyarılır', () => {
    const kisiler = [p('emp_a'), p('emp_b')];
    const hs = [h('emp_a', 'otomatik_katilim', '2026-09-10'), h('emp_b', 'otomatik_katilim', '2026-06-01')];
    const satirlar = besSatirlari(kisiler, hs, { ara: '', durum: '', ayrilanlar: false }, GUN);
    expect(caymaYaklasanlar(satirlar, GUN).map((r) => r.personel.id)).toEqual(['emp_a']);
  });

  it('45 yaş sınırı doğum tarihinden; doğum tarihi yoksa bilinmez', () => {
    expect(otomatikKapsamda(p('x', { dogumTarihi: '1990-05-05' }), GUN)).toBe(true);
    expect(otomatikKapsamda(p('x', { dogumTarihi: '1981-11-03' }), GUN)).toBe(false);
    expect(otomatikKapsamda(p('x'), GUN)).toBeNull();
  });

  it('form denetimi: izinli ve reddedilen girişler', () => {
    const a = p('emp_a');
    const hic = besSatiri(a, []);
    expect(besGirdisiDenetle({ ...bos, tur: 'otomatik_katilim', oran: '3' }, hic, GUN)).toEqual({});
    expect(besGirdisiDenetle({ ...bos, tur: 'ayrilma' }, hic, GUN)['tur']).toMatch(/BES'te değil/);
    expect(besGirdisiDenetle({ ...bos, tur: 'otomatik_katilim', tarih: '2026-11-04' }, hic, GUN)['tarih']).toMatch(/İleri tarihli/);
    expect(besGirdisiDenetle({ ...bos, tur: 'gonullu_katilim', oran: '0' }, hic, GUN)['oran']).toBeDefined();
    const oto = besSatiri(a, [h('emp_a', 'otomatik_katilim', '2026-10-01')]);
    expect(besGirdisiDenetle({ ...bos, tur: 'otomatik_katilim' }, oto, GUN)['tur']).toMatch(/zaten/);
    expect(besGirdisiDenetle({ ...bos, tur: 'cayma' }, oto, GUN)).toEqual({});
    expect(besGirdisiDenetle({ ...bos, tur: 'ayrilma', tarih: '2026-09-01' }, oto, GUN)['tarih']).toMatch(/önce olamaz/);
    const eski = besSatiri(a, [h('emp_a', 'otomatik_katilim', '2026-01-01')]);
    expect(besGirdisiDenetle({ ...bos, tur: 'cayma' }, eski, GUN)['tur']).toMatch(/süresi dolmuş/);
    const gonullu = besSatiri(a, [h('emp_a', 'gonullu_katilim', '2026-10-01')]);
    expect(besGirdisiDenetle({ ...bos, tur: 'cayma' }, gonullu, GUN)['tur']).toMatch(/yalnız otomatik/);
  });
});
