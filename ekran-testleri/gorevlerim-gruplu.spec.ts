import { expect, tasmaOlc, test } from './ortak.ts';

// 3611: Görevlerim hazırlık görevlerini emre göre gruplar. Cevap tarayıcıda uydurulur (sentetik ORN verisi); hiçbir yazma gitmez.
// 360, 768 ve 1280 genişlikte: grup başlığı görünür, sayfa yatay taşmaz, yazma gitmez.
const satir = (id: number, ad: string, emir: number, ek: Record<string, unknown> = {}) => ({
  id, kilometreTasiId: null, ad, aciklama: null, sorumluKisiId: null, sorumluAd: null, planBaslangic: '2026-11-01', planBitis: '2099-12-31',
  gercekBaslangic: null, gercekBitis: null, ilerleme: 0, durum: 'yapilacak', oncekiGorevId: null, asama: null, yapanRolId: 1, yapanRolAd: 'ORN-Rol-Depo',
  kontrolKisiId: null, kontrolKisiAd: null, kontrolRolId: null, kontrolRolAd: null, yedekKontrolKisiId: null, yedekKontrolKisiAd: null, yedekKontrolRolId: null,
  yedekKontrolRolAd: null, onaylandi: false, hazirlikMaddesi: 'malzeme', kanitZorunlu: false, adimToplam: emir === 0 ? 0 : 5, adimYapilan: 0, surum: 1,
  tur: 'rolume', projeId: 1, projeKod: 'ORN-PRJ-1', projeAd: 'ORN', izinler: { gorevi: false, kontrol: false }, kademe: null, ...ek,
});
const GOREVLER = [
  satir(9101, 'Malzeme hazır · ORN-EMIR-001', 1),
  satir(9102, 'Aparat hazır · ORN-EMIR-001', 1, { yapanRolAd: 'ORN-Rol-Kurulumcu', kontrolRolAd: 'ORN-Rol-Kalite', adimYapilan: 5, tur: 'bana' }),
  satir(9103, 'Ölçü aleti hazır · ORN-EMIR-001', 1, { durum: 'kontrolde', tur: 'kontrolumde' }),
  satir(9104, 'Malzeme hazır · ORN-EMIR-002', 1, { planBitis: '2020-01-01' }),
  satir(9105, 'Çizim revizyonu · ORN-EMIR-002 / 10', 1, { adimToplam: 0 }),
  satir(9106, 'ORN düz proje görevi', 0, { hazirlikMaddesi: null, projeKod: 'ORN-PRJ-2', projeId: 2 }),
];

test.describe('3611 Gruplu Görevlerim', () => {
  test.use({ hesap: 'ornek.yonetici' });
  test('emir başlıkları görünür; gruplu düzende sayfa yatay taşmaz; yazma gitmez', async ({ page, ag, ac }, bilgi) => {
    await page.route('**/api/projeler/gorevlerim/liste', (r) => r.fulfill({ json: { gorevler: GOREVLER } }));
    await ac('/proje-gorevlerim');
    const tablo = page.getByRole('table', { name: 'Görevlerim' }).or(page.getByRole('grid', { name: 'Görevlerim' })).first();
    await expect(page.getByText('ORN-EMIR-001').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('ORN-EMIR-002').first()).toBeVisible();
    await expect(page.getByText(/3 görev/).first()).toBeVisible();
    await expect(page.getByText(/1 kontrol bekliyor/).first()).toBeVisible();
    await expect(page.getByText(/1 geciken/).first()).toBeVisible();
    await expect(page.getByLabel('Emre göre grupla')).toBeVisible();
    await expect(page.getByText('Adımlar tamam').first()).toBeVisible();
    expect(await tasmaOlc(page), `${bilgi.project.name}: gruplu görünümde yatay taşma yok`).toMatchObject({ belge: 0 });
    // Gruplama kapanınca düz liste de taşmaz.
    await page.getByLabel('Emre göre grupla').uncheck();
    await expect(page.getByText('Malzeme hazır · ORN-EMIR-001').first()).toBeVisible();
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    await expect(tablo).toBeAttached();
    const klasor = process.env['TMIV2_EKRAN_GORUNTU']?.trim();
    if (klasor) await page.screenshot({ path: `${klasor}/gorevlerim-gruplu-${bilgi.project.name}.png` });
    expect(ag.yazmalar).toEqual([]);
  });
});
