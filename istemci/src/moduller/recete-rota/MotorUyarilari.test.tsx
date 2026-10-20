import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, screen } from '@testing-library/react';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { BenCevabi, KayitlarCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import { YAZAR, ac, yazmaDinleyiciKapat } from './test-yardimcilari.tsx';

// Plan akışı denemesi 307 a: motor bir kısıtı uygulayamadığında (personel kısıtı açık ama tanımlı personel yok) plan yine çizilir, ama
// kullanıcı planın o kısıt olmadan kurulduğunu bilmeli. Uyarı plan sekmelerinde kalıcı durur, çerçeveyi gizlemez. Veriler uydurmadır.
const UYARI = 'Personel kısıtı açık ama tanımlı personel yok; personel sınırı uygulanmadı.';
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucu(uyarilar: string[]): void {
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    if (yol === '/oturum') return json(200, { kullanici: YAZAR } satisfies OturumCevabi);
    if (yontem === 'GET' && yol === '/recete-rota/ben') return json(200, { kisi: { id: YAZAR.id, ad: YAZAR.ad }, yazabilir: true } satisfies BenCevabi);
    if (yontem === 'GET' && yol === '/recete-rota/kayitlar') return json(200, { kayitlar: [] } satisfies KayitlarCevabi);
    if (yontem === 'GET' && yol === '/recete-rota/durum') return json(200, { wcs: [], stations: [], machines: [], people: [] });
    if (yontem === 'GET' && yol === '/plan/motor-yerlesimi') return json(200, { ekranYerlesimi: null, uyarilar });
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
}

async function durumOkut(): Promise<HTMLElement> {
  const cerceve = await screen.findByTitle('Reçete ve Rota', {}, { timeout: 20000 });
  const pencere = (cerceve as HTMLIFrameElement).contentWindow as Window;
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data: { kanal: 'recete-rota', yon: 'istek', id: 1, tip: 'durum-oku', veri: {} }, origin: 'null', source: pencere }));
  });
  return cerceve;
}

const gizli = (cerceve: HTMLElement): boolean => cerceve.closest('[hidden]') !== null;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); yazmaDinleyiciKapat(); });

describe('plan motorunun uyarıları (307 a)', () => {
  it('MU-1: plan sekmesinde motorun uyarısı kalıcı yazılır, plan çizilmeye devam eder', async () => {
    sunucu([UYARI]);
    ac('/recete-rota/plan');
    const cerceve = await durumOkut();
    const serit = await screen.findByRole('status', { name: 'Plan motoru uyarıları' });
    expect(serit.textContent).toContain(UYARI);
    expect(gizli(cerceve)).toBe(false);
  }, 40000);

  it('MU-2: uyarı yoksa ya da ürün sekmesindeyken şerit çıkmaz', async () => {
    sunucu([]);
    ac('/recete-rota/kanban');
    await durumOkut();
    await new Promise((r) => { setTimeout(r, 300); });
    expect(screen.queryByRole('status', { name: 'Plan motoru uyarıları' })).toBeNull();
    cleanup();
    vi.unstubAllGlobals();
    sunucu([UYARI]);
    ac('/recete-rota');
    await durumOkut();
    await new Promise((r) => { setTimeout(r, 300); });
    expect(screen.queryByText(UYARI)).toBeNull();
  }, 40000);
});
