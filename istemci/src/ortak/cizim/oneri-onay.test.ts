import { describe, expect, it } from 'vitest';
import { olcuOnerileri, onayIster, type MetinOgesi } from './okuma.ts';

// 967 a: okuyucunun bulduğu tolerans, uyum ve GD&T kullanıcı onaylamadan seçili gelmez; genel toleranslı ölçü eskisi gibi seçilir.
const yazi = (s: string, x: number, y: number): MetinOgesi => ({ s, x, y, h: 10, a: 0, w: s.length * 6 });
const oku = (...l: string[]) => olcuOnerileri(l.map((s, i) => yazi(s, 100 + (i % 4) * 180, 100 + Math.floor(i / 4) * 80)), 'm', { w: 1000, h: 700, auto: 'low' });

describe('öneri onayı', () => {
  it('çizimden toleranslı, uyumlu ve GD&T öneri güveni yüksek olsa da seçilmemiş gelir', () => {
    const l = oku('Ø6.147 +0.15/0', '18 ±0.05', 'Ø25 H7', '⏥ 0.02', 'Ø40', 'R5');
    const bul = (nom: string) => l.find((o) => o.raw.startsWith(nom))!;
    for (const n of ['Ø6.147', '18', 'Ø25', '⏥']) { expect(bul(n).on, n).toBe(false); expect(onayIster(bul(n))).toBe(true); }
    for (const n of ['Ø40', 'R5']) { expect(bul(n).on, n).toBe(true); expect(onayIster(bul(n))).toBe(false); }
  });
  it('referans ölçü onay kuralına girmez, zaten seçilmez', () => {
    const r = oku('(150)', 'Ø40').find((o) => o.ref)!;
    expect([r.on, onayIster(r)]).toEqual([false, false]);
  });
});
