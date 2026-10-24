import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { SIMDI } from '../ornek-veri.ts';
import { ac, json, sunucuKur, type Istek } from '../test-ortak.tsx';
import type { Onay } from '../tipler.ts';
import { kuralSatirlari, ortalamaOnaySuresi } from './OnayKutusu.tsx';
import { kararCevabi, onay, onayDeposu, SATINALMACI_KISI } from './test-verisi.ts';
import { VARSAYILAN_KURALLAR } from '../kurallar.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const kararlar = (istekler: readonly Istek[]) => istekler.filter((i) => i.yontem === 'POST' && i.yol.endsWith('/karar'));
const yazmalar = (istekler: readonly Istek[]) => istekler.filter((i) => i.yontem === 'POST' && i.yol === '/portal/belge/yaz');
const kart = (ad: RegExp) => screen.getByRole('article', { name: ad });

const ilkAdimOnayli = (a: Onay): Onay => ({ ...a, steps: [{ role: 'Satın alma müdürü', status: 'approved', u: 'tmi-5' }, { role: 'Genel müdür', status: 'pending' }] });
const tekAdim = onay({ id: 'a2', no: 'ON-2026-a2', title: 'Deneme tek adım', steps: [{ role: 'Satın alma müdürü', status: 'pending' }] });

describe('OnayKutusu', () => {
  it('sırası kişide olan onayı süzer; ara adımda yalnız karar ucu yazılır', async () => {
    vi.useFakeTimers({ now: SIMDI, toFake: ['Date'] });
    const d = onayDeposu();
    const istekler = sunucuKur(SATINALMACI_KISI, d, kararCevabi(ilkAdimOnayli(d.approvals['a1'] as Onay)));
    ac('/portal/yeni/approvals');
    const suzgec = await screen.findByRole('tablist', { name: 'Onay süzgeci' }, { timeout: 5000 });
    expect(within(suzgec).getAllByRole('tab').map((s) => s.textContent)).toEqual([
      'Onayımı bekleyen (1)', 'Benim taleplerim', 'Tüm bekleyenler (1)', 'Tümü (1)',
    ]);
    fireEvent.click(within(kart(/Deneme sipariş onayı/)).getByRole('button', { name: 'Onayla' }));
    const pencere = await screen.findByRole('dialog', { name: /Onayla: Satın alma siparişi/ });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Onayla' }));
    expect(await screen.findByText('Onaylandı; sıradaki onaycı: Genel müdür')).toBeTruthy();
    expect(kararlar(istekler).map((i) => [i.yol, i.govde])).toEqual([['/portal/onaylar/a1/karar', { onay: true, not: '' }]]);
    expect(yazmalar(istekler)).toHaveLength(0);
  });

  it('son adımda bağlı siparişi güncel sürümüyle yazar', async () => {
    vi.useFakeTimers({ now: SIMDI, toFake: ['Date'] });
    const istekler = sunucuKur(SATINALMACI_KISI, onayDeposu(tekAdim), kararCevabi({ ...tekAdim, status: 'approved', steps: [{ role: 'Satın alma müdürü', status: 'approved', u: 'tmi-5' }] }));
    ac('/portal/yeni/approvals');
    fireEvent.click(within(await screen.findByRole('article', { name: /Deneme tek adım/ }, { timeout: 5000 })).getByRole('button', { name: 'Onayla' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Onayla' }));
    await waitFor(() => { expect(yazmalar(istekler)).toHaveLength(1); });
    const y = yazmalar(istekler)[0]?.govde as { yol: string; veri: Record<string, unknown>; beklenenSurum: number };
    expect(y.yol).toBe('orders/o1');
    expect(y.beklenenSurum).toBe(1);
    expect(y.veri).toMatchObject({ approvalState: 'approved' });
    expect(await screen.findByText('Onaylandı; işlem tamamlandı')).toBeTruthy();
  });

  it('bağlı kayıt yazılamazsa kararın kaydedildiğini ve sonucun yazılmadığını ayrıca söyler', async () => {
    vi.useFakeTimers({ now: SIMDI, toFake: ['Date'] });
    const sonra: Onay = { ...tekAdim, status: 'approved', steps: [{ role: 'Satın alma müdürü', status: 'approved', u: 'tmi-5' }] };
    sunucuKur(SATINALMACI_KISI, onayDeposu(tekAdim), kararCevabi(sonra, json(409, { kod: 'CATISMA', mesaj: 'Sürüm uyuşmadı.' })));
    ac('/portal/yeni/approvals');
    fireEvent.click(within(await screen.findByRole('article', { name: /Deneme tek adım/ }, { timeout: 5000 })).getByRole('button', { name: 'Onayla' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Onayla' }));
    expect(await screen.findByText(/^Karar kaydedildi, ancak: Bu kayıt başka bir kişi/)).toBeTruthy();
  });

  it('reddi gerekçesiz göndermez', async () => {
    vi.useFakeTimers({ now: SIMDI, toFake: ['Date'] });
    const d = onayDeposu();
    const istekler = sunucuKur(SATINALMACI_KISI, d, kararCevabi(d.approvals['a1'] as Onay));
    ac('/portal/yeni/approvals');
    fireEvent.click(within(await screen.findByRole('article', { name: /Deneme sipariş onayı/ }, { timeout: 5000 })).getByRole('button', { name: 'Reddet' }));
    const pencere = await screen.findByRole('dialog', { name: /Reddet/ });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Reddet' }));
    expect(await within(pencere).findByText('Gerekçe yazın.')).toBeTruthy();
    expect(kararlar(istekler)).toHaveLength(0);
    fireEvent.change(within(pencere).getByLabelText(/^Gerekçe/), { target: { value: 'Bütçe yok' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Reddet' }));
    await waitFor(() => { expect(kararlar(istekler).map((i) => i.govde)).toEqual([{ onay: false, not: 'Bütçe yok' }]); });
  });

  it('kendi talebinde, sırası başka rolde olan adımda ve iskonto onayında karar düğmesi yoktur', async () => {
    vi.useFakeTimers({ now: SIMDI, toFake: ['Date'] });
    const kendi = onay({ id: 'b1', title: 'Deneme kendi talebim', requestedBy: 'tmi-5', steps: [{ role: 'Satın alma müdürü', status: 'pending' }] });
    const baskasi = onay({ id: 'b2', title: 'Deneme finans adımı', kind: 'payment', steps: [{ role: 'Finans müdürü', status: 'pending' }] });
    const iskonto = onay({ id: 'b3', title: 'Deneme iskonto', kind: 'discount', refCol: 'requests', refId: 'q1', steps: [{ role: 'Satın alma müdürü', status: 'pending' }] });
    sunucuKur(SATINALMACI_KISI, onayDeposu(kendi, baskasi, iskonto));
    ac('/portal/yeni/approvals');
    await screen.findByRole('tablist', { name: 'Onay süzgeci' }, { timeout: 5000 });
    fireEvent.click(screen.getByRole('tab', { name: /^Tümü/ }));
    expect(within(kart(/Deneme kendi talebim/)).queryByRole('button', { name: 'Onayla' })).toBeNull();
    expect(within(kart(/Deneme finans adımı/)).queryByRole('button', { name: 'Onayla' })).toBeNull();
    const k = kart(/Deneme iskonto/);
    expect(within(k).queryByRole('button', { name: 'Onayla' })).toBeNull();
    expect(within(k).getByRole('link', { name: 'Eski ekranda aç' }).getAttribute('href')).toBe('/portal');
    // Teklife bağlı onayın kaydı yeni ekrandaki teklif ayrıntısıdır.
    expect(within(k).getByRole('link', { name: 'Kaydı aç' }).getAttribute('href')).toBe('/portal/yeni/sale?id=q1');
    fireEvent.click(screen.getByRole('tab', { name: /^Benim taleplerim/ }));
    expect(screen.getAllByRole('article')).toHaveLength(1);
  });

  it('ortalama onay süresi ve kural satırları', () => {
    const a = onay({ id: 'a1', at: new Date(SIMDI).toISOString(), status: 'approved', steps: [{ role: 'X', status: 'approved', at: new Date(SIMDI + 4 * 36e5).toISOString() }] });
    expect(ortalamaOnaySuresi([a, onay({ id: 'a2' })])).toBe(4);
    expect(ortalamaOnaySuresi([onay({ id: 'a2' })])).toBeNull();
    expect(kuralSatirlari(VARSAYILAN_KURALLAR)[0]?.[0]).toBe('Satın alma siparişi (limit tanımsız) üstü');
  });
});
