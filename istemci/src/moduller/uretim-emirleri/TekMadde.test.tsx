import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { AdimMatrisiCevabi, HazirlikTopluGovdesi, StatuTopluCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { AdimDurumu } from './AdimDurumu.tsx';
import { OKUYUCU, ac, json, sunucuKur } from './test-ortak.tsx';

// 3738 dilim 2: Tek madde merceği (hücrede tek dokunuş, geri al, toplu onay).
type Emir = AdimMatrisiCevabi['emirler'][number];
type Adim = Emir['adimlar'][number];
type Madde = Adim['maddeler'][number];
const madde = (m: Madde['madde'], hal: Madde['hal'], ham: Madde['ham'] = hal, elle: Madde['elle'] = null): Madde => ({ madde: m, hal, ham, elle });
const adim = (isEmriId: number, opNo: number, maddeler: Adim['maddeler']): Adim =>
  ({ isEmriId, opNo, ad: opNo === 10 ? 'Kesim' : 'Tornalama', durum: 'bekliyor', hedef: 40, yapilan: 0, yuzde: 0, sistemStatusu: 'baslayabilir', elle: null, sablondanFark: 0, maddeler });
const emir = (emirId: number, emirNo: string, adimlar: Adim[]): Emir =>
  ({ emirId, emirNo, urun: { kod: `ORN-${emirNo}`, ad: `Deneme ürün ${emirNo}` }, durum: 'planli', teslim: '2026-12-05', adimlar });
const ELLE_ONAY = { tur: 'hazir', gerekce: 'Program elde denendi', kisiAdi: 'ORN-Kişi', zaman: '2026-11-23T08:00:00.000Z' } as const;
// CNC durduran, malzeme uyaran. UE-1: OP10 ikisi eksik; OP20 CNC tamam, malzeme elle onaylı. UE-2: OP10 CNC eksik, malzeme gerekmez; OP20 ikisi eksik.
const VERI = (yazabilir = true): AdimMatrisiCevabi => ({
  yazabilir,
  emirler: [
    emir(1, 'UE-1', [adim(11, 10, [madde('cnc', 'eksik'), madde('malzeme', 'eksik')]), adim(12, 20, [madde('cnc', 'tamam'), madde('malzeme', 'muaf', 'eksik', ELLE_ONAY)])]),
    emir(2, 'UE-2', [adim(21, 10, [madde('cnc', 'eksik'), madde('malzeme', 'gerekmez')]), adim(22, 20, [madde('cnc', 'eksik'), madde('malzeme', 'eksik')])]),
  ],
});
const OKU = { ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu' as const] };
const ekran = [{ yol: '/adim-durumu', ekran: AdimDurumu }];
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

type Yaniti = (g: HazirlikTopluGovdesi) => StatuTopluCevabi;
const TAMAM: Yaniti = (g) => ({ kalemler: g.kalemler.map((k) => ({ emirId: k.emirId, isEmriId: k.isEmriId, sonuc: k.islem === 'kaldir' ? 'kaldirildi' : 'yazildi', neden: null })) });
function kur(adres: string, yanit: Yaniti = TAMAM, veri: AdimMatrisiCevabi = VERI()) {
  const istekler = sunucuKur(OKU, {
    'GET /adimli-emirler/adim-matrisi': () => json(200, veri),
    'POST /adimli-emirler/hazirlik-toplu': (g) => json(200, yanit(g as HazirlikTopluGovdesi)),
  });
  ac(ekran, adres);
  return istekler;
}
const posts = (istekler: ReturnType<typeof sunucuKur>) => istekler.filter((i) => i.yontem === 'POST');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('Tek madde merceği (3738 dilim 2)', () => {
  it('mercek adreste durur; madde seçilir; hücre maddenin hâlini gösterir; N eksik özeti görünür', async () => {
    kur('/adim-durumu?mercek=tek&madde=cnc');
    const tablo = await screen.findByRole('table');
    expect(screen.getByRole('button', { name: 'Tek madde' }).getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByLabelText('Madde') as HTMLSelectElement).value).toBe('cnc');
    expect(screen.getByText('eksik: CNC kurulumu', { exact: false }).textContent).toBe('3 eksik: CNC kurulumu');
    expect(within(tablo).getByRole('button', { name: /UE-1, OP 10 Kesim: CNC kurulumu Eksik \(dokununca onaylanır\)/ })).toBeTruthy();
    expect(within(tablo).getByRole('button', { name: /UE-1, OP 20 Tornalama: CNC kurulumu Tamam \(dokununca hazır değil olur\)/ })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Madde simgeleri' })).toBeTruthy();
    // Madde değişince adres ve hücreler değişir: malzemede UE-2 OP10 gerekmez ve dokunuş yoktur.
    fireEvent.change(screen.getByLabelText('Madde'), { target: { value: 'malzeme' } });
    expect(await screen.findByText('eksik: Malzeme (girdi stoğu)', { exact: false })).toBeTruthy();
    const gerekmez = within(tablo).getByRole('button', { name: /UE-2, OP 10 Kesim: Malzeme \(girdi stoğu\) Gerekmez \(dokunuş yok\)/ }) as HTMLButtonElement;
    expect(gerekmez.disabled).toBe(true);
  });

  it('uyaran maddede tek dokunuş hemen yazar (istek kimliğiyle, gördüğü hâliyle); kalıcı şeritte Geri al elle değeri kaldırır', async () => {
    const istekler = kur('/adim-durumu?mercek=tek&madde=malzeme');
    fireEvent.click(await screen.findByRole('button', { name: /UE-1, OP 10 Kesim: Malzeme/ }));
    await waitFor(() => { expect(posts(istekler)).toHaveLength(1); });
    expect(posts(istekler)[0]?.yol).toBe('/adimli-emirler/hazirlik-toplu');
    expect(posts(istekler)[0]?.kimlik).toMatch(UUID);
    expect(posts(istekler)[0]?.govde).toEqual({ madde: 'malzeme', kalemler: [{ emirId: 1, isEmriId: 11, islem: 'onayla', gerekce: null, sistemHali: 'eksik' }] });
    expect(await screen.findByText('Son yazım (Malzeme (girdi stoğu)): 1 adım yazıldı.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Geri al' }));
    await waitFor(() => { expect(posts(istekler)).toHaveLength(2); });
    expect(posts(istekler)[1]?.kimlik).not.toBe(posts(istekler)[0]?.kimlik);
    expect(posts(istekler)[1]?.govde).toEqual({ madde: 'malzeme', kalemler: [{ emirId: 1, isEmriId: 11, islem: 'kaldir', gerekce: null, sistemHali: 'eksik' }] });
    expect(await screen.findByText('Son yazım geri alındı.')).toBeTruthy();
  });

  it('durduran maddede tek dokunuş önce gerekçe ister (en az 5 karakter); yazmadan önce istek gitmez', async () => {
    const istekler = kur('/adim-durumu?mercek=tek&madde=cnc');
    fireEvent.click(await screen.findByRole('button', { name: /UE-2, OP 10 Kesim: CNC kurulumu/ }));
    const onay = await screen.findByRole('region', { name: 'Yazma onayı' });
    expect(within(onay).getByText('1 seçili: 1 yazılır')).toBeTruthy();
    expect(posts(istekler)).toHaveLength(0);
    const yaz = within(onay).getByRole('button', { name: '1 adımı onayla' }) as HTMLButtonElement;
    expect(yaz.disabled).toBe(true);
    fireEvent.change(within(onay).getByLabelText('Gerekçe'), { target: { value: 'dört' } });
    expect(yaz.disabled).toBe(true);
    fireEvent.change(within(onay).getByLabelText('Gerekçe'), { target: { value: 'Program elde denendi' } });
    fireEvent.click(yaz);
    await waitFor(() => { expect(posts(istekler)).toHaveLength(1); });
    expect(posts(istekler)[0]?.govde).toEqual({ madde: 'cnc', kalemler: [{ emirId: 2, isEmriId: 21, islem: 'onayla', gerekce: 'Program elde denendi', sistemHali: 'eksik' }] });
  });

  it('hazır hücreye dokunmak hazır değil yazar; elle değeri olan hücrede geri al düğmesi elle değeri kaldırır', async () => {
    const istekler = kur('/adim-durumu?mercek=tek&madde=malzeme');
    const tablo = await screen.findByRole('table');
    // UE-1 OP20 malzeme: elle onaylı (E); hücredeki geri al düğmesi.
    fireEvent.click(within(tablo).getByRole('button', { name: /UE-1, OP 20 Tornalama: Malzeme \(girdi stoğu\) Hazır, elle yazıldı.*: elle değeri geri al/ }));
    await waitFor(() => { expect(posts(istekler)).toHaveLength(1); });
    expect(posts(istekler)[0]?.govde).toEqual({ madde: 'malzeme', kalemler: [{ emirId: 1, isEmriId: 12, islem: 'kaldir', gerekce: null, sistemHali: 'muaf' }] });
    // Aynı hücreye dokunmak (hazır -> hazır değil): elle onay kalkar, çünkü otomatik hâl eksiktir.
    fireEvent.click(within(tablo).getByRole('button', { name: /UE-1, OP 20 Tornalama: Malzeme \(girdi stoğu\) Hazır, elle yazıldı \(dokununca hazır değil olur\)/ }));
    await waitFor(() => { expect(posts(istekler)).toHaveLength(2); });
    expect((posts(istekler)[1]?.govde as HazirlikTopluGovdesi).kalemler[0]?.islem).toBe('kaldir');
  });

  it('toplu onay: seçilen hücrelerde sayım yazmadan önce gösterilir; atlananlar nedenleriyle listelenir; tek gerekçe herkese gider', async () => {
    const istekler = kur('/adim-durumu?mercek=tek&madde=cnc');
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: 'Tümünü seç' }));
    expect(screen.getByText('4 seçili')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Onayla' }));
    const onay = await screen.findByRole('region', { name: 'Yazma onayı' });
    expect(within(onay).getByText('4 seçili: 3 yazılır, 1 atlanır (1 zaten hazır)')).toBeTruthy();
    expect(within(onay).getByRole('list', { name: 'Atlanacak adımlar' }).textContent).toContain('UE-1 OP 20: zaten hazır');
    expect(posts(istekler)).toHaveLength(0);
    const yaz = within(onay).getByRole('button', { name: '3 adımı onayla' }) as HTMLButtonElement;
    expect(yaz.disabled).toBe(true);
    fireEvent.change(within(onay).getByLabelText('Gerekçe'), { target: { value: 'Revizyon sorgusu bekliyor' } });
    fireEvent.click(yaz);
    await waitFor(() => { expect(posts(istekler)).toHaveLength(1); });
    const govde = posts(istekler)[0]?.govde as HazirlikTopluGovdesi;
    expect(govde.kalemler.map((k) => [k.emirId, k.isEmriId, k.islem, k.gerekce])).toEqual([
      [1, 11, 'onayla', 'Revizyon sorgusu bekliyor'], [2, 21, 'onayla', 'Revizyon sorgusu bekliyor'], [2, 22, 'onayla', 'Revizyon sorgusu bekliyor'],
    ]);
    expect(await screen.findByText('Son yazım (CNC kurulumu): 3 adım yazıldı.')).toBeTruthy();
    // Son toplu yazım geri alınır: üç kalem de elle değeri kaldırır.
    fireEvent.click(screen.getByRole('button', { name: 'Geri al' }));
    await waitFor(() => { expect(posts(istekler)).toHaveLength(2); });
    expect((posts(istekler)[1]?.govde as HazirlikTopluGovdesi).kalemler.map((k) => [k.isEmriId, k.islem, k.gerekce])).toEqual([[11, 'kaldir', null], [21, 'kaldir', null], [22, 'kaldir', null]]);
  });

  it('Hepsini onayla: görünen eksik hücreleri seçer ve sayımlı onayı açar; bayat kalem şeritte kalır, ötekiler yazılır, Yeniden dene onaya döner', async () => {
    const yanit: Yaniti = (g) => ({ kalemler: g.kalemler.map((k, i) => (i === 0
      ? { emirId: k.emirId, isEmriId: k.isEmriId, sonuc: 'eski' as const, neden: 'Maddenin hâli bu arada değişti. Güncel hâli görüp yeniden onaylayın.' }
      : { emirId: k.emirId, isEmriId: k.isEmriId, sonuc: 'yazildi' as const, neden: null })) });
    const istekler = kur('/adim-durumu?mercek=tek&madde=malzeme', yanit);
    await screen.findByRole('table');
    expect(screen.getByText('eksik: Malzeme (girdi stoğu)', { exact: false }).textContent).toBe('2 eksik: Malzeme (girdi stoğu)');
    fireEvent.click(screen.getByRole('button', { name: 'Hepsini onayla…' }));
    const onay = await screen.findByRole('region', { name: 'Yazma onayı' });
    expect(within(onay).getByText('2 seçili: 2 yazılır')).toBeTruthy();
    // Uyaran maddede gerekçe istenmez.
    expect(within(onay).queryByLabelText('Gerekçe')).toBeNull();
    fireEvent.click(within(onay).getByRole('button', { name: '2 adımı onayla' }));
    await waitFor(() => { expect(posts(istekler)).toHaveLength(1); });
    expect(await screen.findByText('Son yazım (Malzeme (girdi stoğu)): 1 adım yazıldı, 1 durum değişti (yeniden deneyin).')).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'Yazılamayan adımlar' })).getByText(/UE-1 OP 10: Maddenin hâli/)).toBeTruthy();
    expect(screen.getByText('1 seçili')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Yeniden dene' }));
    const yeniden = await screen.findByRole('region', { name: 'Yazma onayı' });
    expect(within(yeniden).getByText('1 seçili: 1 yazılır')).toBeTruthy();
  });

  it('yazma yetkisi yok: hücreler yalnız okunur, düğme ve toplu eylem yoktur', async () => {
    const istekler = kur('/adim-durumu?mercek=tek&madde=cnc', TAMAM, VERI(false));
    const tablo = await screen.findByRole('table');
    const hucre = within(tablo).getByRole('button', { name: /UE-1, OP 10 Kesim: CNC kurulumu Eksik/ }) as HTMLButtonElement;
    expect(hucre.disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Hepsini onayla…' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Çoklu seç' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(hucre);
    expect(posts(istekler)).toHaveLength(0);
    expect(within(tablo).queryByRole('button', { name: /elle değeri geri al/ })).toBeNull();
  });

  it('Çoklu seç açıkken dokunuş seçer, yazmaz; Elle değeri geri al yalnız elle değeri olanları sayar', async () => {
    const istekler = kur('/adim-durumu?mercek=tek&madde=malzeme');
    const tablo = await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: 'Çoklu seç' }));
    fireEvent.click(within(tablo).getByRole('button', { name: /UE-1, OP 10 Kesim: Malzeme/ }));
    fireEvent.click(within(tablo).getByRole('button', { name: /UE-1, OP 20 Tornalama: Malzeme \(girdi stoğu\) Hazır, elle yazıldı \(/ }));
    expect(screen.getByText('2 seçili')).toBeTruthy();
    expect(posts(istekler)).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Elle değeri geri al' }));
    const onay = await screen.findByRole('region', { name: 'Yazma onayı' });
    expect(within(onay).getByText('2 seçili: 1 yazılır, 1 atlanır (1 elle değer yok)')).toBeTruthy();
    fireEvent.click(within(onay).getByRole('button', { name: '1 adımın elle değerini geri al' }));
    await waitFor(() => { expect(posts(istekler)).toHaveLength(1); });
    expect(posts(istekler)[0]?.govde).toEqual({ madde: 'malzeme', kalemler: [{ emirId: 1, isEmriId: 12, islem: 'kaldir', gerekce: null, sistemHali: 'muaf' }] });
  });
});
