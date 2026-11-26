import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { AdimMatrisiCevabi, StatuTopluCevabi, StatuTopluGovdesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { AdimDurumu } from './AdimDurumu.tsx';
import { OKUYUCU, ac, json, sunucuKur } from './test-ortak.tsx';

type Emir = AdimMatrisiCevabi['emirler'][number];
type Adim = Emir['adimlar'][number];
type Madde = Adim['maddeler'][number];
const madde = (m: Madde['madde'], hal: Madde['hal'], ham: Madde['ham'] = hal, elle: Madde['elle'] = null): Madde => ({ madde: m, hal, ham, elle });
const adim = (isEmriId: number, opNo: number, sistemStatusu: Adim['sistemStatusu'], elle: Adim['elle'] = null, maddeler: Adim['maddeler'] = []): Adim =>
  ({ isEmriId, opNo, ad: opNo === 10 ? 'Kesim' : opNo === 20 ? 'Tornalama' : 'Frezeleme', durum: 'bekliyor', hedef: 40, yapilan: sistemStatusu === 'bitti' ? 40 : 0, yuzde: 0, sistemStatusu, elle, maddeler });
const emir = (emirId: number, emirNo: string, adimlar: Adim[], durum: Emir['durum'] = 'basladi'): Emir =>
  ({ emirId, emirNo, urun: { kod: `ORN-${emirNo}`, ad: `Deneme ürün ${emirNo}` }, durum, teslim: '2026-12-05', adimlar });
const ELLE = { statu: 'malzeme', not: 'Gelmedi', kisiAdi: 'ORN-Kişi', zaman: '2026-11-23T08:00:00.000Z' } as const;
const ELLE_ONAY = { tur: 'hazir', gerekce: 'Program elde denendi', kisiAdi: 'ORN-Kişi', zaman: '2026-11-23T08:00:00.000Z' } as const;
// UE-1 OP 20: CNC (durduran) eksik, malzeme (uyaran) eksik, çizim tamam, rota gerekmez, takım ömrü elle onaylı: 3/5 tamam... (muaf sayılır).
const OP20_MADDELERI: Adim['maddeler'] = [
  madde('cnc', 'eksik'), madde('cizim', 'tamam'), madde('rota', 'gerekmez'), madde('malzeme', 'eksik'), madde('takim-omru', 'muaf', 'eksik', ELLE_ONAY),
];
const VERI = (yazabilir = true): AdimMatrisiCevabi => ({
  yazabilir,
  emirler: [
    emir(1, 'UE-1', [adim(11, 10, 'bitti'), adim(12, 20, 'baslayabilir', null, OP20_MADDELERI), adim(13, 30, 'onceki', ELLE)]),
    emir(2, 'UE-2', [adim(21, 10, 'uretimde'), adim(22, 20, 'beklemede')], 'planli'),
    emir(3, 'UE-3', [adim(31, 20, 'beklemede'), adim(32, 30, 'beklemede')], 'planli'),
  ],
});
const OKU = { ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu' as const] };
const ekran = [{ yol: '/adim-durumu', ekran: AdimDurumu }];
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const YAZAR = { ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu' as const, 'uretim-emirleri.adim-durumu-yaz' as const] };
function kur(veri: AdimMatrisiCevabi = VERI(), yaz?: (g: StatuTopluGovdesi) => StatuTopluCevabi, adres = '/adim-durumu') {
  const istekler = sunucuKur(OKU, {
    'GET /adimli-emirler/adim-matrisi': () => json(200, veri),
    'POST /adimli-emirler/statu-toplu': (g) => {
      const govde = g as StatuTopluGovdesi;
      return json(200, yaz?.(govde) ?? { kalemler: govde.kalemler.map((k) => ({ emirId: k.emirId, isEmriId: k.isEmriId, sonuc: k.statu === null ? 'kaldirildi' : 'yazildi', neden: null })) });
    },
  });
  ac(ekran, adres);
  return istekler;
}
const posts = (istekler: ReturnType<typeof sunucuKur>) => istekler.filter((i) => i.yontem === 'POST');

describe('Adım Durumu matrisi (3604)', () => {
  it('sekmeler Adımlar ve Hazırlık şablonu; Adımlar tek matristir: satır emir, sütun OP; elle yazılan "E" ile işaretli', async () => {
    kur();
    expect(await screen.findByRole('tab', { name: 'Adımlar' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Adımlar' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Adımlar', 'Hazırlık şablonu']);
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
    kur({ yazabilir: true, emirler });
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
    const istekler = kur(VERI(), (g) => ({ kalemler: g.kalemler.map((k) => ({ emirId: k.emirId, isEmriId: k.isEmriId, sonuc: 'eski' as const, neden: 'Adımın durumu bu arada değişti.' })) }));
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
    kur(VERI(false));
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
    expect(within(panel).getByText('Önceki adımı bekliyor', { selector: 'dd' })).toBeTruthy();
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

  it('telefon (360): aynı matris yana kayar (kart yok); hücre paneli alttan katlanır; ikinci hücre Çoklu seç ile seçime eklenir', async () => {
    vi.stubGlobal('matchMedia', (s: string) => ({ matches: s === '(max-width: 767px)' || s === '(max-width: 1023px)', addEventListener: () => undefined, removeEventListener: () => undefined }));
    kur();
    const tablo = await screen.findByRole('table');
    expect(screen.queryByRole('list', { name: 'Emirler' })).toBeNull();
    expect(within(tablo).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Emir', 'OP 10Kesim', 'OP 20Tornalama', 'OP 30Frezeleme']);
    fireEvent.click(within(tablo).getByRole('button', { name: /UE-1, OP 20 Tornalama/ }));
    const panel = await screen.findByRole('complementary', { name: 'Adım ayrıntısı' });
    expect(within(panel).getByRole('list').querySelectorAll('li')).toHaveLength(5);
    // Çoklu seç kapalıyken ikinci hücre ilkinin yerine geçer; açıkken seçime eklenir.
    fireEvent.click(within(tablo).getByRole('button', { name: /UE-1, OP 30 Frezeleme/ }));
    // Telefonda tek dokunuş yalnız paneli açar: toplu şerit yok.
    expect(screen.queryByText('1 seçili')).toBeNull();
    // Çoklu seç açılınca panel kapanır, toplu şerit gelir.
    fireEvent.click(screen.getByRole('button', { name: 'Çoklu seç' }));
    expect(screen.queryByRole('complementary', { name: 'Adım ayrıntısı' })).toBeNull();
    expect(screen.getByText('1 seçili')).toBeTruthy();
    fireEvent.click(within(tablo).getByRole('button', { name: /UE-1, OP 20 Tornalama/ }));
    expect(screen.getByText('2 seçili')).toBeTruthy();
  });

  it('telefon (360): süzgeç Filtre düğmesiyle katlanır; açılınca statü ve işaret kutuları görünür, adım sayısı düğmede yazar', async () => {
    vi.stubGlobal('matchMedia', (s: string) => ({ matches: s === '(max-width: 767px)' || s === '(max-width: 1023px)', addEventListener: () => undefined, removeEventListener: () => undefined }));
    kur();
    await screen.findByRole('table');
    expect(screen.getByLabelText('Ara')).toBeTruthy();
    expect(screen.getByLabelText('Statü').closest('[hidden]')).not.toBeNull();
    const dugme = screen.getByRole('button', { name: 'Filtre' });
    expect(dugme.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(dugme);
    expect(screen.getByLabelText('Statü').closest('[hidden]')).toBeNull();
    fireEvent.click(screen.getByLabelText('Yalnız elle yazılanlar'));
    expect(screen.getByRole('button', { name: 'Filtre (1)' })).toBeTruthy();
  });

  it('mercek: Durum statüyü, Hazırlık hücrede hazırlık özetini gösterir; adreste durur', async () => {
    kur(VERI(), undefined, '/adim-durumu?mercek=hazirlik');
    const tablo = await screen.findByRole('table');
    expect(screen.getByRole('button', { name: 'Hazırlık' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Durum' }).getAttribute('aria-pressed')).toBe('false');
    // OP 20: eksik CNC ve malzeme, tamam çizim, muaf takım ömrü (elle onay); gerekmeyen rota sayılmaz.
    const hucre = within(tablo).getByRole('button', { name: 'UE-1, OP 20 Tornalama: hazırlık 2/4, 2 eksik, 1 elle' });
    expect(hucre.textContent).toContain('2/4');
    expect(within(tablo).queryByText('Başlayabilir')).toBeNull();
    expect(screen.getByRole('list', { name: 'Hazırlık kareleri' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Durum' }));
    expect(await within(tablo).findByRole('button', { name: /UE-1, OP 20 Tornalama: Başlayabilir/ })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Statü simgeleri' })).toBeTruthy();
  });

  it('hazırlık süzgeci: eksik hazırlığı olmayan emirler satırdan düşer', async () => {
    kur(VERI(), undefined, '/adim-durumu?mercek=hazirlik');
    await screen.findByRole('table');
    fireEvent.click(screen.getByLabelText('Yalnız hazırlığı eksik olanlar'));
    expect(screen.getByText('1 emir, 3 adım, 1 elle')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'UE-2: bu emrin adımlarını seç' })).toBeNull();
  });

  it('panel hazırlık maddeleri: durum, durduran işareti, kaynak ve elle değer okunur', async () => {
    kur();
    fireEvent.click(await screen.findByRole('button', { name: /UE-1, OP 20 Tornalama/ }));
    const panel = await screen.findByRole('complementary', { name: 'Adım ayrıntısı' });
    const liste = within(panel).getByRole('region', { name: 'Hazırlık maddeleri' });
    const satirlar = within(liste).getAllByRole('listitem');
    expect(satirlar.map((x) => x.querySelector('b')?.textContent)).toEqual(['CNC kurulumu', 'Çizim revizyonu', 'Rota yürürlükte', 'Malzeme (girdi stoğu)', 'Takım ömrü']);
    expect(within(satirlar[0]!).getByText('durduran')).toBeTruthy();
    expect(within(satirlar[0]!).getByText('Sistem: eksik')).toBeTruthy();
    expect(within(satirlar[2]!).getByText('Bu emirde gerekmiyor')).toBeTruthy();
    expect(within(satirlar[3]!).queryByText('durduran')).toBeNull();
    expect(within(satirlar[4]!).getByText(/Elle hazır: ORN-Kişi .* Program elde denendi/)).toBeTruthy();
    // Gerekmeyen maddede hiçbir işlem yok; hazır maddeye onay, elle değersize geri al yok.
    const dugme = (i: number, ad: RegExp) => within(satirlar[i]!).getByRole('button', { name: ad }) as HTMLButtonElement;
    expect([dugme(2, /onayla/).disabled, dugme(2, /eksik işaretle/).disabled, dugme(2, /geri al/).disabled]).toEqual([true, true, true]);
    expect([dugme(1, /onayla/).disabled, dugme(1, /eksik işaretle/).disabled, dugme(1, /geri al/).disabled]).toEqual([true, false, true]);
    expect(dugme(4, /geri al/).disabled).toBe(false);
  });

  it('okuyucu ya da yazma yetkisiz: maddelerin işlem düğmeleri kapalı', async () => {
    kur(VERI(false));
    fireEvent.click(await screen.findByRole('button', { name: /UE-1, OP 20 Tornalama/ }));
    const panel = await screen.findByRole('complementary', { name: 'Adım ayrıntısı' });
    for (const d of within(panel).getAllByRole('button', { name: /: (onayla|eksik işaretle|elle değeri geri al)$/ })) expect((d as HTMLButtonElement).disabled).toBe(true);
    expect(within(panel).queryByLabelText('Statü değiştir')).toBeNull();
    expect(within(panel).getByText('Yazma yetkiniz yok.')).toBeTruthy();
  });

  it('durduran maddeyi onaylamak gerekçe ister (en az 5 karakter); istek gördüğü hâli ve kimliği taşır; matris yenilenir', async () => {
    const istekler = sunucuKur(YAZAR, {
      'GET /adimli-emirler/adim-matrisi': () => json(200, VERI()),
      'POST /adimli-emirler/1/is-emirleri/12/hazirlik-onayla': () => json(200, {}),
    });
    ac(ekran, '/adim-durumu');
    fireEvent.click(await screen.findByRole('button', { name: /UE-1, OP 20 Tornalama/ }));
    const panel = await screen.findByRole('complementary', { name: 'Adım ayrıntısı' });
    fireEvent.click(within(panel).getByRole('button', { name: 'CNC kurulumu: onayla' }));
    expect(istekler.filter((i) => i.yontem === 'POST')).toHaveLength(0);
    const kutu = await within(panel).findByRole('group', { name: 'CNC kurulumu: gerekçe' });
    const kaydet = within(kutu).getByRole('button', { name: 'Kaydet' }) as HTMLButtonElement;
    expect(kaydet.disabled).toBe(true);
    fireEvent.change(within(kutu).getByLabelText('Gerekçe'), { target: { value: 'dört' } });
    expect(kaydet.disabled).toBe(true);
    fireEvent.change(within(kutu).getByLabelText('Gerekçe'), { target: { value: 'Program elde denendi' } });
    fireEvent.click(kaydet);
    await waitFor(() => { expect(istekler.filter((i) => i.yontem === 'POST')).toHaveLength(1); });
    const post = istekler.filter((i) => i.yontem === 'POST')[0];
    expect(post?.govde).toEqual({ madde: 'cnc', gerekce: 'Program elde denendi', sistemHali: 'eksik' });
    expect(post?.kimlik).toMatch(/^[0-9a-f-]{36}$/);
    await waitFor(() => { expect(istekler.filter((i) => i.yol.startsWith('/adimli-emirler/adim-matrisi')).length).toBeGreaterThan(1); });
  });

  it('uyaran maddede gerekçe istenmez: tek dokunuşla elle onay ve elle eksik yazılır', async () => {
    const istekler = sunucuKur(YAZAR, {
      'GET /adimli-emirler/adim-matrisi': () => json(200, VERI()),
      'POST /adimli-emirler/1/is-emirleri/12/hazirlik-onayla': () => json(200, {}),
      'POST /adimli-emirler/1/is-emirleri/12/hazirlik-elle-eksik': () => json(200, {}),
    });
    ac(ekran, '/adim-durumu');
    fireEvent.click(await screen.findByRole('button', { name: /UE-1, OP 20 Tornalama/ }));
    const panel = await screen.findByRole('complementary', { name: 'Adım ayrıntısı' });
    fireEvent.click(within(panel).getByRole('button', { name: 'Malzeme (girdi stoğu): onayla' }));
    await waitFor(() => { expect(istekler.filter((i) => i.yontem === 'POST')).toHaveLength(1); });
    expect(istekler.find((i) => i.yontem === 'POST')?.govde).toEqual({ madde: 'malzeme', gerekce: null, sistemHali: 'eksik' });
    // Çizim sistemce tamam: elle eksik durduran madde olduğundan gerekçe ister.
    fireEvent.click(within(panel).getByRole('button', { name: 'Çizim revizyonu: eksik işaretle' }));
    expect(await within(panel).findByRole('group', { name: 'Çizim revizyonu: gerekçe' })).toBeTruthy();
    expect(istekler.filter((i) => i.yontem === 'POST')).toHaveLength(1);
    fireEvent.click(within(panel).getByRole('button', { name: 'Vazgeç' }));
    expect(within(panel).queryByRole('group', { name: 'Çizim revizyonu: gerekçe' })).toBeNull();
  });

  it('elle değeri geri al: onay kaldırılır, bildirimdeki Geri al önceki onayı gerekçesiyle yeniden yazar', async () => {
    const istekler = sunucuKur(YAZAR, {
      'GET /adimli-emirler/adim-matrisi': () => json(200, VERI()),
      'POST /adimli-emirler/1/is-emirleri/12/hazirlik-onay-kaldir': () => json(200, {}),
      'POST /adimli-emirler/1/is-emirleri/12/hazirlik-onayla': () => json(200, {}),
    });
    ac(ekran, '/adim-durumu');
    fireEvent.click(await screen.findByRole('button', { name: /UE-1, OP 20 Tornalama/ }));
    const panel = await screen.findByRole('complementary', { name: 'Adım ayrıntısı' });
    fireEvent.click(within(panel).getByRole('button', { name: 'Takım ömrü: elle değeri geri al' }));
    await waitFor(() => { expect(istekler.filter((i) => i.yontem === 'POST')).toHaveLength(1); });
    expect(istekler.find((i) => i.yontem === 'POST')?.yol).toBe('/adimli-emirler/1/is-emirleri/12/hazirlik-onay-kaldir');
    expect(istekler.find((i) => i.yontem === 'POST')?.govde).toEqual({ madde: 'takim-omru' });
    fireEvent.click(await screen.findByRole('button', { name: 'Geri al' }));
    await waitFor(() => { expect(istekler.filter((i) => i.yontem === 'POST')).toHaveLength(2); });
    expect(istekler.filter((i) => i.yontem === 'POST')[1]?.govde).toEqual({ madde: 'takim-omru', gerekce: 'Program elde denendi', sistemHali: 'eksik' });
  });

  it('hücre paneli statü seçimi: çalışan adıma yazımda uyarı ve onay gelir, canlı durum yerine elle statü görüneceği söylenir', async () => {
    const istekler = kur(VERI(), undefined, '/adim-durumu');
    fireEvent.click(await screen.findByRole('button', { name: /UE-2, OP 10 Kesim/ }));
    const panel = await screen.findByRole('complementary', { name: 'Adım ayrıntısı' });
    fireEvent.change(within(panel).getByLabelText('Statü değiştir'), { target: { value: 'makine' } });
    const onay = await screen.findByRole('region', { name: 'Yazma onayı' });
    expect(within(onay).getByRole('alert').textContent).toContain('operatör terminalde');
    expect(posts(istekler)).toHaveLength(0);
    fireEvent.click(within(onay).getByRole('button', { name: '1 adıma yaz' }));
    await waitFor(() => { expect(posts(istekler)).toHaveLength(1); });
    expect((posts(istekler)[0]?.govde as StatuTopluGovdesi).calisanOnay).toBe(true);
  });

  it('hücre paneli: bekleyen adıma statü hemen yazılır; Otomatiğe dön elle statüyü kaldırır', async () => {
    const istekler = kur();
    fireEvent.click(await screen.findByRole('button', { name: /UE-1, OP 30 Frezeleme/ }));
    const panel = await screen.findByRole('complementary', { name: 'Adım ayrıntısı' });
    expect((within(panel).getByLabelText('Statü değiştir') as HTMLSelectElement).value).toBe('malzeme');
    fireEvent.click(within(panel).getByRole('button', { name: 'Otomatiğe dön' }));
    await waitFor(() => { expect(posts(istekler)).toHaveLength(1); });
    expect(posts(istekler)[0]?.govde).toEqual({ kalemler: [{ emirId: 1, isEmriId: 13, statu: null, not: null, sistemStatusu: 'onceki' }], calisanOnay: true });
  });
});
