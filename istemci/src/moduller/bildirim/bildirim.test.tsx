import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { renderHook } from '@testing-library/react';
import type { Bildirim, BildirimListeCevabi, BildirimSayacCevabi, BildirimTercihleriCevabi } from '#paylasilan/sozlesme/bildirim.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { gorunenUstEylemler } from '../../ortak/rota/ust-eylemler.ts';
import type { CihazIzni, CihazOrtami } from './cihaz.ts';
import { rotalar } from './rotalar.tsx';
import { ZilDugmesi, useCihazBildirimi, ustEylemler } from './ust-eylem.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
interface Istek { yontem: string; yol: string; govde: unknown }

function sunucuKur(yollar: Record<string, (govde: unknown) => Response>) {
  const istekler: Istek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    const govde = secenek?.body ? JSON.parse(String(secenek.body)) : undefined;
    istekler.push({ yontem, yol, govde });
    const isle = yollar[`${yontem} ${yol}`] ?? yollar[`${yontem} ${yol.split('?')[0]}`];
    return isle ? isle(govde) : json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}

function Adres() {
  return <output data-testid="adres">{useLocation().pathname}</output>;
}

function ac(adres: string, ek?: React.ReactNode) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici>
        <MemoryRouter initialEntries={[adres]}>
          <Routes>
            {rotalar.map((r) => <Route key={r.yol} path={r.yol} element={<r.ekran />} />)}
            <Route path="*" element={null} />
          </Routes>
          {ek}
          <Adres />
        </MemoryRouter>
      </BildirimSaglayici>
    </QueryClientProvider>,
  );
}

const B = (ek: Partial<Bildirim>): Bildirim => ({
  id: 1, tur: 'istasyonlar.makine-durdu', onem: 'acil', baslik: 'Makine durdu: Tezgah 4', metin: 'Arıza', yol: '/istasyonlar',
  kaynakModul: 'istasyonlar', tekrarSayisi: 1, olusturuldu: '2026-10-19T09:00:00+03:00', okundu: null, arsivlendi: null, ...ek,
});
const liste = (satirlar: Bildirim[]): BildirimListeCevabi => ({ satirlar, toplam: satirlar.length, sayfa: 1, sayfaBoyu: 50 });
const TERCIH: BildirimTercihleriCevabi = {
  kanallar: { mesaj: false, eposta: false },
  epostaSecilebilir: true,
  satirlar: [{ tur: 'istasyonlar.makine-durdu', baslik: 'Makine durdu', onem: 'acil', kaynakModul: 'istasyonlar', mesaj: false, eposta: false, varsayilan: true }],
};

describe('Bildirim zili', () => {
  const Zil = () => {
    const [eylem] = gorunenUstEylemler(ustEylemler, []);
    if (!eylem) throw new Error('zil yok');
    return <eylem.dugme />;
  };

  it('oturumu olan herkese görünür ve okunmamış sayısını gösterir; acil varsa etikette söyler', async () => {
    expect(gorunenUstEylemler(ustEylemler, []).map((e) => e.anahtar)).toEqual(['bildirimler']);
    sunucuKur({ 'GET /bildirimler/sayac': () => json(200, { okunmamis: 3, acilVar: true } satisfies BildirimSayacCevabi) });
    ac('/', <Zil />);
    expect(await screen.findByRole('button', { name: 'Bildirimler, 3 okunmamış' })).toBeTruthy();
  });

  it('okunmamış yoksa sayı görünmez', async () => {
    const istekler = sunucuKur({ 'GET /bildirimler/sayac': () => json(200, { okunmamis: 0, acilVar: false }) });
    ac('/', <Zil />);
    await waitFor(() => expect(istekler.some((i) => i.yol === '/bildirimler/sayac')).toBe(true));
    expect(screen.getByRole('button', { name: 'Bildirimler' })).toBeTruthy();
  });

  it('çekmece okunmamışları listeler; satıra basınca okundu olur ve kayda gider', async () => {
    const istekler = sunucuKur({
      'GET /bildirimler/sayac': () => json(200, { okunmamis: 1, acilVar: true }),
      'GET /bildirimler': () => json(200, liste([B({})])),
      'POST /bildirimler/1/okundu': () => json(200, B({ okundu: '2026-10-19T09:05:00+03:00' })),
    });
    ac('/', <Zil />);
    fireEvent.click(await screen.findByRole('button', { name: /Bildirimler, 1 okunmamış/ }));
    const cekmece = await screen.findByRole('dialog', { name: 'Bildirimler' });
    expect(istekler.some((i) => i.yol.startsWith('/bildirimler?durum=okunmamis'))).toBe(true);
    fireEvent.click(await within(cekmece).findByRole('button', { name: 'Makine durdu: Tezgah 4, okunmamış' }));
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST' && i.yol === '/bildirimler/1/okundu')).toBe(true));
    expect(screen.getByTestId('adres').textContent).toBe('/istasyonlar');
    expect(screen.queryByRole('dialog', { name: 'Bildirimler' })).toBeNull();
  });

  it('tümünü okundu yap tek komut gönderir', async () => {
    const istekler = sunucuKur({
      'GET /bildirimler/sayac': () => json(200, { okunmamis: 1, acilVar: false }),
      'GET /bildirimler': () => json(200, liste([B({ onem: 'uyari' })])),
      'POST /bildirimler/tumunu-okundu': () => json(200, { isaretlenen: 1 }),
    });
    ac('/', <Zil />);
    fireEvent.click(await screen.findByRole('button', { name: /Bildirimler, 1/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Tümünü okundu yap' }));
    await waitFor(() => expect(istekler.filter((i) => i.yol === '/bildirimler/tumunu-okundu')).toHaveLength(1));
  });
});

describe('Bildirimler sayfası (Profilim altında)', () => {
  it('gelenleri listeler; süzgeç sunucuya gider; satır arşive kaldırılır', async () => {
    const istekler = sunucuKur({
      'GET /bildirimler': () => json(200, liste([B({}), B({ id: 2, baslik: 'Okunmuş haber', okundu: '2026-10-19T09:01:00+03:00', onem: 'bilgi' })])),
      'POST /bildirimler/2/arsivle': () => json(200, B({ id: 2, arsivlendi: '2026-10-19T09:10:00+03:00', okundu: '2026-10-19T09:01:00+03:00' })),
    });
    ac('/profil/bildirimler');
    expect(await screen.findByText('Okunmuş haber')).toBeTruthy();
    expect(istekler.some((i) => i.yol.startsWith('/bildirimler?durum=gelen'))).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Uyarı ve acil' }));
    await waitFor(() => expect(istekler.some((i) => i.yol.startsWith('/bildirimler?durum=onemli'))).toBe(true));
    fireEvent.click(await screen.findByRole('button', { name: 'Arşive kaldır: Okunmuş haber' }));
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST' && i.yol === '/bildirimler/2/arsivle')).toBe(true));
  });

  it('arşivde kaldırma düğmesi yok; boş arşiv söylenir', async () => {
    sunucuKur({ 'GET /bildirimler': () => json(200, liste([])) });
    ac('/profil/bildirimler/arsiv');
    expect(await screen.findByText('Arşiv boş.')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Arşiv/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('tercih anahtarı seçimi kaydeder; uygulama kanalı kilitli', async () => {
    const istekler = sunucuKur({
      'GET /bildirimler/tercihler': () => json(200, TERCIH),
      'POST /bildirimler/tercihler/degistir': (g) => json(200, { ...TERCIH, satirlar: [{ ...TERCIH.satirlar[0], ...(g as object), varsayilan: false }] }),
    });
    ac('/profil/bildirimler/tercihler');
    const uygulama = await screen.findByRole('switch', { name: 'Makine durdu: uygulama, hep açık' });
    expect((uygulama as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/kanalları henüz açılmadı/)).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'Makine durdu: e-posta' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/bildirimler/tercihler/degistir')?.govde)
      .toEqual({ tur: 'istasyonlar.makine-durdu', mesaj: false, eposta: true }));
    await waitFor(() => expect((screen.getByRole('switch', { name: 'Makine durdu: e-posta' }) as HTMLInputElement).checked).toBe(true));
  });

  it('e-posta seçemeyen kişide (operatör) e-posta anahtarı çıkmaz', async () => {
    sunucuKur({
      'GET /bildirimler/tercihler': () => json(200, { ...TERCIH, epostaSecilebilir: false, satirlar: [{ ...TERCIH.satirlar[0], eposta: null }] }),
    });
    ac('/profil/bildirimler/tercihler');
    expect(await screen.findByRole('switch', { name: 'Makine durdu: mesaj' })).toBeTruthy();
    expect(screen.queryByRole('switch', { name: 'Makine durdu: e-posta' })).toBeNull();
  });
});

// 342 a: uygulama açıkken (arka sekmede de) yeni okunmamış bildirim cihaz bildirimi olarak düşer; izin yalnız düğmeyle istenir.
function cihazSahte(baslangic: CihazIzni | null) {
  let izin = baslangic;
  const gosterilen: { baslik: string; secenek: unknown }[] = [];
  const ortam: CihazOrtami = {
    izin: () => izin,
    izinIste: vi.fn(() => { izin = 'granted'; return Promise.resolve<CihazIzni>('granted'); }),
    goster: vi.fn((baslik: string, secenek: unknown) => { gosterilen.push({ baslik, secenek }); return Promise.resolve(); }),
  };
  return { ortam, gosterilen };
}

function hookAc(ortam: CihazOrtami, okunmamis: number | undefined) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(({ n }: { n: number | undefined }) => useCihazBildirimi(n, ortam, ortam.izin()), {
    initialProps: { n: okunmamis },
    wrapper: ({ children }) => <QueryClientProvider client={istemci}>{children}</QueryClientProvider>,
  });
}

describe('Cihaz bildirimi (342 a)', () => {
  it('ilk okumada eski okunmamışlar cihaza düşmez; sonra gelen yeni bildirim başlığı, metni ve yoluyla bir kez düşer', async () => {
    let satirlar = [B({ id: 5 })];
    const istekler = sunucuKur({ 'GET /bildirimler': () => json(200, liste(satirlar)) });
    const { ortam, gosterilen } = cihazSahte('granted');
    const h = hookAc(ortam, 1);
    await waitFor(() => expect(istekler.filter((i) => i.yol.startsWith('/bildirimler?durum=okunmamis'))).toHaveLength(1));
    expect(gosterilen).toEqual([]);

    satirlar = [B({ id: 6, baslik: 'Takım ömrü doluyor', metin: null, yol: '/cnc-kurulum', kaynakModul: 'cnc-kurulum' }), B({ id: 5 })];
    h.rerender({ n: 2 });
    await waitFor(() => expect(gosterilen).toHaveLength(1));
    expect(gosterilen[0]).toEqual({ baslik: 'Takım ömrü doluyor', secenek: { body: 'cnc-kurulum', tag: 'tmi-bildirim-6', data: { yol: '/cnc-kurulum' } } });

    satirlar = [B({ id: 6 })];
    h.rerender({ n: 1 });
    await waitFor(() => expect(istekler.filter((i) => i.yol.startsWith('/bildirimler?durum=okunmamis'))).toHaveLength(3));
    expect(gosterilen).toHaveLength(1);
  });

  it('izin yoksa ya da tarayıcı desteklemiyorsa liste istenmez, yalnız zil kalır', async () => {
    const istekler = sunucuKur({ 'GET /bildirimler': () => json(200, liste([B({})])) });
    for (const izin of [null, 'default', 'denied'] as const) {
      const { ortam, gosterilen } = cihazSahte(izin);
      hookAc(ortam, 3).rerender({ n: 4 });
      expect(gosterilen).toEqual([]);
    }
    await Promise.resolve();
    expect(istekler).toEqual([]);
  });

  it('yolsuz bildirim Bildirimler sayfasını açar; metni varsa gövdede metin görünür', async () => {
    let satirlar: Bildirim[] = [];
    sunucuKur({ 'GET /bildirimler': () => json(200, liste(satirlar)) });
    const { ortam, gosterilen } = cihazSahte('granted');
    const h = hookAc(ortam, 0);
    satirlar = [B({ id: 9, yol: null, metin: 'Tezgah 4 arızada' })];
    h.rerender({ n: 1 });
    await waitFor(() => expect(gosterilen).toHaveLength(1));
    expect(gosterilen[0]?.secenek).toEqual({ body: 'Tezgah 4 arızada', tag: 'tmi-bildirim-9', data: { yol: '/profil/bildirimler' } });
  });

  it('izin yalnız çekmecedeki düğmeyle istenir; verilince düğme kalkar, reddedilmiş ya da desteksizse düğme çıkmaz', async () => {
    sunucuKur({
      'GET /bildirimler/sayac': () => json(200, { okunmamis: 0, acilVar: false }),
      'GET /bildirimler': () => json(200, liste([])),
    });
    const { ortam } = cihazSahte('default');
    ac('/', <ZilDugmesi cihaz={ortam} />);
    expect(ortam.izinIste).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Bildirimler' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cihaz bildirimini aç' }));
    expect(ortam.izinIste).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Cihaz bildirimini aç' })).toBeNull());
    cleanup();

    for (const izin of [null, 'denied'] as const) {
      ac('/', <ZilDugmesi cihaz={cihazSahte(izin).ortam} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Bildirimler' }));
      await screen.findByRole('dialog', { name: 'Bildirimler' });
      expect(screen.queryByRole('button', { name: 'Cihaz bildirimini aç' })).toBeNull();
      cleanup();
    }
  });
});
