import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { KAPALI } from '../sabitler.ts';
import { kayitYazmalari, kmAc, MUAYENECI, MUHENDIS, OKUYAN, YONETICI } from '../test-ortak.tsx';
import type { KmVerisi } from '../veri.ts';
import { kmYetkisiKur } from '../yetki.ts';
import { dofAlanlari } from './DofFormu.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

const DOF = { _id: 'c1', no: 'DOF-2026-0001', baslik: 'Çap sapması', acilis: '2026-10-01', termin: '2026-11-01', sorumlu: 'Deneme', durum: 'Açık', adim: 2 };
const NCR = { _id: 'n1', no: 'NCR-2026-0001', tarih: '2026-10-01', durum: 'Açık', parcaNo: 'P-1', tanim: 'Çap ölçü dışı' };

const satir = async (no: string) => (await screen.findByText(no)).closest('tr') as HTMLElement;
const govde = (y: { govde: unknown }) => JSON.stringify(y.govde);

describe('DÖF yetkileri', () => {
  it('yönetici açar, düzenler ve siler', async () => {
    kmAc('dof', YONETICI, { capa: [DOF] });
    const s = within(await satir('DOF-2026-0001'));
    expect(screen.getByRole('button', { name: /DÖF aç/ })).toBeTruthy();
    expect(s.getByRole('button', { name: /Düzenle/ })).toBeTruthy();
    expect(s.getByRole('button', { name: /Sil/ })).toBeTruthy();
  });

  it('mühendis silemez (229 a)', async () => {
    kmAc('dof', MUHENDIS, { capa: [DOF] });
    const s = within(await satir('DOF-2026-0001'));
    expect(s.getByRole('button', { name: /Düzenle/ })).toBeTruthy();
    expect(s.queryByRole('button', { name: /Sil/ })).toBeNull();
  });

  it('yalnız okuyana yazma düğmesi çıkmaz, 8D kutuları kapalıdır', async () => {
    kmAc('dof', OKUYAN, { capa: [DOF] });
    const s = within(await satir('DOF-2026-0001'));
    expect(screen.queryByRole('button', { name: /DÖF aç/ })).toBeNull();
    expect(s.queryByRole('button', { name: /Düzenle/ })).toBeNull();
    expect((s.getByRole('button', { name: 'D3' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('kapalı DÖF düzenlenmez, 8D kutuları değişmez (228)', async () => {
    kmAc('dof', YONETICI, { capa: [{ ...DOF, durum: KAPALI, adim: 8 }] });
    fireEvent.click(within(await screen.findByRole('group', { name: 'Durum' })).getByRole('button', { name: 'Tümü' }));
    const s = within(await satir('DOF-2026-0001'));
    expect(s.queryByRole('button', { name: /Düzenle/ })).toBeNull();
    expect((s.getByRole('button', { name: 'D3' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('kapama seçeneği yalnız mühendise çıkar', () => {
    const veri = { ncr: [], capa: [] } as unknown as KmVerisi;
    const durumlar = (onayla: boolean) => dofAlanlari(veri, kmYetkisiKur({ oku: true, yaz: true, onayla, geriYukle: false }, false), null)
      .find((a) => a.k === 'durum')?.secenekler;
    expect(durumlar(false)).not.toContain(KAPALI);
    expect(durumlar(true)).toContain(KAPALI);
  });
});

describe('DÖF kaydı', () => {
  it('muayeneci 8D kutusuna tıklayınca adım kaydedilir', async () => {
    const { yazmalar } = kmAc('dof', MUAYENECI, { capa: [DOF] });
    fireEvent.click(within(await satir('DOF-2026-0001')).getByRole('button', { name: 'D3' }));
    await waitFor(() => expect(kayitYazmalari(yazmalar, 'capa')).toHaveLength(1));
    expect(govde(kayitYazmalari(yazmalar, 'capa')[0]!)).toContain('"adim":3');
  });

  it('NCR\'den açılan DÖF kaydedilince NCR "DÖF açıldı" olur', async () => {
    const { yazmalar } = kmAc('uygunsuzluklar', MUHENDIS, { ncr: [NCR] });
    fireEvent.click(within(await satir('NCR-2026-0001')).getByRole('button', { name: /DÖF aç/ }));
    fireEvent.change(await screen.findByLabelText(/Sorumlu/), { target: { value: 'Deneme Mühendis' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(kayitYazmalari(yazmalar, 'ncr')).toHaveLength(1));
    expect(govde(kayitYazmalari(yazmalar, 'capa')[0]!)).toContain('"ncrRef":"n1"');
    expect(govde(kayitYazmalari(yazmalar, 'ncr')[0]!)).toContain('"durum":"DÖF açıldı"');
  });
});
