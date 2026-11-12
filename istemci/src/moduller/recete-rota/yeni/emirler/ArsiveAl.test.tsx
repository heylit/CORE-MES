import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { emirSayfasiAc, json, ornekDurum, rrAc, sunucuKur, YONETICI } from '../test-ortak.tsx';
import { arsivOzeti, type ArsivOnizlemesi } from './ArsiveAl.tsx';

// 2721: başlamış emir iptal edilmez; önizlemeli uyarıyla durdurulup arşive alınır. Veri uydurmadır.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ONIZLEME: ArsivOnizlemesi = {
  surum: 3, calisan: [{ opNo: 20, ad: 'Frezeleme', operator: 'Deneme 4' }], saglam: 6, hurda: 1, kararBekleyen: 2, fasonda: [], hataliAcik: 1, engel: null,
  uyarilar: ['İptal hiç başlamamış emri plandan kaldırır; arşiv başlamış emri durdurur.', 'Tezgâhtaki parçaları amire teslim edin.'],
};
const durumlu = (status: 'uretimde' | 'iptal') => () => {
  const d = ornekDurum();
  return { ...d, emirler: d.emirler && { ...d.emirler, orders: d.emirler.orders.map((o) => ({ ...o, status })) } };
};
const basladi = durumlu('uretimde');
const ac = async (onizleme: ArsivOnizlemesi) => {
  const istekler = sunucuKur(YONETICI, {
    durum: () => json(200, basladi()),
    yazmalar: {
      'GET /adimli-emirler/61/arsiv-onizleme': () => json(200, onizleme),
      'POST /adimli-emirler/61/arsive-al': () => json(200, {}),
    },
  });
  // 3039: emrin işlemleri Üretim Emirleri'nin emir sayfasındadır.
  emirSayfasiAc(61);
  const b = await screen.findByRole('region', { name: 'Emir sayfası' });
  fireEvent.click(await within(b).findByRole('button', { name: 'UE-0001 işlemleri' }));
  expect(screen.queryByRole('menuitem', { name: 'İptal et' })).toBeNull();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Durdur ve arşive al' }));
  const pencere = await screen.findByRole('dialog', { name: 'UE-0001 arşive alınsın mı?' });
  return { istekler, pencere };
};

describe('2721 başlamış emri arşive alma', () => {
  it('özet satırları yalnız verisi olanı yazar; bilinmeyen sayım sıfır yazılmaz', () => {
    expect(arsivOzeti(ONIZLEME)).toEqual([
      'OP 20 Frezeleme çalışıyor (Deneme 4): durdurulur.', 'Sayılan: 6 sağlam, 1 hurda; kalır.', '2 adet kalite kararı bekliyor; karar kapanışta verilir.',
      '1 açık hatalı parça kaydı var.',
    ]);
    expect(arsivOzeti({ ...ONIZLEME, calisan: [], saglam: null, hurda: null, kararBekleyen: null, hataliAcik: 0, fasonda: [{ opNo: 30, adet: 4 }] }))
      .toEqual(['OP 30: fasonda 4 parça.']);
    expect(arsivOzeti({ ...ONIZLEME, calisan: [{ opNo: null, ad: null, operator: null }] })[0]).toBe('İş çalışıyor: durdurulur.');
  });

  it('başlamış emirde İptal yerine arşiv; uyarılar okunur, onaydan sonra sürümle ve onayla gider', async () => {
    const { istekler, pencere } = await ac(ONIZLEME);
    await within(pencere).findByText('İptal hiç başlamamış emri plandan kaldırır; arşiv başlamış emri durdurur.');
    expect(within(pencere).getByText('Tezgâhtaki parçaları amire teslim edin.')).toBeTruthy();
    expect(within(pencere).getByText('OP 20 Frezeleme çalışıyor (Deneme 4): durdurulur.')).toBeTruthy();
    expect(istekler.some((i) => i.yol.endsWith('/arsive-al'))).toBe(false);
    fireEvent.click(within(pencere).getByRole('button', { name: 'Durdur ve arşive al' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/adimli-emirler/61/arsive-al')?.govde).toEqual({ surum: 3, onay: true }));
  });

  it('engel varsa düğme kapalı ve nedeni yazılı', async () => {
    const { istekler, pencere } = await ac({ ...ONIZLEME, engel: 'Açık kolu olan emir arşive alınamaz.' });
    await within(pencere).findByText('Açık kolu olan emir arşive alınamaz.');
    const dugme = within(pencere).getByRole('button', { name: 'Durdur ve arşive al' }) as HTMLButtonElement;
    expect(dugme.disabled).toBe(true);
    fireEvent.click(dugme);
    expect(istekler.some((i) => i.yol.endsWith('/arsive-al'))).toBe(false);
  });

  it('arşivdeki emirde kapanış açıksa bağlantı çıkar; kapanışı olmayan iptal emirde çıkmaz', async () => {
    for (const [cevap, var_] of [[json(200, { asama: 'onay' }), true], [json(404, { kod: 'KAPANIS_YOK', mesaj: 'Kapanış yok.' }), false]] as const) {
      sunucuKur(YONETICI, { durum: () => json(200, durumlu('iptal')()), yazmalar: { 'GET /adimli-emirler/61/kapanis': () => cevap.clone() } });
      rrAc();
      const b = await screen.findByRole('region', { name: 'Üretim emirleri' });
      fireEvent.click(within(await within(b).findByRole('group', { name: 'Durum' })).getByRole('button', { name: /^Tümü/ }));
      fireEvent.click(await within(b).findByRole('button', { name: /UE-0001/ }));
      if (var_) expect(await within(b).findByRole('button', { name: 'Kapanış onayları' })).toBeTruthy();
      else {
        await waitFor(() => expect(within(b).getByRole('region', { name: 'UE-0001 ayrıntısı' })).toBeTruthy());
        await new Promise((r) => { setTimeout(r, 50); });
        expect(within(b).queryByRole('button', { name: 'Kapanış onayları' })).toBeNull();
      }
      cleanup(); vi.unstubAllGlobals();
    }
  });
});
