import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from './disari.ts';

const PAROLA = 'dogru-parola-1';

interface Oturum { cerez: string; islemler: string[] }

// Onaylı rol dağılımı (kullanıcı kararı 07.10.2026): yetkiler yalnız göçlerden gelir, sınama hiçbir role işlem eklemez.
// Ölçülen uçların davranışıdır: Arkon rolünü Arkon'un kendi çözümü, tanım yetkisini malzemelerin ayar ucu söyler.
describe('rol dağılımı: Arkon rolleri, bakım rolü ve malzeme tanım yetkisi (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const rolId = async (kod: string): Promise<number> => {
    const rol = await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]);
    if (!rol) throw new Error(`rol yok: ${kod}`);
    return rol.id;
  };
  async function girisYap(rolKodu: string, ekRolKodu?: string): Promise<Oturum> {
    const kullaniciAdi = `d${(sayac += 1)}-${rolKodu.replaceAll('_', '-')}`;
    const yoneticiRolu = await rolId('yonetici');
    const hedefRol = await rolId(rolKodu);
    const ekRol = ekRolKodu === undefined ? null : await rolId(ekRolKodu);
    await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      if (yoneticiId === 0) yoneticiId = yeni;
      if (hedefRol !== yoneticiRolu) {
        await rolAta(db, yoneticiId, yeni, hedefRol);
        await rolAl(db, yoneticiId, yeni, yoneticiRolu);
      }
      if (ekRol !== null) await rolAta(db, yoneticiId, yeni, ekRol);
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return { cerez: String(c.headers['set-cookie']).split(';')[0] ?? '', islemler: c.json().kullanici.islemler as string[] };
  }
  const oku = (o: Oturum, yol: string): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: o.cerez } });
  const gonder = (o: Oturum, yol: string, govde: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'POST', url: `/api${yol}`, headers: { cookie: o.cerez }, payload: govde as object });
  // Ayar ekrandaki gibi son okunan sürümle yazılır (malzemeler sürüm kuralı); okuyamayan rol sürümsüz gönderir.
  const ayarYaz = async (o: Oturum): Promise<number> => {
    const okunan = await oku(o, '/malzeme-katalogu-ayarlari');
    const surum = okunan.statusCode === 200 ? (okunan.json() as { surumler: { malzeme: number | null } }).surumler.malzeme : null;
    return (await gonder(o, '/malzeme-katalogu-ayarlari/malzeme/kaydet', { deger: { x: 1 }, surum })).statusCode;
  };
  const bakimKaydiYaz = async (o: Oturum): Promise<number> => {
    const kimlik = `rol-bakim-${(sayac += 1)}`;
    return (await gonder(o, `/arkon/belgeler/maint/${kimlik}/yaz`, { taban: 0, govde: { id: kimlik }, kaynak: 'g1' })).statusCode;
  };

  before(async () => {
    ortam = await testVeritabaniKur('roldagilim');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    await girisYap('yonetici');
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  // arkon: kişinin Arkon'daki rolü (yoksa Arkon'a giremez); tanim: malzeme tanım ve ayar yazma;
  // yansima: TMI'ye yazılamayan Arkon kayıtları listesi (#243, kullanıcı kararı 08.10.2026: müdür ve planlama);
  // yeniden: hatalı kaydı yeniden deneme (kullanıcı kararı Y1 a, 08.10.2026: müdür ve planlama).
  const DAGILIM: Record<string, { arkon: string | null; tanim: boolean; yansima: boolean; yeniden: boolean }> = {
    yonetici: { arkon: 'admin', tanim: true, yansima: true, yeniden: true },
    mudur: { arkon: 'lead', tanim: true, yansima: true, yeniden: true },
    planlama_proje: { arkon: 'plan', tanim: true, yansima: true, yeniden: true },
    cam: { arkon: 'prep', tanim: false, yansima: false, yeniden: false },
    kalite: { arkon: 'quality', tanim: false, yansima: false, yeniden: false },
    operator: { arkon: 'operator', tanim: false, yansima: false, yeniden: false },
    bakim: { arkon: 'maint', tanim: false, yansima: false, yeniden: false },
    satin_alma: { arkon: null, tanim: false, yansima: false, yeniden: false },
    satis: { arkon: null, tanim: false, yansima: false, yeniden: false },
    depo: { arkon: null, tanim: false, yansima: false, yeniden: false },
    insan_kaynaklari: { arkon: null, tanim: false, yansima: false, yeniden: false },
    muhasebe_finans: { arkon: null, tanim: false, yansima: false, yeniden: false },
    idari_isler: { arkon: null, tanim: false, yansima: false, yeniden: false },
    sevkiyat: { arkon: null, tanim: false, yansima: false, yeniden: false },
    guvenlik_gorevlisi: { arkon: null, tanim: false, yansima: false, yeniden: false },
    vardiya_sorumlusu: { arkon: 'lead', tanim: false, yansima: false, yeniden: false },
  };
  // Kişinin Arkon rolünü belirleyen işlemler; `arkon.yansima-oku` liste okuma işlemidir, Arkon rolü değildir.
  // Olmayan satırı yeniden denemek: yetkili 404 alır (kapsam ve varlık uçta), yetkisiz 403; hiçbir satır yazılmaz.
  const yenidenDene = async (o: Oturum): Promise<number> =>
    (await gonder(o, '/arkon/tmi-yansimalari/999999999/yeniden-dene', {})).statusCode;
  const ARKON_ROL_ISLEMLERI = ['arkon.yonetici', 'arkon.planlama', 'arkon.hazirlik', 'arkon.kalite', 'arkon.bakim', 'arkon.amir', 'arkon.operator'];

  test('her rol: Arkon rolü, Arkon sayfası, malzeme tanım yetkisi, yansıma listesi ve yeniden deneme onaylı dağılımdaki gibidir', async () => {
    assert.deepEqual(
      (await vt().sorgu<{ kod: string }>('SELECT kod FROM rol ORDER BY kod')).map((r) => r.kod),
      Object.keys(DAGILIM).sort(),
    );
    for (const [kod, beklenen] of Object.entries(DAGILIM)) {
      const o = await girisYap(kod);
      const ben = await oku(o, '/arkon/ben');
      const alinan = {
        arkon: ben.statusCode === 200 ? (ben.json().kisi.rol as string) : ben.statusCode,
        sayfa: o.islemler.includes('sayfa.arkon'),
        // Bir rol tek Arkon işlemi taşır: tek rollü kişide öncelik sırası devreye girmez (iki rollü kişi aşağıdaki testte).
        arkonIslemi: o.islemler.filter((i) => ARKON_ROL_ISLEMLERI.includes(i)).length,
        tanim: await ayarYaz(o),
        yansima: (await oku(o, '/arkon/tmi-yansimalari')).statusCode,
        yeniden: await yenidenDene(o),
      };
      const hepsi = kod === 'yonetici';
      assert.deepEqual(alinan, {
        arkon: beklenen.arkon ?? 403,
        // Operatör Arkon'u terminal ve kuyruk sayfasından kullanır; Arkon MES sayfası verilmez (kart #775).
        sayfa: beklenen.arkon !== null && kod !== 'operator',
        arkonIslemi: hepsi ? alinan.arkonIslemi : (beklenen.arkon === null ? 0 : 1),
        tanim: beklenen.tanim ? 200 : 403,
        yansima: beklenen.yansima ? 200 : 403,
        yeniden: beklenen.yeniden ? 404 : 403,
      }, kod);
      assert.equal((await oku(o, '/arkon/belgeler/pkgs')).statusCode, beklenen.arkon === null ? 403 : 200, kod);
    }
  });

  // Kural: Arkon kullanan kişiye tek Arkon rollü TMI rolü verilir. İki Arkon rollü kişide roller birleşmez: Arkon'un öncelik
  // sırasındaki ilk rol kalır, ötekinin Arkon yetkisi düşer. Burada davranış pimlenir; birleşme ayrı karardır.
  test('iki Arkon rollü kişi: Arkon rolü öncelik sırasından gelir, öteki rolün Arkon yetkisi düşer (operatör + bakım sayım yazamaz)', async () => {
    const sayimYaz = async (o: Oturum): Promise<number> => {
      const satir = { cid: `rol-sayim-${(sayac += 1)}`, at: Date.parse('2001-10-07T08:00:00Z'), machine: 'TZG-04', wc: 'TAL', orderNo: 'UE-1', kind: 'good', delta: 1 };
      return (await gonder(o, '/arkon/kayitlar/counts/ekle', { satirlar: [satir], kaynak: 'c1' })).statusCode;
    };
    const arkonRolu = async (o: Oturum): Promise<unknown> => (await oku(o, '/arkon/ben')).json().kisi?.rol;
    // Önce tek rolün yapabildiği: operatör sayım yazar, bakım yazamaz; yoksa aşağıdaki ret kendiliğinden geçerdi.
    assert.equal(await sayimYaz(await girisYap('operator')), 200);
    assert.equal(await sayimYaz(await girisYap('bakim')), 403);

    const operatorBakim = await girisYap('operator', 'bakim');
    assert.deepEqual(operatorBakim.islemler.filter((i) => i.startsWith('arkon.')).sort(), ['arkon.bakim', 'arkon.operator']);
    assert.equal(await arkonRolu(operatorBakim), 'maint');
    assert.equal(await sayimYaz(operatorBakim), 403);
    assert.equal(await bakimKaydiYaz(operatorBakim), 200);
    // Atama sırası sonucu değiştirmez.
    assert.equal(await arkonRolu(await girisYap('bakim', 'operator')), 'maint');
    assert.equal(await arkonRolu(await girisYap('mudur', 'bakim')), 'maint');
    assert.equal(await arkonRolu(await girisYap('mudur', 'operator')), 'lead');
  });

  // Görmediği: işlem ve sayfa düzeyinde. Sayfası olmayan rolün oturumla açık okuma uçlarını okuyabilmesi ayrı karttadır (#247).
  test('bakım rolü Arkon bakım kaydını yazar, Arkon dışında stok sayfasını ve satın alma talebini taşır, işlem isteyen uçlarda 403 alır; operatör ve satın alma bakım kaydı yazamaz', async () => {
    const bakim = await girisYap('bakim');
    assert.equal(await bakimKaydiYaz(bakim), 200);
    assert.deepEqual([...bakim.islemler].sort(), ['arkon.bakim', 'cnc-kurulum.oku', 'ik.bordro-gordum', 'ik.izin-talep', 'mesaj.oku', 'mesaj.yaz', 'saat.oku', 'saat.uyari-ustlen', 'satin-alma.talep-ac', 'sayfa.arkon', 'sayfa.cnc-kurulum', 'sayfa.ik-islemlerim', 'sayfa.mesaj', 'sayfa.stok', 'sayfa.taleplerim', 'stok.istek', 'sayfa.idari-isler', 'idari-isler.talep-ac', 'idari-isler.arac-talebi-ac', 'sayfa.istasyonlar', 'istasyonlar.makine-durumu', 'plan.oku', 'cnc-kurulum.takim-degistir'].sort());
    // Sayfası olan rol okur: aşağıdaki retler boş sistemde kendiliğinden geçmesin.
    assert.equal((await oku(await girisYap('satin_alma'), '/malzeme-katalogu-kartlari')).statusCode, 200);
    assert.equal((await oku(await girisYap('mudur'), '/kisiler')).statusCode, 200);
    assert.equal((await oku(bakim, '/malzeme-katalogu-kartlari')).statusCode, 403);
    assert.equal((await oku(bakim, '/kisiler')).statusCode, 403);

    assert.equal(await bakimKaydiYaz(await girisYap('operator')), 403);
    assert.equal(await bakimKaydiYaz(await girisYap('satin_alma')), 403);
  });

  // Kullanıcı kararları RM2 (kalibrasyon: kalite görür ve yazar, müdür görür), RM3 (istasyon yazımı müdürde), D48m (denetim sayfası müdürde).
  test('kalibrasyon, istasyon yazımı ve denetim sayfası: onaylı rollere açık, ötekilere kapalı', async () => {
    const BEKLENEN: Record<string, { aletOku: number; turYaz: number; isMerkeziYaz: number; denetimSayfasi: boolean }> = {
      yonetici: { aletOku: 200, turYaz: 200, isMerkeziYaz: 200, denetimSayfasi: true },
      kalite: { aletOku: 200, turYaz: 200, isMerkeziYaz: 403, denetimSayfasi: false },
      mudur: { aletOku: 200, turYaz: 403, isMerkeziYaz: 200, denetimSayfasi: true },
      planlama_proje: { aletOku: 403, turYaz: 403, isMerkeziYaz: 403, denetimSayfasi: false },
      operator: { aletOku: 403, turYaz: 403, isMerkeziYaz: 403, denetimSayfasi: false },
    };
    for (const [kod, beklenen] of Object.entries(BEKLENEN)) {
      const o = await girisYap(kod);
      const ek = (sayac += 1);
      assert.deepEqual({
        aletOku: (await oku(o, '/olcu-aletleri')).statusCode,
        turYaz: (await gonder(o, '/olcu-aleti-turleri', { ad: `Rol turu ${ek}` })).statusCode,
        isMerkeziYaz: (await gonder(o, '/is-merkezleri', { kod: `RD${ek}`, ad: `Rol is merkezi ${ek}` })).statusCode,
        denetimSayfasi: o.islemler.includes('sayfa.denetim'),
      }, beklenen, kod);
    }
    // Denetim içeriği yalnız bayraklı yöneticide kalır: müdür listeyi okur, gövde işlemi taşımaz.
    const mudur = await girisYap('mudur');
    assert.equal((await oku(mudur, '/denetim-kayitlari')).statusCode, 200);
    assert.equal(mudur.islemler.includes('denetim.govde-oku'), false);
  });

  // Kullanıcı kararı RC1 R4-R6, R13 (kart #223) ve kart #1225: depo ve müdür bütün stok işlemlerini taşır, planlama yalnız toplar; bakım yalnız okur.
  // Ölçülen yetki kapısıdır: 403 dışındaki her cevap kapıdan geçmiştir. Yazma uçlarına boş gövde gider, hiçbir kayıt yazılmaz.
  test('stok: depo ve müdür alır, çıkarır, taşır, sayar, toplar, tanımlar ve geri alır; planlama toplar; bakım ve kalite okur; operatör görmez', async () => {
    const tum = { okuma: true, giris: true, cikis: true, transfer: true, sayim: true, tanim: true, geriAl: true, toplama: true };
    const salt = { okuma: true, giris: false, cikis: false, transfer: false, sayim: false, tanim: false, geriAl: false, toplama: false };
    const BEKLENEN: Record<string, typeof tum> = {
      yonetici: tum,
      mudur: tum,
      depo: tum,
      planlama_proje: { ...salt, toplama: true },
      bakim: salt,
      kalite: salt,
      operator: { ...salt, okuma: false },
      cam: { ...salt, okuma: false },
    };
    const gecer = (c: LightMyRequestResponse): boolean => c.statusCode !== 403;
    for (const [kod, beklenen] of Object.entries(BEKLENEN)) {
      const o = await girisYap(kod);
      assert.deepEqual({
        okuma: gecer(await oku(o, '/stok/sayim-bekleyenler')),
        giris: gecer(await gonder(o, '/stok/mal-kabul', {})),
        cikis: gecer(await gonder(o, '/stok/sepet/stoktan-dus', {})),
        transfer: gecer(await oku(o, '/stok/sepet')),
        sayim: gecer(await gonder(o, '/stok/sayim', {})),
        tanim: gecer(await gonder(o, '/stok/yerlesim/kaydet', {})),
        geriAl: gecer(await gonder(o, '/stok/hareketler/999999999/geri-al', {})),
        toplama: gecer(await gonder(o, '/stok/toplamalar', {})),
      }, beklenen, kod);
      assert.equal(o.islemler.includes('sayfa.stok'), beklenen.okuma, kod);
    }
  });

  // Kullanıcı kararı RC1 R8-R12 (kart #223): firma kartı finans rakamlarından ayrı açılır.
  // Yazma uçlarına boş gövde gider: yetkili rol şemaya takılır (400), yetkisiz rol yetkiye (403); hiçbir kayıt yazılmaz.
  test('finans: rakamları muhasebe ve müdür okur, yazımı ve yönetimi muhasebe yapar; firma kartını satın alma ve planlama da yazar, depo okur', async () => {
    const BEKLENEN: Record<string, { sayfa: boolean; finansOku: number; finansYaz: number; finansYonet: number; firmaOku: number; firmaYaz: number }> = {
      yonetici: { sayfa: true, finansOku: 200, finansYaz: 400, finansYonet: 400, firmaOku: 200, firmaYaz: 400 },
      muhasebe_finans: { sayfa: true, finansOku: 200, finansYaz: 400, finansYonet: 400, firmaOku: 200, firmaYaz: 400 },
      mudur: { sayfa: true, finansOku: 200, finansYaz: 403, finansYonet: 403, firmaOku: 200, firmaYaz: 403 },
      satin_alma: { sayfa: true, finansOku: 403, finansYaz: 403, finansYonet: 403, firmaOku: 200, firmaYaz: 400 },
      planlama_proje: { sayfa: true, finansOku: 403, finansYaz: 403, finansYonet: 403, firmaOku: 200, firmaYaz: 400 },
      depo: { sayfa: false, finansOku: 403, finansYaz: 403, finansYonet: 403, firmaOku: 200, firmaYaz: 403 },
      kalite: { sayfa: false, finansOku: 403, finansYaz: 403, finansYonet: 403, firmaOku: 403, firmaYaz: 403 },
      operator: { sayfa: false, finansOku: 403, finansYaz: 403, finansYonet: 403, firmaOku: 403, firmaYaz: 403 },
    };
    for (const [kod, beklenen] of Object.entries(BEKLENEN)) {
      const o = await girisYap(kod);
      assert.deepEqual({
        sayfa: o.islemler.includes('sayfa.finans'),
        finansOku: (await oku(o, '/finans/ayar')).statusCode,
        finansYaz: (await gonder(o, '/finans/belgeler/999999999/duzelt', {})).statusCode,
        finansYonet: (await gonder(o, '/finans/belgeler/999999999/iptal', {})).statusCode,
        firmaOku: (await oku(o, '/musteri-tedarikci/firmalar')).statusCode,
        firmaYaz: (await gonder(o, '/musteri-tedarikci/firmalar/999999999/guncelle', {})).statusCode,
      }, beklenen, kod);
    }
  });

  // Kullanıcı kararı RC1 R1-R3 (kart #223) ve ana sayfadan talep (kart #375): talebi satın alma yürütür, müdür onaylar,
  // muhasebe okur; üretimdeki roller yalnız talep açar, operatör açmaz. Yazma uçlarına boş gövde gider, hiçbir kayıt yazılmaz.
  test('satın alma: satın almacı yürütür ve ayar yazar, müdür onaylar, muhasebe okur; üretim rolleri talep açar; operatör hiçbirini almaz', async () => {
    const yok = { sayfa: false, acilis: false, taleplerim: false, talepAc: false, tedarikci: false, ayar: false, onayla: false };
    // Yalnız talep açan rol satın alma ekranını açmaz; ana sayfadaki kendi taleplerini okur.
    const talepci = { ...yok, taleplerim: true, talepAc: true };
    const BEKLENEN: Record<string, typeof yok> = {
      yonetici: { sayfa: true, acilis: true, taleplerim: true, talepAc: true, tedarikci: true, ayar: true, onayla: true },
      satin_alma: { sayfa: true, acilis: true, taleplerim: true, talepAc: true, tedarikci: true, ayar: true, onayla: false },
      mudur: { ...talepci, sayfa: true, acilis: true, onayla: true },
      muhasebe_finans: { ...yok, sayfa: true, acilis: true },
      // Planlama satın alma ekranını görür ve okur (kullanıcı kararı 11.10.2026); yürütmez, onaylamaz.
      planlama_proje: { ...talepci, sayfa: true, acilis: true },
      cam: talepci,
      bakim: talepci,
      kalite: talepci,
      depo: talepci,
      operator: yok,
      // İK ve İdari İşler de talep açar (kullanıcı kararı 11.10.2026).
      insan_kaynaklari: talepci,
      idari_isler: talepci,
    };
    const gecer = (c: LightMyRequestResponse): boolean => c.statusCode !== 403;
    for (const [kod, beklenen] of Object.entries(BEKLENEN)) {
      const o = await girisYap(kod);
      assert.deepEqual({
        sayfa: o.islemler.includes('sayfa.satin-alma'),
        acilis: gecer(await oku(o, '/satin-alma-acilis')),
        taleplerim: gecer(await oku(o, '/satin-alma-taleplerim')),
        talepAc: gecer(await gonder(o, '/satin-alma-talepleri/ac', {})),
        tedarikci: gecer(await gonder(o, '/satin-alma-tedarikcileri/kaydet', {})),
        ayar: gecer(await gonder(o, '/satin-alma-ayarlari/kaydet', {})),
        // Onay ucu henüz yok (dört göz kuralı bağlamada gelir); işlem girişte taşınır.
        onayla: o.islemler.includes('satin-alma.onayla'),
      }, beklenen, kod);
    }
  });
});
