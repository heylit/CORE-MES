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
  test('Kurulum, Hazırlık, Kütüphane, Ham Malzeme ve Takım Ömrü sahneleri çizilir', async ({ page, ac, ag }) => {
    // Yazılım çizicisinde ilk kare saniyeler sürer; CI'da g768'de 30 sn'yi aştığı görüldü (2418). Sahne başına bekleme 60 sn'dir,
    // toplam süre beş sahnenin çoğu birkaç saniyede çizildiği için 240 sn içinde kalır. İlk kare süresi CI kaydına yazılır ki
    // yavaşlama sınıra dayanmadan görülsün.
    test.setTimeout(240_000);
    const SAHNE_BEKLEME = 60_000;
    // Sahneler 3D seçilince çizilir; Kurulum ve Takım Ömrü 3D'de çarktır. Varsayılan 2B'de (kartlı akış) sürekli sahne yoktur (1843, 1921 a).
    await page.addInitScript(() => {
      (globalThis as { tmiv2Sahne3B?: string }).tmiv2Sahne3B = 'zorla';
      localStorage.setItem('tmiv2.cnc-kurulum.cizim-modu', '3d');
    });
    for (const yol of ['kurulum', 'hazirlik', 'kutuphane', 'hammadde', 'takim-omru']) {
      await ac(`/cnc-kurulum/yeni/${yol}`);
      const baslangic = Date.now();
      // Kütüphane tezgâh cepleriyle açılır (1276 a); raf sahnesi Elimizdekiler'dedir.
      if (yol === 'kutuphane') await page.getByRole('button', { name: 'Elimizdekiler' }).click();
      const tuval = page.locator('.tc-cy-sahne-tuval').first();
      await expect(tuval, yol).toBeVisible({ timeout: SAHNE_BEKLEME });
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
      }), { message: yol, timeout: SAHNE_BEKLEME }).toBeGreaterThan(0);
      const sure = Date.now() - baslangic;
      test.info().annotations.push({ type: 'ilk kare', description: `${yol} ${sure} ms` });
      console.log(`3B sahne ilk kare: ${yol} ${sure} ms`);
    }
    expect(ag.hatalar).toEqual([]);
  });

  // Kartlı akış (1843): Kurulum ve Takım Ömrü'nde sürekli çizilen tuval yoktur; kart resimleri 3B çizilip bir kez saklanır.
  test('kartlı akışta tuval yok, kart resimleri 3B çizilir', async ({ page, ac, ag }) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => { (globalThis as { tmiv2Sahne3B?: string }).tmiv2Sahne3B = 'zorla'; });
    // İlk kart resmi sayfanın tek iş parçacığında, tek görevde çizilir: yazılım çizicisinde gölgelendirici derlemesi ve piksel okuması
    // saniyeler sürer (yerelde 2,5-6 sn, yüklü CI'da 12 sn ölçüldü) ve o sürede sayfa testin sorgularına yanıt vermez. Bu yüzden önce
    // resim beklenir; resim gelince sayfa boştadır ve sonraki denetimler kendi süresiyle koşar.
    await ac('/cnc-kurulum/yeni/kurulum');
    await expect(page.locator('.tc-cy-ka-satir[data-aktif] .tc-cy-ka-resim img').first()).toBeVisible({ timeout: 30_000 });
    // Varsayılan 2B'dir; 3D seçilebilir bilgisayarda da kartlı akış gelir (1921 a).
    await expect(page.getByRole('group', { name: 'Çizim modu' }).getByRole('button', { name: '2B' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.tc-cy-sahne-tuval')).toHaveCount(0);
    await ac('/cnc-kurulum/yeni/takim-omru');
    // Sayfa yeniden yüklenir; çizici ve ilk resmin bedeli yeniden ödenir.
    await expect(page.locator('.tc-cy-ka-satir[data-aktif] .tc-cy-ka-resim img').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.tc-cy-sahne-tuval')).toHaveCount(0);
    expect(ag.hatalar).toEqual([]);
  });

  // 3D'li bilgisayarda da varsayılan 2B'dir (1921 a): Ham Malzeme düz tuvale çizilir. 3D seçimi sayfa yenilenince de kalır (1271).
  test('2B modda Ham Malzeme çizilir, seçim hatırlanır', async ({ page, ac, ag }) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => { (globalThis as { tmiv2Sahne3B?: string }).tmiv2Sahne3B = 'zorla'; });
    const secici = page.getByRole('group', { name: 'Çizim modu' });
    for (const yol of ['hammadde']) {
      await ac(`/cnc-kurulum/yeni/${yol}`);
      await page.getByRole('button', { name: 'Örnek parça' }).click();
      const tuval = page.locator('.tc-cy-sahne-2b');
      // 2B modda da modül açılırken 3B çizici yazılım çizicisinde kurulur (sahne/gl.ts, 3D seçilebilir mi diye); yüklü makinede bu
      // saniyeler sürer ve görünüm ondan sonra çizilir. Tuvalin gelmesi, ilk sahne testindeki gibi yazılım çizicisinin süresiyle beklenir.
      await expect(tuval, yol).toBeVisible({ timeout: 30_000 });
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
    await expect(secici.getByRole('button', { name: '2B' })).toHaveAttribute('aria-pressed', 'true');
    await secici.getByRole('button', { name: '3D' }).click();
    await expect(page.locator('.tc-cy-sahne-tuval').first()).toBeAttached({ timeout: 30_000 });
    await page.reload();
    await expect(secici.getByRole('button', { name: '3D' })).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 });
    await expect(page.locator('.tc-cy-sahne-2b')).toHaveCount(0);
    expect(ag.hatalar).toEqual([]);
  });
});
