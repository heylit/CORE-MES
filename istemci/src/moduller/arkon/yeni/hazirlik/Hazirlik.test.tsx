import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import { arkonAc, sunucuKur, YONETICI, type Deneme, type Istek } from '../test-ortak.tsx';
import { DepoPaneli, KalitePaneli, type PanelArayuzu } from './IstasyonPanelleri.tsx';
import { istasyonAyari } from './kurallar.ts';
import type { Order, Pkg } from './tipler.ts';

// Hazırlık ekranı: açılışta yazma yok; izinli kişi düzenler ve yayınlar; yetkisi olmayan yalnız görür (düğmeler yok, alanlar kilitli).
// Paket ve kişi adları uydurmadır.

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); window.sessionStorage.clear(); });

const HAZIRLIKCI: Deneme = { rol: 'prep', kullanici: { ...YONETICI.kullanici, id: 4, ad: 'Deneme Hazirlikci' } };
const PAKET = {
  id: 'tmi-ue-7', no: 'IE-DENEME-1', opType: 'cnc', st: {}, partNo: 'DN-1', part: 'Deneme parça', rev: 'A', op: 'Op 10 · Torna', machine: 'IST-1',
  target: 20, cycle: 30, due: '', priority: 'normal', material: '', note: '', files: [{ kind: 'pdf', name: 'deneme.pdf', size: 2048 }], primary: 'deneme.pdf',
  plan: [{ id: 1, nom: 'Ø20', tol: '±0.1', min: 19.9, max: 20.1, tool: 'Kumpas', freq: 'İlk parça' }], steps: [{ id: 's1', t: 'Bağla', d: '', r: true }],
  status: 'draft', version: 0, dirty: true, createdAt: 1, updatedAt: 2, by: 'Deneme',
};
const TESIS = { wcs: [{ id: 'TAL', name: 'Deneme merkez' }], sts: [{ id: 'IST-1', name: 'Deneme tezgah', wc: 'TAL', t: 'cnc' }], mcs: [] };
const sunucu = (ek: { kimlik: string; surum: number; govde: unknown }[] = []) => ({
  belgeler: { pkgs: [{ kimlik: PAKET.id, surum: 1, govde: PAKET }], kv: [{ kimlik: 'plant', surum: 1, govde: { v: TESIS } }, ...ek] },
});
const yazmalar = (l: Istek[]) => l.filter((i) => i.yontem !== 'GET' && i.yol !== '/arkon/iletiler');
const paketYazimi = (l: Istek[]) => l.filter((i) => i.yol === `/arkon/belgeler/pkgs/${PAKET.id}/yaz`).map((i) => (i.govde as { govde: Pkg }).govde);
const ileti = (l: Istek[], tur: string) => l.some((i) => i.yol === '/arkon/iletiler' && (i.govde as { ileti?: { type?: string } } | null)?.ileti?.type === tur);
const ekran = async () => screen.findByRole('region', { name: 'İş paketi' }, { timeout: 10000 });

describe('A2 Hazırlık ekranı', () => {
  it('açılışta yazmaz; paket listede ve düzenleyicide görünür; yayın operatöre gönderir', async () => {
    const istekler = sunucuKur(YONETICI, sunucu());
    arkonAc('/arkon/yeni/hazirlik');
    const d = await ekran();
    expect(within(d).getByRole('heading', { name: /IE-DENEME-1/ })).toBeTruthy();
    expect(within(screen.getByRole('complementary', { name: 'İş paketleri' })).getByRole('button', { name: /IE-DENEME-1/, pressed: true })).toBeTruthy();
    expect(yazmalar(istekler)).toEqual([]);
    fireEvent.click(within(d).getByRole('button', { name: /Yayınla/ }));
    const gonder = await within(d).findByRole('button', { name: /Operatöre gönder/ });
    expect(gonder.hasAttribute('disabled')).toBe(false);
    fireEvent.click(gonder);
    await waitFor(() => { expect(paketYazimi(istekler).some((p) => p.status === 'published' && p.version === 1 && !p.dirty)).toBe(true); }, { timeout: 10000 });
    await waitFor(() => { expect(ileti(istekler, 'pkg')).toBe(true); }, { timeout: 10000 });
    const yayin = paketYazimi(istekler).find((p) => p.status === 'published');
    expect(yayin?.history?.length).toBe(1);
    expect(yayin?.yayinImza).toBeTruthy();
  }, 40000);

  it('alan değişikliği yarım saniye sonra pakete yazılır; hazır uyarı kural olarak eklenir', async () => {
    const istekler = sunucuKur(YONETICI, sunucu());
    arkonAc('/arkon/yeni/hazirlik');
    const d = await ekran();
    fireEvent.change(within(d).getByPlaceholderText('S355J2'), { target: { value: 'Deneme çelik' } });
    await waitFor(() => { expect(paketYazimi(istekler).some((p) => p.material === 'Deneme çelik' && p.dirty)).toBe(true); }, { timeout: 10000 });
    fireEvent.click(within(d).getByRole('button', { name: /Kurallar/ }));
    fireEvent.click(await within(d).findByRole('button', { name: /Koruyucu gözlük/ }));
    await waitFor(() => {
      expect(paketYazimi(istekler).some((p) => (p.rules as { warns?: { t: string }[] } | undefined)?.warns?.some((w) => w.t.startsWith('Koruyucu gözlük')))).toBe(true);
    }, { timeout: 10000 });
  }, 40000);

  it('düzenleme ve yayın yetkisi olmayan kişi yalnız görür: yazma düğmeleri yok, alanlar kilitli, yazma gitmez (reddedilen)', async () => {
    const istekler = sunucuKur(HAZIRLIKCI, sunucu([{ kimlik: 'perms', surum: 1, govde: { v: { prep: ['page.op', 'page.prep'] } } }]));
    arkonAc('/arkon/yeni/hazirlik');
    const d = await ekran();
    expect(await within(d).findByText(/düzenleme yetkin yok/)).toBeTruthy();
    expect(within(d).getByPlaceholderText('S355J2').matches(':disabled')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Yeni paket' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Paket dosyası uygula' })).toBeNull();
    fireEvent.click(within(d).getByRole('button', { name: /Yayınla/ }));
    await within(d).findByText('Yayın öncesi kontrol');
    expect(within(d).queryByRole('button', { name: /Operatöre gönder/ })).toBeNull();
    expect(within(d).queryByRole('button', { name: /Paketi sil/ })).toBeNull();
    expect(within(d).queryByRole('button', { name: /geri çek/ })).toBeNull();
    expect(within(d).getByRole('button', { name: /Önizle/ })).toBeTruthy();
    await new Promise((r) => setTimeout(r, 700));
    expect(yazmalar(istekler)).toEqual([]);
  }, 40000);

  it('silme iki basış ister; silinen paket duyurulur', async () => {
    const istekler = sunucuKur(YONETICI, sunucu());
    arkonAc('/arkon/yeni/hazirlik');
    const d = await ekran();
    fireEvent.click(within(d).getByRole('button', { name: /Yayınla/ }));
    fireEvent.click(await within(d).findByRole('button', { name: 'Paketi sil' }));
    expect(istekler.some((i) => i.yontem === 'POST' && i.yol.includes('/sil'))).toBe(false);
    fireEvent.click(within(d).getByRole('button', { name: /Emin misin/ }));
    await waitFor(() => { expect(ileti(istekler, 'pkg-removed')).toBe(true); }, { timeout: 10000 });
  }, 40000);
});

const sahteApi = (paket: Partial<Pkg>, is: Partial<Order> = {}) => {
  const yapilan: { etiket: string; sonuc: Partial<Order> }[] = [];
  const o = { no: 'IE', part: '', op: '', due: '', state: 'running', target: 10, good: 0, scrap: 0, cycle: 0, sr: {}, ...is } as Order;
  const api: PanelArayuzu = {
    is: o, paket: paket as Pkg, ayar: istasyonAyari(paket as Pkg), kayit: (o.sr || {}) as PanelArayuzu['kayit'],
    yap: (etiket, _s, _t, f) => { yapilan.push({ etiket, sonuc: f(o) }); }, sessiz: (f) => { yapilan.push({ etiket: '', sonuc: f(o) }); },
    soyle: (m) => { yapilan.push({ etiket: m, sonuc: {} }); }, okut: () => {},
  };
  return { api, yapilan };
};

describe('A2 istasyon panelleri', () => {
  it('depo: okutulan kod bir artırır, listede olmayan kod uyarır', () => {
    const { api, yapilan } = sahteApi({ opType: 'depo', st: { mode: 'pick', items: [{ id: 'a', code: 'KOD-1', name: 'Bir', qty: 2, unit: 'adet', loc: 'A-1' }] } });
    render(<BildirimSaglayici><DepoPaneli api={api} /></BildirimSaglayici>);
    const kod = screen.getByRole('textbox', { name: 'Kod' });
    fireEvent.change(kod, { target: { value: 'kod-1' } });
    fireEvent.submit(kod.closest('form')!);
    expect(yapilan[0]?.etiket).toBe('KOD-1 · 1/2 adet');
    expect(yapilan[0]?.sonuc).toEqual({ sr: { picked: { a: 1 } }, good: 0 });
    fireEvent.change(kod, { target: { value: 'YOK-9' } });
    fireEvent.submit(kod.closest('form')!);
    expect(yapilan[1]?.etiket).toBe('Listede yok: YOK-9');
  });

  it('kalite: bütün ölçüler uygunsa parça kabul olarak kaydedilir ve iyi sayısı artar', () => {
    const plan = [{ id: 1, nom: 'Ø20', tol: '±0.1', min: 19.9, max: 20.1, tool: 'Kumpas' }];
    const { api, yapilan } = sahteApi({ opType: 'kalite', st: { lot: 50, n: 2, ac: 0 }, plan }, { sr: { cur: { vals: { 1: 20 } } }, good: 3 });
    render(<BildirimSaglayici><KalitePaneli api={api} /></BildirimSaglayici>);
    fireEvent.click(screen.getByRole('button', { name: /Parça kabul · kaydet/ }));
    expect(yapilan[0]?.etiket).toBe('Parça 1 · KABUL');
    expect(yapilan[0]?.sonuc.good).toBe(4);
  });
});
