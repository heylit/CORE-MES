import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { kullaniciSemasi } from '#paylasilan/kullanici.ts';
import { cihazDurumuCevabi, cihazProfilleriCevabi, ortakCihazKaydetCevabi } from '#paylasilan/sozlesme/oturum.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from './disari.ts';
import { CIHAZ_CEREZI, ISTASYON_BOSTA_SN, profilSayfalariHatasi, profilUygula } from './kurallar.ts';

// Kart #1358 (1339 a, 1341 a, 1347 a, 1356 a): yetki rol ile cihaz profilinin kesişimidir. Kişi ve cihaz adları uydurmadır.
const PAROLA = 'dogru-parola-1';
const TELEFON_SAYFALARI = ['sayfa.uretim-terminali', 'sayfa.kuyruk', 'sayfa.stok'];

describe('cihaz profili, saf kurallar', () => {
  const kisi = { id: 1, ad: 'Deneme', islemler: ['sayfa.finans', 'sayfa.stok', 'stok.giris'] } as never;

  test('sayfa işlemleri profile göre süzülür, veri işlemleri kalır; Tam sınırsızdır', () => {
    assert.deepEqual(profilUygula(kisi, { kod: 'telefon', sayfalar: TELEFON_SAYFALARI }).islemler, ['sayfa.stok', 'stok.giris']);
    const tam = profilUygula(kisi, { kod: 'tam', sayfalar: null });
    assert.deepEqual(tam.islemler, ['sayfa.finans', 'sayfa.stok', 'stok.giris']);
    assert.equal(tam.cihazProfili, 'tam');
  });

  test('profile yalnız kayıtlı sayfa işlemi bir kez yazılır', () => {
    assert.equal(profilSayfalariHatasi(TELEFON_SAYFALARI), null);
    assert.match(profilSayfalariHatasi(['stok.giris']) ?? '', /Bilinmeyen sayfa/);
    assert.match(profilSayfalariHatasi(['sayfa.yok-boyle']) ?? '', /Bilinmeyen sayfa/);
    assert.match(profilSayfalariHatasi(['sayfa.stok', 'sayfa.stok']) ?? '', /iki kez/);
  });
});

describe('cihaz profili (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let ipSayaci = 0;
  const oturumlar = new Map<string, string>();

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const yeniIp = (): string => { ipSayaci += 1; return `10.8.${ipSayaci >> 8}.${ipSayaci & 255}`; };

  // cihaz: tarayıcının taşıdığı cihaz çerezi (yoksa kayıtsız cihaz).
  async function iste(kisi: string | null, yontem: 'GET' | 'POST', yol: string, cihaz: string | null = null, govde?: unknown) {
    const cerez = [kisi ? oturumlar.get(kisi) : null, cihaz ? `${CIHAZ_CEREZI}=${cihaz}` : null].filter(Boolean).join('; ');
    const basliklar: Record<string, string> = { cookie: cerez };
    if (yontem === 'POST') basliklar[ISTEK_KIMLIGI_BASLIGI] = randomUUID();
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: basliklar, remoteAddress: yeniIp(), ...(govde === undefined ? {} : { payload: govde as object }) });
    const set = ([] as string[]).concat((c.headers['set-cookie'] as string | string[] | undefined) ?? []);
    const cihazCerezi = set.find((s) => s.startsWith(`${CIHAZ_CEREZI}=`))?.split(';')[0]?.slice(CIHAZ_CEREZI.length + 1) ?? null;
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as unknown, cihazCerezi };
  }
  async function giris(kullaniciAdi: string, cihaz: string | null = null) {
    const c = await app.inject({
      method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA }, remoteAddress: yeniIp(),
      headers: cihaz ? { cookie: `${CIHAZ_CEREZI}=${cihaz}` } : {},
    });
    assert.equal(c.statusCode, 200, c.body);
    oturumlar.set(kullaniciAdi, String(c.headers['set-cookie']).split(';')[0] ?? '');
    return kullaniciSemasi.parse(c.json().kullanici);
  }
  const ben = async (cihaz: string | null, kisi = 'yonetici') => {
    const c = await iste(kisi, 'GET', '/oturum', cihaz);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const k = (c.govde as { kullanici: unknown }).kullanici;
    return k === null ? null : kullaniciSemasi.parse(k);
  };
  const durum = async (cihaz: string | null) => cihazDurumuCevabi.parse((await iste('yonetici', 'GET', '/oturum/cihaz', cihaz)).govde);
  const profiller = async (cihaz: string | null) => cihazProfilleriCevabi.parse((await iste('yonetici', 'GET', '/oturum/cihaz-profilleri', cihaz)).govde);
  async function kaydet(ad: string, cihaz: string | null, profil?: string) {
    const c = await iste('yonetici', 'POST', '/oturum/ortak-cihazlar', cihaz, profil === undefined ? { ad } : { ad, profil });
    return { ...c, cihaz: c.durum === 200 ? ortakCihazKaydetCevabi.parse(c.govde).cihaz : null };
  }
  const kayitsiziYaz = async (profil: string, cihaz: string | null) => {
    const { ayar } = await profiller(cihaz);
    return iste('yonetici', 'POST', '/oturum/cihaz-ayari/kayitsiz-profil', cihaz, { kayitsizProfil: profil, surum: ayar.surum });
  };

  // Tam profilli kayıtlı cihaz: kayıtsız cihaz telefona çevrildikten sonra da yönetimin yapıldığı yer.
  let ofis = '';

  before(async () => {
    ortam = await testVeritabaniKur('cihaz_profili');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    const yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const operator = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'operator'");
    const yoneticiRolu = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!operator || !yoneticiRolu) throw new Error('rol yok');
    await ortam.vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: 'Deneme Operator', kullaniciAdi: 'operator', parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, operator.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu.id);
    });
    await giris('yonetici');
    const k = await kaydet('Deneme ofis bilgisayari', null, 'tam');
    assert.equal(k.durum, 200, JSON.stringify(k.govde));
    ofis = k.cihazCerezi ?? '';
  });
  after(async () => { await ortam?.kaldir(); });

  test('göç: kayıtsız cihaz Tam başlar; istasyon ve telefon üç sayfayla gelir', async () => {
    const { profiller: liste, ayar } = await profiller(null);
    assert.equal(ayar.kayitsizProfil, 'tam');
    assert.deepEqual(liste.map((p) => [p.kod, p.sayfalar]), [['tam', null], ['istasyon', TELEFON_SAYFALARI], ['telefon', TELEFON_SAYFALARI]]);
    const kisi = await ben(null);
    assert.equal(kisi?.cihazProfili, 'tam');
    assert.ok(kisi?.islemler.includes('sayfa.finans'));
  });

  test('kayıtsız cihaz telefona çevrilince yönetici de yalnız telefon sayfalarını görür; veri işlemleri kalır, kayıtlı ofis cihazı Tam kalır', async () => {
    assert.equal((await kayitsiziYaz('telefon', null)).durum, 200);
    try {
      const tel = await ben(null);
      assert.equal(tel?.cihazProfili, 'telefon');
      assert.deepEqual(tel?.islemler.filter((i) => i.startsWith('sayfa.')).sort(), [...TELEFON_SAYFALARI].sort());
      assert.ok(tel?.islemler.includes('oturum.ortak-cihaz'), 'veri işlemleri süzülmez; modül kapısı çekirdekte');
      // Giriş cevabı da süzülür: menü ilk çizimde dar gelir.
      const girisCevabi = await giris('operator');
      assert.equal(girisCevabi.cihazProfili, 'telefon');
      assert.ok(girisCevabi.islemler.every((i) => !i.startsWith('sayfa.') || TELEFON_SAYFALARI.includes(i)));
      assert.equal((await durum(null)).profil, 'telefon');
      const ofisten = await ben(ofis);
      assert.equal(ofisten?.cihazProfili, 'tam');
      assert.ok(ofisten?.islemler.includes('sayfa.finans'));
    } finally {
      assert.equal((await kayitsiziYaz('tam', ofis)).durum, 200);
    }
  });

  test('telefondan profil, atama ve kayıtsız ayarı değişmez (yönetici dahil); okuma açıktır', async () => {
    assert.equal((await kayitsiziYaz('telefon', null)).durum, 200);
    try {
      assert.equal((await kayitsiziYaz('tam', null)).durum, 403);
      const tel = (await profiller(null)).profiller.find((p) => p.kod === 'telefon');
      const sayfalar = await iste('yonetici', 'POST', '/oturum/cihaz-profilleri/telefon/sayfalar', null, { sayfalar: ['sayfa.finans'], surum: tel?.surum });
      assert.equal(sayfalar.durum, 403);
      const ofisCihazi = (await iste('yonetici', 'GET', '/oturum/ortak-cihazlar', null)).govde as { cihazlar: { id: number; profilSurum: number }[] };
      const hedef = ofisCihazi.cihazlar[0];
      const ata = await iste('yonetici', 'POST', `/oturum/ortak-cihazlar/${hedef?.id}/profil`, null, { profil: 'tam', surum: hedef?.profilSurum });
      assert.equal(ata.durum, 403);
    } finally {
      assert.equal((await kayitsiziYaz('tam', ofis)).durum, 200);
    }
  });

  test('telefondan kendini kaydeden yönetici profil seçemez: cihaz profilsiz kalır ve kayıtsız profilini alır; Tam cihazdan atanır', async () => {
    assert.equal((await kayitsiziYaz('telefon', null)).durum, 200);
    try {
      assert.equal((await kaydet('Deneme telefon secimli', null, 'tam')).durum, 403);
      const k = await kaydet('Deneme telefon', null);
      assert.equal(k.durum, 200, JSON.stringify(k.govde));
      assert.equal(k.cihaz?.profil, null);
      const tel = k.cihazCerezi;
      assert.deepEqual(await durum(tel), { ortak: false, id: k.cihaz?.id ?? null, ad: 'Deneme telefon', profil: 'telefon' });
      assert.equal((await ben(tel))?.cihazProfili, 'telefon');
      // Ofisten istasyon atanır: cihaz ortak olur (kart girişi ve yerel veri).
      const ata = await iste('yonetici', 'POST', `/oturum/ortak-cihazlar/${k.cihaz?.id}/profil`, ofis, { profil: 'istasyon', surum: null });
      assert.equal(ata.durum, 200, JSON.stringify(ata.govde));
      assert.deepEqual(await durum(tel), { ortak: true, id: k.cihaz?.id ?? null, ad: 'Deneme telefon', profil: 'istasyon' });
      // İlk atama ikinci kez yapılamaz; eski sürümle değişiklik çakışır.
      assert.equal((await iste('yonetici', 'POST', `/oturum/ortak-cihazlar/${k.cihaz?.id}/profil`, ofis, { profil: 'tam', surum: null })).durum, 409);
      const ikinci = await iste('yonetici', 'POST', `/oturum/ortak-cihazlar/${k.cihaz?.id}/profil`, ofis, { profil: 'telefon', surum: 1 });
      assert.equal(ikinci.durum, 200);
      assert.equal((await iste('yonetici', 'POST', `/oturum/ortak-cihazlar/${k.cihaz?.id}/profil`, ofis, { profil: 'tam', surum: 1 })).durum, 409);
      assert.equal((await iste('yonetici', 'POST', '/oturum/ortak-cihazlar/999999/profil', ofis, { profil: 'tam', surum: null })).durum, 404);
    } finally {
      assert.equal((await kayitsiziYaz('tam', ofis)).durum, 200);
    }
  });

  test('profil sayfaları: Tam cihazdan yazılır, bilinmeyen sayfa 400, eski sürüm 409, Tam profili yazılamaz; değişiklik bir sonraki istekte geçerlidir', async () => {
    const ist = await kaydet('Deneme istasyon', null, 'istasyon');
    assert.equal(ist.durum, 200);
    const surum = (await profiller(ofis)).profiller.find((p) => p.kod === 'istasyon')?.surum;
    const yaz = (sayfalar: string[], s: number | undefined, kod = 'istasyon') =>
      iste('yonetici', 'POST', `/oturum/cihaz-profilleri/${kod}/sayfalar`, ofis, { sayfalar, surum: s });
    assert.equal((await yaz(['sayfa.yok-boyle'], surum)).durum, 400);
    assert.equal((await yaz(['sayfa.stok'], surum, 'tam')).durum, 400);
    const ok = await yaz(['sayfa.uretim-terminali', 'sayfa.cizimler'], surum);
    assert.equal(ok.durum, 200, JSON.stringify(ok.govde));
    assert.equal((await yaz(['sayfa.stok'], surum)).durum, 409);
    const kisi = await ben(ist.cihazCerezi);
    assert.deepEqual(kisi?.islemler.filter((i) => i.startsWith('sayfa.')).sort(), ['sayfa.cizimler', 'sayfa.uretim-terminali']);
  });

  test('istasyonda 15 dk boşta kalan oturum geçersizdir; aynı oturum Tam cihazda 12 saat kuralına tabidir', async () => {
    const ist = await kaydet('Deneme bosta istasyon', null, 'istasyon');
    await giris('operator', ist.cihazCerezi);
    const anahtar = oturumlar.get('operator') ?? '';
    // Son açılan oturum operatörün bu girişidir (testler sırayla koşar).
    await o().sahip.sorgu('UPDATE oturum SET son_gorulme = now() - make_interval(secs => $1) WHERE id = (SELECT max(id) FROM oturum)', [ISTASYON_BOSTA_SN + 60]);
    assert.ok(anahtar.length > 0);
    assert.equal(await ben(ist.cihazCerezi, 'operator'), null);
    assert.equal((await ben(null, 'operator'))?.cihazProfili, 'tam');
  });
});
