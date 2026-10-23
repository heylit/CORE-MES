import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROGRAMLAR } from '../icerik/programlar.ts';
import { bosProfil, yeniDenetim } from '../normalize.ts';
import {
  belgeSonGunuEsitle, denetimTarihiAyarla, dofSonGunuEsitle, kalanGun, onerilenAsama, siradakiDenetim, sonrakiDenetimOnerisi,
} from './denetim-takvimi.ts';

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 5, 15, 12)); });
afterEach(() => { vi.useRealTimers(); });

describe('siradakiDenetim', () => {
  it('plandaki en yakın gelecek denetim; yoksa son 60 gündeki geçmiş denetim', () => {
    const p = bosProfil();
    p.audits.push(yeniDenetim({ prog: 'iso9001', date: '2026-08-01' }), yeniDenetim({ prog: 'iso9001', date: '2026-07-01' }), yeniDenetim({ prog: 'as9100', date: '2026-06-20' }));
    expect(siradakiDenetim(p, 'iso9001')?.date).toBe('2026-07-01');
    expect(siradakiDenetim(p, '*')?.date).toBe('2026-06-20');
    expect(kalanGun(p, 'iso9001')).toBe(16);
    const q = bosProfil();
    q.audits.push(yeniDenetim({ prog: 'iso9001', date: '2026-03-01' }), yeniDenetim({ prog: 'iso9001', date: '2026-05-01' }));
    expect(siradakiDenetim(q, 'iso9001')?.date).toBe('2026-05-01');
    expect(siradakiDenetim(bosProfil(), 'iso9001')).toBeNull();
  });
});

describe('son günler', () => {
  it('EYDEP değerlendirmesinde belge teslimi 15 gün önce; ön değerlendirmede yok', () => {
    const p = bosProfil();
    const a = yeniDenetim({ prog: 'eydep', type: PROGRAMLAR.eydep.types[1] ?? '', date: '2026-09-30' });
    p.audits.push(a);
    belgeSonGunuEsitle(a, p);
    expect(p.audits.find((x) => x.parent === a.id && x.sub === 'docs')?.date).toBe('2026-09-15');
    a.type = PROGRAMLAR.eydep.types[0] ?? '';
    belgeSonGunuEsitle(a, p);
    expect(p.audits.some((x) => x.parent === a.id)).toBe(false);
  });

  it('biten ISO denetiminde uygunsuzluk varsa DÖF son günü bitişten 30 gün sonra; kalmazsa silinir', () => {
    const p = bosProfil();
    const a = yeniDenetim({ prog: 'iso9001', date: '2026-06-01', end: '2026-06-02' });
    a.status = 'done';
    a.res.minor = 2;
    p.audits.push(a);
    dofSonGunuEsitle(a, p);
    const dof = p.audits.find((x) => x.sub === 'ncr');
    expect(dof?.date).toBe('2026-07-02');
    expect(dof?.note).toBe('2 uygunsuzluk');
    a.res.minor = 0;
    dofSonGunuEsitle(a, p);
    expect(p.audits.some((x) => x.sub === 'ncr')).toBe(false);
  });

  it('denetim tarihi değişince süre korunur; denetim yoksa yeni açılır', () => {
    const p = bosProfil();
    denetimTarihiAyarla(p, 'iso9001', '2026-07-10');
    expect(p.audits).toHaveLength(1);
    const a = p.audits[0];
    if (!a) throw new Error('denetim yok');
    a.end = '2026-07-12';
    denetimTarihiAyarla(p, 'iso9001', '2026-07-20');
    expect([a.date, a.end]).toEqual(['2026-07-20', '2026-07-22']);
    denetimTarihiAyarla(p, 'iso9001', 'bozuk');
    expect(p.audits).toHaveLength(1);
  });
});

describe('öneriler', () => {
  it('önerilen hazırlık dönemi kalan güne göre', () => {
    const pg = PROGRAMLAR.iso9001;
    expect([null, -1, 0, 10, 20, 40, 90].map((k) => onerilenAsama(k, pg))).toEqual([-1, 5, 4, 3, 2, 1, 0]);
  });

  it('Aşama 1 sonrası Aşama 2 önerilir (42 gün)', () => {
    const a = yeniDenetim({ prog: 'iso9001', type: PROGRAMLAR.iso9001.types[0] ?? '', date: '2026-06-01' });
    expect(PROGRAMLAR.iso9001.types[0]).toMatch(/^Aşama 1/);
    expect(sonrakiDenetimOnerisi(a)).toMatchObject({ type: PROGRAMLAR.iso9001.types[1], date: '2026-07-13' });
  });
});
