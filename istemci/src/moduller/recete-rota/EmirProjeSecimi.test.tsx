import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { BenCevabi, KayitlarCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import type { AcilisSecenekleri } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { YAZAR, ac, yazmaDinleyiciKapat } from './test-yardimcilari.tsx';

// Emir açılışında proje seçimi (224): çerçevenin emir-ac komutunu kabuk keser, pencerede proje ve satır seçilir. Veriler uydurmadır.
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
const SECENEKLER: AcilisSecenekleri = {
  projeZorunlu: true,
  projeler: [
    { id: 5, kod: 'PRJ-5', ad: 'Deneme projesi', satirlar: [{ id: 51, siparisNo: 'SP-5', satirNo: 1, adet: '10', termin: '2030-02-01' }, { id: 52, siparisNo: 'SP-5', satirNo: 2, adet: '4', termin: null }] },
    { id: 6, kod: 'PRJ-6', ad: 'Deneme projesi 2', satirlar: [{ id: 61, siparisNo: 'SP-6', satirNo: 1, adet: '3', termin: null }] },
  ],
};

function sunucu(): Array<{ yol: string; govde: unknown }> {
  const yazmalar: Array<{ yol: string; govde: unknown }> = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    if (yol === '/oturum') return json(200, { kullanici: YAZAR } satisfies OturumCevabi);
    if (yontem === 'GET' && yol === '/recete-rota/ben') return json(200, { kisi: { id: YAZAR.id, ad: YAZAR.ad }, yazabilir: true } satisfies BenCevabi);
    if (yontem === 'GET' && yol === '/recete-rota/kayitlar') return json(200, { kayitlar: [] } satisfies KayitlarCevabi);
    if (yontem === 'GET' && yol.startsWith('/adimli-emirler/acilis-secenekleri?')) return json(200, SECENEKLER);
    if (yontem === 'POST' && yol === '/adimli-emirler/rotasiz') {
      yazmalar.push({ yol, govde: JSON.parse(String(secenek?.body ?? '{}')) as unknown });
      return json(200, { uretimEmriId: 600 });
    }
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return yazmalar;
}

const EMIR = { rotasiz: true, itemId: '7', qty: 4, start: '2030-01-02', due: '2030-01-09', note: '', tur: 'seri' };

async function emirAcIste(): Promise<void> {
  const cerceve = await screen.findByTitle('Reçete ve Rota', {}, { timeout: 20000 });
  const pencere = (cerceve as HTMLIFrameElement).contentWindow as Window;
  act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      data: { kanal: 'recete-rota', yon: 'istek', id: 1, tip: 'komut', veri: { ad: 'emir-ac', govde: EMIR } }, origin: 'null', source: pencere,
    }));
  });
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); yazmaDinleyiciKapat(); });

describe('emir açılışında proje seçimi (224)', () => {
  it('EPS-1: proje seçilir, birden çok satırlı projede satır sorulur; seçilen proje ve satır emre gider', async () => {
    const yazmalar = sunucu();
    ac('/recete-rota');
    await emirAcIste();
    const pencere = await screen.findByRole('dialog', { name: 'Üretim emri için proje' });
    const ac_ = within(pencere).getByRole<HTMLButtonElement>('button', { name: 'Emri aç' });
    expect(ac_.disabled).toBe(true);
    fireEvent.click(within(pencere).getByRole('radio', { name: /PRJ-5/ }));
    // İki satırlı projede satır seçilmeden emir açılmaz.
    expect(ac_.disabled).toBe(true);
    expect(within(pencere).getByRole('radio', { name: /SP-5 \/ satır 1.*termin 01\.02\.2030/ })).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('radio', { name: /SP-5 \/ satır 2.*termin —/ }));
    fireEvent.click(ac_);
    await waitFor(() => { expect(yazmalar).toHaveLength(1); });
    expect(yazmalar[0]!.govde).toMatchObject({ malzemeNo: 7, adet: 4, emirTuru: 'seri', projeId: 5, siparisSatiriId: 52 });
    expect(screen.queryByRole('dialog')).toBeNull();
  }, 40000);

  it('EPS-2: tek satırlı projede satır sorulmaz (sunucu bağlar); vazgeçilirse emir açılmaz', async () => {
    const yazmalar = sunucu();
    ac('/recete-rota');
    await emirAcIste();
    let pencere = await screen.findByRole('dialog', { name: 'Üretim emri için proje' });
    fireEvent.click(within(pencere).getByRole('radio', { name: /PRJ-6/ }));
    expect(within(pencere).queryByText('Sipariş satırı')).toBeNull();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Emri aç' }));
    await waitFor(() => { expect(yazmalar).toHaveLength(1); });
    expect(yazmalar[0]!.govde).toMatchObject({ projeId: 6 });
    expect(yazmalar[0]!.govde).not.toHaveProperty('siparisSatiriId');
    await emirAcIste();
    pencere = await screen.findByRole('dialog', { name: 'Üretim emri için proje' });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Vazgeç' }));
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull(); });
    expect(yazmalar).toHaveLength(1);
  }, 40000);
});

describe('plan motoru okunamadı uyarısı (denetim 22)', () => {
  it('MO-3: motor yerleşimi okunamayınca kabuk kalıcı uyarı gösterir', async () => {
    sunucu();
    ac('/recete-rota');
    const cerceve = await screen.findByTitle('Reçete ve Rota', {}, { timeout: 20000 });
    const pencere = (cerceve as HTMLIFrameElement).contentWindow as Window;
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { kanal: 'recete-rota', yon: 'istek', id: 1, tip: 'durum-oku', veri: {} }, origin: 'null', source: pencere }));
    });
    const uyari = await screen.findByRole('alert');
    expect(uyari.textContent).toBe('Plan motorunun yerleşimi okunamadı; plan ekranı kendi hesabıyla çiziliyor ve sıra sunucunun planından farklı olabilir. Canlıya almadan önce sayfayı yenileyin.');
  }, 30000);
});
