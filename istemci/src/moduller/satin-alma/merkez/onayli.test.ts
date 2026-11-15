import { describe, expect, it } from 'vitest';
import { BUGUN, ORNEK_LISTE } from '../tedarikciler/ornek.ts';
import { firmaRehberi, kontrolluKategoriler, rehberSirasi, talepKategorileri } from './onayli.ts';
import type { Material } from './tipler.ts';

const mal = (id: string, malzemeNo?: number): Material => ({ id, code: id, name: id, category: '', unit: 'adet', spec: '', notes: '', aliases: [], createdAt: 0, ...(malzemeNo === undefined ? {} : { malzemeNo }) });

describe('3279 a teklif rehberi', () => {
  it('kalemin kategorisi kart malzemeNo ile; kartsız kalem eşleşmeyen sayılır', () => {
    const r = { items: [{ m: 'a' }, { m: 'b' }, { m: 'c' }] } as never;
    const k = talepKategorileri(ORNEK_LISTE, r, { a: mal('a', 10), b: mal('b', 11), c: mal('c') }, (it) => (it as unknown as { m: string }).m);
    expect(k).toEqual({ anahtarlar: ['hizmet|isil', 'sarf|kesici'], eslesmeyen: 1 });
  });

  it('kontrollü kategoride kararı olmayan Onaysız; şartlıda şart; onaylı önce sıralanır', () => {
    expect([...kontrolluKategoriler(ORNEK_LISTE)]).toEqual(['hizmet|isil']);
    const a = firmaRehberi(ORNEK_LISTE, 1, ['hizmet|isil'], BUGUN)!;
    const d = firmaRehberi(ORNEK_LISTE, 2, ['hizmet|isil'], BUGUN)!;
    const k = firmaRehberi(ORNEK_LISTE, 3, ['hizmet|isil'], BUGUN)!;
    expect([a.sinif, d.sinif, d.sartlar, k.sinif]).toEqual(['onayli', 'sartli', ['ORN şart: her partide rapor'], 'onaysiz']);
    expect(k.uyarilar).toEqual(['Bu kategoride Kalite onayı yok', "Sertifika 20.10.2026'da bitti"]);
    expect([k, d, a].sort((x, y) => rehberSirasi(x) - rehberSirasi(y)).map((x) => x.sinif)).toEqual(['onayli', 'sartli', 'onaysiz']);
  });

  it('V7: kararsız kategoride uyarı yok, firma geneli; Kalite kaydı yok ayrı; Kalite bağlı değilse rehber yok', () => {
    expect(firmaRehberi(ORNEK_LISTE, 1, ['sarf|kesici'], BUGUN)).toEqual({ sinif: 'firma', etiket: 'Onaylı', sartlar: [], uyarilar: [] });
    expect(firmaRehberi(ORNEK_LISTE, 3, ['sarf|kesici'], BUGUN)?.etiket).toBe('Askıda');
    expect(firmaRehberi(ORNEK_LISTE, 4, ['hizmet|isil'], BUGUN)?.sinif).toBe('kayitsiz');
    expect(firmaRehberi({ ...ORNEK_LISTE, kaliteBagli: false }, 1, ['hizmet|isil'], BUGUN)).toBeNull();
    expect(firmaRehberi(null, 1, [], BUGUN)).toBeNull();
  });
});
