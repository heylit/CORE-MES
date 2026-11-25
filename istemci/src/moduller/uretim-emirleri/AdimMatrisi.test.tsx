import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { AdimMatrisiCevabi, StatuTopluCevabi, StatuTopluGovdesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { AdimDurumu } from './AdimDurumu.tsx';
import { OKUYUCU, ac, json, sunucuKur } from './test-ortak.tsx';

type Emir = AdimMatrisiCevabi['emirler'][number];
type Adim = Emir['adimlar'][number];
const adim = (isEmriId: number, opNo: number, sistemStatusu: Adim['sistemStatusu'], elle: Adim['elle'] = null): Adim =>
  ({ isEmriId, opNo, ad: opNo === 10 ? 'Kesim' : opNo === 20 ? 'Tornalama' : 'Frezeleme', durum: 'bekliyor', hedef: 40, yapilan: sistemStatusu === 'bitti' ? 40 : 0, yuzde: 0, sistemStatusu, elle });
const emir = (emirId: number, emirNo: string, adimlar: Adim[], durum: Emir['durum'] = 'basladi'): Emir =>
  ({ emirId, emirNo, urun: { kod: `ORN-${emirNo}`, ad: `Deneme ürün ${emirNo}` }, durum, teslim: '2026-12-05', adimlar });
const ELLE = { statu: 'malzeme', not: 'Gelmedi', kisiAdi: 'ORN-Kişi', zaman: '2026-11-23T08:00:00.000Z' } as const;
const VERI = (yazabilir = true): AdimMatrisiCevabi => ({
  yazabilir,
  emirler: [
    emir(1, 'UE-1', [adim(11, 10, 'bitti'), adim(12, 20, 'baslayabilir'), adim(13, 30, 'onceki', ELLE)]),
    emir(2, 'UE-2', [adim(21, 10, 'uretimde'), adim(22, 20, 'beklemede')], 'planli'),
    emir(3, 'UE-3', [adim(31, 20, 'beklemede'), adim(32, 30, 'beklemede')], 'planli'),
  ],
});
const OKU = { ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu' as const] };
const ekran = [{ yol: '/adim-durumu', ekran: AdimDurumu }];
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function kur(gorunum: 'matris' | 'tablo' = 'matris', veri: AdimMatrisiCevabi = VERI(), yaz?: (g: StatuTopluGovdesi) => StatuTopluCevabi) {
  const istekler = sunucuKur(OKU, {
    'GET /adimli-emirler/adim-matrisi': () => json(200, veri),
    'POST /adimli-emirler/statu-toplu': (g) => {
      const govde = g as StatuTopluGovdesi;
      return json(200, yaz?.(govde) ?? { kalemler: govde.kalemler.map((k) => ({ emirId: k.emirId, isEmriId: k.isEmriId, sonuc: k.statu === null ? 'kaldirildi' : 'yazildi', neden: null })) });
    },
  });
  ac(ekran, `/adim-durumu?gorunum=${gorunum}`);
  return istekler;
}
const posts = (istekler: ReturnType<typeof sunucuKur>) => istekler.filter((i) => i.yontem === 'POST');

describe('Adım Durumu matrisi (3604)', () => {
  it('görünüm anahtarı Emir, Matris, Tablo; Matris satır emir, sütun OP; elle yazılan "E" ile işaretli', async () => {
    kur();
    expect(await screen.findByRole('tab', { name: 'Matris' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Matris' }).getAttribute('aria-selected')).toBe('true');
    const tablo = await screen.findByRole('table');
    expect(within(tablo).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Emir', 'OP 10Kesim', 'OP 20Tornalama', 'OP 30Frezeleme']);
    expect(within(tablo).getByRole('button', { name: /UE-1, OP 30 Frezeleme: Malzeme bekliyor, elle yazıldı/ })).toBeTruthy();
    expect(within(tablo).getByRole('button', { name: /UE-1, OP 10 Kesim: Bitti, elle yazılmadı/ })).toBeTruthy();
    expect(screen.getByText('Elle statü, sistem statüsü değişince düşer.')).toBeTruthy();
    expect(screen.getAllByRole('status').length).toBe(2);
  });

  it('hücre seçilir, şerit statüyü taşır; yazmadan önce sayım gösterilir; onayla yazılır; kalıcı şeritte Geri al', async () => {
    const istekler = kur();
    fireEvent.click(await screen.findByRole('button', { name: /UE-1, OP 20 Tornalama/ }));
    expect(await screen.findByText('1 seçili')).toBeTruthy();
    expect(screen.getByText('Operatör terminalde yalnız statüyü görür; not ve kişi terminale gitmez.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Elle statü'), { target: { value: 'cizim' } });
    fireEvent.change(screen.getByLabelText('Not'), { target: { value: 'Revizyon bekleniyor' } });
    fireEvent.click(screen.getByRole('button', { name: '1 adıma Çizim revizyonu bekleniyor yaz' }));
    const onay = await screen.findByRole('region', { name: 'Yazma onayı' });
    expect(within(onay).getByText('1 seçili: 1 yazılır')).toBeTruthy();
    expect(posts(istekler)).toHaveLength(0);
    fireEvent.click(within(onay).getByRole('button', { name: '1 adıma yaz' }));
    await waitFor(() => { expect(posts(istekler)).toHaveLength(1); });
    expect(posts(istekler)[0]?.yol).toBe('/adimli-emirler/statu-toplu');
    // 3700: tekrar korumalı komut istek kimliğiyle gider; geri alma yeni komuttur.
    expect(posts(istekler)[0]?.kimlik).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(posts(istekler)[0]?.govde).toEqual({
      kalemler: [{ emirId: 1, isEmriId: 12, statu: 'cizim', not: 'Revizyon bekleniyor', sistemStatusu: 'baslayabilir' }], calisanOnay: false,
    });
    const son = await screen.findByText('Son yazım: 1 adım yazıldı.');
    expect(son.closest('[role="status"]')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Geri al' }));
    await waitFor(() => { expect(posts(istekler)).toHaveLength(2); });
    expect(posts(istekler)[1]?.kimlik).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(posts(istekler)[1]?.kimlik).not.toBe(posts(istekler)[0]?.kimlik);
    expect(posts(istekler)[1]?.govde).toEqual({
      kalemler: [{ emirId: 1, isEmriId: 12, statu: null, not: null, sistemStatusu: 'baslayabilir' }], calisanOnay: true,
    });
    expect(await screen.findByText('Son yazım geri alındı.')).toBeTruthy();
  });

  it('satır seçimi: bekleyen yazılır; beklemedeki emir, biten adım ve çalışan adım atlanır ve nedeni sayımda yazar', async () => {
    kur();
    fireEvent.click(await screen.findByRole('button', { name: 'UE-1: bu emrin adımlarını seç' }));
    fireEvent.click(screen.getByRole('button', { name: 'UE-2: bu emrin adımlarını seç' }));
    fireEvent.click(screen.getByRole('button', { name: 'UE-3: bu emrin adımlarını seç' }));
    expect(screen.getByText('7 seçili')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Elle statü'), { target: { value: 'talep' } });
    fireEvent.click(screen.getByRole('button', { name: /7 adıma Talep bekliyor yaz/ }));
    const onay = await screen.findByRole('region', { name: 'Yazma onayı' });
    expect(within(onay).getByText('7 seçili: 2 yazılır, 5 atlanır (3 emir beklemede, 1 adım bitti, 1 adım şu an çalışıyor)')).toBeTruthy();
    expect(within(onay).getByRole('list', { name: 'Atlanacak adımlar' })).toBeTruthy();
    // Vazgeç: hiçbir şey yazılmaz, seçim durur.
    fireEvent.click(within(onay).getByRole('button', { name: 'Vazgeç' }));
    expect(screen.getByText('7 seçili')).toBeTruthy();
  });

  it('50 adımdan çok yazımda ek onay istenir', async () => {
    const emirler = Array.from({ length: 20 }, (_, i) => emir(100 + i, `UE-${String(100 + i)}`, [adim(1000 + i * 10 + 1, 10, 'baslayabilir'), adim(1000 + i * 10 + 2, 20, 'onceki'), adim(1000 + i * 10 + 3, 30, 'onceki')]));
    kur('matris', { yazabilir: true, emirler });
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: 'Tümünü seç' }));
    fireEvent.change(screen.getByLabelText('Elle statü'), { target: { value: 'siparis' } });
    fireEvent.click(screen.getByRole('button', { name: /60 adıma Sipariş bekliyor yaz/ }));
    const onay = await screen.findByRole('region', { name: 'Yazma onayı' });
    const yaz = within(onay).getByRole('button', { name: '60 adıma yaz' }) as HTMLButtonElement;
    expect(yaz.disabled).toBe(true);
    fireEvent.click(within(onay).getByLabelText(/bu 50 adımdan çok/));
    expect(yaz.disabled).toBe(false);
  });

  it('bayat kalem: şerit "durum değişti" der, kalem seçili kalır; Yeniden dene onaya döner', async () => {
    const istekler = kur('matris', VERI(), (g) => ({ kalemler: g.kalemler.map((k) => ({ emirId: k.emirId, isEmriId: k.isEmriId, sonuc: 'eski' as const, neden: 'Adımın durumu bu arada değişti.' })) }));
    fireEvent.click(await screen.findByRole('button', { name: /UE-1, OP 20 Tornalama/ }));
    fireEvent.change(screen.getByLabelText('Elle statü'), { target: { value: 'makine' } });
    fireEvent.click(screen.getByRole('button', { name: /1 adıma Makine hazır değil yaz/ }));
    fireEvent.click(await screen.findByRole('button', { name: '1 adıma yaz' }));
    expect(await screen.findByText(/1 durum değişti \(yeniden deneyin\)/)).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Yazılamayan adımlar' })).toBeTruthy();
    expect(screen.getByText('1 seçili')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Yeniden dene' }));
    expect(await screen.findByRole('region', { name: 'Yazma onayı' })).toBeTruthy();
    expect(posts(istekler)).toHaveLength(1);
  });

  it('Otomatiğe dön toplu: elle statüsü olmayan atlanır', async () => {
    const istekler = kur();
    fireEvent.click(await screen.findByRole('button', { name: 'UE-1: bu emrin adımlarını seç' }));
    fireEvent.click(screen.getByRole('button', { name: 'Otomatiğe dön' }));
    const onay = await screen.findByRole('region', { name: 'Yazma onayı' });
    expect(within(onay).getByText('3 seçili: 1 yazılır, 2 atlanır (2 elle statü yok)')).toBeTruthy();
    fireEvent.click(within(onay).getByRole('button', { name: '1 adımı otomatiğe döndür' }));
    await waitFor(() => { expect(posts(istekler)).toHaveLength(1); });
    expect(posts(istekler)[0]?.govde).toEqual({ kalemler: [{ emirId: 1, isEmriId: 13, statu: null, not: null, sistemStatusu: 'onceki' }], calisanOnay: false });
  });

  it('salt okunur rol: seçim kapalı, nedeni görünür; ayrıntı yine açılır', async () => {
    kur('matris', VERI(false));
    expect(await screen.findByText('Statü yazma yetkiniz yok. Yalnız okuyabilirsiniz.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Tümünü seç' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(await screen.findByRole('button', { name: /UE-1, OP 20 Tornalama/ }));
    expect(screen.queryByText('1 seçili')).toBeNull();
    expect(await screen.findByRole('complementary', { name: 'Adım ayrıntısı' })).toBeTruthy();
  });

  it('ayrıntı paneli sistem statüsünü, elle yazanı ve Emri aç bağlantısını gösterir', async () => {
    kur();
    fireEvent.click(await screen.findByRole('button', { name: /UE-1, OP 30 Frezeleme/ }));
    const panel = await screen.findByRole('complementary', { name: 'Adım ayrıntısı' });
    expect(within(panel).getByText(/ORN-Kişi/)).toBeTruthy();
    expect(within(panel).getByText('Önceki adımı bekliyor')).toBeTruthy();
    expect(within(panel).getByRole('link', { name: 'Emri aç' }).getAttribute('href')).toBe('/adim-durumu?emir=1');
    fireEvent.click(within(panel).getByRole('button', { name: 'Ayrıntıyı kapat' }));
    expect(screen.queryByRole('complementary', { name: 'Adım ayrıntısı' })).toBeNull();
  });

  it('süzgeç: yalnız elle yazılanlar satırı daraltır; biten emir yalnız "Biteni göster" ile istenir', async () => {
    const istekler = kur();
    await screen.findByRole('table');
    fireEvent.click(screen.getByLabelText('Yalnız elle yazılanlar'));
    expect(screen.getByText('1 emir, 3 adım, 1 elle')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'UE-2: bu emrin adımlarını seç' })).toBeNull();
    fireEvent.click(screen.getByLabelText('Biteni göster'));
    await waitFor(() => { expect(istekler.some((i) => i.yol === '/adimli-emirler/adim-matrisi?biten=1')).toBe(true); });
  });

  it('Tablo görünümü: adım başına satır, onay kutusuyla seçilir, başlıktan sıralanır', async () => {
    kur('tablo');
    const tablo = await screen.findByRole('table');
    expect(within(tablo).getAllByRole('row')).toHaveLength(1 + 7);
    fireEvent.click(within(tablo).getByLabelText('UE-1 OP 20 seç'));
    expect(await screen.findByText('1 seçili')).toBeTruthy();
    fireEvent.click(within(tablo).getByRole('button', { name: 'Emir' }));
    expect(within(tablo).getByRole('columnheader', { name: /Emir/ }).getAttribute('aria-sort')).toBe('descending');
    expect(within(tablo).getAllByRole('row')[1]?.textContent).toContain('UE-3');
    fireEvent.click(within(tablo).getByLabelText('Görünen adımların hepsini seç'));
    expect(screen.getByText('7 seçili')).toBeTruthy();
  });

  it('telefon (360): matris yerine emir kartları ve OP çipleri; çipe basmak seçer', async () => {
    vi.stubGlobal('matchMedia', (s: string) => ({ matches: s === '(max-width: 767px)' || s === '(max-width: 1023px)', addEventListener: () => undefined, removeEventListener: () => undefined }));
    kur();
    expect(await screen.findByRole('list', { name: 'Emirler' })).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    const cip = screen.getByRole('button', { name: /UE-1, OP 20 Tornalama/ });
    fireEvent.click(cip);
    fireEvent.click(screen.getByRole('button', { name: /UE-1, OP 30 Frezeleme/ }));
    expect(screen.getByText('2 seçili')).toBeTruthy();
  });

  it('hücre menüsü: çalışan adıma yazımda uyarı ve onay gelir, canlı durum yerine elle statü görüneceği söylenir', async () => {
    const istekler = kur();
    fireEvent.click(await screen.findByRole('button', { name: /UE-2, OP 10 Kesim/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'UE-2 OP 10 statü işlemleri' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Makine hazır değil' }));
    const onay = await screen.findByRole('region', { name: 'Yazma onayı' });
    expect(within(onay).getByRole('alert').textContent).toContain('operatör terminalde');
    expect(posts(istekler)).toHaveLength(0);
    fireEvent.click(within(onay).getByRole('button', { name: '1 adıma yaz' }));
    await waitFor(() => { expect(posts(istekler)).toHaveLength(1); });
    expect((posts(istekler)[0]?.govde as StatuTopluGovdesi).calisanOnay).toBe(true);
  });
});
