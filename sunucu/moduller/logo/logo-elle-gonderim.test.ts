import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { LogoGecisCevabi, LogoyaGonderCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import {
  logoAynaOzetiCozucusu, logoEslemeYaziciCozucusu, logoKartAynasiCozucusu, logoTmiKodCozucusu, logoyaGuncellemeGidecekMalzemeler, malzemeLogoGuncellemeSonucu, malzemeLogoSonucu,
} from '../malzemeler/disari.ts';
import type { LogoAynaKarti } from '../malzemeler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kopruIstemcisiKur } from './kopru.ts';
import { sahteKopruAc } from './sahte-kopru.ts';
import type { SahteKopru } from './sahte-kopru.ts';
import { malzemeTuru, yeniSurecBellegi } from './servis.ts';
import { kopruListesiniYaz } from './sorgular.ts';
import type { TurOrtami, TurSonucu } from './servis.ts';

const PAROLA = 'dogru-parola-1';

// 3632: CORE'daki açıklamaları Logo'ya elle gönder. Yeni yazma yolu yok: kart ad güncellemesi kuyruğuna alınır, istek Logo işinden çıkar.
// Sahte köprü gönderilen alanları kaydeder; Logo'nun sonraki okuması bu gövdeyle taklit edilir (ayna).
describe('CORE açıklamalarını Logo\'ya gönder, sahte köprüyle uçtan uca (3632, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  let okuyucuCerezi = '';
  let kopru: SahteKopru;
  let sayac = 0;
  let simdi = Date.parse('2026-11-24T10:00:00Z');
  const ayna: LogoAynaKarti[] = [];

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = (yontem: 'GET' | 'POST', yol: string, govde?: unknown, c = cerez) =>
    app.inject({ method: yontem, url: `/api${yol}`, headers: { cookie: c, 'istek-kimligi': randomUUID() }, ...(govde === undefined ? {} : { payload: govde as object }) });
  async function tamam<T>(yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<T> {
    const c = await istek(yontem, yol, govde);
    assert.equal(c.statusCode, 200, `${yol}: ${c.body}`);
    return c.json() as T;
  }
  const ayar = (anahtar: string, deger: boolean) => tamam('POST', `/ayarlar/${anahtar}/degistir`, { deger });
  const ortamKur = (): TurOrtami => ({
    kopru: kopruIstemcisiKur({ adres: kopru.adres, anahtar: kopru.anahtar }, { sureMs: 5000 }), bellek: yeniSurecBellegi(), saat: () => new Date(simdi),
    malzemeGuncelleme: { gidecekler: logoyaGuncellemeGidecekMalzemeler, sonuc: malzemeLogoGuncellemeSonucu },
  });
  const tur = (): Promise<TurSonucu> => malzemeTuru(vt(), ortamKur());
  const guncellemeIstekleri = () => kopru.istekler.filter((i) => i.yol.endsWith('/Material/UpdateRich'));

  // Kart Logo'ya gönderilmiş ve Logo'daki hâli (ayna) CORE'dan farklıdır. Fixture: açıklamalar sihirbazda girilmiş gibi.
  async function baglıKart(core: [string | null, string | null, string | null], logo: { ad: string; a2: string | null; a3: string | null }):
    Promise<{ no: number; kimlik: string; kod: string; ref: number; surum: number }> {
    const kimlik = `leg${++sayac}`;
    await tamam('POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, {
      kayit: { id: kimlik, tur: 'hammadde', fam: 'metal', com: { kod: 'HM-LEG-00001', ad: `ORN CORE ad ${kimlik}`, birim: 'kg' }, onay: { durum: 'aktif' },
        grade: 'S235', form: 'cubuk', dims: { d: 20, l: 1000 + sayac } },
      ozet: { benzersiz_anahtar: `hammadde|metal|${kimlik}`, mukerrer_gerekcesi: null },
      surum: null,
    });
    const k = (await vt().tek<{ no: number; kod: string }>('SELECT no, stok_kodu AS kod FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]))!;
    const ref = 70_000 + sayac;
    kopru.kartlar.set(k.kod, ref);
    await vt().tx((db) => malzemeLogoSonucu(db, k.no, { kayitNo: String(ref) }));
    await vt().sorgu('UPDATE malzeme_katalog_karti SET aciklama_1 = $2, aciklama_2 = $3, aciklama_3 = $4 WHERE kimlik = $1', [kimlik, ...core]);
    const surum = (await vt().tek<{ surum: number }>('SELECT surum FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]))!.surum;
    ayna.push({
      logoKayitNo: ref, kod: k.kod, ad: logo.ad, aciklama2: logo.a2, aciklama3: logo.a3, kartTuru: 10, birimSeti: '06', aktif: true, sonOkuma: '2026-11-24T06:00:00.000Z',
    });
    return { ...k, kimlik, ref, surum };
  }
  // Logo'nun sonraki okuması: gönderilen alanlar karta yazılmış sayılır; gövdede olmayan alan Logo'da olduğu gibi kalır.
  const logoOkumasiniUygula = (): void => {
    for (const i of guncellemeIstekleri()) {
      const g = i.govde as { code: string; name: string; name3?: string; name4?: string };
      const k = ayna.find((x) => x.kod === g.code)!;
      k.ad = g.name;
      if (g.name3 !== undefined) k.aciklama2 = g.name3;
      if (g.name4 !== undefined) k.aciklama3 = g.name4;
    }
  };
  const gecis = async (ref: number) => (await tamam<LogoGecisCevabi>('GET', '/malzeme-logo-gecisi?suzgec=tumu')).kartlar.find((k) => k.logoKayitNo === ref)!;
  const gonder = (k: { surum: number }, ref: number, c = cerez) => istek('POST', '/malzeme-logo-gecisi/logoya-gonder', { kartlar: [{ logoKayitNo: ref, surum: k.surum }] }, c);

  before(async () => {
    ortam = await testVeritabaniKur('logoellegonder');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Elle', kullaniciAdi: 'leg-yonetici', parola: PAROLA }));
    const opId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Okuyucu', kullaniciAdi: 'leg-okuyucu', parola: PAROLA }));
    await vt().sorgu("INSERT INTO rol (kod, ad) VALUES ('legokuyucu', 'Okuyucu')");
    await vt().sorgu("INSERT INTO rol_islemi (rol_id, islem) SELECT id, 'sayfa.malzemeler' FROM rol WHERE kod = 'legokuyucu'");
    await vt().sorgu("UPDATE kisi_rolu SET rol_id = (SELECT id FROM rol WHERE kod = 'legokuyucu') WHERE kisi_id = $1", [opId]);
    const giris = async (kullaniciAdi: string): Promise<string> => {
      const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
      assert.equal(c.statusCode, 200, c.body);
      return String(c.headers['set-cookie']).split(';')[0] ?? '';
    };
    cerez = await giris('leg-yonetici');
    okuyucuCerezi = await giris('leg-okuyucu');
    await tamam('POST', '/malzeme-katalogu-ayarlari/genel/kaydet', { deger: { onayAkisi: false } });
    await tamam('POST', '/malzeme-logo-karsiliklari/kaydet', { cesit: 'tur', tmiDegeri: 'hammadde', logoDegeri: '10' });
    await tamam('POST', '/logo/birim-setleri/ekle', { kod: '06', ad: null });
    await tamam('POST', '/malzeme-logo-karsiliklari/kaydet', { cesit: 'birim', tmiDegeri: 'kg', logoDegeri: '06' });
    logoKartAynasiCozucusu(async (_db, o) => ayna.filter((k) => k.logoKayitNo > o.sonra && (o.kodlar === undefined || o.kodlar.includes(k.kod)))
      .sort((a, b) => a.logoKayitNo - b.logoKayitNo).slice(0, o.sinir));
    logoAynaOzetiCozucusu(async () => ({
      kartlar: ayna.map((k) => ({ logoKayitNo: k.logoKayitNo, kod: k.kod, aktif: k.aktif, stok: '5', sonHareket: null, acikSiparis: null })),
      okuma: { acik: false, suruyor: false, okunan: ayna.length, sonTamam: null }, kullanim: { acik: false, sonTamam: null }, arama: { acik: false },
    }));
    logoEslemeYaziciCozucusu(async () => undefined);
    logoTmiKodCozucusu(async () => new Map());
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });
  beforeEach(async () => {
    kopru = await sahteKopruAc();
    simdi += 24 * 3600_000;
    await vt().tx((db) => kopruListesiniYaz(db, kopru.birimSetleri.map((b) => ({ kod: b.code, ad: b.name })), new Date(simdi)));
    // Önceki testin kuyrukta bıraktığı kart bu testin turunu almasın.
    await vt().sorgu("UPDATE malzeme_katalog_karti SET logo_guncelleme_durumu = NULL, logo_guncelleme_hata = NULL, logo_guncelleme_zamani = NULL WHERE logo_guncelleme_durumu IS NOT NULL");
    await ayar('logo.baglanti', true);
    await ayar('logo.malzeme-guncelleme-gonderimi', true);
  });
  afterEach(async () => { await kopru.kapat(); });

  test('LEG-1 gönderim: Logo\'daki ad, NAME3 ve NAME4 CORE\'dakiyle aynı olur, sonraki okumada fark kalmaz; ad Açıklama 1\'den gider', async () => {
    const k = await baglıKart(['ORN CORE bir', 'ORN CORE iki', 'ORN CORE uc'], { ad: 'ORN Logo adi', a2: 'ORN Logo iki', a3: null });
    const once = await gecis(k.ref);
    assert.deepEqual(once.farklar.map((f) => f.alan), ['aciklama_1', 'aciklama_2', 'aciklama_3']);
    const r = (await gonder(k, k.ref)).json() as LogoyaGonderCevabi;
    assert.deepEqual(r.kuyrugaAlinan.map((x) => x.kod), [k.kod], JSON.stringify(r.atlanan));
    assert.equal(guncellemeIstekleri().length, 0, 'istek gönderim kuyruğa alınırken değil, işte çıkar');
    assert.deepEqual(await tur(), { tur: 'guncelleme', no: k.no, sonuc: 'gonderildi' });
    assert.deepEqual(guncellemeIstekleri().map((i) => i.govde), [{ code: k.kod, name: 'ORN CORE bir', name3: 'ORN CORE iki', name4: 'ORN CORE uc' }]);
    assert.deepEqual(await tur(), { tur: 'bos' }, 'kuyruk boşalır, ikinci istek gitmez');
    logoOkumasiniUygula();
    assert.deepEqual((await gecis(k.ref)).farklar, [], 'sonraki okumada fark kalmaz');
    assert.deepEqual((await gecis(k.ref)).logoyaGonder, { gonderilebilir: false, durum: null, hata: null });
  });

  test('LEG-2 Açıklama 1 boşsa Logo adı CORE adıdır; CORE\'da boş Açıklama 2-3 Logo\'daki metni silmez (gövdede yok), fark o alanda kalır', async () => {
    const k = await baglıKart([null, 'ORN CORE iki', null], { ad: 'ORN Logo adi', a2: 'ORN Logo iki', a3: 'ORN Logo uc' });
    assert.equal((await gonder(k, k.ref)).statusCode, 200);
    assert.deepEqual(await tur(), { tur: 'guncelleme', no: k.no, sonuc: 'gonderildi' });
    assert.deepEqual(guncellemeIstekleri().map((i) => i.govde), [{ code: k.kod, name: `ORN CORE ad ${k.kimlik}`, name3: 'ORN CORE iki' }]);
    logoOkumasiniUygula();
    assert.equal(ayna.find((x) => x.kod === k.kod)!.aciklama3, 'ORN Logo uc', 'Logo\'daki Açıklama 3 silinmedi');
    assert.deepEqual((await gecis(k.ref)).farklar, [{ alan: 'aciklama_3', logo: 'ORN Logo uc', tmi: null }]);
  });

  test('LEG-3 ayar kapalıyken düğme neden gösterir, uç 422 verir, kart kuyruğa girmez ve Logo\'ya istek gitmez; kuyruktaki kart ayar açılana dek bekler', async () => {
    const k = await baglıKart(['ORN CORE bir', null, null], { ad: 'ORN Logo adi', a2: null, a3: null });
    await ayar('logo.malzeme-guncelleme-gonderimi', false);
    assert.deepEqual((await tamam<LogoGecisCevabi>('GET', '/malzeme-logo-gecisi?suzgec=tumu')).logoyaGonderim,
      { acik: false, neden: 'Sistem Ayarları\'nda "Logo: malzeme adı güncellemesi" kapalı' });
    const kapali = await gonder(k, k.ref);
    assert.equal(kapali.statusCode, 422, kapali.body);
    assert.deepEqual(await tur(), { tur: 'bos' });
    assert.equal(kopru.istekler.filter((i) => i.yol.includes('/Material/')).length, 0);
    assert.equal((await vt().tek<{ d: string | null }>('SELECT logo_guncelleme_durumu AS d FROM malzeme_katalog_karti WHERE no = $1', [k.no]))!.d, null);
    await ayar('logo.malzeme-guncelleme-gonderimi', true);
    assert.equal((await gonder(k, k.ref)).statusCode, 200);
    await ayar('logo.malzeme-guncelleme-gonderimi', false);
    assert.deepEqual(await tur(), { tur: 'bos' }, 'kapanınca kuyruk okunmaz');
    assert.equal(guncellemeIstekleri().length, 0);
  });

  test('LEG-4 yetki: kartı yazamayan 403 alır, kart kuyruğa girmez; Logo reddederse hata kartta ve listede görünür', async () => {
    const k = await baglıKart(['ORN CORE bir', null, null], { ad: 'ORN Logo adi', a2: null, a3: null });
    assert.equal((await gonder(k, k.ref, okuyucuCerezi)).statusCode, 403);
    assert.equal((await vt().tek<{ d: string | null }>('SELECT logo_guncelleme_durumu AS d FROM malzeme_katalog_karti WHERE no = $1', [k.no]))!.d, null);
    kopru.kartlar.delete(k.kod);
    assert.equal((await gonder(k, k.ref)).statusCode, 200);
    assert.deepEqual(await tur(), { tur: 'guncelleme', no: k.no, sonuc: 'reddedildi' });
    const s = (await gecis(k.ref)).logoyaGonder;
    assert.equal(s.durum, 'hata');
    assert.match(s.hata ?? '', /Güncelleme: .*Card not found/);
  });
  test('LEG-5 yalnız aktif kart gider, sırada olan kart ikinci kez girmez, denetim kaydı "Logo\'da şimdi" değerlerini taşır, tek işlem en çok 100 kart', async () => {
    const aktif = await baglıKart(['ORN CORE bir', 'ORN CORE iki', null], { ad: 'ORN Logo adi', a2: 'ORN Logo iki', a3: null });
    const taslak = await baglıKart(['ORN CORE bir', null, null], { ad: 'ORN Logo taslak adi', a2: null, a3: null });
    await vt().sorgu("UPDATE malzeme_katalog_karti SET onay_durumu = 'taslak' WHERE kimlik = $1", [taslak.kimlik]);
    const c = await istek('POST', '/malzeme-logo-gecisi/logoya-gonder', { kartlar: [{ logoKayitNo: aktif.ref, surum: aktif.surum }, { logoKayitNo: taslak.ref, surum: taslak.surum }] });
    assert.equal(c.statusCode, 200, c.body);
    const s = c.json() as LogoyaGonderCevabi;
    assert.deepEqual(s.kuyrugaAlinan.map((x) => x.logoKayitNo), [aktif.ref]);
    assert.deepEqual(s.atlanan.map((x) => [x.logoKayitNo, x.neden]), [[taslak.ref, "Yalnız aktif kart Logo'ya gönderilir."]]);
    assert.equal((await gecis(taslak.ref)).logoyaGonder.gonderilebilir, false);
    // Sırada olan kart yeniden kuyruğa alınmaz.
    const ikinci = await gonder(aktif, aktif.ref);
    assert.deepEqual((ikinci.json() as LogoyaGonderCevabi).atlanan.map((x) => x.neden), ['Gönderim zaten sırada.']);
    const iz = await vt().tek<{ govde: { _ek: { logoKayitNo: number; kod: string; simdi1: string; simdi2: string | null; simdi3: string | null; kisaldi: boolean }[] } }>(
      "SELECT govde FROM denetim_kaydi WHERE yol = '/malzeme-logo-gecisi/logoya-gonder' AND govde::text LIKE $1 ORDER BY id DESC LIMIT 1", [`%${aktif.kod}%`]);
    assert.deepEqual(iz?.govde._ek, [{ logoKayitNo: aktif.ref, kod: aktif.kod, simdi1: 'ORN Logo adi', simdi2: 'ORN Logo iki', simdi3: null, kisaldi: false }]);
    const cok = await istek('POST', '/malzeme-logo-gecisi/logoya-gonder', { kartlar: Array.from({ length: 101 }, (_, i) => ({ logoKayitNo: i + 1, surum: 1 })) });
    assert.equal(cok.statusCode, 400);
  });
});
