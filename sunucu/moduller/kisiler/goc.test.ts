import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gocleriUygula } from '#cekirdek/goc.ts';
import { testSemasiAc } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { ISLEMLER } from '#paylasilan/islemler.ts';
import { kullaniciYukle } from './servis.ts';

const GERCEK_KLASOR = fileURLToPath(new URL('../../gocler/', import.meta.url));

describe('işlem yetkisi göçü var olan veritabanında (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';

  const acik = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  before(async () => {
    ortam = await testSemasiAc('gocy');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-gocy-'));
  });

  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('kişiye özel yetki satırı varken göç durur ve hiçbir şeyi değiştirmez; satır silinince uygulanır, roller ve denemeler taşınır', async () => {
    const hepsi = (await readdir(GERCEK_KLASOR)).filter((ad) => ad.endsWith('.sql')).sort();
    const sira = hepsi.findIndex((ad) => ad.endsWith('_yetki_islem_ve_giris.sql'));
    assert.equal(sira > 0, true, 'işlem yetkisi göçü bulunamadı ya da öncesinde göç yok');
    for (const ad of hepsi.slice(0, sira)) await copyFile(join(GERCEK_KLASOR, ad), join(klasor, ad));

    const { ayar, sema, vt } = acik();
    await gocleriUygula(ayar, klasor, { sema });
    await vt.sorgu(
      `INSERT INTO kisi (ad, kullanici_adi, parola_ozeti, rol_id)
       SELECT 'Eski Planlamacı', 'eski-planlamaci', 'x', id FROM rol WHERE kod = 'planlamaci'`,
    );
    await vt.sorgu("INSERT INTO kisi (ad) VALUES ('Eski Personel')");
    await vt.sorgu("INSERT INTO kisi_sayfa_yetkisi SELECT id, '/stok', 'oku' FROM kisi WHERE kullanici_adi = 'eski-planlamaci'");
    await vt.sorgu("INSERT INTO giris_denemesi (kullanici_adi, sonuc) VALUES ('eski-planlamaci', 'kilitli'), ('eski-planlamaci', 'hatali')");

    await assert.rejects(gocleriUygula(ayar, GERCEK_KLASOR, { sema }), /kisi_sayfa_yetkisi tablosunda 1 satır var/);
    // Göç tek transaction'dır: durunca eski yapı olduğu gibi kalır.
    assert.deepEqual(await vt.sorgu('SELECT sayfa FROM kisi_sayfa_yetkisi'), [{ sayfa: '/stok' }]);
    assert.equal((await vt.sorgu('SELECT rol_id FROM kisi WHERE rol_id IS NOT NULL')).length, 1);

    await vt.sorgu('DELETE FROM kisi_sayfa_yetkisi');
    assert.deepEqual(await gocleriUygula(ayar, GERCEK_KLASOR, { sema }), hepsi.slice(sira));

    assert.deepEqual(
      await vt.sorgu('SELECT k.kullanici_adi, r.kod FROM kisi_rolu kr JOIN kisi k ON k.id = kr.kisi_id JOIN rol r ON r.id = kr.rol_id'),
      [{ kullanici_adi: 'eski-planlamaci', kod: 'planlama_proje' }],
    );
    assert.deepEqual(
      await vt.sorgu("SELECT sonuc FROM giris_denemesi WHERE kullanici_adi = 'eski-planlamaci' ORDER BY id"),
      [{ sonuc: 'beklemede' }, { sonuc: 'hatali' }],
    );
    await assert.rejects(vt.sorgu("INSERT INTO giris_denemesi (kullanici_adi, sonuc) VALUES ('x', 'kilitli')"), /giris_denemesi_sonuc_gecerli/);
    for (const tablo of ['kisi_sayfa_yetkisi', 'rol_sayfa_yetkisi', 'rol_yetenegi']) {
      assert.deepEqual(await vt.tek('SELECT to_regclass($1) AS tablo', [tablo]), { tablo: null }, tablo);
    }
  });
});

describe('roller göçü var olan veritabanında (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';

  const acik = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  const goruntu = async (): Promise<unknown> => {
    const { vt } = acik();
    return {
      roller: await vt.sorgu('SELECT id, kod, ad, yerlesik, yonetici FROM rol ORDER BY id'),
      islemler: await vt.sorgu('SELECT rol_id, islem FROM rol_islemi ORDER BY rol_id, islem'),
      atamalar: await vt.sorgu('SELECT kisi_id, rol_id FROM kisi_rolu ORDER BY kisi_id, rol_id'),
    };
  };

  const islemleri = async (kullaniciAdi: string): Promise<string[]> => {
    const { vt } = acik();
    const kisi = await vt.tek<{ id: number }>('SELECT id FROM kisi WHERE kullanici_adi = $1', [kullaniciAdi]);
    if (!kisi) throw new Error(`kişi yok: ${kullaniciAdi}`);
    const kullanici = await kullaniciYukle(vt, kisi.id);
    return [...(kullanici?.islemler ?? [])].sort();
  };
  // Göç öncesi şemada yükleyici sonraki göçlerin sütunlarını (rol.acilis_sayfasi) bulamaz; rol satırları doğrudan okunur.
  const oncekiIslemler = async (kullaniciAdi: string): Promise<string[]> =>
    (await acik().vt.sorgu<{ islem: string }>(
      `SELECT DISTINCT ri.islem FROM kisi k JOIN kisi_rolu kr ON kr.kisi_id = k.id JOIN rol_islemi ri ON ri.rol_id = kr.rol_id
        WHERE k.kullanici_adi = $1 ORDER BY ri.islem`,
      [kullaniciAdi],
    )).map((s) => s.islem);

  const PLANLAMA = [
    'kisiler.oku', 'sayfa.cizelge', 'sayfa.istasyonlar', 'sayfa.kuyruk', 'sayfa.matris', 'sayfa.mesai',
    'sayfa.rota', 'sayfa.stok', 'sayfa.terminal', 'sayfa.uretim-emirleri', 'sayfa.vardiya',
  ];
  // Roller göçünden sonraki göçlerin verdiği işlemlerle birlikte.
  const PLANLAMA_SONUNDA = [
    ...PLANLAMA, 'mesaj.oku', 'mesaj.yaz', 'sayfa.mesaj', 'projeler.oku', 'projeler.yaz', 'sayfa.projeler', 'ik.izin-talep', 'sayfa.ik-islemlerim', 'ik.bordro-gordum', 'portal.oku', 'sayfa.portal', 'sayfa.denetim-hazirlik', 'denetim-hazirlik.oku', 'arkon.kuyruk-sirala', 'arkon.planlama', 'arkon.yansima-oku', 'arkon.yansima-yeniden', 'musteri-tedarikci.oku', 'musteri-tedarikci.yaz', 'sayfa.musteri-tedarikci', 'malzemeler.tanim-yaz', 'malzemeler.yaz', 'plan.yaz', 'sayfa.arkon', 'sayfa.atolye', 'sayfa.emirler', 'atolye.yaz', 'sayfa.taleplerim', 'sayfa.finans', 'sayfa.malzemeler', 'sayfa.satin-alma', 'satin-alma.oku', 'satin-alma.talep-ac', 'sayfa.sevkiyat', 'sevkiyat.is-yaz', 'sevkiyat.oku', 'sevkiyat.plan-yaz', 'stok.toplama', 'uretim-emirleri.fason', 'uretim-emirleri.yaz', 'vardiya.durus-yaz', 'vardiya.yaz',
    // CNC Kurulum Motoru göçü (kullanıcı kararı, 12.10.2026).
    'sayfa.cnc-kurulum', 'cnc-kurulum.oku', 'cnc-kurulum.yaz',
    'rota.emre-kopyala',
    // Reçete ve Rota Motoru göçü (paket varsayımı, 13.10.2026).
    'sayfa.recete-rota', 'recete-rota.oku', 'recete-rota.yaz',
    // Malzeme · Teslim göçü (kullanıcı kararı, 14.10.2026).
    'stok.istek',
    // Akış Süresi göçü (kullanıcı kararı, 14.10.2026).
    'sayfa.akis',
    // OEE göçü (kullanıcı kararı, 14.10.2026).
    'sayfa.oee', 'oee.oku',
    // Rota yazma ve canlıya alma göçü (kullanıcı kararı, 15.10.2026).
    'rota.yaz', 'plan.canliya-al',
    // Çizim Merkezi göçü (kullanıcı kararı, 18.10.2026).
    'cizimler.oku', 'cizimler.yaz', 'cizimler.yayinla', 'sayfa.cizimler',
    // Etiket Merkezi göçü (kullanıcı kararı 99, 18.10.2026).
    'etiket-merkezi.oku', 'etiket-merkezi.bas', 'sayfa.etiket-merkezi',
    // Rol x işlem tablosu göçü (kullanıcı kararları 139 a ve 160 a, 19.10.2026).
    'sayfa.durus-nedenleri', 'durus-nedenleri.yaz', 'sayfa.smartes', 'plan.kilitle', 'plan.studyo', 'rota.talimat-yaz', 'siparisler.oku', 'siparisler.yaz',
    // Siparişler sayfası göçü (kullanıcı kararı 193 a, 19.10.2026).
    'sayfa.siparisler',
    // İdari İşler göçü (kullanıcı kararı 216 a, 19.10.2026).
    'sayfa.idari-isler', 'idari-isler.talep-ac', 'idari-isler.arac-talebi-ac',
    // Plan okuma göçü (kullanıcı kararı 280 a, 20.10.2026).
    'plan.oku',
    // Saat üstlenme göçü (Soru 111 b, 22.10.2026).
    'saat.uyari-ustlen',
    // Rol düzeltmeleri göçü (kullanıcı kararı 237, 23.10.2026).
    'siparisler.termin-onayla',
    // Ortak yetki matrisinin planlama işlemi, planlama plan modülüne geçince yeni adıyla (658 b, 663 a) ve plan sayfası.
    'plan.planlama-oku', 'sayfa.plan',
    // Plan motoru ayarları göçü (kullanıcı kararı 775 b, 27.10.2026).
    'plan.motor-ayari',
  ].sort();
  const OPERATOR_SONUNDA = [
    'arkon.operator', 'ik.bordro-gordum', 'ik.izin-talep', 'mesaj.oku', 'mesaj.yaz', 'sayfa.ik-islemlerim', 'sayfa.kuyruk', 'sayfa.mesaj', 'sayfa.terminal', 'sayfa.uretim-terminali', 'stok.istek', 'terminal.uret',
    // CNC Kurulum okuma ve hazırlık onayı göçü (kullanıcı kararı, 16.10.2026).
    'sayfa.cnc-kurulum', 'cnc-kurulum.oku', 'cnc-kurulum.hazirlik-onayla',
    // Ctrl K istasyon araması göçü (kullanıcı kararı, 16.10.2026).
    'uretim-emirleri.ara-istasyon',
    // İdari İşler göçü (kullanıcı kararı 216 a, 19.10.2026).
    'sayfa.idari-isler', 'idari-isler.talep-ac', 'idari-isler.arac-talebi-ac',
    // Takım değişimi göçü (kullanıcı kararı 300 a, 20.10.2026).
    'cnc-kurulum.takim-degistir',
  ].sort();

  // Her biri elle yapılmış bir değişikliktir; göç hangisini görürse görsün üstüne yazmadan durmalıdır.
  const ELLE_DEGISIKLIKLER = [
    {
      ad: 'role elle işlem eklenmiş',
      boz: "INSERT INTO rol_islemi (rol_id, islem) SELECT id, 'kisiler.yaz' FROM rol WHERE kod = 'operator'",
      duzelt: "DELETE FROM rol_islemi WHERE islem = 'kisiler.yaz'",
      ileti: /rol_islemi tablosu önceki göçün yazdığı satırlardan farklı: operator:kisiler\.yaz\./,
    },
    {
      ad: 'rolden elle işlem alınmış',
      boz: "DELETE FROM rol_islemi WHERE islem = 'sayfa.stok'",
      duzelt: "INSERT INTO rol_islemi (rol_id, islem) SELECT id, 'sayfa.stok' FROM rol WHERE kod = 'planlamaci'",
      ileti: /rol_islemi tablosu önceki göçün yazdığı satırlardan farklı: planlamaci:sayfa\.stok\./,
    },
    {
      ad: 'fazladan rol açılmış',
      boz: "INSERT INTO rol (kod, ad) VALUES ('elle_rol', 'Elle Rol')",
      duzelt: "DELETE FROM rol WHERE kod = 'elle_rol'",
      ileti: /rol tablosu beklenen üç yerleşik rolden \(yonetici, planlamaci, operator\) farklı: elle_rol\./,
    },
    {
      ad: 'role elle bütün işlemler bayrağı verilmiş',
      boz: "UPDATE rol SET yonetici = true WHERE kod = 'operator'",
      duzelt: "UPDATE rol SET yonetici = false WHERE kod = 'operator'",
      ileti: /rol tablosu beklenen üç yerleşik rolden \(yonetici, planlamaci, operator\) farklı: operator\./,
    },
  ];

  // Roller göçünden öncesine kadar kurulmuş şema; her test kendi şemasında bozar.
  let hepsi: string[] = [];
  let sira = -1;
  const ekSemalar: TestVeritabani[] = [];
  const oncesiniKur = async (hedef: TestVeritabani): Promise<TestVeritabani> => {
    await gocleriUygula(hedef.ayar, klasor, { sema: hedef.sema });
    return hedef;
  };
  const ekSema = async (onek: string): Promise<TestVeritabani> => {
    const yeni = await testSemasiAc(onek);
    ekSemalar.push(yeni);
    return oncesiniKur(yeni);
  };

  before(async () => {
    ortam = await testSemasiAc('gocr');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-gocr-'));
    hepsi = (await readdir(GERCEK_KLASOR)).filter((ad) => ad.endsWith('.sql')).sort();
    sira = hepsi.findIndex((ad) => ad.endsWith('_kisiler_roller.sql'));
    assert.equal(sira > 0, true, 'roller göçü bulunamadı ya da öncesinde göç yok');
    for (const ad of hepsi.slice(0, sira)) await copyFile(join(GERCEK_KLASOR, ad), join(klasor, ad));
  });

  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    for (const ek of ekSemalar) await ek.kaldir();
    await ortam?.kaldir();
  });

  test('elle değiştirilmiş rol ya da matris varken göç durur ve hiçbir şeyi değiştirmez; beklenen durumda uygulanır, atamalar korunur', async () => {
    const { ayar, sema, vt } = await oncesiniKur(acik());
    // Ad elle değişmiş olabilir; on bir rolün adı karardır, göç üçünü de yeniden yazar.
    await vt.sorgu("UPDATE rol SET ad = 'Elle ' || ad");
    for (const [kullaniciAdi, kod] of [['eski-planlamaci', 'planlamaci'], ['eski-operator', 'operator'], ['eski-yonetici', 'yonetici']]) {
      await vt.sorgu(
        `WITH yeni AS (INSERT INTO kisi (ad, kullanici_adi, parola_ozeti) VALUES ('Eski Kişi', $1, 'x') RETURNING id)
         INSERT INTO kisi_rolu (kisi_id, rol_id) SELECT yeni.id, rol.id FROM yeni, rol WHERE rol.kod = $2`,
        [kullaniciAdi, kod],
      );
    }
    const once = await goruntu();
    const atamalar = (once as { atamalar: unknown[] }).atamalar;
    assert.equal(atamalar.length, 3);
    assert.deepEqual(await oncekiIslemler('eski-planlamaci'), PLANLAMA);

    for (const { ad, boz, duzelt, ileti } of ELLE_DEGISIKLIKLER) {
      await vt.sorgu(boz);
      const bozuk = await goruntu();
      assert.notDeepEqual(bozuk, once, ad);
      await assert.rejects(gocleriUygula(ayar, GERCEK_KLASOR, { sema }), ileti, ad);
      // Göç tek transaction'dır: durunca elle yapılan değişiklik de eski yapı da olduğu gibi kalır.
      assert.deepEqual(await goruntu(), bozuk, ad);
      await vt.sorgu(duzelt);
      assert.deepEqual(await goruntu(), once, ad);
    }

    assert.deepEqual(await gocleriUygula(ayar, GERCEK_KLASOR, { sema }), hepsi.slice(sira));

    assert.deepEqual(await vt.sorgu('SELECT kisi_id, rol_id FROM kisi_rolu ORDER BY kisi_id, rol_id'), atamalar);
    assert.deepEqual(
      await vt.sorgu(
        `SELECT k.kullanici_adi, r.kod, r.ad FROM kisi_rolu kr JOIN kisi k ON k.id = kr.kisi_id JOIN rol r ON r.id = kr.rol_id
          ORDER BY k.kullanici_adi`,
      ),
      [
        { kullanici_adi: 'eski-operator', kod: 'operator', ad: 'Operatör' },
        { kullanici_adi: 'eski-planlamaci', kod: 'planlama_proje', ad: 'Planlama ve Proje' },
        { kullanici_adi: 'eski-yonetici', kod: 'yonetici', ad: 'Yönetici' },
      ],
    );
    assert.deepEqual(
      await vt.sorgu('SELECT kod, ad, yerlesik, yonetici FROM rol ORDER BY kod'),
      [
        { kod: 'bakim', ad: 'Bakım', yerlesik: true, yonetici: false },
        { kod: 'cam', ad: 'CAM', yerlesik: true, yonetici: false },
        { kod: 'depo', ad: 'Depo', yerlesik: true, yonetici: false },
        { kod: 'guvenlik_gorevlisi', ad: 'Güvenlik Görevlisi', yerlesik: true, yonetici: false },
        { kod: 'idari_isler', ad: 'İdari İşler', yerlesik: true, yonetici: false },
        { kod: 'insan_kaynaklari', ad: 'İnsan Kaynakları', yerlesik: true, yonetici: false },
        { kod: 'kalite', ad: 'Kalite', yerlesik: true, yonetici: false },
        { kod: 'mudur', ad: 'Müdür', yerlesik: true, yonetici: false },
        { kod: 'muhasebe_finans', ad: 'Muhasebe ve Finans', yerlesik: true, yonetici: false },
        { kod: 'operator', ad: 'Operatör', yerlesik: true, yonetici: false },
        { kod: 'planlama_proje', ad: 'Planlama ve Proje', yerlesik: true, yonetici: false },
        { kod: 'satin_alma', ad: 'Satın Alma', yerlesik: true, yonetici: false },
        { kod: 'satis', ad: 'Satış', yerlesik: true, yonetici: false },
        { kod: 'sevkiyat', ad: 'Sevkiyat', yerlesik: true, yonetici: false },
        { kod: 'vardiya_sorumlusu', ad: 'Vardiya Sorumlusu', yerlesik: true, yonetici: false },
        { kod: 'yonetici', ad: 'Yönetici', yerlesik: true, yonetici: true },
      ],
    );
    assert.deepEqual(await islemleri('eski-planlamaci'), PLANLAMA_SONUNDA);
    assert.deepEqual(await islemleri('eski-operator'), OPERATOR_SONUNDA);
    assert.deepEqual(await islemleri('eski-yonetici'), [...ISLEMLER].sort());
  });

  test('yerleşik rolü silinmiş şemada göç durur ve hiçbir şeyi değiştirmez', async () => {
    const { ayar, sema, vt } = await ekSema('gocs');
    await vt.sorgu("DELETE FROM rol WHERE kod = 'operator'");
    const roller = await vt.sorgu('SELECT id, kod, ad FROM rol ORDER BY id');
    assert.equal(roller.length, 2);

    await assert.rejects(
      gocleriUygula(ayar, GERCEK_KLASOR, { sema }),
      /rol tablosu beklenen üç yerleşik rolden \(yonetici, planlamaci, operator\) farklı: operator\./,
    );
    assert.deepEqual(await vt.sorgu('SELECT id, kod, ad FROM rol ORDER BY id'), roller);
  });

  test('göç sürerken matrise yazan açık transaction beklenir: yazdığı satır denetimden kaçamaz, göç durur', async () => {
    const { ayar, sema, vt } = await ekSema('gock');
    let birak: () => void = () => undefined;
    const bekle = new Promise<void>((coz) => { birak = coz; });
    let yazildi: () => void = () => undefined;
    const yazim = new Promise<void>((coz) => { yazildi = coz; });
    const yazan = vt.tx(async (db) => {
      await db.sorgu("INSERT INTO rol_islemi (rol_id, islem) SELECT id, 'kisiler.yaz' FROM rol WHERE kod = 'operator'");
      yazildi();
      await bekle;
    });
    await yazim;

    let bitti = false;
    const goc = gocleriUygula(ayar, GERCEK_KLASOR, { sema })
      .then((): unknown => null, (hata: unknown) => hata)
      .finally(() => { bitti = true; });
    // Göç ya tablo kilidinde bekler ya da (kilit yoksa) açık yazımı görmeden biter; ikisinden biri olana dek yazım tutulur.
    const kilitBekleyen = async (): Promise<boolean> =>
      (await vt.sorgu(
        `SELECT 1 FROM pg_locks l JOIN pg_class c ON c.oid = l.relation JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE NOT l.granted AND n.nspname = $1 AND c.relname = 'rol_islemi'`,
        [sema],
      )).length > 0;
    let bekliyor = false;
    for (let i = 0; i < 200 && !bitti && !bekliyor; i += 1) {
      bekliyor = await kilitBekleyen();
      if (!bekliyor) await new Promise((coz) => { setTimeout(coz, 10); });
    }
    birak();
    await yazan;
    const hata = await goc;

    assert.equal(bekliyor, true, 'göç açık yazımı beklemedi');
    assert.match(String(hata), /rol_islemi tablosu önceki göçün yazdığı satırlardan farklı: operator:kisiler\.yaz\./);
    assert.deepEqual(await vt.sorgu("SELECT kod FROM rol WHERE kod IN ('planlamaci', 'planlama_proje')"), [{ kod: 'planlamaci' }]);
  });
});

// Var olan matrise satır ekleyen göçler: kendisinden öncekilere kadar kurulmuş şemada, tek başına sınanır.
interface SatirGocu {
  ad: string;
  dosyaSonu: string;
  onek: string;
  elle: { kod: string; islem: string };
  oncedenVar: string[];
  eklenen: string[];
  // Göç rol de açıyorsa: açtığı rol.
  yeniRol?: { kod: string; ad: string };
  // Göç Arkon rolü veriyorsa: göçün yazmayacağı, elle girilmiş başka bir Arkon işlemi.
  baskaArkonIslemi?: { kod: string; islem: string };
}
const SATIR_GOCLERI: SatirGocu[] = [
  {
    ad: 'vardiya işlemleri',
    dosyaSonu: '_kisiler_vardiya_islemleri.sql',
    onek: 'gocv',
    elle: { kod: 'planlama_proje', islem: 'vardiya.yaz' },
    oncedenVar: ['mudur:sayfa.vardiya', 'planlama_proje:sayfa.vardiya'],
    eklenen: ['mudur:vardiya.gecmis-yaz', 'mudur:vardiya.yaz', 'planlama_proje:vardiya.yaz'],
  },
  {
    ad: 'üretim emri işlemleri',
    dosyaSonu: '_kisiler_uretim_emri_islemleri.sql',
    onek: 'gocu',
    elle: { kod: 'operator', islem: 'terminal.uret' },
    oncedenVar: ['operator:sayfa.terminal', 'planlama_proje:sayfa.uretim-emirleri'],
    eklenen: ['mudur:terminal.uret', 'mudur:uretim-emirleri.yaz', 'operator:terminal.uret', 'planlama_proje:uretim-emirleri.yaz'],
  },
  {
    ad: 'malzeme işlemleri',
    dosyaSonu: '_kisiler_malzemeler_islemleri.sql',
    onek: 'gocm',
    elle: { kod: 'operator', islem: 'sayfa.malzemeler' },
    oncedenVar: ['kalite:sayfa.stok', 'satin_alma:sayfa.stok'],
    eklenen: [
      'cam:malzemeler.yaz', 'cam:sayfa.malzemeler',
      'depo:malzemeler.yaz', 'depo:sayfa.malzemeler',
      'kalite:malzemeler.onayla', 'kalite:malzemeler.yaz', 'kalite:sayfa.malzemeler',
      'mudur:malzemeler.onayla', 'mudur:malzemeler.yaz', 'mudur:sayfa.malzemeler',
      'operator:sayfa.malzemeler',
      'planlama_proje:malzemeler.yaz', 'planlama_proje:sayfa.malzemeler',
      'satin_alma:malzemeler.yaz', 'satin_alma:sayfa.malzemeler',
    ],
  },
  {
    ad: 'bakım rolü ve Arkon işlemleri',
    dosyaSonu: '_kisiler_bakim_rolu_arkon_islemleri.sql',
    onek: 'goca',
    elle: { kod: 'operator', islem: 'sayfa.arkon' },
    oncedenVar: ['operator:terminal.uret', 'kalite:sayfa.malzemeler'],
    eklenen: [
      'bakim:arkon.bakim', 'bakim:sayfa.arkon',
      'cam:arkon.hazirlik', 'cam:sayfa.arkon',
      'kalite:arkon.kalite', 'kalite:sayfa.arkon',
      'mudur:arkon.amir', 'mudur:sayfa.arkon',
      'operator:arkon.operator', 'operator:sayfa.arkon',
      'planlama_proje:arkon.planlama', 'planlama_proje:sayfa.arkon',
    ],
    yeniRol: { kod: 'bakim', ad: 'Bakım' },
    baskaArkonIslemi: { kod: 'operator', islem: 'arkon.kalite' },
  },
  {
    ad: 'malzeme tanım işlemi',
    dosyaSonu: '_kisiler_malzemeler_tanim_islemi.sql',
    onek: 'goct',
    elle: { kod: 'mudur', islem: 'malzemeler.tanim-yaz' },
    oncedenVar: ['mudur:malzemeler.onayla', 'planlama_proje:malzemeler.yaz'],
    eklenen: ['mudur:malzemeler.tanim-yaz', 'planlama_proje:malzemeler.tanim-yaz'],
  },
  {
    // Önceden var olan Arkon rol satırları, bakım ve Arkon göçündeki denetimin koşup geçtiği veritabanıdır; bu göç ona takılmaz.
    ad: 'Arkon yansıma okuma işlemi',
    dosyaSonu: '_kisiler_arkon_yansima_okuma.sql',
    onek: 'gocx',
    elle: { kod: 'planlama_proje', islem: 'arkon.yansima-oku' },
    oncedenVar: ['mudur:arkon.amir', 'planlama_proje:arkon.planlama'],
    eklenen: ['mudur:arkon.yansima-oku', 'planlama_proje:arkon.yansima-oku'],
  },
  {
    ad: 'kalibrasyon, istasyon ve denetim işlemleri',
    dosyaSonu: '_kisiler_kalibrasyon_istasyon_denetim.sql',
    onek: 'gocki',
    elle: { kod: 'mudur', islem: 'istasyonlar.yaz' },
    oncedenVar: ['mudur:denetim.oku', 'kalite:malzemeler.onayla'],
    eklenen: ['kalite:kalibrasyon.yaz', 'kalite:sayfa.kalibrasyon', 'mudur:istasyonlar.yaz', 'mudur:sayfa.denetim', 'mudur:sayfa.kalibrasyon'],
  },
  {
    ad: 'Arkon yansıma yeniden deneme işlemi',
    dosyaSonu: '_kisiler_arkon_yansima_yeniden.sql',
    onek: 'gocyy',
    elle: { kod: 'mudur', islem: 'arkon.yansima-yeniden' },
    oncedenVar: ['mudur:arkon.yansima-oku', 'planlama_proje:arkon.yansima-oku'],
    eklenen: ['mudur:arkon.yansima-yeniden', 'planlama_proje:arkon.yansima-yeniden'],
  },
  {
    ad: 'finans işlemleri',
    dosyaSonu: '_kisiler_finans_islemleri.sql',
    onek: 'gocf',
    elle: { kod: 'depo', islem: 'finans.firma-oku' },
    oncedenVar: ['muhasebe_finans:sayfa.stok', 'depo:sayfa.stok'],
    eklenen: [
      'depo:finans.firma-oku',
      'mudur:finans.firma-oku', 'mudur:finans.oku', 'mudur:sayfa.finans',
      'muhasebe_finans:finans.firma-oku', 'muhasebe_finans:finans.firma-yaz', 'muhasebe_finans:finans.oku',
      'muhasebe_finans:finans.yaz', 'muhasebe_finans:finans.yonet', 'muhasebe_finans:sayfa.finans',
      'planlama_proje:finans.firma-oku', 'planlama_proje:finans.firma-yaz', 'planlama_proje:sayfa.finans',
      'satin_alma:finans.firma-oku', 'satin_alma:finans.firma-yaz', 'satin_alma:sayfa.finans',
    ],
  },
  {
    ad: 'stok işlemleri',
    dosyaSonu: '_kisiler_stok_islemleri.sql',
    onek: 'gocs',
    elle: { kod: 'bakim', islem: 'sayfa.stok' },
    oncedenVar: ['depo:sayfa.stok', 'mudur:sayfa.stok'],
    eklenen: [
      'bakim:sayfa.stok',
      'depo:stok.cikis', 'depo:stok.giris', 'depo:stok.sayim', 'depo:stok.toplama', 'depo:stok.transfer',
      'mudur:stok.cikis', 'mudur:stok.geri-al', 'mudur:stok.giris', 'mudur:stok.sayim', 'mudur:stok.tanim',
      'mudur:stok.toplama', 'mudur:stok.transfer',
      'planlama_proje:stok.toplama',
    ],
  },
  {
    ad: 'satın alma işlemleri',
    dosyaSonu: '_kisiler_satin_alma_islemleri.sql',
    onek: 'gocsa',
    elle: { kod: 'cam', islem: 'satin-alma.talep-ac' },
    oncedenVar: ['satin_alma:sayfa.finans', 'muhasebe_finans:sayfa.finans'],
    eklenen: [
      'bakim:satin-alma.talep-ac', 'cam:satin-alma.talep-ac', 'depo:satin-alma.talep-ac', 'kalite:satin-alma.talep-ac',
      'mudur:satin-alma.oku', 'mudur:satin-alma.onayla', 'mudur:satin-alma.talep-ac', 'mudur:sayfa.satin-alma',
      'muhasebe_finans:satin-alma.oku', 'muhasebe_finans:sayfa.satin-alma',
      'planlama_proje:satin-alma.talep-ac',
      'satin_alma:satin-alma.ayar', 'satin_alma:satin-alma.oku', 'satin_alma:satin-alma.talep-ac',
      'satin_alma:satin-alma.yaz', 'satin_alma:sayfa.satin-alma',
    ],
  },
  {
    ad: 'üretim emri fason işlemi',
    dosyaSonu: '_kisiler_uretim_emri_fason_islemi.sql',
    onek: 'gocuf',
    elle: { kod: 'depo', islem: 'uretim-emirleri.fason' },
    oncedenVar: ['depo:stok.giris', 'planlama_proje:uretim-emirleri.yaz'],
    eklenen: ['depo:uretim-emirleri.fason', 'mudur:uretim-emirleri.fason', 'planlama_proje:uretim-emirleri.fason'],
  },
  {
    ad: 'planlama rolüne plan.yaz',
    dosyaSonu: '_kisiler_planlama_plan_yaz.sql',
    onek: 'gocpy',
    elle: { kod: 'planlama_proje', islem: 'plan.yaz' },
    oncedenVar: ['planlama_proje:arkon.planlama', 'planlama_proje:uretim-emirleri.yaz'],
    eklenen: ['planlama_proje:plan.yaz'],
  },
  {
    ad: 'planlama rolüne satın alma sayfası',
    dosyaSonu: '_kisiler_planlama_satin_alma.sql',
    onek: 'gocpsa',
    elle: { kod: 'planlama_proje', islem: 'sayfa.satin-alma' },
    oncedenVar: ['planlama_proje:plan.yaz', 'planlama_proje:satin-alma.talep-ac'],
    eklenen: ['planlama_proje:satin-alma.oku', 'planlama_proje:sayfa.satin-alma'],
  },
  {
    ad: 'planlı duruş yetkisi',
    dosyaSonu: '_kisiler_vardiya_durus_yetkisi.sql',
    onek: 'gocvd',
    elle: { kod: 'planlama_proje', islem: 'vardiya.durus-yaz' },
    oncedenVar: ['mudur:vardiya.yaz', 'planlama_proje:vardiya.yaz'],
    eklenen: ['mudur:vardiya.durus-yaz', 'planlama_proje:vardiya.durus-yaz'],
  },
  {
    ad: 'operatöre üretim terminali sayfası',
    dosyaSonu: '_kisiler_operator_uretim_terminali.sql',
    onek: 'gocout',
    elle: { kod: 'operator', islem: 'sayfa.uretim-terminali' },
    oncedenVar: ['operator:sayfa.terminal', 'operator:terminal.uret'],
    eklenen: ['operator:sayfa.uretim-terminali'],
  },
  {
    ad: 'sevkiyat rolü ve işlemleri',
    dosyaSonu: '_kisiler_sevkiyat_islemleri.sql',
    onek: 'gocsv',
    elle: { kod: 'depo', islem: 'sevkiyat.onayla' },
    oncedenVar: ['depo:sayfa.stok', 'operator:sayfa.terminal'],
    eklenen: [
      'cam:sayfa.sevkiyat', 'cam:sevkiyat.oku',
      'depo:sayfa.sevkiyat', 'depo:sevkiyat.is-yaz', 'depo:sevkiyat.oku', 'depo:sevkiyat.onayla', 'depo:sevkiyat.plan-yaz', 'depo:sevkiyat.tanim-yaz',
      'idari_isler:sayfa.sevkiyat', 'idari_isler:sevkiyat.oku',
      'insan_kaynaklari:sayfa.sevkiyat', 'insan_kaynaklari:sevkiyat.oku',
      'kalite:sayfa.sevkiyat', 'kalite:sevkiyat.oku',
      'mudur:sayfa.sevkiyat', 'mudur:sevkiyat.oku',
      'muhasebe_finans:sayfa.sevkiyat', 'muhasebe_finans:sevkiyat.oku',
      'operator:sayfa.sevkiyat', 'operator:sevkiyat.oku',
      'planlama_proje:sayfa.sevkiyat', 'planlama_proje:sevkiyat.is-yaz', 'planlama_proje:sevkiyat.oku', 'planlama_proje:sevkiyat.plan-yaz',
      'satin_alma:sayfa.sevkiyat', 'satin_alma:sevkiyat.oku',
      'sevkiyat:sayfa.sevkiyat', 'sevkiyat:sayfa.stok', 'sevkiyat:sevkiyat.is-yaz', 'sevkiyat:sevkiyat.oku', 'sevkiyat:sevkiyat.onayla', 'sevkiyat:sevkiyat.plan-yaz', 'sevkiyat:sevkiyat.tanim-yaz',
    ],
    yeniRol: { kod: 'sevkiyat', ad: 'Sevkiyat' },
  },
  {
    ad: 'İK ve İdari İşlere satın alma talebi',
    dosyaSonu: '_kisiler_ik_idari_satin_alma_talebi.sql',
    onek: 'gocist',
    elle: { kod: 'idari_isler', islem: 'satin-alma.talep-ac' },
    oncedenVar: ['idari_isler:kisiler.oku', 'insan_kaynaklari:kisiler.yaz'],
    eklenen: ['idari_isler:satin-alma.talep-ac', 'insan_kaynaklari:satin-alma.talep-ac'],
  },
  {
    ad: 'fabrika haritası işlemleri',
    dosyaSonu: '_kisiler_atolye_islemleri.sql',
    onek: 'gocat',
    elle: { kod: 'planlama_proje', islem: 'atolye.yaz' },
    oncedenVar: ['planlama_proje:sayfa.sevkiyat', 'operator:sayfa.terminal'],
    eklenen: [
      'cam:sayfa.atolye', 'depo:sayfa.atolye', 'kalite:sayfa.atolye', 'mudur:sayfa.atolye', 'operator:sayfa.atolye',
      'planlama_proje:atolye.yaz', 'planlama_proje:sayfa.atolye',
    ],
  },
  {
    ad: 'Taleplerim sayfası',
    dosyaSonu: '_kisiler_taleplerim_sayfasi.sql',
    onek: 'goctls',
    elle: { kod: 'cam', islem: 'sayfa.taleplerim' },
    oncedenVar: ['cam:satin-alma.talep-ac', 'idari_isler:satin-alma.talep-ac'],
    eklenen: [
      'bakim:sayfa.taleplerim', 'cam:sayfa.taleplerim', 'depo:sayfa.taleplerim', 'idari_isler:sayfa.taleplerim',
      'insan_kaynaklari:sayfa.taleplerim', 'kalite:sayfa.taleplerim', 'mudur:sayfa.taleplerim', 'planlama_proje:sayfa.taleplerim',
      'satin_alma:sayfa.taleplerim',
    ],
  },
  {
    ad: 'Projeler işlemleri',
    dosyaSonu: '_kisiler_projeler_islemleri.sql',
    onek: 'gocpj',
    elle: { kod: 'kalite', islem: 'projeler.oku' },
    oncedenVar: ['kalite:sayfa.atolye', 'satin_alma:sayfa.taleplerim'],
    eklenen: [
      'cam:projeler.oku', 'cam:sayfa.projeler', 'depo:projeler.oku', 'depo:sayfa.projeler', 'kalite:projeler.oku', 'kalite:sayfa.projeler',
      'mudur:projeler.oku', 'mudur:projeler.yaz', 'mudur:sayfa.projeler', 'planlama_proje:projeler.oku', 'planlama_proje:projeler.yaz',
      'planlama_proje:sayfa.projeler', 'satin_alma:projeler.oku', 'satin_alma:sayfa.projeler',
    ],
  },
  {
    ad: 'Mesaj işlemleri',
    dosyaSonu: '_kisiler_mesaj_yetkileri.sql',
    onek: 'gocms',
    elle: { kod: 'kalite', islem: 'mesaj.oku' },
    oncedenVar: ['bakim:sayfa.stok', 'mudur:sayfa.taleplerim'],
    eklenen: [
      'bakim:mesaj.oku', 'bakim:mesaj.yaz', 'bakim:sayfa.mesaj', 'cam:mesaj.oku', 'cam:mesaj.yaz', 'cam:sayfa.mesaj',
      'depo:mesaj.oku', 'depo:mesaj.yaz', 'depo:sayfa.mesaj', 'idari_isler:mesaj.oku', 'idari_isler:mesaj.yaz', 'idari_isler:sayfa.mesaj',
      'insan_kaynaklari:mesaj.oku', 'insan_kaynaklari:mesaj.yaz', 'insan_kaynaklari:sayfa.mesaj', 'kalite:mesaj.oku', 'kalite:mesaj.yaz', 'kalite:sayfa.mesaj',
      'mudur:mesaj.oku', 'mudur:mesaj.yaz', 'mudur:sayfa.mesaj', 'muhasebe_finans:mesaj.oku', 'muhasebe_finans:mesaj.yaz', 'muhasebe_finans:sayfa.mesaj',
      'planlama_proje:mesaj.oku', 'planlama_proje:mesaj.yaz', 'planlama_proje:sayfa.mesaj', 'satin_alma:mesaj.oku', 'satin_alma:mesaj.yaz', 'satin_alma:sayfa.mesaj',
      'sevkiyat:mesaj.oku', 'sevkiyat:mesaj.yaz', 'sevkiyat:sayfa.mesaj',
    ],
  },
  {
    ad: 'operatör Mesaj işlemleri',
    dosyaSonu: '_kisiler_operator_mesaj.sql',
    onek: 'gocom',
    elle: { kod: 'operator', islem: 'mesaj.oku' },
    oncedenVar: ['kalite:mesaj.oku', 'operator:sayfa.terminal'],
    eklenen: ['operator:mesaj.oku', 'operator:mesaj.yaz', 'operator:sayfa.mesaj'],
  },
  {
    ad: 'planlama emre kopyalama',
    dosyaSonu: '_kisiler_planlama_emre_kopyala.sql',
    onek: 'gocpk',
    elle: { kod: 'planlama_proje', islem: 'rota.emre-kopyala' },
    oncedenVar: ['planlama_proje:uretim-emirleri.yaz', 'operator:mesaj.oku'],
    eklenen: ['planlama_proje:rota.emre-kopyala'],
  },
  {
    ad: 'satın alma fason',
    dosyaSonu: '_kisiler_satin_alma_fason.sql',
    onek: 'gocsf',
    elle: { kod: 'satin_alma', islem: 'uretim-emirleri.fason' },
    oncedenVar: ['depo:uretim-emirleri.fason', 'satin_alma:satin-alma.oku'],
    eklenen: ['satin_alma:uretim-emirleri.fason'],
  },
  {
    ad: 'portal bölümleri',
    dosyaSonu: '_kisiler_portal_bolumleri.sql',
    onek: 'gocpb',
    elle: { kod: 'kalite', islem: 'portal.kalite' },
    oncedenVar: ['kalite:portal.oku', 'planlama_proje:portal.oku'],
    eklenen: [
      'kalite:portal.kalite', 'mudur:portal.finans', 'mudur:portal.kalite', 'mudur:portal.satinalma', 'mudur:portal.satis',
      'muhasebe_finans:portal.finans', 'satin_alma:portal.satinalma', 'sevkiyat:portal.satis',
    ],
  },
  {
    ad: 'kur ve faiz girişi',
    dosyaSonu: '_kisiler_kur_yaz.sql',
    onek: 'gocky',
    elle: { kod: 'satin_alma', islem: 'finans.kur-yaz' },
    oncedenVar: ['muhasebe_finans:finans.yaz', 'satin_alma:satin-alma.oku'],
    eklenen: ['muhasebe_finans:finans.kur-yaz', 'satin_alma:finans.kur-yaz'],
  },
  {
    ad: 'birim maliyetlerini görme',
    dosyaSonu: '_kisiler_finans_maliyet_oku.sql',
    onek: 'gocmo',
    elle: { kod: 'mudur', islem: 'finans.maliyet-oku' },
    oncedenVar: ['muhasebe_finans:finans.yonet', 'planlama_proje:sayfa.finans', 'kalite:sayfa.stok', 'cam:sayfa.rota'],
    eklenen: ['mudur:finans.maliyet-oku', 'muhasebe_finans:finans.maliyet-oku', 'planlama_proje:finans.maliyet-oku'],
  },
  {
    ad: 'depoya bütün stok işlemleri',
    dosyaSonu: '_kisiler_depo_stok_tam.sql',
    onek: 'gocdst',
    elle: { kod: 'depo', islem: 'stok.geri-al' },
    oncedenVar: ['depo:stok.giris', 'mudur:stok.tanim', 'mudur:stok.geri-al'],
    eklenen: ['depo:stok.geri-al', 'depo:stok.tanim'],
  },
  {
    ad: 'Reçete ve Rota işlemleri',
    dosyaSonu: '_kisiler_recete_rota_yetkileri.sql',
    onek: 'gocrr',
    elle: { kod: 'kalite', islem: 'recete-rota.oku' },
    oncedenVar: ['planlama_proje:rota.emre-kopyala', 'cam:sayfa.rota'],
    eklenen: [
      'cam:recete-rota.oku', 'cam:sayfa.recete-rota', 'kalite:recete-rota.oku', 'kalite:sayfa.recete-rota',
      'mudur:recete-rota.oku', 'mudur:recete-rota.yaz', 'mudur:sayfa.recete-rota',
      'planlama_proje:recete-rota.oku', 'planlama_proje:recete-rota.yaz', 'planlama_proje:sayfa.recete-rota',
    ],
  },
  {
    ad: 'malzeme isteği ve teslim',
    dosyaSonu: '_kisiler_stok_istek_yetkisi.sql',
    onek: 'gocsi',
    elle: { kod: 'operator', islem: 'stok.istek' },
    oncedenVar: ['depo:stok.transfer', 'operator:sayfa.terminal'],
    eklenen: [
      'bakim:stok.istek', 'cam:stok.istek', 'depo:stok.istek', 'idari_isler:stok.istek', 'insan_kaynaklari:stok.istek', 'kalite:stok.istek',
      'mudur:stok.istek', 'muhasebe_finans:stok.istek', 'operator:stok.istek', 'planlama_proje:stok.istek', 'satin_alma:stok.istek', 'sevkiyat:stok.istek',
    ],
  },
  {
    ad: 'statü değiştirme',
    dosyaSonu: '_kisiler_stok_statu_degistir.sql',
    onek: 'gocsd',
    elle: { kod: 'mudur', islem: 'stok.statu-degistir' },
    oncedenVar: ['mudur:stok.transfer', 'depo:stok.transfer'],
    eklenen: ['mudur:stok.statu-degistir'],
  },

];

for (const goc of SATIR_GOCLERI) {
  describe(`${goc.ad} göçü var olan veritabanında (gerçek PostgreSQL)`, () => {
    let ortam: TestVeritabani | undefined;
    let oncesi = '';
    let dahil = '';

    before(async () => {
      ortam = await testSemasiAc(goc.onek);
      oncesi = await mkdtemp(join(tmpdir(), `tmiv2-${goc.onek}-`));
      dahil = await mkdtemp(join(tmpdir(), `tmiv2-${goc.onek}d-`));
    });

    after(async () => {
      for (const klasor of [oncesi, dahil]) if (klasor) await rm(klasor, { recursive: true, force: true });
      await ortam?.kaldir();
    });

    test('satır elle girilmişse göç durur ve hiçbir satır eklemez; satır silinince yalnız onaylı satırları ekler', async () => {
      if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
      const { ayar, sema, vt } = ortam;
      const hepsi = (await readdir(GERCEK_KLASOR)).filter((ad) => ad.endsWith('.sql')).sort();
      const sira = hepsi.findIndex((ad) => ad.endsWith(goc.dosyaSonu));
      assert.equal(sira > 0, true, `${goc.ad} göçü bulunamadı ya da öncesinde göç yok`);
      for (const ad of hepsi.slice(0, sira)) await copyFile(join(GERCEK_KLASOR, ad), join(oncesi, ad));
      // Sonraki göçler de satır ekler; ölçülen yalnız bu göçün eklediğidir.
      for (const ad of hepsi.slice(0, sira + 1)) await copyFile(join(GERCEK_KLASOR, ad), join(dahil, ad));
      await gocleriUygula(ayar, oncesi, { sema });

      const satirlar = async (): Promise<string[]> =>
        (await vt.sorgu<{ kod: string; islem: string }>('SELECT r.kod, ri.islem FROM rol_islemi ri JOIN rol r ON r.id = ri.rol_id'))
          .map((s) => `${s.kod}:${s.islem}`).sort();
      const once = await satirlar();
      // Sayfa satırları roller göçünden gelir; bu göç onları yeniden yazmaz.
      for (const satir of goc.oncedenVar) assert.equal(once.includes(satir), true, satir);

      // Dolu tablo: her role atanmış bir kişi vardır; göç rol kimliklerine ve atamalara dokunmaz.
      await vt.sorgu(
        `WITH yeni AS (INSERT INTO kisi (ad, kullanici_adi, parola_ozeti)
                       SELECT 'Eski Kişi', 'eski-' || replace(kod, '_', '-'), 'x' FROM rol RETURNING id, kullanici_adi)
         INSERT INTO kisi_rolu (kisi_id, rol_id)
         SELECT yeni.id, rol.id FROM yeni JOIN rol ON 'eski-' || replace(rol.kod, '_', '-') = yeni.kullanici_adi`,
      );
      interface RolSatiri { id: number; kod: string; ad: string; yerlesik: boolean; yonetici: boolean }
      const roller = (): Promise<RolSatiri[]> => vt.sorgu<RolSatiri>('SELECT id, kod, ad, yerlesik, yonetici FROM rol ORDER BY id');
      const atamalar = (): Promise<unknown[]> => vt.sorgu('SELECT kisi_id, rol_id FROM kisi_rolu ORDER BY kisi_id, rol_id');
      const rollerOnce = await roller();
      const atamalarOnce = await atamalar();
      assert.equal(rollerOnce.length > 0, true);
      assert.equal(atamalarOnce.length, rollerOnce.length);

      await vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) SELECT id, $2 FROM rol WHERE kod = $1', [goc.elle.kod, goc.elle.islem]);
      await assert.rejects(gocleriUygula(ayar, dahil, { sema }), /rol_islemi_pkey/);
      assert.deepEqual(await satirlar(), [...once, `${goc.elle.kod}:${goc.elle.islem}`].sort());
      // Göç tek transaction'dır: durunca açtığı rol de kalmaz.
      assert.deepEqual(await roller(), rollerOnce);
      await vt.sorgu('DELETE FROM rol_islemi WHERE islem = $1', [goc.elle.islem]);

      if (goc.yeniRol) {
        // Aynı kodla elle açılmış rol: göç onu sahiplenip işlem vermez, durur.
        await vt.sorgu("INSERT INTO rol (kod, ad) VALUES ($1, 'Elle Rol')", [goc.yeniRol.kod]);
        await assert.rejects(gocleriUygula(ayar, dahil, { sema }), /rol_kod_key|rol_kod_tek/);
        assert.deepEqual(await satirlar(), once);
        await vt.sorgu('DELETE FROM rol WHERE kod = $1', [goc.yeniRol.kod]);
      }

      if (goc.baskaArkonIslemi) {
        // Göçün yazacağından FARKLI bir Arkon işlemi birincil anahtara takılmaz; rol iki Arkon işlemi taşır ve öncelik sırasına düşerdi.
        const elle = goc.baskaArkonIslemi;
        await vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) SELECT id, $2 FROM rol WHERE kod = $1', [elle.kod, elle.islem]);
        await assert.rejects(
          gocleriUygula(ayar, dahil, { sema }),
          new RegExp(`Arkon rolü verilecek rollerde elle girilmiş Arkon işlemi var: ${elle.kod}:${elle.islem.replace('.', '\\.')}\\.`),
        );
        assert.deepEqual(await satirlar(), [...once, `${elle.kod}:${elle.islem}`].sort());
        assert.deepEqual(await roller(), rollerOnce);
        await vt.sorgu('DELETE FROM rol_islemi WHERE islem = $1', [elle.islem]);
      }

      assert.deepEqual(await gocleriUygula(ayar, dahil, { sema }), [hepsi[sira]]);
      assert.deepEqual((await satirlar()).filter((s) => !once.includes(s)), goc.eklenen);
      assert.deepEqual(await atamalar(), atamalarOnce);
      const rollerSonra = await roller();
      const eskiKimlikler = new Set(rollerOnce.map((r) => r.id));
      assert.deepEqual(rollerSonra.filter((r) => eskiKimlikler.has(r.id)), rollerOnce);
      assert.deepEqual(
        rollerSonra.filter((r) => !eskiKimlikler.has(r.id)).map(({ kod, ad, yerlesik, yonetici }) => ({ kod, ad, yerlesik, yonetici })),
        goc.yeniRol ? [{ ...goc.yeniRol, yerlesik: true, yonetici: false }] : [],
      );
    });
  });
}
