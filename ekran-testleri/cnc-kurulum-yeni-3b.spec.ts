import { expect, test } from './ortak.ts';

// CNC Kurulum 3B sahnesinin yazılım çizicisinde zorla çizildiği testler (cnc-kurulum-yeni.spec.ts'den ayrıldı, 1324).
// Zorlanan sahne tarayıcının GPU sürecini bütün çekirdeklerde koşturur ve bu iş test bittikten sonra da saniyelerce sürer: aynı
// tarayıcıda sonra açılan sayfa (finans ana sayfasının grafiği gibi) işlemcisiz kalıp bekler. Ayrı başlatma ayarı bu dosyaya ayrı
// işçi ve tarayıcı verir; başka dosyanın testi bu tarayıcıyı devralmaz, tarayıcı kapanınca GPU süreci de biter.
test.use({ hesap: 'ornek.yonetici' });
test.use({ launchOptions: async ({ launchOptions }, kullan) => { await kullan({ ...launchOptions, args: [...(launchOptions.args ?? []), '--tmiv2-sahne-3b'] }); } });

test.describe('3B sahne', () => {
  // Her 3B alan tek çizicinin kopyasını kendi tuvalinde gösterir (sahne/Sahne.tsx): tuval görünür alanı kaplar ve boş değildir.
  // CI'daki başsız tarayıcı yazılım çizicisidir ve orada 3B kapalıdır (1138 a); sahne testte zorlanarak çizdirilir (sahne/gl.ts).
  test('Kurulum, Hazırlık, Kütüphane, Ham Malzeme, G-Kod ve Takım Ömrü sahneleri çizilir', async ({ page, ac, ag }) => {
    // Yazılım çizicisinde ilk kare saniyeler sürer.
    test.setTimeout(180_000);
    await page.addInitScript(() => { (globalThis as { tmiv2Sahne3B?: string }).tmiv2Sahne3B = 'zorla'; });
    for (const yol of ['kurulum', 'hazirlik', 'kutuphane', 'hammadde', 'simulasyon', 'takim-omru']) {
      await ac(`/cnc-kurulum/yeni/${yol}`);
      // Kütüphane tezgâh cepleriyle açılır (1276 a); raf sahnesi Elimizdekiler'dedir.
      if (yol === 'kutuphane') await page.getByRole('button', { name: 'Elimizdekiler' }).click();
      const tuval = page.locator('.tc-cy-sahne-tuval').first();
      await expect(tuval, yol).toBeVisible({ timeout: 30_000 });
      await expect.poll(async () => tuval.evaluate((t: HTMLCanvasElement) => {
        // Tuvalin bağlamı görüntü aktarımıdır (bitmaprenderer); piksel, kopyası çizilen geçici tuvalden okunur.
        if (t.width === 0 || t.height === 0) return 0;
        const k = document.createElement('canvas'); k.width = t.width; k.height = t.height;
        const x = k.getContext('2d');
        if (x === null) return 0;
        x.drawImage(t, 0, 0);
        const d = x.getImageData(0, 0, k.width, k.height).data;
        let dolu = 0;
        for (let i = 3; i < d.length; i += 4 * 97) if ((d[i] ?? 0) > 0) dolu++;
        return dolu;
      }), { message: yol, timeout: 30_000 }).toBeGreaterThan(0);
    }
    expect(ag.hatalar).toEqual([]);
  });

  // 3D'li bilgisayarda 2B seçilince Ham Malzeme ve G-Kod düz tuvale çizilir; seçim sayfa yenilenince de kalır (1271).
  test('2B modda Ham Malzeme ve G-Kod çizilir, seçim hatırlanır', async ({ page, ac, ag }) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => { (globalThis as { tmiv2Sahne3B?: string }).tmiv2Sahne3B = 'zorla'; });
    await ac('/cnc-kurulum/yeni/hammadde');
    await page.getByRole('group', { name: 'Çizim modu' }).getByRole('button', { name: '2B' }).click();
    for (const yol of ['hammadde', 'simulasyon']) {
      // Her açılış sayfayı yeniden yükler; örnek parça yeniden seçilir, G-Kod örnek programla açılır.
      await ac(`/cnc-kurulum/yeni/${yol}`);
      if (yol === 'hammadde') await page.getByRole('button', { name: 'Örnek parça' }).click();
      const tuval = page.locator('.tc-cy-sahne-2b');
      await expect(tuval, yol).toBeVisible();
      expect(await page.locator('.tc-cy-sahne-tuval').count(), yol).toBe(0);
      // Zemin tek renktir; parça, ham ve yol çizildiyse tuvalde farklı renkler vardır.
      await expect.poll(async () => tuval.evaluate((t: HTMLCanvasElement) => {
        const d = t.getContext('2d')?.getImageData(0, 0, t.width, t.height).data;
        if (!d) return 0;
        const renkler = new Set<number>();
        for (let i = 0; i < d.length; i += 4 * 53) renkler.add(((d[i] ?? 0) << 16) | ((d[i + 1] ?? 0) << 8) | (d[i + 2] ?? 0));
        return renkler.size;
      }), { message: yol, timeout: 30_000 }).toBeGreaterThan(8);
    }
    await page.reload();
    await expect(page.locator('.tc-cy-sahne-2b')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('group', { name: 'Çizim modu' }).getByRole('button', { name: '2B' })).toHaveAttribute('aria-pressed', 'true');
    expect(ag.hatalar).toEqual([]);
  });
});
