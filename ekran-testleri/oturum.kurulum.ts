import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { HESAPLAR } from './hesaplar.ts';
import { HESAP_DOSYASI, oturumDosyasi } from './yollar.ts';

// Her hesap bir kez girer, çerezi dosyaya yazılır; testler bu oturumu kullanır. Giriş sayısı sınırlı tutulur:
// sunucu aynı adresten art arda girişi yavaşlatır (429) ve on yanlış denemede hesabı kilitler.
test('örnek hesaplar girer', async ({ playwright, baseURL }) => {
  const { parola } = JSON.parse(readFileSync(HESAP_DOSYASI, 'utf8')) as { parola: string };
  for (const hesap of HESAPLAR) {
    const istek = await playwright.request.newContext({ baseURL });
    const cevap = await istek.post('/api/oturum/giris', { data: { kullaniciAdi: hesap, parola } });
    expect(cevap.status(), `${hesap} girişi`).toBe(200);
    const govde = (await cevap.json()) as { kullanici: { id: number } | null };
    if (govde.kullanici === null) throw new Error(`${hesap} girişi PIN istiyor; ekran testleri PIN akışını kurmaz`);
    const durum = await istek.storageState();
    writeFileSync(oturumDosyasi(hesap), JSON.stringify({ ...durum, kisiId: govde.kullanici.id }), { mode: 0o600 });
    await istek.dispose();
  }
});
