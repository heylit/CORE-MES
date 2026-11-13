import type { Route } from '@playwright/test';
import { expect, tasmaOlc, test } from './ortak.ts';

// Kart 3151: Kokpit (Planlama > Kokpit). Genişlik projeden gelir (360, 768, 1280). Çalışma okuması ve sunucu komutları ağ katmanında uydurma
// cevaplarla verilir (page.route); veritabanına yazılmaz. Akış: tahta açılır, iş sağ tıkla tutulup bırakılır (önizleme, sonra iş taşı),
// Geri / İleri sayar, Matris yükü ve emirleri tek ekranda gösterir, ayrıntı ve çözüm yerinde açılır, sorun turu adım adım ilerler, plansız emir ayrıntıdan plana alınır. Telefonda tahta yerine liste ve
// alttan ayrıntı vardır. Sayfa hiçbir adımda yatay taşmaz.
test.use({ hesap: 'ornek.yonetici' });

type Is = { job: string; m: string; S: number; C: number };
// Veri uydurmadır: üç tezgâh, dört emir; S1 terminden sonra biter, S3 termine dört saat kala biter, S4 plana alınmamıştır.
const plan = (ops: Record<string, Is>) => ({
  dataVer: 3, ops, warn: [], ozet: { wT: 20, T: 20, late: 1 },
  J: { S1: { C: ops['S1.a2']?.C ?? 0, T: 20 }, S2: { C: ops['S2.a1']?.C ?? 0, T: 0 }, S3: { C: ops['S3.a1']?.C ?? 0, T: 0 } },
});
const ILK: Record<string, Is> = {
  'S1.a1': { job: 'S1', m: 'M1', S: 8, C: 16 }, 'S1.a2': { job: 'S1', m: 'M2', S: 57, C: 65 },
  'S2.a1': { job: 'S2', m: 'M2', S: 32, C: 40 }, 'S3.a1': { job: 'S3', m: 'M1', S: 32, C: 38 },
};
const calisma = (ops: Record<string, Is>, locks: Record<string, unknown>) => ({
  surum: 2, dataVer: 3, w: { dondurma: 4 }, locks,
  D: {
    meta: { baslangic: '2026-10-19' },
    siparisler: [
      { id: 'S1', urun: 'U1', adet: 8, termin: '2026-10-20 21:00' }, { id: 'S2', urun: 'U2', adet: 8, termin: '2026-10-30 17:00' },
      { id: 'S3', urun: 'U2', adet: 6, termin: '2026-10-20 18:00' }, { id: 'S4', urun: 'U2', adet: 4, termin: '2026-10-28 17:00' },
    ],
    urunler: [
      { id: 'U1', ad: 'Deneme flans', rota: [{ k: 'a1', ad: 'Torna', tezgahlar: [{ id: 'M1', cevrim: 60 }] }, { k: 'a2', ad: 'Freze', bag: [['a1', 'FS']], tezgahlar: [{ id: 'M2', cevrim: 60 }, { id: 'M3', cevrim: 60 }] }] },
      { id: 'U2', ad: 'Deneme burc', rota: [{ k: 'a1', ad: 'Torna', tezgahlar: [{ id: 'M1', cevrim: 60 }, { id: 'M2', cevrim: 60 }] }] },
    ],
    tezgahlar: [{ id: 'M1', kod: 'T-01', ad: 'Deneme torna' }, { id: 'M2', kod: 'F-01', ad: 'Deneme freze 1' }, { id: 'M3', kod: 'F-02', ad: 'Deneme freze 2' }],
    vardiyalar: [{ id: '1', bas: '08:00', bit: '16:00', molalar: [] }, { id: '2', bas: '16:00', bit: '00:00', molalar: [] }],
    calismaGunleri: { pzt: ['1', '2'], sal: ['1', '2'], car: ['1', '2'], per: ['1', '2'], cum: ['1', '2'], cmt: ['1'], paz: [] },
  },
  plan: plan(ops),
});
const json = (r: Route, v: unknown) => r.fulfill({ json: v });

test('Kokpit: tahta, sağ tıkla tut ve bırak, Geri / İleri sayar, Matris, sorun turu; telefonda liste; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  let surum = 1;
  let ops = { ...ILK };
  let locks: Record<string, unknown> = {};
  const tasinan: unknown[] = [];
  const onizleme: string[] = [];
  await page.route('**/api/plan/planlama-calismasi', (r) => json(r, { calisma: calisma(ops, locks), surum }));
  await page.route('**/api/plan/planlama-calismasi/is-tasi-onizlemesi?*', (r) => {
    const q = new URL(r.request().url()).searchParams;
    const id = q.get('isId') ?? '', S = Number(q.get('baslangic')), x = ops[id];
    onizleme.push(id);
    return json(r, { calismaSurumu: surum, gecerli: true, ileti: null, isler: x ? [{ isId: id, tezgah: q.get('tezgah'), S, C: S + (x.C - x.S), eskiTezgah: x.m, eskiS: x.S, tur: 'tasinan' }] : [] });
  });
  await page.route('**/api/plan/planlama-calismasi/is-tasi', (r) => {
    const g = r.request().postDataJSON() as { isId: string; tezgah: string; baslangic: number };
    const x = ops[g.isId];
    tasinan.push(g);
    const onceki = surum;
    if (x) { ops = { ...ops, [g.isId]: { ...x, m: g.tezgah, S: g.baslangic, C: g.baslangic + (x.C - x.S) } }; locks = { ...locks, [g.isId]: { m: g.tezgah, S: g.baslangic } }; surum += 1; }
    return json(r, { calismaSurumu: surum, oncekiSurum: onceki, ileti: null });
  });
  // Plana alma: önizleme ilk adımı istenen yerde gösterir; komut emri plana koyar (gerçekte motor yeniden dizince olur).
  const alinan: unknown[] = [];
  await page.route('**/api/plan/planlama-calismasi/plana-al-onizlemesi?*', (r) => {
    const q = new URL(r.request().url()).searchParams, S = Number(q.get('baslangic'));
    return json(r, { calismaSurumu: Number(q.get('calismaSurumu')), gecerli: true, ileti: null, isler: [{ isId: 'S4.a1', tezgah: q.get('tezgah'), S, C: S + 4 }], bitis: S + 4 });
  });
  await page.route('**/api/plan/planlama-calismasi/plana-al', (r) => {
    const g = r.request().postDataJSON() as { emirId: string; tezgah: string; baslangic: number };
    alinan.push(g);
    const onceki = surum;
    ops = { ...ops, 'S4.a1': { job: 'S4', m: g.tezgah, S: g.baslangic, C: g.baslangic + 4 } }; locks = { ...locks, 'S4.a1': { m: g.tezgah, S: g.baslangic } }; surum += 1;
    return json(r, { calismaSurumu: surum, oncekiSurum: onceki, ileti: null });
  });
  await page.route('**/api/plan/planlama-kayitlari/yaz', (r) => {
    const g = r.request().postDataJSON() as { anahtar: string; deger: { plan?: { ops?: Record<string, Is> }; locks?: Record<string, unknown> } };
    if (g.deger.plan?.ops) ops = g.deger.plan.ops;
    locks = g.deger.locks ?? {};
    surum += 1;
    return json(r, { kayit: { anahtar: g.anahtar, bicim: 'json', deger: g.deger, surum } });
  });
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan/kokpit');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  const tasma = async () => { expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0); };
  await tasma();
  const suzgec = kokpit.getByRole('group', { name: 'Durum süzgeci' });
  await expect(suzgec.getByRole('button', { name: /Geç/ })).toContainText('1');
  await expect(suzgec.getByRole('button', { name: /Plansız/ })).toContainText('1');

  // Sorun turu: geç ve riskli emir birer adımdır; Atla ilerler, Önceki adım geri döner, Sonraki adım aynı kararı yineler; Vazgeç kapatır.
  await kokpit.getByRole('button', { name: 'Sorunları sırayla çöz' }).click();
  const tur = kokpit.getByRole('complementary', { name: 'Sorunları sırayla çöz' });
  await expect(tur).toContainText('1 / 3');
  await expect(tur).toContainText('S1');
  // En iyi hamle tek başına durur, tahtada gideceği yer gösterilir (telefonda tahta yoktur); "Başka çözüm" ötekini onun yerine koyar.
  await expect(tur.locator('[data-hamle]')).toHaveCount(1);
  await expect(tur.locator('[data-hamle="M2"]')).toContainText(/termine yetişir/);
  await expect(tur.getByRole('button', { name: 'Uygula, sıradaki' })).toBeInViewport({ ratio: 1 });
  // Tur her hamleyi o anda taslağa yazar: tur sürerken onaya gönderilmez. 768 ve üstünde panel tahtanın yanındadır, üstüne binmez.
  await expect(kokpit.getByRole('button', { name: 'Onaya gönder' })).toBeDisabled();
  if (bilgi.project.name !== 'g360') {
    const pk = await tur.boundingBox(), tk = await kokpit.locator('.tc-pyq-tahta').boundingBox();
    expect(pk && tk && pk.x >= tk.x + tk.width).toBe(true);
  }
  if (bilgi.project.name !== 'g360') await expect(kokpit.locator('.tc-pyq-tahta [data-satir="M2"] [data-oneri]')).toBeVisible();
  await tur.getByRole('group', { name: 'Başka çözüm' }).locator('[data-baska="M3"]').click();
  await expect(tur.locator('[data-hamle]')).toHaveCount(1);
  await expect(tur.locator('[data-hamle="M3"]')).toContainText(/termine yetişir/);
  if (bilgi.project.name !== 'g360') await expect(kokpit.locator('.tc-pyq-tahta [data-satir="M3"] [data-oneri]')).toBeVisible();
  await tasma();
  await tur.getByRole('button', { name: 'Atla' }).click();
  await expect(tur).toContainText('2 / 3');
  await expect(tur).toContainText('S3');
  await expect(tur.getByRole('button', { name: 'Önceki adım' }).locator('.tc-pyq-rozet')).toHaveText('1');
  await tur.getByRole('button', { name: 'Önceki adım' }).click();
  await expect(tur).toContainText('1 / 3');
  await expect(tur.getByRole('button', { name: 'Sonraki adım' }).locator('.tc-pyq-rozet')).toHaveText('1');
  await tur.getByRole('button', { name: 'Sonraki adım' }).click();
  await expect(tur).toContainText('2 / 3');
  await tur.getByRole('button', { name: 'Vazgeç' }).click();
  await expect(tur).toBeHidden();
  expect(tasinan).toEqual([]);

  if (bilgi.project.name === 'g360') {
    // Telefon: tahta yok, liste var; emre dokununca ayrıntı açılır, adımın tezgâh seçeneği önizlemeyle gelir ve Uygula taşır.
    await expect(kokpit.locator('.tc-pyq-tahta')).toBeHidden();
    const liste = kokpit.getByRole('list', { name: 'Emirler' });
    await expect(liste.getByRole('button')).toHaveCount(4);
    await liste.getByRole('button', { name: /S1/ }).click();
    const ayr = kokpit.getByRole('complementary', { name: /S1 ayrıntısı/ });
    await expect(ayr).toBeVisible();
    await ayr.getByRole('button', { name: /2\. Freze/ }).click();
    const hamle = ayr.locator('[data-hamle="M3"]');
    await expect(hamle).toContainText('F-02');
    await expect(hamle).toContainText(/termine yetişir/);
    await tasma();
    await hamle.getByRole('button', { name: 'Uygula' }).click();
    await expect.poll(() => tasinan.length).toBe(1);
    expect(tasinan[0]).toMatchObject({ isId: 'S1.a2', tezgah: 'M3' });
    await expect(suzgec.getByRole('button', { name: /Geç/ })).toContainText('0');
    await tasma();
    await ayr.getByRole('button', { name: 'Ayrıntıyı kapat' }).click();
    await expect(ayr).toBeHidden();
  } else {
    // Tahta: iş sağ tıkla tutulur, başka saate bırakılır; önce önizleme sorulur, sonra iş taşı gider.
    // Tur seçimi ve kaydırmayı emrinde bırakır; ayrıntı kapanır, tahta başa döner.
    await page.keyboard.press('Escape');
    const tahta = kokpit.locator('.tc-pyq-tahta');
    await tahta.evaluate((el) => { el.scrollTo({ left: 0 }); });
    const is = tahta.locator('[data-is="S2.a1"]');
    await expect(is).toBeVisible();
    await is.click({ button: 'right' });
    const menu = tahta.getByRole('menu');
    await expect(menu.getByRole('menuitem', { name: /Yapışarak tut/ })).toBeVisible();
    await menu.getByRole('menuitem', { name: /Yapışarak tut/ }).click();
    await expect(tahta.getByText(/Bırakmak için tıklayın/)).toBeVisible();
    const kutu = await is.boundingBox();
    if (!kutu) throw new Error('iş görünmüyor');
    await page.mouse.move(kutu.x + kutu.width + 60, kutu.y + kutu.height / 2, { steps: 4 });
    await expect(tahta.locator('.tc-pyq-hayalet')).toBeVisible();
    await page.mouse.click(kutu.x + kutu.width + 60, kutu.y + kutu.height / 2);
    await expect.poll(() => tasinan.length).toBe(1);
    expect(onizleme).toContain('S2.a1');
    expect(tasinan[0]).toMatchObject({ isId: 'S2.a1', tezgah: 'M2' });
    expect((tasinan[0] as { baslangic: number }).baslangic).toBeGreaterThan(32);
    // Geri / İleri o yönde kaç adım olduğunu gösterir.
    const gi = kokpit.getByRole('group', { name: 'Geri ve ileri' });
    const geri = gi.getByRole('button', { name: /Geri/ }), ileri = gi.getByRole('button', { name: /İleri/ });
    await expect(geri.locator('.tc-pyq-rozet')).toHaveText('1');
    await expect(kokpit.getByText(/Taslak · 1 değişiklik/)).toBeVisible();
    await tasma();
    await geri.click();
    await expect(geri.locator('.tc-pyq-rozet')).toHaveCount(0);
    await expect(ileri.locator('.tc-pyq-rozet')).toHaveText('1');
    await ileri.click();
    await expect(geri.locator('.tc-pyq-rozet')).toHaveText('1');

    // Space imlecin altındaki işi tutar, Esc vazgeçer.
    await tahta.locator('[data-is="S3.a1"]').hover();
    await page.keyboard.press('Space');
    await expect(tahta.getByText(/Bırakmak için tıklayın/)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(tahta.getByText(/Bırakmak için tıklayın/)).toBeHidden();

    // Ölçek: Ay'da yük hücreleri; hücre o güne iner.
    const olcek = kokpit.getByRole('group', { name: 'Ölçek' });
    await olcek.getByRole('button', { name: 'Ay' }).click();
    await expect(tahta.locator('.tc-pyq-hucre').first()).toBeVisible();
    await tasma();
    await tahta.locator('[data-satir="M1"] .tc-pyq-hucre:not(:disabled)').first().click();
    await expect(olcek.getByRole('button', { name: 'Gün', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await olcek.getByRole('button', { name: '3 gün' }).click();

    // Turda iki hamle uygulanır; "Taslağa yaz" turu tek değişiklik bırakır: Geri ikisini birlikte alır, İleri birlikte yineler.
    await kokpit.getByRole('button', { name: 'Sorunları sırayla çöz' }).click();
    await tur.locator('[data-baska="M3"]').click();
    await tur.locator('[data-hamle="M3"]').getByRole('button', { name: 'Uygula, sıradaki' }).click();
    await expect.poll(() => tasinan.length).toBe(2);
    expect(tasinan[1]).toMatchObject({ isId: 'S1.a2', tezgah: 'M3' });
    await expect(tur).toContainText('2 / 3');
    await tur.locator('[data-hamle]').first().getByRole('button', { name: 'Uygula' }).click();
    await expect.poll(() => tasinan.length).toBe(3);
    expect(tasinan[2]).toMatchObject({ isId: 'S3.a1' });
    // Üçüncü adım plansız emirdir: plana alma seçeneği önizlemeyle gelir; burada atlanır.
    await expect(tur).toContainText('3 / 3');
    await expect(tur).toContainText('S4');
    await expect(tur.locator('[data-hamle]')).toContainText(/termine yetişir/);
    await expect(tur.getByRole('button', { name: 'Plana al, sıradaki' })).toBeVisible();
    await expect(tahta.locator('[data-oneri]')).toContainText('plana al');
    await tur.getByRole('button', { name: 'Atla' }).click();
    await expect(tur).toContainText('tur bitti');
    await tur.getByRole('button', { name: 'Taslağa yaz' }).click();
    await expect(tur).toBeHidden();
    await expect(geri.locator('.tc-pyq-rozet')).toHaveText('2');
    await expect(kokpit.getByText(/Taslak · 2 değişiklik/)).toBeVisible();
    await geri.click();
    await expect(geri.locator('.tc-pyq-rozet')).toHaveText('1');
    await expect(ileri.locator('.tc-pyq-rozet')).toHaveText('1');
    await ileri.click();
    await expect(geri.locator('.tc-pyq-rozet')).toHaveText('2');
    await page.keyboard.press('Escape');
  }

  // Matris: yük ve emirler tek ekranda. Tıklama sayfa değiştirmez: emir ve adım seçilir, ayrıntı ve çözüm yerinde açılır; yük hücresi emirleri süzer.
  const goz = kokpit.getByRole('group', { name: 'Görünüm' });
  await goz.getByRole('button', { name: 'Matris' }).click();
  const duzen = kokpit.getByRole('group', { name: 'Düzen' });
  await expect(duzen.getByRole('button', { name: bilgi.project.name === 'g360' ? 'Yan yana' : 'Akış' })).toHaveAttribute('aria-pressed', 'true');
  await expect(kokpit.locator('.tc-pyq-ozet')).toContainText(/emir geç|Geç emir yok/);
  await duzen.getByRole('button', { name: 'Akış' }).click();
  const akis = kokpit.getByRole('region', { name: 'Tezgâh yükü ve emirler, gün gün' });
  await expect(akis.locator('tbody tr[data-emir]')).toHaveCount(4);
  await expect(akis.locator('thead tr').first().getByRole('columnheader')).toHaveCount(15);
  await tasma();
  await akis.locator('[data-hucre="S3.a1"]').first().click();
  await expect(goz.getByRole('button', { name: 'Matris' })).toHaveAttribute('aria-pressed', 'true');
  const s3 = kokpit.getByRole('complementary', { name: /S3 ayrıntısı/ });
  await expect(s3).toBeVisible();
  await expect(akis.locator('tbody tr[data-emir="S3"]')).toHaveAttribute('data-sec', '');
  await expect(akis.locator('tbody tr[data-emir="S3"]')).toBeInViewport();
  // Matriste çözüm adımlardan önce gelir.
  expect(await s3.locator('h3').allTextContents()).toEqual([expect.stringContaining('tezgâh seçenekleri'), 'Adımlar']);
  // Seçili emrin geçtiği tezgâh-gün yükte çerçevelidir; o hücre emirleri süzer, süzgeç kalkınca hepsi döner.
  const izli = akis.locator('tr[data-yuk-satiri] td[data-iz] button').first();
  await expect(izli).toBeVisible();
  await izli.click();
  await expect(kokpit.locator('.tc-pyq-suz')).toContainText('süzgeci');
  await expect(akis.locator('tbody tr[data-emir="S3"]')).toBeVisible();
  await expect(akis.locator('tbody tr[data-emir="S4"]')).toHaveCount(0);
  await tasma();
  await kokpit.getByRole('button', { name: 'Süzgeci kaldır' }).click();
  await expect(akis.locator('tbody tr[data-emir]')).toHaveCount(4);
  await duzen.getByRole('button', { name: 'Yan yana' }).click();
  const matris = kokpit.getByRole('region', { name: 'Emir × adım matrisi' });
  await expect(matris.getByRole('row')).toHaveCount(5);
  await expect(matris.locator('tr[data-emir="S4"]')).toContainText('plansız');
  await expect(kokpit.getByRole('region', { name: 'Tezgâh × gün yükü' }).getByRole('columnheader')).toHaveCount(15);
  await expect(matris.locator('[data-hucre="S3.a1"]')).toHaveAttribute('aria-pressed', 'true');
  await tasma();
  if (bilgi.project.name !== 'g360') await goz.getByRole('button', { name: 'Tezgâh' }).click();
  if (bilgi.project.name !== 'g360') {
    // Seçili iş ok tuşuyla yarım saat kayar; her basış bir taşımadır.
    const n = tasinan.length, eski = ops['S3.a1']?.S ?? 0;
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => tasinan.length).toBe(n + 1);
    expect(tasinan[n]).toMatchObject({ isId: 'S3.a1', baslangic: eski - 0.5 });
    // Taşıma yazılırken yeni bırakma alınmaz (bildirimle geri çevrilir): sonraki adım yazma bitince başlar.
    await expect(kokpit.locator('.tc-pyq-degisim span', { hasText: 'yazılıyor' })).toHaveCount(0);
  }

  // Plana alma. Geniş ekranda tepsideki emir sağ tıkla tutulur ve ilk adımının aday tezgâhına bırakılır; ötekilerde emrin ayrıntısında ilk
  // adımın tezgâh seçenekleri önizlemeyle gelir. İkisi de aynı komuta gider; Plansız sayısı düşer.
  if (bilgi.project.name === 'g1280') {
    await page.keyboard.press('Escape');
    const tahta = kokpit.locator('.tc-pyq-tahta');
    await tahta.evaluate((el) => { el.scrollTo({ left: 0 }); });
    await tahta.locator('[data-fis="S4"]').click({ button: 'right' });
    await tahta.getByRole('menu').getByRole('menuitem', { name: /Tut ve tahtaya bırak/ }).click();
    await expect(tahta.getByText(/Bırakmak için tıklayın/)).toBeVisible();
    await expect(tahta.locator('[data-satir="M3"]')).toHaveAttribute('data-aday', 'hayir');
    const alan = await tahta.locator('[data-satir="M2"] .tc-pyq-alan').boundingBox();
    if (!alan) throw new Error('satır görünmüyor');
    await page.mouse.move(alan.x + 420, alan.y + alan.height / 2, { steps: 4 });
    await expect(tahta.locator('[data-satir="M2"] .tc-pyq-hayalet')).toContainText('plana al');
    await page.mouse.click(alan.x + 420, alan.y + alan.height / 2);
    await expect.poll(() => alinan.length).toBe(1);
    expect(alinan[0]).toMatchObject({ emirId: 'S4', tezgah: 'M2' });
  } else {
    await goz.getByRole('button', { name: 'Matris' }).click();
    await matris.locator('tr[data-emir="S4"] button').first().click();
    const s4 = kokpit.getByRole('complementary', { name: /S4 ayrıntısı/ });
    await expect(s4.locator('[data-hamle="M1"]')).toContainText(/termine yetişir/);
    await tasma();
    await s4.locator('[data-hamle="M1"]').getByRole('button', { name: 'Plana al' }).click();
    await expect.poll(() => alinan.length).toBe(1);
    expect(alinan[0]).toMatchObject({ emirId: 'S4', tezgah: 'M1' });
    // Sonuç ayrıntıda yazar; sayfa Matris'te kalır.
    await expect(s4).toContainText('Emir plana alındı');
    await expect(goz.getByRole('button', { name: 'Matris' })).toHaveAttribute('aria-pressed', 'true');
  }
  await expect(suzgec.getByRole('button', { name: /Plansız/ })).toContainText('0');

  // Kalanını oynat (baştaki planla): kalan adımlarda öne çıkan hamle kendiliğinden uygulanır, plansız emir plana alınır; tur sonunda durur.
  ops = { ...ILK }; locks = {}; surum += 1;
  const tasinmis = tasinan.length;
  await page.reload();
  await kokpit.getByRole('button', { name: 'Sorunları sırayla çöz' }).click();
  await expect(tur).toContainText('1 / 3');
  await tur.getByRole('button', { name: 'Kalanını oynat' }).click();
  await expect(tur).toContainText('tur bitti');
  await expect(tur).toContainText('3 hamle uygulandı');
  expect(tasinan.length).toBe(tasinmis + 2);
  expect(alinan.length).toBe(2);
  await tur.getByRole('button', { name: 'Taslağa yaz' }).click();
  await expect(tur).toBeHidden();

  await tasma();
  expect(ag.hatalar).toEqual([]);
  expect(ag.yazmalar.every((y) => /planlama-calismasi\/is-tasi|planlama-calismasi\/plana-al|planlama-kayitlari\/yaz|duzenleyen/.test(y))).toBe(true);
});
