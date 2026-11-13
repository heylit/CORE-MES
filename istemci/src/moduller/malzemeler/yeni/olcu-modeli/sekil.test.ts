import { describe, expect, it } from 'vitest';
import { Box3, LineBasicMaterial, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { KISALT, malzemeRengiAdi, sekilKur } from './sekil.ts';

// 3215 c: ölçüden 3B şekil. Ölçüler uydurmadır.
const m = new MeshStandardMaterial();
const kur = (form: string, o: Record<string, number>, gercek = false) => sekilKur(form, o, { govde: m, ikinci: m, kenar: new LineBasicMaterial() }, gercek);
const boyut = (s: ReturnType<typeof kur>) => new Box3().setFromObject(s!.grup).getSize(new Vector3());
const govdeler = (s: ReturnType<typeof kur>) => s!.grup.children.filter((c) => c instanceof Mesh);

describe('3215 ölçüden 3B şekil', () => {
  it('uzun çubuk kırık gösterilir, gerçek boy yazıda; "gerçek oran"da tam boy', () => {
    const s = kur('cubuk', { d: 40, l: 3000 });
    expect(3000 / 40).toBeGreaterThan(KISALT);
    expect(s?.kisaltildi).toBe(true);
    expect(govdeler(s)).toHaveLength(2);
    expect(s?.olculer.map((o) => o.metin)).toEqual(['L 3000', 'Ø 40']);
    const tam = kur('cubuk', { d: 40, l: 3000 }, true);
    expect(tam?.kisaltildi).toBe(false);
    expect(boyut(tam).x).toBeCloseTo(3000, 0);
    expect(boyut(tam).y).toBeCloseTo(40, 0);
  });

  it('kısa parça tam çizilir; boru, kutu ve lama kesit ölçüsünü tutar', () => {
    expect(boyut(kur('boru', { D: 48.3, t: 3.2, l: 300 })).y).toBeCloseTo(48.3, 1);
    const k = boyut(kur('kutu', { a: 60, b: 40, t: 3, l: 300 }));
    expect([k.x, k.y, k.z].map(Math.round)).toEqual([300, 40, 60]);
    const l = boyut(kur('lama', { a: 40, b: 10, l: 200 }));
    expect([l.x, l.y, l.z].map(Math.round)).toEqual([200, 10, 40]);
  });

  it('ince levha görünsün diye kalın çizilir ve bunu söyler', () => {
    const s = kur('levha', { t: 1, w: 1000, l: 2000 });
    expect(s?.temsili).toBe('Kalınlık görünsün diye kalın çizildi');
    expect(kur('blok', { a: 120, b: 200, h: 60 })?.temsili).toBeNull();
  });

  it('granül ve eksik ölçüde şekil yok', () => {
    expect(kur('granul', { kg: 25 })).toBeNull();
    expect(kur('cubuk', { d: 40 })).toBeNull();
  });

  it('renk aileden ve metalde sınıftan', () => {
    expect(malzemeRengiAdi('metal', 'paslanmaz')).toBe('--sahne3b-krom');
    expect(malzemeRengiAdi('metal', 'aluminyum')).toBe('--sahne3b-alu');
    expect(malzemeRengiAdi('metal', 'islah')).toBe('--sahne3b-celik');
    expect(malzemeRengiAdi('plastik', null)).toBe('--sahne3b-ic');
    expect(malzemeRengiAdi(null, null)).toBe('--sahne3b-celik');
  });
});
