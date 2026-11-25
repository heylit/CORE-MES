import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { KabulNotu, KabulYazma } from './KabulYazma.tsx';

// 3703: Kabulü yaz penceresi. Fason dönüşü Stok'un onayıyla yazılır; ara stokta Stok'a kayıt yazılmaz, adım yalnız sayılır. Değerler uydurmadır.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const json = (d: number, g: unknown) => new Response(JSON.stringify(g), { status: d });
const BELGE = { id: 9, no: 'MK-000009', tur: 'satin_alma', irsaliyeNo: null, zaman: '2026-11-25T10:00:00+03:00', kisiAd: 'D', satirSayisi: 1, farkSayisi: 0, duzeltilenId: null, duzeltenId: null };
const FASON_SATIRI = { id: 41, siparisNo: 'SAS-41', talepNo: 'TLP-41', tedarikciAdi: 'ORN-Firma A', malzemeId: 950, malzemeTur: 'hizmet', kalemAdi: 'ORN-Flanş', miktar: '120.000', kalanMiktar: '120.000', birim: 'adet', beklenenTeslim: null, isEmriId: 77, emirNo: 'ORN-UE-1' };
const FASON_ISI = { isEmriId: 77, emirNo: 'ORN-UE-1', opNo: 30, adim: 'Isıl işlem', gonderilen: 120, donen: 0, hurda: 0, donenKart: { malzemeId: 960, kod: 'ORN-K', ad: 'Mil', birim: 'adet' }, statulu: false };

function sunucu(islemler: string[], ek: Record<string, () => Response> = {}) {
  const istekler: { yontem: string; yol: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, s?: RequestInit) => {
    const yol = adres.replace('/api', '').split('?')[0]!;
    const yontem = s?.method ?? 'GET';
    istekler.push({ yontem, yol, govde: s?.body ? JSON.parse(String(s.body)) : undefined });
    if (yol === '/oturum') return json(200, { kullanici: { id: 5, ad: 'ORN Depocu', islemler } });
    if (yol === '/stok/acik-siparis-satirlari') return json(200, { satirlar: ek['fason'] ? [FASON_SATIRI] : [] });
    if (yol === '/stok/konumlar') return json(200, { satirlar: [{ id: 3 }] });
    if (yol === '/stok/fason-isleri') return json(200, { isler: [FASON_ISI] });
    const f = ek[`${yontem} ${yol}`];
    return f ? f() : json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}
const ac = (o: Partial<Parameters<typeof KabulYazma>[0]> = {}) => {
  const yazildi = vi.fn();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
    <KabulYazma emirNo="ORN-UE-1" sayilan={30} yazilan={0} hedef={80} yazildi={yazildi} vazgec={() => undefined} {...o} />
  </QueryClientProvider>);
  return yazildi;
};

describe('Kabulü yaz penceresi (3703)', () => {
  it('ara stok: Stok isteği göndermez, onaylanınca adet terminale döner', async () => {
    const istekler = sunucu(['stok.giris']);
    const yazildi = ac();
    expect(await screen.findByText(/30 adet ara stok olarak sayılır; Stok'a kayıt yazılmaz/)).toBeTruthy();
    expect(screen.getByText(/Yarım kabul: 30 \/ 80/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Kabulü onayla' }));
    expect(yazildi).toHaveBeenCalledWith(30, "30 adet ara stok olarak sayıldı (Stok'a yazılmadı).");
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
  });

  it('stok.giris yetkisi yoksa ve paket fasonDonusu bilmiyorsa tür bilinemez: adım kapatılmaz, Stok isteği gitmez', async () => {
    const istekler = sunucu([]);
    const yazildi = ac();
    expect((await screen.findByRole('alert')).textContent).toContain('kabul türü bilinemiyor');
    expect(screen.queryByRole('button', { name: /Kabulü/ })).toBeNull();
    expect(yazildi).not.toHaveBeenCalled();
    expect(istekler.some((i) => i.yol.startsWith('/stok/'))).toBe(false);
  });

  it('paket fasonDonusu false ise yetkisiz kullanıcı da ara stoğu sayar; Stok isteği gitmez', async () => {
    const istekler = sunucu([]);
    const yazildi = ac({ fasonDonusu: false });
    fireEvent.click(await screen.findByRole('button', { name: 'Kabulü onayla' }));
    expect(yazildi).toHaveBeenCalledWith(30, "30 adet ara stok olarak sayıldı (Stok'a yazılmadı).");
    expect(istekler.some((i) => i.yol.startsWith('/stok/') || i.yontem === 'POST')).toBe(false);
  });

  it('paket fasonDonusu true ise yetkisiz kullanıcı kapatamaz (fason yalnız yetkiliyle)', async () => {
    sunucu([]);
    const yazildi = ac({ fasonDonusu: true });
    expect((await screen.findByRole('alert')).textContent).toContain('stok girişi yetkisi');
    expect(screen.queryByRole('button', { name: /Kabulü/ })).toBeNull();
    expect(yazildi).not.toHaveBeenCalled();
  });

  it('0 adetle onay çıkmaz', async () => {
    sunucu(['stok.giris']);
    ac({ sayilan: 0 });
    expect(await screen.findByText(/0 adet kabul edilemez/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Kabulü onayla' })).toBeNull();
  });

  it('fason emri karantina onayını açar; sayılan adet firmada kalandan azsa yarım kabul yazar', async () => {
    const istekler = sunucu(['stok.giris'], { fason: () => json(200, {}), 'POST /stok/mal-kabul': () => json(200, { belge: BELGE, hareketIdler: [1] }) });
    const yazildi = ac({ hedef: 120, sayilan: 48 });
    expect(await screen.findByText('Karantina, karar bekliyor')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Kabulü yaz/ }));
    await waitFor(() => expect(yazildi).toHaveBeenCalledWith(48, expect.stringContaining('48 adet karantinaya girdi')));
    expect((istekler.find((i) => i.yontem === 'POST')!.govde as { satirlar: { fasonIsi: unknown }[] }).satirlar[0]!.fasonIsi).toEqual({ isEmriId: 77 });
  });
});

describe('Kabul notu (3703)', () => {
  it('hedefe varınca Kabul +1 kapalı nedenini ve kabul edilen adedi söyler; ikisi de yoksa çizilmez', () => {
    const { container, rerender } = render(<KabulNotu sayilan={80} yazilan={30} hedef={80} />);
    expect(container.textContent).toContain('Hedef 80 adet; fazlası kabul edilmez. Kabul +1 kapalı.');
    expect(container.textContent).toContain('Kabul edilen: 30 adet.');
    rerender(<KabulNotu sayilan={5} yazilan={0} hedef={80} />);
    expect(container.textContent).toBe('');
  });
});
