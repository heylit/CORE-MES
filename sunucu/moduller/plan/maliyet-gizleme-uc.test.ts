import type { Db } from '#cekirdek/db.ts';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { PlanlamaCalismasiCevabi } from '#paylasilan/sozlesme/planlama.ts';
import type { KayitlarCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { DURUM_ANAHTARI } from '../recete-rota/disari.ts';
import { PLANLAMA_ANAHTARI } from './disari.ts';
import * as sorgular from './sorgular.ts';

// 2498 (B-2495-1, 223 a): planlama çalışmasının para alanları yalnız finans.maliyet-oku taşıyana gider; maliyet okumayan planlamacı
// okuduğunu geri yazınca kayıttaki para alanları silinmez. Tutarlar uydurmadır.
const PAROLA = 'dogru-parola-1';
type Nesne = Record<string, unknown>;
type Calisma = { D: Nesne & { tezgahlar: Nesne[]; ayarlar?: Nesne }; senaryolar: Nesne[] };

const receteRotaKaydiEkle = (db: Db, deger: unknown, kisiId: number) => db.sorgu(
  `INSERT INTO recete_rota_kayit (anahtar, bicim, deger, surum, guncelleyen_kisi_id) VALUES ($1, 'json', $2::jsonb, nextval('recete_rota_surum'), $3)`,
  [DURUM_ANAHTARI, JSON.stringify(deger), kisiId]);

describe('2498: planlama çalışmasında maliyet ve ücret sunucuda süzülür (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let tam = '';
  let planlamaci = '';
  let maliyetci = '';
  let kaynakOkur = '';
  let kaynakMaliyetci = '';
  let kaynakFiyatOkur = '';
  let gelirsizMaliyetci = '';
  let kaynakGelirsizMaliyetci = '';
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
  const oku = async (cerez: string): Promise<{ calisma: Calisma; surum: number | null }> => {
    const c = await app.inject({ method: 'GET', url: '/api/plan/planlama-calismasi', headers: { cookie: cerez } });
    assert.equal(c.statusCode, 200, c.body);
    const g = c.json() as PlanlamaCalismasiCevabi;
    assert.ok(g.calisma);
    return { calisma: g.calisma as unknown as Calisma, surum: g.surum };
  };
  const kayitlariOku = async (cerez: string): Promise<Calisma> => {
    const c = await app.inject({ method: 'GET', url: '/api/plan/planlama-kayitlari', headers: { cookie: cerez } });
    assert.equal(c.statusCode, 200, c.body);
    const k = (c.json() as KayitlarCevabi).kayitlar.find((x) => x.anahtar === PLANLAMA_ANAHTARI);
    assert.ok(k);
    return k.deger as Calisma;
  };
  const yaz = async (cerez: string, deger: unknown, beklenenSurum: number | null): Promise<void> => {
    const c = await app.inject({
      method: 'POST', url: '/api/plan/planlama-kayitlari/yaz', headers: { cookie: cerez, 'istek-kimligi': crypto.randomUUID() },
      payload: { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger, beklenenSurum } });
    assert.equal(c.statusCode, 200, c.body);
  };
  const kayitli = async (): Promise<Calisma> => (await vt().tx((db) => sorgular.planlamaKaydi(db, PLANLAMA_ANAHTARI)))?.deger as Calisma;

  // Tam yetkili çalışmayı kurar ve para alanlarını yazar: tezgâh ücreti, kişi brütü, ayarcı ücreti, gider tablosu, talaş fiyatı ve
  // senaryonun veri kopyası.
  async function paraliCalisma(): Promise<Calisma> {
    await vt().sorgu('DELETE FROM plan_planlama_kaydi WHERE anahtar = $1', [PLANLAMA_ANAHTARI]);
    const kur = await app.inject({ method: 'POST', url: '/api/plan/planlama-calismasi/olustur', headers: { cookie: tam, 'istek-kimligi': crypto.randomUUID() } });
    assert.equal(kur.statusCode, 200, kur.body);
    const { calisma, surum } = await oku(tam);
    const t = calisma.D.tezgahlar.find((x) => x['id'] === makineId);
    assert.ok(t, 'tam yetkiliye tezgâh gelir');
    t['ucret'] = 450; t['verim'] = 0.9;
    calisma.D['mesaiSis'] = { gunlukSinir: 11, ucret: { [String(yoneticiId)]: { brut: 50000, yil: 2026 } } };
    calisma.D['maliyetSis'] = { kip: 'kalem', verim: 85, kwh: 3.2, tez: {}, kalemler: [], dolayli: [{ id: 'd1', gorev: 'Deneme', brut: 40000 }] };
    calisma.D['talasFiyat'] = [{ kalite: 'DENEME', fiyat: 12 }];
    calisma.D.ayarlar = { ...(calisma.D.ayarlar ?? {}), ayarciUcret: 300, tasimaSaat: 0.5 };
    (calisma as unknown as Nesne)['iz'] = [{ t: 1, kim: 'Deneme', rol: '', sayfa: 'Maliyet', ne: 'Tezgâh saat maliyeti değişti', ayrinti: `${makineId}: 450 → 500 TL/sa` }];
    calisma.senaryolar = [{ id: 's1', ad: 'Deneme', D: { tezgahlar: [{ id: makineId, ucret: 450 }], maliyetSis: { kwh: 3.2 } } }];
    calisma.D['fasoncular'] = [{ id: 'f1', ad: 'Deneme fasoncu', fiyat: 5, saatFiyat: 6, tasima: 7, sureGun: 2 }];
    // Listede olmayan sayfa siparişi kayıttaki gibi kalır (siparis-bedeli-girdi.test.ts); malzeme kaynaktan yeniden kurulur, birim testte.
    calisma.D['siparisler'] = [{ id: 'MG-S1', urun: 'MG-U', adet: 3, gelir: 9000, cezaGun: 40, cezaOran: 0.5, cezaTavan: 8 }];
    // Gelire dayanan türetilmiş alanlar (2897): planın TL özeti, nabız ölçüsü ve imzası, sabit referans, mesai kararının neti.
    const c = calisma as unknown as Nesne;
    c['plan'] = { dataVer: c['dataVer'], ops: {}, J: {}, ozet: { tl: 1234, wT: 2, late: 0 }, oncekiOzet: { tl: 1100, wT: 3 }, kim: 'Deneme' };
    c['nabiz'] = [{ t: 1, ne: 'Deneme', o: { tl: 280, wT: 28 }, imza: '2800|100|150' }];
    c['nbSabit'] = { ad: 'Referans', ops: {}, o: { tl: 5, wT: 1 }, ozet: { tl: 6, wT: 1 } };
    calisma.D['mesaiKarar'] = [{ m: makineId, gun: 1, vardiya: 'A', karar: 'kabul', kim: 'Deneme', t: 1, net: 777 }];
    calisma.senaryolar.push({ id: 's2', ad: 'Hafif', hafif: true, plan: { ozet: { tl: 99, wT: 1 } }, ozet: { tl: 98, wT: 1 } });
    await yaz(tam, calisma, surum);
    return kayitli();
  }

  // Çalışmanın her yerinde tutar taşıyan anahtar: adı para söyleyen ve değeri boş olmayan (null tutar taşımaz, 69 a).
  const GELIR_ANAHTARI = /^(tl|gelir|cezaGun|cezaOran|cezaTavan|net|imza)$/;
  const PARA_ANAHTARI = /^(tl|gelir|cezaGun|cezaOran|cezaTavan|net|imza|ucret|ucretIst|birimFiyat|fiyatTahmini|saatFiyat|operatorUcret|mesaiUcret|ayarciUcret|brut)$/;
  function tara(x: unknown, desen: RegExp, yol = ''): string[] {
    if (Array.isArray(x)) return x.flatMap((v, i) => tara(v, desen, `${yol}[${i}]`));
    if (x === null || typeof x !== 'object') return [];
    return Object.entries(x).flatMap(([k, v]) => [...(desen.test(k) && v !== null && v !== undefined && typeof v !== 'object' ? [`${yol}.${k}`] : []), ...tara(v, desen, `${yol}.${k}`)]);
  }

  const paraYok = (c: Calisma, ad: string): void => {
    assert.deepEqual(tara(c, PARA_ANAHTARI), [], `${ad}: tutar taşıyan alan kalmadı`);
    assert.equal(c.D.tezgahlar.find((x) => x['id'] === makineId)?.['ucret'], undefined, `${ad}: tezgâh ücreti`);
    assert.equal(c.D['maliyetSis'], undefined, `${ad}: gider tablosu`);
    assert.equal(c.D['talasFiyat'], undefined, `${ad}: talaş fiyatı`);
    assert.equal((c.D['mesaiSis'] as Nesne | undefined)?.['ucret'], undefined, `${ad}: kişi brütü`);
    assert.equal((c.D['mesaiSis'] as Nesne | undefined)?.['gunlukSinir'], 11, `${ad}: mesai sınırı planlamanın girdisidir, kalır`);
    assert.equal(c.D.ayarlar?.['ayarciUcret'], undefined, `${ad}: ayarcı ücreti`);
    assert.equal(c.D.ayarlar?.['tasimaSaat'], 0.5, `${ad}: süre ayarı kalır`);
    assert.equal(c.D.tezgahlar.find((x) => x['id'] === makineId)?.['verim'], 0.9, `${ad}: verim kalır`);
    const s = c.senaryolar.find((x) => x['id'] === 's1');
    assert.equal(((s?.['D'] as Nesne).tezgahlar as Nesne[])[0]?.['ucret'], undefined, `${ad}: senaryo kopyası`);
    assert.equal(JSON.stringify(c).includes('450 → 500'), false, `${ad}: değişiklik izindeki tutar`);
    const f = (c.D['fasoncular'] as Nesne[] | undefined)?.find((x) => x['id'] === 'f1');
    assert.ok(f, `${ad}: fasoncu kalır`);
    for (const a of ['fiyat', 'saatFiyat', 'tasima']) assert.equal(f[a], undefined, `${ad}: fason ${a}`);
    assert.equal(f['sureGun'], 2, `${ad}: fason süresi kalır`);
    const sp = (c.D['siparisler'] as Nesne[] | undefined)?.find((x) => x['id'] === 'MG-S1');
    // Birleşmiş çalışma kaynakta olmayan siparişi düşürebilir; ham kayıtta kalır (MG-02 varlığını ölçer).
    if (sp) for (const a of ['gelir', 'cezaGun', 'cezaOran', 'cezaTavan']) assert.equal(sp[a], undefined, `${ad}: sipariş ${a}`);
  };

  before(async () => {
    ortam = await testVeritabaniKur('plan_maliyet_gizleme');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    tam = await girisCerezi('yonetici');
    const planlama = ['plan.yaz', 'plan.planlama-oku', 'sayfa.istasyonlar', 'kisiler.oku'];
    planlamaci = await islemliKisi('planlamaci', planlama);
    maliyetci = await islemliKisi('maliyetci', [...planlama, 'finans.maliyet-oku', 'siparisler.fiyat-oku']);
    gelirsizMaliyetci = await islemliKisi('gelirsizmaliyetci', [...planlama, 'finans.maliyet-oku']);
    kaynakOkur = await islemliKisi('kaynakokur', ['recete-rota.oku']);
    kaynakMaliyetci = await islemliKisi('kaynakmaliyetci', ['recete-rota.oku', 'finans.maliyet-oku', 'siparisler.fiyat-oku']);
    kaynakGelirsizMaliyetci = await islemliKisi('kaynakgelirsizmaliyetci', ['recete-rota.oku', 'finans.maliyet-oku']);
    kaynakFiyatOkur = await islemliKisi('kaynakfiyatokur', ['recete-rota.oku', 'siparisler.fiyat-oku']);
    const s = ortam.sahip;
    const im = await s.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('MG-IM', 'Deneme merkezi') RETURNING id");
    const istasyonId = (await s.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ('MG-IS', 'Deneme torna', $1, true) RETURNING id", [im!.id]))!.id;
    await s.sorgu("INSERT INTO finans_istasyon_maliyet (istasyon_id, saat_maliyeti, para_birimi, guncelleyen_id) VALUES ($1, 450, 'TRY', $2)", [istasyonId, yoneticiId]);
    makineId = String((await s.tek<{ id: number }>("INSERT INTO makine (kod, ad, istasyon_id, aktif) VALUES ('MG-M1', 'Deneme torna 1', $1, true) RETURNING id", [istasyonId]))!.id);
    await ortam.vt.tx((db) => receteRotaKaydiEkle(db, { version: 7, savedAt: 9, items: [], opdefs: [], machines: [], routes: {}, orders: [] }, yoneticiId));
  });
  after(async () => { await ortam?.kaldir(); });

  test('MG-01: maliyet okumayan planlamacı çalışmada para alanlarını görmez; maliyet okuyan görür', async () => {
    await paraliCalisma();
    paraYok((await oku(planlamaci)).calisma, 'planlamacı');
    const m = (await oku(maliyetci)).calisma;
    assert.equal(m.D.tezgahlar.find((x) => x['id'] === makineId)?.['ucret'], 450);
    // 2728 a: brüt kayda hiç girmez; gider tablosunun brütsüz satırı maliyet okuyana gider.
    assert.deepEqual((m.D['maliyetSis'] as Nesne)['dolayli'], [{ id: 'd1', gorev: 'Deneme' }]);
    assert.equal(((m.D['mesaiSis'] as Nesne)['ucret'] as Nesne)[String(yoneticiId)] !== undefined, true);
    assert.equal(m.D.ayarlar?.['ayarciUcret'], 300);
    assert.equal((m.D['fasoncular'] as Nesne[]).find((x) => x['id'] === 'f1')?.['fiyat'], 5);
  });

  test('MG-02: ham kayıt okuması (planlama-kayitlari) aynı süzgeçten geçer: maliyet okumayan kaynak okuyan görmez, maliyet okuyan görür', async () => {
    await paraliCalisma();
    const k = await kayitlariOku(kaynakOkur);
    paraYok(k, 'kaynak okuyan');
    assert.equal((k.D['siparisler'] as Nesne[]).find((x) => x['id'] === 'MG-S1')?.['adet'], 3, 'ham kayıtta sipariş kalır, tutarsız');
    const m = await kayitlariOku(kaynakMaliyetci);
    assert.equal(m.D.tezgahlar.find((x) => x['id'] === makineId)?.['ucret'], 450);
    assert.equal(m.D['talasFiyat'] !== undefined, true);
    assert.equal((m.D['siparisler'] as Nesne[]).find((x) => x['id'] === 'MG-S1')?.['gelir'], 9000);
  });

  // Süzgeç yalnız finans.maliyet-oku'ya bakar (223 a): sipariş fiyatını okuyabilen ama maliyet okumayan da çalışmadaki para alanlarını
  // almaz. Daha dar olan budur; siparisler.fiyat-oku'ya sipariş gelirini açmak ayrı karardır.
  test('MG-05: sipariş fiyatını okuyan ama maliyet okumayan ham kayıtta sipariş gelirini ve tezgâh ücretini almaz', async () => {
    await paraliCalisma();
    const k = await kayitlariOku(kaynakFiyatOkur);
    paraYok(k, 'fiyat okuyan');
    assert.equal((k.D['siparisler'] as Nesne[]).find((x) => x['id'] === 'MG-S1')?.['adet'], 3);
  });

  // 2897: sipariş geliri, cezası ve gelirden türeyen TL (plan özeti, nabız, mesai kararı neti) maliyet ve sipariş fiyatı yetkisini birlikte
  // ister. Yalnız maliyet okuyan tezgâh ücretini görür, geliri ve plan TL'sini görmez.
  test('MG-06: maliyet okuyan ama sipariş fiyatını okumayan gelir ve plan TL\'sini almaz, maliyet alanlarını alır', async () => {
    await paraliCalisma();
    const k = await kayitlariOku(kaynakGelirsizMaliyetci);
    assert.deepEqual(tara(k, GELIR_ANAHTARI), [], 'ham kayıtta gelir ve türevi yok');
    assert.equal(k.D.tezgahlar.find((x) => x['id'] === makineId)?.['ucret'], 450, 'tezgâh ücreti maliyettir, gelir');
    assert.equal((k.D['siparisler'] as Nesne[]).find((x) => x['id'] === 'MG-S1')?.['adet'], 3);
    assert.equal(((k as unknown as Nesne)['plan'] as Nesne)['ozet'] !== undefined, true, 'plan özeti kalır, TL\'si düşer');
    const c = (await oku(gelirsizMaliyetci)).calisma;
    assert.deepEqual(tara(c, GELIR_ANAHTARI), [], 'çalışmada gelir ve türevi yok');
    assert.equal(c.D.tezgahlar.find((x) => x['id'] === makineId)?.['ucret'], 450);
  });

  test('MG-07: iki yetkiyi de taşıyan gelir ve plan TL\'sini alır', async () => {
    await paraliCalisma();
    const k = await kayitlariOku(kaynakMaliyetci);
    assert.equal((k.D['siparisler'] as Nesne[]).find((x) => x['id'] === 'MG-S1')?.['cezaOran'], 0.5);
    const x = k as unknown as Nesne;
    assert.equal(((x['plan'] as Nesne)['ozet'] as Nesne)['tl'], 1234);
    assert.equal(((x['plan'] as Nesne)['oncekiOzet'] as Nesne)['tl'], 1100);
    assert.equal(((x['nabiz'] as Nesne[])[0]!['o'] as Nesne)['tl'], 280);
    assert.equal((k.D['mesaiKarar'] as Nesne[])[0]!['net'], 777);
    const c = (await oku(maliyetci)).calisma as unknown as Nesne;
    assert.equal(((c['plan'] as Nesne)['ozet'] as Nesne)['tl'], 1234);
  });

  test('MG-08: gelir göremeyenin yazması kayıttaki gelir ve plan TL\'sini silmez, kendi değerini yazamaz', async () => {
    await paraliCalisma();
    for (const kim of [gelirsizMaliyetci, planlamaci]) {
      const p = await oku(kim);
      const c = p.calisma as unknown as Nesne;
      c['plan'] = { ...(c['plan'] as Nesne), ozet: { ...((c['plan'] as Nesne)['ozet'] as Nesne), tl: 1 } };
      await yaz(kim, p.calisma, p.surum);
      const r = (await kayitli()) as unknown as Nesne;
      assert.equal(((r['plan'] as Nesne)['ozet'] as Nesne)['tl'], 1234);
      assert.equal(((r['plan'] as Nesne)['oncekiOzet'] as Nesne)['tl'], 1100);
      assert.equal(((r['nabiz'] as Nesne[])[0]!['o'] as Nesne)['tl'], 280);
      assert.equal((r['nabiz'] as Nesne[])[0]!['imza'], '2800|100|150');
      assert.equal((((r['D'] as Nesne)['mesaiKarar'] as Nesne[])[0]!)['net'], 777);
    }
  });

  test('MG-03: maliyet okumayan planlamacı okuduğunu geri yazınca kayıttaki para alanları silinmez; değiştirdiği öteki alan yazılır', async () => {
    const once = await paraliCalisma();
    const { calisma, surum } = await oku(planlamaci);
    calisma.D.tezgahlar.find((x) => x['id'] === makineId)!['verim'] = 0.7;
    await yaz(planlamaci, calisma, surum);
    const sonra = await kayitli();
    const t = sonra.D.tezgahlar.find((x) => x['id'] === makineId);
    assert.equal(t?.['ucret'], 450);
    assert.equal(t?.['verim'], 0.7);
    assert.deepEqual(sonra.D['maliyetSis'], once.D['maliyetSis']);
    assert.deepEqual(sonra.D['talasFiyat'], once.D['talasFiyat']);
    assert.deepEqual((sonra.D['mesaiSis'] as Nesne)['ucret'], (once.D['mesaiSis'] as Nesne)['ucret']);
    assert.equal(sonra.D.ayarlar?.['ayarciUcret'], 300);
    assert.equal(JSON.stringify(sonra).includes('450 → 500'), true, 'izdeki ayrıntı kayıtta kalır');
    assert.equal((((sonra.senaryolar.find((x) => x['id'] === 's1')?.['D']) as Nesne).tezgahlar as Nesne[])[0]?.['ucret'], 450);
  });

  test('MG-04: maliyet okumayanın gönderdiği para değeri yazılmaz; maliyet okuyan değiştirir', async () => {
    await paraliCalisma();
    const p = await oku(planlamaci);
    p.calisma.D.tezgahlar.find((x) => x['id'] === makineId)!['ucret'] = 1;
    p.calisma.D['talasFiyat'] = [];
    await yaz(planlamaci, p.calisma, p.surum);
    assert.equal((await kayitli()).D.tezgahlar.find((x) => x['id'] === makineId)?.['ucret'], 450);
    assert.equal(((await kayitli()).D['talasFiyat'] as unknown[]).length, 1);
    const m = await oku(maliyetci);
    m.calisma.D.tezgahlar.find((x) => x['id'] === makineId)!['ucret'] = 500;
    await yaz(maliyetci, m.calisma, m.surum);
    assert.equal((await kayitli()).D.tezgahlar.find((x) => x['id'] === makineId)?.['ucret'], 500);
  });
});
