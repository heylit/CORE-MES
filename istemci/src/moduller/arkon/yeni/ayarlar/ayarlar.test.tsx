import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { depoModulu } from '../veri/depo.ts';
import { arkonAc, OPERATOR, sunucuKur, YONETICI } from '../test-ortak.tsx';

// kv belgeleri depoda { v } zarfıyla durur (store.ts). Ayarlar ve çağrı bandı: rol başına görünen kartlar, yazma yalnız kural kaydıdır, bant çağrıyı gösterir ve üstlenir. Kişi adları uydurmadır.

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); });

const bolum = async () => screen.findByRole('region', { name: 'Ayarlar' }, { timeout: 10000 });
const altSekmeler = async (b: HTMLElement) =>
  within(await within(b).findByRole('tablist', { name: 'Ayarlar bölümleri' }, { timeout: 10000 })).getAllByRole('tab').map((t) => t.textContent);
const ileti = (i: { yontem: string; yol: string; govde: unknown }, tur: string) =>
  i.yontem === 'POST' && i.yol === '/arkon/iletiler' && (i.govde as { ileti?: { type?: string } } | null)?.ileti?.type === tur;
const yazmalar = (l: { yontem: string; yol: string }[]) => l.filter((i) => i.yontem !== 'GET' && i.yol !== '/arkon/iletiler');

describe('A6 Ayarlar', () => {
  it('yönetici bütün bölümleri görür; açılışta yazma yok; salt okunur listeler kilit notuyla gelir', async () => {
    const istekler = sunucuKur(YONETICI, {
      belgeler: {
        kv: [
          { kimlik: 'shifts', surum: 1, govde: { v: [{ name: 'A', start: '08:00', end: '16:00', breaks: [{ at: '12:00', min: 30 }] }] } },
          { kimlik: 'plant', surum: 1, govde: { v: { wcs: [{ id: 'TAL', name: 'Deneme merkez' }], sts: [{ id: 'IST-1', name: 'Deneme istasyon', wc: 'TAL', t: 'cnc' }], mcs: [] } } },
        ],
      },
    });
    arkonAc('/arkon/yeni/ayarlar');
    const b = await bolum();
    expect(await altSekmeler(b)).toEqual(['Genel', 'Tesis', 'Kişiler ve yetkiler', 'Üretim', 'Sistem']);
    expect(b.querySelector('.tc-ay-bant .tc-ay-saat')?.textContent, 'saat ve vardiya eski yerinde').toMatch(/^\d\d:\d\d\S/);
    expect(within(b).getByRole('heading', { name: 'Ekran modülleri' })).toBeTruthy();
    expect(within(b).getByRole('button', { name: /Çizim stüdyosunu aç/ })).toBeTruthy();

    fireEvent.click(within(b).getByRole('tab', { name: 'Tesis' }));
    expect(await within(b).findByText('IST-1')).toBeTruthy();
    expect(within(b).getByText(/İstasyonlar sayfasından değiştirilir/)).toBeTruthy();

    fireEvent.click(within(b).getByRole('tab', { name: 'Kişiler ve yetkiler' }));
    expect(await within(b).findByText('Deneme Yonetici')).toBeTruthy();
    expect(within(b).getByText(/Roller sayfasından değiştirilir/)).toBeTruthy();
    expect(within(b).queryByRole('button', { name: /Kaydet|Kişi ekle|Düzenle/ })).toBeNull();

    fireEvent.click(within(b).getByRole('tab', { name: 'Üretim' }));
    expect(await within(b).findByText('08:00 – 16:00')).toBeTruthy();
    expect(within(b).getByRole('heading', { name: 'Çalışma kuralları' })).toBeTruthy();
    expect(within(b).getByRole('button', { name: 'Kaydet' }).hasAttribute('disabled')).toBe(true);
    expect(yazmalar(istekler)).toEqual([]);
  }, 30000);

  it('çalışma kuralı kaydedilince kv/policy yazılır ve öteki ekranlara duyurulur', async () => {
    const istekler = sunucuKur(YONETICI);
    window.localStorage.setItem('arkon:setTab', JSON.stringify('uretim'));
    arkonAc('/arkon/yeni/ayarlar');
    const b = await bolum();
    await altSekmeler(b);
    const anahtar = await within(b).findByRole('switch', { name: 'Paket yayınında kalite onayı' });
    fireEvent.click(anahtar);
    fireEvent.click(within(b).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(istekler.some((i) => i.yontem === 'POST' && i.yol === '/arkon/belgeler/kv/policy/yaz')).toBe(true); }, { timeout: 10000 });
    const yaz = istekler.find((i) => i.yol === '/arkon/belgeler/kv/policy/yaz');
    expect((yaz?.govde as { govde: { v: { approval: boolean } } }).govde.v.approval).toBe(true);
    await waitFor(() => {
      expect(istekler.some((i) => ileti(i, 'cfg'))).toBe(true);
    }, { timeout: 10000 });
  }, 30000);

  it('operatör yalnız Genel\'i görür; kural, yetki ve günlük kartı yoktur (reddedilen)', async () => {
    window.localStorage.setItem('arkon:setTab', JSON.stringify('uretim'));
    const istekler = sunucuKur(OPERATOR);
    arkonAc('/arkon/yeni/ayarlar');
    const b = await bolum();
    expect(await altSekmeler(b)).toEqual(['Genel']);
    expect(within(b).queryByRole('heading', { name: 'Çalışma kuralları' })).toBeNull();
    expect(within(b).queryByRole('button', { name: /Çizim stüdyosunu aç/ })).toBeNull();
    expect(within(b).getByRole('heading', { name: 'Deneme Operator' })).toBeTruthy();
    expect(yazmalar(istekler)).toEqual([]);
  }, 30000);
});

describe('A6 Çağrı bandı', () => {
  it('ekibine gelen çağrıyı gösterir; Üstlen üstlenme iletisini ve kaydını gönderir', async () => {
    const istekler = sunucuKur(YONETICI);
    arkonAc('/arkon/yeni/ayarlar');
    await altSekmeler(await bolum());
    const depo = await depoModulu();
    act(() => { depo.Bus.yerel({ type: 'call', t0: 1_700_000_000_000, k: 'kalite', l: 'Kalite', machine: 'IST-9', by: 'Deneme Op' }); });
    const bant = await screen.findByRole('region', { name: 'Açık çağrılar' });
    expect(within(bant).getByText(/IST-9 · Kalite/)).toBeTruthy();
    fireEvent.click(within(bant).getByRole('button', { name: 'Üstlen' }));
    await waitFor(() => { expect(screen.queryByRole('region', { name: 'Açık çağrılar' })).toBeNull(); });
    await waitFor(() => {
      expect(istekler.some((i) => ileti(i, 'call-ack'))).toBe(true);
      expect(istekler.some((i) => i.yontem === 'POST' && i.yol === '/arkon/kayitlar/calls/ekle')).toBe(true);
    }, { timeout: 10000 });
  }, 30000);

  it('üstlenme yetkisi olmayan operatöre çağrı görünmez', async () => {
    sunucuKur(OPERATOR);
    arkonAc('/arkon/yeni/ayarlar');
    await altSekmeler(await bolum());
    const depo = await depoModulu();
    act(() => { depo.Bus.yerel({ type: 'call', t0: 1_700_000_000_001, k: 'kalite', l: 'Kalite', machine: 'IST-9', by: 'Deneme Op' }); });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('region', { name: 'Açık çağrılar' })).toBeNull();
  }, 30000);
});
