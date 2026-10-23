import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { KAPALI, MRB, NCR_DURUM } from '../sabitler.ts';
import { kayitYazmalari, kmAc, MUAYENECI, MUHENDIS, OKUYAN, YONETICI } from '../test-ortak.tsx';
import { kmYetkisiKur } from '../yetki.ts';
import { ncrAlanlari } from './NcrFormu.tsx';
import type { KmVerisi } from '../veri.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

const ACIK = { _id: 'n1', no: 'NCR-2026-0001', tarih: '2026-10-01', durum: 'Açık', parcaNo: 'P-1', tanim: 'Çap ölçü dışı', mrb: 'Karar bekliyor' };
const KAPALI_KAYIT = { _id: 'n2', no: 'NCR-2026-0002', tarih: '2026-09-01', durum: KAPALI, parcaNo: 'P-2', tanim: 'Çapak', mrb: 'Hurda' };

const satir = async (no: string) => (await screen.findByText(no)).closest('tr') as HTMLElement;
const secenekleri = (k: string, y: ReturnType<typeof kmYetkisiKur>) => {
  const veri = { ncr: [], sup: [] } as unknown as KmVerisi;
  const a = ncrAlanlari(veri, y, null).find((x) => x.k === k);
  return (a?.secenekler ?? []).map((s) => (Array.isArray(s) ? s[0] : s));
};

describe('Uygunsuzluklar yetkileri', () => {
  it('yönetici kayıt, düzenleme, DÖF açma ve silme düğmelerini görür', async () => {
    kmAc('uygunsuzluklar', YONETICI, { ncr: [ACIK] });
    const s = within(await satir('NCR-2026-0001'));
    expect(screen.getByRole('button', { name: /Uygunsuzluk kaydet/ })).toBeTruthy();
    expect(s.getByRole('button', { name: /Düzenle/ })).toBeTruthy();
    expect(s.getByRole('button', { name: /DÖF aç/ })).toBeTruthy();
    expect(s.getByRole('button', { name: /Sil/ })).toBeTruthy();
  });

  it('mühendis düzenler ama silemez (229 a)', async () => {
    kmAc('uygunsuzluklar', MUHENDIS, { ncr: [ACIK] });
    const s = within(await satir('NCR-2026-0001'));
    expect(s.getByRole('button', { name: /Düzenle/ })).toBeTruthy();
    expect(s.queryByRole('button', { name: /Sil/ })).toBeNull();
  });

  it('yalnız okuyana yazma düğmesi çıkmaz, rapor kalır', async () => {
    kmAc('uygunsuzluklar', OKUYAN, { ncr: [ACIK] });
    const s = within(await satir('NCR-2026-0001'));
    expect(screen.queryByRole('button', { name: /Uygunsuzluk kaydet/ })).toBeNull();
    expect(s.queryByRole('button', { name: /Düzenle/ })).toBeNull();
    expect(s.queryByRole('button', { name: /DÖF aç/ })).toBeNull();
    expect(s.queryByRole('button', { name: /Sil/ })).toBeNull();
    expect(s.getByRole('button', { name: /Rapor/ })).toBeTruthy();
  });

  it('kapalı kayıtta düzenleme yoktur (228)', async () => {
    kmAc('uygunsuzluklar', YONETICI, { ncr: [KAPALI_KAYIT] });
    fireEvent.click(within(await screen.findByRole('group', { name: 'Durum' })).getByRole('button', { name: 'Tüm durumlar' }));
    const s = within(await satir('NCR-2026-0002'));
    expect(s.queryByRole('button', { name: /Düzenle/ })).toBeNull();
  });

  it('yönetici silmeyi onaylayınca silme ucuna gider', async () => {
    const { yazmalar } = kmAc('uygunsuzluklar', YONETICI, { ncr: [ACIK] });
    fireEvent.click(within(await satir('NCR-2026-0001')).getByRole('button', { name: /Sil/ }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Sil' }));
    await waitFor(() => expect(yazmalar.some((y) => y.yol.endsWith('/kayitlar/ncr/n1/sil'))).toBe(true));
  });

  it('kapama ve MRB kararı yalnız mühendise seçenek olarak çıkar', () => {
    const muayeneci = kmYetkisiKur({ oku: true, yaz: true, onayla: false, geriYukle: false }, false);
    const muhendis = kmYetkisiKur({ oku: true, yaz: true, onayla: true, geriYukle: false }, false);
    expect(secenekleri('durum', muayeneci)).not.toContain(KAPALI);
    expect(secenekleri('mrb', muayeneci)).toEqual(['Karar bekliyor']);
    expect(secenekleri('durum', muhendis)).toEqual([...NCR_DURUM]);
    expect(secenekleri('mrb', muhendis)).toEqual([...MRB]);
  });
});

describe('Uygunsuzluk kaydı', () => {
  it('muayeneci açık kaydı günceller; gövde kimliği ve değişikliği taşır', async () => {
    const { yazmalar } = kmAc('uygunsuzluklar', MUAYENECI, { ncr: [ACIK] });
    fireEvent.click(within(await satir('NCR-2026-0001')).getByRole('button', { name: /Düzenle/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'İleri' }));
    fireEvent.change(await screen.findByLabelText(/Lot \/ seri no/), { target: { value: 'L-7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(kayitYazmalari(yazmalar, 'ncr')).toHaveLength(1));
    const y = kayitYazmalari(yazmalar, 'ncr')[0]!;
    expect(y.yol).toContain('/kayitlar/ncr/n1/');
    expect(JSON.stringify(y.govde)).toContain('L-7');
  });
});
