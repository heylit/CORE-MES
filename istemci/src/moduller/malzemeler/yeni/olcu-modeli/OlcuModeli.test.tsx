import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { ORNEK_KARTLAR, ornekKayit } from '../ornek-veri.ts';
import { YAZAN, json, sunucuKur, yeniEkranAc } from '../test-ortak.tsx';

// 3215 c: form adımında ve kart penceresinde ölçülü kesit. Kart uydurmadır (ornek-veri: C45 Ø50 x 1000 çubuk).
beforeEach(() => { localStorage.clear(); window.scrollTo = vi.fn(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

describe('3215 hammaddede ölçülü kesit', () => {
  test('kesit çizimi ölçüden çizilir ve ölçü yazınca değişir; ölçü silinince çizim kalkar', async () => {
    sunucuKur(YAZAN);
    yeniEkranAc('/malzemeler/yeni?kopya=mornek1');
    await screen.findByRole('heading', { name: 'Form ve ölçüler' });
    expect(screen.getByRole('img', { name: 'Ölçülü kesit çizimi: Ø50 × 1000' })).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: /Çap/ }), { target: { value: '80' } });
    expect(await screen.findByRole('img', { name: 'Ölçülü kesit çizimi: Ø80 × 1000' })).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: /Çap/ }), { target: { value: '' } });
    expect(screen.queryByRole('img', { name: /Ölçülü kesit çizimi/ })).toBeNull();
  });

  test('kart penceresinde föyün altında aynı kesit çizilir; hammadde olmayan ölçülü kartta (sarf, aynı biçim ve ölçü) çizim yok', async () => {
    sunucuKur(YAZAN);
    yeniEkranAc('/malzemeler?kart=mornek1');
    const p = within(await screen.findByRole('dialog'));
    expect(p.getByRole('img', { name: 'Ölçülü kesit çizimi: Ø50 × 1000' })).toBeTruthy();
    cleanup();
    sunucuKur(YAZAN);
    yeniEkranAc('/malzemeler?kart=mornek2');
    expect(within(await screen.findByRole('dialog')).queryByRole('img', { name: /Ölçülü kesit çizimi/ })).toBeNull();
  });

  test('ölçü kuralı tutmayan kartta (et kalınlığı çapın yarısından büyük boru) kesit çizilmez; tutan boruda çizilir', async () => {
    const boru = (kimlik: string, no: number, t: number) => ({ kimlik, no, surum: 1, kayit: { ...ornekKayit(kimlik, `HM-ORN-BR-${String(no)}`, 'Örnek boru'), form: 'boru', dims: { D: 40, t, l: 6000 } } });
    const liste = { 'GET /malzeme-katalogu-kartlari': () => json(200, { ...ORNEK_KARTLAR, satirlar: [boru('mb1', 11, 25), boru('mb2', 12, 3)], toplam: 2 }) };
    sunucuKur(YAZAN, liste);
    yeniEkranAc('/malzemeler?kart=mb1');
    expect(within(await screen.findByRole('dialog')).queryByRole('img', { name: /Ölçülü kesit çizimi/ })).toBeNull();
    cleanup();
    sunucuKur(YAZAN, liste);
    yeniEkranAc('/malzemeler?kart=mb2');
    expect(within(await screen.findByRole('dialog')).getByRole('img', { name: /Ölçülü kesit çizimi: Ø40/ })).toBeTruthy();
  });
});
