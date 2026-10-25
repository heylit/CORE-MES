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

test.describe('Plan', () => {
  test.use({ hesap: 'ornek.planlama' });
  for (const yol of ['/cizelge', '/matris']) {
    test(`P2.2: ${yol} "Rota > Plan" bağlantısı menüdeki plan ekranına gider`, ETIKET, async ({ page, ac }) => {
      test.fail();
      await ac(yol);
      await expect(page.getByRole('link', { name: 'Rota > Plan' })).toHaveAttribute('href', '/recete-rota/plan', { timeout: 2_000 });
    });
  }
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
    for (const ad of ['Teslim al', 'Sepet', 'Teslim et', 'Malzeme iste']) await panel.getByRole('tab', { name: ad }).click();
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => { /* yoklama */ });
    expect(ag.hatalar).toEqual([]);
  });
});
