import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import {
  degerlendirmeCevabi, degerlendirmeDurumuCevabi, degerlendirmeGovdesi, degerlendirmeSonucu, type DegerlendirmeDurumuCevabi, type DegerlendirmeIstegi, type DegerlendirmeSonucu,
} from '#paylasilan/sozlesme/recete-rota.ts';
import { HATA_DURUMU } from '#paylasilan/hata.ts';
import { ISLEMLER } from '#paylasilan/islemler.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { degerlendirmeBaslat, degerlendirmeDurumu, degerlendirmeYap, maliyetsiz, MESGUL, SONUC_OMRU_MS, type DegerlendirmeZarfi } from './degerlendirme.ts';
import { DURUM_ANAHTARI, PLANLAMA_ANAHTARI } from './disari.ts';
import { planGirdisi } from './plan-girdisi.ts';
import { motorYukle } from './plan-motoru.ts';
import * as sorgular from './sorgular.ts';

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
      { tur: 'plan-kur' }, { tur: 'plan-secenekleri' }, { tur: 'termin-secenekleri', siparisId: 'O2' }, { tur: 'termin-uzatma', gun: 2 }, { tur: 'malzeme-terminleri' },
      { tur: 'malzeme-one-cekme' }, { tur: 'parti-bolme', siparisId: 'O2', dagitim: 'ayni', adetler: [8, 8] }, { tur: 'siparis-kari' },
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

  test('PD-05: sipariş maliyeti tezgâh ücretinden ve malzeme fiyatından: O1 10 adet × 0,5 sa × 750, malzeme 20 kg × 10; tutar yoksa kâr null', async () => {
    const s = sonuc(await dene({ tur: 'siparis-kari' }));
    if (s.tur !== 'siparis-kari') return assert.fail(s.tur);
    const o1 = s.satirlar.find((x) => x.siparisId === 'O1');
    assert.equal(o1?.planda, true);
    assert.equal(o1?.isleme, 10 * 0.5 * 750);
    assert.equal(o1?.malzeme, 200);
    assert.equal(o1?.tutar, null);
    assert.equal(o1?.kar, null);
    assert.equal(o1?.net, null);
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
    assert.deepEqual(await dene({ tur: 'siparis-kari' }, calismaKur()), { hata: 'plan-yok' });
    assert.deepEqual(await dene({ tur: 'malzeme-terminleri' }, calismaKur()), { hata: 'plan-yok' });
    assert.equal(await dene({ tur: 'plan-secenekleri' }, null), null);
  });

  test('PD-08: maliyeti görmeyende TL alanları null, saat ve plan kalır; sipariş kârı hiç dönmez', async () => {
    const s = sonuc(await dene({ tur: 'plan-secenekleri' }));
    const m = maliyetsiz(s);
    if (m.tur !== 'plan-secenekleri' || s.tur !== 'plan-secenekleri') return assert.fail(m.tur);
    for (const [i, x] of m.secenekler.entries()) { assert.equal(x.netKar, null); assert.equal(x.ekMesaiTl, null); assert.equal(x.gecikmeSaat, s.secenekler[i]?.gecikmeSaat); assert.deepEqual(x.plan, s.secenekler[i]?.plan); }
    const b = sonuc(await dene({ tur: 'parti-bolme', siparisId: 'O2', dagitim: 'ayni', adetler: [8, 8] }));
    const mb = maliyetsiz(b); if (mb.tur !== 'parti-bolme') return assert.fail(mb.tur);
    assert.equal(mb.sonuc?.tl, null);
    const k = sonuc(await dene({ tur: 'siparis-kari' }));
    assert.throws(() => maliyetsiz(k), /maliyeti görene/);
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
    // kayıtlı plan yalnız dondurma bölgesinde (dengeli: şimdiden 24 saat) kullanılır: orada başlayan iş yerinde kalır (eski sayfanın dengeKilit'i)
    const c = planli(); const eski = (c['plan'] as { ops: Record<string, { m: string; S: number }> }).ops;
    const k = sonuc(await dene({ tur: 'plan-kur' }, c));
    if (k.tur !== 'plan-kur') return assert.fail(k.tur);
    const yeni = k.plan['ops'] as Record<string, { m: string; S: number }>;
    const bolge = Object.keys(eski).filter((id) => (eski[id]?.S ?? -1) >= 9 && (eski[id]?.S ?? 99) < 33);
    assert.ok(bolge.length > 0);
    for (const id of bolge) assert.deepEqual([yeni[id]?.m, yeni[id]?.S], [eski[id]?.m, eski[id]?.S], id);
  });

  test('PD-19: planı kur gövdesi tur dışı alan almaz (iyileştirme kipi yok, 579 b)', () => {
    const q = (istek: unknown) => degerlendirmeGovdesi.safeParse({ surum: 3, istek }).success;
    assert.equal(q({ tur: 'plan-kur' }), true);
    assert.equal(q({ tur: 'plan-kur', kip: 'iyilestir' }), false);
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

describe('planlama değerlendirmesi: arama (457 1-3 b)', () => {
  test('PD-14: plan seçeneklerinde arama kural tabanlı planın gecikmesini düşürür; saat sabit adımlı olduğu için aynı girdi aynı sonucu verir', async () => {
    const { calisma, kuralGecikme } = buyukPlanli();
    const dene2 = () => degerlendirmeYap({ calisma, kayit: BUYUK_KAYIT, kaynak: BUYUK_KAYNAK, bugun: '2026-10-19', istek: { tur: 'plan-secenekleri' } }, AN);
    const a = await dene2();
    const s = sonuc(a); if (s.tur !== 'plan-secenekleri') return assert.fail(s.tur);
    for (const x of s.secenekler) assert.ok(x.gecikmeSaat < kuralGecikme, `${String(x.gecikmeSaat)} < ${String(kuralGecikme)}`);
    assert.deepEqual(await dene2(), a);
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

const PAROLA = 'dogru-parola-1';
const URL = '/api/recete-rota/planlama-degerlendirmesi';

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
      await db.sorgu('DELETE FROM recete_rota_kayit WHERE anahtar = $1', [PLANLAMA_ANAHTARI]);
      const k = await sorgular.kayitEkle(db, { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger, kisiId: yoneticiId });
      return k?.surum ?? -1;
    });
  }

  before(async () => {
    ortam = await testVeritabaniKur('recete_rota_planlama_degerlendirmesi');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    tam = await girisCerezi('yonetici');
    planlamaci = await islemliKisi('planlamaci', ['recete-rota.planlama-oku']);
    yalnizYazar = await islemliKisi('yazar', ['recete-rota.yaz']);
    await ortam.vt.tx((db) => sorgular.kayitEkle(db, { anahtar: DURUM_ANAHTARI, bicim: 'json', deger: KAYIT, kisiId: yoneticiId }));
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
      const g = await app.inject({ method: 'GET', url: '/api/recete-rota/planlama-calismasi', headers: { cookie: tam } });
      assert.equal(g.statusCode, 200, g.body);
      return (g.json() as { calisma: { dataVer: number } }).calisma;
    };
    await calismaYaz(await oku());
    const birlesik = await oku();
    const surum = await calismaYaz(birlesik);
    const once = await vt().tek<{ deger: unknown }>('SELECT deger FROM recete_rota_kayit WHERE anahtar = $1', [PLANLAMA_ANAHTARI]);
    const r = await iste(tam, surum, { tur: 'plan-kur' });
    assert.equal(r.statusCode, 200, r.body);
    const c = degerlendirmeCevabi.parse(r.json());
    if (c.sonuc.tur !== 'plan-kur') return assert.fail(c.sonuc.tur);
    assert.equal(c.dataVer, birlesik.dataVer);
    assert.equal(c.sonuc.plan['dataVer'], birlesik.dataVer);
    // örnek emirler veritabanında yok (PD-13 notu): kaynaktan birleşen çalışmada sipariş kalmaz, plan boş ama kayıt biçiminde
    assert.equal(typeof c.sonuc.plan['ops'], 'object');
    assert.ok(c.sonuc.plan['ozet']);
    assert.deepEqual(await vt().tek('SELECT deger FROM recete_rota_kayit WHERE anahtar = $1', [PLANLAMA_ANAHTARI]), once);
    assert.equal((await iste(planlamaci, surum, { tur: 'plan-kur' })).statusCode, 200);
    assert.equal((await iste(yalnizYazar, surum, { tur: 'plan-kur' })).statusCode, 403);
  });

  test('PD-11: işlemi olmayan (yalnız recete-rota.yaz) 403, oturumsuz 401; sipariş kârı maliyeti görmeyene 403, yöneticiye 200', async () => {
    const surum = await calismaYaz(planli());
    assert.equal((await iste(yalnizYazar, surum, { tur: 'plan-secenekleri' })).statusCode, 403);
    assert.equal((await iste(null, surum, { tur: 'plan-secenekleri' })).statusCode, 401);
    assert.equal((await iste(planlamaci, surum, { tur: 'siparis-kari' })).statusCode, 403);
    const k = await iste(tam, surum, { tur: 'siparis-kari' });
    assert.equal(k.statusCode, 200, k.body);
    assert.equal(degerlendirmeCevabi.parse(k.json()).sonuc.tur, 'siparis-kari');
  });

  test('PD-12: eski sürüm 409; çalışma kaydı yoksa 409; plan gereken turde plansız çalışma 409; bilinmeyen tur 400', async () => {
    const surum = await calismaYaz(planli());
    assert.equal((await iste(tam, surum + 1, { tur: 'plan-secenekleri' })).statusCode, 409);
    const plansiz = await calismaYaz(calismaKur());
    assert.equal((await iste(tam, plansiz, { tur: 'malzeme-terminleri' })).statusCode, 409);
    await vt().sorgu('DELETE FROM recete_rota_kayit WHERE anahtar = $1', [PLANLAMA_ANAHTARI]);
    assert.equal((await iste(tam, 1, { tur: 'plan-secenekleri' })).statusCode, 409);
    assert.equal((await baslat(tam, { surum: 1, istek: { tur: 'yaz' } })).statusCode, 400);
  });

  // Sunucuda emirler kaynaktan birleşir (288 a): örnek emirler veritabanında olmadığı için bölme burada sınanmaz, PD-02 kopyayı sınar.
  test('PD-13: değerlendirme kaydı değiştirmez (seçenekler ve uzatma)', async () => {
    const deger = planli();
    const surum = await calismaYaz(deger);
    assert.equal((await iste(tam, surum, { tur: 'plan-secenekleri' })).statusCode, 200);
    assert.equal((await iste(tam, surum, { tur: 'termin-uzatma', gun: 5 })).statusCode, 200);
    const k = await vt().tx((db) => sorgular.kayitGetir(db, PLANLAMA_ANAHTARI));
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
});
