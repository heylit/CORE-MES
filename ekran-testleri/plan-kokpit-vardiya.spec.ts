import type { Locator, Page, Route } from '@playwright/test';
import { expect, tasmaOlc, test } from './ortak.ts';

// Kart 3601: itme (seçili işi ok tuşuyla kaydırma) ve elle taşıma (sürükleyip bırakma) kaynağın vardiyası dışına düşecek bir saat verse bile
// sunucunun kabul ettiği yere yerleşir: iş ilk açık ana alınır, vardiya dışı saatte kalmaz. Sunucu cevapları ağ katmanında uydurmadır
// (page.route): önizleme ve taşı komutu açık ana oturtur; tahta ve liste bunu gösterir. Genişlik projeden gelir (360, 768, 1280); sayfa yatay taşmaz.
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
// Sunucu esastır (3601): vardiya dışına düşen saat ilk açık ana alınır (uydurma takvim: her gün 08:00 ile 24:00 arası).
const acikAn = (S: number) => (((S % 24) + 24) % 24 < 8 ? S + (8 - (((S % 24) + 24) % 24)) : S);
const vardiyadaMi = (S: number) => ((S % 24) + 24) % 24 >= 8;
function oynat(d: Durum, l: readonly Komut[]): Durum {
  let { ops, locks, w } = d, down = d.down ?? [], ekMesai = d.ekMesai ?? [];
  for (const k of l) {
    const S = acikAn(Number(k['baslangic'])), m = String(k['tezgah']);
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


test('Kokpit 3601: itme ve elle taşıma vardiya dışı saati ilk açık ana alır; iş vardiya dışında kalmaz; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
  const t = await taslakSunucusu(page);
  const onizleme: { id: string; istenen: number; yer: number }[] = [];
  await page.route('**/api/plan/planlama-calismasi/is-tasi-onizlemesi?*', (r) => {
    const q = new URL(r.request().url()).searchParams;
    const id = q.get('isId') ?? '', istenen = Number(q.get('baslangic')), S = acikAn(istenen), x = t.gorunum().ops[id];
    onizleme.push({ id, istenen, yer: S });
    return json(r, { calismaSurumu: t.s.surum, gecerli: true, ileti: null, isler: x ? [{ isId: id, tezgah: q.get('tezgah'), S, C: S + (x.C - x.S), eskiTezgah: x.m, eskiS: x.S, tur: 'tasinan' }] : [] });
  });
  await page.clock.setSystemTime(new Date('2026-10-19T07:00:00+03:00'));
  await ac('/plan/kokpit?duzen=klasik');
  const kokpit = page.locator('.tc-pyq');
  await expect(kokpit).toBeVisible({ timeout: 20_000 });
  const karsilama = page.getByRole('button', { name: 'Başlayalım' });
  if (await karsilama.isVisible()) await karsilama.click();
  await gorunumAc(kokpit);
  const tasma = async () => { expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0); };
  await tasma();
  const yerlesen = () => Object.values(t.gorunum().ops).every((o) => vardiyadaMi(o.S));

  if (bilgi.project.name === 'g360') {
    // Telefon: elle taşıma operasyon listesinden; yer listesindeki saatler vardiya içindedir.
    await kokpit.getByRole('group', { name: 'Görünüm' }).getByRole('button', { name: 'Sipariş' }).click();
    await kokpit.getByRole('list', { name: 'Emirler' }).getByRole('button', { name: /S1/ }).click();
    const bolum = kokpit.getByRole('region', { name: 'Emirler ve operasyonlar' });
    await bolum.locator('[data-adim="S1.a2"]').click();
    await bolum.getByRole('group', { name: 'Freze için taşınacak yerler' }).locator('[data-tasi-tezgah="M3"]').click();
    await expect.poll(() => t.tasinan().length).toBe(1);
    expect(t.tasinan()[0]).toMatchObject({ isId: 'S1.a2', tezgah: 'M3' });
    expect(yerlesen()).toBe(true);
    await tasma();
    expect(ag.hatalar).toEqual([]);
    return;
  }

  const tahta = kokpit.locator('.tc-pyq-tahta');
  await tahta.evaluate((el) => { el.scrollTo({ left: 0 }); });
  const is = tahta.locator('[data-is="S3.a1"]');
  await expect(is).toBeVisible();
  await is.scrollIntoViewIfNeeded();
  const kutu = await is.boundingBox();
  if (!kutu) throw new Error('iş görünmüyor');

  // Elle taşıma: S3.a1 (M1, 32-38) gece 03:00'e (27. saat) sürüklenir; önizleme ve taşıma sabah 08:00'e (32) oturur.
  const px = kutu.width / 6, y = kutu.y + kutu.height / 2, x0 = kutu.x + 6;
  await page.mouse.move(x0, y);
  await page.mouse.down();
  await page.mouse.move(x0 + (27 - 32) * px, y, { steps: 8 });
  await page.mouse.up();
  await page.getByRole('group', { name: 'Taşımayı onayla' }).getByRole('button', { name: 'Uygula' }).click();
  await expect.poll(() => t.tasinan().length).toBe(1);
  expect(onizleme.some((o) => o.id === 'S3.a1' && !vardiyadaMi(o.istenen) && vardiyadaMi(o.yer))).toBe(true);
  expect(vardiyadaMi(t.gorunum().ops['S3.a1']?.S ?? 0)).toBe(true);
  expect(t.gorunum().ops['S3.a1']?.S).toBe(32);
  await tasma();

  // İtme: seçili iş ok tuşuyla yarım saat geri itilir (07:30); sunucu işi 08:00'de bırakır, vardiya dışına çıkmaz.
  await is.click();
  const n = t.tasinan().length;
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => t.tasinan().length).toBe(n + 1);
  expect(vardiyadaMi(t.gorunum().ops['S3.a1']?.S ?? 0)).toBe(true);
  expect(yerlesen()).toBe(true);
  await expect(kokpit.getByRole('region', { name: 'Değişiklikleriniz' }).getByRole('status')).toHaveCount(0);
  await tasma();
  expect(ag.hatalar).toEqual([]);
});
