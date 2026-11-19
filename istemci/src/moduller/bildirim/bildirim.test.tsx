import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { renderHook } from '@testing-library/react';
import type { Bildirim, BildirimListeCevabi, BildirimSayacCevabi } from '#paylasilan/sozlesme/bildirim.ts';
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
  const { pathname, search } = useLocation();
  return <output data-testid="adres">{pathname + search}</output>;
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
  kaynakModul: 'istasyonlar', tekrarSayisi: 1, olusturuldu: '2026-10-19T09:00:00+03:00', okundu: null, arsivlendi: null,
  onayIstenir: false, onaylandi: null, sinif: 'bilgi', yapildi: null, yayin: null, ...ek,
});
const liste = (satirlar: Bildirim[]): BildirimListeCevabi => ({ satirlar, toplam: satirlar.length, sayfa: 1, sayfaBoyu: 50 });
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

describe('Bildirimler sayfası (Bildirim Merkezi)', () => {
  it('gelenleri listeler; süzgeç sunucuya gider; satır arşive kaldırılır', async () => {
    const istekler = sunucuKur({
      'GET /bildirimler': () => json(200, liste([B({}), B({ id: 2, baslik: 'Okunmuş haber', okundu: '2026-10-19T09:01:00+03:00', onem: 'bilgi' })])),
      'POST /bildirimler/2/arsivle': () => json(200, B({ id: 2, arsivlendi: '2026-10-19T09:10:00+03:00', okundu: '2026-10-19T09:01:00+03:00' })),
    });
    ac('/bildirim-merkezi');
    expect(await screen.findByText('Okunmuş haber')).toBeTruthy();
    expect(istekler.some((i) => i.yol.startsWith('/bildirimler?durum=gelen'))).toBe(true);
    fireEvent.change(screen.getByLabelText('Tür'), { target: { value: 'onemli' } });
    await waitFor(() => expect(istekler.some((i) => i.yol.startsWith('/bildirimler?durum=onemli'))).toBe(true));
    await waitFor(() => expect(screen.getByTestId('adres').textContent).toBe('/bildirim-merkezi?durum=onemli'));
    fireEvent.click(await screen.findByRole('button', { name: 'Arşive kaldır: Okunmuş haber' }));
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST' && i.yol === '/bildirimler/2/arsivle')).toBe(true));
  });

  it('2174-2 a: görev ve hatırlatma etiketlidir, yapılan "Yapıldı" görünür, bilgi etiketsizdir; Görevlerim süzgeci sunucuya gider', async () => {
    const istekler = sunucuKur({
      'GET /bildirimler': () => json(200, liste([
        B({ id: 1, baslik: 'Kart onay bekliyor', sinif: 'gorev' }),
        B({ id: 2, baslik: 'Termin yaklaşıyor', sinif: 'hatirlatma' }),
        B({ id: 3, baslik: 'Kart onaylandı', sinif: 'gorev', yapildi: '2026-10-19T09:30:00+03:00', okundu: '2026-10-19T09:30:00+03:00' }),
        B({ id: 4, baslik: 'Makine durdu', sinif: 'bilgi' }),
      ])),
    });
    ac('/bildirim-merkezi');
    const satir = async (baslik: string) => (await screen.findByText(baslik)).closest('li') as HTMLElement;
    expect(within(await satir('Kart onay bekliyor')).getByText('Sizden bekleniyor')).toBeTruthy();
    expect(within(await satir('Termin yaklaşıyor')).getByText('Hatırlatma')).toBeTruthy();
    expect(within(await satir('Kart onaylandı')).getByText('Yapıldı')).toBeTruthy();
    expect(within(await satir('Makine durdu')).queryByText(/Sizden bekleniyor|Hatırlatma|Yapıldı/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Tür'), { target: { value: 'gorev' } });
    await waitFor(() => expect(istekler.some((i) => i.yol.startsWith('/bildirimler?durum=gorev'))).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Yapıldı' }));
    await waitFor(() => expect(istekler.some((i) => i.yol.startsWith('/bildirimler?durum=yapildi'))).toBe(true));
  });

  it('3456-2 a: eski arşiv adresi Arşiv cipine gider; boş arşiv söylenir', async () => {
    const istekler = sunucuKur({ 'GET /bildirimler': () => json(200, liste([])) });
    ac('/bildirim-merkezi/arsiv');
    expect(await screen.findByText('Arşiv boş.')).toBeTruthy();
    expect(screen.getByTestId('adres').textContent).toBe('/bildirim-merkezi?durum=arsiv');
    expect(screen.getByRole('button', { name: 'Arşiv' }).getAttribute('aria-pressed')).toBe('true');
    expect(istekler.some((i) => i.yol.startsWith('/bildirimler?durum=arsiv'))).toBe(true);
  });

  it('3456-2 a: Okunmamış cipinde sayı, üstte geciken iş bağlantısı; liste gün başlıklarıyla ayrılır', async () => {
    const bugun = new Date();
    const dun = new Date(bugun.getFullYear(), bugun.getMonth(), bugun.getDate() - 1, 10).toISOString();
    const eski = new Date(bugun.getFullYear(), bugun.getMonth(), bugun.getDate() - 5, 10).toISOString();
    sunucuKur({
      'GET /bildirimler/sayac': () => json(200, { okunmamis: 4, acilVar: false }),
      'GET /bildirim-kademe/gecikenlerim': () => json(200, { kayitlar: [{ kaynak: 'satin-alma-talebi', kayit: '1', no: 'ORN-1', baslik: 'x', yol: '/x', sonGun: null, baslangic: null, kademe: 3, gecikmeGun: 2 }] }),
      'GET /bildirimler': () => json(200, liste([
        B({ id: 1, baslik: 'Bugünkü', olusturuldu: bugun.toISOString() }), B({ id: 2, baslik: 'Dünkü', olusturuldu: dun }), B({ id: 3, baslik: 'Eski', olusturuldu: eski }),
      ])),
    });
    ac('/bildirim-merkezi');
    expect(await screen.findByRole('button', { name: /Okunmamış · 4/ })).toBeTruthy();
    expect((await screen.findByRole('link', { name: /1 geciken işiniz/ })).getAttribute('href')).toBe('/bildirim-merkezi/gecikenlerim');
    expect(within(await screen.findByRole('region', { name: 'Bugün' })).getByText('Bugünkü')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Dün' })).getByText('Dünkü')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Daha önce' })).getByText('Eski')).toBeTruthy();
  });

  it('3456-2 a: seçilenler toplu arşive kaldırılır; onay bekleyen atlanır ve nedeni yazılır', async () => {
    const istekler = sunucuKur({
      'GET /bildirimler': () => json(200, liste([
        B({ id: 1, baslik: 'Birinci' }), B({ id: 2, baslik: 'İkinci' }), B({ id: 3, baslik: 'Onaylı duyuru', onayIstenir: true }),
      ])),
      'POST /bildirimler/1/arsivle': () => json(200, B({ id: 1 })),
      'POST /bildirimler/2/arsivle': () => json(200, B({ id: 2 })),
    });
    ac('/bildirim-merkezi');
    for (const ad of ['Birinci', 'İkinci', 'Onaylı duyuru']) fireEvent.click(await screen.findByRole('checkbox', { name: `Seç: ${ad}` }));
    const cubuk = screen.getByRole('toolbar', { name: 'Seçili bildirimler' });
    expect(within(cubuk).getByText('3 seçili')).toBeTruthy();
    fireEvent.click(within(cubuk).getByRole('button', { name: 'Arşive kaldır' }));
    expect(await screen.findByText(/2 bildirim arşive kaldırıldı\. 1 bildirim onay beklediği için kaldırılmadı/)).toBeTruthy();
    expect(istekler.filter((i) => i.yontem === 'POST').map((i) => i.yol)).toEqual(['/bildirimler/1/arsivle', '/bildirimler/2/arsivle']);
    expect(screen.queryByRole('toolbar', { name: 'Seçili bildirimler' })).toBeNull();
  });

  it('3435-1: tercih ve Bu cihaz sayfası yoktur; eski adresler Profilim\'e gider', async () => {
    for (const adres of ['/bildirim-merkezi/tercihler', '/bildirim-merkezi/cihaz', '/profil/bildirimler/tercihler']) {
      sunucuKur({});
      ac(adres);
      await waitFor(() => expect(screen.getByTestId('adres').textContent).toBe('/profil'));
      cleanup();
    }
  });

  it('3435-3: eski kademeli uyarı adresi yönetim sayfasının kademe sekmesine gider', async () => {
    sunucuKur({});
    ac('/bildirim-merkezi/kademeli-uyari');
    await waitFor(() => expect(screen.getByTestId('adres').textContent).toBe('/bildirim-merkezi/yonetim?sekme=kademe'));
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
    expect(gosterilen[0]).toEqual({ baslik: 'Takım ömrü doluyor', secenek: { body: 'CNC kurulum', tag: 'tmi-bildirim-6', data: { yol: '/cnc-kurulum' } } });

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
    expect(gosterilen[0]?.secenek).toEqual({ body: 'Tezgah 4 arızada', tag: 'tmi-bildirim-9', data: { yol: '/bildirim-merkezi' } });
  });

  it('izin yalnız çekmecedeki düğmeyle istenir; verilince düğme kalkar, reddedilmiş ya da desteksizse düğme çıkmaz', async () => {
    sunucuKur({
      'GET /bildirimler/sayac': () => json(200, { okunmamis: 0, acilVar: false }),
      'GET /bildirimler': () => json(200, liste([])),
      'GET /oturum/cihaz': () => json(200, { ortak: false }),
    });
    const { ortam } = cihazSahte('default');
    ac('/', <ZilDugmesi cihaz={ortam} />);
    expect(ortam.izinIste).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Bildirimler' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Bu cihazda bildirimi aç' }));
    expect(ortam.izinIste).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Bu cihazda bildirimi aç' })).toBeNull());
    expect(screen.queryByRole('button', { name: 'Telefon bildirimi' })).toBeNull();
    cleanup();

    // Reddedilmiş ya da desteksizse ve ortak cihazda (terminal, istasyon) satır çıkmaz.
    for (const [izin, ortak] of [[null, false], ['denied', false], ['default', true]] as const) {
      sunucuKur({
        'GET /bildirimler/sayac': () => json(200, { okunmamis: 0, acilVar: false }),
        'GET /bildirimler': () => json(200, liste([])),
        'GET /oturum/cihaz': () => json(200, { ortak }),
      });
      ac('/', <ZilDugmesi cihaz={cihazSahte(izin).ortam} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Bildirimler' }));
      await screen.findByRole('dialog', { name: 'Bildirimler' });
      await new Promise((r) => { setTimeout(r, 20); });
      expect(screen.queryByRole('button', { name: 'Bu cihazda bildirimi aç' })).toBeNull();
      cleanup();
    }
  });
});
