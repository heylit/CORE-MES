import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { BildirimSaglayici } from '../arayuz/Bildirim.tsx';
import { anahtarlar } from './anahtarlar.ts';
import { OKUYUCU_BASI, kartNumarasiGibi, kartTusu, useKartlaKisiDegistir, type OkuyucuDurumu } from './kart-degistir.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const A: Kullanici = { id: 7, ad: 'Deneme A', islemler: [], cihazProfili: 'istasyon' };
const B: Kullanici = { id: 8, ad: 'Deneme B', islemler: [], cihazProfili: 'istasyon' };

const yaz = (metin: string, aralik: number): string | null => {
  let d: OkuyucuDurumu = OKUYUCU_BASI;
  let t = 1000;
  for (const c of [...metin, 'Enter']) {
    const r = kartTusu(d, c, t);
    d = r.durum;
    t += aralik;
    if (r.kart !== null) return r.kart;
  }
  return null;
};

describe('1898 a kart biçimi', () => {
  it('kart numarası rakam ve A-F; okuyucunun boşluğu ve küçük harfi kabul', () => {
    for (const k of ['0004123456', 'abcdef01', ' 12AB ', '4F2A9C1D']) expect(kartNumarasiGibi(k)).toBe(true);
  });
  it('etiket kodları ve geçerli denetim haneli EAN/UPC kart sayılmaz (reddedilen)', () => {
    for (const k of ['RP:12', 'LOT:5', 'UE-004512', 'LT-9', 'ABC', 'XYZ123', '4006381333931', '036000291452']) expect(kartNumarasiGibi(k)).toBe(false);
  });
  it('yalnız hızlı yazılan ve Enter ile biten kart döner; insan hızı dönmez', () => {
    expect(yaz('0004123456', 10)).toBe('0004123456');
    expect(yaz('0004123456', 200)).toBeNull();
    expect(yaz('RP:12', 10)).toBeNull();
  });
  it('okuyucunun büyük harf için bastığı Shift, CapsLock ve AltGraph onaltılık kartı bölmez', () => {
    let d: OkuyucuDurumu = OKUYUCU_BASI;
    let t = 1000;
    let kart: string | null = null;
    for (const c of ['4', 'Shift', 'F', '2', 'Shift', 'A', 'CapsLock', '9', 'AltGraph', 'C', '1', 'D', 'Enter']) {
      const r = kartTusu(d, c, t);
      d = r.durum;
      t += 10;
      kart = r.kart ?? kart;
    }
    expect(kart).toBe('4F2A9C1D');
    expect(kartTusu({ metin: '4F2', son: 1000 }, 'Tab', 1010).durum).toEqual(OKUYUCU_BASI);
  });
});

function Deneme({ etkin }: { etkin: boolean }) {
  useKartlaKisiDegistir(etkin);
  return <><input aria-label="alan" /><button type="button">dugme</button></>;
}
function kur(etkin = true) {
  const istemci = new QueryClient();
  istemci.setQueryData(anahtarlar.oturum, A);
  istemci.setQueryData(['baska', 'veri'], 'A nin verisi');
  const istekler: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_adres: string, secenek: RequestInit = {}) => {
    const govde = JSON.parse(String(secenek.body)) as { kart: string };
    istekler.push(govde);
    if (govde.kart === '0004123456') return new Response(JSON.stringify({ kullanici: B }), { status: 200 });
    return new Response(JSON.stringify({ kod: 'OTURUM_YOK', mesaj: 'Kart tanınmadı ya da bu kartla giriş kapalı.' }), { status: 401 });
  }));
  render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici><Deneme etkin={etkin} /></BildirimSaglayici>
    </QueryClientProvider>,
  );
  return { istemci, istekler };
}
const okut = (hedef: Element, metin: string) => { for (const c of [...metin, 'Enter']) fireEvent.keyDown(hedef, { key: c }); };

describe('useKartlaKisiDegistir', () => {
  it('oturum açıkken okutulan kart kişiyi değiştirir, önceki kişinin önbelleği silinir, bildirim çıkar', async () => {
    window.history.pushState(null, '', '/arkon');
    const { istemci, istekler } = kur();
    okut(screen.getByRole('button'), '0004123456');
    await waitFor(() => expect(istemci.getQueryData(anahtarlar.oturum)).toEqual(B));
    expect(istemci.getQueryData(['baska', 'veri'])).toBeUndefined();
    expect(istekler).toEqual([{ kart: '0004123456' }]);
    expect(await screen.findByText('Deneme A çıktı, Deneme B girdi.')).toBeTruthy();
    expect(window.location.pathname).toBe('/');
  });

  it('tanınmayan kart oturumu değiştirmez, hata bildirilir (reddedilen)', async () => {
    const { istemci } = kur();
    okut(document.body, '99999999');
    expect(await screen.findByText('Kart tanınmadı ya da bu kartla giriş kapalı.')).toBeTruthy();
    expect(istemci.getQueryData(anahtarlar.oturum)).toEqual(A);
  });

  it('yazı alanındaki, etiket ve ürün barkodu okutmaları, başkasının durdurduğu Enter ve kapalı kanca istek atmaz (reddedilen)', () => {
    const { istekler } = kur();
    okut(screen.getByRole('textbox'), '0004123456');
    okut(document.body, 'RP:12');
    okut(document.body, '4006381333931');
    const durdur = (o: KeyboardEvent) => { if (o.key === 'Enter') o.stopPropagation(); };
    window.addEventListener('keydown', durdur, true);
    okut(document.body, '0004123456');
    window.removeEventListener('keydown', durdur, true);
    expect(istekler).toEqual([]);
    cleanup();
    const ikinci = kur(false);
    okut(document.body, '0004123456');
    expect(ikinci.istekler).toEqual([]);
  });
});
