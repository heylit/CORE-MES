import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { katalogMalzemeOzeti } from '#paylasilan/sozlesme/malzemeler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { malzemeAdlari, malzemeOzeti } from './disari.ts';
import { tamGovde } from './test-kart.ts';
import { surumlu } from './test-surum.ts';

const PAROLA = 'dogru-parola-1';
type Nesne = Record<string, unknown>;
interface Oturum { id: number; cerez: string }
interface DenetimSatiri { kisi_id: number; yontem: string; yol: string; parametre: Nesne | null; govde: Nesne; metin: string }

// Kart #231: kartın ve şablonun bütün içeriği denetim kaydına girmez, yerine boyut ve özet girer; özet birim verir; adsız kart ad listesinde koduyla yer alır.
describe('Malzemeler denetim özeti ve dışa verilen özet (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let yazar: Oturum;
  let yonetici: Oturum;
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const rolId = async (kod: string): Promise<number> => (await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]))!.id;
  async function girisYap(kullaniciAdi: string, rolKodu: string): Promise<Oturum> {
    const yoneticiRolu = await rolId('yonetici');
    const hedefRol = await rolId(rolKodu);
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      if (hedefRol !== yoneticiRolu) {
        await rolAta(db, yoneticiId, yeni, hedefRol);
        await rolAl(db, yoneticiId, yeni, yoneticiRolu);
      }
      return yeni;
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return { id, cerez: String(c.headers['set-cookie']).split(';')[0] ?? '' };
  }
  const gonder = async (o: Oturum, url: string, govde?: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'POST', url: `/api${url}`, headers: { cookie: o.cerez }, ...(govde === undefined ? {} : { payload: (await surumlu(vt(), url, tamGovde(url, govde))) as object }) });
  const denetim = (yol: string, anahtar: string, deger: string): Promise<DenetimSatiri[]> => vt().sorgu<DenetimSatiri>(
    `SELECT kisi_id, yontem, yol, parametre, govde, govde::text AS metin FROM denetim_kaydi WHERE yol = $1 AND parametre ->> $2 = $3 ORDER BY id`,
    [yol, anahtar, deger]);

  const kartGovdesi = (kimlik: string, ad: string, com: Nesne = {}): { kayit: Nesne; ozet: Nesne; surum: null } => ({
    kayit: { id: kimlik, tur: 'hammadde', fam: 'metal', com: { kod: 'HM-DEN-00001', ad, birim: 'adet', ...com }, opts: { koruma: ['Koruyucu folyo'] }, onay: { durum: 'taslak' } },
    ozet: { stok_kodu: 'HM-DEN-00001', tur: 'hammadde', onay_durumu: 'taslak', benzersiz_anahtar: `HM|metal|${kimlik}`, mukerrer_gerekcesi: null },
    surum: null,
  });
  async function kartAc(kimlik: string, ad: string, com: Nesne = {}): Promise<number> {
    const c = await gonder(yazar, `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, kartGovdesi(kimlik, ad, com));
    assert.equal(c.statusCode, 200, c.body);
    return (await vt().tek<{ no: number }>('SELECT no FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]))!.no;
  }
  // Ekranın yazdığı biçime uymayan içerik (birim yok, ad yok) doğrudan satır olarak açılır.
  async function satirAc(kimlik: string, tur: string, onek: string, kayit: Nesne): Promise<number> {
    await vt().sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT DO NOTHING', [onek]);
    await vt().sorgu(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, $3, $4, 'aktif', $5, $6, $6)`, [kimlik, tur, onek, ++sayac, kayit, yazar.id]);
    return (await vt().tek<{ no: number }>('SELECT no FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]))!.no;
  }

  before(async () => {
    ortam = await testVeritabaniKur('malzemedenetim');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    yoneticiId = (await girisYap('d-yonetici', 'yonetici')).id;
    yonetici = await girisYap('d-yonetici-iki', 'yonetici');
    yazar = await girisYap('d-yazar', 'satin_alma');
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('denetim: tam denetimli uçta gövde kayda girer (karşılaştırma); kart kaydet gövde yerine yalnız özet taşır, kim, uç ve kart yine yazılır', async () => {
    // Önce varlık: tam denetimli bir uçta gövde kayıtta görünür, yoksa aşağıdaki yokluk kendiliğinden geçerdi.
    const ayarIcerigi = `ayar-icerigi-${++sayac}`;
    assert.equal((await gonder(yonetici, '/malzeme-katalogu-ayarlari/malzeme/kaydet', { deger: { not: ayarIcerigi } })).statusCode, 200);
    const ayar = await denetim('/malzeme-katalogu-ayarlari/:anahtar/kaydet', 'anahtar', 'malzeme');
    assert.equal(ayar.length, 1);
    assert.deepEqual(ayar[0]?.govde, { deger: { not: ayarIcerigi }, surum: null });

    const kimlik = `den-k${++sayac}`;
    const ad = `Gizli kart adi ${sayac}`;
    await kartAc(kimlik, ad);
    const satirlar = await denetim('/malzeme-katalogu-kartlari/:kimlik/kaydet', 'kimlik', kimlik);
    assert.equal(satirlar.length, 1);
    const s = satirlar[0]!;
    assert.deepEqual(Object.keys(s.govde).sort(), ['_ozet', '_secilen']);
    assert.deepEqual(s.govde['_secilen'], { tur: 'hammadde', onay_durumu: 'taslak', surum: null, talep: false });
    const ozet = s.govde['_ozet'] as { boyut: number; sha256: string };
    assert.equal(Number.isInteger(ozet.boyut) && ozet.boyut > 0, true);
    assert.match(ozet.sha256, /^[0-9a-f]{64}$/);
    assert.equal(s.metin.includes(ad), false, 'kart içeriği kayda girmedi');
    assert.equal(s.metin.includes('Koruyucu folyo'), false);
    assert.deepEqual({ kisi: s.kisi_id, yontem: s.yontem, parametre: s.parametre }, { kisi: yazar.id, yontem: 'POST', parametre: { kimlik } });
  });

  test('denetim: taslak, onaya gönderme, onay ve pasife alma satırlarında kim, tür, onay durumu ve sürüm okunur; kart içeriği satırda yoktur', async () => {
    const kimlik = `den-g${++sayac}`;
    const ad = `Gizli gecis adi ${sayac}`;
    const onayci = await girisYap(`d-onayci-${sayac}`, 'kalite');
    let surum: number | null = null;
    let kod = 'HM-DEN-00001';
    const gecis = async (o: Oturum, durum: string): Promise<void> => {
      const c = await gonder(o, `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, {
        kayit: { id: kimlik, tur: 'hammadde', fam: 'metal', com: { kod, ad, birim: 'adet' }, opts: { koruma: ['Koruyucu folyo'] }, onay: { durum } },
        ozet: { stok_kodu: kod, tur: 'hammadde', onay_durumu: durum, benzersiz_anahtar: `HM|metal|${kimlik}`, mukerrer_gerekcesi: null },
        surum,
      });
      assert.equal(c.statusCode, 200, `${durum}: ${c.body}`);
      const r = c.json() as { surum: number; stok_kodu: string };
      surum = r.surum;
      kod = r.stok_kodu;
    };
    const tabanlar: (number | null)[] = [];
    for (const [o, durum] of [[yazar, 'taslak'], [yazar, 'onayda'], [onayci, 'aktif'], [onayci, 'pasif']] as const) {
      tabanlar.push(surum);
      await gecis(o, durum);
    }
    const satirlar = await denetim('/malzeme-katalogu-kartlari/:kimlik/kaydet', 'kimlik', kimlik);
    assert.deepEqual(
      satirlar.map((s) => ({ kisi: s.kisi_id, secilen: s.govde['_secilen'] })),
      [
        { kisi: yazar.id, secilen: { tur: 'hammadde', onay_durumu: 'taslak', surum: null, talep: false } },
        { kisi: yazar.id, secilen: { tur: 'hammadde', onay_durumu: 'onayda', surum: tabanlar[1], talep: false } },
        { kisi: onayci.id, secilen: { tur: 'hammadde', onay_durumu: 'aktif', surum: tabanlar[2], talep: false } },
        { kisi: onayci.id, secilen: { tur: 'hammadde', onay_durumu: 'pasif', surum: tabanlar[3], talep: false } },
      ],
    );
    assert.equal(tabanlar.slice(1).every((t) => typeof t === 'number'), true);
    for (const s of satirlar) {
      assert.deepEqual(Object.keys(s.govde).sort(), ['_ozet', '_secilen']);
      assert.equal(s.metin.includes(ad), false);
      assert.equal(s.metin.includes('Koruyucu folyo'), false);
      assert.equal(s.metin.includes(kod), false);
    }
  });

  // Köprünün gönderdiği biçimde yazım; başarılı yazımdan sonra sürümü ve sunucunun verdiği kodu izler.
  function yazici(kimlik: string, ad: string): { yaz: (o: Oturum, tur: string, onek: string, durum: string, ek?: { koruma?: string; talep?: Nesne | null }) => Promise<void>; kod: () => string } {
    let surum: number | null = null;
    let kod: string | null = null;
    return {
      kod: () => kod ?? '',
      yaz: async (o, tur, onek, durum, ek = {}) => {
        const gonderilenKod = kod !== null && kod.startsWith(onek) ? kod : `${onek}-DEN-00001`;
        const c = await gonder(o, `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, {
          kayit: {
            id: kimlik, tur, fam: 'metal', com: { kod: gonderilenKod, ad, birim: 'adet' }, opts: { koruma: [ek.koruma ?? 'Koruyucu folyo'] }, onay: { durum },
            ...(ek.talep === undefined ? {} : { talep: ek.talep }),
          },
          ozet: { stok_kodu: gonderilenKod, tur, onay_durumu: durum, benzersiz_anahtar: `${onek}|metal|${kimlik}`, mukerrer_gerekcesi: null },
          surum,
        });
        assert.equal(c.statusCode, 200, `${tur} ${durum}: ${c.body}`);
        const r = c.json() as { surum: number; stok_kodu: string };
        surum = r.surum;
        kod = r.stok_kodu;
      },
    };
  }
  const secimler = async (kimlik: string): Promise<{ kisi: number; tur: unknown; durum: unknown; talep: unknown }[]> =>
    (await denetim('/malzeme-katalogu-kartlari/:kimlik/kaydet', 'kimlik', kimlik)).map((s) => {
      const secilen = s.govde['_secilen'] as Nesne;
      return { kisi: s.kisi_id, tur: secilen['tur'], durum: secilen['onay_durumu'], talep: secilen['talep'] };
    });

  test('denetim: seçimdeki tür gövdedeki türdür; taslakta tür değişince satır yeni türü taşır', async () => {
    const kimlik = `den-t${++sayac}`;
    const k = yazici(kimlik, 'Tur degisen');
    await k.yaz(yazar, 'hammadde', 'HM', 'taslak');
    await k.yaz(yazar, 'sarf', 'SF', 'taslak');
    assert.equal(k.kod().startsWith('SF-'), true);
    const mamul = `den-t${++sayac}`;
    await yazici(mamul, 'Mamul kart').yaz(yazar, 'mamul', 'MM', 'taslak');
    assert.deepEqual((await secimler(kimlik)).map((s) => s.tur), ['hammadde', 'sarf']);
    assert.deepEqual((await secimler(mamul)).map((s) => s.tur), ['mamul']);
  });

  test('denetim: değişiklik talebinin açılması ve kapanması satır dizisinden okunur; talebin içeriği satırda yoktur', async () => {
    const kimlik = `den-d${++sayac}`;
    const onayci = await girisYap(`d-talep-onayci-${sayac}`, 'kalite');
    const k = yazici(kimlik, 'Talepli kart');
    await k.yaz(yazar, 'hammadde', 'HM', 'onayda');
    await k.yaz(onayci, 'hammadde', 'HM', 'aktif');
    // Ekranın `talepOlustur` biçimi: kart aktif kalır, içerik değişmez, gövdeye `talep` eklenir.
    // `yeni` ekranın önerdiği tam karttır; onaycının uyguladığı içerik onunla aynı olmalı (kart #226).
    const yeni = { id: kimlik, tur: 'hammadde', fam: 'metal', com: { ad: 'Talepli kart', birim: 'adet' }, opts: { koruma: ['Talepteki gizli folyo'] } };
    const talep = { id: 't1', durum: 'beklemede', yeni, farklar: [{ f: 'Koruma' }] };
    await k.yaz(yazar, 'hammadde', 'HM', 'aktif', { talep });
    // Onaycı uygular: içerik değişir, talep kalkar.
    await k.yaz(onayci, 'hammadde', 'HM', 'aktif', { koruma: 'Talepteki gizli folyo' });
    // Talep taşımayan düz düzenleme (onay yetkisiyle) ile boş talep alanı da "talep yok" yazar.
    await k.yaz(onayci, 'hammadde', 'HM', 'aktif', { koruma: 'Ucuncu folyo', talep: null });
    assert.deepEqual(await secimler(kimlik), [
      { kisi: yazar.id, tur: 'hammadde', durum: 'onayda', talep: false },
      { kisi: onayci.id, tur: 'hammadde', durum: 'aktif', talep: false },
      { kisi: yazar.id, tur: 'hammadde', durum: 'aktif', talep: true },
      { kisi: onayci.id, tur: 'hammadde', durum: 'aktif', talep: false },
      { kisi: onayci.id, tur: 'hammadde', durum: 'aktif', talep: false },
    ]);
    for (const s of await denetim('/malzeme-katalogu-kartlari/:kimlik/kaydet', 'kimlik', kimlik)) {
      assert.equal(s.metin.includes('Talepteki gizli folyo'), false);
      assert.equal(s.metin.includes('beklemede'), false);
    }
  });

  test('denetim: şablon kaydet gövde yerine özet taşır; kart iptal ve şablon kaldır küçük komutlardır, satırı yazılır', async () => {
    const kimlik = `den-s${++sayac}`;
    const sablonAdi = `Gizli sablon adi ${sayac}`;
    assert.equal((await gonder(yazar, `/malzeme-katalogu-sablonlari/${kimlik}/kaydet`, { sablon: { id: kimlik, ad: sablonAdi, kayit: { tur: 'hammadde' } } })).statusCode, 200);
    const satirlar = await denetim('/malzeme-katalogu-sablonlari/:kimlik/kaydet', 'kimlik', kimlik);
    assert.equal(satirlar.length, 1);
    assert.deepEqual(Object.keys(satirlar[0]!.govde), ['_ozet']);
    assert.equal(satirlar[0]!.metin.includes(sablonAdi), false);
    assert.equal((await gonder(yazar, `/malzeme-katalogu-sablonlari/${kimlik}/kaldir`)).statusCode, 200);
    assert.equal((await denetim('/malzeme-katalogu-sablonlari/:kimlik/kaldir', 'kimlik', kimlik)).length, 1);

    const kart = `den-i${++sayac}`;
    await kartAc(kart, 'Iptal edilecek');
    assert.equal((await gonder(yazar, `/malzeme-katalogu-kartlari/${kart}/iptal`)).statusCode, 200);
    assert.equal((await denetim('/malzeme-katalogu-kartlari/:kimlik/iptal', 'kimlik', kart)).length, 1);
  });

  test('malzemeOzeti birim: kartta com.birim varsa değeri, yoksa ya da boşsa null; her tür aynı alandan okunur', async () => {
    const turler: [string, string][] = [['hammadde', 'HM'], ['yarimamul', 'YM'], ['mamul', 'MM'], ['sarf', 'SF'], ['demirbas', 'DB']];
    for (const [tur, onek] of turler) {
      const var_ = await satirAc(`bir-${tur}-v`, tur, `${onek}-BRM-`, { id: `bir-${tur}-v`, tur, com: { ad: 'Birimli', birim: 'kg' } });
      const yok = await satirAc(`bir-${tur}-y`, tur, `${onek}-BRM-`, { id: `bir-${tur}-y`, tur, com: { ad: 'Birimsiz' } });
      await vt().tx(async (db) => {
        assert.equal((await malzemeOzeti(db, var_))?.birim, 'kg', tur);
        assert.equal((await malzemeOzeti(db, yok))?.birim, null, tur);
      });
    }
    const bos = await satirAc('bir-bos', 'hammadde', 'HM-BRB-', { id: 'bir-bos', com: { ad: 'Bos', birim: '  ' } });
    const sayi = await satirAc('bir-sayi', 'hammadde', 'HM-BRB-', { id: 'bir-sayi', com: { ad: 'Sayi', birim: 5 } });
    const comYok = await satirAc('bir-comyok', 'hammadde', 'HM-BRB-', { id: 'bir-comyok' });
    const ekran = await kartAc(`bir-ekran${++sayac}`, 'Ekran karti', { birim: 'makara' });
    await vt().tx(async (db) => {
      for (const no of [bos, sayi, comYok]) assert.equal((await malzemeOzeti(db, no))?.birim, null);
      const ozet = await malzemeOzeti(db, ekran);
      assert.deepEqual({ ad: ozet?.ad, birim: ozet?.birim }, { ad: 'Ekran karti', birim: 'makara' });
      assert.equal(Object.keys(ozet ?? {}).includes('birim'), true);
      // Sözleşme şeması birimi taşır: şemadan geçen özet birimi düşürmez, birimsiz özet şemaya uymaz.
      assert.equal(katalogMalzemeOzeti.parse(ozet).birim, 'makara');
      const { birim: _birim, ...birimsiz } = ozet!;
      assert.equal(katalogMalzemeOzeti.safeParse(birimsiz).success, false);
      assert.equal(katalogMalzemeOzeti.safeParse({ ...birimsiz, birim: null }).success, true);
    });
  });

  test('malzemeAdlari: adsız (boş, eksik, metin değil) kart koduyla listede yer alır; adı olan adıyla', async () => {
    const adli = await satirAc('adl-a', 'hammadde', 'HM-ADL-', { id: 'adl-a', com: { ad: 'Alüminyum levha' } });
    const adsiz = await satirAc('adl-s', 'hammadde', 'HM-ADL-', { id: 'adl-s', com: {} });
    const bos = await satirAc('adl-b', 'hammadde', 'HM-ADL-', { id: 'adl-b', com: { ad: '   ' } });
    const sayi = await satirAc('adl-y', 'hammadde', 'HM-ADL-', { id: 'adl-y', com: { ad: 42 } });
    const nesneDegil = await satirAc('adl-n', 'hammadde', 'HM-ADL-', { id: 'adl-n', com: 'metin' });
    const kodlar = new Map((await vt().sorgu<{ no: number; stok_kodu: string }>('SELECT no, stok_kodu FROM malzeme_katalog_karti WHERE kimlik LIKE $1', ['adl-%'])).map((x) => [x.no, x.stok_kodu]));
    await vt().tx(async (db: Db) => {
      const harita = await malzemeAdlari(db, [adli, adsiz, bos, sayi, nesneDegil, 999999]);
      assert.equal(harita.get(adli), 'Alüminyum levha');
      for (const no of [adsiz, bos, sayi, nesneDegil]) assert.equal(harita.get(no), kodlar.get(no));
      assert.equal(harita.has(999999), false, 'olmayan numara haritada yok');
      assert.equal(harita.size, 5);
    });
  });
});
