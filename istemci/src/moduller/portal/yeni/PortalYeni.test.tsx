import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, within } from '@testing-library/react';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { adres, ustGorunum } from './PortalYeni.tsx';
import { ornekDepo } from './ornek-veri.ts';
import { ac, sunucuKur } from './test-ortak.tsx';

// Kişi adları uydurmadır. Yeni ekran kapısı: kisiler.rol-yonet; portal girişi: sayfa.portal, portal.oku ya da portal.yaz.
const KAPI = 'kisiler.rol-yonet';
const kisi = (id: number, islemler: Kullanici['islemler']): Kullanici => ({ id, ad: `Deneme Kişi ${String(id)}`, islemler });

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('PortalYeni', () => {
  it('kapıdan geçemeyen kişiye hazırlanıyor der ve portal uçlarına gitmez', async () => {
    const istekler = sunucuKur(kisi(5, ['sayfa.portal', 'portal.oku']), ornekDepo());
    ac('/portal/yeni');
    expect(await screen.findByText('Bu ekran hazırlanıyor')).toBeTruthy();
    expect(istekler.some((i) => i.yol.startsWith('/portal/'))).toBe(false);
  });

  it('kapıdan geçen ama portal izni olmayan kişiye yetki yok der', async () => {
    const istekler = sunucuKur(kisi(5, [KAPI]), ornekDepo());
    ac('/portal/yeni');
    expect(await screen.findByText("Müşteri ve Tedarikçi Portalı'nı görme yetkiniz yok.")).toBeTruthy();
    expect(istekler.some((i) => i.yol.startsWith('/portal/'))).toBe(false);
  });

  it('kişinin portal kullanıcısının izinleriyle bölümleri sayılarıyla gösterir', async () => {
    const istekler = sunucuKur(kisi(5, [KAPI, 'portal.oku', 'portal.yaz']), ornekDepo());
    ac('/portal/yeni');
    const bolumler = await screen.findByRole('tablist', { name: 'Bölümler' }, { timeout: 5000 });
    const adlar = within(bolumler).getAllByRole('tab').map((s) => s.textContent);
    // Satınalmacının satış, belge ve kalite izni yok; satın alma bölümü 231 a ile taşınmaz.
    expect(adlar).toEqual(['Ana sayfa', 'Onaylarım (1)']);
    expect(istekler.some((i) => i.yontem === 'POST' && i.yol === '/portal/ben/hazirla')).toBe(true);
  });

  it('taşınmayan işi sahibinde açtırır; izni olmayan görünümü açmaz', async () => {
    sunucuKur(kisi(6, [KAPI, 'portal.oku']), ornekDepo());
    const ilk = ac('/portal/yeni/order?tur=sales&id=o2');
    expect(await screen.findByText('Bu iş Siparişler ekranında yapılır.', {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Siparişler ekranında aç' }).getAttribute('href')).toBe('/siparisler');
    ilk.unmount();
    const ikinci = ac('/portal/yeni/payments');
    expect((await screen.findByRole('link', { name: /eski ekran/ }, { timeout: 5000 })).getAttribute('href')).toBe('/portal');
    ikinci.unmount();
    // Kabuk izni parça ekranından önce denetler; sınama parçanın içeriğine bağlı değildir.
    ac('/portal/yeni/sales');
    expect(await screen.findByText('Bu bölümü görme yetkiniz yok.', {}, { timeout: 5000 })).toBeTruthy();
  });

  it('adres ve alt sekme çözümü', () => {
    expect(adres('home')).toBe('/portal/yeni');
    expect(adres('order', 'o1', { tur: 'sales' })).toBe('/portal/yeni/order?tur=sales&id=o1');
    expect(ustGorunum('neworder', 'sales', null)).toBe('sorders');
    expect(ustGorunum('order', 'o1', null)).toBe('porders');
    expect(ustGorunum('rfq', 'r1', null)).toBe('purchase');
  });
});
