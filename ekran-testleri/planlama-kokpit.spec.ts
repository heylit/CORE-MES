import type { Locator, Page, Route } from '@playwright/test';
import { expect, tasmaOlc, test } from './ortak.ts';

// Kart 3151: Kokpit (Planlama > Kokpit). Genişlik projeden gelir (360, 768, 1280). Çalışma okuması ve sunucu komutları ağ katmanında uydurma
// cevaplarla verilir (page.route); veritabanına yazılmaz. Akış: tahta açılır, iş basılıp sürüklenir ve bırakılır (önizleme, sonra iş taşı),
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
      // 3488 a: yerleşmeyen adım elle yerleştirilir (uydurma süre sekiz saat).
      else if (id.includes('.')) { ops = { ...ops, [id]: { job: id.slice(0, id.lastIndexOf('.')), m, S, C: S + 8 } }; locks = { ...locks, [id]: { m, S } }; }
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
    } else if (k.tur === 'adim-uzadi' || k.tur === 'adim-uzadi-sil') {
      const e = { ...(w['adimEk'] as Record<string, unknown> | undefined) }, id = String(k['isId']);
      // Uzama adımın bitişini kaydırır (bitis0: ilk bildirimdeki bitiş); silinince bitiş geri gelir.
      const x = ops[id], once = e[id] as { bitis0: number } | undefined, b0 = once?.bitis0 ?? x?.C ?? 0;
      if (k.tur === 'adim-uzadi') e[id] = { ekSaat: k['ekSaat'], bitis0: b0 }; else delete e[id];
      if (x) ops = { ...ops, [id]: { ...x, C: b0 + (k.tur === 'adim-uzadi' ? Number(k['ekSaat']) : 0) } };
      w = { ...w, adimEk: e };
    } else if (k.tur === 'adim-bekler' || k.tur === 'adim-bekler-sil') {
      const e = { ...(w['adimBekle'] as Record<string, unknown> | undefined) }, id = String(k['isId']);
      // Bekleme adımı bildirilen ana kaydırır (süresi aynı kalır); emrin sonraki adımı öncülü bitmeden başlamaz, o da kayar.
      const x = ops[id], kadar = Number(k['kadar']);
      if (k.tur === 'adim-bekler') {
        e[id] = { kadar, neden: k['neden'] };
        if (x && x.S < kadar) {
          const C = kadar + (x.C - x.S);
          ops = { ...ops, [id]: { ...x, S: kadar, C } };
          for (const [o, y] of Object.entries(ops)) if (o !== id && y.job === x.job && y.S >= x.S && y.S < C) ops = { ...ops, [o]: { ...y, S: C, C: C + (y.C - y.S) } };
        }
      } else delete e[id];
      w = { ...w, adimBekle: e };
    }
  }
  return { ops, locks, w, down, ekMesai };
}
const ILK_DURUM: Durum = { ops: ILK, locks: {}, w: { dondurma: 4 } };
const calismaKur = (d: Durum) => ({ ...calisma(d.ops, d.locks), w: d.w, down: d.down ?? [], ekMesai: d.ekMesai ?? [] });
// 3297: Önce / sonra, Duruş ve mesai ve Ayarlar üst şeritte tek "Araçlar" menüsündedir.
// 3414: görünüm ve ölçek seçenekleri "Görünüm" düğmesinin ardındadır. Var olan testler onları açık kullanır; kapalı geliş 3414 testinde ölçülür.
// Olay doğrudan düğmeye gider: açılış karşılaması üstte dursa da açılır.
const gorunumAc = (kokpit: Locator) => kokpit.locator('.tc-pyq-gorunum-dugme').dispatchEvent('click');
async function arac(kokpit: Locator, ad: string) {
  await kokpit.getByRole('button', { name: 'Araçlar' }).click();
  await kokpit.getByRole('menu', { name: 'Araçlar' }).locator('button', { hasText: ad }).click();
}
// Değerlendirmenin özeti: adıma uzama bildirildiyse gecikme o kadar artar (uzama planı iyileştirmez); öteki komutlarda sabit iyileşme.
function degerlendirmeOzeti(d: Durum) {
  const ek = Object.values((d.w['adimEk'] as Record<string, { ekSaat: number }> | undefined) ?? {}).reduce((t, e) => t + Number(e.ekSaat), 0);
  // Bekleme emrin son adımını ittiyse gecikme o kadar artar.
  const itme = Object.keys((d.w['adimBekle'] as Record<string, unknown> | undefined) ?? {}).length > 0 ? Math.max(0, (d.ops['S1.a2']?.C ?? 0) - (ILK['S1.a2']?.C ?? 0)) : 0;
  return ek + itme > 0 ? { wT: 20 + ek + itme, T: 20 + ek + itme, late: 1 } : { wT: 8, T: 8, late: 0 };
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
    durum: 'bitti', cevap: { calismaSurumu: s.surum, dataVer: 4, baslangic: '2026-10-19', simdi: 7, maliyetGorunur: false, sonuc: { tur: 'plan-uygula', plan: { ...plan(gorunum().ops), ozet: degerlendirmeOzeti(gorunum()) } } },
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
  await ac('/plan/kokpit?duzen=klasik');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  await gorunumAc(kokpit);
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
    await expect(grup.getByRole('heading', { name: /Yerleştirilecek/ })).toBeVisible();
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
    // Tahta (3365): iş basılıp sürüklenir, başka saate bırakılır; sürüklerken ve bırakınca önizleme sorulur, sonra iş taşı gider.
    const tahta = kokpit.locator('.tc-pyq-tahta');
    await tahta.evaluate((el) => { el.scrollTo({ left: 0 }); });
    const is = tahta.locator('[data-is="S2.a1"]');
    await expect(is).toBeVisible();
    await is.evaluate((el) => { el.scrollIntoView({ block: 'center' }); });
    await is.click({ button: 'right' });
    // Sağ tık menüsünde tutma yoktur; Ayrıntı ve Planda böl (bölünemezse pasif, nedeni altında yazar).
    await expect(tahta.getByRole('menu').getByRole('menuitem')).toHaveText(['Ayrıntı', 'Planda böl']);
    if (bilgi.project.name === 'g1280') await page.screenshot({ path: '/tmp/tmiv2-ekran/3661-tahta-menu-g1280.png' });
    await page.keyboard.press('Escape');
    const kutu = await is.boundingBox();
    if (!kutu) throw new Error('iş görünmüyor');
    await page.mouse.move(kutu.x + 6, kutu.y + kutu.height / 2);
    await page.mouse.down();
    await page.mouse.move(kutu.x + kutu.width + 60, kutu.y + kutu.height / 2, { steps: 6 });
    await expect(tahta.getByText(/Bırakın: iş taşınır/)).toBeVisible();
    await expect(tahta.locator('.tc-pyq-hayalet')).toBeVisible();
    await page.mouse.up();
    // 3531 b: bırakılan taşıma onay bekler; Uygula yazar.
    // 3605: onay gövdede sabittir; ekranın altında, görünür alanın içinde durur.
    const onay = page.getByRole('group', { name: 'Taşımayı onayla' });
    await expect(onay).toBeVisible();
    const onayKutu = await onay.boundingBox();
    const gorunum = page.viewportSize();
    if (!onayKutu || !gorunum) throw new Error('onay görünmüyor');
    expect(onayKutu.y + onayKutu.height).toBeLessThanOrEqual(gorunum.height);
    expect(onayKutu.y + onayKutu.height).toBeGreaterThan(gorunum.height - 40);
    expect(onayKutu.x).toBeGreaterThanOrEqual(0);
    expect(onayKutu.x + onayKutu.width).toBeLessThanOrEqual(gorunum.width);
    if (process.env['RESIM_3605']) await page.screenshot({ path: `${process.env['RESIM_3605']}-${String(gorunum.width)}.png` });
    await onay.getByRole('button', { name: 'Uygula' }).click();
    await expect.poll(() => tasinan().length).toBe(1);
    expect(onizleme).toContain('S2.a1');
    expect(tasinan()[0]).toMatchObject({ isId: 'S2.a1', tezgah: 'M2' });
    expect(Number(tasinan()[0]?.['baslangic'])).toBeGreaterThan(32);
    // Taşıma taslağa yazılır, plan taslağın görünümünde yeniden dizilir. Geri taslağın değişiklik sayısını gösterir; geri alınınca taslak boşalır.
    await expect.poll(() => t.s.satirlar.map((x) => x.komut.tur)).toEqual(['tasi', 'diz']);
    expect(t.s.degerlendirme).toEqual([{ taslakSurumu: 1, istek: { tur: 'plan-uygula', isler: ['*'] } }]);
    const geri = kokpit.getByRole('group', { name: 'Geri ve İleri' }).getByRole('button', { name: /Geri/ });
    const cubuk = kokpit.getByRole('region', { name: 'Değişiklikleriniz' });
    await expect(geri.locator('.tc-pyq-rozet')).toHaveText('1');
    await expect(cubuk.getByText('1 değişiklik · canlıya alınmadı')).toBeVisible();
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

    // Ölçek (dilim 3c, G): Ay'da tezgâh satırı gün gün doluluk hücresidir, iş kutusu yok; Yıl'da haftalık yük hücreleri, hücre haftasına (Ay) iner.
    const olcek = kokpit.getByRole('group', { name: 'Ölçek' });
    await olcek.getByRole('button', { name: 'Ay' }).click();
    await expect(tahta.locator('[data-satir="M1"] .tc-pyq-gunhucre').first()).toBeVisible();
    await expect(tahta.locator('[data-satir="M1"] .tc-pyq-is')).toHaveCount(0);
    await tasma();
    await olcek.getByRole('button', { name: 'Yıl' }).click();
    await expect(tahta.locator('.tc-pyq-hucre').first()).toBeVisible();
    await tahta.locator('[data-satir="M1"] .tc-pyq-hucre:not(:disabled)').first().click();
    await expect(olcek.getByRole('button', { name: 'Ay', exact: true })).toHaveAttribute('aria-pressed', 'true');
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
    // Yazma bitince taslakta bekleyen taşıma kalmaz (3365: yazılırken gelen taşıma sıraya girer, geri çevrilmez).
    await expect(kokpit.getByRole('region', { name: 'Değişiklikleriniz' }).getByRole('status')).toHaveCount(0);
  }

  // Plana alma. Geniş ekranda tepsideki emir basılıp sürüklenir ve ilk adımının aday tezgâhına bırakılır; ötekilerde emrin kartı seçilir ve
  // operasyonun boş yer listesinden yerleştirilir. İkisi de aynı komuta gider; Plansız sayısı düşer.
  if (bilgi.project.name === 'g1280') {
    await page.keyboard.press('Escape');
    const tahta = kokpit.locator('.tc-pyq-tahta');
    await tahta.evaluate((el) => { el.scrollTo({ left: 0 }); });
    // Tepsideki emir de basılıp tezgâh satırına sürüklenir (3365). Fare olayı yalnız görünen alanda olur: önce satır görünür kılınır.
    await tahta.locator('[data-satir="M2"]').scrollIntoViewIfNeeded();
    await tahta.locator('[data-fis="S4"]').scrollIntoViewIfNeeded();
    const fis = await tahta.locator('[data-fis="S4"]').boundingBox();
    if (!fis) throw new Error('emir görünmüyor');
    await page.mouse.move(fis.x + fis.width / 2, fis.y + fis.height / 2);
    await page.mouse.down();
    const alan = await tahta.locator('[data-satir="M2"] .tc-pyq-alan').boundingBox();
    if (!alan) throw new Error('satır görünmüyor');
    await page.mouse.move(alan.x + 420, alan.y + alan.height / 2, { steps: 6 });
    await expect(tahta.getByText(/Bırakın: iş taşınır/)).toBeVisible();
    await expect(tahta.locator('[data-satir="M3"]')).toHaveAttribute('data-aday', 'hayir');
    await expect(tahta.locator('[data-satir="M2"] .tc-pyq-hayalet')).toContainText('planla');
    await page.mouse.up();
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
    await expect(page.getByText('Emir yerleştirildi; Geri al ile alınır.')).toBeVisible();
  }
  await expect(suzgec.getByRole('button', { name: /Plansız/ })).toContainText('0');

  // Taslak çubuğundaki Canlıya al taslağı ortak çalışmaya yazar ve aynı adımda onay sayfasını açar (3282-5 a); canlıya alma oradadır.
  const cubuk = kokpit.getByRole('region', { name: 'Değişiklikleriniz' });
  await expect(cubuk.getByText('2 değişiklik · canlıya alınmadı')).toBeVisible();
  await tasma();
  await cubuk.getByRole('button', { name: 'Canlıya al' }).click();
  await expect(cubuk).toHaveCount(0);
  expect(t.s.uygulandi).toBe(1);
  await expect(page.getByText('Değişiklikleriniz plana yazıldı. Canlıya almak için onay sayfasını tamamlayın.')).toBeVisible();
  await expect(page.getByText(/O zamana kadar atölye eski planı görür/)).toBeVisible({ timeout: 10_000 });
  // Bildirim kaybolsa da bölüm, kişi oradayken taslağın ortak plana yazıldığını ve canlının değişmediğini söyler (Risk 3282 1d-3 N1).
  await expect(kokpit.locator('[data-sek="onay"]').getByRole('status').filter({ hasText: 'Değişiklikleriniz ortak plana yazıldı; canlı plan değişmedi.' })).toBeVisible();
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
  await ac('/plan/kokpit?duzen=klasik');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  await gorunumAc(kokpit);
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

// Kart 3282 (dilim 1a), 3317 a: Planlama Kokpit'le açılır; saha olayı şeritteki listede görünür, plansız emrin kartını seçer ve boş yerleri
// açar. Canlıya al onay sayfasını Kokpit'in yerine açar; Kokpit'e dön tahtaya döner. Sayfa hiçbir adımda yatay taşmaz.
test('Kokpit 3282: /plan Kokpit\'i açar; saha olayı şeritteki listede; plansız emir kartı seçili gelir; Canlıya al onay sayfasını açar (üç sekme, geri düğmesi Kokpit\'e döner); yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
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
  await ac('/plan?duzen=klasik');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  await gorunumAc(kokpit);
  // 3317 a: Gelenler ve "Tümü" yoktur; saha olayı plan şeridindeki özet ve listede durur. Emre bağlanamayan olayda (tezgâh arızası) "Göster"
  // yoktur. Plansız emir kartın kendisidir: yerleşmesi eksik ilk kart seçili gelir.
  const serit = kokpit.getByRole('region', { name: 'Siparişler, sırasıyla' });
  await expect(serit.getByRole('button', { name: /Tümü/ })).toHaveCount(0);
  const ozet = page.locator('[data-degisiklik-ozeti]');
  await expect(ozet).toContainText('1 değişiklik');
  await ozet.getByRole('button', { name: 'Değişiklikleri aç' }).click();
  const liste = page.getByRole('region', { name: 'Planı etkileyen değişiklikler' });
  await expect(liste.getByRole('region', { name: 'Sahada oldu' }).getByRole('listitem')).toContainText('Duruş: F-01');
  await expect(liste.getByRole('button', { name: 'Emre git' })).toHaveCount(0);
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3282-kokpit-${bilgi.project.name}.png` });
  await ozet.getByRole('button', { name: 'Değişiklikleri kapat' }).click();
  await expect(liste).toHaveCount(0);
  await expect(serit.locator('[data-kart="S4"]')).toHaveAttribute('aria-pressed', 'true');
  const s4 = kokpit.getByRole('region', { name: 'Emirler ve operasyonlar' });
  await expect(s4.locator('[data-adim="S4.a1"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(s4.getByRole('group', { name: 'Torna için boş yerler' }).getByRole('listitem').first()).toBeVisible();
  await kokpit.getByRole('button', { name: /^Canlıya al/ }).click();
  await expect(page.getByText(/O zamana kadar atölye eski planı görür/)).toBeVisible({ timeout: 10_000 });
  await expect(kokpit.locator('.tc-pyq-tahta')).toHaveCount(0);
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `/tmp/tmiv2-ekran/kart-3335-planim-${bilgi.project.name}.png`, fullPage: true });
  // Onay sayfası (3335 a): Kokpit'in yerine açılır, adrestedir; üç adım, üç sekme; "Planım" tek sütun: dört sayı, kontrol, tek karar.
  await expect(page).toHaveURL(/[?&]sayfa=onay/);
  await expect(kokpit.locator('.tc-pyq-ust')).toHaveCount(0);
  await expect(kokpit.getByRole('tab')).toHaveText([/^Planım$/, /^Onay bekleyenler/, /^Geçmiş$/]);
  await expect(kokpit.getByRole('tab', { name: 'Planım' })).toHaveAttribute('aria-selected', 'true');
  await expect(kokpit.locator('.tc-pyq-onay-adimlar li[aria-current]')).toHaveText(['2 Kontrol et', '3 Canlıya al']);
  await expect(kokpit.locator('.tc-pym-pa-ozet dt')).toHaveText(['işin yeri değişti', 'yeni yerleşen iş', 'geciken sipariş', 'plansız kalan sipariş']);
  await expect(kokpit.getByRole('heading', { name: 'Kontrol' })).toBeVisible();
  // Karar: tek not alanı, solda Kokpit'e dön, sağda karar düğmeleri; hepsi görünür ve taşmaz.
  await kokpit.getByRole('button', { name: 'Kokpit\'e dön' }).scrollIntoViewIfNeeded();
  await expect(kokpit.getByRole('textbox', { name: 'Not (isteğe bağlı)' })).toBeVisible();
  await expect(kokpit.getByRole('button', { name: 'Canlıya al', exact: true })).toBeVisible();
  await page.screenshot({ path: `/tmp/tmiv2-ekran/kart-3335-karar-${bilgi.project.name}.png` });
  await expect(kokpit.getByRole('heading', { name: 'İncelenecek planlar' })).toHaveCount(0);
  await expect(kokpit.getByRole('heading', { name: 'Planlama sayfaları' })).toHaveCount(0);
  await kokpit.getByRole('tab', { name: 'Geçmiş' }).click();
  await expect(kokpit.getByRole('heading', { name: 'Geçmiş planlar' })).toBeVisible();
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `/tmp/tmiv2-ekran/kart-3335-gecmis-${bilgi.project.name}.png`, fullPage: true });
  await kokpit.getByRole('tab', { name: /^Onay bekleyenler/ }).click();
  await expect(kokpit.getByRole('heading', { name: 'Onay bekleyen ve kayıtlı planlar' })).toBeVisible();
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  // Tarayıcının geri düğmesi Kokpit'e, ileri düğmesi sayfaya döner.
  await page.goBack();
  await expect(kokpit.getByRole('region', { name: 'Siparişler, sırasıyla' })).toBeVisible();
  await page.goForward();
  await expect(kokpit.getByRole('tab', { name: 'Planım' })).toBeVisible();
  await kokpit.getByRole('tab', { name: 'Planım' }).click();
  await page.getByRole('button', { name: 'Kokpit\'e dön' }).click();
  await expect(page).not.toHaveURL(/sayfa=onay/);
  await expect(kokpit.getByRole('region', { name: 'Siparişler, sırasıyla' })).toBeVisible();
  expect(ag.hatalar).toEqual([]);
});

// Kart 3335 a: 4 saat kuralı canlıya almayı gerekçe isteyerek geri çevirince pencere açılmaz; neden kontrol listesine yazılır, not alanı zorunlu
// gerekçe olur ve boşken karar düğmeleri kapalıdır. Onayda bekleyen plan kendi sekmesindedir. Veriler uydurmadır.
test('Kokpit 3335: 4 saat kuralı reddedince karar alanı zorunlu gerekçe olur, yazılınca komut gerekçeyle gider; onay bekleyen plan kendi sekmesinde; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  const c = calisma({ ...ILK }, {});
  await page.route('**/api/plan/planlama-calismasi', (r) => json(r, { calisma: { ...c, plan: { ...c.plan, kim: 'ORN-Planlamaci', zaman: Date.parse('2026-10-19T06:30:00+03:00') } }, surum: 1 }));
  const bekleyen = {
    id: 7, ad: 'ORN-Onay plani', aciklama: null, durum: 'onayda', acan: 'ORN-Planlamaci', benim: false, acilma: '2026-10-19T03:00:00Z', surum: 1, tabanPlanSurumu: 3, canliDegisti: false,
    gostergeler: null, degisiklikler: [], etki: null, bekleyenler: [], onay: null, yapabilir: { onayaGonder: false, onaydanCek: false, geriGonder: true, canliyaAl: true },
  };
  await page.route('**/api/plan/senaryolar', (r) => json(r, { canli: null, canliSurum: 3, senaryolar: [bekleyen] }));
  await page.route('**/api/plan/planlama-calismasi/canli-farki', (r) => json(r, { planSurumu: 3, ayni: false, guncel: true, tasinan: 2, tezgah: 1, sira: 1, yeni: 1, eksik: 0, isler: [], yazilamaz: [] }));
  const govdeler: Record<string, unknown>[] = [];
  await page.route('**/api/plan/planlama-calismasi/canliya-al', (r) => {
    govdeler.push(r.request().postDataJSON() as Record<string, unknown>);
    return r.fulfill({ status: 409, json: { kod: 'CAKISMA', mesaj: 'S1 Torna 4 saatten kısa sürede başlayacak; gerekçe yazın.', ayrinti: { neden: 'dort-saat', gerekceIle: true } } });
  });
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan?sayfa=onay');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit.getByRole('tab', { name: 'Planım' })).toHaveAttribute('aria-selected', 'true', { timeout: 20_000 });
  await expect(kokpit.getByRole('tab', { name: 'Onay bekleyenler (1)' })).toBeVisible();
  await expect(kokpit.locator('[data-imza]')).toContainText('Taslak: ORN-Planlamaci');
  await expect(kokpit.locator('.tc-pym-pa-ozet dd').first()).toHaveText('2');
  await kokpit.getByRole('button', { name: 'Canlıya al', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /canlıya al/i }).click();
  const alan = kokpit.getByRole('textbox', { name: /^Gerekçe \(zorunlu: 4 saat kuralı/ });
  await expect(alan).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(kokpit.locator('.tc-pym-pa-kontrol li[data-d="uyari"]').filter({ hasText: '4 saatten kısa sürede başlayacak' })).toBeVisible();
  await expect(kokpit.getByText('Gerekçe yazınca açılır.')).toBeVisible();
  await expect(kokpit.getByRole('button', { name: 'Canlıya al', exact: true })).toBeDisabled();
  await expect(kokpit.getByRole('button', { name: 'Onaya gönder' })).toBeDisabled();
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  await kokpit.getByText('Gerekçe yazınca açılır.').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `/tmp/tmiv2-ekran/kart-3335-gerekce-${bilgi.project.name}.png` });
  await alan.fill('Deneme: acil sevkiyat');
  await expect(kokpit.getByText('Gerekçe yazınca açılır.')).toHaveCount(0);
  await kokpit.getByRole('button', { name: 'Canlıya al', exact: true }).click();
  await expect.poll(() => govdeler.length).toBe(2);
  expect(govdeler[1]).toMatchObject({ dortSaatGerekcesi: 'Deneme: acil sevkiyat' });
  // Onayda bekleyen plan kendi sekmesindedir; kişinin planı o listede yoktur.
  await kokpit.getByRole('tab', { name: 'Onay bekleyenler (1)' }).click();
  await expect(kokpit.getByRole('heading', { name: 'Onay bekleyen ve kayıtlı planlar' })).toBeVisible();
  await expect(kokpit.getByText('ORN-Onay plani').first()).toBeVisible();
  // 3335-1b: sekme sadedir; dört sayı ve karar görünür, karşılaştırma kutusu yoktur, ayrıntı kapalı gelir ve açılınca taşmaz.
  await expect(kokpit.locator('[data-sekme="bekleyen"] .tc-pym-pa-ozet dt')).toHaveCount(4);
  await expect(kokpit.getByRole('checkbox', { name: /karşılaştır/ })).toHaveCount(0);
  await expect(kokpit.getByRole('heading', { name: 'Karar', exact: true })).toBeVisible();
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `/tmp/tmiv2-ekran/kart-3335-bekleyen-${bilgi.project.name}.png`, fullPage: true });
  // Onaylayanın eylemi kartın altındadır: not alanı ve karar düğmeleri.
  await kokpit.getByRole('heading', { name: 'Karar', exact: true }).scrollIntoViewIfNeeded();
  await expect(kokpit.locator('[data-sekme="bekleyen"] .tc-pym-pa-karar .tc-pym-pa-dugmeler button').first()).toBeVisible();
  await kokpit.locator('details.tc-pym-pa-ayrinti > summary').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `/tmp/tmiv2-ekran/kart-3335-bekleyen-karar-${bilgi.project.name}.png` });
  await kokpit.locator('details.tc-pym-pa-ayrinti > summary').click();
  await expect(kokpit.getByRole('heading', { name: 'Tezgâh başına değişen iş' })).toBeVisible();
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  // Beklenen: 4 saat reddi (409) ve uydurma onay planının sunucuda olmayan ayrıntısı (404).
  expect(ag.hatalar.filter((h) => !/409|404 GET \/api\/plan(\/motor-ayarlari)?\?taslak=7$|404 \(Not Found\)/.test(h))).toEqual([]);
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
  await ac('/plan/kokpit?duzen=klasik');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  await gorunumAc(kokpit);
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
  await expect(bolum.locator('[data-adim-satir="S4.a1"]')).toContainText('Yerleşmedi');
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
  await expect(bolum.getByRole('combobox', { name: 'Torna tezgâhı' })).toHaveValue('M1');
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

// Kart 3318 a (1. dilim): operasyonlar tablodadır; yerleşecek tezgâh ve saat satırda girilir. Seçim ekranda birikir, sonucu sunucuya sorulup
// satırda öngörü olarak görünür; "İleriye yerleştir" emri tek değişiklik olarak taslağa yazar. Uymayan seçimin nedeni satırda yazar.
// Önizleme uydurmadır: ilk adım istenen tezgâh ve saatte, ikinci adım ondan 6 saat sonra; F-02'de (M3) ilk adım reddedilir.
test('Kokpit 3318: operasyon tablosu; satırda tezgâh ve saat girişi, öngörü, uymayan seçimin nedeni, "İleriye yerleştir"; Akış görünümü; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  const c = calisma({ ...ILK }, {});
  c.D.urunler = [...c.D.urunler, { id: 'U3', ad: 'Deneme govde', rota: [{ k: 'a1', ad: 'Torna', tezgahlar: [{ id: 'M1', cevrim: 60 }, { id: 'M2', cevrim: 60 }, { id: 'M3', cevrim: 60 }] }, { k: 'a2', ad: 'Freze', bag: [['a1', 'FS']], tezgahlar: [{ id: 'M2', cevrim: 60 }, { id: 'M3', cevrim: 60 }] }] }];
  c.D.siparisler = c.D.siparisler.map((x) => (x.id === 'S4' ? { ...x, urun: 'U3' } : x));
  const t = await taslakSunucusu(page, (d) => ({ ...c, w: d.w, locks: d.locks, plan: plan(d.ops) }));
  await page.route('**/api/plan/planlama-calismasi/plana-al-onizlemesi?*', (r) => {
    const q = new URL(r.request().url()).searchParams, tezgah = q.get('tezgah') ?? '', S = Number(q.get('baslangic'));
    const sec = (JSON.parse(q.get('adimlar') ?? '[]') as { isId: string; tezgah?: string }[])[0];
    if (tezgah === 'M3') return json(r, { calismaSurumu: t.s.surum, gecerli: false, ileti: 'Deneme: bu tezgâh o saatte dolu.', isler: [], bitis: null });
    const iki = sec?.tezgah ?? 'M2';
    return json(r, { calismaSurumu: t.s.surum, gecerli: true, ileti: null, isler: [{ isId: 'S4.a1', tezgah, S, C: S + 4 }, { isId: 'S4.a2', tezgah: iki, S: S + 10, C: S + 14 }], bitis: S + 14 });
  });
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan/kokpit?duzen=klasik');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  await gorunumAc(kokpit);
  const tasma = async () => { expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0); };
  const telefon = bilgi.project.name === 'g360';
  const bolum = kokpit.getByRole('region', { name: 'Emirler ve operasyonlar' });
  const satir = (id: string) => bolum.locator(`[data-adim-satir="${id}"]`);
  await expect(bolum.getByRole('group', { name: 'Operasyon görünümü' }).getByRole('button', { name: 'Tablo' })).toHaveAttribute('aria-pressed', 'true');
  await expect(satir('S4.a1')).toContainText('Yerleşmedi');
  // Sistemin öngörüsü yazılmadan satırda görünür.
  await expect(satir('S4.a1').locator('[data-ongoru]').first()).toContainText('öngörü');
  const tezgah = bolum.getByRole('combobox', { name: 'Torna tezgâhı' }), saat = bolum.getByLabel('Torna başlangıcı');
  await expect(tezgah).toHaveValue('');
  if (telefon) for (const a of [tezgah, saat]) expect((await a.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  // Telefonda tarih ve saat alanı tam satırdır (yarım sütunda saat kesiliyordu).
  if (telefon) expect((await saat.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(250);
  await tasma();

  // Uymayan seçim: neden satırda, yazma düğmesi kapalı.
  await tezgah.selectOption('M3');
  await expect(bolum.locator('[data-satir-notu="S4.a1"]').getByRole('alert')).toHaveText('Deneme: bu tezgâh o saatte dolu.');
  await expect(bolum.getByRole('button', { name: 'İleriye yerleştir' })).toBeDisabled();
  // Not satırı tablonun sütunlarını kaydırmaz: hata varken de operasyon sütunu yerinde, not bölümün genişliğine yayılır.
  if (!telefon && bilgi.project.name === 'g1280') {
    const not = await bolum.locator('[data-satir-notu="S4.a1"] td').boundingBox(), govde = await bolum.locator('table').first().boundingBox();
    expect(not && govde && not.width >= govde.width - 2).toBe(true);
  }
  await expect(tezgah).toHaveAttribute('aria-invalid', 'true');
  await tasma();
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3318-hata-${bilgi.project.name}.png`, fullPage: true });

  // Tezgâh ve saat satırda girilir; ikinci adımın tezgâhı da seçilir. Hiçbiri kendiliğinden taslağa yazılmaz.
  await tezgah.selectOption('M2');
  await saat.fill('2026-10-20T08:00');
  await bolum.getByRole('combobox', { name: 'Freze tezgâhı' }).selectOption('M3');
  await expect(bolum.locator('[data-satir-notu]')).toHaveCount(0);
  // Satırın bütün hücreleri bölümün içindedir (dar ekranda sütun kırpılmaz).
  const kutu = await bolum.boundingBox();
  for (const h of await satir('S4.a1').locator('td:visible').all()) { const k = await h.boundingBox(); expect(k && kutu && k.x + k.width <= kutu.x + kutu.width + 1).toBe(true); }
  expect((await tezgah.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(96);
  await expect(satir('S4.a2').locator('[data-ongoru]').first()).toContainText('öngörü F-02 · 20.10');
  expect(t.alinan()).toEqual([]);
  await tasma();
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3318-tablo-${bilgi.project.name}.png`, fullPage: true });
  await bolum.getByRole('button', { name: 'İleriye yerleştir' }).click();
  await expect.poll(() => t.alinan().length).toBe(1);
  expect(t.alinan()[0]).toMatchObject({ tur: 'plana-al', emirId: 'S4', tezgah: 'M2', baslangic: 32, adimlar: [{ isId: 'S4.a2', tezgah: 'M3' }] });

  // Akış görünümü eski kutuları verir; tablo kalkar.
  await bolum.getByRole('group', { name: 'Operasyon görünümü' }).getByRole('button', { name: 'Akış' }).click();
  await expect(bolum.locator('table')).toHaveCount(0);
  await expect(bolum.locator('.tc-pyq-rota').first()).toBeVisible();
  await tasma();
  expect(ag.hatalar).toEqual([]);
});

// Kart 3318 a (2. dilim): toplu yerleştirme. "Teslimden geriye yerleştir" emri termine yetişen en geç yere alır: önce onay penceresi, sonra
// taslağa iki değişiklik (emrin yönü ve plana alma). Önizleme uydurmadır: ilk adım istenen saatte; emir T-01'de başlarsa 14, F-01'de başlarsa 400
// saat sonra biter (F-01'de termine sığmaz).
test('Kokpit 3318-2: "Teslimden geriye yerleştir" onay sorar, emrin yönünü geriye çevirip termine yetişen en geç yere alır; sığmayan emir yazılmaz; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  const c = calisma({ ...ILK }, {});
  c.D.urunler = [...c.D.urunler, { id: 'U3', ad: 'Deneme govde', rota: [{ k: 'a1', ad: 'Torna', tezgahlar: [{ id: 'M1', cevrim: 60 }, { id: 'M2', cevrim: 60 }] }, { k: 'a2', ad: 'Freze', bag: [['a1', 'FS']], tezgahlar: [{ id: 'M3', cevrim: 60 }] }] }];
  c.D.siparisler = c.D.siparisler.map((x) => (x.id === 'S4' ? { ...x, urun: 'U3' } : x));
  const t = await taslakSunucusu(page, (d) => ({ ...c, w: d.w, locks: d.locks, plan: plan(d.ops) }));
  await page.route('**/api/plan/planlama-calismasi/plana-al-onizlemesi?*', (r) => {
    const q = new URL(r.request().url()).searchParams, tezgah = q.get('tezgah') ?? '', S = Number(q.get('baslangic')), sure = tezgah === 'M2' ? 400 : 14;
    return json(r, { calismaSurumu: t.s.surum, gecerli: true, ileti: null, isler: [{ isId: 'S4.a1', tezgah, S, C: S + 4 }, { isId: 'S4.a2', tezgah: 'M3', S: S + sure - 4, C: S + sure }], bitis: S + sure });
  });
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan/kokpit?duzen=klasik');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  await gorunumAc(kokpit);
  const tasma = async () => { expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0); };
  const bolum = kokpit.getByRole('region', { name: 'Emirler ve operasyonlar' });
  const geri = bolum.getByRole('button', { name: 'Teslimden geriye yerleştir' });
  await expect(bolum.getByRole('button', { name: 'İleriye yerleştir' })).toBeEnabled();
  await expect(geri).toBeEnabled();
  await expect(bolum.locator('[data-toplu-emir]')).toHaveText('S4 için:');
  if (bilgi.project.name === 'g360') expect((await geri.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await tasma();

  // Sığmayan emir: F-01'de en erken yerleşim de termini (28.10 17:00) geçer; yazılmaz, neden yazılır.
  await bolum.getByRole('combobox', { name: 'Torna tezgâhı' }).selectOption('M2');
  await geri.click();
  await expect(bolum.getByRole('alert')).toContainText('Teslimden geriye sığmıyor');
  expect(t.s.komutlar).toEqual([]);
  await tasma();
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3318-2-sigmaz-${bilgi.project.name}.png`, fullPage: true });

  // Sığan emir (sistemin seçtiği T-01): termin planın 233. saati, emir 14 saat sürer; en geç başlangıç 219 (28.10 03:00).
  await bolum.getByRole('button', { name: 'Seçimleri sil' }).click();
  await expect(geri).toBeEnabled();
  await geri.click();
  const pencere = page.getByRole('dialog', { name: 'Teslimden geriye yerleştir' });
  await expect(pencere).toContainText('ilk operasyon T-01 tezgâhında 28.10');
  await expect(pencere).toContainText('öngörüye göre emir 28.10');
  await expect(pencere).toContainText('Emrin yönü "Teslimden geriye" olur.');
  expect(t.s.komutlar).toEqual([]);
  await tasma();
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3318-2-onay-${bilgi.project.name}.png`, fullPage: true });
  await pencere.getByRole('button', { name: 'Yerleştir' }).click();
  await expect.poll(() => t.alinan().length).toBe(1);
  expect(t.s.komutlar).toMatchObject([{ tur: 'yon', emirId: 'S4', yon: 'geri' }, { tur: 'plana-al', emirId: 'S4', tezgah: 'M1', baslangic: 219 }]);
  await tasma();
  expect(ag.hatalar).toEqual([]);
});

// Kart 3335 a, dilim 2b: "Geride kalanları yeniden planla (N)". Saat 12:00: S1'in Torna adımı 08:00'de başlayacaktı, başlamadı.
test('Kokpit 3335-2b: Planla menüsünde geride kalanları yeniden planla; sayı geride emir sayısı, komut taslağa yazılır ve Geri alır; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  const t = await taslakSunucusu(page);
  await page.clock.setSystemTime(new Date('2026-10-19T12:00:00+03:00'));
  await ac('/plan/kokpit?duzen=klasik');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  await gorunumAc(kokpit);
  const karsilama = page.getByRole('button', { name: 'Başlayalım' });
  if (await karsilama.isVisible().catch(() => false)) await karsilama.click();
  const dugme = kokpit.getByRole('button', { name: 'Plan', exact: true });
  await expect(dugme).toBeEnabled();
  await dugme.click();
  const menu = kokpit.getByRole('menu', { name: 'Plan' });
  await menu.getByRole('button', { name: 'Diğer seçenekler' }).click();
  const geride = menu.getByRole('menuitem', { name: /Geride kalanları baştan kur \(1\)/ });
  await expect(geride).toBeEnabled();
  await expect(geride).toContainText('şimdiden sonraya dizilir');
  // Bütün plan üç ana seçenektedir; seçili siparişi ve geride kalanları yeniden planlama Diğer seçenekler'dedir (3414).
  await expect(menu.getByRole('menuitem').filter({ hasText: /aştan kur/ })).toHaveText([/Baştan kur…/, /Seçili siparişi baştan kur/, /Geride kalanları baştan kur/]);
  const kutu = await menu.boundingBox(), gen = page.viewportSize()!.width;
  expect(kutu!.x).toBeGreaterThanOrEqual(0);
  expect(kutu!.x + kutu!.width).toBeLessThanOrEqual(gen + 1);
  if (bilgi.project.name === 'g360') expect((await geride.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  await geride.scrollIntoViewIfNeeded();
  await expect(geride).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3335-2b-menu-${bilgi.project.name}.png` });
  await geride.click();
  await expect(menu).toHaveCount(0);
  await expect.poll(() => t.s.satirlar.map((x) => x.komut.tur)).toEqual(['yeniden-planla', 'diz']);
  expect(t.s.komutlar).toEqual([{ tur: 'yeniden-planla', isler: ['S1'] }]);
  await expect(kokpit.getByRole('region', { name: 'Değişiklikleriniz' })).toBeVisible();
  await kokpit.getByRole('group', { name: 'Geri ve İleri' }).getByRole('button').click();
  await expect.poll(() => t.s.satirlar.length).toBe(0);
  expect(ag.hatalar).toEqual([]);
});

// Kart 3335 a, 2. dilim: "Planla" menüsü üst şeridin başındadır. Toplu ve yeniden planlama taslağa "yeniden-planla" komutu yazar, plan
// taslağın görünümünde yeniden dizilir, Geri ikisini birlikte alır; seçili plansız siparişin yönü satırın içinde seçilir (var olan plana alma).
test('Kokpit 3335-2: Planla menüsü; plansızların hepsini planla taslağa yazar ve Geri alır; seçili siparişi ileriye planla; tüm planın yönü Planla menüsünde; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  const c = calisma({ ...ILK }, {});
  const t = await taslakSunucusu(page, (d) => ({ ...c, w: d.w, locks: d.locks, plan: plan(d.ops) }));
  await page.route('**/api/plan/planlama-calismasi/plana-al-onizlemesi?*', (r) => {
    const q = new URL(r.request().url()).searchParams, tezgah = q.get('tezgah') ?? '', S = Number(q.get('baslangic'));
    return json(r, { calismaSurumu: t.s.surum, gecerli: true, ileti: null, isler: [{ isId: 'S4.a1', tezgah, S, C: S + 4 }], bitis: S + 4 });
  });
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan/kokpit?duzen=klasik');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  await gorunumAc(kokpit);
  const tasma = async () => { expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0); };
  const dugme = kokpit.getByRole('button', { name: 'Plan', exact: true });
  const menu = kokpit.getByRole('menu', { name: 'Plan' });
  await expect(dugme).toBeEnabled();
  // Planlama yolu ve taslak cümlesi üst şeridin altında, taşmadan durur.
  await expect(kokpit.locator('.tc-pyq-yol')).toBeVisible();
  const karsilama = page.getByRole('button', { name: 'Başlayalım' });
  if (await karsilama.isVisible()) await karsilama.click();
  await expect(karsilama).toHaveCount(0);
  await dugme.scrollIntoViewIfNeeded();
  await tasma();
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3335-2-kapali-${bilgi.project.name}.png` });
  await dugme.click();
  await expect(menu).toBeVisible();
  const hepsi = menu.getByRole('menuitem', { name: /Plansızları yerleştir \(1\)/ });
  const secili = menu.getByRole('group', { name: 'Seçili siparişi yerleştir' });
  await expect(hepsi).toBeEnabled();
  // Seyrek kullanılanlar kapalı gelir; bir basışla açılır ve menü yeniden açılınca açık kalır (3414). Seçili siparişi yerleştirme de burada (3504 b).
  await expect(menu.getByRole('menuitem', { name: /İşaretli adımları yerleştir/ })).toBeHidden();
  await menu.getByRole('button', { name: 'Diğer seçenekler' }).click();
  await expect(secili).toContainText('S4');
  await expect(secili).toContainText('yönü seçin');
  await expect(secili.getByRole('menuitem', { name: 'İleriye' })).toBeEnabled();
  await expect(menu.getByRole('menuitem', { name: /İşaretli adımları yerleştir \(0\)/ })).toBeDisabled();
  await expect(menu.getByRole('menuitem', { name: /Seçili siparişi baştan kur/ })).toBeDisabled();
  await expect(menu.getByRole('menuitem', { name: /Baştan kur…/ })).toBeEnabled();
  // Menü ekrana sığar; telefonda satırlar parmağa göredir.
  const kutu = await menu.boundingBox(), gen = page.viewportSize()!.width;
  expect(kutu!.x).toBeGreaterThanOrEqual(0);
  expect(kutu!.x + kutu!.width).toBeLessThanOrEqual(gen + 1);
  if (bilgi.project.name === 'g360') for (const b of await menu.getByRole('menuitem').all()) expect((await b.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await tasma();
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3335-2-menu-${bilgi.project.name}.png` });

  // Toplu: istek taslağa kendi satırıyla yazılır, plan yeniden dizilir; Geri ikisini birlikte alır.
  await hepsi.click();
  await expect(menu).toHaveCount(0);
  await expect.poll(() => t.s.satirlar.map((x) => x.komut.tur)).toEqual(['yeniden-planla', 'diz']);
  expect(t.s.komutlar).toEqual([{ tur: 'yeniden-planla', isler: ['S4'] }]);
  await expect(kokpit.getByRole('region', { name: 'Değişiklikleriniz' })).toBeVisible();
  await kokpit.getByRole('group', { name: 'Geri ve İleri' }).getByRole('button').click();
  await expect.poll(() => t.s.satirlar.length).toBe(0);

  // Seçerek: yön satırın içinde; İleriye var olan plana alma komutunu yazar.
  await expect(dugme).toBeEnabled();
  await dugme.click();
  await expect(secili.getByRole('menuitem', { name: 'İleriye' })).toBeEnabled();
  await secili.getByRole('menuitem', { name: 'İleriye' }).click();
  await expect.poll(() => t.alinan().length).toBe(1);
  expect(t.alinan()[0]).toMatchObject({ tur: 'plana-al', emirId: 'S4' });

  // Tüm planın yönü üst şeritte ayrı düğme değildir; Planla menüsündedir, Araçlar'da yoktur (3365-4).
  await expect(kokpit.getByRole('button', { name: /^Tüm plan:/ })).toHaveCount(0);
  await kokpit.getByRole('button', { name: 'Plan', exact: true }).click();
  await expect(kokpit.getByRole('menu', { name: 'Plan' }).getByRole('menuitemradio', { name: /^İleriye/ })).toHaveAttribute('aria-checked', 'true');
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3365-4-planla-${bilgi.project.name}.png` });
  // Geniş ekranda uzun menü ekranın altından taşmaz, içinde kaydırılır; 360'ta araç satırı alt alta dizildiği için sayfa kayar.
  if (page.viewportSize()!.width >= 768) {
    const menuKutusu = await kokpit.getByRole('menu', { name: 'Plan' }).boundingBox();
    expect((menuKutusu?.y ?? 0) + (menuKutusu?.height ?? 0)).toBeLessThanOrEqual(page.viewportSize()!.height);
  }
  await page.keyboard.press('Escape');
  await expect(kokpit.getByRole('menu', { name: 'Plan' })).toHaveCount(0);
  await kokpit.getByRole('button', { name: 'Araçlar' }).click();
  await expect(kokpit.getByRole('menu', { name: 'Araçlar' })).toBeVisible();
  await expect(kokpit.getByRole('menu', { name: 'Araçlar' }).getByRole('menuitemradio', { name: /Tüm plan:/ })).toHaveCount(0);
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3365-4-araclar-${bilgi.project.name}.png` });
  await page.keyboard.press('Escape');
  await tasma();
  expect(ag.hatalar).toEqual([]);
});

// Kart 3318 a, 3. dilim: tabloda seçili operasyonun uygun tezgâhları odaklı panelde durur (geniş ekranda tablonun yanında, dar ekranda
// seçili satırın altında). Boş yere basınca tezgâh ve başlangıç satıra yazılır; yerleşmiş operasyonda yeni yer "Taşı" ile yazılır.
// Önizleme uydurmadır: T-01 altı saat sonra boşalır, F-01 hemen boştur.
test('Kokpit 3318-3: odaklı tezgâh paneli; uygun tezgâhlar, dolu işler ve boş yerler; boş yere basınca satır dolar; yerleşmiş operasyonda "Taşı"; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  const c = calisma({ ...ILK }, {});
  c.D.urunler = [...c.D.urunler, { id: 'U3', ad: 'Deneme govde', rota: [{ k: 'a1', ad: 'Torna', tezgahlar: [{ id: 'M1', cevrim: 60 }, { id: 'M2', cevrim: 60 }] }, { k: 'a2', ad: 'Freze', bag: [['a1', 'FS']], tezgahlar: [{ id: 'M3', cevrim: 60 }] }] }];
  c.D.siparisler = c.D.siparisler.map((x) => (x.id === 'S4' ? { ...x, urun: 'U3' } : x));
  const t = await taslakSunucusu(page, (d) => ({ ...c, w: d.w, locks: d.locks, plan: plan(d.ops) }));
  let ilk: number | null = null;
  await page.route('**/api/plan/planlama-calismasi/plana-al-onizlemesi?*', (r) => {
    const q = new URL(r.request().url()).searchParams, tezgah = q.get('tezgah') ?? '', istenen = Number(q.get('baslangic'));
    ilk ??= istenen;
    // F-01'e elle girilen (şimdiden sonraki) saat doludur; saat verilmeden sorulunca boş yeri şimdidir.
    if (tezgah === 'M2' && istenen !== ilk) return json(r, { calismaSurumu: t.s.surum, gecerli: false, ileti: 'Deneme: bu tezgâh o saatte dolu.', isler: [], bitis: null });
    const S = tezgah === 'M1' ? Math.max(istenen, ilk + 6) : istenen;
    return json(r, { calismaSurumu: t.s.surum, gecerli: true, ileti: null, isler: [{ isId: 'S4.a1', tezgah, S, C: S + 4 }, { isId: 'S4.a2', tezgah: 'M3', S: S + 10, C: S + 14 }], bitis: S + 14 });
  });
  await page.route('**/api/plan/planlama-calismasi/is-tasi-onizlemesi?*', (r) => {
    const q = new URL(r.request().url()).searchParams;
    const id = q.get('isId') ?? '', S = Number(q.get('baslangic')), x = t.gorunum().ops[id];
    return json(r, { calismaSurumu: t.s.surum, gecerli: true, ileti: null, isler: x ? [{ isId: id, tezgah: q.get('tezgah'), S, C: S + (x.C - x.S), eskiTezgah: x.m, eskiS: x.S, tur: 'tasinan' }] : [] });
  });
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan/kokpit?duzen=klasik');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  await gorunumAc(kokpit);
  const tasma = async () => { expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0); };
  const genis = bilgi.project.name === 'g1280', telefon = bilgi.project.name === 'g360';
  const bolum = kokpit.getByRole('region', { name: 'Emirler ve operasyonlar' });
  const kutu = async (l: Locator) => { const b = await l.boundingBox(); if (!b) throw new Error('kutu'); return b; };

  // Yerleşmemiş emrin ilk operasyonu seçili gelir: panel Torna'nın iki tezgâhını ve boş yerlerini gösterir.
  const panel = bolum.getByRole('complementary', { name: 'Torna için tezgâhlar' });
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-odak-satir]')).toHaveCount(2);
  await expect(panel.locator('[data-odak-yer]')).toHaveCount(2);
  await expect(panel.locator('[data-odak-yer="M2"]')).toHaveAttribute('data-ilk', '');
  // Panel yerleşimi bir kare sonra oturur; ölçüm hizalanma bitince alınır.
  const tablo = await kutu(bolum.locator('.tc-pyq-optablo')), pk = await kutu(panel), bk = await kutu(bolum);
  if (genis) {
    // Geniş ekranda panel tablonun altında, boydan boya; tablo bütün sütunlarıyla durur.
    await expect(bolum.locator('[data-satir-odagi]')).toHaveCount(0);
    await expect(bolum.locator('.tc-pyq-optablo th[data-ad="Bağımlılık"]')).toBeVisible();
    expect(pk.y).toBeGreaterThanOrEqual(tablo.y + tablo.height - 1);
    expect(pk.width).toBeGreaterThanOrEqual(tablo.width * 0.95);
  } else {
    // Dar ekranda panel seçili satırın hemen altında, tam genişlikte.
    await expect(bolum.locator('[data-satir-odagi="S4.a1"]')).toBeVisible();
    const satir = await kutu(bolum.locator('[data-adim-satir="S4.a1"]'));
    expect(pk.y).toBeGreaterThanOrEqual(satir.y + satir.height - 1);
    expect(pk.width).toBeGreaterThanOrEqual(tablo.width * 0.9);
  }
  expect(pk.x).toBeGreaterThanOrEqual(bk.x - 1);
  expect(pk.x + pk.width).toBeLessThanOrEqual(bk.x + bk.width + 1);
  if (telefon) expect((await kutu(panel.locator('[data-odak-yer="M1"]'))).height).toBeGreaterThanOrEqual(44);
  await tasma();

  // Uymayan saat: nedenin yanında seçili tezgâhın en yakın boş yeri önerilir.
  await bolum.getByRole('combobox', { name: 'Torna tezgâhı' }).selectOption('M2');
  await bolum.getByLabel('Torna başlangıcı').fill('2026-10-20T08:00');
  const not = bolum.locator('[data-satir-notu="S4.a1"]');
  await expect(not.getByRole('alert')).toHaveText('Deneme: bu tezgâh o saatte dolu.');
  await expect(not.locator('[data-yakin-bos="M2"]')).toHaveText(/^En yakın boş: F-01 · 19\.10/);
  await expect(panel.locator('[data-odak-yer="M2"]')).toHaveAttribute('aria-pressed', 'false');
  await tasma();
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3318-3-oneri-${bilgi.project.name}.png`, fullPage: true });

  // Boş yere basınca tezgâh ve başlangıç satıra yazılır; plana yazılmaz.
  await panel.locator('[data-odak-yer="M1"]').click();
  await expect(not).toHaveCount(0);
  await expect(bolum.getByRole('combobox', { name: 'Torna tezgâhı' })).toHaveValue('M1');
  await expect(bolum.getByLabel('Torna başlangıcı')).toHaveValue(/T\d\d:\d\d$/);
  await expect(panel.locator('[data-odak-yer="M1"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(bolum.locator('[data-adim-satir="S4.a1"] [data-yazilmadi]')).toBeVisible();
  expect(t.s.komutlar).toEqual([]);
  await tasma();
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3318-3-panel-${bilgi.project.name}.png`, fullPage: true });

  // "Bütün tezgâhlar" öteki tezgâhları soluk gösterir; boş yer yalnız uygun tezgâhlardadır.
  await panel.getByRole('button', { name: 'Bütün tezgâhlar' }).click();
  await expect(panel.locator('[data-odak-satir][data-uygun="hayir"]').first()).toBeVisible();
  await expect(panel.locator('[data-odak-yer]')).toHaveCount(2);
  await tasma();
  await panel.getByRole('button', { name: 'Uygun tezgâhlar' }).click();

  // Seçim "İleriye yerleştir" ile yazılır: panelden seçilen tezgâh ve saat komuta girer.
  await bolum.getByRole('button', { name: 'İleriye yerleştir' }).click();
  await expect.poll(() => t.alinan().length).toBe(1);
  expect(t.s.komutlar).toMatchObject([{ tur: 'plana-al', emirId: 'S4', tezgah: 'M1', baslangic: (ilk ?? 0) + 6 }]);

  // Yerleşmiş operasyon: panel kendi işini işaretler; boş yere basınca satırda "Taşı" çıkar, basınca taşıma yazılır.
  await kokpit.getByRole('region', { name: 'Siparişler, sırasıyla' }).locator('[data-kart="S1"]').click();
  await bolum.locator('[data-adim="S1.a2"]').click();
  const fpanel = bolum.getByRole('complementary', { name: 'Freze için tezgâhlar' });
  await expect(fpanel).toBeVisible();
  await expect(fpanel.locator('.tc-pyq-odak-is[data-kendi]')).toHaveCount(1);
  await expect(fpanel.locator('[data-odak-yer]')).toHaveCount(2);
  await tasma();
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3318-3-tasi-${bilgi.project.name}.png`, fullPage: true });
  await fpanel.locator('[data-odak-yer="M3"]').click();
  const satirTasi = bolum.locator('[data-satir-tasi="S1.a2"]');
  await expect(satirTasi).toBeVisible();
  expect(t.tasinan()).toEqual([]);
  await satirTasi.click();
  await expect.poll(() => t.tasinan().length).toBe(1);
  expect(t.tasinan()[0]).toMatchObject({ tur: 'tasi', isId: 'S1.a2', tezgah: 'M3', baslangic: 16 });
  await tasma();
  expect(ag.hatalar).toEqual([]);
});

// Kart 3318: panel altta boydan boya durunca uzak tarihe yerleşmiş iş de pencerede görünür; gün yazıları seyrelir ve üst üste binmez.
test('Kokpit 3318-4: odaklı tezgâh panelinde haftalar sonraya yerleşmiş iş görünür; gün yazıları binmez; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  const c = calisma({ ...ILK }, {});
  const t = await taslakSunucusu(page, (d) => ({ ...c, w: d.w, locks: d.locks, plan: plan({ ...d.ops, 'S1.a2': { job: 'S1', m: 'M2', S: 393, C: 401 } }) }));
  await page.route('**/api/plan/planlama-calismasi/is-tasi-onizlemesi?*', (r) => json(r, { calismaSurumu: t.s.surum, gecerli: true, ileti: null, isler: [] }));
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan/kokpit?duzen=klasik');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  await gorunumAc(kokpit);
  const bolum = kokpit.getByRole('region', { name: 'Emirler ve operasyonlar' });
  await kokpit.getByRole('region', { name: 'Siparişler, sırasıyla' }).locator('[data-kart="S1"]').click();
  await bolum.locator('[data-adim="S1.a2"]').click();
  const panel = bolum.getByRole('complementary', { name: 'Freze için tezgâhlar' });
  await expect(panel).toBeVisible();
  const kutu = async (l: Locator) => { const b = await l.boundingBox(); if (!b) throw new Error('kutu'); return b; };
  const kendi = panel.locator('.tc-pyq-odak-is[data-kendi]');
  await expect(kendi).toHaveCount(1);
  const serit = await kutu(panel.locator('[data-odak-satir="M2"] .tc-pyq-odak-serit')), kk = await kutu(kendi);
  expect(kk.width).toBeGreaterThanOrEqual(2);
  expect(kk.x).toBeGreaterThanOrEqual(serit.x - 1);
  expect(kk.x + kk.width).toBeLessThanOrEqual(serit.x + serit.width + 1);
  const yazilar = panel.locator('.tc-pyq-odak-eksen > i');
  const n = await yazilar.count();
  expect(n).toBeGreaterThan(1);
  expect(n).toBeLessThanOrEqual(8);
  const kutular = await Promise.all(Array.from({ length: n }, (_, i) => kutu(yazilar.nth(i))));
  kutular.sort((a, b) => a.x - b.x);
  for (let i = 1; i < n; i++) expect(kutular[i]!.x, `gün yazısı ${String(i)} öncekine biniyor`).toBeGreaterThanOrEqual(kutular[i - 1]!.x + kutular[i - 1]!.width);
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3318-4-ileri-${bilgi.project.name}.png`, fullPage: true });
  expect(ag.hatalar).toEqual([]);
});

// Kart 3317 a, 1. adım: planı etkileyen değişiklikler plan şeridinde özetlenir ve altında üç başlıkta listelenir (veri değişti, sahada
// oldu, plan geride). "Göster" emrin kartını seçer ve listeyi kapatır; liste seçili karta süzülür. Veri değişiklikleri şeritteki ikincil
// toplu düğmeyle uygulanır. Veri uydurmadır: çalışma planından bir sürüm ileridedir, bir duruş ve bir satın alma olayı vardır, saat 10:00'da
// S1'in tornası (08:00) başlamamıştır.
test('Kokpit 3317: değişiklik özeti şeritte, liste üç başlıkta; Göster kartı seçer; karta süzme; toplu düğme ikincil ve adıyla; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  await page.route('**/api/plan/planlama-calismasi', (r) => json(r, { calisma: { ...calisma({ ...ILK }, {}), dataVer: 4 }, surum: 1 }));
  await page.route('**/api/plan/surum', (r) => json(r, {
    planSurumu: 3, sonCanliyaAlma: { zaman: '2026-10-19T05:00:00Z', kisi: 'ORN-Mudur' },
    bayat: { bayat: true, sonCanliyaAlma: '2026-10-19T05:00:00Z', olaylar: [
      { neden: 'durus', zaman: '2026-10-19T06:00:00Z', uretimEmriId: null, emirNo: null, makineId: 1, makineKod: 'F-01' },
      { neden: 'satin-alma-termini', zaman: '2026-10-19T06:30:00Z', uretimEmriId: 3, emirNo: 'S3', makineId: null, makineKod: null },
    ] },
  }));
  await page.clock.setSystemTime(new Date('2026-10-19T10:00:00+03:00'));
  await ac('/plan/kokpit?duzen=klasik');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  await gorunumAc(kokpit);
  const tasma = async () => { expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0); };
  const telefon = bilgi.project.name === 'g360';
  const cubuk = page.getByRole('toolbar', { name: 'Plan çubuğu' });
  const ozet = cubuk.locator('[data-degisiklik-ozeti]');
  await expect(ozet.locator('b')).toHaveText('4 değişiklik');
  // Döküm telefonda yazmaz; sayı ve düğme kalır.
  if (!telefon) await expect(ozet.getByText('1 veri · 2 saha · 1 geride')).toBeVisible();
  // Nabzın ayrı olay göstergesi Kokpit'te çizilmez (şeritte tek sayı: değişiklikler; çalışmanın olayları açık nabızda listelenir).
  await expect(cubuk.locator('[data-olaylar]')).toHaveCount(0);
  await expect(cubuk.getByText('Veri değişti')).toHaveCount(0);
  // Ayrı değişiklik satırı (sayfanın üstündeki) Kokpit'te çizilmez.
  await expect(page.getByRole('region', { name: 'Değişiklik akışı' })).toHaveCount(0);
  const toplu = cubuk.getByRole('button', { name: 'Planı güncelle' });
  await expect(toplu).toBeVisible();
  await expect(toplu).not.toHaveClass(/tc-dugme-birincil/);
  const serit = kokpit.getByRole('region', { name: 'Siparişler, sırasıyla' });
  await expect(serit.locator('[data-kart="S3"] [data-olay]')).toContainText('1 değişiklik');
  await expect(serit.locator('[data-kart="S1"] [data-olay]')).toContainText('1 değişiklik');
  await tasma();

  const ac2 = ozet.getByRole('button', { name: 'Değişiklikleri aç' });
  if (telefon) expect((await ac2.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await ac2.click();
  const liste = page.getByRole('region', { name: 'Planı etkileyen değişiklikler' });
  await expect(liste.getByRole('region', { name: 'Veri değişti' }).getByRole('listitem')).toHaveCount(1);
  await expect(liste.getByRole('region', { name: 'Sahada oldu' }).getByRole('listitem')).toHaveCount(2);
  const geride = liste.getByRole('region', { name: 'Plan geride' });
  await expect(geride.getByRole('listitem')).toHaveCount(1);
  await expect(geride.getByRole('listitem')).toContainText('S1 · Torna · T-01');
  await expect(geride.getByRole('listitem')).toContainText('2 sa geride');
  await expect(liste).toContainText('"Planı güncelle (1)" başka sayfalarda yapılan 1 değişikliği plana işler');
  // Liste şeridin altında, Kokpit'in üstünde durur; sayfayı yana taşırmaz.
  const lk = await liste.boundingBox(), kk = await kokpit.boundingBox(), ck = await cubuk.boundingBox();
  expect(lk && ck ? lk.y >= ck.y + ck.height - 1 : false).toBe(true);
  expect(lk && kk ? lk.y + lk.height <= kk.y + 1 : false).toBe(true);
  if (telefon) expect((await liste.getByRole('button', { name: 'Emre git' }).first().boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await tasma();

  // Seçili karta süzme: S4 seçili gelir (değişikliği yok, süzgeç çıkmaz); S3 seçilince yalnız onun satırı kalır.
  await expect(liste.getByRole('button', { name: /^Yalnız / })).toHaveCount(0);
  await serit.locator('[data-kart="S3"]').click();
  await liste.getByRole('button', { name: 'Yalnız S3' }).click();
  await expect(liste.getByRole('listitem')).toHaveCount(1);
  await expect(liste).toContainText('S3 için · 1 değişiklik');
  await tasma();
  await liste.getByRole('button', { name: 'Tümünü göster' }).click();
  await expect(liste.getByRole('listitem')).toHaveCount(4);

  // Göster: geride kalan işin emri seçilir, liste kapanır.
  await geride.getByRole('button', { name: 'Emre git' }).click();
  await expect(liste).toHaveCount(0);
  await expect(serit.locator('[data-kart="S1"]')).toHaveAttribute('aria-pressed', 'true');
  await tasma();

  // 3317-1b: Motor sayfasında aynı özet ve liste aynı yerdedir; Motor yalnız gösterir (satırda "Göster" yok), bağlantı Kokpit'i açar.
  await ac('/plan/plan');
  const motor = page.locator('.tc-pym[data-gorunum]');
  await expect(motor).toBeVisible({ timeout: 20_000 });
  const mKarsilama = page.getByRole('button', { name: 'Başlayalım' });
  if (await mKarsilama.isVisible().catch(() => false)) await mKarsilama.click();
  const mCubuk = motor.getByRole('toolbar', { name: 'Plan çubuğu' });
  const mOzet = mCubuk.locator('[data-degisiklik-ozeti]');
  await expect(mOzet.locator('b')).toHaveText('4 değişiklik');
  await expect(mCubuk.getByText('Veri değişti')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Değişiklik akışı' })).toHaveCount(0);
  await expect(mCubuk.getByRole('button', { name: 'Planı güncelle' })).toHaveClass(/tc-dugme-birincil/);
  await tasma();
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3317-1b-motor-kapali-${bilgi.project.name}.png` });
  const mAc = mOzet.getByRole('button', { name: 'Değişiklikleri aç' });
  if (telefon) expect((await mAc.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await mAc.click();
  const mListe = page.getByRole('region', { name: 'Planı etkileyen değişiklikler' });
  await expect(mListe.getByRole('listitem')).toHaveCount(4);
  await expect(mListe.getByRole('region', { name: 'Plan geride' }).getByRole('listitem')).toContainText('S1 · Torna · T-01');
  await expect(mListe.getByRole('button', { name: 'Emre git' })).toHaveCount(0);
  const kGit = mListe.getByRole('button', { name: "Kokpit'te gör ve düzelt" });
  expect((await kGit.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(telefon ? 44 : 24);
  await tasma();
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3317-1b-motor-liste-${bilgi.project.name}.png`, fullPage: true });
  await kGit.click();
  await expect(page.locator('.tc-pyq')).toBeVisible({ timeout: 20_000 });
  expect(ag.hatalar).toEqual([]);
});

// Kart 3317 a (2. adım): "Veri değişti" satırında "Etkisini gör" satırın emirleri için taslağa yeniden planlama isteği yazar, planı yalnız
// o emirlerle yeniden dizdirir ve önce ile sonrayı satırın altında gösterir; "Vazgeç" isteği geri alır, "Uygula" dizmeyi taslağa yazar:
// satır listeden düşer, öteki bekler, taslak çubuğu ve Geri değişikliği gösterir. Veriler uydurmadır.
test('Kokpit 3317-2: veri değişikliği satırında Etkisini gör, önce ve sonra; Vazgeç geri alır; Uygula yalnız o satırı taslağa uygular; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  const bekleyen = [
    { id: 'ORN-b1', ne: 'Rota değişti: Deneme burc', ayrinti: 'S3', kim: 'ORN-Planlamaci', t: Date.parse('2026-10-19T06:00:00Z'), isler: ['S3'], geri: [] },
    { id: 'ORN-b2', ne: 'Termin değişti: S2', ayrinti: 'S2', kim: 'ORN-Planlamaci', t: Date.parse('2026-10-19T06:10:00Z'), isler: ['S2'], geri: [] },
  ];
  const ortak = { ...calisma({ ...ILK }, {}), dataVer: 4, bekleyen };
  const YENI = { ...plan({ ...ILK, 'S3.a1': { job: 'S3', m: 'M1', S: 40, C: 46 } }), ozet: { wT: 26, T: 26, late: 2 } };
  // Kişinin taslağı: komutlar sırayla; dizilmemiş istek görünümde bekleyen satırıdır, dizme işleri kapsanan bekleyenleri düşürür.
  const t = { surum: 0, satirlar: [] as { komut: { tur: string; isler: string[] }; ne: string; t: number; hata: null }[], degerlendirme: [] as unknown[] };
  const gorunum = () => {
    let c: Record<string, unknown> = ortak, bek: { id: string; isler: string[] }[] = bekleyen;
    for (const x of t.satirlar) {
      if (x.komut.tur === 'yeniden-planla') bek = [...bek, { id: `ORN-t${String(bek.length)}`, ne: 'Yeniden planlama istendi', ayrinti: '', kim: '', t: 0, isler: x.komut.isler, geri: [] } as never];
      else { bek = bek.filter((b) => !b.isler.every((i) => x.komut.isler.includes(i))); c = { ...c, plan: YENI }; }
      c = { ...c, dataVer: Number(c['dataVer']) + 1, bekleyen: bek };
    }
    return c;
  };
  const cevap = () => (t.satirlar.length === 0 ? { taslak: null, calisma: ortak, surum: 1 } : { taslak: { surum: t.surum, tabanSurum: 1, satirlar: t.satirlar }, calisma: gorunum(), surum: 1 });
  await page.route('**/api/plan/planlama-calismasi', (r) => json(r, { calisma: ortak, surum: 1 }));
  await page.route('**/api/plan/taslagim', (r) => json(r, cevap()));
  await page.route('**/api/plan/taslagim/komut', (r) => {
    const k = (r.request().postDataJSON() as { komut: { tur: string; isler: string[] } }).komut;
    t.satirlar.push({ komut: k, ne: 'Yeniden planlama istendi', t: 0, hata: null }); t.surum += 1;
    return json(r, cevap());
  });
  await page.route('**/api/plan/taslagim/geri-al', (r) => { t.satirlar.pop(); t.surum += 1; return json(r, cevap()); });
  await page.route('**/api/plan/taslagim/degerlendirme', (r) => { t.degerlendirme.push((r.request().postDataJSON() as { istek: unknown }).istek); return json(r, { is: IS }); });
  await page.route(`**/api/plan/planlama-degerlendirmesi/${IS}`, (r) => json(r, {
    durum: 'bitti', cevap: { calismaSurumu: 1, dataVer: 4, baslangic: '2026-10-19', simdi: 7, maliyetGorunur: false, sonuc: { tur: 'plan-uygula', plan: YENI } },
  }));
  await page.route('**/api/plan/taslagim/diz', (r) => {
    const son = t.satirlar.at(-1)?.komut.isler ?? ['*'];
    t.satirlar.push({ komut: { tur: 'diz', isler: son }, ne: 'Plan yeniden dizildi', t: 0, hata: null }); t.surum += 1;
    return json(r, cevap());
  });
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan/kokpit?duzen=klasik');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  await gorunumAc(kokpit);
  const tasma = async () => { expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0); };
  const telefon = bilgi.project.name === 'g360';
  const ozet = page.getByRole('toolbar', { name: 'Plan çubuğu' }).locator('[data-degisiklik-ozeti]');
  await expect(ozet.locator('b')).toHaveText('2 değişiklik');
  await ozet.getByRole('button', { name: 'Değişiklikleri aç' }).click();
  const liste = page.getByRole('region', { name: 'Planı etkileyen değişiklikler' });
  const veri = liste.getByRole('region', { name: 'Veri değişti' });
  await expect(veri.getByRole('listitem')).toHaveCount(2);
  const gor = veri.getByRole('button', { name: 'Etkisini gör' });
  await expect(gor).toHaveCount(2);
  if (telefon) expect((await gor.first().boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await expect(liste).toContainText('altında çıkan düğme taslağınıza yazar');
  await tasma();

  await gor.first().click();
  const etki = liste.getByRole('region', { name: 'Etkisi' });
  await expect(etki).toBeVisible();
  expect(t.satirlar.map((x) => x.komut)).toEqual([{ tur: 'yeniden-planla', isler: ['S3'] }]);
  expect(t.degerlendirme).toEqual([{ tur: 'plan-uygula', isler: ['S3'] }]);
  await expect(etki).toContainText('Geciken iş1 → 2');
  await expect(etki).toContainText('Ağırlıklı gecikme20,0 sa → 26,0 sa');
  // Kötüleşme tonuyla yazılır (liste Kokpit kökünün dışına taşınır; ton yine okunur).
  const dd = etki.locator('dd[data-yon="kotu"]');
  await expect(dd).toHaveCount(2);
  expect(await dd.first().evaluate((x) => getComputedStyle(x).color)).not.toBe(await etki.locator('dt').first().evaluate((x) => getComputedStyle(x).color));
  expect(await dd.first().evaluate((x) => getComputedStyle(x).color)).not.toBe(await veri.locator('.tc-pyq-dg-ne b').first().evaluate((x) => getComputedStyle(x).color));
  // Etki kendi satırının altındadır; taslaktaki istek satır olmaz; öteki satırın düğmesi etki kapanana kadar bekler.
  await expect(veri.getByRole('listitem')).toHaveCount(2);
  await expect(veri.getByRole('listitem').first().getByRole('region', { name: 'Etkisi' })).toHaveCount(1);
  await expect(gor).toHaveCount(1);
  await expect(gor).toBeDisabled();
  const uygula = etki.getByRole('button', { name: 'Uygula' });
  await expect(uygula).not.toHaveClass(/tc-dugme-birincil/);
  if (telefon) expect((await uygula.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await tasma();
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3317-2-etki-${bilgi.project.name}.png`, fullPage: true });

  // Vazgeç: istek taslaktan geri alınır, satır eski hâline döner.
  await etki.getByRole('button', { name: 'Vazgeç' }).click();
  await expect(etki).toHaveCount(0);
  await expect(gor).toHaveCount(2);
  expect(t.satirlar).toEqual([]);

  // Uygula: dizme taslağa yazılır; yalnız o satır düşer, öteki bekler; taslak çubuğu değişikliği gösterir, Geri açılır.
  await gor.first().click();
  await etki.getByRole('button', { name: 'Uygula' }).click();
  await expect(veri.getByRole('listitem')).toHaveCount(1);
  await expect(veri.getByRole('listitem')).toContainText('Termin değişti: S2');
  await expect(ozet.locator('b')).toHaveText('1 değişiklik');
  expect(t.satirlar.map((x) => x.komut)).toEqual([{ tur: 'yeniden-planla', isler: ['S3'] }, { tur: 'diz', isler: ['S3'] }]);
  // Toplu düğme ortak planın bekleyenlerini sayar (2); not farkı söyler.
  await expect(liste).toContainText('1 veri değişikliği taslağınızda uygulandı, listede durmaz');
  await expect(kokpit.getByRole('region', { name: 'Değişiklikleriniz' })).toContainText('1 değişiklik · canlıya alınmadı');
  await expect(kokpit.getByRole('group', { name: 'Geri ve İleri' }).getByRole('button', { name: /Geri/ })).toBeEnabled();
  await tasma();
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3317-2-uygulandi-${bilgi.project.name}.png`, fullPage: true });
  expect(ag.hatalar).toEqual([]);
});

// Kart 3317 a (3. adım): "Plan geride" satırında "Etkisini gör" o emri yeniden dizdirir (geride kalan iş şimdiden sonraya gider), önce ile
// sonrayı satırın altında gösterir; "Uygula" dizmeyi taslağa yazar ve satır listeden düşer. Saat 12:00: S1'in ilk adımı 08:00'de
// başlayacaktı, başlamadı. Veriler uydurmadır.
test('Kokpit 3317-3: plan geride satırında Etkisini gör, önce ve sonra; Uygula emri taslakta yeniden dizer, satır düşer; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  const ortak = calisma({ ...ILK }, {});
  const YENI = { ...plan({ ...ILK, 'S1.a1': { job: 'S1', m: 'M1', S: 13, C: 21 } }), ozet: { wT: 25, T: 25, late: 1 } };
  const t = { surum: 0, satirlar: [] as { komut: { tur: string; isler: string[] }; ne: string; t: number; hata: null }[], degerlendirme: [] as unknown[] };
  const gorunum = () => {
    let c: Record<string, unknown> = ortak, bek: unknown[] = [];
    for (const x of t.satirlar) {
      if (x.komut.tur === 'yeniden-planla') bek = [{ id: 'ORN-t', ne: 'Yeniden planlama istendi', ayrinti: '', kim: '', t: 0, isler: x.komut.isler, geri: [] }];
      else { bek = []; c = { ...c, plan: { ...YENI, dataVer: Number(c['dataVer']) + 1 } }; }
      c = { ...c, dataVer: Number(c['dataVer']) + 1, bekleyen: bek };
    }
    return c;
  };
  const cevap = () => (t.satirlar.length === 0 ? { taslak: null, calisma: ortak, surum: 1 } : { taslak: { surum: t.surum, tabanSurum: 1, satirlar: t.satirlar }, calisma: gorunum(), surum: 1 });
  await page.route('**/api/plan/planlama-calismasi', (r) => json(r, { calisma: ortak, surum: 1 }));
  await page.route('**/api/plan/taslagim', (r) => json(r, cevap()));
  await page.route('**/api/plan/taslagim/komut', (r) => {
    const k = (r.request().postDataJSON() as { komut: { tur: string; isler: string[] } }).komut;
    t.satirlar.push({ komut: k, ne: 'Yeniden planlama istendi', t: 0, hata: null }); t.surum += 1;
    return json(r, cevap());
  });
  await page.route('**/api/plan/taslagim/geri-al', (r) => { t.satirlar.pop(); t.surum += 1; return json(r, cevap()); });
  await page.route('**/api/plan/taslagim/degerlendirme', (r) => { t.degerlendirme.push((r.request().postDataJSON() as { istek: unknown }).istek); return json(r, { is: IS }); });
  await page.route(`**/api/plan/planlama-degerlendirmesi/${IS}`, (r) => json(r, {
    durum: 'bitti', cevap: { calismaSurumu: 1, dataVer: 3, baslangic: '2026-10-19', simdi: 12, maliyetGorunur: false, sonuc: { tur: 'plan-uygula', plan: YENI } },
  }));
  await page.route('**/api/plan/taslagim/diz', (r) => {
    const son = t.satirlar.at(-1)?.komut.isler ?? ['*'];
    t.satirlar.push({ komut: { tur: 'diz', isler: son }, ne: 'Plan yeniden dizildi', t: 0, hata: null }); t.surum += 1;
    return json(r, cevap());
  });
  await page.clock.setSystemTime(new Date('2026-10-19T12:00:00+03:00'));
  await ac('/plan/kokpit?duzen=klasik');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  await gorunumAc(kokpit);
  const karsilama = page.getByRole('button', { name: 'Başlayalım' });
  if (await karsilama.isVisible().catch(() => false)) await karsilama.click();
  const tasma = async () => { expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0); };
  const telefon = bilgi.project.name === 'g360';
  const ozet = page.getByRole('toolbar', { name: 'Plan çubuğu' }).locator('[data-degisiklik-ozeti]');
  await expect(ozet.locator('b')).toHaveText('1 değişiklik');
  await ozet.getByRole('button', { name: 'Değişiklikleri aç' }).click();
  const liste = page.getByRole('region', { name: 'Planı etkileyen değişiklikler' });
  const geride = liste.getByRole('region', { name: 'Plan geride' });
  await expect(geride.getByRole('listitem')).toHaveCount(1);
  const gor = geride.getByRole('button', { name: 'Etkisini gör' });
  await expect(gor).toHaveCount(1);
  if (telefon) expect((await gor.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await expect(liste).toContainText('"Etkisini gör" yalnız o satırın planı nasıl değiştireceğini hesaplar, plan değişmez');
  await tasma();

  await gor.click();
  const etki = liste.getByRole('region', { name: 'Etkisi' });
  await expect(etki).toBeVisible();
  expect(t.satirlar.map((x) => x.komut)).toEqual([{ tur: 'yeniden-planla', isler: ['S1'] }]);
  expect(t.degerlendirme).toEqual([{ tur: 'plan-uygula', isler: ['S1'] }]);
  await expect(etki).toContainText('Ağırlıklı gecikme20,0 sa → 25,0 sa');
  await expect(geride.getByRole('listitem').getByRole('region', { name: 'Etkisi' })).toHaveCount(1);
  await expect(gor).toHaveCount(0);
  const uygula = etki.getByRole('button', { name: 'Bu emri yeniden diz' });
  if (telefon) expect((await uygula.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await tasma();
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3317-3-etki-${bilgi.project.name}.png`, fullPage: true });

  // Vazgeç: istek taslaktan geri alınır, satır eski hâline döner.
  await etki.getByRole('button', { name: 'Vazgeç' }).click();
  await expect(etki).toHaveCount(0);
  await expect(gor).toHaveCount(1);
  expect(t.satirlar).toEqual([]);

  // Uygula: dizme taslağa yazılır; iş şimdiden sonraya gittiği için satır düşer, plan güncel yazar; taslak çubuğu ve Geri açılır.
  await gor.click();
  await etki.getByRole('button', { name: 'Bu emri yeniden diz' }).click();
  await expect(ozet).toHaveText('Plan güncel');
  expect(t.satirlar.map((x) => x.komut)).toEqual([{ tur: 'yeniden-planla', isler: ['S1'] }, { tur: 'diz', isler: ['S1'] }]);
  await expect(kokpit.getByRole('region', { name: 'Değişiklikleriniz' })).toContainText('1 değişiklik · canlıya alınmadı');
  await expect(kokpit.getByRole('group', { name: 'Geri ve İleri' }).getByRole('button', { name: /Geri/ })).toBeEnabled();
  await tasma();
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3317-3-uygulandi-${bilgi.project.name}.png`, fullPage: true });
  expect(ag.hatalar).toEqual([]);
});

// Kart 3297-4: planlı operasyon seç-yerleştir ile taşınır. Operasyona basılınca taşınabileceği yerler listelenir ve tahtada çerçevelenir;
// yere basınca taşıma taslağa tek değişiklik olarak yazılır. Önizleme uydurmadır: istenen yer geçerlidir.
test('Kokpit 3330: kart seçilince siparişin işleri parlak, ötekiler soluk ama okunur; adımlar arasında bağ oku (düz bitince, kesik örtüşmeli); Esc ve boş alan seçimi kaldırır; telefonda bağ satırda; operasyonlar tablosunda bağımlılık; yatay taşma yok', async ({ page, ac }, bilgi) => {
  // S1 üç adımlıdır: Freze Torna bitince başlar, Çapak Freze ile örtüşür (Freze bitmeden başlar).
  const ops = { ...ILK, 'S1.a3': { job: 'S1', m: 'M3', S: 61, C: 69 } };
  const c = calisma(ops, {});
  c.D.urunler = c.D.urunler.map((u) => (u.id === 'U1' ? { ...u, rota: [...u.rota, { k: 'a3', ad: 'Capak', bag: [['a2', 'o']], tezgahlar: [{ id: 'M3', cevrim: 60 }] }] } : u));
  await taslakSunucusu(page, (d) => ({ ...c, w: d.w, locks: d.locks, plan: plan({ ...ops, ...d.ops }) }));
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan/kokpit?duzen=klasik');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  await gorunumAc(kokpit);
  const tasma = async () => { expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0); };
  const telefon = bilgi.project.name === 'g360';
  const kart = kokpit.locator('[data-kart="S1"]');
  const oklar = kokpit.locator('.tc-pyq-oklar [data-ok]');
  // Operasyonlar tablosu: geniş ekranda "Bağımlılık" sütunu, 900 px altında sütun yerine operasyon adının altında kısa yazı.
  const bagDenetle = async (): Promise<void> => {
    const bolum = kokpit.getByRole('region', { name: 'Emirler ve operasyonlar' });
    const hucre = (id: string) => bolum.locator(`[data-adim-satir="${id}"] td[data-ad="Bağımlılık"]`), kisa = (id: string) => bolum.locator(`[data-adim-satir="${id}"] .tc-pyq-bag-kisa`);
    await expect(bolum.locator('[data-adim-satir="S1.a1"]')).toBeVisible();
    if (bilgi.project.name === 'g1280') {
      await expect(hucre('S1.a1')).toHaveText('öncül yok');
      await expect(hucre('S1.a2')).toHaveText('1 Torna · bitince');
      await expect(hucre('S1.a3')).toHaveText('2 Freze · örtüşmeli (bitmeden başlayabilir)');
      await expect(kisa('S1.a2')).toBeHidden();
    } else {
      await expect(hucre('S1.a2')).toBeHidden();
      await expect(kisa('S1.a1')).toHaveCount(0);
      await expect(kisa('S1.a2')).toHaveText('1 Torna bitince');
      await expect(kisa('S1.a3')).toHaveText('2 Freze ile örtüşmeli');
      await expect(kisa('S1.a3')).toBeVisible();
    }
    await bolum.locator('[data-adim-satir="S1.a2"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/tmp/tmiv2-ekran/kart-3330-ops-${bilgi.project.name}.png`, fullPage: true });
  };

  if (telefon) {
    await kart.click();
    const liste = kokpit.locator('.tc-pyq-liste');
    await expect(liste.locator('button[data-yanan]')).toHaveCount(3);
    await expect(liste.locator('button[data-yanan]', { hasText: '1 Torna bitince' })).toHaveCount(1);
    await expect(liste.locator('button[data-yanan]', { hasText: '2 Freze ile örtüşmeli' })).toHaveCount(1);
    expect(await liste.locator('button[data-sonuk]').count()).toBeGreaterThan(0);
    await liste.locator('button[data-yanan]').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: '/tmp/tmiv2-ekran/kart-3330-g360.png', fullPage: true });
    await bagDenetle();
    await tasma();
    return;
  }

  // Kart açıkça seçilmeden tahta solmaz, ok yoktur.
  const tahta = kokpit.locator('.tc-pyq-tahta');
  await expect(tahta.locator('[data-sonuk]')).toHaveCount(0);
  await expect(oklar).toHaveCount(0);
  await kart.click();
  await expect(tahta.locator('.tc-pyq-is[data-yanan]')).toHaveCount(3);
  await expect(tahta.locator('.tc-pyq-is[data-sonuk]')).toHaveCount(2);
  // Soluk iş okunur: saydamlık yarının üstünde, yazısı mürekkep rengi.
  const soluk = tahta.locator('.tc-pyq-is[data-sonuk]').first();
  await expect.poll(() => soluk.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeGreaterThanOrEqual(0.5);
  // 3365: ok yalnız odaktaki işin (seçili ya da üstüne gelinen) önceki ve sonraki adımına çizilir; kart seçmek tek başına ok çizmez.
  await expect(oklar).toHaveCount(0);
  await tahta.locator('[data-is="S1.a2"]').click();
  await expect(oklar).toHaveCount(2);
  await expect(kokpit.locator('[data-ok="S1.a1>S1.a2"]')).toHaveAttribute('data-tur', 'b');
  await expect(kokpit.locator('[data-ok="S1.a2>S1.a3"]')).toHaveAttribute('data-tur', 'o');
  expect(await kokpit.locator('[data-ok="S1.a1>S1.a2"] path').first().evaluate((el) => getComputedStyle(el).strokeDasharray)).toBe('none');
  expect(await kokpit.locator('[data-ok="S1.a2>S1.a3"] path').first().evaluate((el) => getComputedStyle(el).strokeDasharray)).not.toBe('none');
  // Ok öncülden çıkar, ardılın sol kenarının ortasına girer (iş yerine oturduktan sonra ölçülür).
  const uclar = async (ok: string, kimden: string, kime: string) => {
    await expect.poll(async () => {
      const yol = await kokpit.locator(`[data-ok="${ok}"] path`).first().evaluate((el) => {
        const p = el as unknown as SVGPathElement, k = (p.ownerSVGElement as SVGSVGElement).getBoundingClientRect(), a = p.getPointAtLength(0), b = p.getPointAtLength(p.getTotalLength());
        return { bas: { x: a.x + k.left, y: a.y + k.top }, son: { x: b.x + k.left, y: b.y + k.top } };
      });
      const o = (await tahta.locator(`[data-is="${kimden}"]`).boundingBox())!, x = (await tahta.locator(`[data-is="${kime}"]`).boundingBox())!;
      return { giris: Math.abs(yol.son.x - x.x) <= 2 && Math.abs(yol.son.y - (x.y + x.height / 2)) <= 3, cikis: yol.bas.x >= o.x - 1 && yol.bas.x <= o.x + o.width + 1 && yol.bas.y >= o.y - 1 && yol.bas.y <= o.y + o.height + 1 };
    }, { timeout: 5000 }).toEqual({ giris: true, cikis: true });
  };
  await uclar('S1.a1>S1.a2', 'S1.a1', 'S1.a2');
  await uclar('S1.a2>S1.a3', 'S1.a2', 'S1.a3');
  // Oklar tıklamayı yutmaz: altındaki iş seçilebilir.
  expect(await kokpit.locator('.tc-pyq-oklar').evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
  await expect(kokpit.locator('[data-ok-aciklama]')).toHaveText(['Önceki adım bitince başlar', 'Örtüşmeli: önceki bitmeden başlayabilir']);
  await tahta.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `/tmp/tmiv2-ekran/kart-3330-${bilgi.project.name}.png`, fullPage: true });
  await bagDenetle();
  await tasma();

  // Esc, karta yeniden basma ve boş tahta alanı seçimi kaldırır.
  await page.keyboard.press('Escape');
  await expect(tahta.locator('[data-yanan]')).toHaveCount(0);
  await expect(tahta.locator('[data-sonuk]')).toHaveCount(0);
  // İmleç işin üstünde kaldıkça o işin okları durur; çekilince kalkar.
  await page.mouse.move(0, 0);
  await expect(oklar).toHaveCount(0);
  await kart.click();
  await expect(oklar).toHaveCount(0);
  // Oklar: seçili sipariş (Araçlar) kart seçilince siparişin bütün bağlarını çizer.
  await kokpit.getByRole('button', { name: 'Araçlar' }).click();
  await kokpit.getByRole('menuitemradio', { name: /Oklar: seçili sipariş/ }).click();
  await expect(oklar).toHaveCount(2);
  await kart.click();
  await expect(oklar).toHaveCount(0);
  await kart.click();
  await expect(oklar).toHaveCount(2);
  // Boş alan: T-01 satırının görünen sağ ucu (orada iş yok; kapalı saat taraması da boş alandır).
  await tahta.locator('[data-satir="M1"]').scrollIntoViewIfNeeded();
  const kutu = (await tahta.boundingBox())!, satir = (await tahta.locator('[data-satir="M1"]').boundingBox())!;
  await page.mouse.click(kutu.x + kutu.width - 30, satir.y + satir.height / 2);
  await expect(oklar).toHaveCount(0);
  await tasma();
});

test('Kokpit 3297-4: planlı operasyona basıp boş yere basarak taşıma; uygun tezgâhlar öne çıkar; telefonda yer listesi; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  const t = await taslakSunucusu(page);
  await page.route('**/api/plan/planlama-calismasi/is-tasi-onizlemesi?*', (r) => {
    const q = new URL(r.request().url()).searchParams;
    const id = q.get('isId') ?? '', S = Number(q.get('baslangic')), x = t.gorunum().ops[id];
    return json(r, { calismaSurumu: t.s.surum, gecerli: true, ileti: null, isler: x ? [{ isId: id, tezgah: q.get('tezgah'), S, C: S + (x.C - x.S), eskiTezgah: x.m, eskiS: x.S, tur: 'tasinan' }] : [] });
  });
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan/kokpit?duzen=klasik');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  await gorunumAc(kokpit);
  const tasma = async () => { expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0); };
  const telefon = bilgi.project.name === 'g360';

  await kokpit.getByRole('region', { name: 'Siparişler, sırasıyla' }).locator('[data-kart="S1"]').click();
  const bolum = kokpit.getByRole('region', { name: 'Emirler ve operasyonlar' });
  const freze = bolum.locator('[data-adim="S1.a2"]');
  await expect(bolum.locator('[data-adim-satir="S1.a2"]').getByRole('combobox', { name: 'Freze tezgâhı' })).toHaveValue('M2');
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
  await expect(bolum.locator('[data-adim-satir="S1.a2"]').getByRole('combobox', { name: 'Freze tezgâhı' })).toHaveValue('M3');
  // Liste taşımadan sonra yeni yerle kalır; seçili operasyona yeniden basmak seçimi bırakır ve liste kalkar. Ayrıntı paneli yoktur (3304 a).
  await expect(kokpit.locator('.tc-pyq-ayrinti')).toHaveCount(0);
  await expect(yerler).toBeVisible();
  await freze.click();
  await expect(yerler).toBeHidden();
  await expect(kokpit.getByRole('complementary')).toHaveCount(0);
  await tasma();
  expect(ag.hatalar).toEqual([]);
});

// Kart 3365-2: Ctrl ile çoklu seçim ve birlikte kaydırma, Geri sonrası İleri (Ctrl+Y), sürekli yakınlaştırma ve Seçileni sığdır. Telefonda tahta
// ve ölçek yoktur (liste).
test('Kokpit 3365-2: çoklu seçim birlikte kayar; Geri sonra İleri; yakınlaştırma sürgüsü ve Seçileni sığdır; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  const t = await taslakSunucusu(page);
  await page.route('**/api/plan/planlama-calismasi/is-tasi-onizlemesi?*', (r) => {
    const q = new URL(r.request().url()).searchParams;
    const id = q.get('isId') ?? '', S = Number(q.get('baslangic')), x = t.gorunum().ops[id];
    return json(r, { calismaSurumu: t.s.surum, gecerli: true, ileti: null, isler: x ? [{ isId: id, tezgah: q.get('tezgah'), S, C: S + (x.C - x.S), eskiTezgah: x.m, eskiS: x.S, tur: 'tasinan' }] : [] });
  });
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan/kokpit?duzen=klasik');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  await gorunumAc(kokpit);
  const tasma = async () => { expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0); };
  if (bilgi.project.name === 'g360') {
    await expect(kokpit.getByRole('slider', { name: 'Yakınlaştırma' })).toBeHidden();
    await tasma();
    expect(ag.hatalar).toEqual([]);
    return;
  }
  const tahta = kokpit.locator('.tc-pyq-tahta');
  await tahta.evaluate((el) => { el.scrollTo({ left: 0 }); });
  // Çoklu seçim: S2.a1 seçilir, Ctrl ile S3.a1 eklenir; → ikisini yarım saat kaydırır (her biri ayrı taşıma, tezgâhı aynı).
  await tahta.locator('[data-is="S2.a1"]').click();
  await tahta.locator('[data-is="S3.a1"]').click({ modifiers: ['Control'] });
  await expect(tahta.locator('[data-coklu]')).toHaveCount(2);
  await expect(kokpit.getByText('2 iş seçili · birlikte kayar')).toBeVisible();
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3365-2-coklu-${bilgi.project.name}.png` });
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => t.tasinan().length).toBe(2);
  expect(t.tasinan().map((k) => [k['isId'], k['tezgah'], k['baslangic']]).sort()).toEqual([['S2.a1', 'M2', 32.5], ['S3.a1', 'M1', 32.5]]);
  await expect.poll(() => t.s.satirlar.filter((x) => x.komut.tur !== 'diz').length).toBe(2);
  // Geri sonuncuyu alır; İleri görünür ve Ctrl+Y onu yeniden yazar, sonra kalkar.
  const gi = kokpit.getByRole('group', { name: 'Geri ve İleri' });
  await expect(gi.getByRole('button', { name: /Geri/ })).toBeEnabled();
  await gi.getByRole('button', { name: /Geri/ }).click();
  await expect(gi.getByRole('button', { name: /İleri/ })).toBeEnabled();
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3365-2-ileri-${bilgi.project.name}.png` });
  await page.keyboard.press('Control+y');
  await expect.poll(() => t.tasinan().length).toBe(3);
  await expect(gi.getByRole('button', { name: /İleri/ })).toHaveCount(0);
  await expect.poll(() => t.s.satirlar.filter((x) => x.komut.tur !== 'diz').length).toBe(2);
  // Düz tıklama kümeyi bırakır.
  await page.keyboard.press('Escape');
  await expect(tahta.locator('[data-coklu]')).toHaveCount(0);
  // Yakınlaştırma: sürgü en yakına Gün'ü basar; Seçileni sığdır seçili işi genişletir.
  const olcek = kokpit.getByRole('group', { name: 'Ölçek' });
  const surgu = olcek.getByRole('slider', { name: 'Yakınlaştırma' });
  await surgu.fill('100');
  await expect(olcek.getByRole('button', { name: 'Gün', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await olcek.getByRole('button', { name: '3 gün', exact: true }).click();
  const en = async () => (await tahta.locator('[data-is="S1.a1"]').boundingBox())?.width ?? 0;
  const once = await en();
  await tahta.locator('[data-is="S1.a1"]').click();
  await olcek.getByRole('button', { name: 'Seçileni sığdır' }).click();
  await expect.poll(en).toBeGreaterThan(once * 2);
  // İş tahtanın görünen genişliğinin içindedir (yatayda).
  await expect.poll(async () => {
    const k = await tahta.boundingBox(), b = await tahta.locator('[data-is="S1.a1"]').boundingBox();
    return k && b ? b.x >= k.x && b.x + b.width <= k.x + k.width : false;
  }).toBe(true);
  await tahta.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3365-2-sigdir-${bilgi.project.name}.png` });
  await tasma();
  expect(ag.hatalar).toEqual([]);
});

// Kart 3330 a, dilim 3c: fason adımın satırında açık satın alma siparişindeki firma tarihi ve sipariş numarası yazar. Burada S1'in ikinci
// adımı fasondur; tarih ve numara kaynağın gerçek cevabına eklenen uydurma emir okumasındadır.
test('Kokpit 3330-3c: fason adımın satırında firma tarihi ve sipariş numarası; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  // Plan firma tarihine göre dizilmiştir: fason adım 24.10 08:00'de döner (eksen 19.10 00:00'dan saat: 128).
  const ops = { ...ILK, 'S1.a2': { job: 'S1', m: '@F1', S: 57, C: 128, fas: 1 } } as unknown as Record<string, Is>;
  const c = calisma(ops, {});
  c.D.urunler = c.D.urunler.map((u) => (u.id === 'U1' ? { ...u, rota: [u.rota[0]!, { k: 'a2', ad: 'Kaplama', bag: [['a1', 'FS']], fason: 'F1', tezgahlar: [] }] } : u)) as typeof c.D.urunler;
  (c.D as Record<string, unknown>)['fasoncular'] = [{ id: 'F1', ad: 'Deneme Kaplama', kapasite: 999, sureGun: 1, cikisGunleri: ['pzt', 'sal', 'car', 'per', 'cum', 'cmt'], cikisSaat: 16 }];
  await taslakSunucusu(page, (d) => ({ ...c, w: d.w, locks: d.locks, plan: plan(ops) }));
  await page.route('**/api/plan/planlama-kaynagi', async (r) => {
    const cevap = await r.fetch();
    const yer = { fasonId: 'F1', terminGun: 2, stationId: null, setup: null, cycle: null, fasonSiparis: { tarih: '2026-10-24', siparisNo: 'ORN-SA-7' } };
    await r.fulfill({ response: cevap, json: { ...(await cevap.json()) as object, emirler: { orders: [], opStatus: {}, opProg: {}, opYer: { 'S1|root|2': yer } } } });
  });
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan/kokpit?duzen=klasik');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  await gorunumAc(kokpit);
  await kokpit.locator('[data-kart="S1"]').click();
  const not = kokpit.locator('[data-adim-satir="S1.a2"] small[data-firma]');
  await expect(not).toHaveText('Firma tarihi 24.10 · sipariş ORN-SA-7');
  await not.scrollIntoViewIfNeeded();
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  await expect(kokpit.locator('[data-adim-satir="S1.a2"] td[data-ad="Bitiş"]')).toContainText('24.10');
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3330-3c-firma-${bilgi.project.name}.png` });
  expect(ag.hatalar).toEqual([]);
});

// Kart 3369 a: emrin malzemesi rotadan önceki satırdır. Pay plan kaydından (uydurma), sipariş no ve tedarikçi satın alma ekinden gelir.
test('Kokpit 3369: malzeme satırı adımlardan önce; şirket, termin, stoktan ve siparişten miktar; geç emrin nedeni malzeme; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  // S1'in tornası malzemeyi bekleyerek 20.10 08:00'de (eksen saati 32) başlar; S3'ün malzemesinin 40 adedi için sipariş yok.
  const ops = { ...ILK, 'S1.a1': { job: 'S1', m: 'M1', S: 32, C: 40, why: { t: 'malzeme' } }, 'S3.a1': { job: 'S3', m: 'M1', S: 8, C: 14 } } as unknown as Record<string, Is>;
  const mal = {
    S1: [{ kod: 'H1', adim: 'a1', need: 40, t: 32, stok: 15, eksik: 0, pay: [{ tur: 'sa', kim: 7001, q: 25, gelis: 32, tb: 0 }] }],
    S3: [{ kod: 'H2', adim: 'a1', need: 60, t: 7, stok: 20, eksik: 0, pay: [{ tur: 'yok', q: 40, gelis: 7, tb: 1 }] }],
    S2: [{ kod: 'H1', adim: 'a1', need: 16, t: 7, stok: 16, eksik: 0, pay: [] }],
  };
  const c = calisma(ops, {});
  (c.D as Record<string, unknown>)['malzemeler'] = [{ kod: 'H1', ad: 'ORN-Çubuk Ø40', birim: 'kg', stok: 31 }, { kod: 'H2', ad: 'ORN-Levha 12 mm', birim: 'adet', stok: 20 }];
  await taslakSunucusu(page, (d) => ({ ...c, w: d.w, locks: d.locks, plan: { ...plan(ops), mal } }));
  await page.route('**/api/plan/satin-alma-eki', (r) => json(r, {
    acikSiparisler: [{ kod: 'H1', miktar: 25, tarih: '2026-10-20', siparisNo: 'ORN-SA-7', satir: 7001, tedarikci: 'ORN-Tedarikçi A' }], tedarikTerminleri: [],
  }));
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan/kokpit?duzen=klasik');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  await gorunumAc(kokpit);
  await kokpit.locator('[data-kart="S1"]').click();
  const emir = kokpit.locator('[data-emir="S1"]');
  const satir = emir.locator('tr[data-malzeme="H1"]');
  await expect(satir).toHaveAttribute('data-durum', 'geliyor');
  await expect(satir.locator('td[data-ad="Operasyon"]')).toContainText('ORN-Çubuk Ø40 · 40 kg gerekli');
  await expect(satir.locator('td[data-ad="Şirket"]')).toHaveText('ORN-Tedarikçi Asipariş ORN-SA-7');
  await expect(satir.locator('td[data-ad="Termin"]')).toContainText('20.10');
  await expect(satir.locator('td[data-ad="Termin"]')).toContainText('Torna bu tarihten önce başlamaz');
  await expect(satir.locator('td[data-ad="Adet"]')).toHaveText('15 kg stoktan25 kg siparişten');
  // Malzeme satırı tablonun ilk satırıdır; adım satırları ondan sonra gelir.
  await expect(emir.locator('tbody > tr').first()).toHaveAttribute('data-malzeme', 'H1');
  await expect(emir.locator('[data-emir-neden="malzeme"]')).toContainText('1. adım (Torna) malzemeyi bekliyor');
  await satir.scrollIntoViewIfNeeded();
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3369-malzeme-geliyor-${bilgi.project.name}.png` });
  // 3369-2: tahtada "Malzeme" satırı; gelişi beklenen malzeme şimdiden geliş anına çubuktur, eksik ve stoktaki çubuk olmaz. Çubuk emri seçer.
  const cubuk = kokpit.locator('.tc-pyq-tahta [data-malzeme-cubugu]');
  if (await kokpit.locator('.tc-pyq-tahta').isVisible()) {
    await expect(kokpit.locator('.tc-pyq-tahta [data-malzeme-satiri] .tc-pyq-bas')).toHaveText('Malzeme1 emir bekliyor');
    await expect(cubuk).toHaveCount(1);
    await expect(cubuk).toHaveAttribute('data-malzeme-cubugu', 'S1');
    await expect(cubuk).toContainText('ORN-Tedarikçi A');
    const kutu = await cubuk.boundingBox(), is = await kokpit.locator('.tc-pyq-tahta [data-is="S1.a1"]').boundingBox();
    expect(kutu && is && Math.abs(kutu.x + kutu.width - is.x)).toBeLessThanOrEqual(2);
    await cubuk.scrollIntoViewIfNeeded();
    // Satır öteki satırların başlığını örtmez; görüntü kaydırma bittikten sonra alınır.
    await expect(kokpit.locator('.tc-pyq-tahta [data-satir="M1"] .tc-pyq-bas')).toBeVisible();
    await expect(kokpit.locator('[data-aciklama="malzeme"]')).toHaveText('Malzeme bekleniyor');
    await page.waitForTimeout(800);
    await page.screenshot({ path: `/tmp/tmiv2-ekran/3369-tahta-cubugu-${bilgi.project.name}.png` });
  }

  await kokpit.locator('[data-kart="S3"]').click();
  const eksik = kokpit.locator('[data-emir="S3"] tr[data-malzeme="H2"]');
  await expect(eksik).toHaveAttribute('data-durum', 'eksik');
  await expect(eksik.locator('td[data-ad="Şirket"]')).toHaveText('sipariş yok');
  await expect(eksik.locator('td[data-ad="Adet"]')).toHaveText('20 adet stoktan40 adet eksik');
  await expect(eksik.locator('td[data-ad="Durum"]')).toHaveText('Eksik');
  await eksik.scrollIntoViewIfNeeded();
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3369-malzeme-eksik-${bilgi.project.name}.png` });

  await kokpit.locator('[data-kart="S2"]').click();
  const stokta = kokpit.locator('[data-emir="S2"] tr[data-malzeme="H1"]');
  await expect(stokta.locator('td[data-ad="Termin"]')).toHaveText('stokta');
  await expect(stokta.locator('td[data-ad="Adet"]')).toHaveText('16 kg stoktan');
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
  await ac('/plan/kokpit?duzen=klasik');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  await gorunumAc(kokpit);
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
  // Plansız emrin siparişi kendi kartındadır; karta basınca seçilir.
  await ara.fill('');
  await expect(a).toHaveAttribute('aria-pressed', 'true');
  await serit.locator('[data-kart="sp:902"]').click();
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
  await ac('/plan/kokpit?duzen=klasik');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  await gorunumAc(kokpit);
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
  const satir = kokpit.getByRole('region', { name: 'Emirler', exact: true }).locator('tbody tr');
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
  await ac('/plan/kokpit?duzen=klasik');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  await gorunumAc(kokpit);
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

// 3282 1b, 3561: Ayarlar artık Planlama ayarları sayfasıdır; değişiklik önce etkisiyle gösterilir (değerlendirme ucu, plan-uygula),
// Uygula planı taslağa alır. Kokpit'in Araçlar menüsündeki Ayarlar bu sayfaya gider. Sunucu cevapları uydurmadır.
test('Kokpit 3282 1b: Araçlar > Ayarlar sayfaya gider; dondurma değişir, etkisi önce ve sonra görünür, Uygula; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  const t = await taslakSunucusu(page);
  await page.route('**/api/plan/motor-ayarlari', (r) => json(r, {
    guncel: { surumId: null, degerler: { amac: 'sirali', eksikStok: 'varsay', kural: 'atcs', ogrenme: 'kapali', acilPay: 0.05, bolmeKip: 'otomatik', bolmeMaks: 3 }, yazan: null, zaman: null }, taslak: null,
  }));
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan?duzen=klasik');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  await gorunumAc(kokpit);
  await arac(kokpit, 'Ayarlar');
  await expect(page).toHaveURL(/\/plan\/ayarlar/);
  await page.goto('/plan/ayarlar?bolum=zaman');
  const sayfa = page.locator('.tc-pya');
  await expect(sayfa).toBeVisible({ timeout: 20_000 });
  const dondurma = sayfa.getByLabel(/Dondurulmuş bölge/);
  await dondurma.fill('8');
  await dondurma.blur();
  await expect(sayfa.getByText('Dondurulmuş bölge: 4 sa → 8 sa')).toBeVisible();
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3282-ayarlar-${bilgi.project.name}.png` });
  await sayfa.getByRole('button', { name: 'Etkisini gör' }).click();
  const etki = sayfa.getByRole('region', { name: 'Ayarın etkisi' });
  await expect(etki.getByText('1 → 0')).toBeVisible({ timeout: 10_000 });
  // Ayar taslağa yazılır, etkisi taslağın görünümünde hesaplanır; ortak çalışma değişmez.
  expect(t.s.komutlar).toEqual([{ tur: 'ayar', ayar: { w: { dondurma: 8 }, param: {}, ac: [], kapat: [] }, ayrinti: expect.any(String) as unknown }]);
  expect(t.s.degerlendirme).toEqual([{ taslakSurumu: 1, istek: { tur: 'plan-uygula', isler: ['*'] } }]);
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  for (const k of await page.getByRole('button', { name: 'Bildirimi kapat' }).all()) await k.click();
  await etki.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3282-ayar-etki-${bilgi.project.name}.png` });
  await etki.getByRole('button', { name: 'Uygula' }).click();
  await expect(etki).toHaveCount(0);
  // Uygula hesaplanan planı taslağa yazar.
  expect(t.s.satirlar.map((x) => x.komut.tur)).toEqual(['ayar', 'diz']);
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  expect(ag.hatalar).toEqual([]);
});

// 3561 Z4: çalışma açıkken Planlama ayarları: Kontrol (farklı satırlı), Zaman (yapışık çubuk), Kısıtlar, Öncelik ve bedel; her genişlikte taşma yok.
test('Planlama ayarları 3561: çalışma açıkken Kontrol, Zaman çubuğu, Kısıtlar ve Öncelik görünür; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  await taslakSunucusu(page);
  await page.route('**/api/plan/motor-ayarlari', (r) => json(r, {
    guncel: { surumId: null, degerler: { amac: 'sirali', eksikStok: 'varsay', kural: 'atcs', ogrenme: 'kapali', acilPay: 0.05, bolmeKip: 'otomatik', bolmeMaks: 3 }, yazan: null, zaman: null }, taslak: null,
  }));
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan/ayarlar?bolum=zaman');
  const sayfa = page.locator('.tc-pya');
  await expect(sayfa).toBeVisible({ timeout: 20_000 });
  const ad = bilgi.project.name;
  const basla = page.getByRole('button', { name: 'Başlayalım' });
  if (await basla.isVisible()) await basla.click();
  const cek = async (n: string): Promise<void> => {
    expect((await tasmaOlc(page)).belge, n).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `/tmp/tmiv2-ekran/3561-calisma-${n}-${ad}.png` });
  };
  const dondurma = sayfa.getByLabel(/Dondurulmuş bölge/);
  await dondurma.fill('8');
  await dondurma.blur();
  await expect(sayfa.getByText('Dondurulmuş bölge: 4 sa → 8 sa')).toBeVisible();
  await cek('zaman-cubuk');
  const gec = async (adi: RegExp, bolum: string): Promise<void> => {
    if (!(await page.getByRole('navigation', { name: 'Ayar grupları' }).isVisible())) await page.getByRole('link', { name: /Gruplar/ }).first().click();
    await page.getByRole('navigation', { name: 'Ayar grupları' }).getByRole('link', { name: adi }).first().click();
    await expect(page).toHaveURL(new RegExp(`bolum=${bolum}`));
  };
  await gec(/Kontrol/, 'kontrol');
  await expect(sayfa.getByRole('table')).toBeVisible();
  await expect(sayfa.getByText('Dondurulmuş bölge').first()).toBeVisible();
  await cek('kontrol');
  await gec(/Kısıtlar/, 'kisitlar');
  await expect(sayfa.getByRole('heading', { name: 'Açılıp kapanan kısıtlar' })).toBeVisible();
  await cek('kisitlar');
  await gec(/Öncelik ve bedel/, 'oncelik');
  await expect(sayfa.getByRole('heading', { name: /Öncelik ve bedel/ })).toBeVisible();
  await cek('oncelik');
});

// Kart 3304 a: planın yönü yalnız üst şeritteki Yön düğmesindedir (her genişlikte); emrin yönü emrin satırında tek satırdır.
test('Kokpit 3282 1c: plan yönü üst şeritte, emrin yönü emir satırında; etkisini gösterir, Uygula; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  const t = await taslakSunucusu(page);
  await page.route('**/api/plan/motor-ayarlari', (r) => json(r, {
    guncel: { surumId: null, degerler: { amac: 'sirali', eksikStok: 'varsay', kural: 'atcs', ogrenme: 'kapali', acilPay: 0.05, bolmeKip: 'otomatik', bolmeMaks: 3 }, yazan: null, zaman: null }, taslak: null,
  }));
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan?duzen=klasik');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  await gorunumAc(kokpit);
  // Düğme geçerli yönü yazar, menüde iki yön açıklamasıyla durur; öteki yön seçilince yalnız yönün etkisini taşıyan küçük panel açılır.
  const ustYon = kokpit.getByRole('button', { name: 'Plan', exact: true });
  const yonMenusu = kokpit.getByRole('menu', { name: 'Plan' });
  const panel = kokpit.getByRole('complementary', { name: 'Aparat, takım ve ölçü aleti kısıtı' });
  const yonEtkisi = panel.getByRole('region', { name: 'Ayarın etkisi' });
  const taslakCubugu = kokpit.getByRole('region', { name: 'Değişiklikleriniz' });
  await expect(kokpit.getByRole('button', { name: /^Tüm plan:/ })).toHaveCount(0);
  await ustYon.click();
  await yonMenusu.getByRole('button', { name: 'Diğer seçenekler' }).click();
  await expect(yonMenusu.getByRole('menuitemradio', { name: /^İleriye/ })).toHaveAttribute('aria-checked', 'true');
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
  await yonMenusu.getByRole('menuitemradio', { name: /^İleriye/ }).click();
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

  // Emrin yönü emrin satırında tek satırdır; Değiştir seçenekleri açar, seçim etkisiyle uygulanır.
  await kokpit.locator('[data-kart="S4"]').click();
  const bolum = kokpit.getByRole('region', { name: 'Emirler ve operasyonlar' });
  await expect(bolum.getByText('Bu emir: tüm planla aynı (İleriye)')).toBeVisible();
  await bolum.getByRole('button', { name: 'S4 yönünü değiştir' }).click();
  const yon = bolum.getByRole('group', { name: 'Bu emrin yönü' });
  await expect(yon.getByRole('button', { name: 'Tüm planla aynı (İleriye)' })).toHaveAttribute('aria-pressed', 'true');
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
  await expect(bolum.getByText('Bu emir: Teslimden geriye (tüm plan: İleriye)')).toBeVisible();
  await expect(bolum.getByText('Plandan ayrı')).toBeVisible();
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  expect(ag.hatalar).toEqual([]);
});

test('Kokpit 3282 2a-1: üst şeritteki Duruş ve mesai; tahtada çubuk; arıza taslağa yazılır, etkisi görünür, Uygula; kendiliğinden gelen bakım silinmez; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  const t = await taslakSunucusu(page);
  t.s.ortak = { ...t.s.ortak, down: [{ m: 'M2', from: 30, to: 34, neden: 'bakım', oto: 1, bakim: 'ORN-b1' }] };
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan?duzen=klasik');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  await gorunumAc(kokpit);
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
  await expect(kokpit.getByRole('region', { name: 'Değişiklikleriniz' })).toBeVisible();
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3282-2a1-kapasite-sonra-${bilgi.project.name}.png` });
  expect(ag.hatalar).toEqual([]);
});

// 3335 a, tezgâhta sorun bildir: tahtada tezgâh adına (telefonda listedeki tezgâh başlığının düğmesine) basınca Duruş ve mesai o tezgâhla
// açılır; arıza aynı taslak komutuyla yazılır ve etkisi görünür.
test('Kokpit 3335-3a: tezgâh adından sorun bildir; Duruş ve mesai o tezgâhla açılır, arıza taslağa yazılır, etkisi görünür; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  const t = await taslakSunucusu(page);
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan?duzen=klasik');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  await gorunumAc(kokpit);
  const telefon = bilgi.project.name === 'g360';
  const dugme = kokpit.locator(`${telefon ? '.tc-pyq-liste' : '.tc-pyq-satir'} [data-sorun-bildir="M2"]`);
  await expect(dugme).toHaveAccessibleName('F-01 için sorun bildir');
  const kutu = await dugme.boundingBox();
  expect(kutu?.height ?? 0).toBeGreaterThanOrEqual(telefon ? 44 : 24);
  // Karşılama penceresi görüntüyü örtmesin.
  const karsilama = page.getByRole('button', { name: 'Başlayalım' });
  if (await karsilama.isVisible().catch(() => false)) await karsilama.click();
  await dugme.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3335-3a-dugme-${bilgi.project.name}.png` });
  await dugme.click();
  const panel = kokpit.getByRole('complementary', { name: 'Duruş ve mesai' });
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel('Tezgâh')).toHaveValue('M2');
  await expect(panel.getByLabel('Tür')).toBeFocused();
  // Bölümün başı görünür kalır: hangi tezgâh için açıldığı dar ekranda da okunur.
  await expect(panel.getByLabel('Tezgâh')).toBeInViewport({ ratio: 1 });
  await expect(panel.getByLabel('Tür')).toBeInViewport({ ratio: 1 });
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3335-3a-form-${bilgi.project.name}.png` });
  await panel.getByLabel('Başlangıç').fill('2026-10-20T08:00');
  await panel.getByLabel('Bitiş').fill('2026-10-20T16:00');
  await panel.getByRole('button', { name: 'Duruş ekle, etkisini gör' }).click();
  await expect(panel.getByRole('region', { name: 'Duruşun etkisi' })).toBeVisible({ timeout: 10_000 });
  expect(t.s.komutlar).toEqual([{ tur: 'durus', tezgah: 'M2', bas: 32, bit: 40, neden: 'arıza' }]);
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3335-3a-etki-${bilgi.project.name}.png` });
  expect(ag.hatalar).toEqual([]);
});

// 3335 a, adıma sorun bildir (3b): operasyon satırındaki düğme paneli o adımla açar; uzama taslağa "adim-uzadi" komutuyla yazılır, etkisi
// görünür, Uygula'dan sonra satırın bitişinde yazar; "Uzamayı kaldır" silme komutunu yazar.
test('Kokpit 3335-3b: operasyon satırından adıma sorun bildir; uzama taslağa yazılır, etkisi görünür, Uygula; satırda yazar; kaldırılır; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  const t = await taslakSunucusu(page);
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan?duzen=klasik');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  await gorunumAc(kokpit);
  const karsilama = page.getByRole('button', { name: 'Başlayalım' });
  if (await karsilama.isVisible().catch(() => false)) await karsilama.click();
  await kokpit.locator('[data-kart="S1"]').click();
  const satir = kokpit.locator('[data-adim-satir="S1.a1"]');
  const dugme = satir.locator('[data-adim-sorun="S1.a1"]');
  await expect(dugme).toHaveAccessibleName('Torna için sorun bildir');
  const kutu = await dugme.boundingBox();
  expect(kutu?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(kutu?.width ?? 0).toBeGreaterThanOrEqual(44);
  // Kart düzeninde (360, 768) düğme yazısıyla durur; geniş tabloda yalnız simge.
  await expect(dugme.locator("span")).toBeVisible({ visible: bilgi.project.name !== "g1280" });
  await dugme.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3335-3b-dugme-${bilgi.project.name}.png` });
  await dugme.click();
  const panel = kokpit.getByRole('complementary', { name: 'Adıma sorun bildir' });
  await expect(panel).toBeVisible();
  const alan = panel.getByLabel('Kaç saat uzadı');
  await expect(alan).toBeFocused();
  await expect(alan).toBeInViewport({ ratio: 1 });
  await expect(panel.locator('dl')).toContainText('Torna');
  await expect(panel.locator('dl')).toContainText('T-01');
  await alan.fill('0,1');
  await panel.getByRole('button', { name: 'Etkisini gör' }).click();
  await expect(panel.getByRole('alert')).toHaveText('Uzamayı 0,25 ile 240 saat arasında, çeyrek saat adımıyla girin.');
  expect(t.s.komutlar).toEqual([]);
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3335-3b-form-${bilgi.project.name}.png` });
  await alan.fill('2,5');
  await panel.getByRole('button', { name: 'Etkisini gör' }).click();
  const etki = panel.getByRole('region', { name: 'Uzamanın etkisi' });
  await expect(etki).toBeVisible({ timeout: 10_000 });
  expect(t.s.komutlar).toEqual([{ tur: 'adim-uzadi', isId: 'S1.a1', ekSaat: 2.5 }]);
  // Uzama gecikmeyi azaltmaz: etki kötüleşme tonundadır.
  await expect(etki.locator('dd[data-yon="kotu"]').first()).toBeVisible();
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3335-3b-etki-${bilgi.project.name}.png` });
  await etki.getByRole('button', { name: 'Uygula' }).click();
  await expect(etki).toHaveCount(0);
  await expect(satir.locator('[data-adim-ek]')).toHaveText('uzadı +2,5 sa');
  await expect(panel.locator('[data-adim-ek]')).toHaveText('+2,5 sa');
  // Plandaki bitiş uzamayı içerir: 16:00 + 2,5 saat.
  await expect(panel.locator('dl')).toContainText('19.10 Pzt 18:30');
  await expect(satir.locator('td[data-ad="Bitiş"]')).toContainText('19.10 Pzt 18:30');
  await expect(panel.getByLabel('Toplam kaç saat uzadı')).toBeVisible();
  await expect(kokpit.getByRole('region', { name: 'Değişiklikleriniz' })).toBeVisible();
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3335-3b-sonra-${bilgi.project.name}.png` });
  await panel.getByRole('button', { name: 'Uzamayı kaldır' }).click();
  await expect(panel.getByRole('region', { name: 'Uzamanın etkisi' })).toBeVisible({ timeout: 10_000 });
  expect(t.s.komutlar.at(-1)).toEqual({ tur: 'adim-uzadi-sil', isId: 'S1.a1' });
  expect(ag.hatalar).toEqual([]);
});

// 3335 a, adıma sorun bildir (3c): aynı panelde "Malzeme yok" seçilir, geliş tarihi ve saati girilir; taslağa "adim-bekler" komutuyla
// yazılır, etkisi görünür, Uygula'dan sonra satırın başlangıcında yazar; "Bildirimi kaldır" silme komutunu yazar.
test('Kokpit 3335-3c: adıma malzeme yok bildirilir; bekleme taslağa yazılır, etkisi görünür, Uygula; satırda yazar; kaldırılır; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  const t = await taslakSunucusu(page);
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan?duzen=klasik');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  await gorunumAc(kokpit);
  const karsilama = page.getByRole('button', { name: 'Başlayalım' });
  if (await karsilama.isVisible().catch(() => false)) await karsilama.click();
  await kokpit.locator('[data-kart="S1"]').click();
  const satir = kokpit.locator('[data-adim-satir="S1.a1"]');
  await satir.locator('[data-adim-sorun="S1.a1"]').click();
  const panel = kokpit.getByRole('complementary', { name: 'Adıma sorun bildir' });
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel('Sorun', { exact: true }).locator('option')).toHaveText(['Adım uzadı', 'Malzeme yok', 'Kişi yok']);
  await panel.getByLabel('Sorun', { exact: true }).selectOption('kisi');
  await expect(panel.getByLabel('Ne zamana kadar')).toBeVisible();
  await panel.getByLabel('Sorun', { exact: true }).selectOption('malzeme');
  const alan = panel.getByLabel('Malzeme ne zaman gelir');
  await expect(alan).toBeInViewport({ ratio: 1 });
  await alan.fill('2026-10-18T10:00');
  await panel.getByRole('button', { name: 'Etkisini gör' }).click();
  await expect(panel.getByRole('alert')).toHaveText('Şimdiden sonraki bir tarih ve saat girin.');
  expect(t.s.komutlar).toEqual([]);
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3335-3c-form-${bilgi.project.name}.png` });
  await alan.fill('2026-10-21T08:00');
  await panel.getByRole('button', { name: 'Etkisini gör' }).click();
  const etki = panel.getByRole('region', { name: 'Beklemenin etkisi' });
  await expect(etki).toBeVisible({ timeout: 10_000 });
  expect(t.s.komutlar).toEqual([{ tur: 'adim-bekler', isId: 'S1.a1', kadar: 56, neden: 'malzeme' }]);
  // Bekleme gecikmeyi azaltmaz: etki kötüleşme tonundadır.
  await expect(etki.locator('dd[data-yon="kotu"]').first()).toBeVisible();
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3335-3c-etki-${bilgi.project.name}.png` });
  await etki.getByRole('button', { name: 'Uygula' }).click();
  await expect(etki).toHaveCount(0);
  await expect(satir.locator('[data-adim-bekle]')).toHaveText("bekliyor: malzeme yok, 21.10 Çar 08:00'e kadar");
  await expect(panel.locator('[data-adim-bekle]')).toHaveText("malzeme yok, 21.10 Çar 08:00'e kadar");
  await expect(satir.locator('[data-adim-bekle]')).toBeVisible();
  // Adım beklemeden sonra başlar (21.10 08:00), ardılı o bitince (21.10 16:00).
  await expect(satir.locator('td[data-ad="Bitiş"]')).toContainText('21.10 Çar 16:00');
  await expect(kokpit.locator('[data-adim-satir="S1.a2"] td[data-ad="Bitiş"]')).toContainText('22.10 Per 00:00');
  await expect(kokpit.getByRole('region', { name: 'Değişiklikleriniz' })).toBeVisible();
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `/tmp/tmiv2-ekran/3335-3c-sonra-${bilgi.project.name}.png` });
  await panel.getByRole('button', { name: 'Bildirimi kaldır' }).click();
  await expect(panel.getByRole('region', { name: 'Beklemenin etkisi' })).toBeVisible({ timeout: 10_000 });
  expect(t.s.komutlar.at(-1)).toEqual({ tur: 'adim-bekler-sil', isId: 'S1.a1' });
  expect(ag.hatalar).toEqual([]);
});

// 3282 2a-2: ek mesai operatörle. Kişiler uydurmadır; Deneme gündüz kendi vardiyası 1 (08:00–16:00), cumartesi de çalışır.
test('Kokpit 3282 2a-2: ek mesai operatörle taslağa yazılır, etkisi görünür, Uygula; kendi vardiyasıyla kesişen operatör listede yok; tezgâhta işaret; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  const t = await taslakSunucusu(page, (d) => {
    const x = calismaKur(d);
    return { ...x, D: { ...x.D, personel: [{ id: '7', ad: 'Deneme gündüz', vardiya: '1', gruplar: [], makineler: ['M2'] }, { id: '8', ad: 'Deneme gece', vardiya: '2', gruplar: [], makineler: ['M2'] }] } };
  });
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan?duzen=klasik');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  await gorunumAc(kokpit);
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

// Araçlar menüsü düğmenin altında tam görünür: düğme şeridin solunda olsa da (şerit ikinci satıra indiğinde) menü sola taşıp kesilmez.
test('Kokpit Araçlar menüsü: bütün maddeler ekranın içinde görünür, sola ve sağa taşmaz', async ({ page, ac }, bilgi) => {
  await taslakSunucusu(page, (d) => ({ ...calisma(ILK, {}), w: d.w, locks: d.locks, plan: plan(ILK) }));
  await ac('/plan/kokpit?duzen=klasik');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  await gorunumAc(kokpit);
  const menu = kokpit.getByRole('menu', { name: 'Araçlar' });
  const icinde = async (): Promise<void> => {
    await kokpit.getByRole('button', { name: 'Araçlar' }).click();
    await expect(menu).toBeVisible();
    const kok = (await kokpit.boundingBox())!, genislik = page.viewportSize()!.width;
    for (const b of [menu, ...await menu.getByRole('menuitem').all(), ...await menu.getByRole('menuitemradio').all()]) {
      const k = (await b.boundingBox())!;
      expect(k.x).toBeGreaterThanOrEqual(Math.max(0, kok.x) - 1);
      expect(k.x + k.width).toBeLessThanOrEqual(genislik + 1);
    }
  };
  await icinde();
  if (bilgi.project.name !== 'g1280') return;
  // Ara genişliklerde Araçlar düğmesi satırın soluna yaklaşır ya da ikinci satırın başına iner; hangi genişlikte olacağı araç satırının
  // içeriğine bağlıdır, bu yüzden aralık taranır. Düğme sol kenardaysa menü onunla hizalanır.
  for (const genislik of [1100, 1050, 1000, 950, 900, 850]) {
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: genislik, height: 900 });
    await icinde();
    const kok = (await kokpit.locator('.tc-pyq-ust').boundingBox())!, dugme = (await kokpit.getByRole('button', { name: 'Araçlar' }).boundingBox())!, m = (await menu.boundingBox())!;
    if (dugme.x - kok.x <= 1) expect(Math.abs(m.x - dugme.x)).toBeLessThanOrEqual(1);
  }
  await page.screenshot({ path: '/tmp/tmiv2-ekran/araclar-menu-g1100.png' });
});

// Kart 3414: planlama yolu. Kişi hangi adımda olduğunu ve yaptığının sonucunu cümleyle görür: plansız siparişte "Sistem önersin", plana
// alınınca bitiş ve termin, geç siparişte motorun kaydındaki neden ve sonucu yazılı seçenekler, taslak varken "Onaya geç".
test('Kokpit 3414: planlama yolu; plansız siparişte Sistem önersin, sonuç cümlesi, geç siparişte neden ve seçenekler, Onaya geç; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  const nedenli = (ops: Record<string, Is>) => ({ ...plan(ops), ops: { ...ops, 'S1.a2': { ...ops['S1.a2'], why: { t: 'tezgah', r: 'S2.a1' } } } });
  const t = await taslakSunucusu(page, (d) => ({ ...calismaKur(d), plan: nedenli(d.ops) }));
  await page.route('**/api/plan/planlama-calismasi/plana-al-onizlemesi?*', (r) => {
    const q = new URL(r.request().url()).searchParams, tezgah = q.get('tezgah') ?? '', S = Number(q.get('baslangic'));
    return json(r, { calismaSurumu: t.s.surum, gecerli: true, ileti: null, isler: [{ isId: 'S4.a1', tezgah, S, C: S + 4 }], bitis: S + 4 });
  });
  // Freze adımı öteki frezede 24 saat erken biter.
  await page.route('**/api/plan/planlama-calismasi/is-tasi-onizlemesi?*', (r) => {
    const q = new URL(r.request().url()).searchParams, S = Number(q.get('baslangic'));
    return json(r, { calismaSurumu: t.s.surum, gecerli: true, ileti: null, isler: [{ isId: q.get('isId'), tezgah: q.get('tezgah'), S, C: S + 8, tur: 'tasinan' }] });
  });
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan/kokpit?duzen=klasik');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  const karsilama = page.getByRole('button', { name: 'Başlayalım' });
  if (await karsilama.isVisible()) await karsilama.click();
  const tasma = async () => { expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0); };
  const cek = async (ad: string) => { await page.waitForTimeout(800); await page.screenshot({ path: `/tmp/tmiv2-ekran/3414-${ad}-${bilgi.project.name}.png` }); };
  const yol = kokpit.getByRole('region', { name: 'Planlama yolu' });
  const adim = yol.locator('li[aria-current="step"]');

  // Araç satırı sade gelir: görünüm ve ölçek seçenekleri düğmeyle açılır, yeniden basınca kapanır.
  const gorunum = kokpit.locator('.tc-pyq-ust').getByRole('group', { name: 'Görünüm' });
  await expect(gorunum).toBeHidden();
  await kokpit.locator('.tc-pyq-gorunum-dugme').click();
  await expect(gorunum).toBeVisible();
  await tasma();
  await kokpit.locator('.tc-pyq-gorunum-dugme').click();
  await expect(gorunum).toBeHidden();
  // Planla menüsü ilk bakışta üç iş gösterir.
  await kokpit.getByRole('button', { name: 'Plan', exact: true }).click();
  const planla = kokpit.getByRole('menu', { name: 'Plan' });
  await expect(planla.getByRole('menuitem').filter({ visible: true })).toHaveText([/Planı güncelle/, /Plansızları yerleştir/, /Baştan kur…/]);
  await cek('planla-menusu');
  await page.keyboard.press('Escape');

  // 2. adım: plansız sipariş açık gelir; tek birincil düğme sistemin yerleştirmesidir.
  await expect(adim).toHaveText('2 Sistem önersin');
  await expect(yol.getByRole('status')).toContainText('S4: 1 adım planlanmayı bekliyor.');
  await tasma();
  await cek('2-oner');
  await yol.getByRole('button', { name: 'Sistem önersin' }).click();
  await expect.poll(() => t.alinan().length).toBe(1);

  // 3. adım: sonuç cümlesi operasyon sayısını, bitişi ve termine göre yeri yazar; taslak olduğu için Onaya geç birincildir.
  await expect(adim).toHaveText('3 Düzelt');
  await expect(yol.getByRole('status')).toContainText(/S4: 1 operasyon planda\. Bitiş .+, termin .+: .+ erken\./);
  await expect(yol.getByRole('button', { name: 'Onaya geç' })).toBeVisible();
  await expect(yol.getByRole('button', { name: 'Seçenekleri göster' })).toHaveCount(0);
  await tasma();
  await cek('3-sonuc');

  // Geç sipariş: neden motorun kaydından, tezgâhın kodu ve önündeki işle; seçenekler istenince ve sonucuyla gelir.
  await kokpit.getByRole('region', { name: /Siparişler/ }).getByRole('button', { name: /S1/ }).first().click();
  await expect(yol.getByRole('status')).toContainText(/S1: 2 operasyon planda\. Bitiş .+ geç\./);
  await expect(yol.getByRole('status')).toContainText('Neden: 2. adım (Freze) F-01 tezgâhının boşalmasını');
  await expect(yol.getByRole('status')).toContainText('önündeki iş S2');
  await yol.getByRole('button', { name: 'Seçenekleri göster' }).click();
  const secenek = yol.getByRole('group', { name: 'Düzeltme seçenekleri' });
  await expect(secenek.locator('li').first()).toContainText(/Freze → F-0[12]/);
  await expect(secenek.locator('li').first()).toContainText('erken');
  await tasma();
  await cek('3-gec-secenek');
  await secenek.getByRole('button', { name: 'Taşı' }).first().click();
  await expect.poll(() => t.tasinan().length).toBe(1);

  // 4. adım: onay sayfası açılır.
  await yol.getByRole('button', { name: 'Onaya geç' }).click();
  await expect(kokpit).toHaveAttribute('data-sayfa', 'onay');
  await tasma();
  await cek('4-onay');
  expect(ag.hatalar).toEqual([]);
});

// Kart 3414 b: liste ortada düzeni Kokpit'in açılışıdır. Tek sipariş tablosu; satır açılınca sonuç cümlesi, adımlar ve tezgâhlardaki yer.
test('Kokpit 3414 b: liste düzeni; plansız sipariş satırdan planlanır, sonuç cümlesi yazar, geç siparişte neden; adım düğmesi işi seçer; tek görünüm, Ayarlar ve Matris bu düzende; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  const nedenli = (ops: Record<string, Is>) => ({ ...plan(ops), ops: { ...ops, 'S1.a2': { ...ops['S1.a2'], why: { t: 'tezgah', r: 'S2.a1' } } } });
  // Yeniden planlama taslakta plansız emre yer verir (uydurma: ilk aday tezgâhta dört saat).
  const yerlesik = (d: Durum, l: readonly Komut[]) => (l.some((k) => k.tur === 'yeniden-planla') ? { ...d.ops, 'S4.a1': { job: 'S4', m: 'M2', S: 41, C: 45 } } : d.ops);
  let komutlar: readonly Komut[] = [];
  const t = await taslakSunucusu(page, (d) => ({ ...calismaKur(d), plan: nedenli(yerlesik(d, komutlar)) }));
  komutlar = t.s.komutlar;
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan/kokpit');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  const karsilama = page.getByRole('button', { name: 'Başlayalım' });
  if (await karsilama.isVisible()) await karsilama.click();
  const tasma = async () => { expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0); };
  const cek = async (ad: string) => { await page.waitForTimeout(800); await page.screenshot({ path: `/tmp/tmiv2-ekran/3414b-${ad}-${bilgi.project.name}.png` }); };
  const telefon = bilgi.project.name === 'g360';
  // 3493 b: açılış Emirler ağacıdır; sipariş tablosu Siparişler görünümündedir.
  await kokpit.getByRole('group', { name: 'Görünüm' }).getByRole('button', { name: 'Siparişler' }).click();
  const tablo = kokpit.getByRole('table', { name: 'Siparişler' });
  await expect(tablo).toBeVisible();
  // Bölümler ve operasyon tablosu bu düzende yoktur; Plan menüsü iki düzende de aynıdır (3504 b).
  await expect(kokpit.locator('.tc-pyq-planla')).toHaveCount(1);
  await expect(kokpit.locator('.tc-pyq-bolum')).toHaveCount(0);
  // İlgi bekleyenler üsttedir: plansız ve geç sipariş zamanında bitenlerden önce gelir.
  const satirlar = tablo.locator('.tc-pyq-ld-satir');
  await expect(satirlar.last()).toContainText('Zamanında');
  await tasma();
  await cek('1-liste');

  const s4 = tablo.locator('.tc-pyq-ld-kart', { has: page.locator('[data-kart]', { hasText: 'S4' }) });
  await s4.getByRole('button', { name: 'Planla' }).click();
  await expect(s4.getByRole('status')).toContainText('Planda yeri yok.');
  await s4.locator('.tc-pyq-ld-ayrinti').getByRole('button', { name: 'Planla' }).click();
  await expect.poll(() => t.s.komutlar.map((k) => k.tur)).toEqual(['yeniden-planla']);
  await expect(s4.getByRole('status')).toContainText(/1 operasyon planda\. Bitiş .+ erken\./);
  await expect(kokpit.getByRole('region', { name: 'Değişiklikleriniz' })).toBeVisible();
  await tasma();
  await cek('2-planlandi');

  const s1 = tablo.locator('.tc-pyq-ld-kart', { has: page.locator('[data-kart]', { hasText: 'S1' }) });
  await s1.getByRole('button', { name: 'Düzelt' }).click();
  await expect(s1.getByRole('status')).toContainText('Neden: 2. adım (Freze) F-01 tezgâhının boşalmasını');
  await expect(s1.getByRole('list', { name: 'Adımlar' })).toContainText('1. Torna');
  await tasma();
  await cek('3-gec');

  // Planda yeri olan adım düğmedir: basınca iş tezgâhlarda seçilir, yeniden basınca bırakılır.
  const adim = s1.getByRole('list', { name: 'Adımlar' }).getByRole('button', { name: /1\. Torna/ });
  expect((await adim.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(telefon ? 44 : 24);
  await adim.click();
  await expect(adim).toHaveAttribute('aria-pressed', 'true');
  await tasma();
  await cek('4-adim-secili');
  await adim.click();
  await expect(adim).toHaveAttribute('aria-pressed', 'false');

  // Tek görünüm: ayrıntılı Kokpit'e geçiş yoktur; Duruş ve mesai bu düzende panel olarak açılır; Ayarlar sayfaya gider.
  await kokpit.getByRole('button', { name: 'Diğer' }).click();
  const diger = kokpit.getByRole('menu', { name: 'Diğer' });
  await expect(diger.getByRole('menuitem', { name: /Ayrıntılı Kokpit/ })).toHaveCount(0);
  await expect(diger.getByRole('menuitem', { name: 'Ayarlar' })).toBeVisible();
  await expect(kokpit).toHaveAttribute('data-duzen', 'liste');
  await tasma();
  await diger.getByRole('menuitem', { name: 'Matris' }).click();
  await expect(kokpit.getByRole('region', { name: 'Matris', exact: true })).toBeVisible();
  await tasma();
  await kokpit.getByRole('button', { name: 'Listeye dön' }).click();
  await expect(tablo).toBeVisible();
  expect(ag.hatalar).toEqual([]);
});

// Kart 3488 a: yerleşmeyen adım liste düzeninde elle yerleştirilir. Boş yerler önizlemeyle bulunur, seçilen yerin sonucu yazar,
// "Yerleştir ve kilitle" taşıma komutunu taslağa yazar; Böl paneli adımı tezgâhlara paylaştırma formunu açar.
test('Kokpit 3488: yerleşmeyen adım elle yerleştirilir ve kilitlenir; Planda böl paneli açılır; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  // S1'in Freze adımı planda yeri olmadan başlar; kilitlenince (taslakta elle yerleştirilince) plana girer.
  const { 'S1.a2': _, ...yerlesmeyen } = ILK;
  // Freze adımının malzemesi salı 16:00'da (40) gelir: daha erken başlayan yerde uyarı yazar (0004).
  const mal = { S1: [{ kod: 'ORN-H1', adim: 'a2', need: 8, t: 40, stok: 0, eksik: 0, pay: [{ tur: 'sa', kim: null, q: 8, gelis: 40, tb: false }] }] };
  const t = await taslakSunucusu(page, (d) => ({ ...calismaKur(d), plan: { ...(d.locks['S1.a2'] ? plan(d.ops) : { ...plan(d.ops), fail: ['S1.a2'] }), mal } }));
  t.s.ortak = { ...t.s.ortak, ops: yerlesmeyen };
  await page.route('**/api/plan/planlama-calismasi/is-tasi-onizlemesi?*', (r) => {
    const q = new URL(r.request().url()).searchParams, S = Number(q.get('baslangic'));
    return json(r, { calismaSurumu: t.s.surum, gecerli: true, ileti: null, isler: [{ isId: q.get('isId'), tezgah: q.get('tezgah'), S, C: S + 8, tur: 'tasinan' }] });
  });
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan/kokpit');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  const karsilama = page.getByRole('button', { name: 'Başlayalım' });
  if (await karsilama.isVisible()) await karsilama.click();
  const tasma = async () => { expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0); };
  const cek = async (ad: string) => { await page.waitForTimeout(800); await page.screenshot({ path: `/tmp/tmiv2-ekran/3488-${ad}-${bilgi.project.name}.png` }); };
  await kokpit.getByRole('group', { name: 'Görünüm' }).getByRole('button', { name: 'Siparişler' }).click();
  const tablo = kokpit.getByRole('table', { name: 'Siparişler' });
  const s1 = tablo.locator('.tc-pyq-ld-kart', { has: page.locator('[data-kart]', { hasText: 'S1' }) });
  await s1.locator('[data-kart]').getByRole('button').click();
  const ac2 = s1.locator('[data-elle-ac="S1.a2"]');
  await expect(ac2).toBeVisible();
  // Böl adımın adedini tezgâhlara paylaştıran paneli açar (komut ve etkisi birim testlerinde).
  await s1.locator('[data-bol-ac="S1.a2"]').click();
  const bol = kokpit.getByRole('complementary', { name: 'Planda böl' });
  await expect(bol.getByLabel('Adet')).toHaveCount(2);
  await tasma();
  await cek('0-bol');
  // Etkisini gör komutu taslağa yazar ve sonucu Uygula ile gösterir; Vazgeç taslağı boşaltır.
  await bol.getByRole('button', { name: 'Etkisini gör' }).click();
  const etki = bol.getByRole('region', { name: 'Bölmenin etkisi' });
  await expect(etki.getByRole('button', { name: 'Uygula' })).toBeVisible();
  expect(t.s.komutlar.at(-1)).toMatchObject({ tur: 'elle-bol', isId: 'S1.a2', paylar: [{ adet: 4, tezgah: 'M2' }, { adet: 4, tezgah: 'M3' }] });
  await tasma();
  await cek('0b-bol-etki');
  await etki.getByRole('button', { name: 'Vazgeç' }).click();
  await expect(etki).toHaveCount(0);
  await bol.getByRole('button', { name: 'Planda bölmeyi kapat' }).click();
  await expect(bol).toHaveCount(0);
  await ac2.click();
  const elle = s1.getByRole('group', { name: 'Freze için elle yerleştirme' });
  await expect(elle.getByRole('list', { name: 'Boş yerler' })).toBeVisible();
  await expect(elle.locator('[data-gerekli]')).toContainText('Gerekli 8 sa');
  await expect(elle.locator('[data-elle-yer="M3"] [data-elle-malzeme]')).toContainText('malzeme 20.10 Sal 16:00 geliyor');
  await elle.locator('[data-elle-yer="M3"]').click();
  await expect(elle.locator('[data-elle-malzeme-uyari]')).toContainText('kilitli adım malzemeyi beklemez');
  await expect(elle.locator('[data-elle-secilen="M3"]')).toContainText('Adım biter');
  await tasma();
  await cek('1-elle');
  await elle.getByRole('button', { name: 'Yerleştir ve kilitle' }).click();
  await expect.poll(() => t.tasinan().length).toBe(1);
  expect(t.tasinan()[0]).toMatchObject({ tur: 'tasi', isId: 'S1.a2', tezgah: 'M3' });
  await expect(kokpit.getByRole('region', { name: 'Değişiklikleriniz' })).toBeVisible();
  await expect(s1.locator('[data-elle-ac="S1.a2"]')).toHaveCount(0);
  await expect(s1.locator('[data-elle-kilit="S1.a2"]')).toContainText('elle · kilitli');
  await tasma();
  await cek('2-yerlesti');
  expect(ag.hatalar).toEqual([]);
});

// Kart 3493 b: Kokpit emir satırlı Gantt ile açılır. Her satır bir emir, çubukları aynı satırda; emir açılınca adımları alt satır olur.
// Tahta kendi içinde değil sayfayla kayar. Tezgâhlar ve Siparişler ayrı görünümdür. Telefonda tahta yerine emir listesi.
test('Kokpit 3493 b: emir satırlı Gantt; emir açılır kapanır, adımlar alt satırda; tahta sayfayla kayar; Tezgâhlar ve Siparişler ayrı görünüm; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  await taslakSunucusu(page, (d) => calismaKur(d));
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan/kokpit');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  const karsilama = page.getByRole('button', { name: 'Başlayalım' });
  if (await karsilama.isVisible()) await karsilama.click();
  const tasma = async () => { expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0); };
  const cek = async (ad: string) => { await page.waitForTimeout(800); await page.screenshot({ path: `/tmp/tmiv2-ekran/3493-${ad}-${bilgi.project.name}.png` }); };
  const gorunum = kokpit.getByRole('group', { name: 'Görünüm' });
  await expect(gorunum.getByRole('button', { name: 'Emirler' })).toHaveAttribute('aria-pressed', 'true');
  const bolum = kokpit.getByRole('region', { name: 'Emirler' });
  if (bilgi.project.name === 'g360') {
    await expect(bolum.getByRole('list', { name: 'Emirler' }).getByRole('button')).toHaveCount(4);
    await expect(bolum.locator('.tc-pyq-tahta')).toBeHidden();
    await tasma();
    await cek('0-telefon');
  } else {
    const tahta = bolum.locator('.tc-pyq-tahta');
    await expect(tahta).toBeVisible();
    // Tahta kendi içinde dikey kaymaz: yüksekliği içeriği kadardır.
    expect(await tahta.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
    const s1 = bolum.locator('button[data-agac="S1"]');
    await expect(s1).toHaveAttribute('aria-expanded', 'false');
    await expect(bolum.locator('[data-satir="S1"] [data-is]')).toHaveCount(2);
    await expect(bolum.locator('[data-agac-adim]')).toHaveCount(0);
    // Plansız emir de satırdır; çubuk alanında soluk not.
    await expect(bolum.locator('button[data-agac="S4"]')).toBeVisible();
    await expect(bolum.locator('[data-satir="S4"] [data-agac-bos]')).toHaveText('planda yeri yok');
    await expect(bolum.locator('[data-satir="S1"] [data-agac-bos]')).toHaveCount(0);
    await tasma();
    await cek('0-kapali');
    await s1.click();
    await expect(s1).toHaveAttribute('aria-expanded', 'true');
    await expect(bolum.locator('[data-agac-adim][data-satir^="S1>"]')).toHaveCount(2);
    await expect(bolum.locator('[data-satir="S1>S1.a1"] .tc-pyq-bas b')).toHaveText('1. Torna');
    // Tezgâh sütunu geniş ekranda açıktır; tablette Sütunlar menüsünden açılır (3533).
    if (bilgi.project.name === 'g1280') await expect(bolum.locator('[data-satir="S1>S1.a2"] .tc-pyq-bas')).toContainText('F-01');
    await expect(bolum.locator('[data-satir="S1"] [data-ozet="S1"]')).toBeVisible();
    await expect(bolum.locator('[data-satir="S1"] [data-is]')).toHaveCount(0);
    await tasma();
    await cek('1-acik');
    await s1.click();
    await expect(bolum.locator('[data-agac-adim]')).toHaveCount(0);
  }
  await gorunum.getByRole('button', { name: 'Tezgâhlar' }).click();
  const tezgahlar = kokpit.getByRole('region', { name: 'Tezgâhlar' });
  await expect(tezgahlar).toBeVisible();
  // Telefonda tahta yerine tezgâh ve iş listesi; bölüm boş kalmaz.
  if (bilgi.project.name === 'g360') await expect(tezgahlar.getByRole('group', { name: 'Tezgâhlar ve işler' })).toBeVisible();
  else await expect(tezgahlar.locator('.tc-pyq-tahta')).toBeVisible();
  await tasma();
  await cek('2-tezgahlar');
  await gorunum.getByRole('button', { name: 'Siparişler' }).click();
  await expect(kokpit.getByRole('table', { name: 'Siparişler' })).toBeVisible();
  await tasma();
  await cek('3-siparisler');
  expect(ag.hatalar).toEqual([]);
});

// 3533: sol bölme sütunlu tablo. Emirler gözünde Emir, Ürün, Adet, Termin, Plan bitiş, Fark, İlerleme (tablette Emir, Termin, Fark, İlerleme: tamamlanma
// dairesi her genişlikte varsayılandır); tek Sıralama seçici (Plan sırası, Termine göre gecikme); Sütunlar menüsü; sürüklenen ayraç; açık emrin adımları aynı
// tabloda; Tezgâhlar gözü aynı dilde; telefonda emir kartında Fark rozeti ve daire. Sıralama yalnız görünümdür: hiçbir komut yazılmaz. Yatay taşma yok.
test('Kokpit 3533: sol bölme sütunlu tablo; Sıralama, Sütunlar ve ayraç; adımlar aynı tabloda; Tezgâhlar gözü; telefonda kart; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  const yazilan: string[] = [];
  page.on('request', (r) => { if (r.method() !== 'GET' && r.url().includes('/api/')) yazilan.push(`${r.method()} ${r.url()}`); });
  await taslakSunucusu(page, (d) => calismaKur(d));
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan/kokpit');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  const karsilama = page.getByRole('button', { name: 'Başlayalım' });
  if (await karsilama.isVisible()) await karsilama.click();
  const tasma = async () => { expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0); };
  const cek = async (ad: string) => { await page.waitForTimeout(800); await page.screenshot({ path: `/tmp/tmiv2-ekran/3533-${ad}-${bilgi.project.name}.png` }); };
  const bolum = kokpit.getByRole('region', { name: 'Emirler' });
  const secici = bolum.getByRole('combobox', { name: 'Sıralama' });
  await expect(secici).toBeVisible();
  await expect(secici.locator('option')).toHaveText(['Plan sırası', 'Termine göre gecikme']);
  // Seçici yeniden kurulmaz (odak ve açık liste yerinde kalır): işaret sıralamadan sonra da durur.
  await secici.evaluate((el) => { el.setAttribute('data-izleme', '1'); });
  if (bilgi.project.name === 'g360') {
    // Telefon: tahta yok; seçici kartların üstünde, Sütunlar menüsü yok; kartta fark rozeti ve küçük daire; plansız emirde daire yok.
    await expect(bolum.locator('.tc-pyq-tahta')).toBeHidden();
    await expect(bolum.getByRole('button', { name: /^Sütunlar \d+$/ })).toBeHidden();
    const kart = (id: string) => bolum.locator(`li[data-liste-satir="${id}"]`);
    await expect(kart('S1').locator('.tc-pyq-fark[data-ton="gec"]')).toContainText('geç');
    await expect(kart('S1').locator('svg.tc-pyq-halka[data-kucuk]')).toHaveAttribute('aria-label', '0/2 adım bitti');
    await expect(kart('S1')).toContainText('adet');
    await expect(kart('S1')).toContainText('Termin');
    await expect(kart('S4').locator('svg.tc-pyq-halka')).toHaveCount(0);
    await tasma();
    await cek('0-telefon');
    await secici.selectOption('gecikme');
    await expect(bolum.locator('li[data-liste-satir]')).toHaveCount(4);
    expect(await bolum.locator('li[data-liste-satir]').evaluateAll((l) => l.map((x) => x.getAttribute('data-liste-satir')))).toEqual(['S1', 'S3', 'S2', 'S4']);
    await expect(secici).toHaveAttribute('data-izleme', '1');
    await tasma();
    await cek('1-telefon-gecikme');
  } else {
    const genis = bilgi.project.name === 'g1280';
    const tahta = bolum.locator('.tc-pyq-tahta');
    await expect(tahta).toBeVisible();
    const basliklar = bolum.getByRole('columnheader');
    await expect(basliklar).toHaveText(genis ? ['Emir', 'Ürün', 'Adet', 'Termin', 'Plan bitiş', 'Fark', 'İlerleme'] : ['Emir', 'Termin', 'Fark', 'İlerleme']);
    const s1 = bolum.locator('[data-satir="S1"]');
    await expect(s1.locator('.tc-pyq-fark[data-ton="gec"]')).toContainText('geç');
    // Tamamlanma dairesi her genişlikte: S1 iki adımdan hiçbiri bitmedi; plansız S4'te daire yok.
    await expect(s1.locator('svg.tc-pyq-halka')).toHaveAttribute('aria-label', '0/2 adım bitti');
    await expect(bolum.locator('[data-satir="S4"] svg.tc-pyq-halka')).toHaveCount(0);
    await expect(bolum.locator('[data-satir="S4"] .tc-pyq-fark')).toHaveCount(0);
    // Tablo, gantt'ı ezmez: bölme görünen alanın en çok %70'idir; çizelge alanı genişliğini korur.
    const olc = async () => tahta.evaluate((el) => { const b = el.querySelector<HTMLElement>('.tc-pyq-satir:not(.tc-pyq-eksen) .tc-pyq-bas')!, a = el.querySelector<HTMLElement>('.tc-pyq-satir:not(.tc-pyq-eksen) .tc-pyq-alan')!; return { bas: b.getBoundingClientRect().width, alanGen: a.getBoundingClientRect().width, kap: el.clientWidth }; });
    const o0 = await olc();
    expect(o0.bas).toBeLessThanOrEqual(o0.kap * 0.75);
    expect(o0.alanGen).toBeGreaterThan(o0.kap * 0.3);
    await tasma();
    await cek('0-varsayilan');
    // Sıralama: en gecikecek üstte; terminsiz ve plansız en altta; seçici odakta kalır; hiçbir yazım yok.
    const siralar = () => bolum.locator('button[data-agac]').evaluateAll((l) => l.map((x) => x.getAttribute('data-agac')));
    const plan0 = await siralar();
    await secici.selectOption('gecikme');
    expect(await siralar()).toEqual(['S1', 'S3', 'S2', 'S4']);
    await expect(secici).toHaveAttribute('data-izleme', '1');
    await tasma();
    await cek('1-gecikme');
    await secici.selectOption('plan');
    expect(await siralar()).toEqual(plan0);
    // Sütunlar menüsü: dugmenin altında açılır, ekranın içindedir, Emir hep açık; kapatınca başlık azalır; Esc düğmeye odak verir.
    const sutunDugme = bolum.getByRole('button', { name: /^Sütunlar \d+$/ });
    await sutunDugme.click();
    const menu = bolum.getByRole('group', { name: 'Sütunlar' });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('checkbox', { name: /Emir/ })).toBeDisabled();
    const mk = (await menu.boundingBox())!, dk = (await sutunDugme.boundingBox())!;
    expect(mk.x).toBeGreaterThanOrEqual(0);
    expect(mk.x + mk.width).toBeLessThanOrEqual(bilgi.project.use.viewport!.width);
    expect(mk.y).toBeGreaterThanOrEqual(dk.y + dk.height - 1);
    await cek('2-sutunlar');
    await menu.getByRole('checkbox', { name: 'Fark' }).uncheck();
    await expect(basliklar).toHaveCount(genis ? 6 : 3);
    await menu.getByRole('checkbox', { name: 'Fark' }).check();
    await expect(basliklar).toHaveCount(genis ? 7 : 4);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(sutunDugme).toBeFocused();
    // Ayraç: ok tuşuyla genişler, çift tık doğal ene döner; gantt hâlâ yanında.
    const ayrac = bolum.getByRole('separator', { name: 'Tablo genişliği' });
    await ayrac.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    const o1 = await olc();
    expect(o1.bas).toBeGreaterThan(o0.bas + 20);
    expect(o1.bas).toBeLessThanOrEqual(o1.kap * 0.75);
    await tasma();
    await cek('3-ayrac');
    await ayrac.dblclick();
    expect(Math.abs((await olc()).bas - o0.bas)).toBeLessThan(2);
    // Açık emrin adımları aynı tabloda: ara başlık ve Adım, Tezgâh, Başlangıç, Süre, Durum hücreleri.
    await s1.locator('button[data-agac]').click();
    await expect(bolum.locator('[data-agac-ara][data-satir="S1>ust"]')).toBeVisible();
    const adim = bolum.locator('[data-satir="S1>S1.a2"]');
    await expect(adim.getByRole('cell').first()).toHaveText('2. Freze');
    await expect(adim.getByRole('cell').last()).toHaveText('Bekliyor');
    if (genis) await expect(adim.getByRole('cell').nth(1)).toHaveText('F-01');
    await tasma();
    await cek('4-adimlar');
    await s1.locator('button[data-agac]').click();
    // Emir satırının boş hücresine basmak emri seçer; yanan satır sütunlarıyla işaretlenir.
    await s1.locator('.tc-pyq-h').nth(1).click();
    await expect(s1).toHaveAttribute('data-secili', '');
    // Tezgâhlar gözü: aynı tablo dili, Sıralama ve Sütunlar yok.
    await kokpit.getByRole('group', { name: 'Görünüm' }).getByRole('button', { name: 'Tezgâhlar' }).click();
    const tez = kokpit.getByRole('region', { name: 'Tezgâhlar' });
    await expect(tez.getByRole('columnheader')).toHaveText(['Tezgâh', 'Ad', 'Yük', 'Şu an']);
    await expect(tez.getByRole('combobox', { name: 'Sıralama' })).toHaveCount(0);
    await expect(tez.locator('.tc-pyq-satir[data-satir="M1"] .tc-pyq-yuk')).toContainText('%');
    await expect(tez.locator('.tc-pyq-satir[data-satir="M1"] .tc-pyq-durum')).toBeVisible();
    await tasma();
    await cek('5-tezgahlar');
  }
  // Tablo yalnız görünümdür: sıralama, sütun, ayraç ve seçim sunucuya yazmaz.
  expect(yazilan).toEqual([]);
  expect(ag.hatalar).toEqual([]);
});
// 3532 b: gelen değişikliğin çubuktaki işareti gerçek düğmedir (en az 32 px); basınca balon işaretin üstünde açılır ve tahtanın görünen alanından
// taşmaz (sağ kenara yakın işaret de, 768'de Test bulgusu B1). Esc kapatır. Telefonda listede ikon; satıra basınca cümle satırın altında açılır.
// Bekleyen değişiklik uydurmadır (S2'yi etkiler); "Planı güncelle"nin sunucu yolu burada denenmez.
test('Kokpit 3532: gelen değişiklik işareti ve balonu ekranın içinde; telefonda satır altı cümle; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  const gelen = [{ id: 'ORN-g', ne: 'Rota değişti ORN-R1', ayrinti: 'ORN-ayrinti', kim: '', t: 0, isler: ['S2', 'S3'], geri: null }];
  await taslakSunucusu(page, (d) => ({ ...calismaKur(d), dataVer: 4, bekleyen: gelen }));
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan/kokpit?duzen=klasik');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  const tasma = async () => { expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0); };

  if (bilgi.project.name === 'g360') {
    const liste = kokpit.getByRole('group', { name: 'Tezgâhlar ve işler' });
    const satir = liste.locator('button[data-gelen]').first();
    await expect(satir).toBeVisible();
    await expect(satir.locator('.tc-pyq-liste-gelen[data-tur="veri"]')).toBeVisible();
    expect((await satir.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await satir.click();
    const cumle = liste.locator('[data-liste-cumle]');
    await expect(cumle).toContainText('Veri değişti: Rota değişti ORN-R1');
    await tasma();
    await page.keyboard.press('Escape');
    await expect(cumle).toHaveCount(0);
    expect(ag.hatalar).toEqual([]);
    return;
  }

  const tahta = kokpit.locator('.tc-pyq-tahta');
  const isaret = tahta.locator('[data-gelen-is="S2.a1"]');
  await expect(isaret).toBeVisible();
  const kutu = await isaret.boundingBox();
  expect(kutu?.width ?? 0).toBeGreaterThanOrEqual(32);
  expect(kutu?.height ?? 0).toBeGreaterThanOrEqual(32);
  // İşaret görünen alanın sağ kenarına gelecek kadar kaydırılır; balon yine tahtanın ve ekranın içinde açılır.
  await tahta.evaluate((k, id) => {
    const el = k.querySelector<HTMLElement>(`[data-gelen-is="${id}"]`), ic = k.querySelector<HTMLElement>('.tc-pyq-ic');
    if (!el || !ic) return;
    const x = el.getBoundingClientRect().right - ic.getBoundingClientRect().left;
    k.scrollLeft = Math.max(0, x - k.clientWidth + 4);
  }, 'S2.a1');
  for (const kenar of ['sag', 'sol'] as const) {
    if (kenar === 'sol') {
      await tahta.evaluate((k, id) => {
        const el = k.querySelector<HTMLElement>(`[data-gelen-is="${id}"]`), ic = k.querySelector<HTMLElement>('.tc-pyq-ic');
        if (!el || !ic) return;
        const bas = k.querySelector<HTMLElement>('.tc-pyq-bas')?.offsetWidth ?? 0;
        k.scrollLeft = Math.max(0, el.getBoundingClientRect().left - ic.getBoundingClientRect().left - bas - 4);
      }, 'S2.a1');
    }
    await isaret.click();
    const balon = tahta.locator('[data-balon]');
    await expect(balon).toContainText('Veri değişti: Rota değişti ORN-R1');
    const b = await balon.boundingBox(), t = await tahta.boundingBox(), i = await isaret.boundingBox();
    const en = page.viewportSize()?.width ?? 0;
    expect(b && t && i).toBeTruthy();
    if (b && t && i) {
      expect(b.x).toBeGreaterThanOrEqual(t.x);
      expect(b.x + b.width).toBeLessThanOrEqual(Math.min(t.x + t.width, en) + 0.5);
      // Balon işaretin üstündedir: işareti ve çubuğu örtmez.
      expect(b.y + b.height).toBeLessThanOrEqual(i.y + i.height / 2 + 0.5);
    }
    // Yazı kesilmez: balonun içeriği kendi genişliğine sığar.
    expect(await balon.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await tasma();
    await page.keyboard.press('Escape');
    await expect(balon).toHaveCount(0);
  }
  // İlk satırdaki işaret (S3, T-01): üstte saat ekseni var, balon aşağı açılır; işareti örtmez, eksenin altında kalır (Arayüz Z3).
  await tahta.evaluate((k) => { k.scrollTop = 0; });
  const ilk = tahta.locator('[data-gelen-is="S3.a1"]');
  await ilk.scrollIntoViewIfNeeded();
  await tahta.evaluate((k) => { k.scrollTop = 0; });
  await ilk.click();
  const asagi = tahta.locator('[data-balon]');
  await expect(asagi).toHaveAttribute('data-asagi', '');
  const ab = await asagi.boundingBox(), ib = await ilk.boundingBox(), eb = await tahta.locator('.tc-pyq-eksen').boundingBox();
  expect(ab && ib && eb).toBeTruthy();
  if (ab && ib && eb) { expect(ab.y).toBeGreaterThanOrEqual(ib.y + ib.height / 2 - 0.5); expect(ab.y).toBeGreaterThanOrEqual(eb.y + eb.height - 0.5); }
  await page.keyboard.press('Escape');
  await expect(asagi).toHaveCount(0);
  // Şeritteki "iş etkilendi" etkilenen emri yakar, ötekini soldurur.
  const etkilenen = page.locator('[data-etkilenen]');
  await expect(etkilenen).toContainText('iş etkilendi');
  await etkilenen.click();
  await expect(tahta.locator('[data-is="S2.a1"]')).toHaveAttribute('data-yanan', '');
  await expect(tahta.locator('[data-is="S1.a1"]')).toHaveAttribute('data-sonuk', '');
  await tasma();
  expect(ag.hatalar).toEqual([]);
});

// 3532 b (Arayüz Z4): "Planı güncelle" ortak çalışmaya yazar (gerçek istemci yolu: kayıt, değerlendirme); sonra tahtanın üstünde sonuç çubuğu
// (Geri al, Kapat), kayan işin eski yeri hayalet ve çubukta "+3 sa"; telefonda satırda "3 sa ileri". Değerlendirme uydurmadır: S2'nin adımı
// üç saat kayar. Yatay taşma yok.
test('Kokpit 3532: Planı güncelle sonrası sonuç çubuğu, hayalet ve ileri/geri yazısı; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  const gelen = [{ id: 'ORN-g', ne: 'Rota değişti ORN-R1', ayrinti: 'ORN-ayrinti', kim: '', t: 0, isler: ['S2'], geri: [] }];
  const ortak = { ...calisma({ ...ILK }, {}), dataVer: 4, bekleyen: gelen };
  const YENI = plan({ ...ILK, 'S2.a1': { job: 'S2', m: 'M2', S: 35, C: 43 } });
  let surum = 1;
  await page.route('**/api/plan/planlama-calismasi', (r) => json(r, { calisma: ortak, surum: 1 }));
  await page.route('**/api/plan/taslagim', (r) => json(r, { taslak: null, calisma: ortak, surum: 1 }));
  await page.route('**/api/plan/planlama-kayitlari/yaz', (r) => { surum += 1; return json(r, { kayit: { anahtar: 'ORN-calisma', bicim: 'json', deger: null, surum } }); });
  await page.route('**/api/plan/planlama-degerlendirmesi', (r) => json(r, { is: IS }));
  await page.route(`**/api/plan/planlama-degerlendirmesi/${IS}`, (r) => json(r, {
    durum: 'bitti', cevap: { calismaSurumu: surum, dataVer: 4, baslangic: '2026-10-19', simdi: 7, maliyetGorunur: false, sonuc: { tur: 'plan-uygula', plan: YENI } },
  }));
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan/kokpit?duzen=klasik');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  const tasma = async () => { expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0); };
  const menu = kokpit.getByRole('button', { name: 'Plan', exact: true });
  await expect(menu).toBeEnabled();
  await menu.click();
  await page.getByRole('menuitem', { name: /^Planı güncelle \(1\)/ }).click();
  const sonuc = kokpit.getByRole('group', { name: 'Güncellemenin sonucu' });
  await expect(sonuc).toBeVisible({ timeout: 10_000 });
  await expect(sonuc).toContainText('1 iş kaydı');
  await expect(sonuc).toContainText('+3 sa');
  await expect(sonuc).toContainText('ortak çalışma planına yazıldı, canlıya değil');
  for (const ad of ['Geri al', 'Kapat']) {
    const d = sonuc.getByRole('button', { name: ad });
    await expect(d).toBeVisible();
    const k = await d.boundingBox();
    expect((k?.x ?? 0) + (k?.width ?? 0)).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 0.5);
  }
  if (bilgi.project.name === 'g360') {
    await expect(kokpit.getByRole('group', { name: 'Tezgâhlar ve işler' })).toContainText('3 sa ileri');
  } else {
    const tahta = kokpit.locator('.tc-pyq-tahta');
    await expect(tahta.locator('[data-eski-is="S2.a1"]')).toContainText('eski');
    await expect(tahta.locator('[data-is="S2.a1"]')).toContainText('+3 sa');
    await expect(tahta.locator('[data-is="S2.a1"]')).toHaveAttribute('data-kaydi', '');
  }
  await tasma();
  await sonuc.getByRole('button', { name: 'Kapat' }).click();
  await expect(sonuc).toHaveCount(0);
  await expect(kokpit.locator('[data-eski-is]')).toHaveCount(0);
  expect(ag.hatalar).toEqual([]);
});

// 3551 dilim 3 (E, S2 a): Emirler gözünde kademe ölçeğe bağlıdır. Ay'da sipariş başına tek çubuk; çubuğa basınca o siparişin emirleri, emre basınca
// adımları açılır, aralık görünüme sığar (her çubuk görünür); odak yol izinin yeni halkasına geçer; Tüm plan geri döner. Telefonda tahta ve yol izi yok.
test('Kokpit 3551 E: sipariş, emir ve adım kademeleri; aralık görünüme sığar; yol izi geri döner; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  await taslakSunucusu(page);
  await page.route('**/api/plan/planlama-kaynagi', async (r) => {
    const cevap = await r.fetch();
    const a = { siparis: '901', no: 'ORN-SP-101', musteri: 'Deneme Müşteri A' }, b = { siparis: '902', no: 'ORN-SP-102', musteri: 'Deneme Müşteri B' };
    await r.fulfill({ response: cevap, json: { ...(await cevap.json()) as object, siparisBaglari: { S1: { ...a, kalem: 1 }, S2: { ...a, kalem: 2 }, S4: { ...b, kalem: 1 } } } });
  });
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan/kokpit');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  const karsilama = page.getByRole('button', { name: 'Başlayalım' });
  if (await karsilama.isVisible()) await karsilama.click();
  const tasma = async () => { expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0); };
  const cek = async (ad: string) => { await page.waitForTimeout(800); await page.screenshot({ path: `/tmp/tmiv2-ekran/3551e-${ad}-${bilgi.project.name}.png` }); };
  const bolum = kokpit.getByRole('region', { name: 'Emirler' });
  const yol = bolum.locator('[data-yol-izi]');
  if (bilgi.project.name === 'g360') {
    await expect(bolum.locator('.tc-pyq-tahta')).toBeHidden();
    await expect(yol).toBeHidden();
    await tasma();
    await cek('0-telefon');
    expect(ag.hatalar).toEqual([]);
    return;
  }
  const tahta = bolum.locator('.tc-pyq-tahta');
  await expect(yol.locator('[aria-current="page"]')).toHaveText('Tüm plan');
  // Ay: Ctrl+tekerlekle uzaklaşılır (sade düzende ölçek düğmesi yok).
  const k = await tahta.boundingBox();
  if (!k) throw new Error('tahta yok');
  await page.mouse.move(k.x + k.width * 0.7, k.y + 60);
  await page.keyboard.down('Control');
  for (let i = 0; i < 8 && (await tahta.getAttribute('data-olcek')) !== 'A'; i++) { await page.mouse.wheel(0, 300); await page.waitForTimeout(150); }
  await page.keyboard.up('Control');
  await expect(tahta).toHaveAttribute('data-olcek', 'A');
  const siparisler = tahta.locator('[data-kademe="siparis"]');
  // İki siparişin çubuğu; planda yeri olmayan siparişte (S4) soluk not, siparişsiz S3 kendi satırında.
  await expect(siparisler).toHaveCount(2);
  await expect(tahta.locator('[data-agac-bos]')).toHaveCount(1);
  await expect(tahta.locator('[data-is]')).toHaveCount(0);
  await expect(yol).toContainText('Yıl ve Ay: sipariş çubukları');
  await tasma();
  await cek('1-siparis');
  // Siparişe in: iki emri de görünen saat alanının içinde (Arayüz Z1); odak yol izinde (Z4).
  const gorunur = async (sec: string) => tahta.evaluate((t, s) => {
    const r = t.getBoundingClientRect(), bas = t.querySelector('.tc-pyq-bas')?.getBoundingClientRect().right ?? r.left;
    return [...t.querySelectorAll(s)].every((x) => { const q = x.getBoundingClientRect(); return q.right > bas && q.left < r.right; });
  }, sec);
  await siparisler.filter({ hasText: 'ORN-SP-101' }).dispatchEvent('click');
  await expect(yol.locator('[aria-current="page"]')).toHaveText('ORN-SP-101');
  await expect(yol.locator('[aria-current="page"]')).toBeFocused();
  await expect(tahta.locator('[data-kademe="emir"]')).toHaveCount(2);
  expect(await gorunur('[data-kademe="emir"]')).toBe(true);
  await tasma();
  await cek('2-emir');
  // Emre in: adımları görünür; yol izi üç halka; emir seçili.
  await tahta.locator('[data-kademe="emir"][data-kademe-id="S1"]').dispatchEvent('click');
  await expect(yol.locator('li')).toHaveCount(3);
  await expect(tahta.locator('[data-is^="S1."]').first()).toBeVisible();
  expect(await gorunur('[data-is^="S1."]')).toBe(true);
  await expect(yol).toContainText('Gün ve 3 gün: adımlar');
  await tasma();
  await cek('3-adim');
  // Tüm plan: sipariş kademesine döner, odak inilen siparişe.
  await yol.getByRole('button', { name: /Tüm plan/ }).click();
  await expect(yol.locator('[aria-current="page"]')).toHaveText('Tüm plan');
  await expect(tahta.locator('[data-kademe="siparis"]')).toHaveCount(2);
  expect(await page.evaluate(() => { const a = document.activeElement; return a?.getAttribute('data-siparis') ?? a?.getAttribute('data-kademe-id'); })).toBe('sp:901');
  await tasma();
  expect(ag.hatalar).toEqual([]);
});

// 3570: sol tablo içeriğe göre açılır; yazı büyüse de emir no, adet ve tarihler kesilmez, Fark en çok iki satır; Hafta'da emir satırı tek satır boyundadır.
test('Kokpit 3570: sol tablo kesilmeden okunur (büyük yazıda da); emir kademesinde satır tek satır boyunda; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  await taslakSunucusu(page);
  await page.route('**/api/plan/planlama-kaynagi', async (r) => {
    const cevap = await r.fetch();
    const a = { siparis: '901', no: 'ORN-SP-101', musteri: 'Deneme Müşteri A' };
    await r.fulfill({ response: cevap, json: { ...(await cevap.json()) as object, siparisBaglari: { S1: { ...a, kalem: 1 }, S2: { ...a, kalem: 2 } } } });
  });
  const buyuk = bilgi.project.name !== 'g360';
  // Yazı boyu ayarı büyük kullanıcı: yazı değişkenleri büyür, px ölçüler aynı kalır (ekranda görülen kesilmenin ortamı).
  if (buyuk) await page.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = ':root{--yazi-xs:17px;--yazi-s:19px;--yazi-m:21px}'; document.head.append(st); }); });
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan/kokpit');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  const karsilama = page.getByRole('button', { name: 'Başlayalım' });
  if (await karsilama.isVisible()) await karsilama.click();
  const tasma = async () => { expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0); };
  const cek = async (ad: string) => { await page.waitForTimeout(800); await page.screenshot({ path: `/tmp/tmiv2-ekran/3570-${ad}-${bilgi.project.name}.png` }); };
  const bolum = kokpit.getByRole('region', { name: 'Emirler' });
  if (bilgi.project.name === 'g360') {
    await expect(bolum.locator('.tc-pyq-tahta')).toBeHidden();
    await tasma();
    await cek('0-telefon');
    expect(ag.hatalar).toEqual([]);
    return;
  }
  const tahta = bolum.locator('.tc-pyq-tahta');
  await expect(tahta.locator('.tc-pyq-tablo-satir [data-sutun="termin"]').first()).toBeVisible();
  // Emir no, Adet, Termin, Plan bitiş ve başlıklar kesilmez; Fark rozeti en çok iki satır.
  const kesilen = async () => tahta.evaluate((t) => {
    const l: string[] = [];
    for (const h of t.querySelectorAll<HTMLElement>('.tc-pyq-h[data-sutun]')) {
      const id = h.dataset['sutun'] ?? '';
      if (id === 'urun' || id === 'ilerleme') continue;
      if (id === 'fark') {
        const r = h.querySelector<HTMLElement>('.tc-pyq-fark');
        if (r && r.getBoundingClientRect().height > parseFloat(getComputedStyle(r).lineHeight) * 2 + 12) l.push(`fark: ${r.textContent ?? ''}`);
        continue;
      }
      const ic = h.getAttribute('role') === 'columnheader' ? h : h.querySelector<HTMLElement>('b, .tc-pyq-h-veri') ?? h;
      if (ic.scrollWidth > ic.clientWidth + 1) l.push(`${id}: ${ic.textContent ?? ''}`);
    }
    return l;
  });
  expect(await kesilen()).toEqual([]);
  await tasma();
  await cek('1-tablo');
  // Ay'a uzaklaş, siparişe in: Hafta'da emir satırları tek satır boyunda (adımların şerit sayısıyla uzamaz).
  const k = await tahta.boundingBox();
  if (!k) throw new Error('tahta yok');
  await page.mouse.move(k.x + k.width * 0.7, k.y + 60);
  await page.keyboard.down('Control');
  for (let i = 0; i < 8 && (await tahta.getAttribute('data-olcek')) !== 'A'; i++) { await page.mouse.wheel(0, 300); await page.waitForTimeout(150); }
  await page.keyboard.up('Control');
  await tahta.locator('[data-kademe="siparis"]').filter({ hasText: 'ORN-SP-101' }).dispatchEvent('click');
  await expect(tahta.locator('[data-kademe="emir"]')).toHaveCount(2);
  for (const s of await tahta.locator('[data-kademe="emir"]').all()) {
    const satir = s.locator('xpath=ancestor::*[@data-satir][1]');
    await expect(satir).not.toHaveAttribute('data-seritli', '');
    expect(await satir.evaluate((x) => getComputedStyle(x).getPropertyValue('--seritler').trim())).toBe('1');
  }
  expect(await kesilen()).toEqual([]);
  await tasma();
  await cek('2-emir');
  expect(ag.hatalar).toEqual([]);
});

test('Kokpit 3551 F: genel bakış şeridi bütün planı gösterir; pencere klavyeyle ve basarak tahtayı kaydırır, Shift ile genişler; kapanır; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  await taslakSunucusu(page);
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await page.addInitScript(() => { try { localStorage.removeItem('coremes.kokpit-genel-bakis'); } catch { /* yok */ } });
  await ac('/plan/kokpit');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  const karsilama = page.getByRole('button', { name: 'Başlayalım' });
  if (await karsilama.isVisible()) await karsilama.click();
  const tasma = async () => { expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0); };
  const cek = async (ad: string) => { await page.waitForTimeout(800); await page.screenshot({ path: `/tmp/tmiv2-ekran/3551f-${ad}-${bilgi.project.name}.png` }); };
  const bolum = kokpit.getByRole('region', { name: 'Emirler' });
  const serit = bolum.locator('[data-genel]');
  if (bilgi.project.name === 'g360') {
    // Telefonda tahta yok, şerit de yok.
    await expect(serit).toBeHidden();
    await tasma();
    await cek('0-telefon');
    expect(ag.hatalar).toEqual([]);
    return;
  }
  const tahta = bolum.locator('.tc-pyq-tahta');
  await expect(serit).toBeVisible();
  expect(await serit.locator('.tc-pyq-genel-gun').count()).toBeGreaterThan(0);
  const pencere = serit.getByRole('slider', { name: 'Görünen aralık' });
  // İşaretlerin anlamı görünür satırda (Arayüz 3b Z1); şerit adlı grup (Z2).
  await expect(bolum.locator('[data-genel-lejant]')).toBeVisible();
  await expect(bolum.getByRole('group', { name: 'Plan genel bakışı' })).toBeVisible();
  await expect(pencere).toHaveAttribute('aria-valuenow', /\d+/);
  await tasma();
  await cek('1-acilis');
  // Klavye: End son güne, Home başa; tahta kaydırması pencereyi izler.
  await pencere.focus();
  await page.keyboard.press('End');
  await expect.poll(() => tahta.evaluate((t) => t.scrollLeft)).toBeGreaterThan(0);
  // Pencere tahta kaydırmasını bir kare sonra izler.
  await expect.poll(async () => Number(await pencere.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
  await page.keyboard.press('Home');
  await expect.poll(() => tahta.evaluate((t) => t.scrollLeft)).toBe(0);
  await expect(pencere).toHaveAttribute('aria-valuenow', '0');
  // Shift ve oklar pencereyi genişletir: başı yerinde, sonu ileri; tahta saat eni daralır.
  const once = await pencere.getAttribute('aria-valuetext');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(() => pencere.getAttribute('aria-valuetext')).not.toBe(once);
  expect((await pencere.getAttribute('aria-valuetext'))?.slice(0, 5)).toBe(once?.slice(0, 5));
  await tasma();
  await cek('2-genis');
  // Şeridin ortasına basınca pencere oraya gider.
  const s = await serit.boundingBox();
  if (!s) throw new Error('şerit yok');
  await page.mouse.click(s.x + s.width / 2, s.y + s.height / 2);
  await expect.poll(async () => Number(await pencere.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
  await cek('3-orta');
  // Kapanır (hatırlanması birim testte).
  await bolum.getByRole('button', { name: 'Genel bakış' }).click();
  await expect(serit).toHaveCount(0);
  await tasma();
  expect(ag.hatalar).toEqual([]);
});

test('Kokpit 3551 G: Tezgâhlarda Hafta ve Ay doluluk hücresi; hücre günü yan panelde açar (genişte yanda, 768 altta); Esc odağı hücreye döndürür; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  await taslakSunucusu(page);
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan/kokpit');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  const karsilama = page.getByRole('button', { name: 'Başlayalım' });
  if (await karsilama.isVisible()) await karsilama.click();
  const tasma = async () => { expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0); };
  const cek = async (ad: string) => { await page.waitForTimeout(800); await page.screenshot({ path: `/tmp/tmiv2-ekran/3551g-${ad}-${bilgi.project.name}.png` }); };
  await kokpit.getByRole('group', { name: 'Görünüm' }).getByRole('button', { name: 'Tezgâhlar' }).click();
  const bolum = kokpit.getByRole('region', { name: 'Tezgâhlar' });
  if (bilgi.project.name === 'g360') {
    await expect(bolum.locator('.tc-pyq-tahta')).toBeHidden();
    await tasma();
    await cek('0-telefon');
    expect(ag.hatalar).toEqual([]);
    return;
  }
  const tahta = bolum.locator('.tc-pyq-tahta');
  await expect(tahta).toBeVisible();
  // Hafta: Ctrl+tekerlekle uzaklaşılır (sade düzende ölçek düğmesi yok); satır tezgâh x gün hücresi, iş kutusu yok.
  const k = await tahta.boundingBox();
  if (!k) throw new Error('tahta yok');
  await page.mouse.move(k.x + k.width * 0.7, k.y + 60);
  await page.keyboard.down('Control');
  for (let i = 0; i < 8 && (await tahta.getAttribute('data-olcek')) !== 'H'; i++) { await page.mouse.wheel(0, 300); await page.waitForTimeout(150); }
  await page.keyboard.up('Control');
  await expect(tahta).toHaveAttribute('data-olcek', 'H');
  const hucre = tahta.locator('[data-hucre]:not([disabled])').filter({ has: page.locator('.tc-pyq-gunhucre-sayi') }).first();
  await expect(hucre).toBeVisible();
  await expect(hucre).toHaveAttribute('aria-label', /: doluluk %\d+ \(\d+ \/ \d+ sa\)/);
  await tasma();
  await cek('1-hafta');
  const kimlik = await hucre.getAttribute('data-hucre');
  await hucre.click();
  const panel = bolum.locator('[data-hucre-paneli]');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('data-hucre-paneli', kimlik ?? '');
  await expect(page.locator('#tc-pyq-hpanel-baslik')).toBeFocused();
  // Arayüz 3c Y1 ve Test G1: kap 1200 px ve genişse tahta daralmaz, panel sağ kenarını örter ve seçili hücre panelin solunda tam görünür;
  // daha darda (768, sol menü açık 1280) panel tahtanın altında.
  const p = await panel.boundingBox(), t = await tahta.boundingBox();
  if (!p || !t) throw new Error('kutu yok');
  const kap = await bolum.locator('.tc-pyq-panelli').evaluate((el) => el.getBoundingClientRect().width);
  if (bilgi.project.name === 'g768') expect(kap).toBeLessThan(1200);
  if (kap >= 1200) {
    expect(t.width).toBeGreaterThanOrEqual(k.width - 1);
    await expect.poll(async () => { const h = await tahta.locator(`[data-hucre="${kimlik ?? ''}"]`).boundingBox(); return h ? h.x + h.width <= p.x : false; }).toBe(true);
  } else expect(p.y).toBeGreaterThanOrEqual(t.y + t.height - 1);
  await tasma();
  await cek('2-panel');
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(tahta.locator(`[data-hucre="${kimlik ?? ''}"]`)).toBeFocused();
  // Arayüz 3c Z3: hücre ağı tek Tab durağı; sağ ok odağı aynı satırda ileri taşır, durak odakla gider.
  expect(await tahta.locator('[data-hucre][tabindex="0"]').count()).toBe(1);
  await page.keyboard.press('ArrowRight');
  const odakta = await page.evaluate(() => document.activeElement?.getAttribute('data-hucre') ?? '');
  expect(odakta.split('|')[0]).toBe((kimlik ?? '').split('|')[0]);
  expect(Number(odakta.split('|')[1])).toBeGreaterThan(Number((kimlik ?? '').split('|')[1]));
  await expect(tahta.locator('[data-hucre][tabindex="0"]')).toHaveAttribute('data-hucre', odakta);
  // Ay'da da hücre; Gün'e dönünce adım kutuları.
  await page.mouse.move(k.x + k.width * 0.7, k.y + 60);
  await page.keyboard.down('Control');
  for (let i = 0; i < 6 && (await tahta.getAttribute('data-olcek')) !== 'A'; i++) { await page.mouse.wheel(0, 300); await page.waitForTimeout(150); }
  await page.keyboard.up('Control');
  await expect(tahta).toHaveAttribute('data-olcek', 'A');
  expect(await tahta.locator('[data-hucre]').count()).toBeGreaterThan(0);
  // Z2: Ay'da geç işareti yüzde rakamını örtmez; Z4: hücre lejantı görünür.
  const kesisen = await tahta.evaluate((el) => [...el.querySelectorAll('.tc-pyq-gunhucre')].filter((h) => {
    const s = h.querySelector('.tc-pyq-gunhucre-sayi'), g = h.querySelector('.tc-pyq-gunhucre-gec');
    if (!s || !g) return false;
    const r = document.createRange(); r.selectNodeContents(s); const a = r.getBoundingClientRect(), b = g.getBoundingClientRect();
    return a.width > 0 && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  }).length);
  expect(kesisen).toBe(0);
  await expect(bolum.locator('[data-hucre-lejant]')).toBeVisible();
  await tasma();
  await cek('3-ay');
  expect(ag.hatalar).toEqual([]);
});

// 3602: sürüklerken öteki adımların hizası kesikli çizgiyle görünür, yakına gelince hafifçe yakalanır (düz çizgi, "hizalı"); Alt bunu kapatır;
// yakalama kilit ya da başka komut doğurmaz, bırakınca düz taşıma komutu gider. Telefonda tahta yok, sürükleme yok.
test('Kokpit 3602: sürüklerken hiza çizgisi ve yumuşak yakalama; Alt ile kapanır; taşıma komutu değişmez; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  const t = await taslakSunucusu(page);
  await page.route('**/api/plan/planlama-calismasi/is-tasi-onizlemesi?*', (r) => {
    const q = new URL(r.request().url()).searchParams;
    const id = q.get('isId') ?? '', S = Number(q.get('baslangic')), x = t.gorunum().ops[id];
    return json(r, { calismaSurumu: t.s.surum, gecerli: true, ileti: null, isler: x ? [{ isId: id, tezgah: q.get('tezgah'), S, C: S + (x.C - x.S), eskiTezgah: x.m, eskiS: x.S, tur: 'tasinan' }] : [] });
  });
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan/kokpit?duzen=klasik');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  const karsilama = page.getByRole('button', { name: 'Başlayalım' });
  if (await karsilama.isVisible()) await karsilama.click();
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  if (bilgi.project.name === 'g360') { expect(ag.hatalar).toEqual([]); return; }

  const tahta = kokpit.locator('.tc-pyq-tahta');
  await tahta.evaluate((el) => { el.scrollTo({ left: 0 }); });
  // S3.a1 (M1, 32-38) başlangıcı S1.a1'in bitişine (16) sürüklenir; aynı tezgâhta ikisi de var.
  const is = tahta.locator('[data-is="S3.a1"]');
  await expect(is).toBeVisible();
  await is.scrollIntoViewIfNeeded();
  const kutu = await is.boundingBox();
  if (!kutu) throw new Error('iş görünmüyor');
  const px = kutu.width / 6, y = kutu.y + kutu.height / 2, x0 = kutu.x + 6;
  const git = async (saat: number, adim = 8) => { await page.mouse.move(x0 + (saat - 32) * px, y, { steps: adim }); };
  await page.mouse.move(x0, y);
  await page.mouse.down();
  // Uzakta çizgi yok.
  await git(24);
  await expect(tahta.locator('.tc-pyq-hiza')).toHaveCount(0);
  // Yaklaşınca (yaklaşık 15 px) kesikli çizgi: yakalama yok, hizalı yazmaz.
  await git(16 + 14 / px);
  const cizgi = tahta.locator('.tc-pyq-hiza[data-kenar="bas"]');
  await expect(cizgi).toBeVisible();
  await expect(cizgi).not.toHaveAttribute('data-hizali', '');
  const resim = async (ad: string): Promise<void> => { const klasor = process.env['TMIV2_EKRAN_GORUNTU']?.trim(); if (klasor) await tahta.screenshot({ path: `${klasor}/hiza-${ad}-${bilgi.project.name}.png` }); };
  await resim('kesikli');
  // 5 px içinde yakalar: düz çizgi ve "hizalı".
  await git(16 + 5 / px, 4);
  await expect(cizgi).toHaveAttribute('data-hizali', '');
  await expect(cizgi).toContainText('hizalı');
  await expect(tahta.getByText(/Hizalı: /)).toBeVisible();
  await resim('hizali');
  // Alt basılıyken yakalama ve çizgi kapanır.
  await page.keyboard.down('Alt');
  await page.mouse.move(x0 + (16 + 5 / px - 32) * px + 1, y);
  await expect(tahta.locator('.tc-pyq-hiza')).toHaveCount(0);
  await page.keyboard.up('Alt');
  await git(16 + 5 / px, 4);
  await expect(cizgi).toHaveAttribute('data-hizali', '');
  await page.mouse.up();
  await page.getByRole('group', { name: 'Taşımayı onayla' }).getByRole('button', { name: 'Uygula' }).click();
  await expect.poll(() => t.tasinan().length).toBe(1);
  expect(t.tasinan()[0]).toMatchObject({ isId: 'S3.a1', tezgah: 'M1', baslangic: 16 });
  // Yakalama başka komut ya da kilit yazmaz: taslakta yalnız taşıma ve diz var.
  await expect.poll(() => t.s.satirlar.map((x) => x.komut.tur)).toEqual(['tasi', 'diz']);
  expect(t.s.komutlar.filter((k) => k.tur !== 'tasi')).toEqual([]);
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  expect(ag.hatalar).toEqual([]);
});

test('Kokpit 3618: Emir sütunu uzun emir numarasını taşır, yer yoksa ortadan kısaltıp kuyruğu korur, yanındaki sütunları örtmez; yatay taşma yok', async ({ page, ac }, bilgi) => {
  await taslakSunucusu(page, (d) => calismaKur(d));
  const UZUN = 'ORN-2026-003-MM-ORN-00001-26-11-030', COK_UZUN = 'ORN-2026-003-MM-ORN-ARALIK-AYLIK-DENEME-00002-26-11-031';
  const NO: Record<string, string> = { S1: UZUN, S2: COK_UZUN, S3: 'ORN-7', S4: 'ORN-2026-003-MM-ORN-00004-26-11-033' };
  await page.route('**/api/plan/planlama-kaynagi', async (r) => {
    const cevap = await r.fetch(), j = await cevap.json() as Record<string, unknown>;
    const em = (j['emirler'] ?? {}) as Record<string, unknown>;
    await r.fulfill({ response: cevap, json: { ...j, emirler: { opStatus: {}, opProg: {}, opYer: {}, ...em, orders: Object.entries(NO).map(([id, no]) => ({ id, no })) } } });
  });
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  const g = bilgi.project.name;
  const ac2 = async () => {
    await ac('/plan/kokpit');
    const kokpit = page.locator('.tc-pyq');
    await expect(kokpit).toBeVisible({ timeout: 20_000 });
    const karsilama = page.getByRole('button', { name: 'Başlayalım' });
    if (await karsilama.isVisible()) await karsilama.click();
    return kokpit.getByRole('region', { name: 'Emirler' });
  };
  let bolum = await ac2();
  if (g === 'g360') { expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0); return; }
  // Numara metni: parçalardan biri gizli ya da ilk parça kendi eninden dar gösteriliyorsa kısalmıştır; son parça ("26-11-030") kutunun içinde
  // görünmelidir.
  const olc = (id: string) => bolum.locator(`button[data-agac="${id}"] b.tc-pyq-emir-no`).evaluate((b) => {
    const p = [...b.children] as HTMLElement[], son = p[p.length - 1], ilk = p[0];
    const gizli = p.some((x) => getComputedStyle(x).display === 'none');
    return { metin: b.textContent ?? '', kisaldi: gizli || (ilk !== undefined && ilk.scrollWidth > ilk.clientWidth + 1), kuyrukGorunur: son !== undefined && son.getBoundingClientRect().right <= b.getBoundingClientRect().right + 1 && son.getBoundingClientRect().width > 0, sonYazi: son?.textContent ?? '' };
  });
  // Emir sütunu açılınca yanındaki sütunlar Gantt'ın ya da ayracın altına girmemeli: her hücre bölme satırının sağ kenarında biter (kırpılmaz),
  // ortasındaki nokta hücrenin kendisine aittir (başka öğe örtmüyor) ve tarih ile süre yazısı kesik değildir (adım satırlarının Durum ve Süre yazısı da ölçülür, 3660: sütun o kadar açılır, bölme de en dar sütun toplamının altına inmez). Emir satırında ve açılan emrin adım satırlarında ölçülür.
  const hucreler = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.tc-pyq-tablo-satir > .tc-pyq-h[data-sutun]')].filter((h) => h.getAttribute('role') === 'cell' && h.firstElementChild !== null).map((h) => {
    const r = h.getBoundingClientRect(), y = r.top + r.height / 2, gorunur = y > 60 && y < innerHeight - 60, adim = h.closest('.tc-pyq-satir')?.hasAttribute('data-agac-adim') === true;
    const ic = h.querySelector<HTMLElement>('span.tc-pyq-h-veri'), son = (ic ?? h.firstElementChild ?? h).getBoundingClientRect();
    const ust = (x: number) => document.elementFromPoint(x, y)?.closest('.tc-pyq-h') === h;
    return { sutun: h.dataset['sutun'] ?? '', adim, gorunur, sag: Math.max(son.right, r.right) <= (h.parentElement?.getBoundingClientRect().right ?? 0) + 0.5, orta: ust(r.left + r.width / 2), kesik: ic !== null && ic.scrollWidth > ic.clientWidth + 1 };
  }));
  const kontrol = async (tamNo: boolean) => {
    for (const id of ['S1', 'S2', 'S3', 'S4']) {
      const o = await olc(id);
      expect(o.metin).toBe(NO[id]);
      expect(o.kuyrukGorunur, `${id} kuyruk`).toBe(true);
      if (id !== 'S3') expect(o.sonYazi, `${id} son parça`).toBe(NO[id]!.split('-').slice(-3).join('-'));
      if (tamNo && id !== 'S2') expect(o.kisaldi, `${id} kısaldı`).toBe(false);
    }
    await bolum.locator('button[data-agac="S1"]').click();
    await expect(bolum.locator('[data-agac-adim]').first()).toBeVisible();
    await bolum.locator('button[data-agac="S1"]').scrollIntoViewIfNeeded();
    const l = await hucreler();
    expect(l.some((x) => x.adim)).toBe(true);
    for (const x of l.filter((y) => y.gorunur)) {
      expect(x.sag, `${x.sutun}${x.adim ? ' (adım)' : ''} içeriği bölmeden taşıyor`).toBe(true);
      expect(x.orta, `${x.sutun}${x.adim ? ' (adım)' : ''} ortası örtülü`).toBe(true);
      expect(x.kesik, `${x.sutun}${x.adim ? ' (adım)' : ''} yazısı kesik`).toBe(false);
    }
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  };
  // Varsayılan sütunlar: bölme dar kalabilir, numara ortadan kısalır ama komşu sütunlar sağlam kalır.
  await kontrol(false);
  if (g === 'g1280') {
    // Dört sütun (Emir, Termin, Fark, İlerleme) bölmeye sığar: numara tam yazılır.
    await page.evaluate(() => { localStorage.setItem('coremes.kokpit-tablo', JSON.stringify({ sutunlar: ['emir', 'termin', 'fark', 'ilerleme'], en: null })); });
    bolum = await ac2();
    await kontrol(true);
  }
});
