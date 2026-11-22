import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { YuklemeTerminali } from './YuklemeTerminali.tsx';

// 3389 a: yükleme üretim terminalinin düzeninde; her durak bir iş, Yüklendi +1 çıkışı onayla yazar, Bitir irsaliye no ister. Değerler uydurmadır.
beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const json = (g: unknown, durum = 200) => new Response(JSON.stringify(g), { status: durum });
const is = (id: number, tur: string, birakisNoktasiId: number | null, belgeNo: string | null = null) => ({
  id, tarih: '2026-11-17', tur, alisNoktasiId: null, birakisNoktasiId, agirlikKilogram: '10.00', paletSayisi: 1, durakSuresiDakika: null, alisEnErken: null, alisEnGec: null,
  birakisEnErken: null, birakisEnGec: null, belgeNo, aciklama: null, sabitAracId: null, istenenTarih: '2026-11-17', durum: 'planlandi', yapilamadiSayisi: 0, sonNot: null, surum: 4,
});
const nokta = (id: number, ad: string) => ({ id, ad, tur: 'musteri', enlem: 39.9, boylam: 32.7, adres: null, durakSuresiDakika: 15, aktif: true, firmaId: null, surum: 1 });
const PLAN = {
  tarih: '2026-11-17', onaylandi: '2026-11-17T07:00:00+03:00', isler: [is(1, 'teslimat', 2), is(2, 'teslimat', 3, 'ORN-IRS-1')],
  noktalar: [nokta(2, 'ORN Müşteri A'), nokta(3, 'ORN Müşteri B')], araclar: [{ id: 1, ad: 'ORN Kamyonet' }],
  rotalar: [{ aracId: 1, kilitli: false, ogeler: [{ isId: 1, alis: false }, { isId: 2, alis: false }], hesap: null, onaySaatleri: null }],
};
const kalem = (kalemId: number, isId: number, ad: string, asama = 'depoda') => ({
  anahtar: `kalem:${String(kalemId)}`, kalemId, kaynak: 'urun', yon: 'gidis', asama, hazirTarihi: null, istenenTarih: null, uretimEmriId: 7, emirNo: `ORN-UE-${String(kalemId)}`,
  isEmriId: null, opNo: null, adim: null, ilerleme: null, siparisNo: null, malzemeNo: null, malzemeAd: ad, adet: '5.0000', firmaId: null, firmaAd: null, noktaId: null,
  tasima: 'biz', elleTuru: null, aciklama: null, is: { id: isId, tarih: '2026-11-17', durum: 'planlandi', tetiklendi: null }, depo: null, erken: null, sonYazan: null, bagliAnahtar: null,
});

function ac(dar = false, islemler = ['stok.cikis', 'sevkiyat.is-yaz']) {
  const istekler: { yol: string; yontem: string; govde: unknown }[] = [];
  const cikanlar = new Set<number>();
  vi.stubGlobal('fetch', vi.fn(async (adres: string, s?: RequestInit) => {
    const yol = String(adres).replace(/^.*\/api/, '');
    istekler.push({ yol, yontem: s?.method ?? 'GET', govde: s?.body ? JSON.parse(String(s.body)) : null });
    if (yol.endsWith('/oturum')) return json({ kullanici: { id: 3, ad: 'ORN Depocu', islemler } });
    if (yol.startsWith('/sevkiyat/planlar/')) return json(PLAN);
    if (yol.startsWith('/sevkiyat/tum-isler')) {
      return json({ satirlar: [kalem(31, 1, 'ORN Mil'), kalem(32, 1, 'ORN Flanş'), kalem(33, 2, 'ORN Pim')].map((k) => (cikanlar.has(k.kalemId) ? { ...k, asama: 'yolda' } : k)) });
    }
    const c = /^\/stok\/depo-sevk\/(\d+)\/cikis$/.exec(yol);
    if (c) { cikanlar.add(Number(c[1])); return json({ uyarilar: [] }); }
    if (yol === '/sevkiyat/isler/1/belge-no') return json({ is: { ...PLAN.isler[0], belgeNo: 'ORN-9' } });
    return json({}, 404);
  }));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><div className="tc-ay1"><YuklemeTerminali dar={dar} /></div></QueryClientProvider>);
  return istekler;
}
// 3583: iskelet yüklenirken de çizilir; şerit dolana dek beklenir.
const seritHazir = async (ad: string) => {
  const r = await screen.findByRole('region', { name: ad });
  await waitFor(() => { expect(within(r).getAllByRole('listitem').length).toBeGreaterThan(0); });
  return r;
};
const durum = () => screen.getByRole('group', { name: 'İş durumu' });

describe('yükleme terminali (3389 a)', () => {
  it('duraklar şeritte; Yüklendi +1 sıradaki kalemin çıkışını onayla yazar, sayı sunucudan gelir; Eksik +1 sıradakini atlar', async () => {
    const istekler = ac();
    const serit = await seritHazir('Araçtaki duraklar');
    expect(within(serit).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'ORN Kamyonet' })).toBeTruthy();
    fireEvent.click(within(durum()).getByRole('button', { name: /Yüklemeyi başlat/ }));
    expect(screen.getByRole('status', { name: /Yükleniyor.*0 \/ 2/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Yüklendi +1' }));
    const p = await screen.findByRole('dialog', { name: 'Çıkış onayı' });
    expect(p.textContent).toContain('ORN Mil 5 adet çıkış yazılsın mı?');
    fireEvent.click(within(p).getByRole('button', { name: /Çıkışı yaz/ }));
    await waitFor(() => expect(istekler.filter((i) => i.yontem === 'POST').map((i) => i.yol)).toEqual(['/stok/depo-sevk/31/cikis']));
    expect(await screen.findByRole('status', { name: /Yükleniyor.*1 \/ 2/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Eksik +1' }));
    expect(screen.getByRole('status', { name: /1 \/ 2/ }).textContent).toContain('1 eksik');
    fireEvent.click(screen.getByRole('button', { name: 'Yüklendi +1' }));
    expect(screen.getByRole('alert').textContent).toContain('eksik işaretli');
  });

  it('Bitir irsaliye no ister; yazılınca durak biter ve sıradaki durak ekrana gelir', async () => {
    const istekler = ac();
    await seritHazir('Araçtaki duraklar');
    fireEvent.click(within(durum()).getByRole('button', { name: /Yüklemeyi başlat/ }));
    const bitir = within(durum()).getByRole('button', { name: /Bitir/ });
    fireEvent.click(bitir);
    fireEvent.click(bitir);
    const p = await screen.findByRole('dialog', { name: 'Durağı bitir' });
    expect(p.textContent).toContain('2 kalem');
    for (const t of ['O', '9']) fireEvent.click(within(within(p).getByRole('group', { name: 'Klavye' })).getByRole('button', { name: t }));
    fireEvent.click(within(p).getByRole('button', { name: /İrsaliyeyi yaz, bitir/ }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/sevkiyat/isler/1/belge-no')?.govde).toEqual({ belgeNo: 'O9', surum: 4 }));
    expect(await screen.findByText(/1\. durak 2 kalem eksik bitti/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'ORN Kamyonet' })).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Araçtaki duraklar' })).getByRole('button', { name: /ekranda/ }).getAttribute('aria-label')).toContain('2/2');
  });

  it('Kalemler sekmesinde okutulan kod yalnız durağın kalemiyle eşlenir; telefonda Yüklendi +1 ve Eksik +1 alttadır', async () => {
    ac();
    fireEvent.click(await screen.findByRole('tab', { name: /Kalemler/ }));
    const okut = screen.getByLabelText('Okutulan kod');
    fireEvent.change(okut, { target: { value: 'ORN-UE-33' } });
    fireEvent.submit(okut);
    expect(screen.getByRole('alert').textContent).toContain('Bu durakta yok: ORN-UE-33');
    fireEvent.change(okut, { target: { value: 'orn-ue-32' } });
    fireEvent.submit(okut);
    expect((await screen.findByRole('dialog', { name: 'Çıkış onayı' })).textContent).toContain('ORN Flanş');
    cleanup();
    ac(true);
    await seritHazir('Araçtaki duraklar');
    const cubuk = await screen.findByRole('group', { name: 'İş eylemleri' });
    expect(within(cubuk).getAllByRole('button').map((b) => b.textContent)).toEqual(['Yüklemeyi başlat', 'Duraklat', 'Yüklendi +1', 'Eksik +1']);
  });
});
