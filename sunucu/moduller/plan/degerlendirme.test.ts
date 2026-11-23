import type { Db } from '#cekirdek/db.ts';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import vm from 'node:vm';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { degerlendirmeCevabi, degerlendirmeDurumuCevabi, degerlendirmeGovdesi, degerlendirmeSonucu, type DegerlendirmeDurumuCevabi, type DegerlendirmeIstegi, type DegerlendirmeSonucu } from '#paylasilan/sozlesme/planlama.ts';
import { HATA_DURUMU } from '#paylasilan/hata.ts';
import { ISLEMLER } from '#paylasilan/islemler.ts';
import { TESIS_SAAT_DILIMI } from '#paylasilan/zaman.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { degerlendirmeBaslat, degerlendirmeDurumu, degerlendirmeKodu, degerlendirmeYap, maliyetsiz, MESGUL, SONUC_OMRU_MS, type DegerlendirmeZarfi } from './degerlendirme.ts';
import { DURUM_ANAHTARI } from '../recete-rota/disari.ts';
import { PLANLAMA_ANAHTARI } from './disari.ts';
import { planGirdisi, type KaynakOkumasi } from './plan-girdisi.ts';
import { motorYukle } from './plan-motoru.ts';
import * as sorgular from './sorgular.ts';

// Reçete ve Rota'nın ana kaydı (planın girdisi) doğrudan yazılır: sahibi modülün yazma yolu bu testin konusu değildir.
const receteRotaKaydiEkle = (db: Db, deger: unknown, kisiId: number) => db.sorgu(
  `INSERT INTO recete_rota_kayit (anahtar, bicim, deger, surum, guncelleyen_kisi_id) VALUES ($1, 'json', $2::jsonb, nextval('recete_rota_surum'), $3)`,
  [DURUM_ANAHTARI, JSON.stringify(deger), kisiId]);

// Planlama değerlendirmesi (Soru 357 a). Hesap testleri teklif denemesinin örneğiyle (iki tezgâh, iki emir) betiği doğrudan koşturur;
// uç testleri yetkiyi, sürümü ve yazmamayı gerçek PostgreSQL ile dener. Veriler uydurmadır.

const tezgah = (id: string, grup: string, ucret: number | null): Record<string, unknown> => ({ id, ad: id, grup, ucret, verim: 1, vardiyalar: ['3'], opOran: 0 });
const KAYIT = {
  version: 7, savedAt: 9,
  items: [
    { id: '50', code: 'MM-1', name: 'Ornek mil', type: 'mamul' },
    { id: 'H1', code: 'H1', name: 'Ornek cubuk', type: 'ham', unit: 'kg', cost: 10, stock: 100, plan: { kod: 'H1', ad: 'Ornek cubuk', birim: 'kg', stok: 100, birimFiyat: 10, tedarikGun: 5, muayeneGun: 0 } },
  ],
  opdefs: [{ id: '13', name: 'Tornalama' }],
  machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', plan: tezgah('100', '10', 750) }],
  routes: { 50: { base: null, steps: [{ id: '50-o10', seq: 10, opNo: 10, opId: '13', stationId: '10', setup: 0, cycle: 30, alts: [], altTimes: {}, ins: [{ id: 'n1', itemId: 'H1', qty: 2 }] }] } },
  // O1 yakın terminli: ikisi aynı tezgâhta, O2 ilk sırada değilse O1 gecikir
  orders: [
    { id: 'O1', no: 'E-1', itemId: '50', qty: 10, start: '2026-10-19', due: '2026-10-20', priority: 2, status: 'serbest' },
    { id: 'O2', no: 'E-2', itemId: '50', qty: 16, start: '2026-10-19', due: '2026-10-20', priority: 2, status: 'serbest' },
  ],
};
const KAYNAK = {
  durum: {
    wcs: [{ id: '1', code: 'IM-1', name: 'Talasli', week: null, aktif: true }],
    stations: [{ id: '10', code: 'TOR', name: 'Torna', wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true }],
    machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', status: 'aktif', aktif: true }],
    people: [],
    cal: { shifts: [{ id: '3', name: 'Gunduz', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
  },
  ek: { takvim: { hafta: { 1: { 1: ['3'], 2: ['3'], 3: ['3'], 4: ['3'], 5: ['3'] } }, kisiVardiyasi: {} }, makineNotu: null, kisiGorevi: null },
};
const calismaKur = (): Record<string, unknown> => ({
  surum: 2, D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [], ayarlar: {} },
  rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, w: { famK: 0.3, mat: 'sert', dondurma: 4 },
  param: { tampon: false, tamponZ: 0, acilPay: 0 }, kapali: [], olaylar: [], plan: null,
});
// Kayıtlı plan: aynı girdiyle yalın motorun kural tabanlı planı ve çizelgesi (sayfanın kaydettiği biçimin en azı).
function planli(): Record<string, unknown> {
  const c = calismaKur();
  const g = planGirdisi({ calisma: c, kayit: KAYIT, kaynak: KAYNAK, bugun: '2026-10-19' });
  assert.ok(g);
  const m = motorYukle(); const p = m.schedule(g.st, 'dagit', null);
  const e = m.evaluate(p, g.st, null, false) as { J: Record<string, { C: number; T: number }> };
  const J = Object.fromEntries(Object.entries(e.J).map(([k, x]) => [k, { C: x.C, T: x.T }]));
  return { ...c, plan: { ops: p.ops, fail: [], J, dataVer: 1 } };
}
const AN = Date.parse('2026-10-19T06:00:00Z');
const dene = (istek: DegerlendirmeIstegi, calisma: unknown = planli()) => degerlendirmeYap({ calisma, kayit: KAYIT, kaynak: KAYNAK, bugun: '2026-10-19', istek }, AN);
const zarf = (r: Awaited<ReturnType<typeof dene>>): DegerlendirmeZarfi => { assert.ok(r && !('hata' in r), JSON.stringify(r)); return r; };
const sonuc = (r: Awaited<ReturnType<typeof dene>>): DegerlendirmeSonucu => degerlendirmeSonucu.parse(zarf(r).sonuc);

describe('planlama değerlendirmesi: hesap', () => {
  test('PD-01: her tur sözleşmenin biçiminde döner; şimdi sunucunun anından (09:00), aynı girdi aynı sonucu verir', async () => {
    const istekler: DegerlendirmeIstegi[] = [
      { tur: 'plan-kur' }, { tur: 'plan-uygula', isler: ['O1'] }, { tur: 'plan-secenekleri' }, { tur: 'termin-secenekleri', siparisId: 'O2' }, { tur: 'termin-uzatma', gun: 2 }, { tur: 'malzeme-terminleri' },
      { tur: 'malzeme-one-cekme' }, { tur: 'parti-bolme', siparisId: 'O2', dagitim: 'ayni', adetler: [8, 8] },
    ];
    for (const istek of istekler) {
      const a = await dene(istek);
      assert.equal(sonuc(a).tur, istek.tur);
      assert.equal(zarf(a).simdi, 9);
      assert.equal(zarf(a).baslangic, '2026-10-19');
      assert.deepEqual(await dene(istek), a, istek.tur);
    }
  });

  test('PD-02: girdi değişmez (çalışma kopyada hesaplanır)', async () => {
    const c = planli(); const once = JSON.stringify(c);
    await dene({ tur: 'parti-bolme', siparisId: 'O2', dagitim: 'ayni', adetler: [8, 8] }, c);
    await dene({ tur: 'termin-uzatma', gun: 5 }, c);
    assert.equal(JSON.stringify(c), once);
  });

  test('PD-03: plan seçenekleri dört denge konumunda (0, 25 kayıttaki, 50, 100) kurulur; çarpan termin ucunda 100, kâr ucunda 0,1', async () => {
    const s = sonuc(await dene({ tur: 'plan-secenekleri' }));
    assert.equal(s.tur, 'plan-secenekleri');
    if (s.tur !== 'plan-secenekleri') return;
    assert.deepEqual(s.secenekler.map((x) => x.denge), [0, 25, 50, 100]);
    assert.equal(s.secenekler[0]?.carpan, 100);
    assert.ok(Math.abs((s.secenekler[3]?.carpan ?? 0) - 0.1) < 1e-9);
    // Seçeneğin planı birleşmiş çalışmanın veri sürümündedir (planlama çalışması ucunun verdiği; kayıt ve kaynak veriyi değiştirince artar).
    const dataVer = planGirdisi({ calisma: planli(), kayit: KAYIT, kaynak: KAYNAK, bugun: '2026-10-19' })?.S['dataVer'];
    assert.equal(typeof dataVer, 'number');
    for (const x of s.secenekler) { assert.equal(x.isSayisi, 2); assert.equal(x.plan['dataVer'], dataVer); assert.ok(x.plan['ops'] && x.plan['J']); }
  });

  test('PD-04: termin seçenekleri en erkenden başlar, sıralıdır; girilen termin ayrı satırdır', async () => {
    const s = sonuc(await dene({ tur: 'termin-secenekleri', siparisId: 'O2' }));
    if (s.tur !== 'termin-secenekleri') return assert.fail(s.tur);
    assert.equal(s.yerlesti, true);
    assert.equal(s.taban, 'girilen-termin');
    assert.equal(s.satirlar[0]?.secenek, 'en-erken');
    const t = s.satirlar.map((x) => x.termin); assert.deepEqual([...t].sort(), t);
    assert.ok(s.satirlar.some((x) => x.secenek === '14-gun'));
  });

  test('PD-06: partiyi böl: darboğaz adımı ve partiler; adetsiz istek yalnız darboğazı verir', async () => {
    const yalniz = sonuc(await dene({ tur: 'parti-bolme', siparisId: 'O2', dagitim: 'ayni', adetler: null }));
    if (yalniz.tur !== 'parti-bolme') return assert.fail(yalniz.tur);
    assert.deepEqual(yalniz.darbogaz, { adim: '10', makineId: '100', alternatifler: [] });
    assert.equal(yalniz.sonuc, null);
    const s = sonuc(await dene({ tur: 'parti-bolme', siparisId: 'O2', dagitim: 'ayni', adetler: [6, 10] }));
    if (s.tur !== 'parti-bolme') return assert.fail(s.tur);
    assert.deepEqual(s.sonuc?.partiler.map((x) => [x.siparisId, x.adet]), [['O2/1', 6], ['O2/2', 10]]);
    assert.deepEqual(s.sonuc?.siparisler.map((x) => x['id']), ['O2/1', 'O2/2']);
    assert.ok(Object.keys(s.sonuc?.plan['ops'] as object).includes('O2/2.10'));
  });

  test('PD-07: reddedilenler: adet toplamı tutmayan bölme, çalışmada olmayan sipariş, plan gereken turde plansız çalışma; çalışma yoksa null', async () => {
    assert.deepEqual(await dene({ tur: 'parti-bolme', siparisId: 'O2', dagitim: 'ayni', adetler: [8, 7] }), { hata: 'adet' });
    assert.deepEqual(await dene({ tur: 'termin-secenekleri', siparisId: 'YOK' }), { hata: 'siparis-yok' });
    assert.deepEqual(await dene({ tur: 'malzeme-terminleri' }, calismaKur()), { hata: 'plan-yok' });
    assert.equal(await dene({ tur: 'plan-secenekleri' }, null), null);
  });

  // 2947: parti bölmenin bölünmüş sipariş kayıtları geliri payıyla taşır (motor siparisParcasi). Gelir girdiye yalnız kaynaktaki sipariş
  // bedelinden girer; fiyatı görmeyenin kaynağında bedeller null'dır (siparis-bedeli-girdi.test.ts). Kayıttaki değer, sayfanın kendi
  // siparişi ve acil olayı bu yoldan gelir taşımaz. Sızma yok; test bunu korur.
  test('PD-24: parti bölmede sipariş geliri yalnız kaynak bedelinden; fiyatı görmeyenin kaynağıyla bölünen kayıtlarda gelir null', async () => {
    const bos = { gelir: null, cezaOran: null, cezaTavan: null };
    const kaynakIle = (siparisBedelleri: unknown): KaynakOkumasi => ({ ...KAYNAK, ek: { ...KAYNAK.ek, siparisBedelleri } }) as unknown as KaynakOkumasi;
    const bol = async (kaynak: KaynakOkumasi, calisma: Record<string, unknown>, siparisId: string, adetler: number[]) => {
      const g = planGirdisi({ calisma, kayit: KAYIT, kaynak, bugun: '2026-10-19' });
      assert.ok(g);
      const m = motorYukle(); const p = m.schedule(g.st, 'dagit', null);
      const e = m.evaluate(p, g.st, null, false) as { J: Record<string, { C: number; T: number }> };
      const J = Object.fromEntries(Object.entries(e.J).map(([k, x]) => [k, { C: x.C, T: x.T }]));
      const r = await degerlendirmeYap({ calisma: { ...calisma, plan: { ops: p.ops, fail: [], J, dataVer: 1 } }, kayit: KAYIT, kaynak, bugun: '2026-10-19',
        istek: { tur: 'parti-bolme', siparisId, dagitim: 'ayni', adetler } }, AN);
      if (r === null || 'hata' in r) return r;
      const s = degerlendirmeSonucu.parse(r.sonuc);
      if (s.tur !== 'parti-bolme') return assert.fail(s.tur);
      return s.sonuc?.siparisler.map((x) => [x['id'], x['gelir']]);
    };
    const c = calismaKur();
    const D = c['D'] as Record<string, unknown>;
    // Denetim: fiyatı gören okuyucunun kaynağıyla gelir payıyla bölünür (alan gerçekten gelir taşır).
    assert.deepEqual(await bol(kaynakIle({ O1: { ...bos, gelir: 5000 }, O2: { ...bos, gelir: 8000 } }), c, 'O2', [8, 8]), [['O2/1', 4000], ['O2/2', 4000]]);
    assert.deepEqual(await bol(kaynakIle({ O1: bos, O2: bos }), c, 'O2', [8, 8]), [['O2/1', null], ['O2/2', null]]);
    assert.deepEqual(await bol(kaynakIle(null), c, 'O2', [8, 8]), [['O2/1', null], ['O2/2', null]], 'emirleri okuyamayan');
    const kayitta = { ...c, D: { ...D, siparisler: [{ id: 'O2', ad: 'E-2', urun: '50', adet: 16, termin: '2026-10-20', oncelik: 2, gelir: 7777 }] } };
    assert.deepEqual(await bol(kaynakIle({ O1: bos, O2: bos }), kayitta, 'O2', [8, 8]), [['O2/1', null], ['O2/2', null]], 'kayıttaki gelir taşınmaz');
    const sayfada = { ...c, D: { ...D, siparisler: [{ id: 'S9', ad: 'Deneme', urun: '50', adet: 10, termin: '2026-10-21', oncelik: 1, gelir: 9999 }] } };
    assert.deepEqual(await bol(kaynakIle({ O1: bos, O2: bos }), sayfada, 'S9', [5, 5]), { hata: 'siparis-yok' }, 'sayfanın siparişi girdiye girmez');
    // Güvenlik (2947): kaynakta olmayan bölünmüş sipariş (önceki bölmenin kaydı) gelirle kayıtlıysa fiyatsız kaynakla ya girdiye girmez ya geliri boştur.
    // İki kurulum: rrSavedAt 5 kayıttan eski (girdi kayıttan yeniden kurulur), 9 kayıtla aynı (sayfanın kaydettiği çalışma, birleşme yolu).
    for (const rrSavedAt of [5, 9]) {
      const bolunmus = { ...c, rrSavedAt, D: { ...D, siparisler: ['O2/1', 'O2/2'].map((id) => ({ id, ad: 'E-2', urun: '50', adet: 8, termin: '2026-10-20', oncelik: 2, gelir: 4000, cezaOran: 1, cezaTavan: 10 })) } };
      const gb = planGirdisi({ calisma: bolunmus, kayit: KAYIT, kaynak: kaynakIle({ O1: bos, O2: bos }), bugun: '2026-10-19' });
      assert.ok(gb);
      const girdiSip = (gb.S as { D: { siparisler: { id: string; gelir?: unknown; cezaOran?: unknown; cezaTavan?: unknown }[] } }).D.siparisler;
      assert.deepEqual(girdiSip.map((x) => x.id), ['O1', 'O2'], `rrSavedAt ${String(rrSavedAt)}: kaynakta olmayan bölünmüş kayıt birleşmede düşer`);
      assert.deepEqual(girdiSip.filter((x) => x.gelir != null || x.cezaOran != null || x.cezaTavan != null).map((x) => x.id), [], `rrSavedAt ${String(rrSavedAt)}: girdide gelir yok`);
      const r = await bol(kaynakIle({ O1: bos, O2: bos }), bolunmus, 'O2/1', [4, 4]);
      assert.ok(Array.isArray(r) ? r.every(([, g]) => g === null) : r?.hata === 'siparis-yok', JSON.stringify(r));
    }
    const acil = { ...c, olaylar: [{ tip: 'acil', urun: '50', adet: 10, termin: '2026-10-21', gelir: 6666 }] };
    assert.deepEqual(await bol(kaynakIle({ O1: bos, O2: bos }), acil, 'SP-901', [5, 5]), { hata: 'siparis-yok' }, 'acil olay sipariş eklemez');
  });

  test('PD-08: maliyeti görmeyende TL alanları null, saat ve plan kalır', async () => {
    const s = sonuc(await dene({ tur: 'plan-secenekleri' }));
    const m = maliyetsiz(s);
    if (m.tur !== 'plan-secenekleri' || s.tur !== 'plan-secenekleri') return assert.fail(m.tur);
    for (const [i, x] of m.secenekler.entries()) { assert.equal(x.netKar, null); assert.equal(x.ekMesaiTl, null); assert.equal(x.gecikmeSaat, s.secenekler[i]?.gecikmeSaat); assert.deepEqual(x.plan, { ...s.secenekler[i]?.plan, ozet: { ...(s.secenekler[i]?.plan['ozet'] as object), tl: null } }); }
    const b = sonuc(await dene({ tur: 'parti-bolme', siparisId: 'O2', dagitim: 'ayni', adetler: [8, 8] }));
    const mb = maliyetsiz(b); if (mb.tur !== 'parti-bolme') return assert.fail(mb.tur);
    assert.equal(mb.sonuc?.tl, null);
  });

  test('PD-18: planı kur (576): kuraldan sıfırdan kurar; iki emir yerleşir, plan çalışmanın veri sürümünde, alt sınır ve ilk gecikme kayıtta', async () => {
    const s = sonuc(await dene({ tur: 'plan-kur' }, calismaKur()));
    if (s.tur !== 'plan-kur') return assert.fail(s.tur);
    const dataVer = planGirdisi({ calisma: calismaKur(), kayit: KAYIT, kaynak: KAYNAK, bugun: '2026-10-19' })?.S['dataVer'];
    assert.equal(s.plan['dataVer'], dataVer);
    assert.deepEqual(Object.keys(s.plan['J'] as object).sort(), ['O1', 'O2']);
    assert.deepEqual(s.plan['fail'], []);
    assert.equal(typeof s.plan['lb'], 'number');
    const ozet = s.plan['ozet'] as { wT: number; n: number };
    assert.equal(ozet.n, 2);
    assert.ok(ozet.wT <= (s.plan['ilk'] as number) + 1e-9);
    // kayıtlı plan yalnız dondurma bölgesinde (dengeli: şimdiden 24 saat) kullanılır: orada başlayan iş yerinde kalır (eski sayfanın dengeKilit'i).
    // Kayıtlı plan 08:00'de kurulmuştur, şimdi 09:00: başlamayan O1 bölgenin gerisinde kalır. Plan bir saat ileri alınınca hiçbir iş geride değildir.
    type Yer = Record<string, { m: string; S: number; C: number }>;
    const c0 = planli(); const p0 = c0['plan'] as { ops: Yer };
    const ileri: Yer = Object.fromEntries(Object.entries(p0.ops).map(([id, o]) => [id, { ...o, S: o.S + 1, C: o.C + 1 }]));
    const c = { ...c0, plan: { ...p0, ops: ileri } }; const eski = ileri;
    const k = sonuc(await dene({ tur: 'plan-kur' }, c));
    if (k.tur !== 'plan-kur') return assert.fail(k.tur);
    const yeni = k.plan['ops'] as Yer;
    const bolge = Object.keys(eski).filter((id) => (eski[id]?.S ?? -1) >= 9 && (eski[id]?.S ?? 99) < 33);
    assert.ok(bolge.length > 0);
    for (const id of bolge) assert.deepEqual([yeni[id]?.m, yeni[id]?.S], [eski[id]?.m, eski[id]?.S], id);
    // 3447: geride iş (O1, 08:00'de başlayacaktı) şimdiye alınır, bölgedeki O2 sırasını koruyarak onun arkasına kayar. Eskiden O2 yerinde
    // kalır, O1 onun arkasına (ertesi güne) düşer ve canlıda O1'in önüne iş girmiş olurdu (4 saat kuralı, 248 a).
    const g = sonuc(await dene({ tur: 'plan-kur' }, c0));
    if (g.tur !== 'plan-kur') return assert.fail(g.tur);
    const gy = g.plan['ops'] as Yer;
    assert.equal(gy['O1.10']?.S, 9);
    assert.equal(gy['O2.10']?.S, gy['O1.10']?.C);
  });

  test('PD-19: planı kur gövdesi tur dışı alan almaz (iyileştirme kipi yok, 579 b)', () => {
    const q = (istek: unknown) => degerlendirmeGovdesi.safeParse({ surum: 3, istek }).success;
    assert.equal(q({ tur: 'plan-kur' }), true);
    assert.equal(q({ tur: 'plan-kur', kip: 'iyilestir' }), false);
    assert.equal(q({ tur: 'plan-uygula', isler: ['O1', '*'] }), true);
    assert.equal(q({ tur: 'plan-uygula', isler: [] }), false);
    assert.equal(q({ tur: 'plan-uygula' }), false);
  });

  test('PD-09: gövde: tur dışı alan, bilinmeyen tur, 20 üstü parti ve gövde dışı alan reddedilir', () => {
    const q = (istek: unknown) => degerlendirmeGovdesi.safeParse({ surum: 3, istek }).success;
    assert.equal(q({ tur: 'termin-uzatma', gun: 2 }), true);
    assert.equal(q({ tur: 'termin-uzatma', gun: 4 }), false);
    assert.equal(q({ tur: 'plan-secenekleri', calisma: {} }), false);
    assert.equal(q({ tur: 'yaz' }), false);
    assert.equal(q({ tur: 'parti-bolme', siparisId: 'O2', dagitim: 'ayni', adetler: Array.from({ length: 21 }, () => 1) }), false);
    assert.equal(degerlendirmeGovdesi.safeParse({ surum: 3, istek: { tur: 'plan-secenekleri' }, calisma: {} }).success, false);
  });
});

// İki tezgâh, sekiz emir: kural tabanlı plan gecikir, arama (457 1 b) gecikmeyi düşürür. Veriler uydurmadır.
const adim = (p: string, seq: number, st: string, cycle: number, setup: number) => ({ id: `${p}-o${String(seq)}`, seq, opNo: seq, opId: '13', stationId: st, setup, cycle, alts: [], altTimes: {}, ins: [] });
const BUYUK_KAYIT = {
  ...KAYIT,
  items: [{ id: '50', code: 'MM-1', name: 'Ornek mil', type: 'mamul' }, { id: '51', code: 'MM-2', name: 'Ornek burc', type: 'mamul' }],
  machines: [...KAYIT.machines, { id: '200', code: 'F1', name: 'Freze 1', stationId: '20', plan: tezgah('200', '20', 900) }],
  routes: { 50: { base: null, steps: [adim('50', 10, '10', 60, 60), adim('50', 20, '20', 90, 30)] }, 51: { base: null, steps: [adim('51', 10, '20', 50, 45), adim('51', 20, '10', 80, 30)] } },
  orders: Array.from({ length: 8 }, (_, i) => ({ id: `O${String(i)}`, no: `E-${String(i)}`, itemId: i % 2 ? '50' : '51', qty: 4 + ((i * 7) % 9), start: '2026-10-19',
    due: `2026-10-${String(20 + ((i * 5) % 6))}`, priority: 1 + (i % 3), status: 'serbest' })),
};
const BUYUK_KAYNAK = { ...KAYNAK, durum: { ...KAYNAK.durum,
  stations: [...KAYNAK.durum.stations, { id: '20', code: 'FRZ', name: 'Freze', wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true }],
  machines: [...KAYNAK.durum.machines, { id: '200', code: 'F1', name: 'Freze 1', stationId: '20', status: 'aktif', aktif: true }] } };
function buyukPlanli(): { calisma: Record<string, unknown>; kuralGecikme: number } {
  const c = calismaKur();
  const g = planGirdisi({ calisma: c, kayit: BUYUK_KAYIT, kaynak: BUYUK_KAYNAK, bugun: '2026-10-19' });
  assert.ok(g);
  const m = motorYukle(); const p = m.schedule(g.st, 'dagit', null);
  const e = m.evaluate(p, g.st, null, false) as { J: Record<string, { C: number; T: number }> };
  const J = Object.fromEntries(Object.entries(e.J).map(([k, x]) => [k, { C: x.C, T: x.T }]));
  return { calisma: { ...c, plan: { ops: p.ops, fail: [], J, dataVer: 1 } }, kuralGecikme: Object.values(J).reduce((a, x) => a + x.T, 0) };
}

// Planda öncülü bitmeden başlayan adım ve tezgâhta üst üste binen iş; boş liste plan geçerli demektir. Öncül, emrin bir önceki adımıdır.
type PlanIsi = { job: string; m: string; S: number; C: number };
function planBozuklari(ops: Record<string, PlanIsi>): string[] {
  const l: string[] = [];
  for (const [id, r] of Object.entries(ops)) { const q = ops[`${r.job}.${String(Number(id.split('.')[1]) - 10)}`]; if (q && r.S < q.C - 1e-6) l.push(`${id} ${String(r.S)} öncülü ${String(q.C)}'de bitmeden başlıyor`); }
  const tezgahlar: Record<string, [string, PlanIsi][]> = {}; for (const [id, r] of Object.entries(ops)) (tezgahlar[r.m] ??= []).push([id, r]);
  for (const t of Object.values(tezgahlar)) { t.sort((a, b) => a[1].S - b[1].S); for (let i = 1; i < t.length; i++) if (t[i]![1].S < t[i - 1]![1].C - 1e-6) l.push(`${t[i]![0]} ile ${t[i - 1]![0]} aynı tezgâhta üst üste`); }
  return l;
}
// Uzun rota: OA'nın n adımı torna ve freze arasında gidip gelir, her adım öncekinin bittiği saatte başlar. OB ve OC kısa emirlerdir.
function zincirKayit(n: number) {
  return { ...BUYUK_KAYIT,
    items: [...BUYUK_KAYIT.items, { id: '52', code: 'MM-3', name: 'Ornek govde', type: 'mamul' }],
    routes: { ...BUYUK_KAYIT.routes, 52: { base: null, steps: Array.from({ length: n }, (_, i) => adim('52', (i + 1) * 10, i % 2 ? '20' : '10', 30, 0)) } },
    orders: [{ id: 'OA', no: 'E-A', itemId: '52', qty: 4, start: '2026-10-19', due: '2026-10-21', priority: 2, status: 'serbest' },
      { id: 'OB', no: 'E-B', itemId: '50', qty: 2, start: '2026-10-19', due: '2026-10-30', priority: 1, status: 'serbest' },
      { id: 'OC', no: 'E-C', itemId: '51', qty: 2, start: '2026-10-19', due: '2026-10-30', priority: 1, status: 'serbest' }] };
}
function kuralPlanli(kayit: typeof BUYUK_KAYIT): Record<string, unknown> {
  const c = calismaKur();
  const g = planGirdisi({ calisma: c, kayit, kaynak: BUYUK_KAYNAK, bugun: '2026-10-19' });
  assert.ok(g);
  const m = motorYukle(); const p = m.schedule(g.st, 'dagit', null);
  const e = m.evaluate(p, g.st, null, false) as { J: Record<string, { C: number; T: number }> };
  return { ...c, plan: { ops: p.ops, fail: [], J: Object.fromEntries(Object.entries(e.J).map(([k, x]) => [k, { C: x.C, T: x.T }])), dataVer: 1 } };
}

describe('planlama değerlendirmesi: arama (457 1-3 b)', () => {
  test('PD-14: plan seçeneklerinde arama kural tabanlı planın gecikmesini düşürür; saat sabit adımlı olduğu için aynı girdi aynı sonucu verir', async () => {
    const { calisma, kuralGecikme } = buyukPlanli();
    const dene2 = () => degerlendirmeYap({ calisma, kayit: BUYUK_KAYIT, kaynak: BUYUK_KAYNAK, bugun: '2026-10-19', istek: { tur: 'plan-secenekleri' } }, AN);
    const a = await dene2();
    const s = sonuc(a); if (s.tur !== 'plan-secenekleri') return assert.fail(s.tur);
    for (const x of s.secenekler) assert.ok(x.gecikmeSaat < kuralGecikme, `${String(x.gecikmeSaat)} < ${String(kuralGecikme)}`);
    assert.deepEqual(await dene2(), a);
  });

  test('PD-20: bekleyen değişikliği uygula (755 a): yalnız verilen siparişin işleri oynar, ötekiler kayıtlı plandaki yerinde; plan yoksa ret', async () => {
    const { calisma } = buyukPlanli();
    const eski = (calisma['plan'] as { ops: Record<string, { job: string; m: string; S: number }> }).ops;
    const uygula = (isler: string[], c: unknown = calisma) => degerlendirmeYap({ calisma: c, kayit: BUYUK_KAYIT, kaynak: BUYUK_KAYNAK, bugun: '2026-10-19', istek: { tur: 'plan-uygula', isler } }, AN);
    const a = await uygula(['O3']);
    const s = sonuc(a); if (s.tur !== 'plan-uygula') return assert.fail(s.tur);
    const yeni = s.plan['ops'] as Record<string, { job: string; m: string; S: number }>;
    const oteki = Object.keys(eski).filter((id) => eski[id]?.job !== 'O3');
    assert.ok(oteki.length > 0);
    for (const id of oteki) assert.deepEqual([yeni[id]?.m, yeni[id]?.S], [eski[id]?.m, eski[id]?.S], id);
    assert.deepEqual(Object.keys(yeni).sort(), Object.keys(eski).sort(), 'işler düşmez');
    assert.deepEqual(await uygula(['O3']), a, 'aynı girdi aynı sonuç');
    const h = sonuc(await uygula(['*'])); if (h.tur !== 'plan-uygula') return assert.fail(h.tur);
    assert.ok((h.plan['ozet'] as { wT: number }).wT <= (h.plan['ilk'] as number) + 1e-9, 'hepsi: kayıtlı plandan kötü olmaz');
    assert.deepEqual(await uygula(['O3'], { ...calisma, plan: null }), { hata: 'plan-yok' });
  });

  // 3414-6 a: süren iş taşınınca durdurulmuş sayılır (w.durdurulan): gerçekleşen yeri sabitlenmez, kalan adedi kilitlendiği yere dizilir.
  test('PD-20c (3414-6 a): durdurulan süren iş kilitlendiği yere kalan adediyle dizilir ve sürüyor sayılmaz; işaret yokken yerinde kalır', async () => {
    type Is = { job: string; m: string; S: number; C: number; act?: number };
    const { calisma } = buyukPlanli();
    const eski = (calisma['plan'] as { ops: Record<string, Is> }).ops;
    const simdi = 20, hedef = 'O6.10';
    assert.ok(eski[hedef]!.S < simdi && eski[hedef]!.C > simdi, 'iş sürüyor olmalı');
    const adet = BUYUK_KAYIT.orders.find((x) => x.id === 'O6')!.qty;
    assert.ok(adet >= 2, 'yarısı sayılabilecek adet');
    const yeniS = eski[hedef]!.C + 24;
    const suren = (ek: Record<string, unknown>) => ({
      ...calisma, gercek: { [hedef]: { m: eski[hedef]!.m, S: eski[hedef]!.S, n: Math.floor(adet / 2), A: adet } },
      plan: { ...(calisma['plan'] as object), ops: { ...eski, [hedef]: { ...eski[hedef], act: 1, pin: 1 } } }, ...ek,
    });
    const an = Date.parse('2026-10-18T21:00:00Z') + simdi * 3_600_000;
    const uygula = (c: unknown) => degerlendirmeYap({ calisma: c, kayit: BUYUK_KAYIT, kaynak: BUYUK_KAYNAK, bugun: '2026-10-19', istek: { tur: 'plan-uygula', isler: ['O6'] } }, an);
    const w = calisma['w'] as Record<string, unknown>;
    const r = sonuc(await uygula(suren({ w: { ...w, durdurulan: { [hedef]: 1 } }, locks: { [hedef]: { m: eski[hedef]!.m, S: yeniS } } }))); if (r.tur !== 'plan-uygula') return assert.fail(r.tur);
    const yeni = r.plan['ops'] as Record<string, Is>;
    assert.equal(yeni[hedef]!.S, yeniS);
    assert.ok(!yeni[hedef]!.act, 'taşınan kalan sürüyor sayılmaz');
    assert.ok(Math.abs((yeni[hedef] as unknown as { run: number }).run - (eski[hedef] as unknown as { run: number }).run / 2) < 1e-6, 'kalan adet (yarısı) kadar işleme süresi');
    // Ardılı taşıma hesabı iter ve kilitler (tasima.test TH-14); burada yalnız motorun durdurulan işi nasıl dizdiği ölçülür.
    // İşaret yokken süren iş gerçekleşen yerinde kalır (kilit onu oynatmaz).
    const k = sonuc(await uygula(suren({ locks: { [hedef]: { m: eski[hedef]!.m, S: yeniS } } }))); if (k.tur !== 'plan-uygula') return assert.fail(k.tur);
    assert.equal((k.plan['ops'] as Record<string, Is>)[hedef]?.S, eski[hedef]!.S);
  });

  // Yarım planlı emir: bir işi planda, öteki dışarıda (plan kurulduktan sonra gelen adım ya da motorun yerleştiremediği iş).
  test('PD-20d: yarım planlı emrin eksik işi, emir yeniden planlanınca öncülünün arkasına yerleşir; öteki emirlerin işleri yerinde kalır', async () => {
    type Is = { job: string; m: string; S: number; C: number };
    const { calisma } = buyukPlanli();
    const plan = calisma['plan'] as { ops: Record<string, Is> };
    const eksik = 'O3.20';
    assert.ok(plan.ops[eksik] && plan.ops['O3.10']);
    const { [eksik]: _cikan, ...kalan } = plan.ops;
    const yarim = { ...calisma, plan: { ...plan, ops: kalan, fail: [eksik], failNeden: { [eksik]: { kod: 'zaman' } } } };
    const r = sonuc(await degerlendirmeYap({ calisma: yarim, kayit: BUYUK_KAYIT, kaynak: BUYUK_KAYNAK, bugun: '2026-10-19', istek: { tur: 'plan-uygula', isler: ['O3'] } }, AN));
    if (r.tur !== 'plan-uygula') return assert.fail(r.tur);
    const yeni = r.plan['ops'] as Record<string, Is>;
    assert.ok(yeni[eksik], 'eksik iş plana girdi');
    assert.ok(yeni[eksik].S >= yeni['O3.10']!.C - 1e-9, 'öncülünden sonra');
    assert.deepEqual(r.plan['fail'], []);
    for (const [id, x] of Object.entries(kalan)) if (x.job !== 'O3') assert.deepEqual([yeni[id]?.m, yeni[id]?.S], [x.m, x.S], id);
  });

  test('PD-20e: Vardiya planlı duruşu tezgâhın duruş satırı olur; yeniden planlanan iş duruşun içine yerleşmez; bakım okunmadıysa satır kalır', async () => {
    type Is = { m: string; S: number; C: number };
    // Salı 08:00-12:00 (çalışmanın ekseninde 32-36. saat); duruşsuz planda tezgâh o saatte doludur.
    const [a, b] = [32, 36];
    const icinde = (ops: Record<string, Is>) => Object.entries(ops).filter(([, x]) => x.m === '100' && x.S < b - 1e-9 && x.C > a + 1e-9).map(([id]) => id);
    assert.notDeepEqual(icinde((planli()['plan'] as { ops: Record<string, Is> }).ops), []);
    const durus = { anahtar: 'vd:7|100|2026-10-20 08:00|2026-10-20 12:00', m: '100', bas: '2026-10-20 08:00', bit: '2026-10-20 12:00', baslik: 'Bakım' };
    const kaynakIle = (ek: Record<string, unknown>): KaynakOkumasi => ({ ...KAYNAK, ek: { ...KAYNAK.ek, ...ek } }) as unknown as KaynakOkumasi;
    const g = planGirdisi({ calisma: planli(), kayit: KAYIT, kaynak: kaynakIle({ planliDuruslar: [durus] }), bugun: '2026-10-19' });
    assert.ok(g);
    const satir = (S: Record<string, unknown>) => (S['down'] as Record<string, unknown>[]).map((d) => [d['m'], d['from'], d['to'], d['neden'], d['baslik'], d['oto'], d['bakim']]);
    assert.deepEqual(satir(g.S), [['100', a, b, 'planlı duruş', 'Bakım', 1, durus.anahtar]]);
    assert.ok(g.kaynakDegisikligi?.alanlar.includes('ariza'));
    const r = sonuc(await degerlendirmeYap({ calisma: planli(), kayit: KAYIT, kaynak: kaynakIle({ planliDuruslar: [durus] }), bugun: '2026-10-19', istek: { tur: 'plan-uygula', isler: ['*'] } }, AN));
    if (r.tur !== 'plan-uygula') return assert.fail(r.tur);
    // Duruş çalışma saati değildir: hiçbir iş duruşun içinde başlamaz; duruşu aşan iş duruş kadar geç biter (iş duruşta bekler).
    const yeni = r.plan['ops'] as Record<string, Is>;
    assert.deepEqual(Object.entries(yeni).filter(([, x]) => x.m === '100' && x.S >= a - 1e-9 && x.S < b - 1e-9).map(([id]) => id), []);
    for (const id of icinde(yeni)) assert.ok(yeni[id]!.C >= b + (b - a) - 1e-9, `${id} duruşta çalışmış sayıldı`);
    assert.deepEqual(r.plan['fail'], []);
    // İki liste ayrı okunur: bakım listesi (boş ya da okunmadı) planlı duruş satırını silmez; duruş listeden çıkınca satır düşer.
    for (const ek of [{ planliDuruslar: [durus], bakimlar: [] }, { planliDuruslar: null, bakimlar: [] }, { bakimlar: null }]) {
      assert.equal(satir(planGirdisi({ calisma: g.S, kayit: KAYIT, kaynak: kaynakIle(ek), bugun: '2026-10-19' })!.S).length, 1, JSON.stringify(ek));
    }
    const ileride = { ...durus, anahtar: 'vd:7|100|2099-10-20 08:00|2099-10-20 12:00', bas: '2099-10-20 08:00', bit: '2099-10-20 12:00' };
    const g2 = planGirdisi({ calisma: planli(), kayit: KAYIT, kaynak: kaynakIle({ planliDuruslar: [ileride] }), bugun: '2026-10-19' })!;
    assert.equal(satir(g2.S).length, 1);
    assert.deepEqual(satir(planGirdisi({ calisma: g2.S, kayit: KAYIT, kaynak: kaynakIle({ planliDuruslar: [] }), bugun: '2026-10-19' })!.S), []);
  });

  // 3335-2b: başlaması geçmiş, başlamamış iş motor için "çalışıyor" gibidir ve yerinde kalır; kişi o emri yeniden planlarsa şimdiden sonraya dizilir.
  test('PD-20b (3335-2b): yeniden planlanan emrin geride kalan işi şimdiden sonraya taşınır, ardılı ondan sonra başlar; istenmeyen emrin geride işi, elle kilitli ve başlamış iş yerinde kalır', async () => {
    type Is = { job: string; m: string; S: number; C: number };
    const { calisma } = buyukPlanli();
    const eski = (calisma['plan'] as { ops: Record<string, Is> }).ops;
    // Şimdi 20. saat: O6.10 (12-37) ve O0.20 (12-34) geride kalır (başlangıcı geçmiş, bitişi gelmemiş, başlamamış). O0.10 bitmiş kayıtlıdır;
    // yoksa öncülü yapılmamış O0.20 zaten yeniden dizilirdi (B-2499-7) ve ölçümü bulandırırdı.
    const simdi = 20, hedef = 'O6.10', sonraki = 'O6.20', oteki = 'O0.20';
    for (const id of [hedef, oteki]) assert.ok(eski[id]!.S < simdi && eski[id]!.C > simdi, `${id} geride değil`);
    const bitmis = { 'O0.10': { m: eski['O0.10']!.m, S: eski['O0.10']!.S, C: eski['O0.10']!.C } };
    Object.assign(calisma, { gercek: bitmis });
    const an = Date.parse('2026-10-18T21:00:00Z') + simdi * 3_600_000;
    const uygula = (isler: string[], c: unknown = calisma) => degerlendirmeYap({ calisma: c, kayit: BUYUK_KAYIT, kaynak: BUYUK_KAYNAK, bugun: '2026-10-19', istek: { tur: 'plan-uygula', isler } }, an);
    const z = zarf(await uygula([eski[hedef]!.job]));
    assert.equal(z.simdi, simdi);
    const s = degerlendirmeSonucu.parse(z.sonuc); if (s.tur !== 'plan-uygula') return assert.fail(s.tur);
    const yeni = s.plan['ops'] as Record<string, Is>;
    assert.ok(yeni[hedef]!.S >= simdi - 1e-6, `geride iş şimdiden sonra: ${String(yeni[hedef]?.S)} >= ${String(simdi)}`);
    assert.ok(yeni[sonraki]!.S >= yeni[hedef]!.C - 1e-6, `ardıl öncülünden sonra: ${String(yeni[sonraki]?.S)} >= ${String(yeni[hedef]?.C)}`);
    assert.deepEqual([yeni[oteki]?.m, yeni[oteki]?.S], [eski[oteki]?.m, eski[oteki]?.S], 'istenmeyen emrin geride işi yerinde');
    // Başvuru planı: geride iş başvurudan çıkar, değişiklik sayısına girmez; yalnız ardılı (O6.20) değişmiş sayılır. Başlangıcı gelecekte olan
    // ardıl geride sayılmaz (başvuruda kalır, sayılır); öteki emirler geçici kilitlidir, sayılmaz.
    assert.equal((s.plan['ozet'] as { chg: number }).chg, 1);
    // Bütün plan: iki geride iş de taşınır.
    const h = sonuc(await uygula(['*'])); if (h.tur !== 'plan-uygula') return assert.fail(h.tur);
    const hepsi = h.plan['ops'] as Record<string, Is>;
    for (const id of [hedef, oteki]) assert.ok(hepsi[id]!.S >= simdi - 1e-6, `${id} şimdiden sonra`);
    // Başlangıcı gelecekte olan iş geride sayılmaz: geride işi olmayan emrin denge penceresindeki işi kilidini korur, yerinde kalır;
    // geride olmayıp yeri değişenler başvuruda kalır, değişiklik sayısına girer.
    for (const id of ['O4.10', 'O2.10']) assert.deepEqual([hepsi[id]?.m, hepsi[id]?.S], [eski[id]?.m, eski[id]?.S], id);
    assert.ok((h.plan['ozet'] as { chg: number }).chg > 1);
    // Elle kilitli geride iş yerinde kalır.
    const kilitli = sonuc(await uygula(['*'], { ...calisma, locks: { [hedef]: { m: eski[hedef]!.m, S: eski[hedef]!.S } } })); if (kilitli.tur !== 'plan-uygula') return assert.fail(kilitli.tur);
    assert.equal((kilitli.plan['ops'] as Record<string, Is>)[hedef]?.S, eski[hedef]!.S);
    // Fason, başlamış (act) ya da bitmiş (done) diye kayıtlı geride iş yerinde kalır.
    const isaretli = (ek: Record<string, number>) => ({ ...calisma, plan: { ...(calisma['plan'] as object), ops: { ...eski, [hedef]: { ...eski[hedef], ...ek } } } });
    for (const ek of [{ fas: 1 }, { act: 1 }, { done: 1 }] as Record<string, number>[]) {
      const r = sonuc(await uygula([eski[hedef]!.job], isaretli(ek))); if (r.tur !== 'plan-uygula') return assert.fail(r.tur);
      assert.equal((r.plan['ops'] as Record<string, Is>)[hedef]?.S, eski[hedef]!.S, JSON.stringify(ek));
    }
    // Geride işin elle kilitli ardılı: kilidi ve saati durur (geçici kilit kalkar, elle kilit kalkmaz); geride iş yine şimdiden sonraya gider.
    const ardilKilitli = sonuc(await uygula([eski[hedef]!.job], { ...calisma, locks: { [sonraki]: { m: eski[sonraki]!.m, S: eski[sonraki]!.S } } })); if (ardilKilitli.tur !== 'plan-uygula') return assert.fail(ardilKilitli.tur);
    const ak = ardilKilitli.plan['ops'] as Record<string, Is>;
    assert.equal(ak[sonraki]?.S, eski[sonraki]!.S);
    assert.ok(ak[hedef]!.S >= simdi - 1e-6);
    // Başlamış (gerçekleşeni olan) iş yerinde kalır.
    const baslamis = sonuc(await uygula(['*'], { ...calisma, gercek: { ...bitmis, [hedef]: { m: eski[hedef]!.m, S: eski[hedef]!.S } } })); if (baslamis.tur !== 'plan-uygula') return assert.fail(baslamis.tur);
    assert.equal((baslamis.plan['ops'] as Record<string, Is>)[hedef]?.S, eski[hedef]!.S);
    // Başlamış iş geride sayılmadığı için emrinin denge kilitleri de kalkmaz: ardılı yerinde kalır.
    assert.equal((baslamis.plan['ops'] as Record<string, Is>)[sonraki]?.S, eski[sonraki]!.S);
  });

  test('PD-31 (3498): paralel bölünen adım denge bölgesinde yerinde tutulunca bölünmüş kalır; payı düşmez, ardılı paylardan önce başlamaz', async () => {
    type Is = { job: string; m: string; S: number; C: number };
    // İki torna, tek emir: OP 10 paralel bölünür (iki pay, iki tornada), OP 20 frezede ikisini bekler.
    const kayit = { ...BUYUK_KAYIT,
      machines: [...BUYUK_KAYIT.machines, { id: '101', code: 'T2', name: 'Torna 2', stationId: '10', plan: tezgah('101', '10', 750) }],
      routes: { 50: { base: null, steps: [{ ...adim('50', 10, '10', 30, 0), split: 'bol', minLot: 1 }, adim('50', 20, '20', 15, 0)] } },
      orders: [{ id: 'O1', no: 'E-1', itemId: '50', qty: 8, start: '2026-10-19', due: '2026-10-23', priority: 2, status: 'serbest' }] };
    const kaynak = { ...BUYUK_KAYNAK, durum: { ...BUYUK_KAYNAK.durum, machines: [...BUYUK_KAYNAK.durum.machines, { id: '101', code: 'T2', name: 'Torna 2', stationId: '10', status: 'aktif', aktif: true }] } };
    const kur = (c: unknown) => degerlendirmeYap({ calisma: c, kayit, kaynak, bugun: '2026-10-19', istek: { tur: 'plan-kur' } }, AN);
    const ilk = sonuc(await kur(calismaKur())); if (ilk.tur !== 'plan-kur') return assert.fail(ilk.tur);
    const eski = ilk.plan['ops'] as Record<string, Is>;
    assert.deepEqual(Object.keys(eski).sort(), ['O1.10', 'O1.10~2', 'O1.20'], 'OP 10 iki paya bölünür');
    assert.notEqual(eski['O1.10']!.m, eski['O1.10~2']!.m);
    // Kayıtlı planın üstüne yeniden kur: bütün işler bölgededir (şimdiden 24 saat), yerinde tutulur.
    const k = sonuc(await kur({ ...calismaKur(), plan: ilk.plan })); if (k.tur !== 'plan-kur') return assert.fail(k.tur);
    const yeni = k.plan['ops'] as Record<string, Is>;
    assert.deepEqual(k.plan['fail'], []);
    for (const id of Object.keys(eski)) assert.deepEqual([yeni[id]?.m, yeni[id]?.S, yeni[id]?.C], [eski[id]!.m, eski[id]!.S, eski[id]!.C], id);
    assert.ok(yeni['O1.20']!.S >= Math.max(yeni['O1.10']!.C, yeni['O1.10~2']!.C) - 1e-6, 'ardıl iki payı da bekler');
  });

  test('PD-32 (3498): değişikliği uygula: istenmeyen emrin saati geçmiş, başlamamış adımı yeniden dizilince ardılı eski yerinde kalmaz; öncülü yerinde olan işler yerinde kalır', async () => {
    type Is = { job: string; m: string; S: number; C: number };
    const { calisma } = buyukPlanli();
    const eski = (calisma['plan'] as { ops: Record<string, Is> }).ops;
    // Şimdi 60. saat. O0 ve O6.10 bitmiş, O6.20 sürüyor. O4.10 (37-58) hiç başlamamış, saati geçmiş: şimdiden sonraya yeniden dizilir;
    // ardılı O4.20 (83'te) eski yerinde kalsaydı öncülü bitmeden başlardı. O4 istenen emir değildir (istenen O7).
    const simdi = 60, gecmis = 'O4.10', ardil = 'O4.20';
    assert.ok(eski[gecmis]!.C <= simdi && eski[ardil]!.S > simdi, 'örnek plan değişmiş');
    const bitti = (id: string) => ({ m: eski[id]!.m, S: eski[id]!.S, C: eski[id]!.C });
    const gercek = { 'O0.10': bitti('O0.10'), 'O0.20': bitti('O0.20'), 'O6.10': bitti('O6.10'), 'O6.20': { m: eski['O6.20']!.m, S: eski['O6.20']!.S } };
    const an = Date.parse('2026-10-18T21:00:00Z') + simdi * 3_600_000;
    const z = zarf(await degerlendirmeYap({ calisma: { ...calisma, gercek }, kayit: BUYUK_KAYIT, kaynak: BUYUK_KAYNAK, bugun: '2026-10-19', istek: { tur: 'plan-uygula', isler: ['O7'] } }, an));
    assert.equal(z.simdi, simdi);
    const s = degerlendirmeSonucu.parse(z.sonuc); if (s.tur !== 'plan-uygula') return assert.fail(s.tur);
    const yeni = s.plan['ops'] as Record<string, Is>;
    assert.deepEqual(s.plan['fail'], []);
    assert.ok(yeni[gecmis]!.S >= simdi - 1e-6, `saati geçmiş adım şimdiden sonra: ${String(yeni[gecmis]?.S)}`);
    assert.ok(yeni[ardil]!.S >= yeni[gecmis]!.C - 1e-6, `ardıl öncülünden sonra: ${String(yeni[ardil]?.S)} >= ${String(yeni[gecmis]?.C)}`);
    // Hiçbir adım öncülünden önce başlamaz, tezgâhta iki iş üst üste gelmez.
    for (const [id, y] of Object.entries(yeni)) if (id.endsWith('.20')) { const p = yeni[id.replace(/\.20$/, '.10')]; if (p) assert.ok(y.S >= p.C - 1e-6, `${id} öncülünden önce`); }
    const tezgahlar: Record<string, Is[]> = {}; for (const y of Object.values(yeni)) (tezgahlar[y.m] ??= []).push(y);
    for (const l of Object.values(tezgahlar)) { l.sort((a, b) => a.S - b.S); for (let i = 1; i < l.length; i++) assert.ok(l[i]!.S >= l[i - 1]!.C - 1e-6, `tezgâh ${l[i]!.m} ${String(l[i]!.S)} < ${String(l[i - 1]!.C)}`); }
    // Yalnız tutulamayan iş serbest kalır: öncülü yerinde olan öteki emirlerin gelecekteki işleri kayıtlı plandaki yerindedir.
    for (const id of ['O3.10', 'O3.20', 'O2.20', 'O1.10', 'O1.20', 'O5.10', 'O5.20']) assert.deepEqual([yeni[id]?.m, yeni[id]?.S], [eski[id]!.m, eski[id]!.S], id);
  });

  // Şimdi 10,5. saat: OA.10 (8-10) hiç başlamamış, saati geçmiş; şimdiden sonraya yeniden dizilir. Rota bitişik olduğu için her adım bir
  // sonrakini iter: ardılların hepsi eski yerinde tutulamaz. OA istenen emir değildir (istenen OB); OC'nin öncülü yerindedir.
  const zincirUygula = async (n: number) => {
    const kayit = zincirKayit(n), calisma = kuralPlanli(kayit);
    const eski = (calisma['plan'] as { ops: Record<string, PlanIsi> }).ops;
    const simdi = 10.5, son = `OA.${String(n * 10)}`;
    assert.ok(eski['OA.10']!.C <= simdi && eski['OA.30']!.S > simdi, 'örnek plan değişmiş');
    const an = Date.parse('2026-10-18T21:00:00Z') + simdi * 3_600_000;
    const s = sonuc(await degerlendirmeYap({ calisma, kayit, kaynak: BUYUK_KAYNAK, bugun: '2026-10-19', istek: { tur: 'plan-uygula', isler: ['OB'] } }, an));
    if (s.tur !== 'plan-uygula') return assert.fail(s.tur);
    const yeni = s.plan['ops'] as Record<string, PlanIsi>;
    assert.deepEqual(s.plan['fail'], []);
    assert.ok(yeni['OA.10']!.S >= simdi - 1e-6, `saati geçmiş adım şimdiden sonra: ${String(yeni['OA.10']?.S)}`);
    assert.deepEqual(planBozuklari(yeni), []);
    assert.ok(yeni[son]!.S > eski[son]!.S, 'kayma rotanın son adımına ulaşır');
    for (const id of ['OC.10', 'OC.20']) assert.deepEqual([yeni[id]?.m, yeni[id]?.S], [eski[id]!.m, eski[id]!.S], id);
  };
  test('PD-33 (3498): değişikliği uygula: bitişik rotada kayma adım adım ilerler; her ardıl öncülünden sonra başlar, öteki emir yerinde kalır', () => zincirUygula(8));

  test('PD-34 (3498): değişikliği uygula: geç başlayıp süren işin tezgâhında sırası gelmiş, başlamamış iş çalışıyor sayılmaz; süren iş bitince başlar, plan geçerli kalır', async () => {
    const { calisma } = buyukPlanli();
    const eski = (calisma['plan'] as { ops: Record<string, PlanIsi> }).ops;
    // Şimdi 38. saat. O6.10 (planda 12-37) 34'te başlamış, sürüyor: kalan işiyle 59'da biter. Aynı tezgâhtaki O4.10 (37-58) başlamamış;
    // eski yerinde çalışıyor sayılsaydı süren işle üst üste gelirdi. İkisi de istenen emir değildir (istenen O7).
    const simdi = 38, suren = 'O6.10', bekleyen = 'O4.10';
    assert.ok(eski[bekleyen]!.m === eski[suren]!.m && eski[bekleyen]!.S < simdi && eski[bekleyen]!.C > simdi, 'örnek plan değişmiş');
    const bitti = (id: string) => ({ m: eski[id]!.m, S: eski[id]!.S, C: eski[id]!.C });
    const gercek = { 'O0.10': bitti('O0.10'), 'O0.20': bitti('O0.20'), [suren]: { m: eski[suren]!.m, S: 34 } };
    const an = Date.parse('2026-10-18T21:00:00Z') + simdi * 3_600_000;
    const s = sonuc(await degerlendirmeYap({ calisma: { ...calisma, gercek }, kayit: BUYUK_KAYIT, kaynak: BUYUK_KAYNAK, bugun: '2026-10-19', istek: { tur: 'plan-uygula', isler: ['O7'] } }, an));
    if (s.tur !== 'plan-uygula') return assert.fail(s.tur);
    const yeni = s.plan['ops'] as Record<string, PlanIsi>;
    assert.deepEqual(s.plan['fail'], []);
    assert.equal(yeni[suren]!.S, 34);
    assert.ok(yeni[suren]!.C > eski[bekleyen]!.S, 'süren iş bekleyenin eski saatinden sonra bitiyor');
    assert.ok(yeni[bekleyen]!.S >= yeni[suren]!.C - 1e-6, `bekleyen iş süren iş bitince: ${String(yeni[bekleyen]?.S)} >= ${String(yeni[suren]?.C)}`);
    assert.deepEqual(planBozuklari(yeni), []);
  });

  test('PD-35 (3498): değişikliği uygula: 140 adımlı bitişik rotada da plan geçerli döner; yalnız kayan emrin işleri serbest kalır, öteki emir yerinde', () => zincirUygula(140));

  test('PD-30 (3233 a): plana yeni giren emir tek başına dizilir, yerleşmiş öteki işler tezgâhı ve başlangıcıyla yerinde kalır; plan kur bütün işleri yeniden dizer', async () => {
    type Is = { job: string; m: string; S: number };
    const yedi = { ...BUYUK_KAYIT, orders: BUYUK_KAYIT.orders.slice(0, 7) };
    const c = calismaKur();
    const g = planGirdisi({ calisma: c, kayit: yedi, kaynak: BUYUK_KAYNAK, bugun: '2026-10-19' });
    assert.ok(g);
    const m = motorYukle(); const p = m.schedule(g.st, 'dagit', null);
    const e = m.evaluate(p, g.st, null, false) as { J: Record<string, { C: number; T: number }> };
    const calisma = { ...g.S, plan: { ops: p.ops, fail: [], J: Object.fromEntries(Object.entries(e.J).map(([k, x]) => [k, { C: x.C, T: x.T }])), dataVer: g.S['dataVer'] } };
    const eski = p.ops as unknown as Record<string, Is>;
    assert.ok(Object.values(eski).every((r) => r.job !== 'O7'), 'yeni emir kayıtlı planda yok');
    const iste = (istek: DegerlendirmeIstegi) => degerlendirmeYap({ calisma, kayit: BUYUK_KAYIT, kaynak: BUYUK_KAYNAK, bugun: '2026-10-19', istek }, AN);

    const u = sonuc(await iste({ tur: 'plan-uygula', isler: ['O7'] })); if (u.tur !== 'plan-uygula') return assert.fail(u.tur);
    const yeni = u.plan['ops'] as Record<string, Is>;
    const yerlesen = Object.values(yeni).filter((r) => r.job === 'O7');
    assert.equal(yerlesen.length, 2, 'yeni emrin iki adımı da plana girer');
    for (const r of yerlesen) assert.ok(Number.isFinite(r.S), JSON.stringify(r));
    assert.ok(Object.keys(eski).length > 0);
    for (const id of Object.keys(eski)) assert.deepEqual([yeni[id]?.m, yeni[id]?.S], [eski[id]?.m, eski[id]?.S], id);

    const k = sonuc(await iste({ tur: 'plan-kur' })); if (k.tur !== 'plan-kur') return assert.fail(k.tur);
    const kur = k.plan['ops'] as Record<string, Is>;
    assert.deepEqual(Object.keys(kur).sort(), Object.keys(yeni).sort(), 'plan kur bütün işleri dizer');
    assert.ok(Object.keys(eski).some((id) => kur[id]?.m !== eski[id]?.m || kur[id]?.S !== eski[id]?.S), 'plan kur kayıtlı yerlere bağlı kalmaz: en az bir iş yer değiştirir');
  });

  test('PD-15: süre kuyruğa girişten sayılır: süre biterse iş parçacığı durdurulur, sırası gelene süre kalmadıysa koşmadan reddedilir (ikisi de meşgul)', async () => {
    const { calisma } = buyukPlanli();
    const g = { calisma, kayit: BUYUK_KAYIT, kaynak: BUYUK_KAYNAK, bugun: '2026-10-19', istek: { tur: 'plan-secenekleri' } as const };
    const uzun = degerlendirmeYap(g, AN, 50);
    const sirada = degerlendirmeYap(g, AN, 1);
    await assert.rejects(uzun, /ms içinde bitmedi/);
    await assert.rejects(sirada, (e: Error) => e.message === MESGUL);
  });
});

// Hamleler bayat planı reddeder: kayıtlı plan veriyle aynı sürümde olmalı. Kaynak birleşmesi sürümü artırır; kararlı olana dek yinelenir (PD-21).
function guncelPlanli(kayit = BUYUK_KAYIT, kaynak = BUYUK_KAYNAK, ek: Record<string, unknown> = {}): Record<string, unknown> {
  let S: Record<string, unknown> = { ...calismaKur(), ...ek };
  let g = planGirdisi({ calisma: S, kayit, kaynak, bugun: '2026-10-19' });
  for (let i = 0; i < 4 && g && g.S['dataVer'] !== S['dataVer']; i++) { S = g.S; g = planGirdisi({ calisma: S, kayit, kaynak, bugun: '2026-10-19' }); }
  assert.ok(g && g.S['dataVer'] === S['dataVer'], 'birleşme kararlı');
  const m = motorYukle(); const p = m.schedule(g.st, 'dagit', null);
  const e = m.evaluate(p, g.st, null, false) as { J: Record<string, { C: number; T: number }> };
  return { ...S, plan: { ops: p.ops, fail: [], J: Object.fromEntries(Object.entries(e.J).map(([k, x]) => [k, { C: x.C, T: x.T }])), dataVer: S['dataVer'] } };
}

describe('planlama değerlendirmesi: çıkış denetimi (3499)', () => {
  // Şimdi 38. saat. O6.10 (planda 12-37) 34'te başlamış, sürüyor: 59'da biter. Aynı tezgâhtaki O4.10 (37-58) başlamamış, O2.10 58'de sırada.
  // Kayıtlı planı çözen her hesap O4.10'u eski yerinde çalışıyor sayar; onarılmazsa süren işle üst üste gelir.
  const SIMDI = 38, AN38 = Date.parse('2026-10-18T21:00:00Z') + SIMDI * 3_600_000;
  function suren(ek: Record<string, unknown> = {}): { calisma: Record<string, unknown>; eski: Record<string, PlanIsi> } {
    const c = guncelPlanli(); const eski = (c['plan'] as { ops: Record<string, PlanIsi> }).ops;
    assert.ok(eski['O4.10']!.m === eski['O6.10']!.m && eski['O4.10']!.S < SIMDI && eski['O4.10']!.C > SIMDI, 'örnek plan değişmiş');
    const bitti = (id: string) => ({ m: eski[id]!.m, S: eski[id]!.S, C: eski[id]!.C });
    return { calisma: { ...c, gercek: { 'O0.10': bitti('O0.10'), 'O0.20': bitti('O0.20'), 'O6.10': { m: eski['O6.10']!.m, S: 34 } }, ...ek }, eski };
  }
  const iste = (calisma: unknown, istek: DegerlendirmeIstegi) => degerlendirmeYap({ calisma, kayit: BUYUK_KAYIT, kaynak: BUYUK_KAYNAK, bugun: '2026-10-19', istek }, AN38);

  const planOps = (x: Record<string, unknown> | null | undefined): Record<string, PlanIsi> => { assert.ok(x, 'plan döndü'); return x['ops'] as Record<string, PlanIsi>; };
  const gecikmesi = (x: Record<string, unknown> | null): number => (x?.['ozet'] as { wT: number }).wT;

  test('CD-01: sıra değiştir: tezgâhta öne alınan adımın ardından gelen plan sıraya aykırı adım ve çakışan iş taşımaz; istenen sıra tutulur', async () => {
    const c = guncelPlanli(); const eski = (c['plan'] as { ops: Record<string, PlanIsi> }).ops;
    const kuyruk = Object.entries(eski).filter(([, r]) => r.m === '100').sort((x, y) => x[1].S - y[1].S).map((x) => x[0]);
    assert.deepEqual(kuyruk, ['O0.20', 'O6.20', 'O4.20', 'O3.10', 'O2.20', 'O7.10', 'O1.10', 'O5.10'], 'örnek plan değişmiş');
    const sira = ['O3.10', 'O0.20', 'O6.20', 'O4.20', 'O2.20', 'O7.10', 'O1.10', 'O5.10'];
    const s = sonuc(await degerlendirmeYap({ calisma: c, kayit: BUYUK_KAYIT, kaynak: BUYUK_KAYNAK, bugun: '2026-10-19', istek: { tur: 'sira-degistir', tezgah: '100', sira } }, AN));
    if (s.tur !== 'sira-degistir') return assert.fail(s.tur);
    assert.equal(s.neden, null);
    assert.deepEqual(s.sira, sira);
    assert.deepEqual(planBozuklari(planOps(s.plan)), []);
  });

  test('CD-02: öne al ve iyileştir: süren işin tezgâhında sırası gelmiş, başlamamış iş çalışıyor sayılmaz; plan geçerli döner', async () => {
    const { calisma } = suren();
    const o = sonuc(await iste(calisma, { tur: 'one-al', siparisId: 'O1' })); if (o.tur !== 'one-al') return assert.fail(o.tur);
    const i = sonuc(await iste(calisma, { tur: 'plan-iyilestir' })); if (i.tur !== 'plan-iyilestir') return assert.fail(i.tur);
    for (const [ad, x] of [['öne al', o.plan], ['iyileştir', i.plan]] as const) {
      const yeni = planOps(x);
      assert.equal(yeni['O6.10']!.S, 34, ad);
      assert.ok(yeni['O4.10']!.S >= yeni['O6.10']!.C - 1e-6, `${ad}: bekleyen iş süren iş bitince: ${String(yeni['O4.10']?.S)} >= ${String(yeni['O6.10']?.C)}`);
      assert.deepEqual(planBozuklari(yeni), [], ad);
    }
  });

  test('CD-03: parti böl (dağıt): başka tornaya verilen parti öncülü bitmeden başlamaz, verildiği tornada kalır', async () => {
    const kayit = { ...BUYUK_KAYIT, machines: [...BUYUK_KAYIT.machines, { id: '101', code: 'T2', name: 'Torna 2', stationId: '10', plan: tezgah('101', '10', 750) }] };
    const kaynak = { ...BUYUK_KAYNAK, durum: { ...BUYUK_KAYNAK.durum, machines: [...BUYUK_KAYNAK.durum.machines, { id: '101', code: 'T2', name: 'Torna 2', stationId: '10', status: 'aktif', aktif: true }] } };
    const s = sonuc(await degerlendirmeYap({ calisma: guncelPlanli(kayit, kaynak), kayit, kaynak, bugun: '2026-10-19', istek: { tur: 'parti-bolme', siparisId: 'O2', dagitim: 'dag', adetler: [4, 5] } }, AN));
    if (s.tur !== 'parti-bolme' || !s.sonuc) return assert.fail(s.tur);
    assert.deepEqual(s.sonuc.partiler.map((x) => x.makineId), [null, '101']);
    const yeni = planOps(s.sonuc.plan);
    assert.equal(yeni['O2/2.20']!.m, '101');
    assert.deepEqual(planBozuklari(yeni), []);
  });

  test('CD-04: plan seçenekleri: saati geçmiş, başlamamış adımın ardılları bölgede eski yerinde kilitlenip öncülünden önce başlamaz', async () => {
    const kayit = zincirKayit(8), calisma = kuralPlanli(kayit);
    const an = Date.parse('2026-10-18T21:00:00Z') + 10.5 * 3_600_000;
    const s = sonuc(await degerlendirmeYap({ calisma, kayit, kaynak: BUYUK_KAYNAK, bugun: '2026-10-19', istek: { tur: 'plan-secenekleri' } }, an));
    if (s.tur !== 'plan-secenekleri') return assert.fail(s.tur);
    assert.ok(s.secenekler.length > 0);
    for (const x of s.secenekler) { const yeni = planOps(x.plan); assert.ok(yeni['OA.10']!.S >= 10.5 - 1e-6, String(x.denge)); assert.deepEqual(planBozuklari(yeni), [], `denge ${String(x.denge)}`); }
  });

  test('CD-06: termin seçenekleri ve termin uzatma: karşılaştırılan planlar aynı ölçüyle kurulur', async () => {
    const { calisma } = suren();
    const t = sonuc(await iste(calisma, { tur: 'termin-secenekleri', siparisId: 'O1' })); if (t.tur !== 'termin-secenekleri') return assert.fail(t.tur);
    // Girilen termin satırı bugünkü terminle kurulur: taban planla aynı plandır, öteki emirlerin gecikmesi değişmez.
    const girilen = t.satirlar.find((x) => x.secenek === 'girilen');
    assert.ok(girilen, 'girilen termin satırı var');
    assert.ok(girilen.digerGecikmeFarki != null && Math.abs(girilen.digerGecikmeFarki) < 1e-6, String(girilen.digerGecikmeFarki));
    // Bu veride termini iki gün uzatılan emir yerinden oynamaz, öteki emirler de öne gelmez: toplam gecikme en çok 48 saat azalır.
    const u = sonuc(await iste(calisma, { tur: 'termin-uzatma', gun: 2 })); if (u.tur !== 'termin-uzatma') return assert.fail(u.tur);
    assert.ok(u.satirlar.length > 0);
    for (const x of u.satirlar) assert.ok(x.gecikmeSaatFarki <= 48 + 1e-6, `${x.siparisId}: ${String(x.gecikmeSaatFarki)}`);
  });

  test('CD-07: iyileştir: önceki gecikme onarılmış plandan ölçülür; bildirilen iyileşme gerçektir', async () => {
    // Şimdi 60. saat, hiçbir iş bildirilmemiş: kayıtlı planın saati geçmiş işleri yeniden dizilir. Onarılmamış plan olduğundan az gecikmeli görünür.
    const an = Date.parse('2026-10-18T21:00:00Z') + 60 * 3_600_000;
    const i = sonuc(await degerlendirmeYap({ calisma: guncelPlanli(), kayit: BUYUK_KAYIT, kaynak: BUYUK_KAYNAK, bugun: '2026-10-19', istek: { tur: 'plan-iyilestir' } }, an));
    if (i.tur !== 'plan-iyilestir') return assert.fail(i.tur);
    assert.deepEqual(planBozuklari(planOps(i.plan)), []);
    assert.ok(i.gecikmeSonra != null && i.gecikmeSonra < i.gecikmeOnce, `${String(i.gecikmeSonra)} < ${String(i.gecikmeOnce)}`);
    assert.equal(gecikmesi(i.plan), i.gecikmeSonra);
  });

  test('CD-08: parti böl: kişinin kilitlediği adım bölününce kilit ilk partide kalır, partiler üst üste gelmez', async () => {
    const c = guncelPlanli(); const eski = (c['plan'] as { ops: Record<string, PlanIsi> }).ops; const k = eski['O2.20']!;
    const calisma = { ...c, locks: { 'O2.20': { m: k.m, S: k.S } } };
    const s = sonuc(await degerlendirmeYap({ calisma, kayit: BUYUK_KAYIT, kaynak: BUYUK_KAYNAK, bugun: '2026-10-19', istek: { tur: 'parti-bolme', siparisId: 'O2', dagitim: 'ayni', adetler: [4, 5] } }, AN));
    if (s.tur !== 'parti-bolme' || !s.sonuc) return assert.fail(s.tur);
    const yeni = planOps(s.sonuc.plan);
    assert.deepEqual([yeni['O2/1.20']!.m, yeni['O2/1.20']!.S], [k.m, k.S], 'kilit ilk partide');
    assert.deepEqual(planBozuklari(yeni), []);
    assert.deepEqual((s.sonuc.plan['warn'] as { t: string }[]).filter((w) => w.t === 'cakisma'), []);
  });

  test('CD-09: parti böl: elle bölünmüş adımın bölme kaydı ilk partide kalır; ilk parti aynı tezgâhlara bölünür, öteki parti bölünmez', async () => {
    const kayit = { ...BUYUK_KAYIT, machines: [...BUYUK_KAYIT.machines, { id: '101', code: 'T2', name: 'Torna 2', stationId: '10', plan: tezgah('101', '10', 750) }] };
    const kaynak = { ...BUYUK_KAYNAK, durum: { ...BUYUK_KAYNAK.durum, machines: [...BUYUK_KAYNAK.durum.machines, { id: '101', code: 'T2', name: 'Torna 2', stationId: '10', status: 'aktif', aktif: true }] } };
    const calisma = guncelPlanli(kayit, kaynak, { elleBol: { 'O2.20': [{ adet: 6, m: '100' }, { adet: 3, m: '101' }] } });
    const eski = (calisma['plan'] as { ops: Record<string, PlanIsi> }).ops;
    assert.deepEqual([eski['O2.20']!.m, eski['O2.20~2']!.m], ['100', '101'], 'kayıtlı planda adım elle bölünmüş');
    const s = sonuc(await degerlendirmeYap({ calisma, kayit, kaynak, bugun: '2026-10-19', istek: { tur: 'parti-bolme', siparisId: 'O2', dagitim: 'ayni', adetler: [6, 3] } }, AN));
    if (s.tur !== 'parti-bolme' || !s.sonuc) return assert.fail(s.tur);
    const yeni = planOps(s.sonuc.plan);
    assert.deepEqual([yeni['O2/1.20']!.m, yeni['O2/1.20~2']?.m], ['100', '101'], 'ilk parti kişinin böldüğü tezgâhlarda');
    assert.equal(yeni['O2/2.20~2'], undefined, 'öteki parti bölünmez');
    assert.ok(yeni['O2/2.20'], 'öteki parti planda');
    assert.deepEqual(planBozuklari(yeni), []);
    // Bölünmüş payın kilidi de ilk partinin payında kalır: sahipsiz kalmaz, pay kilit saatinde durur.
    const k = eski['O2.20~2']!;
    const kilitli = sonuc(await degerlendirmeYap({ calisma: { ...calisma, locks: { 'O2.20~2': { m: k.m, S: k.S + 2 } } }, kayit, kaynak, bugun: '2026-10-19', istek: { tur: 'parti-bolme', siparisId: 'O2', dagitim: 'ayni', adetler: [6, 3] } }, AN));
    if (kilitli.tur !== 'parti-bolme' || !kilitli.sonuc) return assert.fail(kilitli.tur);
    const kp = planOps(kilitli.sonuc.plan);
    assert.deepEqual([kp['O2/1.20~2']?.m, kp['O2/1.20~2']?.S], [k.m, k.S + 2], 'payın kilidi ilk partide (vardiya içinde: vardiya dışı kilit ilk açık ana kayar, 3601)');
    assert.deepEqual(planBozuklari(kp), []);
  });
  test('CD-10: parti böl: adıma bildirilen bekleme her partide geçerlidir, ek süre ilk partide kalır', async () => {
    // İki torna: partiler ayrı tezgâha dağıtılınca ikinci parti ilkini beklemez; beklemesi yoksa erken başlar.
    const kayit = { ...BUYUK_KAYIT, machines: [...BUYUK_KAYIT.machines, { id: '101', code: 'T2', name: 'Torna 2', stationId: '10', plan: tezgah('101', '10', 750) }] };
    const kaynak = { ...BUYUK_KAYNAK, durum: { ...BUYUK_KAYNAK.durum, machines: [...BUYUK_KAYNAK.durum.machines, { id: '101', code: 'T2', name: 'Torna 2', stationId: '10', status: 'aktif', aktif: true }] } };
    // Kayıtlı plan bildirimden önce kurulmuştur: adım kayıtta beklemeden önce, ek süresiz durur.
    const kayitli = guncelPlanli(kayit, kaynak);
    const bol = async (w: Record<string, unknown>, dagitim: 'ayni' | 'dag'): Promise<Record<string, PlanIsi>> => {
      const calisma = { ...kayitli, w: { ...(kayitli['w'] as Record<string, unknown>), ...w } };
      const s = sonuc(await degerlendirmeYap({ calisma, kayit, kaynak, bugun: '2026-10-19', istek: { tur: 'parti-bolme', siparisId: 'O2', dagitim, adetler: [6, 3] } }, AN));
      if (s.tur !== 'parti-bolme' || !s.sonuc) return assert.fail(s.tur);
      const y = planOps(s.sonuc.plan); assert.deepEqual(planBozuklari(y), []); return y;
    };
    const dagitik = await bol({}, 'dag');
    assert.notEqual(dagitik['O2/1.20']!.m, dagitik['O2/2.20']!.m, 'partiler ayrı tezgâhta');
    // Bekleme: yalın ölçümde iki parti de bu andan önce başlar.
    const kadar = Math.max(dagitik['O2/1.20']!.S, dagitik['O2/2.20']!.S) + 40;
    const bekleyen = await bol({ adimBekle: { 'O2.20': { kadar, neden: 'malzeme' } } }, 'dag');
    assert.ok(bekleyen['O2/1.20']!.S >= kadar && bekleyen['O2/2.20']!.S >= kadar, `iki parti de beklemeden sonra başlar: ${String(bekleyen['O2/1.20']?.S)}, ${String(bekleyen['O2/2.20']?.S)} >= ${String(kadar)}`);
    // Ek süre 9 saat: gerçek bölmede kayıt üst emirde kalır; ölçümde de ilk parti 9 saat uzar, ikinci parti uzamaz.
    const sure = (r: PlanIsi): number => (r as PlanIsi & { run: number }).run;
    const yalin = await bol({}, 'ayni'), ekli = await bol({ adimEk: { 'O2.20': { ekSaat: 9, bitis0: null } } }, 'ayni');
    assert.ok(Math.abs(sure(ekli['O2/1.20']!) - sure(yalin['O2/1.20']!) - 9) < 1e-6, `ilk parti 9 saat uzar: ${String(sure(ekli['O2/1.20']!) - sure(yalin['O2/1.20']!))}`);
    assert.equal(sure(ekli['O2/2.20']!), sure(yalin['O2/2.20']!), 'ikinci parti uzamaz');
  });

  test('CD-05: kişinin kilidi süren işle üst üste geliyorsa süren iş yerinde kalır, kilitli iş onun arkasına kayar ve uyarıda söylenir (3538 b)', async () => {
    const { calisma, eski } = suren({ locks: { 'O4.10': { m: '200', S: 39 } } });
    assert.equal(eski['O4.10']!.m, '200');
    const s = sonuc(await iste(calisma, { tur: 'plan-uygula', isler: ['O7'] })); if (s.tur !== 'plan-uygula') return assert.fail(s.tur);
    const yeni = planOps(s.plan);
    assert.ok(yeni['O6.10']!.C > 39, 'süren iş kilit saatinden sonra bitiyor');
    assert.equal(yeni['O6.10']!.S, 34, 'süren iş yerinde');
    assert.ok(Math.abs(yeni['O4.10']!.S - yeni['O6.10']!.C) < 1e-6, `kilitli iş süren işin bitişinde: ${String(yeni['O4.10']!.S)}`);
    assert.deepEqual(JSON.parse(JSON.stringify((yeni['O4.10'] as unknown as { why: unknown }).why)), { t: 'kilit-kaydi', r: 'O6.10', o: 39 });
    const uyari = s.plan['warn'] as { t: string; id?: string; txt: string }[];
    assert.deepEqual(uyari.filter((w) => w.t === 'cakisma'), [], 'çakışma kalmadı');
    assert.deepEqual(uyari.filter((w) => w.id === 'O4.10').map((w) => w.t), ['kilit']);
    assert.match(uyari.find((w) => w.id === 'O4.10')!.txt, /^O4\.10: tezgâhta süren O6\.10 uzadı; kilit .+ yerine .+ saatine kaydı$/);
    // Bitmiş O0.10'un bildirilen bitişi, aynı tezgâhta süren O6.10'un başlangıcından (34) sonra: ikisi de geçmiştir, uyarı konusu değildir.
    const gecmis = suren(); (gecmis.calisma['gercek'] as Record<string, { m: string; S: number; C?: number }>)['O0.10'] = { m: eski['O0.10']!.m, S: eski['O0.10']!.S, C: 36 };
    assert.equal(eski['O0.10']!.m, eski['O6.10']!.m);
    const temiz = sonuc(await iste(gecmis.calisma, { tur: 'plan-uygula', isler: ['O7'] })); if (temiz.tur !== 'plan-uygula') return assert.fail(temiz.tur);
    assert.deepEqual((temiz.plan['warn'] as { t: string }[]).filter((w) => w.t === 'cakisma'), [], 'geçerli planda bu uyarı yok');
  });
});

describe('planlama değerlendirmesi: çok başlangıçlı ilk yerleştirme (3500)', () => {
  // 32 emir, üç ürün, iki tezgâh; üçüncü ürünün ayarı uzun, işlemi kısa. Varsayılan kural ayarı (k1 2, k2 0,6) bu veride en iyi ilk planı vermez.
  const kayit = { ...BUYUK_KAYIT,
    items: [...BUYUK_KAYIT.items, { id: '52', code: 'MM-3', name: 'Ornek govde', type: 'mamul' }],
    routes: { ...BUYUK_KAYIT.routes, 52: { base: null, steps: [adim('52', 10, '10', 20, 150), adim('52', 20, '20', 35, 120)] } },
    orders: Array.from({ length: 32 }, (_, i) => ({ id: `O${String(i)}`, no: `E-${String(i)}`, itemId: ['50', '51', '52'][i % 3]!, qty: 3 + ((i * 7) % 11), start: '2026-10-19',
      due: `2026-10-${String(20 + ((i * 5) % 9))}`, priority: 1 + (i % 3), status: 'serbest' })) };
  const iste = (sure: number, istek: DegerlendirmeIstegi) => degerlendirmeYap({ calisma: { ...calismaKur(), w: { famK: 0.3, mat: 'sert', dondurma: 4, sure } }, kayit, kaynak: BUYUK_KAYNAK, bugun: '2026-10-19', istek }, AN);
  const gecikme = (plan: Record<string, unknown>): number => (plan['ozet'] as { wT: number }).wT;
  // Bütçe bir ek dizmeye yetmeyecek kadar kısa: tek ayarla dizilir, arama da koşmaz; dönen plan varsayılan ayarın ilk planıdır.
  const varsayilan = async (): Promise<number> => {
    const s = sonuc(await iste(0.001, { tur: 'plan-kur' })); if (s.tur !== 'plan-kur') return assert.fail(s.tur);
    assert.equal(gecikme(s.plan), s.plan['ilk'], 'kısa bütçede ek ayar denenmez');
    return gecikme(s.plan);
  };

  test('CB-01: planı kur ilk planı birkaç kural ayarıyla dizer, en iyisinden arar; "ilk" varsayılan ayarın gecikmesidir, aynı girdi aynı sonucu verir', async () => {
    const ilk = await varsayilan();
    const a = await iste(0.6, { tur: 'plan-kur' });
    const s = sonuc(a); if (s.tur !== 'plan-kur') return assert.fail(s.tur);
    assert.equal(s.plan['ilk'], ilk);
    assert.ok(gecikme(s.plan) <= ilk * 0.96, `${String(gecikme(s.plan))} <= ${String(ilk * 0.96)}`);
    assert.deepEqual(planBozuklari(s.plan['ops'] as Record<string, PlanIsi>), []);
    assert.deepEqual(await iste(0.6, { tur: 'plan-kur' }), a);
  });

  test('CB-02: plan seçenekleri de ilk planı birkaç kural ayarıyla dizer', async () => {
    const ilk = await varsayilan();
    const s = sonuc(await iste(0.6, { tur: 'plan-secenekleri' })); if (s.tur !== 'plan-secenekleri') return assert.fail(s.tur);
    assert.ok(s.secenekler.length > 0);
    for (const x of s.secenekler) assert.ok(gecikme(x.plan) <= ilk * 0.96, `denge ${String(x.denge)}: ${String(gecikme(x.plan))} <= ${String(ilk * 0.96)}`);
  });

  // Motorun saati sabit adımlıdır: hesaptan sonra bağlamın saati hesabın harcadığı iş miktarını verir. Motor sunucudaki gibi boş bağlamda yüklenir.
  const harcanan = (istek: Record<string, unknown>, kural?: string): number => {
    const b = vm.createContext({ GIRDI_SAAT_DILIMI: TESIS_SAAT_DILIMI }); b['self'] = b;
    const m = vm.runInContext(degerlendirmeKodu(), b) as { degerlendir: (...a: unknown[]) => unknown };
    assert.ok(m.degerlendir({ ...calismaKur(), w: { famK: 0.3, mat: 'sert', dondurma: 4, sure: 0.6, ...(kural ? { rule: kural } : {}) } }, kayit, BUYUK_KAYNAK, '2026-10-19', AN, istek));
    return (vm.runInContext('Date.now()', b) as number) - AN;
  };

  test('CB-03: ek dizmelerin bedeli arama payından düşer, hesap süre ayarını aşmaz; ATCS dışı kuralda tek dizme yapılır, arama payı tam kalır', () => {
    // Süre ayarı 0,6 sn (600 adımlık iş); plan seçeneklerinin payı 1500'dür. Arama son diliminde payı biraz aşar: bedel düşülmezse aşım ek dizmeler kadar büyür.
    const kur = harcanan({ tur: 'plan-kur' }), secenek = harcanan({ tur: 'plan-secenekleri', sira: 0 });
    assert.ok(kur < 600, `planı kur ${String(kur)} < 600`);
    assert.ok(secenek < 1500, `plan seçenekleri ${String(secenek)} < 1500`);
    // Öteki kurallar katsayı kullanmaz: ek dizme aynı planı verir, payı boşa yer.
    const kurEdd = harcanan({ tur: 'plan-kur' }, 'edd'), secenekEdd = harcanan({ tur: 'plan-secenekleri', sira: 0 }, 'edd');
    assert.ok(kurEdd >= 600, `planı kur, EDD ${String(kurEdd)} >= 600`);
    assert.ok(secenekEdd >= 1500, `plan seçenekleri, EDD ${String(secenekEdd)} >= 1500`);
  });
});

describe('planlama değerlendirmesi: takvim kendiliğinden uzar (3501 a)', () => {
  // Ufuk 28 gün: takvim 56 gündür, torna hafta içi günde 8 saat açıktır (sekiz haftada 320 saat). OU'nun tek adımı 400 saat sürer.
  const W = { famK: 0.3, mat: 'sert', dondurma: 4, sure: 0.3, ufukGun: 28, dilimDk: 15 };
  const TAKVIM_SONU = 56 * 24;
  const uzunKayit = (hazirlikDk: number, adet: number) => ({ ...BUYUK_KAYIT,
    items: [...BUYUK_KAYIT.items, { id: '52', code: 'MM-3', name: 'Ornek govde', type: 'mamul' }],
    routes: { ...BUYUK_KAYIT.routes, 52: { base: null, steps: [adim('52', 10, '10', 60, hazirlikDk)] } },
    orders: [...BUYUK_KAYIT.orders, { id: 'OU', no: 'E-U', itemId: '52', qty: adet, start: '2026-10-19', due: '2026-11-20', priority: 3, status: 'serbest' }] });
  type Kayit = { ops: Record<string, PlanIsi & { ufukDisi?: number }>; fail: string[]; failNeden: Record<string, { kod: string; tani?: { alt: string; ufukGun?: number } }> };
  const kayitOf = (plan: unknown): Kayit => plan as Kayit;
  // Hamleler güncel plan ister: çalışma kaynakla birleşip kararlı olunca kurulan plan kaydedilir.
  async function kurulu(kayit: ReturnType<typeof uzunKayit>): Promise<Record<string, unknown>> {
    let S: Record<string, unknown> = { ...calismaKur(), w: W };
    let g = planGirdisi({ calisma: S, kayit, kaynak: BUYUK_KAYNAK, bugun: '2026-10-19' });
    for (let i = 0; i < 4 && g && g.S['dataVer'] !== S['dataVer']; i++) { S = g.S; g = planGirdisi({ calisma: S, kayit, kaynak: BUYUK_KAYNAK, bugun: '2026-10-19' }); }
    assert.ok(g && g.S['dataVer'] === S['dataVer'], 'birleşme kararlı');
    const s = sonuc(await degerlendirmeYap({ calisma: S, kayit, kaynak: BUYUK_KAYNAK, bugun: '2026-10-19', istek: { tur: 'plan-kur' } }, AN));
    if (s.tur !== 'plan-kur') return assert.fail(s.tur);
    return { ...S, plan: s.plan };
  }

  test('UT-01: adım takvim bittiği için sığmıyorsa takvim büyür; adım gerçek bitişiyle yerleşir, ufuk dışı saati yazılır, aynı girdi aynı sonucu verir', async () => {
    const kayit = uzunKayit(0, 400);
    const iste = () => degerlendirmeYap({ calisma: { ...calismaKur(), w: W }, kayit, kaynak: BUYUK_KAYNAK, bugun: '2026-10-19', istek: { tur: 'plan-kur' } }, AN);
    const a = await iste(); const s = sonuc(a); if (s.tur !== 'plan-kur') return assert.fail(s.tur);
    const k = kayitOf(s.plan);
    assert.deepEqual(k.fail, []);
    assert.ok(k.ops['OU.10']!.C > TAKVIM_SONU, `uzun adım 56 günlük takvimin ötesinde biter: ${String(k.ops['OU.10']?.C)}`);
    assert.ok((k.ops['OU.10']!.ufukDisi ?? 0) > 0, 'ufuk dışı saati yazılır');
    assert.equal(Object.keys(k.ops).length, 17);
    assert.deepEqual(planBozuklari(k.ops), []);
    assert.deepEqual(await iste(), a);
  });

  test('UT-02: takvimle geçmeyen neden takvimi büyütmez: hazırlığı hiçbir vardiyaya sığmayan adım yerleşmez, tanı 56 günlük takvimi gösterir', async () => {
    const s = sonuc(await degerlendirmeYap({ calisma: { ...calismaKur(), w: W }, kayit: uzunKayit(600, 4), kaynak: BUYUK_KAYNAK, bugun: '2026-10-19', istek: { tur: 'plan-kur' } }, AN));
    if (s.tur !== 'plan-kur') return assert.fail(s.tur);
    const k = kayitOf(s.plan);
    assert.deepEqual(k.fail, ['OU.10']);
    assert.equal(k.failNeden['OU.10']!.kod, 'zaman');
    assert.equal(k.failNeden['OU.10']!.tani!.alt, 'hazirlik');
    assert.equal(k.failNeden['OU.10']!.tani!.ufukGun, 56);
  });

  test('UT-03: büyümüş takvimle kurulmuş plan üstünde değişikliği uygula ve öne al uzun adımı düşürmez; iyileştirme eski gecikmeyi uzun adımla ölçer', async () => {
    const kayit = uzunKayit(0, 400); const c = await kurulu(kayit);
    const kayitli = c['plan'] as { ozet: { wT: number } };
    assert.ok(kayitOf(kayitli).ops['OU.10']!.C > TAKVIM_SONU, 'kayıtlı planda uzun adım takvimin ötesinde');
    const iste = (istek: DegerlendirmeIstegi) => degerlendirmeYap({ calisma: c, kayit, kaynak: BUYUK_KAYNAK, bugun: '2026-10-19', istek }, AN);
    const u = sonuc(await iste({ tur: 'plan-uygula', isler: ['*'] })); if (u.tur !== 'plan-uygula') return assert.fail(u.tur);
    const o = sonuc(await iste({ tur: 'one-al', siparisId: 'O1' })); if (o.tur !== 'one-al') return assert.fail(o.tur);
    for (const [ad, x] of [['uygula', u.plan], ['öne al', o.plan]] as const) {
      const k = kayitOf(x);
      assert.deepEqual(k.fail, [], ad);
      assert.ok(k.ops['OU.10']!.C > TAKVIM_SONU, `${ad}: ${String(k.ops['OU.10']?.C)}`);
      assert.deepEqual(planBozuklari(k.ops), [], ad);
    }
    // Uzun adım geç kalır. Kayıtlı plan dar takvimle çözülseydi adım düşer, eski gecikme onsuz ölçülürdü.
    const i = sonuc(await iste({ tur: 'plan-iyilestir' })); if (i.tur !== 'plan-iyilestir') return assert.fail(i.tur);
    assert.ok(Math.abs(i.gecikmeOnce - kayitli.ozet.wT) < 1e-6, `${String(i.gecikmeOnce)} = ${String(kayitli.ozet.wT)}`);
    assert.ok(Math.abs(o.gecikmeOnce - kayitli.ozet.wT) < 1e-6, `${String(o.gecikmeOnce)} = ${String(kayitli.ozet.wT)}`);
  });
  test('UT-04: hamle bir adımı takvimin ötesine iterse takvim büyür: duruş girilmiş planda öne al uzun adımı düşürmez', async () => {
    // OU'nun hazırlığı 6, işlemi 225 saat: kayıtlı plan 56 günlük takvimin son iş gününde biter. Tornaya iki günlük duruş girilince sığmaz.
    const kayit = uzunKayit(360, 225); const c = await kurulu(kayit);
    const eski = kayitOf(c['plan']);
    assert.deepEqual(eski.fail, []);
    assert.ok(eski.ops['OU.10']!.C <= TAKVIM_SONU && eski.ops['OU.10']!.C > TAKVIM_SONU - 72, `kayıtlı planda uzun adım takvimin son iş gününde biter: ${String(eski.ops['OU.10']?.C)}`);
    const duruslu = { ...c, down: [{ id: 'd1', m: '100', from: 16 * 24, to: 18 * 24, neden: 'ariza' }] };
    const o = sonuc(await degerlendirmeYap({ calisma: duruslu, kayit, kaynak: BUYUK_KAYNAK, bugun: '2026-10-19', istek: { tur: 'one-al', siparisId: 'O1' } }, AN));
    if (o.tur !== 'one-al') return assert.fail(o.tur);
    const k = kayitOf(o.plan);
    assert.deepEqual(k.fail, []);
    assert.ok(k.ops['OU.10']!.C > TAKVIM_SONU, `uzun adım takvimin ötesinde biter: ${String(k.ops['OU.10']?.C)}`);
    assert.deepEqual(planBozuklari(k.ops), []);
  });
  test('UT-05: takvim en çok 730 güne büyür: iki yıla sığmayan adım yerleşmez, tanı 730 günlük takvimi gösterir', async () => {
    // 730 günde torna 104 hafta, 4160 saat açıktır; adım 4300 saat sürer.
    const s = sonuc(await degerlendirmeYap({ calisma: { ...calismaKur(), w: W }, kayit: uzunKayit(0, 4300), kaynak: BUYUK_KAYNAK, bugun: '2026-10-19', istek: { tur: 'plan-kur' } }, AN));
    if (s.tur !== 'plan-kur') return assert.fail(s.tur);
    const k = kayitOf(s.plan);
    assert.deepEqual(k.fail, ['OU.10']);
    assert.equal(k.failNeden['OU.10']!.tani!.alt, 'sure');
    assert.equal(k.failNeden['OU.10']!.tani!.ufukGun, 730);
    assert.equal(Object.keys(k.ops).length, 16, 'öteki adımlar yerleşir');
  });

  test('UT-06: büyüyen takvim sonraki hesaba taşmaz: aynı bağlamda ardından gelen hesap ayardaki takvimle başlar', () => {
    const b = vm.createContext({ GIRDI_SAAT_DILIMI: TESIS_SAAT_DILIMI }); b['self'] = b;
    const m = vm.runInContext(degerlendirmeKodu(), b) as { degerlendir: (...a: unknown[]) => { sonuc: { plan: unknown } } };
    const kur = (kayit: unknown): Kayit => kayitOf(JSON.parse(JSON.stringify(m.degerlendir({ ...calismaKur(), w: W }, kayit, BUYUK_KAYNAK, '2026-10-19', AN, { tur: 'plan-kur' }).sonuc.plan)));
    assert.ok(kur(uzunKayit(0, 400)).ops['OU.10']!.C > TAKVIM_SONU, 'ilk hesap takvimi büyütür');
    assert.equal(kur(uzunKayit(600, 4)).failNeden['OU.10']!.tani!.ufukGun, 56);
  });

  // UT-04'ün verisi: kayıtlı plan takvimin son iş gününde biter, sonradan tornaya iki günlük duruş girilir.
  async function duruslu(): Promise<{ kayit: ReturnType<typeof uzunKayit>; c: Record<string, unknown> }> {
    const kayit = uzunKayit(360, 225); const c = await kurulu(kayit);
    return { kayit, c: { ...c, down: [{ id: 'd1', m: '100', from: 16 * 24, to: 18 * 24, neden: 'ariza' }] } };
  }
  test('UT-07: plan kaydı döndürmeyen ölçü de uzun adımı sayar: duruş girilmiş planda iyileştirmenin ve değişmeyen sıranın eski gecikmesi, öne çekmenin tabanı', async () => {
    const { kayit, c } = await duruslu();
    const iste = (istek: DegerlendirmeIstegi) => degerlendirmeYap({ calisma: c, kayit, kaynak: BUYUK_KAYNAK, bugun: '2026-10-19', istek }, AN);
    const o = sonuc(await iste({ tur: 'one-al', siparisId: 'O1' })); if (o.tur !== 'one-al') return assert.fail(o.tur);
    assert.ok(o.plan, 'öne al plan döndürür: eski gecikmesi büyümüş takvimle ölçülür');
    const i = sonuc(await iste({ tur: 'plan-iyilestir' })); if (i.tur !== 'plan-iyilestir') return assert.fail(i.tur);
    assert.ok(Math.abs(i.gecikmeOnce - o.gecikmeOnce) < 1e-6, `iyileştir ${String(i.gecikmeOnce)} = ${String(o.gecikmeOnce)}`);
    const sira = Object.entries(kayitOf(c['plan']).ops).filter(([, r]) => r.m === '100').sort(([, x], [, y]) => x.S - y.S).map(([id]) => id);
    const s = sonuc(await iste({ tur: 'sira-degistir', tezgah: '100', sira })); if (s.tur !== 'sira-degistir') return assert.fail(s.tur);
    assert.equal(s.plan, null, s.neden ?? '');
    assert.ok(Math.abs(s.gecikmeOnce - o.gecikmeOnce) < 1e-6, `sıra ${String(s.gecikmeOnce)} = ${String(o.gecikmeOnce)}`);
    const m = sonuc(await iste({ tur: 'malzeme-one-cekme' })); if (m.tur !== 'malzeme-one-cekme') return assert.fail(m.tur);
    assert.equal(m.taban.yerlesmeyen, 0);
  });

  // Motor sunucudaki gibi boş bağlamda yüklenir. Üst düzey işlevler bağlam nesnesindedir: sarılınca motorun kendi çağrıları da sayılır.
  // turlar: her hesap turundaki arama sayısı; buyume: her büyümeden önceki takvim günü.
  function izli(): { hesap: (calisma: unknown, kayit: unknown, istek: Record<string, unknown>) => unknown; turlar: number[]; buyume: number[] } {
    const b = vm.createContext({ GIRDI_SAAT_DILIMI: TESIS_SAAT_DILIMI }); b['self'] = b;
    const m = vm.runInContext(degerlendirmeKodu(), b) as { degerlendir: (...a: unknown[]) => unknown };
    const turlar: number[] = [], buyume: number[] = [];
    const sar = (ad: string, once: () => void): void => { const asil = b[ad] as (...a: unknown[]) => unknown; b[ad] = (...a: unknown[]) => { once(); return asil(...a); }; };
    sar('tekHesap', () => { turlar.push(0); });
    sar('lns', () => { turlar[turlar.length - 1]!++; });
    sar('takvimBuyut', () => { buyume.push(vm.runInContext('HDAYS', b) as number); });
    return { hesap: (calisma, kayit, istek) => m.degerlendir(calisma, kayit, BUYUK_KAYNAK, '2026-10-19', AN, istek), turlar, buyume };
  }
  test('UT-08: takvim aramadan önce yoklanır: atılacak turda arama yapılmaz', async () => {
    const { kayit, c } = await duruslu();
    const istekler: [string, unknown, unknown, Record<string, unknown>][] = [
      ['planı kur', { ...calismaKur(), w: W }, uzunKayit(0, 400), { tur: 'plan-kur' }],
      ['uygula', c, kayit, { tur: 'plan-uygula', isler: ['*'] }], ['iyileştir', c, kayit, { tur: 'plan-iyilestir' }],
      ['öne al', c, kayit, { tur: 'one-al', siparisId: 'O1' }], ['partiyi böl', c, kayit, { tur: 'parti-bolme', siparisId: 'O1', dagitim: 'ayni', adetler: [6, 5] }],
      ['plan seçenekleri', c, kayit, { tur: 'plan-secenekleri', sira: 0 }],
    ];
    for (const [ad, calisma, k, istek] of istekler) {
      const z = izli(); assert.ok(z.hesap(calisma, k, istek), ad);
      assert.ok(z.turlar.length >= 2, `${ad}: takvim büyür (${String(z.turlar.length)} tur)`);
      assert.equal(z.turlar.slice(0, -1).reduce((a, x) => a + x, 0), 0, `${ad}: ${z.turlar.join(', ')}`);
    }
  });
  test('UT-09: takvim her büyümede iki katına çıkar, 730 günde durur', () => {
    const z = izli(); assert.ok(z.hesap({ ...calismaKur(), w: W }, uzunKayit(0, 4300), { tur: 'plan-kur' }));
    assert.equal(z.buyume.join(', '), '56, 112, 224, 448');
    assert.equal(z.turlar.length, 5);
  });
  test('UT-10: malzemesi takvimin ötesinde gelecek adım düşmez: takvim büyür, adım malzemenin gelişinden sonra yerleşir', async () => {
    // Çubuğun stoğu yok; açık siparişi 70. günde gelir (takvim 56 gün).
    const k0 = uzunKayit(0, 4);
    const kayit = { ...k0, items: [...k0.items, { id: 'H9', code: 'H9', name: 'Ornek cubuk', type: 'ham', unit: 'kg', cost: 10, stock: 0, plan: { kod: 'H9', ad: 'Ornek cubuk', birim: 'kg', stok: 0, birimFiyat: 10, tedarikGun: 5, muayeneGun: 0 } }],
      routes: { ...k0.routes, 52: { base: null, steps: [{ ...adim('52', 10, '10', 60, 0), ins: [{ id: 'n9', itemId: 'H9', qty: 1 }] }] } } };
    const kaynak = { ...BUYUK_KAYNAK, ek: { ...BUYUK_KAYNAK.ek, acikSiparisler: [{ kod: 'H9', miktar: 50, tarih: '2026-12-28', siparisNo: 'SA-1' }] } };
    const r = await degerlendirmeYap({ calisma: { ...calismaKur(), w: W }, kayit, kaynak, bugun: '2026-10-19', istek: { tur: 'plan-kur' } }, AN);
    const s = sonuc(r); if (s.tur !== 'plan-kur') return assert.fail(s.tur);
    const k = kayitOf(s.plan);
    assert.deepEqual(k.fail, []);
    assert.ok(k.ops['OU.10']!.S >= 70 * 24, `adım malzeme gelince başlar: ${String(k.ops['OU.10']?.S)}`);
    assert.deepEqual(planBozuklari(k.ops), []);
  });
  test('UT-11: fason adımın çıkış günü takvime sığmıyorsa adım düşmez: takvim büyür', async () => {
    // Fason yalnız pazartesi çıkar. Torna adımı takvimin son haftasında, son pazartesinin çıkış saatinden sonra biter: ilk çıkış günü takvimin ötesindedir.
    const k0 = uzunKayit(0, 215);
    const kayit = { ...k0, routes: { ...k0.routes, 52: { base: null, steps: [adim('52', 10, '10', 60, 0),
      { id: '52-o20', seq: 20, opNo: 20, opId: '13', stationId: null, fasonId: '5', terminGun: 7, setup: null, cycle: null, alts: [], altTimes: {}, ins: [] }] } } };
    const kaynak = { ...BUYUK_KAYNAK, durum: { ...BUYUK_KAYNAK.durum, fasonFirms: [{ id: '5', name: 'Ornek fason' }] } };
    // Çıkış günü çalışmanın ayarıdır; kayıt okunmuş sayılsın ki ayar aynı kimlikte korunsun.
    const c0 = calismaKur();
    const calisma = { ...c0, w: W, rrSavedAt: kayit.savedAt, D: { ...(c0['D'] as Record<string, unknown>), fasoncular: [{ id: '5', ad: 'Ornek fason', kapasite: null, sureGun: 7, cikisGunleri: ['pzt'], cikisSaat: 16 }] } };
    const r = await degerlendirmeYap({ calisma, kayit, kaynak, bugun: '2026-10-19', istek: { tur: 'plan-kur' } }, AN);
    const s = sonuc(r); if (s.tur !== 'plan-kur') return assert.fail(s.tur);
    const k = kayitOf(s.plan);
    assert.deepEqual(k.fail, []);
    assert.ok(k.ops['OU.10']!.C <= TAKVIM_SONU, `torna adımı takvimin içinde biter: ${String(k.ops['OU.10']?.C)}`);
    assert.equal(k.ops['OU.20']!.m, '@5');
    assert.ok(k.ops['OU.20']!.C > TAKVIM_SONU, `fason takvimin ötesinde döner: ${String(k.ops['OU.20']?.C)}`);
    assert.deepEqual(planBozuklari(k.ops), []);
  });
});

describe('planlama değerlendirmesi: elle kilitli adımın öncülü (3502)', () => {
  // Üç adımlı ürün: uzun torna, kısa freze, kısa torna. Kilit üçüncü adıma konur.
  const kayit = { ...BUYUK_KAYIT,
    items: [...BUYUK_KAYIT.items, { id: '53', code: 'MM-4', name: 'Ornek flans', type: 'mamul' }],
    routes: { ...BUYUK_KAYIT.routes, 53: { base: null, steps: [adim('53', 10, '10', 120, 30), adim('53', 20, '20', 30, 15), adim('53', 30, '10', 30, 15)] } },
    orders: [...BUYUK_KAYIT.orders, { id: 'OK', no: 'E-K', itemId: '53', qty: 2, start: '2026-10-19', due: '2026-11-20', priority: 1, status: 'serbest' }] };
  const kur = async (sure: number, locks: Record<string, { m: string; S: number }>): Promise<Record<string, PlanIsi & { why: { t: string; r?: string } | null }>> => {
    const s = sonuc(await degerlendirmeYap({ calisma: { ...calismaKur(), w: { famK: 0.3, mat: 'sert', dondurma: 4, sure }, locks }, kayit, kaynak: BUYUK_KAYNAK, bugun: '2026-10-19', istek: { tur: 'plan-kur' } }, AN));
    if (s.tur !== 'plan-kur') return assert.fail(s.tur);
    return s.plan['ops'] as Record<string, PlanIsi & { why: { t: string; r?: string } | null }>;
  };

  test('KZ-01: kilitli adımın öncülü, önceliği düşük olsa da kilit saatinden önce biter; kilit yerinde kalır, arama bunu bozmaz', async () => {
    const p0 = await kur(0.001, {});
    // Kilitsiz planda son sıralarda yapılan iş: ikinci adımı, birinci adımın o plandaki başlangıcına kilitlenir.
    const x = Object.keys(p0).filter((id) => id.endsWith('.10') && p0[id.replace(/\.10$/, '.20')] && !p0[id.replace(/\.10$/, '.30')]).sort((a, b) => p0[b]!.S - p0[a]!.S)[0]!;
    const k = x.replace(/\.10$/, '.20'), kilit = { m: p0[k]!.m, S: p0[x]!.S };
    for (const sure of [0.001, 0.6]) {
      const p = await kur(sure, { [k]: kilit });
      assert.deepEqual([p[k]!.m, p[k]!.S], [kilit.m, kilit.S], 'kilit yerinde');
      assert.deepEqual(planBozuklari(p), [], `süre ${String(sure)}`);
    }
    // Öncül kilide yaslanır: öne çekilip öteki işlerin önüne geçmez.
    const p = await kur(0.001, { [k]: kilit });
    assert.deepEqual(p[x]!.why, { t: 'kilit-oncul', r: k });
    assert.ok(kilit.S - p[x]!.C < 0.5 && p[x]!.S > Math.min(...Object.values(p).map((r) => r.S)), `${String(p[x]!.S)}-${String(p[x]!.C)}, kilit ${String(kilit.S)}`);
  });

  test('KZ-03: kayıtlı planda bir adım yerine kilitlenip değişiklik uygulanınca hiçbir işe kilit öncülü diye yer ayrılmaz', async () => {
    const c = guncelPlanli(kayit); const eski = (c['plan'] as { ops: Record<string, PlanIsi> }).ops;
    // Öncülü ile arasında boşluk olan adım: öncül kilide yaslansaydı ileri kayardı.
    const k = Object.keys(eski).filter((id) => id.endsWith('.20') && eski[id]!.S - eski[id.replace(/\.20$/, '.10')]!.C > 2).sort()[0]!;
    assert.ok(k, 'öncülüyle arası açık adım var');
    const s = sonuc(await degerlendirmeYap({ calisma: { ...c, locks: { [k]: { m: eski[k]!.m, S: eski[k]!.S } } }, kayit, kaynak: BUYUK_KAYNAK, bugun: '2026-10-19', istek: { tur: 'plan-uygula', isler: ['*'] } }, AN));
    if (s.tur !== 'plan-uygula') return assert.fail(s.tur);
    const yeni = s.plan['ops'] as Record<string, PlanIsi>;
    // Öncülün yeri aramanın izlediği yola bağlıdır; ölçülen, zincir yerleşiminin bu kipte hiçbir işe yer ayırmamasıdır.
    assert.deepEqual(Object.entries(yeni).filter(([, r]) => (r as PlanIsi & { why?: { t?: string } | null }).why?.t === 'kilit-oncul').map(([id]) => id), []);
    assert.deepEqual([yeni[k]!.m, yeni[k]!.S], [eski[k]!.m, eski[k]!.S]);
    assert.deepEqual(planBozuklari(yeni), []);
  });

  test('KZ-04: arama, kilitli adımı öncülünden önce başlatan adım sayısını artırmaz; motorun kendi aramasında da, büyük planların aramasında da', async () => {
    const p0 = await kur(0.001, {});
    // Kilitsiz planda, ilk adım dışındaki adımların yarısı (sırayla birer atlayarak) bulunduğu yere kilitlenir.
    const locks = Object.fromEntries(Object.keys(p0).filter((id) => !id.endsWith('.10')).sort().filter((_, i) => i % 2 === 1).map((id) => [id, { m: p0[id]!.m, S: p0[id]!.S }]));
    const say = (p: Record<string, PlanIsi>): number => planBozuklari(p).filter((x) => locks[x.split(' ')[0]!]).length;
    const aramasiz = say(await kur(0.001, locks));
    for (const sure of [0.6, 1.5]) assert.ok(say(await kur(sure, locks)) <= aramasiz, `motorun araması, süre ${String(sure)}`);
    // Büyük planların araması (kayan pencere) 1000 adımdan sonra devreye girer; küçük veride eşik sıfırlanarak koşturulur. Motor boş bağlamda yüklenir.
    const ESIK = 'var KP_ESIK = 1000;';
    assert.ok(degerlendirmeKodu().includes(ESIK), 'eşik satırı değişmiş');
    const pencereli = (sure: number): Record<string, PlanIsi> => {
      const b = vm.createContext({ GIRDI_SAAT_DILIMI: TESIS_SAAT_DILIMI }); b['self'] = b;
      const m = vm.runInContext(degerlendirmeKodu().replace(ESIK, 'var KP_ESIK = 0;'), b) as { degerlendir: (...a: unknown[]) => unknown };
      const r = m.degerlendir({ ...calismaKur(), w: { famK: 0.3, mat: 'sert', dondurma: 4, sure }, locks }, kayit, BUYUK_KAYNAK, '2026-10-19', AN, { tur: 'plan-kur' });
      return (JSON.parse(JSON.stringify(r)) as { sonuc: { plan: { ops: Record<string, PlanIsi> } } }).sonuc.plan.ops;
    };
    const pencereAramasiz = say(pencereli(0.001));
    for (const sure of [0.6, 1.5]) assert.ok(say(pencereli(sure)) <= pencereAramasiz, `büyük plan araması, süre ${String(sure)}`);
  });

  test('KZ-02: zincir kilide sığmıyorsa hiçbir öncülün yeri ayrılmaz; sıra yalnız kilitli adımda bozulur, kilitsiz adımlar sıralı kalır', async () => {
    const p0 = await kur(0.001, {});
    const t0 = Math.min(...Object.values(p0).map((r) => r.S)), d1 = p0['OK.10']!.C - p0['OK.10']!.S, d2 = p0['OK.20']!.C - p0['OK.20']!.S;
    // İkinci adım kilitten önceye sığar, birinci adım onun önüne sığmaz.
    const kilit = { m: p0['OK.30']!.m, S: t0 + d2 + d1 / 2 };
    const p = await kur(0.001, { 'OK.30': kilit });
    assert.deepEqual([p['OK.30']!.m, p['OK.30']!.S], [kilit.m, kilit.S]);
    const bozuk = planBozuklari(p);
    assert.equal(bozuk.length, 1, bozuk.join('; '));
    assert.match(bozuk[0]!, /^OK\.30 /);
  });
});

const PAROLA = 'dogru-parola-1';
const URL = '/api/plan/planlama-degerlendirmesi';

describe('planlama değerlendirmesi ucu (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let tam = '';
  let planlamaci = '';
  let yalnizYazar = '';
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam.vt; };

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }
  async function islemliKisi(kullaniciAdi: string, islemler: string[]): Promise<string> {
    const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`test_${kullaniciAdi}`]);
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol?.id, islem]);
    await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const kisi = await rolAta(db, yoneticiId, yeni, rol?.id ?? 0);
      for (const r of kisi.roller) if (r.id !== rol?.id) await rolAl(db, yoneticiId, yeni, r.id);
    });
    return girisCerezi(kullaniciAdi);
  }
  const baslat = (cerez: string | null, govde: unknown) => app.inject({ method: 'POST', url: URL, headers: cerez === null ? {} : { cookie: cerez }, payload: govde as object });
  const durumOku = (cerez: string, is: string) => app.inject({ method: 'GET', url: `${URL}/${is}`, headers: { cookie: cerez } });
  async function sonucuBekle(cerez: string, is: string): Promise<DegerlendirmeDurumuCevabi> {
    for (;;) {
      const r = await durumOku(cerez, is);
      assert.equal(r.statusCode, 200, r.body);
      const d = degerlendirmeDurumuCevabi.parse(r.json());
      if (d.durum !== 'suruyor') return d;
      await new Promise((coz) => setTimeout(coz, 10));
    }
  }
  // İki adım tek cevap gibi: başlatma reddedilirse onun cevabı; hesap reddedilirse hatanın koduna denk HTTP durumu.
  async function iste(cerez: string | null, surum: number, istek: DegerlendirmeIstegi): Promise<{ statusCode: number; body: string; json: () => unknown }> {
    const b = await baslat(cerez, { surum, istek });
    if (b.statusCode !== 200 || cerez === null) return b;
    const d = await sonucuBekle(cerez, (b.json() as { is: string }).is);
    if (d.durum === 'bitti') return { statusCode: 200, body: JSON.stringify(d.cevap), json: () => d.cevap };
    if (d.durum !== 'hata') return assert.fail(d.durum);
    return { statusCode: HATA_DURUMU[d.kod], body: JSON.stringify(d), json: () => d };
  }
  async function calismaYaz(deger: unknown): Promise<number> {
    return vt().tx(async (db) => {
      await db.sorgu('DELETE FROM plan_planlama_kaydi WHERE anahtar = $1', [PLANLAMA_ANAHTARI]);
      const k = await sorgular.planlamaKaydiEkle(db, { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger, kisiId: yoneticiId });
      return k?.surum ?? -1;
    });
  }

  before(async () => {
    ortam = await testVeritabaniKur('recete_rota_planlama_degerlendirmesi');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    tam = await girisCerezi('yonetici');
    planlamaci = await islemliKisi('planlamaci', ['plan.planlama-oku']);
    yalnizYazar = await islemliKisi('yazar', ['recete-rota.yaz']);
    await ortam.vt.tx((db) => receteRotaKaydiEkle(db, KAYIT, yoneticiId));
  });
  after(async () => { await ortam?.kaldir(); });

  test('PD-10: yalnız planlama-oku olan 200 alır, TL alanları null; maliyeti gören (yönetici) tutarı görür', async () => {
    const surum = await calismaYaz(planli());
    const izinli = await iste(planlamaci, surum, { tur: 'plan-secenekleri' });
    assert.equal(izinli.statusCode, 200, izinli.body);
    const c = degerlendirmeCevabi.parse(izinli.json());
    assert.equal(c.calismaSurumu, surum);
    assert.equal(c.maliyetGorunur, false);
    if (c.sonuc.tur !== 'plan-secenekleri') return assert.fail(c.sonuc.tur);
    assert.ok(c.sonuc.secenekler.length > 0);
    assert.ok(c.sonuc.secenekler.every((x) => x.netKar === null && x.ekMesaiTl === null));
    const y = degerlendirmeCevabi.parse((await iste(tam, surum, { tur: 'plan-secenekleri' })).json());
    assert.equal(y.maliyetGorunur, true);
  });

  // Ekran planı kendi yazma yoluyla alır ve cevabın veri sürümünü çalışmanınkiyle karşılaştırır (576): aynı kişinin okuduğu birleşmiş çalışma
  // olduğu gibi geri yazılınca sunucu onu yeniden birleştirirken veri sürümünü artırmamalı (kaynak okuması kişinin yetkisiyledir).
  test('PD-21: planı kur: kararlı birleşmiş çalışma geri yazılınca plan aynı veri sürümünde döner, kayıt değişmez', async () => {
    // Kayıt çevrildikten sonraki ilk geri yazma birleşimde bir kez daha eskir (siparişin onc0 alanı; DEVIR bulgusu): kararlı duruma iki turda gelinir.
    await calismaYaz(planli());
    const oku = async () => {
      const g = await app.inject({ method: 'GET', url: '/api/plan/planlama-calismasi', headers: { cookie: tam } });
      assert.equal(g.statusCode, 200, g.body);
      return (g.json() as { calisma: { dataVer: number } }).calisma;
    };
    await calismaYaz(await oku());
    const birlesik = await oku();
    const surum = await calismaYaz(birlesik);
    const once = await vt().tek<{ deger: unknown }>('SELECT deger FROM plan_planlama_kaydi WHERE anahtar = $1', [PLANLAMA_ANAHTARI]);
    const r = await iste(tam, surum, { tur: 'plan-kur' });
    assert.equal(r.statusCode, 200, r.body);
    const c = degerlendirmeCevabi.parse(r.json());
    if (c.sonuc.tur !== 'plan-kur') return assert.fail(c.sonuc.tur);
    assert.equal(c.dataVer, birlesik.dataVer);
    assert.equal(c.sonuc.plan['dataVer'], birlesik.dataVer);
    // örnek emirler veritabanında yok (PD-13 notu): kaynaktan birleşen çalışmada sipariş kalmaz, plan boş ama kayıt biçiminde
    assert.equal(typeof c.sonuc.plan['ops'], 'object');
    assert.ok(c.sonuc.plan['ozet']);
    assert.deepEqual(await vt().tek('SELECT deger FROM plan_planlama_kaydi WHERE anahtar = $1', [PLANLAMA_ANAHTARI]), once);
    assert.equal((await iste(planlamaci, surum, { tur: 'plan-kur' })).statusCode, 200);
    assert.equal((await iste(yalnizYazar, surum, { tur: 'plan-kur' })).statusCode, 403);
  });

  test('PD-11: işlemi olmayan (yalnız recete-rota.yaz) 403, oturumsuz 401; kaldırılan sipariş kârı türü herkese 400 (2172)', async () => {
    const surum = await calismaYaz(planli());
    assert.equal((await iste(yalnizYazar, surum, { tur: 'plan-secenekleri' })).statusCode, 403);
    assert.equal((await iste(null, surum, { tur: 'plan-secenekleri' })).statusCode, 401);
    // Sipariş kârı Maliyetler sayfasındadır (2169-3 a); değerlendirme türü kalktı, istek gövde doğrulamasında düşer.
    for (const k of [planlamaci, tam]) assert.equal((await iste(k, surum, { tur: 'siparis-kari' } as unknown as DegerlendirmeIstegi)).statusCode, 400);
  });

  test('PD-12: eski sürüm 409; çalışma kaydı yoksa 409; plan gereken turde plansız çalışma 409; bilinmeyen tur 400', async () => {
    const surum = await calismaYaz(planli());
    assert.equal((await iste(tam, surum + 1, { tur: 'plan-secenekleri' })).statusCode, 409);
    const plansiz = await calismaYaz(calismaKur());
    assert.equal((await iste(tam, plansiz, { tur: 'malzeme-terminleri' })).statusCode, 409);
    await vt().sorgu('DELETE FROM plan_planlama_kaydi WHERE anahtar = $1', [PLANLAMA_ANAHTARI]);
    assert.equal((await iste(tam, 1, { tur: 'plan-secenekleri' })).statusCode, 409);
    assert.equal((await baslat(tam, { surum: 1, istek: { tur: 'yaz' } })).statusCode, 400);
  });

  // Sunucuda emirler kaynaktan birleşir (288 a): örnek emirler veritabanında olmadığı için bölme burada sınanmaz, PD-02 kopyayı sınar.
  test('PD-13: değerlendirme kaydı değiştirmez (seçenekler ve uzatma)', async () => {
    const deger = planli();
    const surum = await calismaYaz(deger);
    assert.equal((await iste(tam, surum, { tur: 'plan-secenekleri' })).statusCode, 200);
    assert.equal((await iste(tam, surum, { tur: 'termin-uzatma', gun: 5 })).statusCode, 200);
    const k = await vt().tx((db) => sorgular.planlamaKaydi(db, PLANLAMA_ANAHTARI));
    assert.equal(k?.surum, surum);
    assert.deepEqual(k?.deger, JSON.parse(JSON.stringify(deger)));
  });
  test('PD-16: aynı kişinin önceki değerlendirmesi bitmeden gelen ikincisi 429 alır; başka kişi etkilenmez', async () => {
    const surum = await calismaYaz(planli());
    const istekler = await Promise.all([1, 2, 3].map(() => iste(tam, surum, { tur: 'plan-secenekleri' })));
    const kodlar = istekler.map((x) => x.statusCode).sort();
    assert.ok(kodlar.includes(200) && kodlar.includes(429), kodlar.join(','));
    assert.ok(istekler.filter((x) => x.statusCode === 429).every((x) => x.body.includes('sürüyor')));
    assert.equal((await iste(planlamaci, surum, { tur: 'plan-secenekleri' })).statusCode, 200);
  });
  test('PD-17: sonucu yalnız başlatan, bir kez okur; başkasına 404; okuma transaction açmaz; hesaptaki ret kod ve iletiyle döner; okunmayan sonuç 5 dk sonra silinir', async () => {
    const surum = await calismaYaz(planli());
    const b = await baslat(tam, { surum, istek: { tur: 'termin-uzatma', gun: 2 } });
    assert.equal(b.statusCode, 200, b.body);
    const is = (b.json() as { is: string }).is;
    assert.equal((await durumOku(planlamaci, is)).statusCode, 404);
    assert.equal((await sonucuBekle(tam, is)).durum, 'bitti');
    assert.equal((await durumOku(tam, is)).statusCode, 404);
    const plansiz = await calismaYaz(calismaKur());
    const h = await baslat(tam, { surum: plansiz, istek: { tur: 'malzeme-terminleri' } });
    assert.deepEqual(await sonucuBekle(tam, (h.json() as { is: string }).is), { durum: 'hata', kod: 'CAKISMA', mesaj: 'Önce plan kurulmalı.' });
    // Ömür: hesabı hemen biten (çalışma yok sayan) iki iş; biri ömür dolmuş sayılarak okunur, öteki hemen.
    const surum2 = await calismaYaz(planli());
    const yonetici: Kullanici = { id: yoneticiId, ad: 'Deneme Yonetici', islemler: [...ISLEMLER] };
    const hemen = () => Promise.resolve(null);
    const bas = () => vt().tx((db) => degerlendirmeBaslat(db, yonetici, { surum: surum2, istek: { tur: 'plan-secenekleri' } }, Date.now(), hemen));
    const eski = (await bas()).is;
    await new Promise((coz) => setImmediate(coz));
    assert.throws(() => degerlendirmeDurumu(yoneticiId, eski, Date.now() + SONUC_OMRU_MS + 1000), /bulunamadı/);
    const yeni = (await bas()).is;
    await new Promise((coz) => setImmediate(coz));
    assert.equal(degerlendirmeDurumu(yoneticiId, yeni).durum, 'hata');
  });

  // Hesap enjekte edilir: sonuç sabittir, uç yetkiye göre süzme kararını ölçer.
  async function enjekteOku(surum: number, islemler: Kullanici['islemler'], sonuc: DegerlendirmeSonucu): Promise<DegerlendirmeSonucu> {
    const k: Kullanici = { id: yoneticiId, ad: 'Deneme', islemler };
    const yap = () => Promise.resolve({ dataVer: 1, baslangic: null, simdi: 0, sonuc } as DegerlendirmeZarfi);
    const { is } = await vt().tx((db) => degerlendirmeBaslat(db, k, { surum, istek: { tur: sonuc.tur } as DegerlendirmeIstegi }, Date.now(), yap));
    await new Promise((coz) => setImmediate(coz));
    const d = degerlendirmeDurumu(yoneticiId, is);
    if (d.durum !== 'bitti') return assert.fail(JSON.stringify(d));
    return d.cevap.sonuc;
  }

  // 2918: sipariş fiyatı (siparisler 180: yalnız siparisler.fiyat-oku) ve ondan türeyen kâr, maliyeti görüp fiyatı görmeyene gitmez. TL
  // alanları maliyettir, maliyet-oku ile kalır. Hesap enjekte edilir: sonuç sabittir, süzme kararını ölçer. Rakamlar uydurmadır.
  test('PD-22: fiyatı görmeyen maliyetçide kâr alanları ve sipariş tutarı null; TL kalır; iki yetkili hepsini görür', async () => {
    const surum = await calismaYaz(planli());
    const plan = { ozet: { tl: 777 } };
    const sonuclar = [
      { tur: 'plan-secenekleri', bedeliBilinmeyenEkMesai: false,
        secenekler: [{ denge: 50, carpan: 1, ekMesai: [{ makineId: 'T1', gun: 1, vardiya: '3', tl: 400 }], ekMesaiTl: 400, geciken: 1, isSayisi: 2, gecikmeSaat: 3, netKar: 1234, eksik: 0, plan }] },
      { tur: 'termin-secenekleri', siparisId: 'O1', havuz: false, taban: 'girilen-termin', yerlesti: true,
        satirlar: [{ secenek: 'en-erken', termin: '2026-10-21', bitis: 30, gecikmeSaat: 0, tutar: 5000, netKar: 900, digerKarFarki: -50, digerGecikmeFarki: 2, toplamKar: 850 }] },
      { tur: 'termin-uzatma', gun: 2,
        satirlar: [{ siparisId: 'O1', yeniTermin: '2026-10-22', gecikmeSimdi: 5, gecikmeUzatinca: 0, netKarFarki: 300, gecikmeSaatFarki: -5, gecikenFarki: -1 }] },
      { tur: 'parti-bolme', siparisId: 'O2', darbogaz: null,
        sonuc: { partiler: [], gecikmeOnce: 1, gecikmeSonra: 0, bitisSonra: null, tl: 650, siparisler: [], plan } },
    ].map((x) => degerlendirmeSonucu.parse(x));
    const oku = (islemler: Kullanici['islemler'], sonuc: DegerlendirmeSonucu) => enjekteOku(surum, islemler, sonuc);
    const fiyatsiz: Kullanici['islemler'] = ['plan.planlama-oku', 'finans.maliyet-oku'];
    const ikiYetki: Kullanici['islemler'] = [...fiyatsiz, 'siparisler.fiyat-oku'];
    const [ps, ts, tu, pb] = sonuclar;
    if (ps?.tur !== 'plan-secenekleri' || ts?.tur !== 'termin-secenekleri' || tu?.tur !== 'termin-uzatma' || pb?.tur !== 'parti-bolme') return assert.fail();
    for (const s of sonuclar) assert.deepEqual(await oku(ikiYetki, s), s);
    const p = await oku(fiyatsiz, ps);
    assert.deepEqual(p, { ...ps, secenekler: [{ ...ps.secenekler[0]!, netKar: null }] });
    const t = await oku(fiyatsiz, ts);
    assert.deepEqual(t, { ...ts, satirlar: [{ ...ts.satirlar[0]!, tutar: null, netKar: null, digerKarFarki: null, toplamKar: null }] });
    const u = await oku(fiyatsiz, tu);
    assert.deepEqual(u, { ...tu, satirlar: [{ ...tu.satirlar[0]!, netKarFarki: null }] });
    assert.deepEqual(await oku(fiyatsiz, pb), pb);
  });

  // 2934 (Güvenlik C6): planın TL toplamı (ozet.tl) maliyeti görmeyene hiçbir türde gitmez; plan taşıyan her tür taranır. Rakamlar uydurmadır.
  // Ekran önceki özeti planın oncekiOzet alanına koyar; o da TL taşır.
  const plan = { ops: {}, J: { O1: { C: 10, T: 0 } }, ozet: { wT: 0, n: 1, tl: 777 }, oncekiOzet: { wT: 1, n: 1, tl: 555 } };
  const degisen = [{ siparisId: 'O1', once: 12, sonra: 10, durum: 'ayni' }];
  const sonuclar = [
    { tur: 'plan-kur', plan },
    { tur: 'plan-uygula', plan },
    { tur: 'plan-iyilestir', plan, gecikmeOnce: 2, gecikmeSonra: 0, degisen },
    { tur: 'one-al', siparisId: 'O1', plan, yol: null, neden: null, bitisOnce: 12, bitisSonra: 10, gecikmeOnce: 2, gecikmeSonra: 0, degisen },
    { tur: 'sira-degistir', tezgah: 'T1', sira: ['O1.10'], plan, neden: null, gecikmeOnce: 2, gecikmeSonra: 0, degisen },
    { tur: 'parti-bolme', siparisId: 'O1', darbogaz: null,
      sonuc: { partiler: [], gecikmeOnce: 1, gecikmeSonra: 0, bitisSonra: null, tl: 650, siparisler: [], plan } },
    { tur: 'plan-secenekleri', bedeliBilinmeyenEkMesai: false,
      secenekler: [{ denge: 50, carpan: 1, ekMesai: [], ekMesaiTl: 0, geciken: 0, isSayisi: 1, gecikmeSaat: 0, netKar: null, eksik: 0, plan }] },
  ].map((x) => degerlendirmeSonucu.parse(x));
  const doluTl = (x: unknown, yol = ''): string[] => {
    if (Array.isArray(x)) return x.flatMap((v, i) => doluTl(v, `${yol}[${String(i)}]`));
    if (x === null || typeof x !== 'object') return [];
    return Object.entries(x).flatMap(([a, v]) => [...(/tl$/i.test(a) && v !== null && v !== 0 ? [`${yol}.${a}`] : []), ...doluTl(v, `${yol}.${a}`)]);
  };
  for (const s of sonuclar) {
    test(`PD-23 ${s.tur}: maliyeti görmeyenin cevabında dolu tl alanı yok (ozet, oncekiOzet); maliyeti gören aynen alır`, async () => {
      const surum = await calismaYaz(planli());
      assert.deepEqual(doluTl(s).sort(), [...(s.tur === 'parti-bolme' ? ['.sonuc.tl'] : []), ...['ozet', 'oncekiOzet'].map((o) => `${s.tur === 'parti-bolme' ? '.sonuc' : s.tur === 'plan-secenekleri' ? '.secenekler[0]' : ''}.plan.${o}.tl`)].sort(), 'örnek tl taşımalı');
      assert.deepEqual(doluTl(await enjekteOku(surum, ['plan.planlama-oku'], s)), []);
      assert.deepEqual(await enjekteOku(surum, ['plan.planlama-oku', 'finans.maliyet-oku', 'siparisler.fiyat-oku'], s), s);
    });
  }
});
