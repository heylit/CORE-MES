import type { Db } from '#cekirdek/db.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { DURUM_ANAHTARI } from '../recete-rota/disari.ts';
import { PLANLAMA_ANAHTARI } from './disari.ts';
import { IZ_SINIRI, ekMesaiEkle, isTasi, olayEkle, planaAl } from './atolye-komutlari-kurallar.ts';
import type { PlanaAlSonucu } from './plana-al-kurallar.ts';
import type { TasimaSonucu } from './tasima-kurallar.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import { planAni } from './planlama-kurallar.ts';
import * as sorgular from './sorgular.ts';

// 1982 a: atölyenin elle düzenleme komutları. Veriler uydurmadır.
// 2506 a: komutun şimdisi gerçek saattir (KISI.t); 2026-10-19 eksenine göre 10. saat.
const KISI = { kim: 'Deneme Planlamaci', sayfa: 'Planlama atölyesi', t: Date.parse(planAni('2026-10-19', 10)) };

const D = {
  meta: { ad: 'Ornek', baslangic: '2026-10-19' },
  tezgahlar: [{ id: 'T1', grup: 'TOR' }, { id: 'T2', grup: 'TOR' }],
  urunler: [{ id: 'U1', rota: [] }], malzemeler: [{ kod: 'M1' }], fasoncular: [{ id: 'F1' }], vardiyalar: [{ id: 'V1' }],
};
const planli = (o: Record<string, unknown> = {}) => ({
  D, dataVer: 3, simdi: 50, locks: {}, olaylar: [], iz: [],
  plan: { dataVer: 3, ops: {
    'J1.10': { id: 'J1.10', job: 'J1', m: 'T1', S: 12, C: 14, act: 0, done: 0, fas: 0 },
    'J1.20': { id: 'J1.20', job: 'J1', m: 'T1', S: 8, C: 11, act: 1, done: 0, fas: 0 },
    'J1.30': { id: 'J1.30', job: 'J1', m: 'T1', S: 2, C: 4, act: 0, done: 1, fas: 0 },
    'J1.40': { id: 'J1.40', job: 'J1', m: '@F1', S: 20, C: 40, act: 0, done: 0, fas: 1 },
  } },
  ...o,
});
// İtmesiz hesap: yalnız taşınan iş verilen yerde (itmenin kendisi tasima-kurallar.test.ts'te).
const yalniz = (_d: unknown, _s: number, g: { isId: string; tezgah: string; baslangic: number }): TasimaSonucu =>
  ({ gecerli: true, ileti: null, isler: [{ isId: g.isId, tezgah: g.tezgah, S: g.baslangic, C: g.baslangic + 1, eskiTezgah: '', eskiS: 0, tur: 'tasinan' }] });
const deger = (r: ReturnType<typeof isTasi>) => { assert.ok('deger' in r, JSON.stringify(r)); return r.deger as Record<string, unknown>; };
const hata = (r: ReturnType<typeof isTasi>) => { assert.ok('hata' in r, JSON.stringify(r)); return r.hata; };

describe('atölye komutlarının kuralı', () => {
  test('taşı: iş tezgâh ve saatle kilitlenir; veri sürümü artar, bekleyen satırı yalnız o işin siparişini işaretler ve kilidi geri alır', () => {
    const c = planli();
    const y = deger(isTasi(c, { isId: 'J1.10', tezgah: 'T2', baslangic: 16 }, KISI, yalniz));
    assert.deepEqual(y.locks, { 'J1.10': { m: 'T2', S: 16 } });
    assert.equal(y.dataVer, 4);
    assert.deepEqual(y.bekleyen, [{ id: `${String(KISI.t)}-3`, ne: 'İş başka tezgâha taşındı', ayrinti: 'J1.10 → T2', kim: KISI.kim, t: KISI.t, isler: ['J1'], geri: [{ yol: ['locks'], id: 'J1.10' }] }]);
    assert.deepEqual(y.iz, [{ t: KISI.t, kim: KISI.kim, rol: '', sayfa: KISI.sayfa, ne: 'İş başka tezgâha taşındı', ayrinti: 'J1.10 → T2' }]);
    // Girdi değişmez.
    assert.deepEqual(c.locks, {});
  });

  test('2790: itilen ve çekilen adımlar da tek değişiklikle kilitlenir; geri alma hepsini döndürür; geçersiz itme hiçbir şey yazmaz', () => {
    const c = planli({ locks: { 'J1.50': { m: 'T2', S: 30 } } });
    const itme = (): TasimaSonucu => ({ gecerli: true, ileti: 'OP 50 ileri itildi.', isler: [
      { isId: 'J1.10', tezgah: 'T2', S: 16, C: 18, eskiTezgah: 'T1', eskiS: 12, tur: 'tasinan' },
      { isId: 'J1.50', tezgah: 'T2', S: 40, C: 42, eskiTezgah: 'T2', eskiS: 30, tur: 'itilen' },
    ] });
    const r = isTasi(c, { isId: 'J1.10', tezgah: 'T2', baslangic: 16 }, KISI, itme);
    const y = deger(r);
    assert.equal((r as { ileti?: string | null }).ileti, 'OP 50 ileri itildi.');
    assert.deepEqual(y.locks, { 'J1.10': { m: 'T2', S: 16 }, 'J1.50': { m: 'T2', S: 40 } });
    assert.equal(y.dataVer, 4);
    const b = y.bekleyen as { ayrinti: string; geri: unknown }[];
    assert.equal(b.length, 1);
    assert.equal(b[0]?.ayrinti, 'J1.10 → T2; OP 50 ileri itildi.');
    assert.deepEqual(b[0]?.geri, [{ yol: ['locks'], id: 'J1.10' }, { yol: ['locks'], id: 'J1.50', once: { m: 'T2', S: 30 } }]);
    const red = isTasi(c, { isId: 'J1.10', tezgah: 'T2', baslangic: 16 }, KISI, () => ({ gecerli: false, ileti: 'OP 50 planlama ufkuna sığmıyor; taşıma yapılmadı.', isler: [] }));
    assert.deepEqual(hata(red), { tur: 'dogrulama', ileti: 'OP 50 planlama ufkuna sığmıyor; taşıma yapılmadı.', alan: 'baslangic' });
    // Denetimden geçmeyen taşımada itme hesaplanmaz.
    let cagrildi = false;
    hata(isTasi(c, { isId: 'J1.20', tezgah: 'T2', baslangic: 16 }, KISI, () => { cagrildi = true; return itme(); }));
    assert.equal(cagrildi, false);
  });

  test('aynı tezgâhta saat kaydırma önceki kilidi geri dönüş farkına yazar; aynı kilit değişiklik değildir', () => {
    const c = planli({ locks: { 'J1.10': { m: 'T1', S: 12 } } });
    const y = deger(isTasi(c, { isId: 'J1.10', tezgah: 'T1', baslangic: 13.5 }, KISI, yalniz));
    assert.equal((y.bekleyen as { ne: string; geri: unknown }[])[0]?.ne, 'İş saati kaydırıldı');
    assert.deepEqual((y.bekleyen as { geri: unknown }[])[0]?.geri, [{ yol: ['locks'], id: 'J1.10', once: { m: 'T1', S: 12 } }]);
    const r = isTasi(c, { isId: 'J1.10', tezgah: 'T1', baslangic: 12 }, KISI, yalniz);
    assert.ok('deger' in r && !r.degisti && r.deger === c);
  });

  test('plan önceden bayatsa bekleyen listesi kaydı olmayan satırla başlar; plan yoksa bekleyen yazılmaz', () => {
    const y = deger(isTasi(planli({ dataVer: 5 }), { isId: 'J1.10', tezgah: 'T2', baslangic: 16 }, KISI, yalniz));
    assert.deepEqual((y.bekleyen as { id: string }[]).map((b) => b.id), ['eski', `${String(KISI.t)}-5`]);
    const o = deger(olayEkle(planli({ plan: null }), { tip: 'malzeme', kod: 'M1', gun: 2 }, KISI));
    assert.equal(o.bekleyen, undefined);
    assert.equal(o.dataVer, 4);
  });

  test('taşı reddeder: plan yok, iş yok, başlamış, biten, fason iş, bilinmeyen tezgâh, geçmiş saat', () => {
    assert.equal(hata(isTasi(planli({ plan: null }), { isId: 'J1.10', tezgah: 'T2', baslangic: 16 }, KISI, yalniz)).tur, 'cakisma');
    assert.match(hata(isTasi(planli(), { isId: 'J9.10', tezgah: 'T2', baslangic: 16 }, KISI, yalniz)).ileti, /bulunamadı/);
    assert.match(hata(isTasi(planli(), { isId: 'J1.20', tezgah: 'T2', baslangic: 16 }, KISI, yalniz)).ileti, /Başlamış/);
    assert.match(hata(isTasi(planli(), { isId: 'J1.30', tezgah: 'T2', baslangic: 16 }, KISI, yalniz)).ileti, /Biten/);
    assert.match(hata(isTasi(planli(), { isId: 'J1.40', tezgah: 'T2', baslangic: 16 }, KISI, yalniz)).ileti, /Fason/);
    assert.deepEqual(hata(isTasi(planli(), { isId: 'J1.10', tezgah: 'T9', baslangic: 16 }, KISI, yalniz)), { tur: 'dogrulama', ileti: 'Tezgâh çalışmada yok.', alan: 'tezgah' });
    assert.equal(hata(isTasi(planli(), { isId: 'J1.10', tezgah: 'T2', baslangic: 9 }, KISI, yalniz)).tur, 'dogrulama');
    // Saat çalışmanın şimdisinde izinlidir.
    assert.ok('deger' in isTasi(planli(), { isId: 'J1.10', tezgah: 'T2', baslangic: 10 }, KISI, yalniz));
  });

  test('olay ekle: olay listeye girer, bütün işler etkilenir, ret eski listeye döner; gösterdiği kayıt çalışmada olmalıdır', () => {
    const c = planli({ olaylar: [{ tip: 'fason', f: 'F1', gun: 1 }] });
    const y = deger(olayEkle(c, { tip: 'ariza', m: 'T1', bas: 12, saat: 4 }, KISI));
    assert.deepEqual(y.olaylar, [{ tip: 'fason', f: 'F1', gun: 1 }, { tip: 'ariza', m: 'T1', bas: 12, saat: 4 }]);
    assert.deepEqual((y.bekleyen as { isler: unknown; geri: unknown }[])[0], {
      id: `${String(KISI.t)}-3`, ne: 'Arıza olayı eklendi', ayrinti: 'ariza', kim: KISI.kim, t: KISI.t, isler: ['*'], geri: [{ yol: ['olaylar'], once: [{ tip: 'fason', f: 'F1', gun: 1 }] }],
    });
    for (const o of [
      { tip: 'acil', urun: 'U1', adet: 5, termin: '2026-10-25 17:00' }, { tip: 'malzeme', kod: 'M1', gun: 3 },
      { tip: 'eksik', gun: 1, vardiya: 'V1', grup: 'TOR', n: 1 }, { tip: 'eksik', gun: 1, vardiya: 'V1', grup: 'ayar', n: 1 }, { tip: 'fason', f: 'F1', gun: 2 },
    ] as const) assert.ok('deger' in olayEkle(planli(), o, KISI), o.tip);
    for (const [o, alan] of [
      [{ tip: 'ariza', m: 'T9', bas: 12, saat: 4 }, 'olay.m'], [{ tip: 'ariza', m: 'T1', bas: 2, saat: 4 }, 'olay.bas'],
      [{ tip: 'acil', urun: 'U9', adet: 5, termin: '2026-10-25' }, 'olay.urun'], [{ tip: 'malzeme', kod: 'M9', gun: 3 }, 'olay.kod'],
      [{ tip: 'eksik', gun: 1, vardiya: 'V9', grup: 'TOR', n: 1 }, 'olay.vardiya'], [{ tip: 'eksik', gun: 1, vardiya: 'V1', grup: 'FRZ', n: 1 }, 'olay.grup'],
      [{ tip: 'fason', f: 'F9', gun: 2 }, 'olay.f'],
    ] as const) assert.deepEqual((hata(olayEkle(planli(), o, KISI)) as { alan: string }).alan, alan);
  });

  test('ek mesai (2053): satır eklenir, bekleyen yalnız o tezgâhtaki siparişleri işaretler; aynı satır değişiklik değildir; geçmiş gün ve bilinmeyen kayıt reddedilir', () => {
    const c = planli({ ekMesai: [{ m: 'T2', gun: 1, vardiya: 'V1' }] });
    const y = deger(ekMesaiEkle(c, { tezgah: 'T1', gun: 2, vardiya: 'V1' }, KISI));
    assert.deepEqual(y.ekMesai, [{ m: 'T2', gun: 1, vardiya: 'V1' }, { m: 'T1', gun: 2, vardiya: 'V1' }]);
    assert.deepEqual((y.bekleyen as { isler: unknown; geri: unknown }[])[0]?.isler, ['J1']);
    assert.deepEqual((y.bekleyen as { geri: unknown }[])[0]?.geri, [{ yol: ['ekMesai'], once: [{ m: 'T2', gun: 1, vardiya: 'V1' }] }]);
    const ayni = ekMesaiEkle(c, { tezgah: 'T2', gun: 1, vardiya: 'V1' }, KISI);
    assert.ok('deger' in ayni && !ayni.degisti);
    // Şimdi 10. saat: 0. gün bugündür, izinlidir; 30. saatte 0. gün geçmiştir. Kayıttaki `simdi` (50) sayılmaz.
    assert.ok('deger' in ekMesaiEkle(c, { tezgah: 'T1', gun: 0, vardiya: 'V1' }, KISI));
    assert.equal((hata(ekMesaiEkle(c, { tezgah: 'T1', gun: 0, vardiya: 'V1' }, { ...KISI, t: Date.parse(planAni('2026-10-19', 30)) })) as { alan: string }).alan, 'gun');
    assert.equal((hata(ekMesaiEkle(c, { tezgah: 'T9', gun: 2, vardiya: 'V1' }, KISI)) as { alan: string }).alan, 'tezgah');
    assert.equal((hata(ekMesaiEkle(c, { tezgah: 'T1', gun: 2, vardiya: 'V9' }, KISI)) as { alan: string }).alan, 'vardiya');
  });

  test('değişiklik izi sınırı korunur', () => {
    const iz = Array.from({ length: IZ_SINIRI }, (_, i) => ({ t: i, kim: '', rol: '', sayfa: '', ne: String(i), ayrinti: '' }));
    const y = deger(olayEkle(planli({ iz }), { tip: 'malzeme', kod: 'M1', gun: 1 }, KISI));
    assert.equal((y.iz as unknown[]).length, IZ_SINIRI);
    assert.equal((y.iz as { ne: string }[])[0]?.ne, 'Malzeme gecikmesi olayı eklendi');
  });
  test('3151 plana al: yalnız ilk adım kilitlenir; tek değişikliktir ve geri alması kilidi kaldırır; planda olan, plan dışı ve bilinmeyen emir reddedilir', () => {
    const SIP = [{ id: 'J1', urun: 'U1' }, { id: 'J2', urun: 'U1' }, { id: 'J3', urun: 'U1', iptal: true }, { id: 'J4', urun: 'U1', havuz: true }];
    const c = planli({ D: { ...D, siparisler: SIP } });
    const hesap = (): PlanaAlSonucu => ({ gecerli: true, ileti: 'İlk adım 19.10 Pzt 12:00 saatine oturur.', bitis: 20, isler: [{ isId: 'J2.10', tezgah: 'T2', S: 12, C: 14 }, { isId: 'J2.20', tezgah: 'T1', S: 14, C: 20 }] });
    const r = planaAl(c, { emirId: 'J2', tezgah: 'T2', baslangic: 11 }, KISI, hesap);
    const y = deger(r);
    assert.equal((r as { ileti?: string | null }).ileti, 'İlk adım 19.10 Pzt 12:00 saatine oturur.');
    assert.deepEqual(y.locks, { 'J2.10': { m: 'T2', S: 12 } });
    assert.equal(y.dataVer, 4);
    assert.deepEqual(y.bekleyen, [{ id: `${String(KISI.t)}-3`, ne: 'Emir plana alındı', ayrinti: 'J2 → T2; İlk adım 19.10 Pzt 12:00 saatine oturur.', kim: KISI.kim, t: KISI.t, isler: ['J2'], geri: [{ yol: ['locks'], id: 'J2.10' }] }]);
    assert.deepEqual(c.locks, {});
    // Aynı yere ikinci kez alınan emir yeni değişiklik yazmaz.
    const tekrar = planaAl(y, { emirId: 'J2', tezgah: 'T2', baslangic: 11 }, KISI, hesap);
    assert.equal('degisti' in tekrar && tekrar.degisti, false);
    let cagri = 0;
    const say = (): PlanaAlSonucu => { cagri++; return hesap(); };
    assert.deepEqual(hata(planaAl(c, { emirId: 'J1', tezgah: 'T2', baslangic: 11 }, KISI, say)), { tur: 'cakisma', ileti: 'Emir zaten planda; yerini tahtadan değiştirin.' });
    assert.equal(hata(planaAl(c, { emirId: 'J3', tezgah: 'T2', baslangic: 11 }, KISI, say)).tur, 'cakisma');
    assert.equal(hata(planaAl(c, { emirId: 'J4', tezgah: 'T2', baslangic: 11 }, KISI, say)).tur, 'cakisma');
    assert.deepEqual(hata(planaAl(c, { emirId: 'YOK', tezgah: 'T2', baslangic: 11 }, KISI, say)), { tur: 'dogrulama', ileti: 'Emir çalışmada yok.', alan: 'emirId' });
    assert.deepEqual(hata(planaAl(c, { emirId: 'J2', tezgah: 'YOK', baslangic: 11 }, KISI, say)), { tur: 'dogrulama', ileti: 'Tezgâh çalışmada yok.', alan: 'tezgah' });
    assert.deepEqual(hata(planaAl(c, { emirId: 'J2', tezgah: 'T2', baslangic: 9 }, KISI, say)), { tur: 'dogrulama', ileti: 'Emir geçmiş bir saate alınamaz.', alan: 'baslangic' });
    assert.equal(hata(planaAl({ ...c, plan: null }, { emirId: 'J2', tezgah: 'T2', baslangic: 11 }, KISI, say)).tur, 'cakisma');
    // Denetimden geçmeyen istekte yer hesaplanmaz; hesabın reddi alanıyla döner ve hiçbir şey yazılmaz.
    assert.equal(cagri, 0);
    const red = planaAl(c, { emirId: 'J2', tezgah: 'T2', baslangic: 11 }, KISI, () => ({ gecerli: false, ileti: 'T2 bu emrin ilk adımını yapamaz.', alan: 'tezgah', isler: [], bitis: null }));
    assert.deepEqual(hata(red), { tur: 'dogrulama', ileti: 'T2 bu emrin ilk adımını yapamaz.', alan: 'tezgah' });
  });
});

// Uçlar gerçek PostgreSQL'de: yetki (izinli ve reddedilen), sürüm denetimi, yazmanın kayda düşmesi.
const PAROLA = 'dogru-parola-1';
const KAYIT = {
  version: 7, savedAt: 9,
  items: [{ id: '50', code: 'MM-1', name: 'Ornek urun', type: 'mamul' }, { id: '60', code: 'HM-1', name: 'Ornek cubuk', type: 'ham', unit: 'kg', stock: 0 }],
  opdefs: [], machines: [], routes: {}, orders: [],
};

describe('atölye komut uçları (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let tam = '';
  let okuyucu = '';
  let receteYazari = '';
  let makineId = '';
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
  const calisma = () => ({
    surum: 2, rrSavedAt: 9, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, kapali: [], olaylar: [], plan: null, iz: [],
    w: { famK: 0.3, mat: 'uyari', dondurma: 4 }, param: { tampon: false, tamponZ: 0, acilPay: 0 },
    D: { meta: { ad: 'Ornek', baslangic: tesisGunu(Date.now()) }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [],
      personel: [], siparisler: [], ayarlar: {} },
  });
  async function calismaYaz(d: unknown): Promise<number> {
    return vt().tx(async (db: Db) => {
      await db.sorgu('DELETE FROM plan_planlama_kaydi WHERE anahtar = $1', [PLANLAMA_ANAHTARI]);
      const k = await sorgular.planlamaKaydiEkle(db, { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger: d, kisiId: yoneticiId });
      return k?.surum ?? -1;
    });
  }
  // Aynı istek kimliğini yinelemek için adlı kimlik bir kez üretilir.
  const kimlikler = new Map<string, string>();
  const kimlikAl = (ad: string) => { if (!kimlikler.has(ad)) kimlikler.set(ad, randomUUID()); return kimlikler.get(ad)!; };
  const gonder = (cerez: string, yol: string, payload: Record<string, unknown>, kimlik: string) => app.inject({
    method: 'POST', url: `/api/plan/planlama-calismasi/${yol}`, headers: { cookie: cerez, 'istek-kimligi': kimlikAl(kimlik) }, payload,
  });

  before(async () => {
    ortam = await testVeritabaniKur('plan_atolye_komutlari');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    tam = await girisCerezi('yonetici');
    okuyucu = await islemliKisi('okuyucu', ['plan.planlama-oku']);
    receteYazari = await islemliKisi('receteci', ['plan.planlama-oku', 'recete-rota.yaz']);
    const s = ortam.sahip;
    const im = await s.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('AK-IM', 'Deneme merkezi') RETURNING id");
    const ist = await s.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ('AK-IS', 'Deneme torna', $1, true) RETURNING id", [im!.id]);
    makineId = String((await s.tek<{ id: number }>("INSERT INTO makine (kod, ad, istasyon_id, aktif) VALUES ('AK-M1', 'Deneme torna 1', $1, true) RETURNING id", [ist!.id]))!.id);
    await ortam.vt.tx((db) => db.sorgu(
      `INSERT INTO recete_rota_kayit (anahtar, bicim, deger, surum, guncelleyen_kisi_id) VALUES ($1, 'json', $2::jsonb, nextval('recete_rota_surum'), $3)`,
      [DURUM_ANAHTARI, JSON.stringify(KAYIT), yoneticiId]));
  });
  after(async () => { await ortam?.kaldir(); });

  test('AK-01: olay ekle plan.yaz ile kayda yazılır; sürüm artar, kişi ve zaman sunucudan, aynı istek kimliği ikinci kez yazmaz', async () => {
    const surum = await calismaYaz(calisma());
    // Komut sayfanın gördüğü birleşmiş çalışmaya uygulanır; birleşme veri sürümünü artırmış olabilir.
    const okunan = (await app.inject({ method: 'GET', url: '/api/plan/planlama-calismasi', headers: { cookie: tam } })).json() as { calisma: { dataVer: number } };
    const once = Date.now();
    const c = await gonder(tam, 'olay-ekle', { calismaSurumu: surum, olay: { tip: 'ariza', m: makineId, bas: 100, saat: 4 } }, 'ak-01');
    assert.equal(c.statusCode, 200, c.body);
    const g = c.json() as { calismaSurumu: number; oncekiSurum: number };
    assert.equal(g.oncekiSurum, surum);
    assert.ok(g.calismaSurumu > surum);
    const k = await vt().tx((db) => sorgular.planlamaKaydi(db, PLANLAMA_ANAHTARI));
    const d = k?.deger as { olaylar: unknown[]; dataVer: number; iz: { kim: string; t: number }[] };
    assert.equal(k?.surum, g.calismaSurumu);
    assert.deepEqual(d.olaylar, [{ tip: 'ariza', m: makineId, bas: 100, saat: 4 }]);
    assert.equal(d.dataVer, okunan.calisma.dataVer + 1);
    assert.equal(d.iz[0]?.kim, 'Deneme Yonetici');
    assert.ok((d.iz[0]?.t ?? 0) >= once);
    const tekrar = await gonder(tam, 'olay-ekle', { calismaSurumu: surum, olay: { tip: 'ariza', m: makineId, bas: 100, saat: 4 } }, 'ak-01');
    assert.equal(tekrar.statusCode, 200, tekrar.body);
    assert.equal((await vt().tx((db) => sorgular.planlamaKaydi(db, PLANLAMA_ANAHTARI)))?.surum, g.calismaSurumu);
  });

  test('AK-02: plan.yaz olmayan reddedilir (okuyucu, Reçete ve Rota yazarı); kayıt değişmez', async () => {
    const surum = await calismaYaz(calisma());
    for (const [cerez, ad] of [[okuyucu, 'okuyucu'], [receteYazari, 'receteci']] as const) {
      const o = await gonder(cerez, 'olay-ekle', { calismaSurumu: surum, olay: { tip: 'ariza', m: makineId, bas: 100, saat: 4 } }, `ak-02-o-${ad}`);
      assert.equal(o.statusCode, 403, o.body);
      const m = await gonder(cerez, 'ek-mesai-ekle', { calismaSurumu: surum, tezgah: makineId, gun: 2, vardiya: '1' }, `ak-02-m-${ad}`);
      assert.equal(m.statusCode, 403, m.body);
      const t = await gonder(cerez, 'is-tasi', { calismaSurumu: surum, isId: 'J1.10', tezgah: 'T1', baslangic: 12 }, `ak-02-t-${ad}`);
      assert.equal(t.statusCode, 403, t.body);
      const p = await gonder(cerez, 'plana-al', { calismaSurumu: surum, emirId: 'J1', tezgah: 'T1', baslangic: 12 }, `ak-02-p-${ad}`);
      assert.equal(p.statusCode, 403, p.body);
    }
    assert.equal((await vt().tx((db) => sorgular.planlamaKaydi(db, PLANLAMA_ANAHTARI)))?.surum, surum);
  });

  test('AK-03: eski sürüm, plansız taşıma, bilinmeyen kayıt ve bozuk gövde reddedilir', async () => {
    const surum = await calismaYaz(calisma());
    const eski = await gonder(tam, 'olay-ekle', { calismaSurumu: surum - 1, olay: { tip: 'ariza', m: makineId, bas: 100, saat: 4 } }, 'ak-03-a');
    assert.equal(eski.statusCode, 409, eski.body);
    const plansiz = await gonder(tam, 'is-tasi', { calismaSurumu: surum, isId: 'J1.10', tezgah: 'T1', baslangic: 12 }, 'ak-03-b');
    assert.equal(plansiz.statusCode, 409, plansiz.body);
    const yok = await gonder(tam, 'olay-ekle', { calismaSurumu: surum, olay: { tip: 'malzeme', kod: 'YOK', gun: 3 } }, 'ak-03-c');
    assert.equal(yok.statusCode, 400, yok.body);
    const bozuk = await gonder(tam, 'olay-ekle', { calismaSurumu: surum, olay: { tip: 'bilinmeyen' } }, 'ak-03-d');
    assert.equal(bozuk.statusCode, 400, bozuk.body);
    const vardiyasiz = await gonder(tam, 'ek-mesai-ekle', { calismaSurumu: surum, tezgah: makineId, gun: 2, vardiya: 'YOK' }, 'ak-03-f');
    assert.equal(vardiyasiz.statusCode, 400, vardiyasiz.body);
    const gecmisSaat = await gonder(tam, 'is-tasi', { calismaSurumu: surum, isId: 'J1.10', tezgah: 'T1', baslangic: -1 }, 'ak-03-e');
    assert.equal(gecmisSaat.statusCode, 400, gecmisSaat.body);
    assert.equal((await vt().tx((db) => sorgular.planlamaKaydi(db, PLANLAMA_ANAHTARI)))?.surum, surum);
  });

  test('AK-04 (2790): taşıma önizlemesi plan.yaz ister, yazmaz; plansız çalışmada geçersiz ve nedenli; bozuk sorgu reddedilir', async () => {
    const surum = await calismaYaz(calisma());
    const oku = (cerez: string, q: string) => app.inject({ method: 'GET', url: `/api/plan/planlama-calismasi/is-tasi-onizlemesi?${q}`, headers: { cookie: cerez } });
    const q = `isId=J1.10&tezgah=${makineId}&baslangic=12`;
    for (const cerez of [okuyucu, receteYazari]) assert.equal((await oku(cerez, q)).statusCode, 403);
    const o = await oku(tam, q);
    assert.equal(o.statusCode, 200, o.body);
    assert.deepEqual(o.json(), { calismaSurumu: surum, gecerli: false, ileti: 'Çalışmada plan yok; önce planı kurun.', isler: [] });
    assert.equal((await oku(tam, `isId=J1.10&tezgah=${makineId}&baslangic=abc`)).statusCode, 400);
    assert.equal((await oku(tam, `isId=J1.10&baslangic=12`)).statusCode, 400);
    assert.equal((await vt().tx((db) => sorgular.planlamaKaydi(db, PLANLAMA_ANAHTARI)))?.surum, surum);
  });
  test('AK-05 (3151): plana al ve önizlemesi plan.yaz ister; eski sürüm, plansız çalışma ve bozuk istek reddedilir; önizleme yazmaz, eski sürümde yer göstermez', async () => {
    const surum = await calismaYaz(calisma());
    const oku = (cerez: string, q: string) => app.inject({ method: 'GET', url: `/api/plan/planlama-calismasi/plana-al-onizlemesi?${q}`, headers: { cookie: cerez } });
    const q = (s: number) => `calismaSurumu=${String(s)}&emirId=J1&tezgah=${makineId}&baslangic=12`;
    for (const cerez of [okuyucu, receteYazari]) assert.equal((await oku(cerez, q(surum))).statusCode, 403);
    const o = await oku(tam, q(surum));
    assert.equal(o.statusCode, 200, o.body);
    assert.deepEqual(o.json(), { calismaSurumu: surum, gecerli: false, ileti: 'Çalışmada plan yok; önce planı kurun.', isler: [], bitis: null });
    assert.deepEqual((await oku(tam, q(surum - 1))).json(), { calismaSurumu: surum, gecerli: false, ileti: 'Plan bu sırada değişti; sayfayı yenileyin.', isler: [], bitis: null });
    assert.equal((await oku(tam, `calismaSurumu=${String(surum)}&emirId=J1&tezgah=${makineId}&baslangic=abc`)).statusCode, 400);
    assert.equal((await oku(tam, `emirId=J1&tezgah=${makineId}&baslangic=12`)).statusCode, 400);
    const eski = await gonder(tam, 'plana-al', { calismaSurumu: surum - 1, emirId: 'J1', tezgah: makineId, baslangic: 12 }, 'ak-05-a');
    assert.equal(eski.statusCode, 409, eski.body);
    const plansiz = await gonder(tam, 'plana-al', { calismaSurumu: surum, emirId: 'J1', tezgah: makineId, baslangic: 12 }, 'ak-05-b');
    assert.equal(plansiz.statusCode, 409, plansiz.body);
    const bozuk = await gonder(tam, 'plana-al', { calismaSurumu: surum, emirId: 'J1', tezgah: makineId, baslangic: -1 }, 'ak-05-c');
    assert.equal(bozuk.statusCode, 400, bozuk.body);
    assert.equal((await vt().tx((db) => sorgular.planlamaKaydi(db, PLANLAMA_ANAHTARI)))?.surum, surum);
  });
});
