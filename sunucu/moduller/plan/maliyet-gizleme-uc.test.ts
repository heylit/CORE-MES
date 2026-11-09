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
    await yaz(tam, calisma, surum);
    return kayitli();
  }

  const paraYok = (c: Calisma, ad: string): void => {
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
  };

  before(async () => {
    ortam = await testVeritabaniKur('plan_maliyet_gizleme');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    tam = await girisCerezi('yonetici');
    const planlama = ['plan.yaz', 'plan.planlama-oku', 'sayfa.istasyonlar', 'kisiler.oku'];
    planlamaci = await islemliKisi('planlamaci', planlama);
    maliyetci = await islemliKisi('maliyetci', [...planlama, 'finans.maliyet-oku']);
    kaynakOkur = await islemliKisi('kaynakokur', ['recete-rota.oku']);
    kaynakMaliyetci = await islemliKisi('kaynakmaliyetci', ['recete-rota.oku', 'finans.maliyet-oku']);
    const s = ortam.sahip;
    const im = await s.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('MG-IM', 'Deneme merkezi') RETURNING id");
    const istasyonId = (await s.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ('MG-IS', 'Deneme torna', $1, true) RETURNING id", [im!.id]))!.id;
    makineId = String((await s.tek<{ id: number }>("INSERT INTO makine (kod, ad, istasyon_id, aktif) VALUES ('MG-M1', 'Deneme torna 1', $1, true) RETURNING id", [istasyonId]))!.id);
    await ortam.vt.tx((db) => receteRotaKaydiEkle(db, { version: 7, savedAt: 9, items: [], opdefs: [], machines: [], routes: {}, orders: [] }, yoneticiId));
  });
  after(async () => { await ortam?.kaldir(); });

  test('MG-01: maliyet okumayan planlamacı çalışmada para alanlarını görmez; maliyet okuyan görür', async () => {
    await paraliCalisma();
    paraYok((await oku(planlamaci)).calisma, 'planlamacı');
    const m = (await oku(maliyetci)).calisma;
    assert.equal(m.D.tezgahlar.find((x) => x['id'] === makineId)?.['ucret'], 450);
    assert.deepEqual((m.D['maliyetSis'] as Nesne)['dolayli'], [{ id: 'd1', gorev: 'Deneme', brut: 40000 }]);
    assert.equal(((m.D['mesaiSis'] as Nesne)['ucret'] as Nesne)[String(yoneticiId)] !== undefined, true);
    assert.equal(m.D.ayarlar?.['ayarciUcret'], 300);
  });

  test('MG-02: ham kayıt okuması (planlama-kayitlari) aynı süzgeçten geçer: maliyet okumayan kaynak okuyan görmez, maliyet okuyan görür', async () => {
    await paraliCalisma();
    paraYok(await kayitlariOku(kaynakOkur), 'kaynak okuyan');
    const m = await kayitlariOku(kaynakMaliyetci);
    assert.equal(m.D.tezgahlar.find((x) => x['id'] === makineId)?.['ucret'], 450);
    assert.equal(m.D['talasFiyat'] !== undefined, true);
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
