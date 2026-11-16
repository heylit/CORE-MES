import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { json, rrAc, sunucuKur, YONETICI, type Istek } from '../test-ortak.tsx';
import { adimOrnegi, revizyonOrnegi, rotaDurumu } from './test-veri.ts';

beforeEach(() => { try { localStorage.setItem('tc-rr1-gorunum', 'dikey'); } catch { /* test ortamında depo yoksa */ } });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); try { localStorage.clear(); } catch { /* test ortamında depo yoksa */ } });

// 3320 a (Test ön bakışı T12): ara adımın çıktısı girenler gibi malzeme listesinden seçilir. Veriler uydurmadır (ORN-).
const BEKLE = { timeout: 4000 };
const kayitlar = (istekler: readonly Istek[]) => istekler.filter((i) => i.yontem === 'POST' && i.yol === '/rota/revizyonlar/72/kaydet');
const kart = (id: string, code: string, type: 'yari' | 'mamul' | 'ham', aktif = true) => ({
  id, kayitNo: Number(id), code, name: `${code} adı`, type, unit: 'adet', cost: null, stock: null, min: null, aktif, kategori: null, kategoriAdi: null, girdiOlabilir: true,
});

function durum(status: 'taslak' | 'yururlukte' = 'taslak', ciktiId: string | null = null) {
  const steps = [adimOrnegi({ ciktiId }), adimOrnegi({ id: 'o20', seq: 20, opNo: 20, ins: [], ciktiId: null })];
  const d = rotaDurumu([revizyonOrnegi('72', 'B', status, 4, steps)]);
  const kendiRotasi = { ...revizyonOrnegi('90', 'A', 'taslak', 1, [adimOrnegi()]), itemId: '16' };
  return {
    ...d,
    items: [...(d.items ?? []), kart('14', 'ORN-YM-0101', 'yari'), kart('15', 'ORN-MM-0031', 'mamul'), kart('16', 'ORN-YM-0202', 'yari'),
      kart('17', 'ORN-YM-0303', 'yari', false), kart('18', 'ORN-HM-0001', 'ham')],
    routeRevs: [...(d.routeRevs ?? []), kendiRotasi],
  };
}
const kur = (d = durum()) => sunucuKur(YONETICI, {
  durum: d,
  yazmalar: { 'POST /rota/revizyonlar/72/kaydet': () => json(200, { id: 72, durum: 'taslak', surum: 5 }) },
});
const adimPaneli = async (ad = 'OP 10 Tornalama', duzenle = true) => {
  const bolge = await screen.findByRole('region', { name: 'Ürün ve rotalar' });
  await waitFor(() => { expect(bolge.querySelector('.tc-rr1-rcol, .tc-rr1-emptycv, .tc-rr1-ftab')).not.toBeNull(); });
  const dugme = within(bolge).queryByRole('button', { name: 'Düzenle' });
  if (duzenle && dugme) fireEvent.click(dugme);
  fireEvent.click((await within(bolge).findAllByRole('button', { name: ad }))[0]!);
  return within(bolge).getByRole('complementary', { name: 'Düzenleme paneli' });
};
const ara = (panel: HTMLElement, metin: string) => {
  const kutu = within(panel).getByLabelText('Çıktı malzemesi');
  fireEvent.focus(kutu);
  fireEvent.change(kutu, { target: { value: metin } });
};
const secenekler = (panel: HTMLElement) =>
  within(panel).queryAllByRole('option').filter((o) => o.closest('[aria-label="Çıktı malzemesi seçenekleri"]')).map((o) => o.textContent ?? '');

describe('3320 a ara adımın çıktısı malzeme listesinden', () => {
  it('kabul: ara adımda YM kartı seçilir, rota modülüne çıktı olarak kaydedilir; son adımda bölüm yok', async () => {
    const istekler = kur();
    rrAc('/recete-rota/schema');
    const panel = await adimPaneli();
    expect(within(panel).getByRole('heading', { name: 'Bu adımın çıktısı' })).toBeTruthy();
    expect(within(panel).getByText(/Çıktı seçilmedi/)).toBeTruthy();
    ara(panel, 'ORN');
    const liste = secenekler(panel);
    expect(liste.some((x) => x.includes('ORN-YM-0101'))).toBe(true);
    expect(liste.some((x) => x.includes('ORN-MM-0031'))).toBe(true);
    expect(liste.some((x) => x.includes('ORN-HM-0001')), 'hammadde çıktı olmaz').toBe(false);
    expect(liste.some((x) => x.includes('ORN-YM-0303')), 'pasif kart listelenmez').toBe(false);
    fireEvent.click(within(panel).getByRole('option', { name: /ORN-YM-0101/ }));
    await waitFor(() => { expect(kayitlar(istekler)).toHaveLength(1); }, BEKLE);
    expect(kayitlar(istekler)[0]?.govde).toMatchObject({ adimlar: [{ ciktiMalzemeId: 14 }, { ciktiMalzemeId: null }] });
    cleanup();
    kur();
    rrAc('/recete-rota/schema');
    const sonPanel = await adimPaneli('OP 20 Tornalama');
    expect(within(sonPanel).queryByRole('heading', { name: 'Bu adımın çıktısı' })).toBeNull();
  }, 30000);

  it('ret: kendi rotası olan kart seçilmez, nedeni söylenir, kayıt gitmez', async () => {
    const istekler = kur();
    rrAc('/recete-rota/schema');
    const panel = await adimPaneli();
    ara(panel, 'ORN-YM-0202');
    fireEvent.click(within(panel).getByRole('option', { name: /ORN-YM-0202/ }));
    expect((await within(panel).findByRole('alert')).textContent).toMatch(/kendi rotası var/);
    await new Promise((r) => { setTimeout(r, 1000); });
    expect(kayitlar(istekler)).toEqual([]);
  }, 30000);

  it('seçili çıktı kaldırılınca statülü ara hâle döner (null gider)', async () => {
    const istekler = kur(durum('taslak', '14'));
    rrAc('/recete-rota/schema');
    const panel = await adimPaneli();
    expect(within(panel).getAllByText('ORN-YM-0101').length).toBeGreaterThan(0);
    fireEvent.click(within(panel).getByRole('button', { name: 'Çıktıyı kaldır, statülü ara hâle dön' }));
    await waitFor(() => { expect(kayitlar(istekler)).toHaveLength(1); }, BEKLE);
    expect(kayitlar(istekler)[0]?.govde).toMatchObject({ adimlar: [{ ciktiMalzemeId: null }, { ciktiMalzemeId: null }] });
  }, 30000);

  it('görüntüleme kipinde seçim salt okunur; seçili kart gösterilir', async () => {
    kur(durum('yururlukte', '14'));
    rrAc('/recete-rota/schema');
    const panel = await adimPaneli('OP 10 Tornalama', false);
    expect(within(panel).getAllByText('ORN-YM-0101').length).toBeGreaterThan(0);
    expect(within(panel).queryByLabelText('Çıktı malzemesi')).toBeNull();
    expect(within(panel).queryByRole('button', { name: 'Çıktıyı kaldır, statülü ara hâle dön' })).toBeNull();
  }, 30000);

  it('uygun YM ya da MM kartı yoksa ileti ve "oluştur" düğmesi; düğme Malzemeler ve Hizmetler\'e götürür, arama kutusu yok', async () => {
    const d = durum();
    kur({ ...d, items: (d.items ?? []).filter((m) => !['14', '15', '16'].includes(m.id)) });
    rrAc('/recete-rota/schema');
    const panel = await adimPaneli();
    expect(within(panel).getByText(/Uygun yarı mamul ya da mamul kartı yok/)).toBeTruthy();
    expect(within(panel).queryByLabelText('Çıktı malzemesi')).toBeNull();
    fireEvent.click(within(panel).getByRole('button', { name: /Malzemeler ve Hizmetler'de oluştur/ }));
    expect(await screen.findByText('Başka sayfa')).toBeTruthy();
  }, 30000);
});
