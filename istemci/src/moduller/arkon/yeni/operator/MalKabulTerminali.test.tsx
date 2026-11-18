import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import { depoDugmeleri, sayimEklenir } from './DepoTerminali.tsx';
import { MalKabulTerminali } from './MalKabulTerminali.tsx';

// 3388 a: mal kabul üretim terminalinin düzeninde; Kabul +1 en çok firmada kalan kadar, Bitir'de tek kayıt. Değerler uydurmadır.
beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const json = (g: unknown, durum = 200) => new Response(JSON.stringify(g), { status: durum });
const satir = (id: number, kalemAdi: string, malzemeTur: string, ek: Record<string, unknown> = {}) => ({
  id, siparisNo: `ORN-S-${String(id)}`, talepNo: '', tedarikciAdi: 'ORN Fason', malzemeId: id, malzemeTur, kalemAdi, miktar: '3.000', kalanMiktar: '3.000', birim: 'adet', beklenenTeslim: null, ...ek,
});
const IS = { isEmriId: 77, emirNo: 'ORN-UE-1', opNo: 20, adim: 'Isıl işlem', gonderilen: 5, donen: 1, hurda: 1, donenKart: { malzemeId: 960, kod: 'ORN-FL-K', ad: 'Flanş ısıl', birim: 'adet' }, statulu: false };
const BELGE = { id: 12, no: 'MK-000012', tur: 'satin_alma', irsaliyeNo: null, zaman: '2026-11-03T10:00:00+03:00', kisiAd: 'D', satirSayisi: 1, farkSayisi: 0, duzeltilenId: null, duzeltenId: null };

function ac(dar = false) {
  const istekler: { yol: string; yontem: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, s?: RequestInit) => {
    const yol = String(adres).replace(/^.*\/api/, '');
    istekler.push({ yol, yontem: s?.method ?? 'GET', govde: s?.body ? JSON.parse(String(s.body)) : null });
    if (yol.endsWith('/oturum')) return json({ kullanici: { id: 3, ad: 'ORN Depocu', islemler: ['stok.giris'] } });
    if (yol.startsWith('/stok/acik-siparis-satirlari')) return json({ satirlar: [satir(41, 'ORN Flanş', 'hizmet', { isEmriId: 77, emirNo: 'ORN-UE-1' }), satir(31, 'ORN Çubuk', 'hammadde')] });
    if (yol.startsWith('/stok/konumlar')) return json({ satirlar: [{ id: 5, kod: 'FSN-1', tur: 'fason', ad: null }], toplam: 1 });
    if (yol.startsWith('/stok/fason-isleri')) return json({ isler: [IS] });
    if (yol === '/stok/mal-kabul') return json({ belge: BELGE, hareketIdler: [1] });
    return json({}, 404);
  }));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
    <BildirimSaglayici><MemoryRouter><div className="tc-ay1">{<MalKabulTerminali dar={dar} />}</div></MemoryRouter></BildirimSaglayici>
  </QueryClientProvider>);
  return istekler;
}
const durum = () => screen.getByRole('group', { name: 'İş durumu' });
const tus = (ad: string) => screen.getByRole('button', { name: ad }) as HTMLButtonElement;

describe('mal kabul terminali (3388 a)', () => {
  it('kurallar: düğmeler üretimdeki sırada, sayım hedefi aşmaz', () => {
    expect(depoDugmeleri('queued', 'Kabulü başlat').map((d) => d.etiket)).toEqual(['Kabulü başlat']);
    expect(depoDugmeleri('running', 'x').map((d) => d.etiket)).toEqual(['Durdur', 'Duraklat', 'Bitir']);
    expect(depoDugmeleri('paused', 'x').map((d) => d.etiket)).toEqual(['Durdur', 'Devam Et', 'Bitir']);
    expect(sayimEklenir(2, 3)).toBe(true);
    expect(sayimEklenir(3, 3)).toBe(false);
    expect(sayimEklenir(500, null)).toBe(true);
  });

  it('bekleyen kabuller şeritte; Başlat ile Kabulde, Kabul +1 firmada kalanda durur, ret tuşu yok (ret GKK işidir); Bitir tek kayıt yazar', async () => {
    const istekler = ac();
    const serit = await screen.findByRole('region', { name: 'Bekleyen kabuller' });
    expect(within(serit).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'ORN-UE-1' })).toBeTruthy();
    expect(tus('Kabul +1').disabled).toBe(true);
    fireEvent.click(within(durum()).getByRole('button', { name: /Kabulü başlat/ }));
    expect(screen.getByRole('status', { name: /Kabulde/ })).toBeTruthy();
    for (let i = 0; i < 4; i += 1) fireEvent.click(tus('Kabul +1'));
    // Firmada 5 - 1 - 1 = 3 adet: dördüncü dokunuş sayılmaz.
    expect(screen.getByRole('status', { name: /3 \/ 3/ })).toBeTruthy();
    expect(tus('Kabul +1').disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /Ret/ })).toBeNull();
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
    const bitir = within(durum()).getByRole('button', { name: /Bitir/ });
    fireEvent.click(bitir);
    fireEvent.click(bitir);
    const p = await screen.findByRole('dialog', { name: 'Fason dönüşünü bitir' });
    const yaz = within(p).getByRole('button', { name: /Kabulü yaz/ });
    fireEvent.click(yaz);
    fireEvent.click(yaz);
    await waitFor(() => expect(istekler.filter((i) => i.yontem === 'POST')).toHaveLength(1));
    expect(istekler.find((i) => i.yontem === 'POST')!.govde).toEqual({ tur: 'satin_alma', satirlar: [{ malzemeId: 960, miktar: '3', parti: null, siparisSatirId: 41, fasonIsi: { isEmriId: 77 }, ambalaj: null }] });
    expect(await screen.findByText(/3 adet karantinaya girdi/)).toBeTruthy();
  });

  it('sayım cihazda saklanır: ekran yeniden açılınca iş Kabulde ve sayısıyla gelir', async () => {
    ac();
    fireEvent.click(within(await screen.findByRole('group', { name: 'İş durumu' })).getByRole('button', { name: /Kabulü başlat/ }));
    fireEvent.click(tus('Kabul +1'));
    cleanup();
    ac();
    expect(await screen.findByRole('status', { name: /Kabulde.*1 \/ 3/ })).toBeTruthy();
  });

  it('satın alma satırında sayım tuşu kapalı; "Okut ve kabul et" Stok\'un okutmalı kabulünü açar', async () => {
    ac();
    const serit = await screen.findByRole('region', { name: 'Bekleyen kabuller' });
    fireEvent.click(within(serit).getByRole('button', { name: /ORN-S-31/ }));
    fireEvent.click(within(durum()).getByRole('button', { name: /Kabulü başlat/ }));
    expect(tus('Kabul +1').disabled).toBe(true);
    expect(screen.getByRole('note').textContent).toContain('okutmayla');
    fireEvent.click(screen.getByRole('button', { name: /Okut ve kabul et/ }));
    const p = await screen.findByRole('dialog', { name: 'Okut ve kabul et' });
    expect(within(p).getAllByLabelText(/^Kod/).length).toBeGreaterThan(0);
  });

  it('telefonda Kabul +1 alttaki eylem çubuğunda, ret yok; görünümler Kabul, Adımlar, Bilgi', async () => {
    ac(true);
    const cubuk = await screen.findByRole('group', { name: 'İş eylemleri' });
    expect(within(cubuk).getByRole('button', { name: /Kabulü başlat/ })).toBeTruthy();
    expect(within(cubuk).getByRole('button', { name: 'Kabul +1' })).toBeTruthy();
    expect(within(cubuk).queryByRole('button', { name: /Ret/ })).toBeNull();
    const nav = screen.getByRole('navigation', { name: 'Terminal görünümleri' });
    expect(within(nav).getAllByRole('button').map((b) => b.textContent)).toEqual(['Kabul', 'Adımlar', 'Bilgi']);
    fireEvent.click(within(nav).getByRole('button', { name: 'Adımlar' }));
    expect(screen.getByRole('list', { name: 'Adımlar' }).textContent).toContain('Dönen malzemeyi doğrula');
  });
});
