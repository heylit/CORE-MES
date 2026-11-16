import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { Gorev, GorevAyrintisiCevabi, GorevlerimCevabi, GorevlerimSatiri, SablonListesiCevabi } from '#paylasilan/sozlesme/projeler.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { GorevPaneli } from './GorevPaneli.tsx';
import { GorevSablonlari } from './GorevSablonlari.tsx';
import { uretimIlerlemesi } from './ProjeEmirleri.tsx';
import { ProjeGorevlerim } from './ProjeGorevlerim.tsx';

const KONTROLCU: Kullanici = { id: 5, ad: 'Deneme Kontrolcü', islemler: ['sayfa.proje-gorevlerim', 'projeler.gorev-isle', 'projeler.gorev-kontrol'] };
const SABLONCU: Kullanici = { id: 6, ad: 'Deneme Şablon', islemler: ['projeler.sablon-yaz'] };

const gorev = (ek: Partial<Gorev>): Gorev => ({
  id: 7, kilometreTasiId: null, ad: 'Teknik resim kontrolü', aciklama: null, sorumluKisiId: 9, sorumluAd: 'Deneme Yapan',
  planBaslangic: '2026-12-01', planBitis: '2099-12-03', gercekBaslangic: '2026-12-01', gercekBitis: null, ilerleme: 50, durum: 'kontrolde',
  oncekiGorevId: null, asama: 'Mühendislik', yapanRolId: null, yapanRolAd: null, kontrolKisiId: null, kontrolKisiAd: null, kontrolRolId: 2,
  kontrolRolAd: 'Kalite', yedekKontrolKisiId: null, yedekKontrolKisiAd: null, yedekKontrolRolId: null, yedekKontrolRolAd: null, onaylandi: false,
  surum: 4, ...ek,
});
const IZIN = { ustlenebilir: false, baslayabilir: false, bitirebilir: false, onaylayabilir: true };
const satir = (ek: Partial<GorevlerimSatiri>): GorevlerimSatiri => ({
  ...gorev({}), tur: 'kontrolumde', projeId: 1, projeKod: 'PRJ.01', projeAd: 'Deneme projesi', izinler: IZIN, ...ek,
});
const LISTE: GorevlerimCevabi = {
  gorevler: [
    satir({}),
    satir({ id: 8, ad: 'İlk parça onayı', durum: 'yapilacak', tur: 'rolume', sorumluKisiId: null, sorumluAd: null, yapanRolId: 2, yapanRolAd: 'Kalite',
      kontrolRolId: null, kontrolRolAd: null, izinler: { ...IZIN, onaylayabilir: false, ustlenebilir: true } }),
    satir({ id: 10, ad: 'Gecikmiş sertifika', durum: 'suruyor', tur: 'bana', planBitis: '2020-01-03', izinler: { ...IZIN, onaylayabilir: false } }),
  ],
};
const ayrinti = (g: Gorev): GorevAyrintisiCevabi => ({
  gorev: g, proje: { id: 1, kod: 'PRJ.01', ad: 'Deneme projesi' }, izinler: IZIN,
  olaylar: [{ olay: 'bitti', kisiAd: 'Deneme Yapan', gerekce: null, an: '2026-12-02T10:00:00+03:00' }],
});

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
interface Cagri { yontem: string; yol: string; govde: unknown }

function sunucuKur(kullanici: Kullanici) {
  const cagrilar: Cagri[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, ayar?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = ayar?.method ?? 'GET';
    cagrilar.push({ yontem, yol, govde: typeof ayar?.body === 'string' ? JSON.parse(ayar.body) : undefined });
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yontem === 'GET' && yol === '/projeler/gorevlerim/liste') return json(200, LISTE);
    if (yontem === 'GET' && yol === '/projeler/gorevler/7/ayrinti') return json(200, ayrinti(gorev({})));
    if (yontem === 'POST' && yol === '/projeler/gorevler/7/onayla') return json(200, ayrinti(gorev({ durum: 'bitti', onaylandi: true, surum: 5 })));
    if (yontem === 'POST' && yol === '/projeler/gorevler/7/iptal') return json(200, ayrinti(gorev({ durum: 'iptal', surum: 5 })));
    if (yontem === 'POST' && yol === '/projeler/gorevler/7/geri-gonder') return json(200, ayrinti(gorev({ durum: 'suruyor', surum: 5 })));
    if (yontem === 'GET' && yol === '/projeler/sablonlar/liste') return json(200, { sablonlar: [] } satisfies SablonListesiCevabi);
    if (yontem === 'GET' && yol === '/projeler/sorumlu-secenekleri') return json(200, { kisiler: [{ id: 9, ad: 'Deneme Yapan' }] });
    if (yontem === 'GET' && yol === '/projeler/rol-secenekleri') return json(200, { roller: [{ id: 2, ad: 'Kalite' }] });
    if (yontem === 'POST' && yol === '/projeler/sablonlar') return json(200, { sablonlar: [] } satisfies SablonListesiCevabi);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return cagrilar;
}

function ac(adres: string) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter initialEntries={[adres]}>
      <QueryClientProvider client={istemci}>
        <BildirimSaglayici>
          <Routes>
            <Route path="/proje-gorevlerim" element={<ProjeGorevlerim />} />
            <Route path="/projeler/sablonlar" element={<GorevSablonlari />} />
            <Route path="/panel" element={<GorevPaneli gorevId={7} kapat={() => undefined} iptalEdebilir />} />
            <Route path="/panel-salt" element={<GorevPaneli gorevId={7} kapat={() => undefined} />} />
          </Routes>
        </BildirimSaglayici>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('3303 görev iptali ve üretim ilerlemesi', () => {
  it('İptal et onay sorar; Vazgeç yazmaz; onaylanınca sürümle iptal gider ve düğme kalkar', async () => {
    const cagrilar = sunucuKur(KONTROLCU);
    ac('/panel');
    fireEvent.click(await screen.findByRole('button', { name: 'İptal et' }));
    const soru = screen.getByRole('group', { name: 'Görevi iptal et' });
    expect(within(soru).getByText(/silinmez/)).toBeDefined();
    fireEvent.click(within(soru).getByRole('button', { name: 'Vazgeç' }));
    expect(cagrilar.filter((c) => c.yontem === 'POST')).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'İptal et' }));
    fireEvent.click(screen.getByRole('button', { name: 'Görevi iptal et' }));
    await waitFor(() => { expect(cagrilar.find((c) => c.yol === '/projeler/gorevler/7/iptal')?.govde).toEqual({ surum: 4 }); });
    await waitFor(() => { expect(screen.queryByRole('button', { name: 'İptal et' })).toBeNull(); });
  });

  it('görev yazmayan panelde İptal görmez', async () => {
    sunucuKur(KONTROLCU);
    ac('/panel-salt');
    await screen.findByRole('button', { name: 'Onayla' });
    expect(screen.queryByRole('button', { name: 'İptal et' })).toBeNull();
  });

  it('üretim ilerlemesi iptal dışı emirlerin biten adım oranıdır; adım yoksa boştur', () => {
    expect(uretimIlerlemesi([
      { durum: 'basladi', tamamAdim: 1, adimSayisi: 4 }, { durum: 'bitti', tamamAdim: 4, adimSayisi: 4 }, { durum: 'iptal', tamamAdim: 0, adimSayisi: 10 },
    ])).toBe(63);
    expect(uretimIlerlemesi([])).toBeNull();
    expect(uretimIlerlemesi([{ durum: 'iptal', tamamAdim: 0, adimSayisi: 3 }])).toBeNull();
  });
});

describe('3269 proje görevlerim ve şablon', () => {
  it('görevlerim türe göre süzülür; kontrolümdeki görev panelden sürümle onaylanır', async () => {
    const cagrilar = sunucuKur(KONTROLCU);
    ac('/proje-gorevlerim');
    const tablo = await screen.findByRole('table', { name: 'Proje görevlerim' });
    await within(tablo).findByText('İlk parça onayı');
    fireEvent.click(screen.getByRole('tab', { name: /Kontrolümde/ }));
    await waitFor(() => { expect(within(tablo).queryByText('İlk parça onayı')).toBeNull(); });
    fireEvent.click(within(tablo).getByText('Teknik resim kontrolü'));
    const panel = await screen.findByRole('dialog');
    await within(panel).findByText(/Deneme Yapan bitirdi/);
    expect(within(panel).queryByRole('button', { name: 'Üstlen' })).toBeNull();
    fireEvent.click(within(panel).getByRole('button', { name: 'Onayla' }));
    await waitFor(() => { expect(cagrilar.some((c) => c.yontem === 'POST')).toBe(true); });
    expect(cagrilar.find((c) => c.yontem === 'POST')).toMatchObject({ yol: '/projeler/gorevler/7/onayla', govde: { surum: 4 } });
    expect(await within(panel).findByText('Onaylandı')).toBeTruthy();
  });

  it('Geciken kutusunun aynı adlı sekmesi yalnız geciken görevi gösterir', async () => {
    sunucuKur(KONTROLCU);
    ac('/proje-gorevlerim');
    const tablo = await screen.findByRole('table', { name: 'Proje görevlerim' });
    await within(tablo).findByText('Gecikmiş sertifika');
    fireEvent.click(screen.getByRole('tab', { name: /Geciken/ }));
    await waitFor(() => { expect(within(tablo).queryByText('İlk parça onayı')).toBeNull(); });
    expect(within(tablo).getByText('Gecikmiş sertifika')).toBeTruthy();
    expect(within(tablo).queryByText('Teknik resim kontrolü')).toBeNull();
  });

  it('geri gönderme gerekçesiz gitmez; gerekçeyle gider', async () => {
    const cagrilar = sunucuKur(KONTROLCU);
    ac('/proje-gorevlerim');
    fireEvent.click(await screen.findByText('Teknik resim kontrolü'));
    const panel = await screen.findByRole('dialog');
    fireEvent.click(await within(panel).findByRole('button', { name: 'Geri gönder' }));
    const gonder = within(panel).getAllByRole('button', { name: 'Geri gönder' }).at(-1);
    if (!gonder) throw new Error('düğme yok');
    fireEvent.click(gonder);
    expect(await within(panel).findByText(/Gerekçe zorunlu/)).toBeTruthy();
    expect(cagrilar.some((c) => c.yontem === 'POST')).toBe(false);
    fireEvent.change(within(panel).getByLabelText(/Geri gönderme gerekçesi/), { target: { value: 'Ölçü raporu eksik' } });
    fireEvent.click(gonder);
    await waitFor(() => { expect(cagrilar.some((c) => c.yontem === 'POST')).toBe(true); });
    expect(cagrilar.find((c) => c.yontem === 'POST')?.govde).toEqual({ gerekce: 'Ölçü raporu eksik', surum: 4 });
  });

  it('şablon kalemleri sırayla gider; önceki görev sıra numarasıdır; rol ve kişi ayrı alana düşer', async () => {
    const cagrilar = sunucuKur(SABLONCU);
    ac('/projeler/sablonlar');
    fireEvent.click(await screen.findByRole('button', { name: /Şablon ekle/ }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.change(within(pencere).getByLabelText(/Şablon adı/), { target: { value: 'Deneme şablonu' } });
    fireEvent.click(within(pencere).getByRole('button', { name: /Görev ekle/ }));
    fireEvent.click(within(pencere).getByRole('button', { name: /Görev ekle/ }));
    const bloklar = within(pencere).getAllByRole('group').filter((g) => g.tagName === 'FIELDSET');
    const [ilk, ikinci] = bloklar;
    if (!ilk || !ikinci) throw new Error('kalem yok');
    fireEvent.change(within(ilk).getByLabelText(/Görev adı/), { target: { value: 'Çizim incelemesi' } });
    await within(ilk).findAllByRole('option', { name: 'Rol: Kalite' });
    fireEvent.change(within(ilk).getByLabelText(/^Yapan/), { target: { value: 'r:2' } });
    fireEvent.change(within(ilk).getByLabelText(/^Kontrol eden/), { target: { value: 'k:9' } });
    fireEvent.change(within(ikinci).getByLabelText(/Görev adı/), { target: { value: 'Sevk öncesi' } });
    fireEvent.change(within(ikinci).getByLabelText(/Başlangıç/), { target: { value: 'termin' } });
    fireEvent.change(within(ikinci).getByLabelText(/Gün farkı/), { target: { value: '-2' } });
    fireEvent.change(within(ikinci).getByLabelText(/Önceki görev/), { target: { value: within(ikinci).getAllByRole('option').at(-1)?.getAttribute('value') ?? '' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(cagrilar.some((c) => c.yontem === 'POST')).toBe(true); });
    const govde = cagrilar.find((c) => c.yontem === 'POST')?.govde as { kalemler: Record<string, unknown>[] };
    expect(govde.kalemler).toHaveLength(2);
    expect(govde.kalemler[0]).toMatchObject({ ad: 'Çizim incelemesi', yapanRolId: 2, yapanKisiId: null, kontrolKisiId: 9, kontrolRolId: null, oncekiSira: null });
    expect(govde.kalemler[1]).toMatchObject({ ad: 'Sevk öncesi', dayanak: 'termin', gun: -2, oncekiSira: 0, hazirlikMaddesi: null });
  });
});
