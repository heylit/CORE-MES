import { describe, expect, it } from 'vitest';
import { ekranDurumuOku, ekranDurumuYaz, ilkEkranDurumu } from './ekran-durumu.ts';
import { bosProfil, depoMetni, depoOku, profilNormalize } from './normalize.ts';

describe('depoOku', () => {
  it('boş ya da bozuk kayıtta tek boş profil açar', () => {
    for (const m of [null, '', '{bozuk', '[]', '{"order":[],"data":{}}']) {
      const d = depoOku(m);
      expect(d.order).toHaveLength(1);
      expect(d.data[d.active]).toBeDefined();
    }
  });

  it('kayıt gidip gelince değişmez', () => {
    const p = bosProfil();
    p.profile.firma = 'Deneme';
    p.pw.as9100.ans = { q1: '2' };
    const d = depoOku(JSON.stringify({ active: 'x', order: ['x'], data: { x: p }, lastBackup: 5 }));
    expect(depoOku(depoMetni(d))).toEqual(d);
    expect(d.data['x']?.pw.as9100.ans).toEqual({ q1: '2' });
    expect(d.lastBackup).toBe(5);
  });

  it('geçersiz etkin profil ilk profile düşer; sırada olmayan profil alınmaz', () => {
    const d = depoOku(JSON.stringify({ active: 'yok', order: ['a', 'b'], data: { a: {} } }));
    expect(d.order).toEqual(['a']);
    expect(d.active).toBe('a');
  });

  it('alan yalnız aynı türdeyse alınır', () => {
    const p = profilNormalize({ ux: 'uzman', prog: 'bilinmez', pw: { iso9001: { curQ: 'üç', def: true } } });
    expect(p.ux).toBe('uzman');
    expect(p.prog).toBe('iso9001');
    expect(p.pw.iso9001.curQ).toBe(0);
    expect(p.pw.iso9001.def).toBe(true);
  });
});

describe('ekran durumu', () => {
  it('ilk açılışta kayıttaki son değerden başlar, sonra kişinin tarayıcısından okunur', () => {
    const p = bosProfil();
    p.prog = 'eydep';
    p.kys.tab = 'surec';
    expect(ekranDurumuOku(77, p)).toEqual(ilkEkranDurumu(p));
    const e = ilkEkranDurumu(p);
    e.program = 'as9100';
    ekranDurumuYaz(77, e);
    expect(ekranDurumuOku(77, p).program).toBe('as9100');
    expect(ekranDurumuOku(78, p).program).toBe('eydep');
  });

  it('bozuk saklanan değer ilk değere düşer', () => {
    const p = bosProfil();
    window.localStorage.setItem('tmiv2:denetim-hazirlik:ekran:9', JSON.stringify({ program: 'yok', kys: { tab: 'x' }, pw: { iso9001: { prepView: 'z', cur: 'a' } } }));
    const e = ekranDurumuOku(9, p);
    expect(e).toEqual(ilkEkranDurumu(p));
  });
});
