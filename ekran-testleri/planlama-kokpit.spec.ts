import type { Locator, Page, Route } from '@playwright/test';
import { expect, tasmaOlc, test } from './ortak.ts';

// Kart 3151: Kokpit (Planlama > Kokpit). Genişlik projeden gelir (360, 768, 1280). Çalışma okuması ve sunucu komutları ağ katmanında uydurma
// cevaplarla verilir (page.route); veritabanına yazılmaz. Akış: tahta açılır, iş sağ tıkla tutulup bırakılır (önizleme, sonra iş taşı),
// taslağa yazar ve Geri sayar, Matris yükü ve emirleri tek ekranda gösterir, plansız emir boş yere basılarak plana alınır. Telefonda tahta yerine liste
// vardır; taşıma ve plana alma operasyon bölümündeki yer listesindendir. Sayfa hiçbir adımda yatay taşmaz.
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
interface Durum { ops: Record<string, Is>; locks: Record<string, unknown>; w: Record<string, unknown>; down?: Record<string, unknown>[]; ekMesai?: Record<string, unknown>[] }
const IS = '00000000-0000-4000-8000-0000000000a1';
function oynat(d: Durum, l: readonly Komut[]): Durum {
  let { ops, locks, w } = d, down = d.down ?? [], ekMesai = d.ekMesai ?? [];
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
    } else if (k.tur === 'durus') {
      down = [...down, { m, from: k['bas'], to: k['bit'], neden: k['neden'] }];
    } else if (k.tur === 'durus-sil') {
      down = down.filter((x) => !(x['m'] === m && x['from'] === k['bas'] && x['to'] === k['bit']));
    } else if (k.tur === 'ek-mesai') {
      ekMesai = [...ekMesai, { m, gun: k['gun'], vardiya: k['vardiya'], ...(k['personel'] === null ? {} : { personel: k['personel'] }) }];
    } else if (k.tur === 'ek-mesai-sil') {
      ekMesai = ekMesai.filter((x) => !(x['m'] === m && x['gun'] === k['gun'] && x['vardiya'] === k['vardiya']));
    }
  }
  return { ops, locks, w, down, ekMesai };
}
const ILK_DURUM: Durum = { ops: ILK, locks: {}, w: { dondurma: 4 } };
const calismaKur = (d: Durum) => ({ ...calisma(d.ops, d.locks), w: d.w, down: d.down ?? [], ekMesai: d.ekMesai ?? [] });
// 3297: Önce / sonra, Duruş ve mesai ve Ayarlar üst şeritte tek "Araçlar" menüsündedir.
async function arac(kokpit: Locator, ad: string) {
  await kokpit.getByRole('button', { name: 'Araçlar' }).click();
  await kokpit.getByRole('menu', { name: 'Araçlar' }).locator('button', { hasText: ad }).click();
}
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
  return { s, gorunum, tasinan: () => tur('tasi'), alinan: () => tur('plana-al') };
}

test('Kokpit: tahta, sağ tıkla tut ve bırak, taslak, Geri ve Canlıya al, Matris; telefonda liste; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
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

  // Sadeleştirme (3304 a): sorun turu ve plan iyileştirme araması üst şeritte yoktur.
  await expect(kokpit.getByRole('button', { name: 'Sorunları sırayla çöz' })).toHaveCount(0);
  await kokpit.getByRole('button', { name: 'Araçlar' }).click();
  await expect(kokpit.getByRole('menu', { name: 'Araçlar' }).locator('button', { hasText: 'Plan iyileştirme ara' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  // Geç emrin "neden geç" satırı tahtası olmayan görünümde (Matris) emrin satırında yazar; Tezgâh görünümünde yazmaz (gecikme tahtada görünür).
  const kartlar = kokpit.getByRole('region', { name: 'Siparişler, sırasıyla' });
  const neden = kokpit.getByRole('region', { name: 'Emirler ve operasyonlar' }).locator('[data-emir="S1"] [data-emir-neden]');
  await kartlar.locator('[data-kart="S1"]').click();
  await expect(kokpit.getByRole('region', { name: 'Emirler ve operasyonlar' }).locator('[data-emir="S1"] [data-emir-ozet]')).toContainText('geç');
  await expect(neden).toHaveCount(0);
  await kokpit.getByRole('group', { name: 'Görünüm' }).getByRole('button', { name: 'Matris' }).click();
  await expect(neden).toContainText(/Neden geç: \d\. adım \(.+\) .+ tezgâhında .+ sıra bekliyor\./);
  await tasma();
  await kokpit.getByRole('group', { name: 'Görünüm' }).getByRole('button', { name: 'Tezgâh' }).click();
  await expect(neden).toHaveCount(0);
  await kartlar.locator('[data-kart="S4"]').click();

  if (bilgi.project.name === 'g360') {
    // Telefon: tahta yok, liste var. Tezgâh gözünde işler tezgâha göre toplanır; Sipariş gözünde emirler sıralanır.
    await expect(kokpit.locator('.tc-pyq-tahta')).toBeHidden();
    const grup = kokpit.getByRole('group', { name: 'Tezgâhlar ve işler' });
    await expect(grup.getByRole('heading', { name: /Plana alınacak/ })).toBeVisible();
    await expect(grup.getByRole('heading', { name: /T-01/ })).toBeVisible();
    await tasma();
    await kokpit.getByRole('group', { name: 'Görünüm' }).getByRole('button', { name: 'Sipariş' }).click();
    // Emre dokununca kartı seçilir; operasyona basınca taşınacak yerler listelenir ve Taşı taşır. Ayrıntı paneli açılmaz (3304 a).
    const liste = kokpit.getByRole('list', { name: 'Emirler' });
    await expect(liste.getByRole('button')).toHaveCount(4);
    await liste.getByRole('button', { name: /S1/ }).click();
    await expect(kokpit.getByRole('complementary')).toHaveCount(0);
    const bolum = kokpit.getByRole('region', { name: 'Emirler ve operasyonlar' });
    await bolum.locator('[data-adim="S1.a2"]').click();
    const yerler = bolum.getByRole('group', { name: 'Freze için taşınacak yerler' });
    await expect(yerler.getByRole('listitem').filter({ hasText: 'F-02' })).toContainText(/termine yetişir/);
    await tasma();
    await yerler.locator('[data-tasi-tezgah="M3"]').click();
    await expect.poll(() => tasinan().length).toBe(1);
    expect(tasinan()[0]).toMatchObject({ isId: 'S1.a2', tezgah: 'M3' });
    await expect(suzgec.getByRole('button', { name: /Geç/ })).toContainText('0');
    await tasma();
  } else {
    // Tahta: iş sağ tıkla tutulur, başka saate bırakılır; önce önizleme sorulur, sonra iş taşı gider.
    // Tahta: iş sağ tıkla tutulur, başka saate bırakılır; önce önizleme sorulur, sonra iş taşı gider.
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
  }

  // Matris: yük ve emirler tek ekranda. Tıklama sayfa değiştirmez ve panel açmaz: emir ve adım seçilir; yük hücresi emirleri süzer.
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
  await expect(kokpit.getByRole('complementary')).toHaveCount(0);
  await expect(akis.locator('tbody tr[data-emir="S3"]')).toHaveAttribute('data-sec', '');
  await expect(akis.locator('tbody tr[data-emir="S3"]')).toBeInViewport();
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

  // Plana alma. Geniş ekranda tepsideki emir sağ tıkla tutulur ve ilk adımının aday tezgâhına bırakılır; ötekilerde emrin kartı seçilir ve
  // operasyonun boş yer listesinden yerleştirilir. İkisi de aynı komuta gider; Plansız sayısı düşer.
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
    await kokpit.getByRole('region', { name: 'Siparişler, sırasıyla' }).locator('[data-kart="S4"]').click();
    const yerler = kokpit.getByRole('region', { name: 'Emirler ve operasyonlar' }).getByRole('group', { name: 'Torna için boş yerler' });
    await tasma();
    await yerler.getByRole('listitem').filter({ hasText: 'T-01' }).getByRole('button', { name: 'Yerleştir' }).click();
    await expect.poll(() => alinan().length).toBe(1);
    expect(alinan()[0]).toMatchObject({ emirId: 'S4', tezgah: 'M1' });
    // Sonuç bildirimle yazar; sayfa yerinde kalır.
    await expect(page.getByText('Emir taslakta plana alındı; Geri ile alınır.')).toBeVisible();
  }
  await expect(suzgec.getByRole('button', { name: /Plansız/ })).toContainText('0');

  // Taslak çubuğundaki Canlıya al taslağı ortak çalışmaya yazar ve aynı adımda Onay ve canlı bölümünü açar (3282-5 a); canlıya alma oradadır.
  const cubuk = kokpit.getByRole('region', { name: 'Taslak' });
  await expect(cubuk.getByText('Taslak · 2 değişiklik')).toBeVisible();
  await tasma();
  await cubuk.getByRole('button', { name: 'Canlıya al' }).click();
  await expect(cubuk).toHaveCount(0);
  expect(t.s.uygulandi).toBe(1);
  await expect(page.getByText('Taslak plana yazıldı. Canlıya almak için Onay ve canlı bölümünü tamamlayın.')).toBeVisible();
  await expect(page.getByText(/Canlı plan yalnız burada onaylanınca değişir/)).toBeVisible({ timeout: 10_000 });
  // Bildirim kaybolsa da bölüm, kişi oradayken taslağın ortak plana yazıldığını ve canlının değişmediğini söyler (Risk 3282 1d-3 N1).
  await expect(kokpit.locator('[data-sek="onay"]').getByRole('status').filter({ hasText: 'Taslak ortak plana yazıldı; canlı plan değişmedi.' })).toBeVisible();
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3282-1d4-onay-${bilgi.project.name}.png` });

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

// Kart 3282 (dilim 1a): Planlama Kokpit'le açılır; Gelenler plansız emri ve saha olayını gösterir, Yerleştir emrin kartını seçer ve boş yerleri
// açar. Canlıya al Onay ve canlı bölümünü Kokpit'te açar; Planı düzenle tahtaya döner. Sayfa hiçbir adımda yatay taşmaz.
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
  // 3297: Gelenler kutusu yer tutmaz; sıra kartlarının başlığındaki "Tümü" bütün gelenleri sayar ve tahtanın üstüne açar. Emre bağlanamayan
  // olay (tezgâh arızası) en üstte ayrı bölümdedir; plansız emirde Yerleştir kartı seçer.
  const serit = kokpit.getByRole('region', { name: 'Siparişler, sırasıyla' });
  await serit.getByRole('button', { name: /Tümü \(2\)/ }).click();
  const gelen = kokpit.getByRole('complementary', { name: 'Gelenler' });
  await expect(gelen.getByRole('listitem')).toHaveCount(2);
  await expect(gelen.getByRole('region', { name: 'Emre bağlı olmayan olaylar' }).getByRole('listitem')).toContainText('Arıza / bakım');
  await expect(gelen.getByRole('region', { name: 'Emirler' }).getByRole('listitem')).toContainText('S4');
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3282-kokpit-${bilgi.project.name}.png` });
  await gelen.getByRole('button', { name: 'Yerleştir' }).click();
  await expect(gelen).toHaveCount(0);
  await expect(serit.locator('[data-kart="S4"]')).toHaveAttribute('aria-pressed', 'true');
  const s4 = kokpit.getByRole('region', { name: 'Emirler ve operasyonlar' });
  await expect(s4.locator('[data-adim="S4.a1"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(s4.getByRole('group', { name: 'Torna için boş yerler' }).getByRole('listitem').first()).toBeVisible();
  await kokpit.getByRole('button', { name: /^Canlıya al/ }).click();
  await expect(page.getByText(/Canlı plan yalnız burada onaylanınca değişir/)).toBeVisible({ timeout: 10_000 });
  await expect(kokpit.locator('.tc-pyq-tahta')).toHaveCount(0);
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3282-onay-${bilgi.project.name}.png` });
  await page.getByRole('button', { name: 'Planı düzenle' }).click();
  await expect(kokpit.getByRole('region', { name: 'Siparişler, sırasıyla' })).toBeVisible();
  expect(ag.hatalar).toEqual([]);
});

// Kart 3297 a (A2): gövde yukarıdan aşağı akar: 1 emir kartları sırasıyla, 2 seçilen kartın operasyonları, 3 tam genişlik tahta. Plansız emirde
// adım seçilidir; tahtada o adımı yapabilen tezgâhlar öne çıkar ve boş yerler basılabilir çerçevedir (telefonda liste). Seçimler ekranda
// birikir; son tezgâh adımı seçilince emir tek değişiklik olarak taslağa yazılır. S4 burada iki adımlıdır (Torna: T-01, F-01; Freze: F-01, F-02).
test('Kokpit 3297: yukarıdan aşağı düzen; kart, adım ve boş yere basarak yerleştirme; tahta tam genişlik; telefonda boş yer listesi; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  const c = calisma({ ...ILK }, {});
  c.D.urunler = [...c.D.urunler, { id: 'U3', ad: 'Deneme govde', rota: [{ k: 'a1', ad: 'Torna', tezgahlar: [{ id: 'M1', cevrim: 60 }, { id: 'M2', cevrim: 60 }] }, { k: 'a2', ad: 'Freze', bag: [['a1', 'FS']], tezgahlar: [{ id: 'M2', cevrim: 60 }, { id: 'M3', cevrim: 60 }] }] }];
  c.D.siparisler = c.D.siparisler.map((x) => (x.id === 'S4' ? { ...x, urun: 'U3' } : x));
  const t = await taslakSunucusu(page, (d) => ({ ...c, w: d.w, locks: d.locks, plan: plan(d.ops) }));
  // Önizleme: ilk adım istenen tezgâhta (T-01'de 20, F-01'de 24 saatinde boş), ikinci adım seçilen tezgâhta ilk adımdan sonra.
  await page.route('**/api/plan/planlama-calismasi/plana-al-onizlemesi?*', (r) => {
    const q = new URL(r.request().url()).searchParams, tezgah = q.get('tezgah') ?? '';
    const sec = (JSON.parse(q.get('adimlar') ?? '[]') as { isId: string; tezgah?: string }[])[0];
    const S = tezgah === 'M1' ? 20 : 24, iki = sec?.tezgah ?? 'M2', S2 = S + 4 + (iki === 'M3' ? 2 : 6);
    return json(r, { calismaSurumu: t.s.surum, gecerli: true, ileti: null, isler: [{ isId: 'S4.a1', tezgah, S, C: S + 4 }, { isId: 'S4.a2', tezgah: iki, S: S2, C: S2 + 4 }], bitis: S2 + 4 });
  });
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan/kokpit');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  const tasma = async () => { expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0); };
  const telefon = bilgi.project.name === 'g360';

  // Üç bölüm bu sırayla alt alta; yan sütun yok. Yerleşmesi eksik ilk kart (S4) seçili açılır.
  await expect(kokpit.locator('.tc-pyq-ana > section')).toHaveCount(3);
  const ust = await kokpit.locator('.tc-pyq-ana > section').evaluateAll((l) => l.map((x) => [x.getAttribute('aria-label'), Math.round(x.getBoundingClientRect().top)] as const));
  expect(ust.map((x) => x[0])).toEqual(['Siparişler, sırasıyla', 'Emirler ve operasyonlar', 'Tezgâhlar']);
  expect(ust[0]![1] < ust[1]![1] && ust[1]![1] < ust[2]![1]).toBe(true);
  const serit = kokpit.getByRole('region', { name: 'Siparişler, sırasıyla' });
  await expect(serit.locator('[data-kart="S4"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(serit.locator('[data-kart="S4"]')).toContainText('0 / 2 operasyon yerleşti');
  const bolum = kokpit.getByRole('region', { name: 'Emirler ve operasyonlar' });
  const torna = bolum.locator('[data-adim="S4.a1"]'), freze = bolum.locator('[data-adim="S4.a2"]');
  await expect(torna).toHaveAttribute('aria-pressed', 'true');
  await expect(torna).toContainText('yerleşmedi');
  const yerler = bolum.getByRole('group', { name: 'Torna için boş yerler' });
  await expect(yerler.getByRole('listitem')).toHaveCount(2);
  await expect(yerler.getByRole('listitem').first()).toContainText(/T-01.*En erken biten yer/s);
  await tasma();
  if (!telefon) {
    // Tahta gövdenin tam genişliğindedir; yalnız Torna'yı yapabilen satırlar öne çıkar, boş yerler tahtada çerçevedir.
    const tahta = kokpit.locator('.tc-pyq-tahta');
    const tk = await tahta.boundingBox(), gk = await kokpit.locator('.tc-pyq-govde').boundingBox();
    expect(tk && gk && tk.width >= gk.width - 40).toBe(true);
    await expect(tahta.locator('[data-satir="M1"]')).toHaveAttribute('data-aday', 'evet');
    await expect(tahta.locator('[data-satir="M3"]')).toHaveAttribute('data-aday', 'hayir');
    await expect(tahta.locator('[data-bos-yer]')).toHaveCount(2);
    await expect(tahta.locator('[data-bos-yer="M1"]')).toHaveAttribute('data-ilk', '');
    await page.screenshot({ path: `/tmp/tmiv2-ekran/3297-duzen-${bilgi.project.name}.png`, fullPage: true });
    await tahta.locator('[data-bos-yer="M1"]').click();
  } else {
    await expect(kokpit.locator('.tc-pyq-tahta')).toBeHidden();
    await page.screenshot({ path: `/tmp/tmiv2-ekran/3297-duzen-${bilgi.project.name}.png`, fullPage: true });
    await yerler.getByRole('button', { name: 'Yerleştir' }).first().click();
  }
  // İlk seçim ekranda birikir, taslağa yazılmaz; sıradaki adım kendiliğinden seçilir.
  await expect(torna).toContainText('T-01 seçildi');
  await expect(freze).toHaveAttribute('aria-pressed', 'true');
  expect(t.alinan()).toEqual([]);
  const yerler2 = bolum.getByRole('group', { name: 'Freze için boş yerler' });
  await expect(yerler2.getByRole('listitem')).toHaveCount(2);
  await expect(yerler2.getByRole('listitem').first()).toContainText(/F-02.*En erken biten yer/s);
  await tasma();
  if (!telefon) await kokpit.locator('.tc-pyq-tahta [data-bos-yer="M3"]').click();
  else await yerler2.getByRole('button', { name: 'Yerleştir' }).first().click();
  // Son adımla emir tek değişiklik olarak taslağa yazılır: ilk adım T-01'de, ikinci adım F-02'de.
  await expect.poll(() => t.alinan().length).toBe(1);
  expect(t.alinan()[0]).toMatchObject({ tur: 'plana-al', emirId: 'S4', tezgah: 'M1', adimlar: [{ isId: 'S4.a2', tezgah: 'M3' }] });
  await tasma();
  expect(ag.hatalar).toEqual([]);
});

// Kart 3297-4: planlı operasyon seç-yerleştir ile taşınır. Operasyona basılınca taşınabileceği yerler listelenir ve tahtada çerçevelenir;
// yere basınca taşıma taslağa tek değişiklik olarak yazılır. Önizleme uydurmadır: istenen yer geçerlidir.
test('Kokpit 3297-4: planlı operasyona basıp boş yere basarak taşıma; uygun tezgâhlar öne çıkar; telefonda yer listesi; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  const t = await taslakSunucusu(page);
  await page.route('**/api/plan/planlama-calismasi/is-tasi-onizlemesi?*', (r) => {
    const q = new URL(r.request().url()).searchParams;
    const id = q.get('isId') ?? '', S = Number(q.get('baslangic')), x = t.gorunum().ops[id];
    return json(r, { calismaSurumu: t.s.surum, gecerli: true, ileti: null, isler: x ? [{ isId: id, tezgah: q.get('tezgah'), S, C: S + (x.C - x.S), eskiTezgah: x.m, eskiS: x.S, tur: 'tasinan' }] : [] });
  });
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan/kokpit');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  const tasma = async () => { expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0); };
  const telefon = bilgi.project.name === 'g360';

  await kokpit.getByRole('region', { name: 'Siparişler, sırasıyla' }).locator('[data-kart="S1"]').click();
  const bolum = kokpit.getByRole('region', { name: 'Emirler ve operasyonlar' });
  const freze = bolum.locator('[data-adim="S1.a2"]');
  await expect(freze).toContainText('F-01');
  await freze.click();
  await expect(freze).toHaveAttribute('aria-pressed', 'true');
  // Freze F-01'de 57'de; Torna 16'da biter: iki aday tezgâhta da 16'da boş yer var.
  const yerler = bolum.getByRole('group', { name: 'Freze için taşınacak yerler' });
  await expect(yerler.getByRole('listitem')).toHaveCount(2);
  // Emre etkisi listede yazar (yeni bitiş, kazanç, termin).
  await expect(yerler.getByRole('listitem').first()).toContainText(/F-01.*Aynı tezgâh · en erken biten yer · emir .* biter · .* erken · termine yetişir/s);
  await expect(yerler.getByRole('listitem').nth(1)).toContainText(/F-02.*Başka tezgâh/s);
  await tasma();
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3297-4-tasima-${bilgi.project.name}.png`, fullPage: true });
  if (!telefon) {
    const tahta = kokpit.locator('.tc-pyq-tahta');
    await expect(tahta.locator('[data-satir="M2"]')).toHaveAttribute('data-aday', 'evet');
    await expect(tahta.locator('[data-satir="M3"]')).toHaveAttribute('data-aday', 'evet');
    await expect(tahta.locator('[data-satir="M1"]')).toHaveAttribute('data-aday', 'hayir');
    await expect(tahta.locator('[data-bos-yer]')).toHaveCount(2);
    await expect(tahta.locator('[data-bos-yer="M3"]')).toHaveText('Taşı · 16:00');
    await tahta.locator('[data-bos-yer="M3"]').click();
  } else {
    await expect(kokpit.locator('.tc-pyq-tahta')).toBeHidden();
    const tasi = yerler.locator('[data-tasi-tezgah="M3"]');
    expect((await tasi.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await tasi.click();
  }
  // Taşıma taslağa tek değişiklik olarak yazılır; operasyon yeni yerinde görünür, Geri al geri alır.
  await expect.poll(() => t.tasinan().length).toBe(1);
  expect(t.tasinan()[0]).toMatchObject({ tur: 'tasi', isId: 'S1.a2', tezgah: 'M3', baslangic: 16 });
  await expect(freze).toContainText('F-02');
  // Liste taşımadan sonra yeni yerle kalır; seçili operasyona yeniden basmak seçimi bırakır ve liste kalkar. Ayrıntı paneli yoktur (3304 a).
  await expect(kokpit.getByRole('complementary')).toHaveCount(0);
  await expect(yerler).toBeVisible();
  await freze.click();
  await expect(yerler).toBeHidden();
  await tasma();
  expect(ag.hatalar).toEqual([]);
});

// Kart 3297-5 a: üstteki kartlar müşteri siparişidir. Bağ plan kaynağından gelir; burada kaynağın gerçek cevabına uydurma bağ eklenir:
// S1 ve S3 aynı siparişte, S4 başka siparişte, S2 siparişe bağlı değil.
test('Kokpit 3297-5: kartlar müşteri siparişine göre toplanır; siparişin emirleri alt alta; siparişsiz emir kendi kartında; arama siparişle bulur; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  await taslakSunucusu(page);
  await page.route('**/api/plan/planlama-kaynagi', async (r) => {
    const cevap = await r.fetch();
    const a = { siparis: '901', no: 'ORN-SP-101', musteri: 'Deneme Müşteri A' }, b = { siparis: '902', no: 'ORN-SP-102', musteri: 'Deneme Müşteri B' };
    await r.fulfill({ response: cevap, json: { ...(await cevap.json()) as object, siparisBaglari: { S1: { ...a, kalem: 1 }, S3: { ...a, kalem: 2 }, S4: { ...b, kalem: 1 } } } });
  });
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan/kokpit');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  const tasma = async () => { expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0); };
  const serit = kokpit.getByRole('region', { name: 'Siparişler, sırasıyla' });
  // Üç kart, termin sırasıyla: iki emirli sipariş, tek emirli sipariş, siparişsiz emir. Yerleşmesi eksik ilk kart (S4'ün siparişi) seçili açılır.
  await expect(serit.locator('[data-kart]')).toHaveCount(3);
  expect(await serit.locator('[data-kart]').evaluateAll((l) => l.map((x) => x.getAttribute('data-kart')))).toEqual(['sp:901', 'sp:902', 'S2']);
  const a = serit.locator('[data-kart="sp:901"]');
  await expect(a).toContainText('ORN-SP-101');
  await expect(a).toContainText('Deneme Müşteri A · 2 emir · termin 20.10');
  await expect(a).toContainText('3 / 3 operasyon yerleşti');
  await expect(serit.locator('[data-kart="sp:902"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(serit.locator('[data-kart="S2"]')).toContainText(/Siparişsiz · .+ · termin 30\.10/);
  await tasma();
  // Kart seçilince siparişin bütün emirleri alt alta gelir; başlık sipariş no ve emir sayısıdır.
  await a.click();
  const bolum = kokpit.getByRole('region', { name: 'Emirler ve operasyonlar' });
  await expect(bolum.getByRole('heading', { level: 2 })).toContainText('ORN-SP-101 · 2 emir ve operasyonları');
  expect(await bolum.locator('[data-emir]').evaluateAll((l) => l.map((x) => x.getAttribute('data-emir')))).toEqual(['S3', 'S1']);
  await expect(bolum.locator('[data-adim="S1.a2"]')).toBeVisible();
  await expect(bolum.locator('[data-adim="S3.a1"]')).toBeVisible();
  await tasma();
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3297-5-siparis-${bilgi.project.name}.png`, fullPage: true });
  // Matristen emir seçilince emrin siparişinin kartı seçilir; siparişsiz emirde kendi kartı.
  await kokpit.getByRole('group', { name: 'Görünüm' }).getByRole('button', { name: 'Matris' }).click();
  await kokpit.locator('tr[data-emir="S2"] [data-emir-sec="S2"]').click();
  await expect(serit.locator('[data-kart="S2"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(bolum.getByRole('heading', { level: 2 })).toContainText('S2 · operasyonlar');
  await kokpit.locator('tr[data-emir="S3"] [data-emir-sec="S3"]').click();
  await expect(a).toHaveAttribute('aria-pressed', 'true');
  // Arama sipariş no ve müşteri adıyla da bulur: yalnız o siparişin emirleri kalır.
  const ara = kokpit.getByRole('searchbox', { name: 'Ara' });
  await ara.fill('orn-sp-101');
  await expect(kokpit.locator('tr[data-emir]')).toHaveCount(2);
  await ara.fill('müşteri b');
  await expect(kokpit.locator('tr[data-emir]')).toHaveCount(1);
  await expect(kokpit.locator('tr[data-emir="S4"]')).toBeVisible();
  await tasma();
  // Gelenler'de plansız emrin Yerleştir'i emrin siparişinin kartını seçer.
  await ara.fill('');
  await expect(a).toHaveAttribute('aria-pressed', 'true');
  await serit.getByRole('button', { name: /Tümü/ }).click();
  await kokpit.getByRole('complementary', { name: 'Gelenler' }).getByRole('button', { name: 'Yerleştir' }).click();
  await expect(serit.locator('[data-kart="sp:902"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(bolum.getByRole('heading', { level: 2 })).toContainText('ORN-SP-102 · 1 emir ve operasyonları');
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
  await arac(kokpit, 'Ayarlar');
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

// Kart 3304 a: planın yönü yalnız üst şeritteki Yön düğmesindedir (her genişlikte); emrin yönü emrin satırında tek satırdır.
test('Kokpit 3282 1c: plan yönü üst şeritte, emrin yönü emir satırında; etkisini gösterir, Uygula; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  const t = await taslakSunucusu(page);
  await page.route('**/api/plan/motor-ayarlari', (r) => json(r, {
    guncel: { surumId: null, degerler: { amac: 'sirali', eksikStok: 'varsay', kural: 'atcs', ogrenme: 'kapali', acilPay: 0.05, bolmeKip: 'otomatik', bolmeMaks: 3 }, yazan: null, zaman: null }, taslak: null,
  }));
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  // Düğme geçerli yönü yazar, menüde iki yön açıklamasıyla durur; öteki yön seçilince yalnız yönün etkisini taşıyan küçük panel açılır.
  const ustYon = kokpit.getByRole('button', { name: /^Yön:/ });
  const yonMenusu = kokpit.getByRole('menu', { name: 'Planın yönü' });
  const panel = kokpit.getByRole('complementary', { name: 'Planın yönü' });
  const yonEtkisi = panel.getByRole('region', { name: 'Ayarın etkisi' });
  const taslakCubugu = kokpit.getByRole('region', { name: 'Taslak' });
  await expect(ustYon).toContainText('Yön: İleriye');
  await ustYon.click();
  await expect(yonMenusu.getByRole('menuitemradio', { name: /İleriye planla/ })).toHaveAttribute('aria-checked', 'true');
  await expect(yonMenusu.getByRole('menuitemradio', { name: /Teslimden geriye/ })).toContainText('iş termine yetişecek en geç saatte başlar');
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  await yonMenusu.getByRole('menuitemradio', { name: /Teslimden geriye/ }).click();
  await expect(yonMenusu).toHaveCount(0);
  await expect(panel).toContainText('İleriye → Teslimden geriye');
  await expect(yonEtkisi.getByRole('button', { name: 'Uygula' })).toBeVisible();
  // Yön paneli öteki ayarları taşımaz; onlar Araçlar > Ayarlar'dadır ve orada yön yoktur.
  await expect(panel.getByRole('combobox')).toHaveCount(0);
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3282-yon-panel-${bilgi.project.name}.png` });
  expect(t.s.komutlar).toEqual([{ tur: 'ayar', ayar: { w: { yon: 'geri' }, param: {}, ac: [], kapat: [] }, ayrinti: 'Planlama yönü: İleri: hemen başla → Geri: teslimden geriye' }]);
  // Etki beklerken ekranda tek birincil Uygula'dır: taslak çubuğundaki Canlıya al kapalıdır. Vazgeç komutu geri alır ve paneli kapatır.
  await expect(taslakCubugu.getByRole('button', { name: 'Canlıya al' })).toBeDisabled();
  await yonEtkisi.getByRole('button', { name: 'Vazgeç' }).click();
  await expect(panel).toHaveCount(0);
  expect(t.s.satirlar).toEqual([]);
  t.s.komutlar.length = 0;
  // Geçerli yön seçilirse menü kapanır; panel açılmaz, plana dokunulmaz.
  await ustYon.click();
  await yonMenusu.getByRole('menuitemradio', { name: /İleriye planla/ }).click();
  await expect(yonMenusu).toHaveCount(0);
  await expect(panel).toHaveCount(0);
  expect(t.s.komutlar).toEqual([]);
  // Etki beklerken panel X ile kapatılırsa kilit kalkar: komut taslakta kalır, Canlıya al yeniden açılır (Test T1).
  await ustYon.click();
  await yonMenusu.getByRole('menuitemradio', { name: /Teslimden geriye/ }).click();
  await expect(yonEtkisi.getByRole('button', { name: 'Uygula' })).toBeVisible();
  const canli = taslakCubugu.getByRole('button', { name: 'Canlıya al' });
  await expect(canli).toBeDisabled();
  await panel.getByRole('button', { name: 'Yönü kapat' }).click();
  await expect(panel).toHaveCount(0);
  await expect(canli).toBeEnabled();
  await taslakCubugu.getByRole('button', { name: 'Geri al' }).click();
  await expect.poll(() => t.s.satirlar.length).toBe(0);
  t.s.komutlar.length = 0;
  await arac(kokpit, 'Ayarlar');
  const ayarlar = kokpit.getByRole('complementary', { name: 'Plan ayarları' });
  await expect(ayarlar.getByLabel(/Geri planlama tamponu/)).toBeVisible();
  await expect(ayarlar.getByLabel('Planlama yönü')).toHaveCount(0);
  await ayarlar.getByRole('button', { name: 'Ayarları kapat' }).click();

  // Emrin yönü emrin satırında tek satırdır; Değiştir seçenekleri açar, seçim etkisiyle uygulanır.
  await kokpit.locator('[data-kart="S4"]').click();
  const bolum = kokpit.getByRole('region', { name: 'Emirler ve operasyonlar' });
  await expect(bolum.getByText('Yön: planın yönüyle (İleriye)')).toBeVisible();
  await bolum.getByRole('button', { name: 'S4 yönünü değiştir' }).click();
  const yon = bolum.getByRole('group', { name: 'Bu emrin yönü' });
  await expect(yon.getByRole('button', { name: 'Planın yönüyle (İleriye)' })).toHaveAttribute('aria-pressed', 'true');
  await yon.getByRole('button', { name: 'Teslimden geriye' }).click();
  const etki = bolum.getByRole('region', { name: 'Yönün etkisi' });
  await expect(etki.getByText('1 → 0')).toBeVisible({ timeout: 10_000 });
  expect(t.s.komutlar).toEqual([{ tur: 'yon', emirId: 'S4', yon: 'geri' }]);
  for (const k of await page.getByRole('button', { name: 'Bildirimi kapat' }).all()) await k.click();
  await etki.scrollIntoViewIfNeeded();
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3282-yon-emir-${bilgi.project.name}.png` });
  await etki.getByRole('button', { name: 'Uygula' }).click();
  await expect(etki).toHaveCount(0);
  await expect(yon.getByRole('button', { name: 'Teslimden geriye' })).toHaveAttribute('aria-pressed', 'true');
  await expect(bolum.getByText('Bu emir: Teslimden geriye (plan: İleriye)')).toBeVisible();
  await expect(bolum.getByText('Plandan ayrı')).toBeVisible();
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  expect(ag.hatalar).toEqual([]);
});

test('Kokpit 3282 2a-1: üst şeritteki Duruş ve mesai; tahtada çubuk; arıza taslağa yazılır, etkisi görünür, Uygula; kendiliğinden gelen bakım silinmez; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  const t = await taslakSunucusu(page);
  t.s.ortak = { ...t.s.ortak, down: [{ m: 'M2', from: 30, to: 34, neden: 'bakım', oto: 1, bakim: 'ORN-b1' }] };
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  await arac(kokpit, 'Duruş ve mesai');
  const panel = kokpit.getByRole('complementary', { name: 'Duruş ve mesai' });
  await panel.getByLabel('Tezgâh').selectOption('M2');
  const oto = panel.getByRole('listitem').filter({ hasText: 'kendiliğinden geldi' });
  await expect(oto).toBeVisible();
  await expect(oto.getByRole('button')).toHaveCount(0);
  await panel.getByLabel('Başlangıç').fill('2026-10-20T08:00');
  await panel.getByLabel('Bitiş').fill('2026-10-20T16:00');
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3282-2a1-kapasite-${bilgi.project.name}.png` });
  await panel.getByRole('button', { name: 'Duruş ekle, etkisini gör' }).click();
  const etki = panel.getByRole('region', { name: 'Duruşun etkisi' });
  await expect(etki).toBeVisible({ timeout: 10_000 });
  expect(t.s.komutlar).toEqual([{ tur: 'durus', tezgah: 'M2', bas: 32, bit: 40, neden: 'arıza' }]);
  await etki.getByRole('button', { name: 'Uygula' }).click();
  await expect(etki).toHaveCount(0);
  const yeni = panel.getByRole('listitem').filter({ hasText: /^Arıza/ }).first();
  await expect(yeni).toBeVisible();
  await expect(yeni).toBeFocused();
  // Planlı duruşlar tahtada tezgâhın satırında kesik kenarlı çubuktur (arıza ve kendiliğinden gelen bakım).
  const serit = kokpit.locator('.tc-pyq-satir[data-satir="M2"]');
  await expect(serit.locator('.tc-pyq-durus[data-plan="arıza"]')).toHaveAttribute('title', 'Arıza · 20.10 Sal 08:00 → 20.10 Sal 16:00');
  await expect(serit.locator('.tc-pyq-durus[data-plan="bakım"]')).toHaveCount(1);
  // Telefonda tahta yerine liste durur; çubuk görüntüde tahtalı genişliklerde görünsün.
  if (bilgi.project.name !== 'g360') await serit.locator('.tc-pyq-durus[data-plan="arıza"]').scrollIntoViewIfNeeded();
  await expect(kokpit.getByRole('region', { name: 'Taslak' })).toBeVisible();
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3282-2a1-kapasite-sonra-${bilgi.project.name}.png` });
  expect(ag.hatalar).toEqual([]);
});

// 3282 2a-2: ek mesai operatörle. Kişiler uydurmadır; Deneme gündüz kendi vardiyası 1 (08:00–16:00), cumartesi de çalışır.
test('Kokpit 3282 2a-2: ek mesai operatörle taslağa yazılır, etkisi görünür, Uygula; kendi vardiyasıyla kesişen operatör listede yok; tezgâhta işaret; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  const t = await taslakSunucusu(page, (d) => {
    const x = calismaKur(d);
    return { ...x, D: { ...x.D, personel: [{ id: '7', ad: 'Deneme gündüz', vardiya: '1', gruplar: [], makineler: ['M2'] }, { id: '8', ad: 'Deneme gece', vardiya: '2', gruplar: [], makineler: ['M2'] }] } };
  });
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  await arac(kokpit, 'Duruş ve mesai');
  const panel = kokpit.getByRole('complementary', { name: 'Duruş ve mesai' });
  await panel.getByLabel('Tezgâh').selectOption('M2');
  const form = panel.getByRole('form', { name: 'Ek mesai ekle' });
  await form.getByLabel('Gün').fill('2026-10-24');
  await form.getByLabel('Vardiya').selectOption('1');
  await expect(form.getByLabel('Operatör').locator('option')).toHaveText(['Deneme gece']);
  await form.getByLabel('Vardiya').selectOption('2');
  await expect(form.getByLabel('Operatör').locator('option')).toHaveText(['Deneme gündüz', 'Deneme gece']);
  await form.getByLabel('Operatör').selectOption('7');
  await expect(form.getByText('Bu hafta ek mesai: 0 / 8 saat.')).toBeVisible();
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3282-2a2-mesai-${bilgi.project.name}.png` });
  await form.getByRole('button', { name: 'Ek mesai ekle, etkisini gör' }).click();
  const etki = panel.getByRole('region', { name: 'Ek mesainin etkisi' });
  await expect(etki).toBeVisible({ timeout: 10_000 });
  expect(t.s.komutlar).toEqual([{ tur: 'ek-mesai', tezgah: 'M2', gun: 5, vardiya: '2', personel: '7' }]);
  await etki.getByRole('button', { name: 'Uygula' }).click();
  await expect(etki).toHaveCount(0);
  const yeni = panel.getByRole('listitem').filter({ hasText: '24.10 Cmt 16:00–00:00 · Deneme gündüz' });
  await expect(yeni).toBeFocused();
  await expect(panel.getByRole('button', { name: 'F-01 24.10 Cmt 16:00–00:00 ek mesaisini sil' })).toBeVisible();
  // Tezgâhın satır başlığında işaret (telefonda listede).
  await expect(kokpit.locator('.tc-pyq-mesai-isaret:visible').first()).toHaveAttribute('title', 'Ek mesai: 24.10 Cmt 16:00–00:00');
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3282-2a2-mesai-sonra-${bilgi.project.name}.png` });
  expect(ag.hatalar).toEqual([]);
});
