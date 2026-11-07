import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { after, before, describe, it, test } from 'node:test';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uc, uclariKaydet } from '#cekirdek/uc.ts';
import { hataYonetiminiKur } from '#cekirdek/uygulama.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import {
  BAG_KAYIT_YOLU, BAG_YENILE_YOLU, MEYDAN_SN, cihazBagiAcikMi, kanitCoz, kayitBasligi, kayitKanitiniDogrula, meydanBasligi, meydanGecerliMi,
  meydanUret, sfMetniCoz, yenilemeKanitiniDogrula,
} from './cihaz-bagi.ts';
import { cihazBagiDaveti, kimlikCozucu } from './servis.ts';
import { CEREZ_ADI } from './kurallar.ts';
import { oturumUclari } from './uclar.ts';

const b64 = (deger: unknown): string => Buffer.from(JSON.stringify(deger)).toString('base64url');

function kanitImzala(anahtar: KeyObject, alg: 'ES256' | 'RS256', govde: Record<string, unknown>, jwkEkle: boolean): string {
  const bas: Record<string, unknown> = { typ: 'dbsc+jwt', alg };
  if (jwkEkle) {
    const acik = (anahtar as KeyObject & { acik?: KeyObject }).acik;
    bas.jwk = acik?.export({ format: 'jwk' });
  }
  const imzali = `${b64(bas)}.${b64(govde)}`;
  const imza = alg === 'ES256'
    ? sign('sha256', Buffer.from(imzali), { key: anahtar, dsaEncoding: 'ieee-p1363' })
    : sign('sha256', Buffer.from(imzali), anahtar);
  return `${imzali}.${imza.toString('base64url')}`;
}

function anahtarCifti(alg: 'ES256' | 'RS256'): KeyObject & { acik: KeyObject } {
  const cift = alg === 'ES256'
    ? generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    : generateKeyPairSync('rsa', { modulusLength: 2048 });
  return Object.assign(cift.privateKey, { acik: cift.publicKey });
}

describe('cihaz bağı protokol yardımcıları (2226-6 a)', () => {
  it('meydan amacına ve bağına bağlıdır, süresi dolunca geçmez', () => {
    const simdi = Date.UTC(2026, 10, 7, 12);
    const m = meydanUret('kayit', 'ozet-1', simdi);
    assert.equal(meydanGecerliMi(m, 'kayit', 'ozet-1', simdi), true);
    assert.equal(meydanGecerliMi(m, 'yenile', 'ozet-1', simdi), false);
    assert.equal(meydanGecerliMi(m, 'kayit', 'ozet-2', simdi), false);
    assert.equal(meydanGecerliMi(m, 'kayit', 'ozet-1', simdi + (MEYDAN_SN + 1) * 1000), false);
    assert.equal(meydanGecerliMi(`${m}x`, 'kayit', 'ozet-1', simdi), false);
    assert.equal(meydanGecerliMi('bozuk', 'kayit', 'ozet-1', simdi), false);
  });

  it('başlıklar yapılandırılmış alan biçimindedir; sf-string çözülür', () => {
    assert.equal(kayitBasligi('abc'), `(ES256 RS256);path="${BAG_KAYIT_YOLU}";challenge="abc"`);
    assert.equal(meydanBasligi('m1', 'k1'), '"m1";id="k1"');
    assert.equal(sfMetniCoz('"k1"'), 'k1');
    assert.equal(sfMetniCoz('"a\\"b";x=1'), 'a"b');
    assert.equal(sfMetniCoz('k1'), null);
    assert.equal(sfMetniCoz(null), null);
    assert.equal(BAG_YENILE_YOLU.startsWith('/api/'), true);
  });

  for (const alg of ['ES256', 'RS256'] as const) {
    it(`${alg}: kayıt kanıtı jwk ile, yenileme kanıtı saklanan anahtarla doğrulanır`, () => {
      const anahtar = anahtarCifti(alg);
      const kayit = kayitKanitiniDogrula(kanitCoz(kanitImzala(anahtar, alg, { jti: 'm1' }, true)));
      assert.notEqual(kayit, null);
      assert.equal(kayit?.jti, 'm1');
      const jwk = kayit?.jwk ?? {};
      assert.equal(yenilemeKanitiniDogrula(kanitCoz(kanitImzala(anahtar, alg, { jti: 'm2' }, false)), alg, jwk), 'm2');
      const baska = anahtarCifti(alg);
      assert.equal(yenilemeKanitiniDogrula(kanitCoz(kanitImzala(baska, alg, { jti: 'm2' }, false)), alg, jwk), null);
      // Yenilemede jwk taşıyan kanıt kabul edilmez.
      assert.equal(yenilemeKanitiniDogrula(kanitCoz(kanitImzala(anahtar, alg, { jti: 'm2' }, true)), alg, jwk), null);
    });
  }

  it('imzasız (none), yanlış typ ve bozuk kanıt reddedilir', () => {
    const none = `${b64({ typ: 'dbsc+jwt', alg: 'none' })}.${b64({ jti: 'm' })}.`;
    assert.equal(kayitKanitiniDogrula(kanitCoz(none)), null);
    const anahtar = anahtarCifti('ES256');
    const yanlisTip = kanitImzala(anahtar, 'ES256', { jti: 'm' }, true).replace(/^[^.]+/, b64({ typ: 'JWT', alg: 'ES256' }));
    assert.equal(kayitKanitiniDogrula(kanitCoz(yanlisTip)), null);
    assert.equal(kayitKanitiniDogrula(kanitCoz('a.b')), null);
    assert.equal(kayitKanitiniDogrula(kanitCoz(null)), null);
  });

  it('ayar yalnız açıkça kapatılınca kapanır', () => {
    assert.equal(cihazBagiAcikMi({}), true);
    assert.equal(cihazBagiAcikMi({ TMIV2_CIHAZ_BAGI: 'kapali' }), false);
    assert.equal(cihazBagiDaveti('anahtar', false), null);
  });
});

const PAROLA = 'dogru-parola-1';

describe('cihaza bağlı oturum akışı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;

  const cerezler = (basliklar: Record<string, unknown>): Map<string, string> => {
    const ham = basliklar['set-cookie'];
    const liste = Array.isArray(ham) ? ham.map(String) : ham === undefined ? [] : [String(ham)];
    return new Map(liste.map((c) => {
      const [ad = '', deger = ''] = (c.split(';')[0] ?? '').split('=');
      return [ad, deger] as const;
    }));
  };

  const giris = async (kullaniciAdi: string) => {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200);
    const davet = String(c.headers['secure-session-registration']);
    const meydan = /challenge="([^"]+)"/.exec(davet)?.[1] ?? '';
    return { oturum: cerezler(c.headers).get(CEREZ_ADI) ?? '', meydan, davet };
  };

  const ben = (cerez: string) => app.inject({ method: 'GET', url: '/api/test/ben', headers: { cookie: cerez } });

  const kaydet = (oturum: string, kanit: string) =>
    app.inject({ method: 'POST', url: BAG_KAYIT_YOLU, headers: { cookie: `${CEREZ_ADI}=${oturum}`, 'secure-session-response': kanit } });

  const yenile = (oturum: string, kimlik: string, kanit?: string) =>
    app.inject({
      method: 'POST', url: BAG_YENILE_YOLU,
      headers: { cookie: `${CEREZ_ADI}=${oturum}`, 'sec-secure-session-id': `"${kimlik}"`, ...(kanit === undefined ? {} : { 'secure-session-response': kanit }) },
    });

  before(async () => {
    ortam = await testVeritabaniKur('oturum_cihaz_bagi');
    app = Fastify();
    hataYonetiminiKur(app);
    const testUclari = [
      uc({ yontem: 'GET', yol: '/test/ben', yetki: 'oturum', cevap: z.object({ id: z.number() }), isle: ({ kullanici }) => ({ id: kullanici.id }) }),
    ];
    uclariKaydet(app, [...oturumUclari(), ...testUclari], { vt: ortam.vt, kimlik: kimlikCozucu(ortam.vt) });
    await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Kişi', kullaniciAdi: 'bag-kisi', parola: PAROLA }));
    await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Kişi', kullaniciAdi: 'bag-ikinci', parola: PAROLA }));
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('kayıt, bağ çerezi zorunluluğu, yenileme ve tekrar koruması', async () => {
    const { oturum, meydan, davet } = await giris('bag-kisi');
    assert.match(davet, /^\(ES256 RS256\);path="\/api\/oturum\/cihaz-bagi\/kayit";challenge="/);
    assert.equal((await ben(`${CEREZ_ADI}=${oturum}`)).statusCode, 200, 'bağlanmamış oturum bugünkü gibi çalışır');

    const anahtar = anahtarCifti('ES256');
    const kayit = await kaydet(oturum, kanitImzala(anahtar, 'ES256', { jti: meydan }, true));
    assert.equal(kayit.statusCode, 200);
    const talimat = kayit.json();
    assert.equal(talimat.refresh_url, BAG_YENILE_YOLU);
    assert.equal(talimat.credentials[0].name, 'oturum_bagi');
    const bag1 = cerezler(kayit.headers).get('oturum_bagi') ?? '';
    assert.notEqual(bag1, '');
    const kimlik: string = talimat.session_identifier;

    // Çalınan oturum çerezi tek başına geçmez.
    assert.equal((await ben(`${CEREZ_ADI}=${oturum}`)).statusCode, 401);
    assert.equal((await ben(`${CEREZ_ADI}=${oturum}; oturum_bagi=${bag1}`)).statusCode, 200);
    assert.equal((await ben(`${CEREZ_ADI}=${oturum}; oturum_bagi=yanlis`)).statusCode, 401);

    // İkinci kayıt ilk anahtarı değiştiremez.
    const baska = anahtarCifti('ES256');
    const ikinci = await kaydet(oturum, kanitImzala(baska, 'ES256', { jti: meydanUret('kayit', 'x') }, true));
    assert.notEqual(ikinci.statusCode, 200);

    // Yenileme: kanıtsız istek meydan alır (403 + başlık).
    const ilk = await yenile(oturum, kimlik);
    assert.equal(ilk.statusCode, 403);
    const meydanBasl = String(ilk.headers['secure-session-challenge']);
    assert.match(meydanBasl, new RegExp(`;id="${kimlik}"$`));
    const yeniMeydan = sfMetniCoz(meydanBasl) ?? '';

    // Başka anahtarla imzalanan kanıt yeni meydan alır.
    const sahte = await yenile(oturum, kimlik, kanitImzala(baska, 'ES256', { jti: yeniMeydan }, false));
    assert.equal(sahte.statusCode, 403);

    const kanit = kanitImzala(anahtar, 'ES256', { jti: yeniMeydan }, false);
    const tamam = await yenile(oturum, kimlik, kanit);
    assert.equal(tamam.statusCode, 200);
    const bag2 = cerezler(tamam.headers).get('oturum_bagi') ?? '';
    assert.notEqual(bag2, bag1);
    assert.equal((await ben(`${CEREZ_ADI}=${oturum}; oturum_bagi=${bag2}`)).statusCode, 200);
    assert.equal((await ben(`${CEREZ_ADI}=${oturum}; oturum_bagi=${bag1}`)).statusCode, 401, 'eski bağ çerezi ölür');

    // Aynı kanıt ikinci kez kullanılamaz.
    assert.equal((await yenile(oturum, kimlik, kanit)).statusCode, 403);

    // Oturum kimliği başka oturumun çereziyle kullanılamaz.
    const diger = await giris('bag-ikinci');
    assert.equal((await yenile(diger.oturum, kimlik)).statusCode, 401);

    // Çıkıştan sonra yenileme 401 verir (tarayıcı bağlı oturumu kapatır).
    const cikis = await app.inject({ method: 'POST', url: '/api/oturum/cikis', headers: { cookie: `${CEREZ_ADI}=${oturum}; oturum_bagi=${bag2}` } });
    assert.equal(cikis.statusCode, 204);
    assert.equal((await yenile(oturum, kimlik)).statusCode, 401);
  });

  test('kayıt kanıtı geçersizse bağ kurulmaz, oturum bağsız sürer', async () => {
    const { oturum } = await giris('bag-ikinci');
    const anahtar = anahtarCifti('ES256');
    const yanlisMeydan = await kaydet(oturum, kanitImzala(anahtar, 'ES256', { jti: meydanUret('kayit', 'baska-ozet') }, true));
    assert.equal(yanlisMeydan.statusCode, 422);
    assert.equal((await kaydet(oturum, 'bozuk')).statusCode, 422);
    assert.equal((await ben(`${CEREZ_ADI}=${oturum}`)).statusCode, 200);
    const cerezsiz = await app.inject({ method: 'POST', url: BAG_KAYIT_YOLU, headers: { 'secure-session-response': 'x' } });
    assert.equal(cerezsiz.statusCode, 401);
  });
});
