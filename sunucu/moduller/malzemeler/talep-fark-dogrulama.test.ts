import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { KatalogKartiKaydetCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { tamGovde } from './test-kart.ts';

const PAROLA = 'dogru-parola-1';

type Nesne = Record<string, unknown>;
interface Fark { f: string; a: string; b: string }

// Kart #226: değişiklik talebindeki fark ve uygulanan içerik. Gövdeler ekranın `talepOlustur` / `talepUygula` ürettiği biçimdedir
// (`katalog.html`): talep = { id, durum: 'beklemede', yeni (önerilen tam kart), farklar ([{ f, a, b }]), by, byAd, t };
// uygulama = `yeni` + sunucunun kartı, `talep` yok, `rev` sona tek kayıt, `onay` aktif.
describe('Değişiklik talebi: sunucu farkı doğrular (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let onayci = '';
  let onayci2 = '';
  let yazar = '';
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = (cerezi: string, url: string, govde: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'POST', url: `/api${url}`, headers: { cookie: cerezi }, payload: tamGovde(url, govde) as object });
  const rolId = async (kod: string): Promise<number> => (await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]))!.id;
  async function girisYap(kullaniciAdi: string, rolKodu: string, aktor?: number): Promise<{ id: number; cerez: string }> {
    const yoneticiRolu = await rolId('yonetici');
    const hedefRol = await rolId(rolKodu);
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      if (hedefRol !== yoneticiRolu && aktor !== undefined) {
        await rolAta(db, aktor, yeni, hedefRol);
        await rolAl(db, aktor, yeni, yoneticiRolu);
      }
      return yeni;
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return { id, cerez: String(c.headers['set-cookie']).split(';')[0] ?? '' };
  }

  before(async () => {
    ortam = await testVeritabaniKur('malzemefark');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    const ilk = await girisYap('f-onayci', 'yonetici');
    onayci = ilk.cerez;
    onayci2 = (await girisYap('f-onayci-iki', 'yonetici')).cerez;
    yazar = (await girisYap('f-yazar', 'satin_alma', ilk.id)).cerez;
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  const ONEK: Record<string, string> = { hammadde: 'HM', yarimamul: 'YM', mamul: 'MM', sarf: 'SF', demirbas: 'DB' };

  interface Kart { kimlik: string; tur: string; surum: number; stokKodu: string; icerik: Nesne; rev: Nesne[] }

  // Ekranın kaydettiği aktif kart: tür, aile, seçenekler, ticari alanlar, ek özellikler.
  const icerikKur = (kimlik: string, tur: string): Nesne => ({
    id: kimlik, tur, fam: 'metal', tol: 'h9', opts: { koruma: ['Koruyucu folyo'] }, extra: [{ ad: 'Sertlik', v: '200', u: 'HB' }], docs: [],
    com: { kod: `${ONEK[tur]}-FRK-00001`, ad: `Fark kart ${kimlik}`, birim: 'adet', ted: 'Tedarikçi A', sertifika: ['3.1'], not: 'ilk not' },
  });
  const gonder = (cerez: string, k: Kart, durum: string, kayit: Nesne): Promise<LightMyRequestResponse> => istek(cerez, `/malzeme-katalogu-kartlari/${k.kimlik}/kaydet`, {
    kayit: { ...kayit, onay: { durum } },
    ozet: { stok_kodu: k.stokKodu, tur: k.tur, onay_durumu: durum, benzersiz_anahtar: `${k.tur}|metal|${k.kimlik}`, mukerrer_gerekcesi: null },
    surum: k.surum,
  });
  async function kaydet(cerez: string, k: Kart, durum: string, kayit: Nesne): Promise<void> {
    const c = await gonder(cerez, k, durum, kayit);
    assert.equal(c.statusCode, 200, c.body);
    const r = c.json() as KatalogKartiKaydetCevabi;
    k.surum = r.surum;
    k.stokKodu = r.stok_kodu;
  }
  async function ret(durum: number, kod: string, cerez: string, k: Kart, kayit: Nesne): Promise<void> {
    const c = await gonder(cerez, k, 'aktif', kayit);
    assert.deepEqual({ durum: c.statusCode, kod: c.json().kod }, { durum, kod }, c.body);
  }
  const kayitOku = async (k: Kart): Promise<Nesne> => (await vt().tek<{ kayit: Nesne }>('SELECT kayit FROM malzeme_katalog_karti WHERE kimlik = $1', [k.kimlik]))!.kayit;

  async function aktifKart(tur = 'hammadde'): Promise<Kart> {
    const kimlik = `frk${++sayac}`;
    const k: Kart = { kimlik, tur, surum: 0, stokKodu: `${ONEK[tur]}-FRK-00001`, icerik: icerikKur(kimlik, tur), rev: [] };
    const ilk = await istek(yazar, `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, {
      kayit: { ...k.icerik, onay: { durum: 'onayda' } },
      ozet: { stok_kodu: k.stokKodu, tur, onay_durumu: 'onayda', benzersiz_anahtar: `${tur}|metal|${kimlik}`, mukerrer_gerekcesi: null },
      surum: null,
    });
    assert.equal(ilk.statusCode, 200, ilk.body);
    k.surum = (ilk.json() as KatalogKartiKaydetCevabi).surum;
    k.stokKodu = (ilk.json() as KatalogKartiKaydetCevabi).stok_kodu;
    k.icerik = (await kayitOku(k)) as Nesne;
    await kaydet(onayci2, k, 'aktif', k.icerik);
    k.icerik = { ...icerikKur(kimlik, tur), com: { ...(icerikKur(kimlik, tur)['com'] as Nesne), kod: k.stokKodu } };
    return k;
  }

  // Ekranın `talepOlustur` gövdesi: kart olduğu gibi + `talep`; `farklar` istemcinin hesabı (burada elle, sahte olabilir).
  function talepGovdesi(k: Kart, yeni: Nesne, farklar: Fark[]): Nesne {
    const rev = { t: 7, by: 1, ch: [{ f: 'Değişiklik talebi', a: '—', b: `${farklar.length} alan` }] };
    k.rev = [...k.rev, rev];
    return {
      ...k.icerik, rev: k.rev, updatedAt: 7,
      talep: { id: 't1', durum: 'beklemede', yeni: { ...yeni, updatedAt: 7 }, farklar, by: 1, byAd: 'x', t: 7 },
    };
  }
  // Ekranın `talepUygula('onayla')` gövdesi: önerilen kart, talep yok, geçmişe tek kayıt.
  function uygulamaGovdesi(k: Kart, yeni: Nesne): Nesne {
    k.rev = [...k.rev, { t: 8, by: 2, ch: [] }];
    return { ...yeni, id: k.kimlik, rev: k.rev, updatedAt: 8 };
  }
  const sunucuFarki = async (k: Kart): Promise<Fark[]> => ((await kayitOku(k))['talep'] as Nesne)['farklar'] as Fark[];

  test('sahte fark: eksik alan ve yanlış eski/yeni değer, kayıtlı farkta gerçeğe çevrilir (onaycının göreceği saklanan fark)', async () => {
    const k = await aktifKart();
    const yeni = { ...k.icerik, opts: { koruma: ['Yeni folyo'] }, com: { ...(k.icerik['com'] as Nesne), not: 'gizli değişiklik', ted: 'Tedarikçi B' } };
    // Yazar yalnız koruma değişikliğini ve yanlış eski/yeni değerle gösterir; not ve tedarikçi farkta yok.
    await kaydet(yazar, k, 'aktif', talepGovdesi(k, yeni, [{ f: 'Koruma', a: 'Hiç', b: 'Folyo' }]));
    const farklar = await sunucuFarki(k);
    assert.deepEqual(farklar, [
      { f: 'com.not', a: 'ilk not', b: 'gizli değişiklik' },
      { f: 'com.ted', a: 'Tedarikçi A', b: 'Tedarikçi B' },
      { f: 'opts.koruma', a: '["Koruyucu folyo"]', b: '["Yeni folyo"]' },
    ]);
  });

  test('sahte fark: boş fark gönderen yazarın gizli değişikliği de kayıtlı farkta görünür', async () => {
    const k = await aktifKart();
    await kaydet(yazar, k, 'aktif', talepGovdesi(k, { ...k.icerik, fam: 'plastik' }, []));
    assert.deepEqual(await sunucuFarki(k), [{ f: 'fam', a: 'metal', b: 'plastik' }]);
  });

  test('sahte fark: sunucunun farkı ekranın göstereceği 30 satıra sığar, taşan alanlar adı ve yeni değeriyle son satırda anılır', async () => {
    const k = await aktifKart();
    const cok = Object.fromEntries(Array.from({ length: 45 }, (_, i) => [`alan${String(i).padStart(2, '0')}`, `v${i}`]));
    await kaydet(yazar, k, 'aktif', talepGovdesi(k, { ...k.icerik, ...cok }, []));
    const farklar = await sunucuFarki(k);
    assert.ok(farklar.length <= 30, `satır sayısı ${farklar.length}`);
    for (let i = 0; i < 45; i++) {
      const ad = `alan${String(i).padStart(2, '0')}`;
      const gorunur = farklar.some((x) => (x.f === ad && x.b === `v${i}`) || x.b.split('; ').includes(`${ad}: v${i}`));
      assert.ok(gorunur, `${ad} yeni değeriyle farkta görünmüyor`);
    }
  });

  test('sahte fark: taşan alanın eski değeri de onaycıya görünür (yazar 30 satırın arkasına değer değişikliği gizleyemez)', async () => {
    const k = await aktifKart();
    const taban = Object.fromEntries(Array.from({ length: 35 }, (_, i) => [`alan${String(i).padStart(2, '0')}`, `eski${i}`]));
    k.rev = [...k.rev, { t: 8, by: 2, ch: [] }];
    await kaydet(onayci, k, 'aktif', { ...k.icerik, ...taban, rev: k.rev, updatedAt: 8 });
    k.icerik = { ...k.icerik, ...taban };
    const yeni = { ...k.icerik, ...Object.fromEntries(Object.keys(taban).map((a, i) => [a, `yeni${i}`])) };
    await kaydet(yazar, k, 'aktif', talepGovdesi(k, yeni, []));
    const son = (await sunucuFarki(k)).at(-1);
    assert.ok(son?.a.split('; ').includes('alan34: eski34') && son.b.split('; ').includes('alan34: yeni34'), JSON.stringify(son));
    await kaydet(onayci, k, 'aktif', uygulamaGovdesi(k, yeni));
    assert.equal((await kayitOku(k))['alan34'], 'yeni34');
  });

  test('sahte fark: noktalı üst anahtar iç içe alanı gizleyemez (`"com.ad"` ile `com.ad` ayrı yoldur)', async () => {
    const k = await aktifKart();
    const com = k.icerik['com'] as Nesne;
    // Üst düzeydeki "com.ad" anahtarı eski adı taşır; gerçek ad değişikliği `com.ad` yaprağındadır.
    const yeni = { ...k.icerik, com: { ...com, ad: 'Gizli ad' }, 'com.ad': com['ad'] };
    await kaydet(yazar, k, 'aktif', talepGovdesi(k, yeni, []));
    const farklar = await sunucuFarki(k);
    assert.ok(farklar.some((x) => x.a === com['ad'] && x.b === 'Gizli ad'), JSON.stringify(farklar));
    assert.equal(new Set(farklar.map((x) => x.f)).size, farklar.length, 'iki yol aynı adla görünmez');
  });

  test('izinli: noktalı anahtar taşıyan meşru talep uygulanır', async () => {
    const k = await aktifKart();
    const yeni = { ...k.icerik, opts: { 'Kalite 1.2': ['A'] } };
    await kaydet(yazar, k, 'aktif', talepGovdesi(k, yeni, []));
    assert.deepEqual((await sunucuFarki(k)).map((x) => x.f), ['opts.[Kalite 1.2]', 'opts.koruma']);
    await kaydet(onayci, k, 'aktif', uygulamaGovdesi(k, yeni));
    assert.deepEqual((await kayitOku(k))['opts'], { 'Kalite 1.2': ['A'] });
  });

  test('bayat talep: 30 satırı aşan farkta taşan alanın tabanı değişince de 409', async () => {
    const k = await aktifKart();
    const cok = Object.fromEntries(Array.from({ length: 45 }, (_, i) => [`alan${String(i).padStart(2, '0')}`, `v${i}`]));
    const yeni = { ...k.icerik, ...cok };
    await kaydet(yazar, k, 'aktif', talepGovdesi(k, yeni, []));
    const talep = (await kayitOku(k))['talep'] as Nesne;
    // alan40 farkın taşan kısmında (yalnız adıyla anılır); onaycı tabanını değiştirir.
    k.rev = [...k.rev, { t: 9, by: 2, ch: [] }];
    await kaydet(onayci, k, 'aktif', { ...k.icerik, alan40: 'baska', rev: k.rev, updatedAt: 9, talep });
    await ret(409, 'CAKISMA', onayci2, k, uygulamaGovdesi(k, yeni));
    assert.equal((await kayitOku(k))['alan40'], 'baska');
  });

  test('izinli: 30 satırı aşan talep, taban değişmemişse uygulanır', async () => {
    const k = await aktifKart();
    const cok = Object.fromEntries(Array.from({ length: 45 }, (_, i) => [`alan${String(i).padStart(2, '0')}`, `v${i}`]));
    const yeni = { ...k.icerik, ...cok };
    await kaydet(yazar, k, 'aktif', talepGovdesi(k, yeni, []));
    await kaydet(onayci, k, 'aktif', uygulamaGovdesi(k, yeni));
    assert.equal((await kayitOku(k))['alan44'], 'v44');
  });

  test('talep alanını null göndermek uygulama denetimini atlatmaz: önerilmeyen içerik 422, önerilen içerik uygulanır', async () => {
    const k = await aktifKart();
    const yeni = { ...k.icerik, tol: 'h7' };
    await kaydet(yazar, k, 'aktif', talepGovdesi(k, yeni, []));
    await ret(422, 'GECERSIZ', onayci, k, { ...uygulamaGovdesi(k, { ...yeni, fam: 'plastik' }), talep: null });
    k.rev = k.rev.slice(0, -1);
    await kaydet(onayci, k, 'aktif', { ...uygulamaGovdesi(k, yeni), talep: null });
    assert.equal((await kayitOku(k))['tol'], 'h7');
  });

  test('sahte fark: istemcinin gönderdiği fark özeti yok sayılır', async () => {
    const k = await aktifKart();
    const yeni = { ...k.icerik, tol: 'h7' };
    const g = talepGovdesi(k, yeni, []);
    await kaydet(yazar, k, 'aktif', { ...g, talep: { ...(g['talep'] as Nesne), farkOzeti: 'sahte' } });
    assert.notEqual(((await kayitOku(k))['talep'] as Nesne)['farkOzeti'], 'sahte');
  });

  test('sahte fark: sahibi talebini değiştirince fark yeniden hesaplanır; değişmeyen talepte kayıtlı fark istemci değiştirse de korunur', async () => {
    const k = await aktifKart();
    await kaydet(yazar, k, 'aktif', talepGovdesi(k, { ...k.icerik, tol: 'h7' }, []));
    const ilk = await sunucuFarki(k);
    assert.deepEqual(ilk, [{ f: 'tol', a: 'h9', b: 'h7' }]);
    const kayit = await kayitOku(k);
    const talep = kayit['talep'] as Nesne;
    // Aynı talep, istemci farkı sahtelemiş: yok sayılır.
    await kaydet(yazar, k, 'aktif', { ...k.icerik, rev: k.rev, updatedAt: 9, talep: { ...talep, farklar: [{ f: 'Sahte', a: '1', b: '2' }] } });
    assert.deepEqual(await sunucuFarki(k), ilk);
    // Önerilen içerik değişti: yeni fark.
    await kaydet(yazar, k, 'aktif', { ...k.icerik, rev: k.rev, updatedAt: 10, talep: { ...talep, yeni: { ...(talep['yeni'] as Nesne), tol: 'h6' } } });
    assert.deepEqual(await sunucuFarki(k), [{ f: 'tol', a: 'h9', b: 'h6' }]);
  });

  test('onay isteğiyle farklı içerik uygulatılamaz: talepte olmayan içerik 422, talepteki içerik uygulanır', async () => {
    const k = await aktifKart();
    const yeni = { ...k.icerik, opts: { koruma: ['Onaylanan folyo'] } };
    await kaydet(yazar, k, 'aktif', talepGovdesi(k, yeni, [{ f: 'Koruma', a: 'a', b: 'b' }]));
    const once = await kayitOku(k);
    const surum = k.surum;
    const baska = { ...yeni, fam: 'plastik', com: { ...(k.icerik['com'] as Nesne), ad: 'Başka ad' } };
    await ret(422, 'GECERSIZ', onayci, k, uygulamaGovdesi(k, baska));
    assert.deepEqual(await kayitOku(k), once, 'ret kartı değiştirmez');
    assert.equal(k.surum, surum);
    k.rev = k.rev.slice(0, -1);
    await kaydet(onayci, k, 'aktif', uygulamaGovdesi(k, yeni));
    const sonra = await kayitOku(k);
    assert.equal(sonra['talep'], undefined);
    assert.deepEqual(sonra['opts'], { koruma: ['Onaylanan folyo'] });
    assert.equal(sonra['fam'], 'metal');
  });

  test('onay isteğine başka alan eklenemez ve talebin tuttuğu birlesen/mukerrerOnay dışarıdan kurulamaz', async () => {
    const k = await aktifKart();
    const yeni = { ...k.icerik, tol: 'h7' };
    await kaydet(yazar, k, 'aktif', talepGovdesi(k, yeni, []));
    await ret(422, 'GECERSIZ', onayci, k, { ...uygulamaGovdesi(k, yeni), ekstra: 'gizli' });
    k.rev = k.rev.slice(0, -1);
    await ret(422, 'GECERSIZ', onayci, k, { ...uygulamaGovdesi(k, yeni), mukerrerOnay: true });
  });

  test('bayat talep: aktif kart başka yolla değişince talep uygulanamaz (409), reddedilebilir', async () => {
    const k = await aktifKart();
    const yeni = { ...k.icerik, opts: { koruma: ['Talep folyosu'] } };
    await kaydet(yazar, k, 'aktif', talepGovdesi(k, yeni, []));
    const talep = (await kayitOku(k))['talep'] as Nesne;
    // Onaycı kartı doğrudan düzenler (kullanıcı kararı: kalır), bekleyen talep durur.
    k.rev = [...k.rev, { t: 9, by: 2, ch: [] }];
    await kaydet(onayci, k, 'aktif', { ...k.icerik, tol: 'h6', rev: k.rev, updatedAt: 9, talep });
    const duzenlenmis = { ...k.icerik, tol: 'h6' };
    // Talep eski tabana göre hazırlandı; uygulanırsa onaycının düzenlemesi sessizce geri alınırdı.
    await ret(409, 'CAKISMA', onayci2, k, uygulamaGovdesi(k, yeni));
    assert.equal((await kayitOku(k))['tol'], 'h6');
    // Reddetme (içerik aynı, talep düşer) her zaman çalışır.
    k.rev = k.rev.slice(0, -1);
    k.rev = [...k.rev, { t: 10, by: 2, ch: [] }];
    await kaydet(onayci2, k, 'aktif', { ...duzenlenmis, rev: k.rev, updatedAt: 10 });
    assert.equal((await kayitOku(k))['talep'], undefined);
  });

  for (const tur of ['hammadde', 'yarimamul', 'mamul', 'sarf', 'demirbas']) {
    test(`meşru akış (${tur}): talep aç, onaycı uygular; ikinci talep reddedilir`, async () => {
      const k = await aktifKart(tur);
      const yeni = { ...k.icerik, opts: { koruma: [`${tur} folyosu`] }, com: { ...(k.icerik['com'] as Nesne), not: 'talep notu' } };
      await kaydet(yazar, k, 'aktif', talepGovdesi(k, yeni, [{ f: 'Koruma', a: '—', b: 'x' }]));
      const farklar = await sunucuFarki(k);
      assert.deepEqual(farklar.map((x) => x.f), ['com.not', 'opts.koruma']);
      await kaydet(onayci, k, 'aktif', uygulamaGovdesi(k, yeni));
      const sonra = await kayitOku(k);
      assert.equal(sonra['talep'], undefined);
      assert.deepEqual(sonra['opts'], { koruma: [`${tur} folyosu`] });
      assert.equal((sonra['com'] as Nesne)['not'], 'talep notu');
      // Ret: onaycı talebi düşürür, içerik aynı kalır.
      const yeni2 = { ...yeni, tol: 'h5' };
      k.icerik = yeni;
      await kaydet(yazar, k, 'aktif', talepGovdesi(k, yeni2, []));
      assert.deepEqual(await sunucuFarki(k), [{ f: 'tol', a: 'h9', b: 'h5' }]);
      k.rev = [...k.rev, { t: 11, by: 2, ch: [] }];
      await kaydet(onayci2, k, 'aktif', { ...yeni, id: k.kimlik, rev: k.rev, updatedAt: 11 });
      const red = await kayitOku(k);
      assert.equal(red['talep'], undefined);
      assert.equal(red['tol'], 'h9');
    });
  }
});
