import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { rrAc, sunucuKur, YONETICI } from '../test-ortak.tsx';
import { sureMetni } from './SureSeridi.tsx';
import { adimOrnegi, revizyonOrnegi, rotaDurumu } from './test-veri.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); try { localStorage.clear(); } catch { /* test ortamında depo yoksa */ } });

// 3482 a: üst alan açık tek kart; uyarılar tek açılır satırda, süre şeridinde bloğun süresi yazılır. Veriler uydurmadır.
const bolumAc = async () => {
  const bolge = await screen.findByRole('region', { name: 'Ürün ve rotalar' });
  await waitFor(() => { expect(bolge.querySelector('.tc-rr1-hatli')).not.toBeNull(); });
  return bolge;
};
const fasonlu = (ilkGiren = true) => rotaDurumu([revizyonOrnegi('72', 'B', 'taslak', 4, [
  adimOrnegi(ilkGiren ? {} : { ins: [] }),
  adimOrnegi({ id: 'o20', seq: 20, opNo: 20, stationId: null, fasonId: '7', setup: null, proc: null, cycle: null, terminGun: 3, ins: [] }),
])]);

describe('3482 ürün ve rotalar üst alanı', () => {
  it('süre metni: bir saatin altı dakika, üstü saat', () => {
    expect(sureMetni(0.2)).toBe('1 dk altı');
    expect(sureMetni(9)).toBe('9 dk');
    expect(sureMetni(74)).toBe('1,2 sa');
  });

  it('yalnız bilgi uyarısı varken uyarılar kapalı gelir; fason bloğu gün ve ölçek dışı yazar, işlem bloğu süresini yazar', async () => {
    sunucuKur(YONETICI, { durum: fasonlu() });
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    const uyarilar = await waitFor(() => { const u = bolge.querySelector<HTMLDetailsElement>('[data-parca="rota-uyarilari"]'); expect(u).not.toBeNull(); return u!; });
    expect(uyarilar.open).toBe(false);
    expect(within(uyarilar).getByText('1 uyarı')).toBeTruthy();
    expect(within(uyarilar).getByText('1 bilgi')).toBeTruthy();
    expect(within(uyarilar).queryByText(/eksik$/)).toBeNull();
    expect(within(uyarilar).getByText(/Fason dönüşünde GKK yok: OP 20/).closest('.tc-rr1-warnbox')?.className).toContain('tc-rr1-warnbox-bilgi');
    const serit = within(bolge).getByRole('region', { name: 'Süre şeridi' });
    expect(within(serit).getByText('3 gün · ölçek dışı')).toBeTruthy();
    expect(within(serit).getByText('fason (gün, ölçek dışı)', { exact: false })).toBeTruthy();
    const op10 = within(serit).getByRole('button', { name: /^OP 10 / });
    expect(op10.querySelector('.tc-rr1-ss-sure')?.textContent).toMatch(/(dk|sa)$/);
  }, 30000);

  it('eksik varsa uyarılar açık gelir, eksik kırmızı ve önce yazılır', async () => {
    sunucuKur(YONETICI, { durum: fasonlu(false) });
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    const uyarilar = await waitFor(() => { const u = bolge.querySelector<HTMLDetailsElement>('[data-parca="rota-uyarilari"]'); expect(u).not.toBeNull(); return u!; });
    expect(uyarilar.open).toBe(true);
    expect(within(uyarilar).getByText('2 uyarı')).toBeTruthy();
    expect(within(uyarilar).getByText('1 eksik')).toBeTruthy();
    const kutular = [...uyarilar.querySelectorAll('.tc-rr1-warnbox')];
    expect(kutular.map((k) => k.className.includes('tc-rr1-warnbox-hata'))).toEqual([true, false]);
    expect(within(uyarilar).getByRole('alert').textContent).toMatch(/^Rota eksik: OP 10/);
  }, 30000);
});
