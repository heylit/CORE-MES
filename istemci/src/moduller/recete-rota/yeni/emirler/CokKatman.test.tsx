import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { json, KAPI, rrAc, sunucuKur } from '../test-ortak.tsx';
import { onizlemeOrnegi } from '../rotalar/onizleme-ornegi.ts';
import { rotaDurumu } from '../rotalar/test-veri.ts';
import { cokKatmanOzeti, stoktanCikar } from './kurallar.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const kisi = (islemler: string[]): Kullanici => ({ id: 9, ad: 'Deneme 9', islemler: [KAPI, 'sayfa.recete-rota', 'recete-rota.oku', ...islemler] as Kullanici['islemler'] });
const ONIZLEME = '/rota/revizyonlar/71/patlatma-onizleme';
const KOPYA = '/rota/revizyonlar/71/emre-kopyala';
const sunucu = (islemler: string[], onizleme = onizlemeOrnegi()) => sunucuKur(kisi(islemler), {
  durum: rotaDurumu(),
  yazmalar: {
    [`GET ${ONIZLEME}`]: () => json(200, onizleme),
    'GET /rota/urunler/11': () => json(200, { revizyonlar: [{ id: 71, harf: 'A', durum: 'yururlukte' }] }),
    'GET /adimli-emirler/acilis-secenekleri': () => json(200, { projeZorunlu: false, projeler: [] }),
    [`POST ${KOPYA}`]: () => json(200, { uretimEmriId: 62, isEmriIdleri: [1, 2, 3] }),
  },
});
const formAc = async () => {
  const b = await screen.findByRole('region', { name: 'Üretim emirleri' });
  fireEvent.click(await within(b).findByRole('button', { name: 'Yeni üretim emri' }));
  return within(b).findByRole('region', { name: 'Yeni üretim emri' });
};

describe('1476-F çok katmanlı seçim kuralları', () => {
  it('stoktan seçilen düğüm alt ağacıyla çıkar; gönderilen yalnız en üstteki seçimdir; kök çıkmaz', () => {
    const d = onizlemeOrnegi().dugumler;
    expect(stoktanCikar('0.1.1', new Set(['0.1']))).toBe(true);
    expect(stoktanCikar('0.10', new Set(['0.1']))).toBe(false);
    expect(stoktanCikar('0', new Set(['0']))).toBe(false);
    expect(cokKatmanOzeti(d, new Set())).toMatchObject({ parca: 3, kokAdim: 1, altAdim: 2, gonderilecek: [] });
    expect(cokKatmanOzeti(d, new Set(['0.1', '0.1.1']))).toMatchObject({ parca: 1, kokAdim: 1, altAdim: 0, gonderilecek: ['0.1'] });
  });
});

describe('1476-F emir açılışında çok katmanlı seçim: izinli', () => {
  it('işaretlenince bölme gizlenir, durum seçilebilir kalır; stoktan seçilen düğüm emre kopya gövdesine gider', async () => {
    const istekler = sunucu(['rota.emre-kopyala']);
    rrAc();
    const form = await formAc();
    const kutu = await within(form).findByRole('checkbox', { name: 'Çok katmanlı: alt parçalar bu emirde üretilir' });
    expect((kutu as HTMLInputElement).checked).toBe(false);
    fireEvent.click(kutu);
    expect((within(form).getByRole('combobox', { name: 'Durum' }) as HTMLSelectElement).disabled).toBe(false);
    expect(within(form).getByText(/açılırken bölünmez/)).toBeTruthy();
    fireEvent.click(within(within(form).getByRole('group', { name: 'K1 karşılama' })).getByRole('button', { name: /Stoktan/ }));
    expect(within(form).getByText('Üst parça stoktan; bu parça da emre girmez')).toBeTruthy();
    fireEvent.click(within(form).getByRole('button', { name: 'Emri oluştur' }));
    await waitFor(() => expect(istekler.some((i) => i.yol === KOPYA)).toBe(true));
    expect(istekler.find((i) => i.yol === KOPYA)?.govde).toMatchObject({ cokKatmanli: true, stoktanDugumler: ['0.1'] });
    expect(istekler.find((i) => i.yol === KOPYA)?.govde).not.toHaveProperty('taslak');
  });

  it('işaretlenmezse gövde bugünkü gibidir (çok katmanlı alanı yok)', async () => {
    const istekler = sunucu(['rota.emre-kopyala']);
    rrAc();
    const form = await formAc();
    await within(form).findByRole('checkbox', { name: /Çok katmanlı/ });
    fireEvent.click(within(form).getByRole('button', { name: 'Emri oluştur' }));
    await waitFor(() => expect(istekler.some((i) => i.yol === KOPYA)).toBe(true));
    expect(istekler.find((i) => i.yol === KOPYA)?.govde).not.toHaveProperty('cokKatmanli');
  });

  it('engel varsa kutu kapalıdır ve nedeni gösterilir', async () => {
    sunucu(['rota.emre-kopyala'], onizlemeOrnegi({ engel: 'Kök başına adet tam sayı olmalı.' }));
    rrAc();
    const form = await formAc();
    const kutu = await within(form).findByRole('checkbox', { name: /Çok katmanlı/ });
    expect((kutu as HTMLInputElement).disabled).toBe(true);
    expect(within(form).getByRole('alert').textContent).toMatch(/tam sayı/);
  });
});

describe('1476-F emir açılışında çok katmanlı seçim: reddedilen', () => {
  it('rota.emre-kopyala olmayan seçimi görmez ve önizleme sorulmaz', async () => {
    const istekler = sunucu(['uretim-emirleri.yaz']);
    rrAc();
    const b = await screen.findByRole('region', { name: 'Üretim emirleri' });
    fireEvent.click(await within(b).findByRole('button', { name: 'Yeni üretim emri' }));
    await within(b).findByText(/Emir açmak için mamul ya da yarı mamul gerekli/);
    expect(within(b).queryByRole('checkbox', { name: /Çok katmanlı/ })).toBeNull();
    expect(istekler.some((i) => i.yol === ONIZLEME)).toBe(false);
  });
});
