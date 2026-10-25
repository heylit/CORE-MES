import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { SIMDI } from '../ornek-veri.ts';
import { ac, sunucuKur } from '../test-ortak.tsx';
import { belgeSayilari, eksikBelgeler, suzulmusBelgeler } from './BelgeListesi.tsx';
import { belgeDeposu, KALITECI_KISI, SATINALMACI_KISI, yazmaCevabi } from './test-verisi.ts';
import type { BelgeKaydi } from './gorseller.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const satirlar = () => within(screen.getByRole('table', { name: 'Firma belgeleri' })).getAllByRole('row').slice(1);

describe('BelgeListesi', () => {
  it('dikkat gerektirenle açılır; sayılar, eksik belgeler ve süzgeçler', async () => {
    vi.useFakeTimers({ now: SIMDI, toFake: ['Date'] });
    sunucuKur(KALITECI_KISI, belgeDeposu());
    ac('/portal/yeni/docs');
    expect(await screen.findByRole('heading', { name: 'Belge takibi' }, { timeout: 5000 })).toBeTruthy();
    const suzgec = screen.getByRole('tablist', { name: 'Belge süzgeci' });
    expect(within(suzgec).getAllByRole('tab').map((s) => s.textContent)).toEqual([
      'Dikkat gerektiren (3)', 'Onay bekleyen (1)', 'Süresi dolmuş (1)', 'Tümü (4)',
    ]);
    // Dolmuş ve 60 gün içinde dolacak onaylı belge ile onay bekleyen; süresi en yakın olan başta.
    expect(satirlar().map((s) => within(s).getAllByRole('cell')[1]?.textContent)).toEqual(['Vergi levhasıno B-d4', 'ISO 9001no B-d2', 'İmza sirkülerino B-d3']);
    const eksik = screen.getByRole('region', { name: 'Eksik zorunlu belgeler' });
    expect(within(eksik).getAllByRole('listitem')).toHaveLength(3);
    // Firma kartı taşınmadı; bağlantı firma görünümüne gider, kabuk sahibinde açar.
    expect(within(eksik).getAllByRole('link', { name: 'Deneme Tedarikçi' })[0]?.getAttribute('href')).toBe('/portal/yeni/party?id=p1');
    fireEvent.click(within(suzgec).getByRole('tab', { name: 'Süresi dolmuş (1)' }));
    expect(satirlar()).toHaveLength(1);
    expect(within(satirlar()[0] as HTMLElement).getByText('Süresi doldu')).toBeTruthy();
  });

  it('reddi gerekçesiz yazmaz; gerekçeyle okunan sürümle yazar', async () => {
    vi.useFakeTimers({ now: SIMDI, toFake: ['Date'] });
    const istekler = sunucuKur(KALITECI_KISI, belgeDeposu(), yazmaCevabi);
    ac('/portal/yeni/docs');
    fireEvent.click(await screen.findByRole('button', { name: 'Reddet' }, { timeout: 5000 }));
    const pencere = await screen.findByRole('dialog', { name: 'Belgeyi reddet' });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Reddet' }));
    expect(await within(pencere).findByText('Gerekçe yazın.')).toBeTruthy();
    expect(istekler.some((i) => i.yol === '/portal/belge/yaz')).toBe(false);
    fireEvent.change(within(pencere).getByLabelText(/Ret gerekçesi/), { target: { value: 'Okunmuyor' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Reddet' }));
    await waitFor(() => { expect(istekler.filter((i) => i.yol === '/portal/belge/yaz')).toHaveLength(1); });
    const y = istekler.find((i) => i.yol === '/portal/belge/yaz')?.govde as { yol: string; veri: BelgeKaydi; beklenenSurum: number };
    expect(y.yol).toBe('docs/d3');
    expect(y.beklenenSurum).toBe(1);
    expect(y.veri).toMatchObject({ status: 'rejected', rejectNote: 'Okunmuyor' });
    expect(y.veri.history?.at(-1)).toMatchObject({ by: 'firm', u: 'tmi-6', text: 'Reddedildi: Okunmuyor' });
  });

  it('belge izni olmayan kişiye görünümü açmaz', async () => {
    const istekler = sunucuKur(SATINALMACI_KISI, belgeDeposu());
    ac('/portal/yeni/docs');
    expect(await screen.findByText('Bu bölümü görme yetkiniz yok.', {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Belge takibi' })).toBeNull();
    expect(istekler.some((i) => i.yol === '/portal/belge/yaz')).toBe(false);
  });

  it('sayılar, eksikler ve süresiz belgenin sırası', () => {
    const d = belgeDeposu();
    expect(belgeSayilari(d, SIMDI)).toEqual({ bekleyen: 1, yaklasan: 1, dolan: 1, eksik: 3, blokta: 1 });
    expect(eksikBelgeler(d, SIMDI).map((x) => `${x.firmaId}:${x.tur}`).sort()).toEqual(['c1:İmza sirküleri', 'p1:KVKK taahhütnamesi', 'p1:İmza sirküleri']);
    expect(suzulmusBelgeler(Object.values(d.docs), 'all', SIMDI).map((b) => b.id)).toEqual(['d4', 'd2', 'd3', 'd1']);
  });
});
