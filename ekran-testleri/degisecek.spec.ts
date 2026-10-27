import { ADRES, cerceve, expect, test } from './ortak.ts';

// Kayıtta DEĞİŞECEK işaretli davranışlar: test bugünkü yanlışı değil beklenen doğruyu ister ve bugün düştüğü için
// test.fail() taşır. Kapı koşusu (npm run ekran) bunları atlar; npm run ekran:degisecek ayrıca koşar.
// Bir şerit düzeltince test geçer ve "beklenmedik geçti" diye görünür: o zaman test.fail() kaldırılır, etiket silinir ve
// test kapı koşusuna girer. Kaynak satırı her testin adındadır (kayit/<modul>/akislar.md).
const ETIKET = { tag: '@degisecek' };

test.describe('Reçete ve Rota', () => {
  test('R0: sayfayı açmak yalnız okur, yazma isteği göndermez', ETIKET, async ({ page, ag, ac }) => {
    test.fail();
    await ac('/recete-rota/eski/schema');
    await cerceve(page);
    expect(ag.yazmalar).toEqual([]);
  });

});

test.describe('Rota', () => {
  test('A4: menüde gizli eski /rota sayfaları kapanır ya da Reçete ve Rota\'ya yönlenir', ETIKET, async ({ page, ac }) => {
    test.fail();
    await ac('/rota/plan');
    await expect(page).not.toHaveURL(`${ADRES}/rota/plan`, { timeout: 2_000 });
  });
});

test.describe('Stok', () => {
  test.use({ hesap: 'ornek.depo' });
  test('depocunun Hareketler ekranı ve teslim paneli yetkisiz istek göndermez (statü listesi 403)', ETIKET, async ({ page, ag, ac }) => {
    test.fail();
    await ac('/stok/hareketler');
    await page.getByRole('button', { name: /^Malzeme ve teslim/ }).filter({ visible: true }).first().click();
    const panel = page.getByRole('dialog', { name: 'Malzeme · Teslim' });
    for (const ad of ['Bana gelen', 'Gönder', 'İste']) await panel.getByRole('tab', { name: ad }).click();
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => { /* yoklama */ });
    expect(ag.hatalar).toEqual([]);
  });
});
