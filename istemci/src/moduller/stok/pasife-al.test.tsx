import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { KonumAyrintiCevabi } from '#paylasilan/sozlesme/stok.ts';
import { MUDUR, OKUYUCU, ac, json, sunucuKur } from './test-ortak.tsx';

// 139 a: ekransız `POST /stok/konumlar/:id/pasif-yap` konum ayrıntısına bağlandı. Raf, Fabrika Haritası'nın yerleşim kaydında kalkar.
describe('Konumu pasife alma (139 a)', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  const konum = (o: Partial<KonumAyrintiCevabi['konum']>): KonumAyrintiCevabi => ({
    konum: { id: 41, kod: 'FSN-02', tur: 'fason', ad: null, depoId: 1, depoKod: 'ANA', rafId: null, bolmeNo: null, katNo: null, sonSayim: null, aktif: true, satirSayisi: 0, haritaGozId: null, haritaAlanId: null, surum: 5, ...o },
    raf: null, bakiyeler: [], haritaYeri: null, zemin: null,
  });

  it('elle konum onayla pasife alınır; gövde okunan sürümü taşır, vazgeçince istek gitmez', async () => {
    const istekler = sunucuKur(MUDUR, { 'GET /stok/konumlar/41': () => json(200, konum({})), 'POST /stok/konumlar/41/pasif-yap': () => json(200, { konum: konum({ aktif: false, surum: 6 }).konum }) });
    ac('/stok/konumlar/41');
    fireEvent.click(await screen.findByRole('button', { name: /Pasife al/ }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /Vazgeç/ }));
    expect(istekler.some((i) => i.yol === '/stok/konumlar/41/pasif-yap')).toBe(false);
    fireEvent.click(await screen.findByRole('button', { name: /Pasife al/ }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Pasife al' }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/stok/konumlar/41/pasif-yap')).toBe(true));
    expect(istekler.find((i) => i.yol === '/stok/konumlar/41/pasif-yap')!.govde).toEqual({ surum: 5 });
  });

  it('pasif konumda, haritaya bağlı konumda, sabit konumda ve tanım yetkisi olmayanda düğme yok', async () => {
    const yok = async (k: KonumAyrintiCevabi, kisi = MUDUR) => {
      sunucuKur(kisi, { 'GET /stok/konumlar/41': () => json(200, k) });
      ac('/stok/konumlar/41');
      await screen.findByRole('heading', { name: k.konum.kod });
      expect(screen.queryByRole('button', { name: /Pasife al/ })).toBeNull();
      cleanup();
    };
    await yok(konum({ aktif: false }));
    await yok({ ...konum({ haritaAlanId: 4 }), haritaYeri: 'Fason alanı' });
    await yok(konum({ kod: 'KABUL', tur: 'kabul' }));
    await yok(konum({}), OKUYUCU);
  });

  it('pasif konum başlıkta "Pasif" rozetiyle görünür', async () => {
    sunucuKur(MUDUR, { 'GET /stok/konumlar/41': () => json(200, konum({ aktif: false })) });
    ac('/stok/konumlar/41');
    expect(await screen.findByText('Pasif')).toBeTruthy();
  });
});
