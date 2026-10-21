import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { BenCevabi, KayitlarCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import { YAZAR, ac, yazmaDinleyiciKapat } from './test-yardimcilari.tsx';
import { PLAN_VERISI_YOK } from './ReceteRotaCercevesi.tsx';

// Plan akışı denemesi H4 (304 a): sahibinin okuma yetkisi olmayan rolde istasyon, makine ya da iş merkezi listesi null gelir; prototip
// planı eksik veriyle çizip sahte değer gösterirdi. Plan sekmelerinde kabuk planı göstermez, nedenini söyler. Veriler uydurmadır.
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucu(liste: unknown[] | null): void {
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    if (yol === '/oturum') return json(200, { kullanici: YAZAR } satisfies OturumCevabi);
    if (yontem === 'GET' && yol === '/recete-rota/ben') return json(200, { kisi: { id: YAZAR.id, ad: YAZAR.ad }, yazabilir: true } satisfies BenCevabi);
    if (yontem === 'GET' && yol === '/recete-rota/kayitlar') return json(200, { kayitlar: [] } satisfies KayitlarCevabi);
    if (yontem === 'GET' && yol === '/recete-rota/durum') return json(200, { wcs: [], stations: liste, machines: [], people: null });
    if (yontem === 'GET' && yol === '/plan/motor-yerlesimi') return json(200, { ekranYerlesimi: null, uyarilar: [] });
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
}

// Plan sayfaları planlama çerçevesindedir (planlama-menusu.ts); kabuğun buradaki davranışı iki çerçevede aynıdır.
async function durumOkut(): Promise<HTMLElement> {
  const cerceve = await screen.findByTitle(/^(?:Reçete ve Rota|Planlama)$/, {}, { timeout: 20000 });
  const pencere = (cerceve as HTMLIFrameElement).contentWindow as Window;
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data: { kanal: 'recete-rota', yon: 'istek', id: 1, tip: 'durum-oku', veri: {} }, origin: 'null', source: pencere }));
  });
  return cerceve;
}

// Çerçeve kaldırılmaz (köprü ve okumalar sürer), gizli alanda durur.
const gizli = (cerceve: HTMLElement): boolean => cerceve.closest('[hidden]') !== null;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); yazmaDinleyiciKapat(); });

describe('plan verisi okunamayınca plan çizilmez (304 a)', () => {
  it('PV-1: plan sekmesinde istasyon listesi okunamazsa çerçeve gizlenir, neden yazılır', async () => {
    sunucu(null);
    ac('/recete-rota/plan');
    const cerceve = await durumOkut();
    const kutu = await screen.findByRole('alert');
    expect(kutu.textContent).toBe(PLAN_VERISI_YOK);
    expect(PLAN_VERISI_YOK).toBe('Plan için istasyon, makine ve iş merkezi verileri bu rolde okunamıyor; plan eksik veriyle çizilmez.');
    expect(gizli(cerceve)).toBe(true);
  }, 40000);

  it('PV-2: ürün sekmesinde ve veri okunduğunda çerçeve olduğu gibi kalır', async () => {
    sunucu(null);
    ac('/recete-rota');
    let cerceve = await durumOkut();
    await new Promise((r) => { setTimeout(r, 300); });
    expect(screen.queryByText(PLAN_VERISI_YOK)).toBeNull();
    expect(gizli(cerceve)).toBe(false);
    cleanup();
    vi.unstubAllGlobals();
    sunucu([]);
    ac('/recete-rota/kanban');
    cerceve = await durumOkut();
    await new Promise((r) => { setTimeout(r, 300); });
    expect(screen.queryByText(PLAN_VERISI_YOK)).toBeNull();
    expect(gizli(cerceve)).toBe(false);
  }, 40000);
});
