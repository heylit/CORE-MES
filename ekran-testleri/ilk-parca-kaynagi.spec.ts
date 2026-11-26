import { expect, test } from './ortak.ts';

// 3689-2: ilk parça onayının tek kaynağı Kalite Merkezi numune planıdır. Rota yazabilen ama Kalite Merkezi'ni göremeyen planlama hesabı
// rota adımında ilk parçayı değiştiremez: onay kutusu yok, salt okunur satır var, "Stüdyoda aç" kapalı.
test.use({ hesap: 'ornek.planlama' });

test('rota adımında ilk parça salt okunur; Kalite Merkezi yetkisi olmayan stüdyoyu açamaz', async ({ page, ac }) => {
  await ac('/recete-rota/schema');
  const bolge = page.getByRole('region', { name: 'Ürün ve rotalar' });
  await bolge.getByRole('button', { name: /^OP 10/ }).first().click();
  const panel = bolge.getByRole('complementary', { name: 'Düzenleme paneli' });
  await panel.getByRole('button', { name: /^Planlama ayarları/ }).click();
  const satir = panel.getByRole('group', { name: 'İlk parça onayı' });
  await expect(satir).toContainText('İlk parça:');
  await expect(satir.getByRole('button', { name: 'Stüdyoda aç' })).toBeDisabled();
  await expect(panel.getByLabel(/ilk parça onayı istensin/i)).toHaveCount(0);
});
