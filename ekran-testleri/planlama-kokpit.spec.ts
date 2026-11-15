import type { Page, Route } from '@playwright/test';
import { expect, tasmaOlc, test } from './ortak.ts';

// Kart 3151: Kokpit (Planlama > Kokpit). Genişlik projeden gelir (360, 768, 1280). Çalışma okuması ve sunucu komutları ağ katmanında uydurma
// cevaplarla verilir (page.route); veritabanına yazılmaz. Akış: tahta açılır, iş sağ tıkla tutulup bırakılır (önizleme, sonra iş taşı),
// taslağa yazar ve Geri sayar, Matris yükü ve emirleri tek ekranda gösterir, ayrıntı ve çözüm yerinde açılır, sorun turu adım adım ilerler, plansız emir ayrıntıdan plana alınır. Telefonda tahta yerine liste ve
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

// Kişinin taslağı uydurmadır (3282 1d-2b): komutlar sırayla tutulur, görünüm her okumada ortak duruma oynatılarak kurulur. Taşı ve plana al
// işi yerine koyar, ayar ve yön w'ye yazar; dizilmemiş komut planı bekletir (bekleyen), dizme temizler. Uygula (taslak çubuğunda Canlıya al) görünümü ortak yapar.
type Komut = { tur: string } & Record<string, unknown>;
interface Durum { ops: Record<string, Is>; locks: Record<string, unknown>; w: Record<string, unknown> }
const IS = '00000000-0000-4000-8000-0000000000a1';
function oynat(d: Durum, l: readonly Komut[]): Durum {
  let { ops, locks, w } = d;
  for (const k of l) {
    const S = Number(k['baslangic']), m = String(k['tezgah']);
    if (k.tur === 'tasi') {
      const id = String(k['isId']), x = ops[id];
      if (x) { ops = { ...ops, [id]: { ...x, m, S, C: S + (x.C - x.S) } }; locks = { ...locks, [id]: { m, S } }; }
    } else if (k.tur === 'plana-al') {
      const job = String(k['emirId']);
      ops = { ...ops, [`${job}.a1`]: { job, m, S, C: S + 4 } }; locks = { ...locks, [`${job}.a1`]: { m, S } };
    } else if (k.tur === 'ayar') {
      w = { ...w, ...(k['ayar'] as { w: Record<string, unknown> }).w };
    } else if (k.tur === 'yon') {
      const y = { ...(w['yonEmir'] as Record<string, unknown> | undefined) }, id = String(k['emirId']);
      if (k['yon'] === 'plan') delete y[id]; else y[id] = k['yon'];
      w = { ...w, yonEmir: y };
    }
  }
  return { ops, locks, w };
}
const ILK_DURUM: Durum = { ops: ILK, locks: {}, w: { dondurma: 4 } };
const calismaKur = (d: Durum) => ({ ...calisma(d.ops, d.locks), w: d.w });
async function taslakSunucusu(page: Page, kur: (d: Durum) => Record<string, unknown> = calismaKur) {
  const s = { ortak: ILK_DURUM, surum: 1, taslakSurumu: 0, satirlar: [] as { komut: Komut; ne: string; t: number; hata: null }[], komutlar: [] as Komut[], degerlendirme: [] as unknown[], uygulandi: 0 };
  const gorunum = () => oynat(s.ortak, s.satirlar.map((x) => x.komut));
  const bekleyen = [{ id: 'ORN-b', ne: 'Taslak değişikliği', ayrinti: '', kim: '', t: 0, isler: ['*'], geri: null }];
  const cevap = () => {
    if (s.satirlar.length === 0) return { taslak: null, calisma: kur(s.ortak), surum: s.surum };
    const c = kur(gorunum()), dizildi = s.satirlar.at(-1)?.komut.tur === 'diz';
    return { taslak: { surum: s.taslakSurumu, tabanSurum: s.surum, satirlar: s.satirlar }, calisma: dizildi ? c : { ...c, dataVer: 4, bekleyen }, surum: s.surum };
  };
  const ekle = (komut: Komut, ne: string) => { s.satirlar.push({ komut, ne, t: 0, hata: null }); s.taslakSurumu += 1; };
  await page.route('**/api/plan/planlama-calismasi', (r) => json(r, { calisma: kur(s.ortak), surum: s.surum }));
  await page.route('**/api/plan/taslagim', (r) => json(r, cevap()));
  await page.route('**/api/plan/taslagim/komut', (r) => {
    const k = (r.request().postDataJSON() as { komut: Komut }).komut;
    s.komutlar.push(k); ekle(k, `${k.tur} ${String(k['isId'] ?? k['emirId'] ?? '')}`);
    return json(r, cevap());
  });
  await page.route('**/api/plan/taslagim/geri-al', (r) => { s.satirlar.pop(); s.taslakSurumu += 1; return json(r, cevap()); });
  await page.route('**/api/plan/taslagim/vazgec', (r) => { s.satirlar = []; return json(r, cevap()); });
  await page.route('**/api/plan/taslagim/degerlendirme', (r) => { s.degerlendirme.push(r.request().postDataJSON()); return json(r, { is: IS }); });
  await page.route(`**/api/plan/planlama-degerlendirmesi/${IS}`, (r) => json(r, {
    durum: 'bitti', cevap: { calismaSurumu: s.surum, dataVer: 4, baslangic: '2026-10-19', simdi: 7, maliyetGorunur: false, sonuc: { tur: 'plan-uygula', plan: { ...plan(gorunum().ops), ozet: { wT: 8, T: 8, late: 0 } } } },
  }));
  await page.route('**/api/plan/taslagim/diz', (r) => { ekle({ tur: 'diz', isler: ['*'] }, 'Plan yeniden dizildi'); return json(r, cevap()); });
  await page.route('**/api/plan/taslagim/uygula', (r) => {
    const n = s.satirlar.filter((x) => x.komut.tur !== 'diz').length;
    s.ortak = gorunum(); s.satirlar = []; s.surum += 1; s.uygulandi += 1;
    return json(r, { durum: 'uygulandi', calismaSurumu: s.surum, uygulanan: n, dusen: 0 });
  });
  const tur = (t: string) => s.komutlar.filter((k) => k.tur === t);
  return { s, gorunum, tasinan: () => tur('tasi'), alinan: () => tur('plana-al'), sifirla: () => { s.ortak = ILK_DURUM; s.satirlar = []; s.surum += 1; } };
}

test('Kokpit: tahta, sağ tıkla tut ve bırak, taslak, Geri ve Canlıya al, Matris, sorun turu; telefonda liste; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  const t = await taslakSunucusu(page);
  const { tasinan, alinan } = t;
  const onizleme: string[] = [];
  await page.route('**/api/plan/planlama-calismasi/is-tasi-onizlemesi?*', (r) => {
    const q = new URL(r.request().url()).searchParams;
    const id = q.get('isId') ?? '', S = Number(q.get('baslangic')), x = t.gorunum().ops[id];
    onizleme.push(id);
    return json(r, { calismaSurumu: t.s.surum, gecerli: true, ileti: null, isler: x ? [{ isId: id, tezgah: q.get('tezgah'), S, C: S + (x.C - x.S), eskiTezgah: x.m, eskiS: x.S, tur: 'tasinan' }] : [] });
  });
  // Plana alma: önizleme ilk adımı istenen yerde gösterir; komut taslakta emri plana koyar.
  await page.route('**/api/plan/planlama-calismasi/plana-al-onizlemesi?*', (r) => {
    const q = new URL(r.request().url()).searchParams, S = Number(q.get('baslangic'));
    return json(r, { calismaSurumu: Number(q.get('calismaSurumu')), gecerli: true, ileti: null, isler: [{ isId: 'S4.a1', tezgah: q.get('tezgah'), S, C: S + 4 }], bitis: S + 4 });
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
  await expect(kokpit.getByRole('button', { name: /^Canlıya al/ })).toBeDisabled();
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
  // Turda yazılan hamleyle taslak açılır; tur bitene kadar taslak çubuğundaki Canlıya al da kapalıdır.
  await tur.getByRole('button', { name: 'Uygula, sıradaki' }).click();
  const turCanli = kokpit.getByRole('region', { name: 'Taslak' }).getByRole('button', { name: 'Canlıya al' });
  await expect(turCanli).toBeDisabled();
  await expect(turCanli).toHaveAttribute('title', 'Tur bitince açılır');
  await tur.getByRole('button', { name: 'Vazgeç' }).click();
  await expect(tur).toBeHidden();
  await expect(kokpit.getByRole('region', { name: 'Taslak' })).toBeHidden();
  expect(t.s.komutlar.length).toBe(1);
  Object.assign(t.s, { komutlar: [], degerlendirme: [], taslakSurumu: 0 });

  if (bilgi.project.name === 'g360') {
    // Telefon: tahta yok, liste var. Tezgâh gözünde işler tezgâha göre toplanır; Sipariş gözünde emirler sıralanır.
    await expect(kokpit.locator('.tc-pyq-tahta')).toBeHidden();
    const grup = kokpit.getByRole('group', { name: 'Tezgâhlar ve işler' });
    await expect(grup.getByRole('heading', { name: /Plana alınacak/ })).toBeVisible();
    await expect(grup.getByRole('heading', { name: /T-01/ })).toBeVisible();
    await tasma();
    await kokpit.getByRole('group', { name: 'Görünüm' }).getByRole('button', { name: 'Sipariş' }).click();
    // Emre dokununca ayrıntı açılır, adımın tezgâh seçeneği önizlemeyle gelir ve Uygula taşır.
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
    await expect.poll(() => tasinan().length).toBe(1);
    expect(tasinan()[0]).toMatchObject({ isId: 'S1.a2', tezgah: 'M3' });
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
    await expect.poll(() => tasinan().length).toBe(1);
    expect(onizleme).toContain('S2.a1');
    expect(tasinan()[0]).toMatchObject({ isId: 'S2.a1', tezgah: 'M2' });
    expect(Number(tasinan()[0]?.['baslangic'])).toBeGreaterThan(32);
    // Taşıma taslağa yazılır, plan taslağın görünümünde yeniden dizilir. Geri taslağın değişiklik sayısını gösterir; geri alınınca taslak boşalır.
    await expect.poll(() => t.s.satirlar.map((x) => x.komut.tur)).toEqual(['tasi', 'diz']);
    expect(t.s.degerlendirme).toEqual([{ taslakSurumu: 1, istek: { tur: 'plan-uygula', isler: ['*'] } }]);
    const geri = kokpit.getByRole('group', { name: 'Geri' }).getByRole('button', { name: /Geri/ });
    const cubuk = kokpit.getByRole('region', { name: 'Taslak' });
    await expect(geri.locator('.tc-pyq-rozet')).toHaveText('1');
    await expect(cubuk.getByText('Taslak · 1 değişiklik')).toBeVisible();
    // Taslak varken canlıya alma taslak çubuğundaki tek düğmededir (3282-5 a).
    await expect(kokpit.locator('.tc-pyq-gonder')).toHaveCount(0);
    await expect(cubuk.getByRole('button', { name: 'Canlıya al' })).toBeVisible();
    await tasma();
    await geri.click();
    await expect(cubuk).toHaveCount(0);
    await expect(geri.locator('.tc-pyq-rozet')).toHaveCount(0);

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

    // Turda iki hamle uygulanır; her hamle taslakta ayrı değişikliktir, Geri sonuncuyu alır.
    await kokpit.getByRole('button', { name: 'Sorunları sırayla çöz' }).click();
    await tur.locator('[data-baska="M3"]').click();
    await tur.locator('[data-hamle="M3"]').getByRole('button', { name: 'Uygula, sıradaki' }).click();
    await expect.poll(() => tasinan().length).toBe(2);
    expect(tasinan()[1]).toMatchObject({ isId: 'S1.a2', tezgah: 'M3' });
    await expect(tur).toContainText('2 / 3');
    await tur.locator('[data-hamle]').first().getByRole('button', { name: 'Uygula' }).click();
    await expect.poll(() => tasinan().length).toBe(3);
    expect(tasinan()[2]).toMatchObject({ isId: 'S3.a1' });
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
    await expect(cubuk.getByText('Taslak · 2 değişiklik')).toBeVisible();
    await tasma();
    await geri.click();
    await expect(geri.locator('.tc-pyq-rozet')).toHaveText('1');
    await expect(cubuk.getByText('Taslak · 1 değişiklik')).toBeVisible();
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
  expect(await s3.locator('h3').allTextContents()).toEqual([expect.stringContaining('tezgâh seçenekleri'), 'Adımlar', 'Planlama yönü']);
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
    const n = tasinan().length, eski = t.gorunum().ops['S3.a1']?.S ?? 0;
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => tasinan().length).toBe(n + 1);
    expect(tasinan()[n]).toMatchObject({ isId: 'S3.a1', baslangic: eski - 0.5 });
    // Taşıma yazılırken yeni bırakma alınmaz (bildirimle geri çevrilir): sonraki adım yazma bitince başlar.
    await expect(kokpit.getByRole('region', { name: 'Taslak' }).getByRole('status')).toHaveCount(0);
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
    await expect.poll(() => alinan().length).toBe(1);
    expect(alinan()[0]).toMatchObject({ emirId: 'S4', tezgah: 'M2' });
  } else {
    await goz.getByRole('button', { name: 'Matris' }).click();
    await matris.locator('tr[data-emir="S4"] button').first().click();
    const s4 = kokpit.getByRole('complementary', { name: /S4 ayrıntısı/ });
    await expect(s4.locator('[data-hamle="M1"]')).toContainText(/termine yetişir/);
    await tasma();
    await s4.locator('[data-hamle="M1"]').getByRole('button', { name: 'Plana al' }).click();
    await expect.poll(() => alinan().length).toBe(1);
    expect(alinan()[0]).toMatchObject({ emirId: 'S4', tezgah: 'M1' });
    // Sonuç ayrıntıda yazar; sayfa Matris'te kalır.
    await expect(s4).toContainText('Emir taslakta plana alındı');
    await expect(goz.getByRole('button', { name: 'Matris' })).toHaveAttribute('aria-pressed', 'true');
  }
  await expect(suzgec.getByRole('button', { name: /Plansız/ })).toContainText('0');

  // Kalanını oynat (baştaki planla): kalan adımlarda öne çıkan hamle kendiliğinden uygulanır, plansız emir plana alınır; tur sonunda durur.
  t.sifirla();
  const tasinmis = tasinan().length;
  await page.reload();
  await kokpit.getByRole('button', { name: 'Sorunları sırayla çöz' }).click();
  await expect(tur).toContainText('1 / 3');
  await tur.getByRole('button', { name: 'Kalanını oynat' }).click();
  await expect(tur).toContainText('tur bitti');
  await expect(tur).toContainText('3 hamle uygulandı');
  expect(tasinan().length).toBe(tasinmis + 2);
  expect(alinan().length).toBe(2);
  await tur.getByRole('button', { name: 'Taslağa yaz' }).click();
  await expect(tur).toBeHidden();

  // Taslak çubuğundaki Canlıya al taslağı ortak çalışmaya yazar ve aynı adımda Onay ve canlı bölümünü açar (3282-5 a); canlıya alma oradadır.
  const cubuk = kokpit.getByRole('region', { name: 'Taslak' });
  await expect(cubuk.getByText('Taslak · 3 değişiklik')).toBeVisible();
  await tasma();
  await cubuk.getByRole('button', { name: 'Canlıya al' }).click();
  await expect(cubuk).toHaveCount(0);
  expect(t.s.uygulandi).toBe(1);
  await expect(page.getByText('Taslak plana yazıldı. Canlıya almak için Onay ve canlı bölümünü tamamlayın.')).toBeVisible();
  await expect(page.getByText(/Canlı plan yalnız burada onaylanınca değişir/)).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3282-1d3-onay-${bilgi.project.name}.png` });

  await tasma();
  expect(ag.hatalar).toEqual([]);
  expect(ag.yazmalar.every((y) => /plan\/taslagim\/|duzenleyen/.test(y))).toBe(true);
});

// Tezgâh çoksa yük şeridi emirleri ilk ekrandan itmesin: her genişlikte yalnız dolu tezgâhlar görünür, düğme hepsini açar.
test('Kokpit Matris: tezgâh çoksa yük şeridinde yalnız dolu tezgâhlar, düğmeyle hepsi', async ({ page, ac, ag }) => {
  const c = calisma({ ...ILK }, {});
  const yedek = Array.from({ length: 9 }, (_, i) => ({ id: `Y${String(i + 1)}`, kod: `Y-0${String(i + 1)}`, ad: `Deneme yedek ${String(i + 1)}` }));
  c.D.tezgahlar = [...c.D.tezgahlar, ...yedek];
  await page.route('**/api/plan/planlama-calismasi', (r) => json(r, { calisma: c, surum: 1 }));
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan/kokpit');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  await kokpit.getByRole('group', { name: 'Görünüm' }).getByRole('button', { name: 'Matris' }).click();
  const satir = kokpit.locator('tr[data-yuk-satiri]');
  await expect(satir).toHaveCount(12);
  // Uydurma veride hiçbir tezgâh günü %85'e varmaz: kapalıyken şeritte satır görünmez, emirler hemen başlıktan sonra gelir.
  await expect(satir.filter({ visible: true })).toHaveCount(0);
  await expect(kokpit.locator('tr[data-emir]').first()).toBeVisible();
  const dugme = kokpit.getByRole('button', { name: 'Dolu tezgâhlar' });
  await dugme.click();
  await expect(kokpit.getByRole('button', { name: 'Tüm tezgâhlar' })).toHaveAttribute('aria-pressed', 'true');
  await expect(satir.filter({ visible: true })).toHaveCount(12);
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  expect(ag.hatalar).toEqual([]);
});

// Kart 3229 a: plansız emir adım adım plana alınır. S4 burada iki adımlıdır; ikinci adımın rotasında F-01 ve F-02 vardır, T-01 yoktur.
// Kart 3282 (dilim 1a): Planlama Kokpit'le açılır; Gelenler plansız emri ve saha olayını gösterir, Yerleştir emrin ayrıntısında plana alma
// seçeneklerini açar. Canlıya al Onay ve canlı bölümünü Kokpit'te açar; Planı düzenle tahtaya döner. Sayfa hiçbir adımda yatay taşmaz.
test('Kokpit 3282: /plan Kokpit\'i açar; Gelenler ve Yerleştir; Canlıya al Onay ve canlı bölümünü açar; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  await page.route('**/api/plan/planlama-calismasi', (r) => json(r, { calisma: calisma({ ...ILK }, {}), surum: 1 }));
  await page.route('**/api/plan/surum', (r) => json(r, {
    planSurumu: 3, sonCanliyaAlma: { zaman: '2026-10-19T05:00:00Z', kisi: 'ORN-Mudur' },
    bayat: { bayat: true, sonCanliyaAlma: '2026-10-19T05:00:00Z', olaylar: [{ neden: 'durus', zaman: '2026-10-19T06:00:00Z', uretimEmriId: null, emirNo: null, makineId: 1, makineKod: 'F-01' }] },
  }));
  await page.route('**/api/plan/planlama-calismasi/plana-al-onizlemesi?*', (r) => {
    const q = new URL(r.request().url()).searchParams, S = Number(q.get('baslangic'));
    return json(r, { calismaSurumu: 1, gecerli: true, ileti: null, isler: [{ isId: 'S4.a1', tezgah: q.get('tezgah'), S, C: S + 4 }], bitis: S + 4 });
  });
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  const gelen = kokpit.getByRole('region', { name: 'Gelenler' });
  await expect(gelen.getByRole('listitem')).toHaveCount(2);
  await expect(gelen.getByRole('listitem').first()).toContainText('S4');
  await expect(gelen.getByRole('listitem').nth(1)).toContainText('Arıza / bakım');
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3282-kokpit-${bilgi.project.name}.png` });
  await gelen.getByRole('button', { name: 'Yerleştir' }).click();
  const s4 = kokpit.getByRole('complementary', { name: /S4 ayrıntısı/ });
  await expect(s4.getByRole('heading', { name: 'Plana al' })).toBeVisible();
  await expect(s4.locator('[data-hamle]').first()).toBeVisible();
  await s4.getByRole('button', { name: 'Ayrıntıyı kapat' }).click();
  await kokpit.getByRole('button', { name: /^Canlıya al/ }).click();
  await expect(page.getByText(/Canlı plan yalnız burada onaylanınca değişir/)).toBeVisible({ timeout: 10_000 });
  await expect(kokpit.locator('.tc-pyq-tahta')).toHaveCount(0);
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3282-onay-${bilgi.project.name}.png` });
  await page.getByRole('button', { name: 'Planı düzenle' }).click();
  await expect(kokpit.getByRole('region', { name: 'Gelenler' })).toBeVisible();
  expect(ag.hatalar).toEqual([]);
});

test('Kokpit: adım adım plana alma; seçilen tezgâh ve saat önizlemeye ve komuta gider, rota dışı tezgâh seçilemez; yatay taşma yok', async ({ page, ac, ag }) => {
  const c = calisma({ ...ILK }, {});
  c.D.urunler = [...c.D.urunler, { id: 'U3', ad: 'Deneme govde', rota: [{ k: 'a1', ad: 'Torna', tezgahlar: [{ id: 'M1', cevrim: 60 }, { id: 'M2', cevrim: 60 }] }, { k: 'a2', ad: 'Freze', bag: [['a1', 'FS']], tezgahlar: [{ id: 'M2', cevrim: 60 }, { id: 'M3', cevrim: 60 }] }] }];
  c.D.siparisler = c.D.siparisler.map((x) => (x.id === 'S4' ? { ...x, urun: 'U3' } : x));
  const t = await taslakSunucusu(page, (d) => ({ ...c, w: d.w, locks: d.locks, plan: plan(d.ops) }));
  const onizlenen: (string | null)[] = [];
  await page.route('**/api/plan/planlama-calismasi/plana-al-onizlemesi?*', (r) => {
    const q = new URL(r.request().url()).searchParams, S = Number(q.get('baslangic'));
    const sec = (JSON.parse(q.get('adimlar') ?? '[]') as { isId: string; tezgah?: string; baslangic?: number }[])[0];
    onizlenen.push(q.get('adimlar'));
    const S2 = Math.max(S + 4, sec?.baslangic ?? 0);
    return json(r, { calismaSurumu: t.s.surum, gecerli: true, ileti: null, isler: [{ isId: 'S4.a1', tezgah: q.get('tezgah'), S, C: S + 4 }, { isId: 'S4.a2', tezgah: sec?.tezgah ?? 'M2', S: S2, C: S2 + 4 }], bitis: S2 + 4 });
  });
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan/kokpit');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  await kokpit.getByRole('group', { name: 'Görünüm' }).getByRole('button', { name: 'Matris' }).click();
  await kokpit.locator('tr[data-emir="S4"] [data-emir-sec="S4"]').click();
  const s4 = kokpit.getByRole('complementary', { name: /S4 ayrıntısı/ });
  // Açılış bugünkü hızlı yoldur; "Adım adım" adım listesini açar.
  const yol = s4.getByRole('group', { name: 'Plana alma yolu' });
  await expect(yol.getByRole('button', { name: 'Hızlı (ilk adım)' })).toHaveAttribute('aria-pressed', 'true');
  await expect(s4.locator('[data-hamle]').first()).toBeVisible();
  await yol.getByRole('button', { name: 'Adım adım' }).click();
  const iki = s4.getByRole('group', { name: '2. adımın tezgâhı' });
  await expect(iki.getByRole('button')).toHaveText(['Sistem seçsin', 'F-01', 'F-02']);
  await expect(s4.getByRole('status')).toContainText(/Biter/);
  await iki.getByRole('button', { name: 'F-02' }).click();
  await expect(s4.locator('[data-adim="S4.a2"] [data-sonuc]')).toContainText(/F-02.*tezgâhı siz seçtiniz/);
  expect(onizlenen.at(-1)).toBe(JSON.stringify([{ isId: 'S4.a2', tezgah: 'M3' }]));
  await s4.getByLabel('2. adımın başlama saati').selectOption({ index: 3 });
  await expect.poll(() => onizlenen.at(-1) ?? '').toContain('"baslangic"');
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  const al = s4.getByRole('button', { name: 'Plana al', exact: true });
  await expect(al).toBeInViewport({ ratio: 1 });
  await al.click();
  await expect.poll(() => t.alinan().length).toBe(1);
  expect(t.alinan()[0]).toMatchObject({ tur: 'plana-al', emirId: 'S4', adimlar: [{ isId: 'S4.a2', tezgah: 'M3' }] });
  expect(ag.hatalar).toEqual([]);
});

// Kart 3208 a: 3B görünümü. Sahne başsız tarayıcının yazılım çizicisinde de çizilsin diye 'zorla' konur (uygulama bunu koymaz). Onaylı plan
// uydurmadır: S1'in ikinci adımı onaylı planda başka tezgâhta, S3 dört saat sonra; taslak bunları değiştirmiş sayılır.
test('Kokpit 3B: Matris düz açılır, 3B\'ye kalkar; hücre emirleri süzer; Yük ve gecikme, Önce / sonra; yatay taşma yok', async ({ page, ac, ag }) => {
  await page.addInitScript(() => { (globalThis as { tmiv2Sahne3B?: string }).tmiv2Sahne3B = 'zorla'; });
  // Onaylı planın kaynağı makine kimliğidir (sayı): tezgâhlar bu testte sayıyla adlanır.
  const no: Record<string, string> = { M1: '1', M2: '2', M3: '3' };
  const ops = Object.fromEntries(Object.entries(ILK).map(([k, x]) => [k, { ...x, m: no[x.m] ?? x.m }]));
  const c = calisma(ops, {});
  // İstasyonlar: torna tek başına, iki freze bir arada (Yük ve gecikme, Önce / sonra istasyona göre toplar).
  c.D.tezgahlar = c.D.tezgahlar.map((t) => ({ ...t, id: no[t.id] ?? t.id, grup: t.id === 'M1' ? '10' : '11', grupAd: t.id === 'M1' ? 'Deneme torna' : 'Deneme freze' }));
  for (const u of c.D.urunler) for (const a of u.rota) for (const t of a.tezgahlar) t.id = no[t.id] ?? t.id;
  const bas = Date.parse('2026-10-19T00:00:00+03:00');
  const iso = (h: number) => new Date(bas + h * 3_600_000).toISOString();
  const onayli: Record<string, { m: number; S: number; C: number }> = { 'S1.a1': { m: 1, S: 8, C: 16 }, 'S1.a2': { m: 3, S: 57, C: 65 }, 'S2.a1': { m: 2, S: 32, C: 40 }, 'S3.a1': { m: 1, S: 36, C: 42 } };
  await page.route('**/api/plan/planlama-calismasi', (r) => json(r, { calisma: c, surum: 1 }));
  await page.route('**/api/plan/planlama-calismasi/taban-ve-canli', (r) => json(r, {
    planSurumu: 1,
    isler: Object.entries(onayli).map(([k, x], i) => ({
      k, anahtar: `ORN-${String(i + 1)}|10`, isEmriId: i + 1, uretimEmriId: i + 1, taban: null,
      canli: { kaynak: { tur: 'makine', id: x.m }, baslangic: iso(x.S), bitis: iso(x.C), parcalar: [] },
    })),
  }));
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan/kokpit');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  await kokpit.getByRole('group', { name: 'Görünüm' }).getByRole('button', { name: '3B' }).click();
  const sahne = kokpit.locator('.tc-pyq-3b-sahne');
  await expect(sahne).toHaveAttribute('data-cizici', 'tamam', { timeout: 20_000 });
  // Düz açılış: tezgâh ve gün adları sahnenin üstünde yazılı.
  await sahne.scrollIntoViewIfNeeded();
  const yazi = (m: RegExp) => sahne.locator('.tc-pyq-3b-et:not([hidden])').filter({ hasText: m }).first();
  const tez = yazi(/^T-01$/), gun = yazi(/^(Pzt )?19$/);
  await expect(tez).toBeVisible();
  await expect(gun).toBeVisible();
  // Hücre: gün sütunu ile tezgâh satırının kesişimi (üstten bakış).
  const t = await tez.boundingBox(), g = await gun.boundingBox();
  if (!t || !g) throw new Error('yazı yeri okunamadı');
  await page.mouse.click(g.x + g.width / 2, t.y + t.height / 2);
  const panel = kokpit.getByRole('complementary', { name: 'Açıklama' });
  await expect(panel.getByRole('heading')).toContainText('T-01 ·');
  await expect(panel.getByRole('list', { name: 'Hücrenin emirleri' }).getByRole('button')).toHaveCount(1);
  const satir = kokpit.getByRole('region', { name: 'Emirler' }).locator('tbody tr');
  await expect(satir).toHaveCount(1);
  await expect(satir.first()).toContainText('S1');
  await kokpit.getByRole('button', { name: 'Süzgeci kaldır' }).click();
  await expect(satir).toHaveCount(4);
  const kaldir = kokpit.getByRole('button', { name: "3B'ye kaldır" });
  await kaldir.click();
  await expect(kokpit.getByRole('button', { name: "2B'ye indir" })).toHaveAttribute('aria-pressed', 'true');
  await kokpit.getByRole('group', { name: 'Kamera' }).getByRole('button', { name: 'Yandan' }).click();
  await expect(kokpit.getByRole('group', { name: 'Kamera' }).getByRole('button', { name: 'Yandan' })).toHaveAttribute('aria-pressed', 'true');

  const bakis = kokpit.getByRole('group', { name: '3B bakış' });
  await bakis.getByRole('button', { name: 'Yük ve gecikme' }).click();
  await expect(kokpit.locator('.tc-pyq-3b-boyut')).toContainText('taslakta yeri değişen');
  await expect(panel).toContainText('darboğaz');
  await expect(yazi(/^%100$/)).toBeVisible();
  // İstasyon başlığı telefonda eğik bakışta yazılmaz (yer dar), yalnız üstten bakışta.
  if ((page.viewportSize()?.width ?? 0) >= 768) await expect(yazi(/^Deneme freze$/)).toBeVisible();
  // İstasyon başlığı tezgâh kodunu örtmez.
  await expect(tez).toBeVisible();
  await bakis.getByRole('button', { name: 'Önce / sonra' }).click();
  await expect(panel).toContainText('Geç emir');
  const kaydir = kokpit.getByRole('slider', { name: 'Önce ve sonra arası' });
  await expect(kaydir).toHaveValue('100');
  await kokpit.getByRole('button', { name: 'Önce ↔ Sonra' }).click();
  await expect(kaydir).toHaveValue('0');
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  expect(ag.hatalar).toEqual([]);
  expect(ag.yazmalar).toEqual([]);
});

// Kalabalık atölyede boş tezgâhlar ızgarayı uzatıp çubukları okunmaz kılmasın: 8'den çok tezgâhta yalnız yükü olanlar çizilir, düğme hepsini açar.
test('Kokpit 3B: tezgâh çoksa yalnız yükü olan tezgâhlar çizilir, düğmeyle hepsi', async ({ page, ac, ag }) => {
  await page.addInitScript(() => { (globalThis as { tmiv2Sahne3B?: string }).tmiv2Sahne3B = 'zorla'; });
  const c = calisma({ ...ILK }, {});
  const yedek = Array.from({ length: 9 }, (_, i) => ({ id: `Y${String(i + 1)}`, kod: `Y-0${String(i + 1)}`, ad: `Deneme yedek ${String(i + 1)}` }));
  c.D.tezgahlar = [...c.D.tezgahlar, ...yedek];
  await page.route('**/api/plan/planlama-calismasi', (r) => json(r, { calisma: c, surum: 1 }));
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan/kokpit');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  await kokpit.getByRole('group', { name: 'Görünüm' }).getByRole('button', { name: '3B' }).click();
  const yazi = (ad: RegExp) => kokpit.locator('.tc-pyq-3b-etiketler span').filter({ hasText: ad });
  await expect(yazi(/^T-01$/)).toBeVisible({ timeout: 20_000 });
  const secim = kokpit.getByRole('group', { name: 'Tezgâhlar' });
  await expect(secim.getByRole('button', { name: 'Yükü olan (2)' })).toHaveAttribute('aria-pressed', 'true');
  await expect(yazi(/^Y-0\d$/)).toHaveCount(0);
  await secim.getByRole('button', { name: 'Tümü (12)' }).click();
  // Dar ekranda çakışan tezgâh kodu gizlenir; etiketin sahnede olması yeter.
  await expect(yazi(/^Y-01$/)).toHaveCount(1);
  if ((page.viewportSize()?.width ?? 0) >= 768) await expect(yazi(/^Y-01$/)).toBeVisible();
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  expect(ag.hatalar).toEqual([]);
  expect(ag.yazmalar).toEqual([]);
});

// 3282 1b: Ayarlar paneli seçili emrin yerinde (telefonda alttan) açılır; değişiklik önce etkisiyle gösterilir (değerlendirme ucu, plan-uygula),
// Uygula planı alır. Sunucu cevapları uydurmadır.
test('Kokpit 3282 1b: Ayarlar paneli açılır, dondurma değişir, etkisi önce ve sonra görünür, Uygula; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  const t = await taslakSunucusu(page);
  await page.route('**/api/plan/motor-ayarlari', (r) => json(r, {
    guncel: { surumId: null, degerler: { amac: 'sirali', eksikStok: 'varsay', kural: 'atcs', ogrenme: 'kapali', acilPay: 0.05, bolmeKip: 'otomatik', bolmeMaks: 3 }, yazan: null, zaman: null }, taslak: null,
  }));
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  await kokpit.getByTitle('Plan ayarları').click();
  const panel = kokpit.getByRole('complementary', { name: 'Plan ayarları' });
  await expect(panel).toBeVisible();
  await expect(panel.getByText('ATCS (öncelik, termin ve süre birlikte)')).toBeVisible();
  const dondurma = panel.getByLabel(/Dondurulmuş bölge/);
  await dondurma.fill('8');
  await dondurma.blur();
  await expect(panel.getByText('Dondurulmuş bölge: 4 sa → 8 sa')).toBeVisible();
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3282-ayarlar-${bilgi.project.name}.png` });
  await panel.getByRole('button', { name: 'Etkisini gör' }).click();
  const etki = panel.getByRole('region', { name: 'Ayarın etkisi' });
  await expect(etki.getByText('1 → 0')).toBeVisible({ timeout: 10_000 });
  // Ayar taslağa yazılır, etkisi taslağın görünümünde hesaplanır; ortak çalışma değişmez.
  expect(t.s.komutlar).toEqual([{ tur: 'ayar', ayar: { w: { dondurma: 8 }, param: {}, ac: [], kapat: [] }, ayrinti: expect.any(String) as unknown }]);
  expect(t.s.degerlendirme).toEqual([{ taslakSurumu: 1, istek: { tur: 'plan-uygula', isler: ['*'] } }]);
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  // Değişiklik bildirimi (Geri al) panelin altını örter; görüntü için kapatılır.
  for (const k of await page.getByRole('button', { name: 'Bildirimi kapat' }).all()) await k.click();
  await etki.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3282-ayar-etki-${bilgi.project.name}.png` });
  await etki.getByRole('button', { name: 'Uygula' }).click();
  await expect(panel).toHaveCount(0);
  // Uygula hesaplanan planı taslağa yazar; taslak çubuğu bir değişiklik gösterir.
  expect(t.s.satirlar.map((x) => x.komut.tur)).toEqual(['ayar', 'diz']);
  await expect(kokpit.getByRole('region', { name: 'Taslak' }).getByText('Taslak · 1 değişiklik')).toBeVisible();
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3282-taslak-${bilgi.project.name}.png` });
  expect(ag.hatalar).toEqual([]);
});

// Kart 3282 (dilim 1c): teslimden geriye planlama. Planın yönü üst şeritte ve Ayarlar panelinde, emrin yönü emrin ayrıntısında; ikisi de etkisiyle gelir.
test('Kokpit 3282 1c: plan yönü panelde, emrin yönü ayrıntıda; Geri etkisini gösterir, Uygula; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  const t = await taslakSunucusu(page);
  await page.route('**/api/plan/motor-ayarlari', (r) => json(r, {
    guncel: { surumId: null, degerler: { amac: 'sirali', eksikStok: 'varsay', kural: 'atcs', ogrenme: 'kapali', acilPay: 0.05, bolmeKip: 'otomatik', bolmeMaks: 3 }, yazan: null, zaman: null }, taslak: null,
  }));
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  // Üst şeritteki yön düğmesi paneli o yönle açar; değişiklik panelde etkisiyle uygulanır. Telefonda üst şeritte yön yoktur, panelde seçilir.
  const ustYon = kokpit.getByRole('group', { name: 'Planın yönü' });
  const panel = kokpit.getByRole('complementary', { name: 'Plan ayarları' });
  if (bilgi.project.name === 'g360') {
    await expect(ustYon).toBeHidden();
    await kokpit.getByTitle('Plan ayarları').click();
    await panel.getByLabel('Planlama yönü').selectOption('geri');
  } else {
    await expect(ustYon.getByRole('button', { name: 'İleriye planla' })).toHaveAttribute('aria-pressed', 'true');
    await ustYon.getByRole('button', { name: 'Teslimden geriye' }).click();
  }
  await expect(panel.getByLabel('Planlama yönü')).toHaveValue('geri');
  await expect(panel.getByLabel(/Geri planlama tamponu/)).toHaveValue('0');
  await expect(panel.getByText('Planlama yönü: İleri: hemen başla → Geri: teslimden geriye')).toBeVisible();
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3282-yon-panel-${bilgi.project.name}.png` });
  await panel.getByRole('button', { name: 'Sıfırla' }).click();
  await panel.getByRole('button', { name: 'Ayarları kapat' }).click();
  await kokpit.getByRole('region', { name: 'Gelenler' }).getByRole('button', { name: 'Yerleştir' }).click();
  const s4 = kokpit.getByRole('complementary', { name: /S4 ayrıntısı/ });
  const yon = s4.getByRole('group', { name: 'Planlama yönü' });
  await expect(yon.getByRole('button', { name: 'Planınki' })).toHaveAttribute('aria-pressed', 'true');
  await yon.getByRole('button', { name: 'Teslimden geriye' }).click();
  const etki = s4.getByRole('region', { name: 'Yönün etkisi' });
  await expect(etki.getByText('1 → 0')).toBeVisible({ timeout: 10_000 });
  expect(t.s.komutlar).toEqual([{ tur: 'yon', emirId: 'S4', yon: 'geri' }]);
  for (const k of await page.getByRole('button', { name: 'Bildirimi kapat' }).all()) await k.click();
  await etki.scrollIntoViewIfNeeded();
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3282-yon-emir-${bilgi.project.name}.png` });
  await etki.getByRole('button', { name: 'Uygula' }).click();
  await expect(etki).toHaveCount(0);
  await expect(yon.getByRole('button', { name: 'Teslimden geriye' })).toHaveAttribute('aria-pressed', 'true');
  // Etki hesabı bitince plana alma seçenekleri yeniden hesaplanır; "hesaplanıyor" kalmaz.
  await expect(s4.getByText('hesaplanıyor')).toHaveCount(0, { timeout: 10_000 });
  expect(ag.hatalar).toEqual([]);
});
