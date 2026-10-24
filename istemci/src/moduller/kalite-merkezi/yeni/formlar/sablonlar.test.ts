import { describe, expect, it } from 'vitest';
import { formBul, formListesi, tasarimBaslangici, tasarimHatasi } from './sablonlar.ts';

describe('form listesi', () => {
  it('modül formları, standart formlar ve kullanıcı formları koda göre sıralı gelir', () => {
    const l = formListesi([{ _id: 't1', kod: 'KF-30', ad: 'Özel', rev: '02', dsl: '? m' }], { rev: '03', yururluk: '2026-01-01' });
    expect(l.map((f) => f.kod).slice(0, 3)).toEqual(['KF-01', 'KF-02', 'KF-03']);
    expect(formBul(l, 'KF-01')).toMatchObject({ tip: 'bagli', rev: '03', yurur: '2026-01-01' });
    expect(formBul(l, 'KF-08')).toMatchObject({ tip: 'dsl', rev: '00' });
    expect(formBul(l, 'KF-08')?.ozel).toBeUndefined();
    expect(formBul(l, 'KF-30')).toMatchObject({ tip: 'dsl', ozel: 'kullanici', rev: '02' });
    expect(l.at(-1)?.kod).toBe('KF-30');
  });

  it('değiştirilmiş standart form kaydın revizyonunu ve metnini taşır, eksik alanı standarttan alır', () => {
    const l = formListesi([{ _id: 't2', kod: 'KF-08', rev: '01', dsl: '? yeni madde' }], undefined);
    expect(formBul(l, 'KF-08')).toMatchObject({ ozel: 'degistirildi', rev: '01', dsl: '? yeni madde', ad: 'FOD kontrol listesi' });
  });
});

describe('form tasarımı', () => {
  const bos = formListesi([], undefined);
  it('var olan standart formda revizyon artar, yeni formda sıradaki kod gelir', () => {
    expect(tasarimBaslangici(formBul(bos, 'KF-09'), [], '2026-10-23')).toMatchObject({ kod: 'KF-09', rev: '01', yurur: '2026-10-23' });
    expect(tasarimBaslangici(undefined, [{ _id: 'a', kod: 'KF-30' }], '2026-10-23')).toMatchObject({ kod: 'KF-31', rev: '00' });
  });

  it('kurallar uygulamadaki sırayla', () => {
    const t = tasarimBaslangici(undefined, [], '2026-10-23');
    expect(tasarimHatasi({ ...t, dsl: '# Boş' }, undefined, [])).toMatch(/en az bir alan/);
    expect(tasarimHatasi({ ...t, kod: 'KF-01' }, undefined, [])).toMatch(/modül formuna/);
    expect(tasarimHatasi(t, undefined, [{ _id: 'x', kod: t.kod }])).toMatch(/başka bir form/);
    expect(tasarimHatasi({ ...t, kod: 'KF-08' }, undefined, [])).toMatch(/standart bir forma/);
    const kf08 = formBul(bos, 'KF-08');
    expect(tasarimHatasi({ ...tasarimBaslangici(kf08, [], '2026-10-23'), rev: '00', dsl: '? değişti' }, kf08, [])).toMatch(/revizyon/);
    expect(tasarimHatasi({ ...tasarimBaslangici(kf08, [], '2026-10-23'), dsl: '? değişti' }, kf08, [])).toBeNull();
  });
});
