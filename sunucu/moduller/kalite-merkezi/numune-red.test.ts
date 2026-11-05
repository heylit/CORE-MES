import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import type { OrnekVeriTanimi } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { ornekMalzemeNo } from '../malzemeler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { kapanisNcrDurumu, numuneIste, numuneKarariVer, olcumYaz } from './disari.ts';
import { HATALI_NCR_KAYNAGI, KAYNAK_EMIR_ALANI, NUMUNE_NCR_TANIM_ONEKI, numuneNcrGovdesi, numuneNcrKimligi } from './kurallar.ts';
import { resimMerkezdenEkle } from './studyo.ts';

const PAROLA = 'dogru-parola-1';

async function zincir(modul: string): Promise<OrnekVeriTanimi[]> {
  const hepsi = new Map((await modulOrnekVerileriniKesfet()).map((t) => [t.modul, t]));
  const secilen = new Map<string, OrnekVeriTanimi>();
  const ekle = (ad: string): void => {
    const t = hepsi.get(ad);
    if (!t || secilen.has(ad)) return;
    secilen.set(ad, t);
    t.gerekir.forEach(ekle);
  };
  ekle(modul);
  return [...secilen.values()];
}

describe('2131-2 a numune reddinin NCR gövdesi (saf)', () => {
  test('kritik numune Kritik, öteki Majör; emir ve lot boş (karantina yok); tanım emir, operasyon, numune ve uygunsuz balonları taşır', () => {
    const g = {
      numuneId: 7, opNo: 20, kritik: true, neden: 'Her 20 parça', parcaSayisi: 40, not: 'Çap büyük',
      emir: { emirNo: 'UE-1', parcaNo: 'P-1', parcaAd: 'Flanş' }, uygunsuzBalonlar: [1, 3],
    };
    const k = numuneNcrGovdesi(g, 'NCR-2026-0005', 'Kalite Kişi', '2026-11-05');
    assert.deepEqual([k['no'], k['tarih'], k['kaynak'], k['ciddiyet'], k['durum'], k['emir'], k['lot'], k['miktar'], k['mrb'], k['parcaNo'], k['sorumlu']],
      ['NCR-2026-0005', '2026-11-05', HATALI_NCR_KAYNAGI, 'Kritik', 'Açık', '', '', '', 'Karar bekliyor', 'P-1', 'Kalite Kişi']);
    assert.equal(k['tanim'], `${NUMUNE_NCR_TANIM_ONEKI}UE-1 OP 20, numune 7 (Her 20 parça, 40. parça). Uygunsuz balon: 1, 3. Kalite notu: Çap büyük`);
    const sade = numuneNcrGovdesi({ ...g, kritik: false, parcaSayisi: null, not: null, emir: null, uygunsuzBalonlar: [] }, 'N', 'K', '2026-11-05');
    assert.deepEqual([sade['ciddiyet'], sade['parcaNo'], sade['tanim']], ['Majör', '', `${NUMUNE_NCR_TANIM_ONEKI} OP 20, numune 7 (Her 20 parça).`]);
    assert.equal(numuneNcrKimligi(12), 'ncr-numune-12');
  });
});

describe('2131-2 a numune reddi NCR açar (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonId = 0;
  let kalite = '';
  let kaliteId = 0;
  let operator = '';
  let flansEmri = 0;
  let olcu = 0;
  let mastar = 0;
  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const yaz = (cerez: string, url: string, govde: unknown): Promise<LightMyRequestResponse> => app.inject({
    method: 'POST', url: `/api${url}`, payload: govde as object, headers: { cookie: cerez, [ISTEK_KIMLIGI_BASLIGI]: randomUUID() },
  });
  async function girisYap(kullaniciAdi: string, rolKodu: string | null): Promise<{ id: number; cerez: string }> {
    const rol = async (kod: string) => (await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]))!.id;
    const id = rolKodu === null ? yonId : await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yonId, yeni, await rol(rolKodu));
      await rolAl(db, yonId, yeni, await rol('yonetici'));
      return yeni;
    });
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    return { id, cerez: String(r.headers['set-cookie']).split(';')[0] ?? '' };
  }
  async function merkez<T>(cerez: string, yol: string, govde: unknown): Promise<T> {
    const c = await yaz(cerez, yol, govde);
    assert.equal(c.statusCode, 200, c.body);
    return c.json() as T;
  }
  const ncr = async (kimlik: string) => (await o().vt.tek<{ govde: Record<string, unknown> | null }>(
    "SELECT govde FROM kalite_merkezi_belge WHERE koleksiyon = 'ncr' AND kimlik = $1", [kimlik]))?.govde ?? null;
  const ncrSayisi = async () => Number((await o().vt.tek<{ n: string }>("SELECT count(*)::text AS n FROM kalite_merkezi_belge WHERE koleksiyon = 'ncr' AND govde IS NOT NULL"))!.n);
  const numune = (balonlar: number[]) => o().vt.tx((db) => numuneIste(db, yonId, { uretimEmriId: flansEmri, opNo: 20, balonlar, neden: 'Her 20 parça', parcaSayisi: 40 }));

  before(async () => {
    ortam = await testVeritabaniKur('km_numune_red');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yonId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'kmn-yon', parola: PAROLA }));
    const yukle = await ornekVeriYukle(ortam.vt, await zincir('uretim-emirleri'), { ortam: 'test', bildir: () => undefined });
    assert.equal(yukle.durum, 'yuklendi');
    const yonetici = (await girisYap('kmn-yon', null)).cerez;
    const k = await girisYap('kmn-kalite', 'kalite');
    kalite = k.cerez;
    kaliteId = k.id;
    operator = (await girisYap('kmn-operator', 'operator')).cerez;
    let flans = 0;
    await o().vt.tx(async (db) => {
      flans = (await ornekMalzemeNo(db, 'flans'))!;
      flansEmri = (await db.tek<{ id: number }>('SELECT id FROM uretim_emri WHERE malzeme_no = $1', [flans]))!.id;
    });
    const icerik = Buffer.from('%PDF-1.4\n% numune-red\n%%EOF\n');
    const ozet = createHash('sha256').update(icerik).digest('hex');
    await merkez(yonetici, `/dosyalar/${ozet}/parca`, { sira: 0, toplam: 1, veri: icerik.toString('base64') });
    const b = await merkez<{ id: number; surum: number; revizyonlar: { id: number }[] }>(yonetici, '/cizimler', { ad: 'Flanş resmi', tur: 'teknik-resim', ozet, dosyaAdi: 'flans.pdf' });
    await merkez(yonetici, `/cizimler/${b.id}/revizyonlar/${b.revizyonlar[0]?.id}/yayinla`, { surum: b.surum });
    const resim = (await o().vt.tx((db) => resimMerkezdenEkle(db, yonId, { malzemeNo: flans, merkezBelgeId: b.id, revizyon: 'A' }))).id;
    const balon = async (no: number, sinir: [string, string] | null, kritik: boolean) => (await o().sahip.tek<{ id: number }>(
      'INSERT INTO kalite_merkezi_balon (resim_id, no, nominal, alt, ust, kritik, guncelleyen_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [resim, no, sinir === null ? 'Mastar' : `Ø${sinir[0]}`, sinir?.[0] ?? null, sinir?.[1] ?? null, kritik, yonId]))!.id;
    olcu = await balon(1, ['9.95', '10.05'], true);
    mastar = await balon(2, null, false);
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('ret uçtan NCR açar: sunucu numarası (dolu numara atlanır), emre kaynak bağı, kapanış NCR maddesi eksik; onay NCR açmaz', async () => {
    const yil = (await o().vt.tek<{ y: string }>("SELECT to_char(now(), 'YYYY') AS y"))!.y;
    const elle = await yaz(kalite, '/kalite-merkezi/kayitlar/ncr/elle-1/yaz', { govde: { no: `NCR-${yil}-0001`, durum: 'Açık', tanim: 'Elle' }, surum: null });
    assert.equal(elle.statusCode, 200, elle.body);
    const once = await ncrSayisi();

    const onaylanan = await numune([olcu, mastar]);
    await o().vt.tx((db) => olcumYaz(db, kaliteId, 'kalite', { uretimEmriId: flansEmri, numuneId: onaylanan.id, olcumler: [{ balonId: olcu, deger: '10' }, { balonId: mastar, nitel: 'gecer' }] }));
    assert.equal((await yaz(kalite, `/kalite-merkezi/studyo/numuneler/${onaylanan.id}/karar`, { karar: 'onay' })).statusCode, 200);
    assert.equal(await ncrSayisi(), once, 'onay NCR açmaz');

    const reddedilen = await numune([olcu, mastar]);
    await o().vt.tx((db) => olcumYaz(db, kaliteId, 'kalite', { uretimEmriId: flansEmri, numuneId: reddedilen.id, olcumler: [{ balonId: olcu, deger: '10.2' }] }));
    assert.equal((await yaz(operator, `/kalite-merkezi/studyo/numuneler/${reddedilen.id}/karar`, { karar: 'ret', not: 'Çap büyük' })).statusCode, 403);
    assert.equal(await ncrSayisi(), once, 'yetkisiz ret NCR açmaz');
    const r = await yaz(kalite, `/kalite-merkezi/studyo/numuneler/${reddedilen.id}/karar`, { karar: 'ret', not: 'Çap büyük' });
    assert.equal(r.statusCode, 200, r.body);
    const g = await ncr(numuneNcrKimligi(reddedilen.id));
    assert.ok(g !== null, 'ret NCR açar');
    assert.equal(g['no'], `NCR-${yil}-0002`, 'dolu numara atlanır');
    assert.deepEqual([g['durum'], g['ciddiyet'], g['emir'], g['lot'], g[KAYNAK_EMIR_ALANI], g['sorumlu']], ['Açık', 'Kritik', '', '', flansEmri, 'Deneme kmn-kalite']);
    assert.match(String(g['tanim']), /^Numune reddi: .* OP 20, numune \d+ \(Her 20 parça, 40\. parça\)\. Uygunsuz balon: 1\. Kalite notu: Çap büyük$/);
    assert.equal(await ncrSayisi(), once + 1);
    assert.equal((await o().vt.tx((db) => kapanisNcrDurumu(db, flansEmri)))?.durum, 'eksik', 'emir kapanışı NCR\'yi bekler');

    const ikinci = await yaz(kalite, `/kalite-merkezi/studyo/numuneler/${reddedilen.id}/karar`, { karar: 'ret', not: 'yine' });
    assert.equal(ikinci.statusCode, 409, 'karar tektir');
    assert.equal(await ncrSayisi(), once + 1, 'ikinci karar ikinci NCR açmaz');
  });

  test('disari numuneKarariVer: ret NCR\'yi döner; kritik olmayan numunede ciddiyet Majör; karar reddedilirse NCR yazılmaz', async () => {
    const kisi = (await o().vt.tx((db) => kullaniciYukle(db, kaliteId)))!;
    const n = await numune([mastar]);
    const olcusuz = await o().vt.tx((db) => numuneKarariVer(db, kisi, n.id, 'ret', 'gerekçe')).then(() => null, (e: unknown) => e);
    assert.ok(olcusuz !== null, 'ölçüsüz ret reddedilir');
    assert.equal(await ncr(numuneNcrKimligi(n.id)), null, 'reddedilen karar NCR açmaz');
    await o().vt.tx((db) => olcumYaz(db, kaliteId, 'operator', { uretimEmriId: flansEmri, numuneId: n.id, olcumler: [{ balonId: mastar, nitel: 'gecmez' }] }));
    const s = await o().vt.tx((db) => numuneKarariVer(db, kisi, n.id, 'ret', 'Mastar geçmedi'));
    assert.equal(s.numune.karar?.karar, 'ret');
    assert.equal(s.ncr?.kimlik, numuneNcrKimligi(n.id));
    const g = await ncr(numuneNcrKimligi(n.id));
    assert.deepEqual([g?.['no'], g?.['ciddiyet']], [s.ncr?.no, 'Majör']);
  });
});
