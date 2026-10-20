import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { BenCevabi, KayitlarCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import { YAZAR, ac, yazmaDinleyiciKapat } from './test-yardimcilari.tsx';

// Acil sipariş denemesi olan taslak canlıya alınırken her deneme için müşteri seçilir (286 b, 287 b). Veriler uydurmadır.
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
const FIRMALAR = [{ id: 3, ad: 'Deneme Müşteri A', kod: 'DMA' }, { id: 4, ad: 'Deneme Müşteri B', kod: null }];

function sunucu(degisiklikler: { id: number; tur: string; ozet: string }[]) {
  const yazmalar: Array<{ yol: string; govde: Record<string, unknown> }> = [];
  const aramalar: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    if (yol === '/oturum') return json(200, { kullanici: YAZAR } satisfies OturumCevabi);
    if (yontem === 'GET' && yol === '/recete-rota/ben') return json(200, { kisi: { id: YAZAR.id, ad: YAZAR.ad }, yazabilir: true } satisfies BenCevabi);
    if (yontem === 'GET' && yol === '/recete-rota/kayitlar') return json(200, { kayitlar: [] } satisfies KayitlarCevabi);
    if (yontem === 'GET' && yol === '/plan?taslak=9') return json(200, { taslak: { id: 9, surum: 3 } });
    if (yontem === 'GET' && yol === '/plan/senaryolar') return json(200, { senaryolar: [{ id: 8, degisiklikler: [] }, { id: 9, degisiklikler }] });
    if (yontem === 'GET' && yol.startsWith('/plan/musteri-secenekleri')) {
      const ara = new URLSearchParams(yol.split('?')[1] ?? '').get('ara') ?? '';
      aramalar.push(ara);
      return json(200, { firmalar: FIRMALAR.filter((f) => f.ad.toLocaleLowerCase('tr').includes(ara.toLocaleLowerCase('tr'))) });
    }
    if (yontem === 'POST' && yol === '/plan/senaryolar/9/canliya-al') {
      yazmalar.push({ yol, govde: JSON.parse(String(secenek?.body ?? '{}')) as Record<string, unknown> });
      return json(200, { senaryolar: [] });
    }
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return { yazmalar, aramalar };
}

async function canliyaAlIste(ad = 'plan-senaryo-canliya-al'): Promise<void> {
  const cerceve = await screen.findByTitle('Reçete ve Rota', {}, { timeout: 20000 });
  const pencere = (cerceve as HTMLIFrameElement).contentWindow as Window;
  act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      data: { kanal: 'recete-rota', yon: 'istek', id: 1, tip: 'komut', veri: { ad, govde: { taslak: 9 } } }, origin: 'null', source: pencere,
    }));
  });
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); yazmaDinleyiciKapat(); });

describe('acil sipariş denemesinde müşteri seçimi (286 b)', () => {
  it('AMS-1: her acil deneme için müşteri aranıp seçilir; seçimler canlıya alma gövdesine gider', async () => {
    const { yazmalar, aramalar } = sunucu([
      { id: 41, tur: 'acil_emir', ozet: 'Acil sipariş 1' },
      { id: 42, tur: 'ariza', ozet: 'Arıza denemesi' },
      { id: 43, tur: 'acil_emir', ozet: 'Acil sipariş 2' },
    ]);
    ac('/recete-rota');
    await canliyaAlIste();
    const pencere = await screen.findByRole('dialog', { name: 'Acil sipariş için müşteri' });
    expect(within(pencere).getByText(/sipariş onaylanınca/)).toBeTruthy();
    expect(within(pencere).queryByText('Arıza denemesi')).toBeNull();
    const al = within(pencere).getByRole<HTMLButtonElement>('button', { name: 'Canlıya al' });
    expect(al.disabled).toBe(true);
    const birinci = within(pencere).getByRole('group', { name: 'Acil sipariş 1' });
    const ikinci = within(pencere).getByRole('group', { name: 'Acil sipariş 2' });
    fireEvent.change(within(birinci).getByRole('textbox'), { target: { value: 'müşteri b' } });
    await waitFor(() => { expect(aramalar).toContain('müşteri b'); });
    fireEvent.click(await within(birinci).findByRole('radio', { name: /Deneme Müşteri B/ }));
    expect(within(birinci).queryByRole('radio', { name: /Deneme Müşteri A/ })).toBeNull();
    // Bir denemenin müşterisi seçilmeden canlıya alınmaz.
    expect(al.disabled).toBe(true);
    fireEvent.click(await within(ikinci).findByRole('radio', { name: /Deneme Müşteri A.*DMA/ }));
    expect(al.disabled).toBe(false);
    fireEvent.click(al);
    await waitFor(() => { expect(yazmalar).toHaveLength(1); });
    expect(yazmalar[0]!.govde).toEqual({ surum: 3, cakismalariKabul: true, acilMusteriler: [{ degisiklikId: 41, firmaId: 4 }, { degisiklikId: 43, firmaId: 3 }] });
    expect(screen.queryByRole('dialog')).toBeNull();
  }, 40000);

  it('AMS-2: acil deneme yoksa pencere açılmaz, gövde değişmez; vazgeçilirse canlıya alınmaz', async () => {
    const { yazmalar } = sunucu([{ id: 42, tur: 'ariza', ozet: 'Arıza denemesi' }]);
    ac('/recete-rota');
    await canliyaAlIste('plan-canliya-al');
    await waitFor(() => { expect(yazmalar).toHaveLength(1); });
    expect(yazmalar[0]!.govde).toEqual({ surum: 3, cakismalariKabul: false });
    expect(screen.queryByRole('dialog')).toBeNull();
    cleanup();
    vi.unstubAllGlobals();
    const ikinci = sunucu([{ id: 41, tur: 'acil_emir', ozet: 'Acil sipariş 1' }]);
    ac('/recete-rota');
    await canliyaAlIste();
    const pencere = await screen.findByRole('dialog', { name: 'Acil sipariş için müşteri' });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Vazgeç' }));
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull(); });
    expect(ikinci.yazmalar).toHaveLength(0);
  }, 40000);
});
