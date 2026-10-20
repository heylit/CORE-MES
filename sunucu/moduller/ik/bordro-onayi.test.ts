import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { IkTopluCevabi, IkVeriCevabi, IkYazCevabi } from '#paylasilan/sozlesme/ik.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';

// İK v3 (ON-PAKET-ik-v3, kullanıcı kararları 1-a ve 2-a, 12.10.2026): Mesailerim (IK-30..IK-35) ve bordro onayı (IK-40..IK-46).
// Sınama bordro onayı işlemini kendi senaryosundaki rollere verir; onaylı rol dağılımı göçü çekirdek isteğidir (CEKIRDEK-ISTEKLERI-ik.md).
const BORDRO_GORDUM_ROLLERI = ['mudur', 'operator', 'bakim'];
const PAROLA = 'dogru-parola-1';
type Govde = Record<string, unknown>;
type Anahtar = 'yon' | 'mud' | 'opr' | 'opr2' | 'bkm';

describe('İK v3: Mesailerim ve bordro onayı (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const c: Record<Anahtar, string> = { yon: '', mud: '', opr: '', opr2: '', bkm: '' };
  const kim: Record<Anahtar, number> = { yon: 0, mud: 0, opr: 0, opr2: 0, bkm: 0 };
  let im = 0;
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = (cerezi: string, yontem: 'GET' | 'POST', url: string, govde?: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: yontem, url: `/api${url}`, headers: { cookie: cerezi, ...(yontem === 'POST' && url.endsWith('/kesinlestir') ? { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } : {}) }, ...(govde === undefined ? {} : { payload: govde as object }) });
  async function tamam<T>(cerezi: string, yontem: 'GET' | 'POST', url: string, govde?: unknown): Promise<T> {
    const r = await istek(cerezi, yontem, url, govde);
    assert.equal(r.statusCode, 200, `${yontem} ${url}: ${r.body}`);
    return r.json() as T;
  }
  async function ret(durum: number, kod: string, cerezi: string, yontem: 'GET' | 'POST', url: string, govde?: unknown): Promise<void> {
    const r = await istek(cerezi, yontem, url, govde);
    assert.deepEqual({ durum: r.statusCode, kod: (r.json() as { kod?: string }).kod }, { durum, kod }, `${yontem} ${url}: ${r.body}`);
  }
  const rolId = async (kod: string): Promise<number> => (await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]))!.id;
  async function girisYap(kullaniciAdi: string, rolKodu: string, aktor?: number): Promise<{ id: number; cerez: string }> {
    const yoneticiRolu = await rolId('yonetici');
    const hedef = await rolId(rolKodu);
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      if (hedef !== yoneticiRolu && aktor !== undefined) {
        await rolAta(db, aktor, yeni, hedef);
        await rolAl(db, aktor, yeni, yoneticiRolu);
      }
      return yeni;
    });
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    return { id, cerez: String(r.headers['set-cookie']).split(';')[0] ?? '' };
  }
  async function kaydet(alan: string, govde: Govde): Promise<void> {
    await tamam<IkYazCevabi>(c.yon, 'POST', `/ik/${alan}/${String(govde['id'])}/kaydet`, { govde, surum: null });
  }
  const personel = (id: string, ek: Govde = {}): Govde => ({ id, kind: 'emp', ad: `Ad ${id}`, soyad: 'Deneme', iseGiris: '2024-01-01', isMerkeziId: im, ...ek });
  const devam = (id: string, empId: string, tarih: string, tur: string, saat: number, onay: string): Govde =>
    ({ id, kind: 'att', empId, tarih, tur, saat, onay });
  const AY = '2026-09';
  const GIRDI = { brut: 33030, gun: 30, ek: 0, mesaiSaat: 0, tatilSaat: 0, kesinti: 0 };
  const kesinlestir = (girdiler: Record<string, typeof GIRDI>): Promise<IkTopluCevabi> =>
    tamam<IkTopluCevabi>(c.yon, 'POST', `/ik/bordro/${AY}/kesinlestir`, { girdiler });
  const veri = (cerezi: string): Promise<IkVeriCevabi> => tamam<IkVeriCevabi>(cerezi, 'GET', '/ik/veri');
  const bordrosu = async (cerezi: string, kimlik: string): Promise<IkVeriCevabi['kayitlar'][number] | undefined> =>
    (await veri(cerezi)).kayitlar.find((k) => k.kimlik === kimlik);

  before(async () => {
    ortam = await testVeritabaniKur('ik_v3');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    for (const rol of BORDRO_GORDUM_ROLLERI) {
      await ortam.vt.sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ((SELECT id FROM rol WHERE kod = $1), 'ik.bordro-gordum') ON CONFLICT DO NOTHING", [rol]);
    }
    im = (await ortam.vt.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('IKV3', 'Merkez') RETURNING id"))!.id;
    const yon = await girisYap('v3-yon', 'yonetici');
    c.yon = yon.cerez; kim.yon = yon.id;
    for (const [k, ad, rol] of [['mud', 'v3-mud', 'mudur'], ['opr', 'v3-opr', 'operator'], ['opr2', 'v3-opr2', 'operator'], ['bkm', 'v3-bkm', 'bakim']] as const) {
      const g = await girisYap(ad, rol, yon.id);
      c[k] = g.cerez; kim[k] = g.id;
    }
    await kaydet('personel', personel('emp_m', { sicilNo: '9001', brutMaas: 90000, kisiId: kim.mud }));
    await kaydet('personel', personel('emp_a', { sicilNo: '9002', yoneticiId: 'emp_m', brutMaas: 33030, kisiId: kim.opr }));
    await kaydet('personel', personel('emp_b', { sicilNo: '9003', brutMaas: 33030, kisiId: kim.opr2 }));
    await kaydet('personel', personel('emp_k', { sicilNo: '9004', brutMaas: 33030, kisiId: kim.bkm }));
    await kaydet('devam', devam('att_a1', 'emp_a', `${AY}-03`, 'Fazla mesai', 3, 'Onaylandı'));
    await kaydet('devam', devam('att_a2', 'emp_a', `${AY}-10`, 'Fazla mesai', 2, 'Beklemede'));
    await kaydet('devam', devam('att_b1', 'emp_b', `${AY}-04`, 'Devamsızlık', 7.5, 'Onaylandı'));
    await kaydet('devam', devam('att_m1', 'emp_m', `${AY}-05`, 'Fazla mesai', 1, 'Onaylandı'));
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('IK-30, IK-31, IK-35: çalışan yalnız kendi devam ve mesai kayıtlarını görür; yönetici ekibininkini görmez; yazamaz', async () => {
    const opr = await veri(c.opr);
    assert.deepEqual(opr.kayitlar.filter((k) => k.tur === 'att').map((k) => k.kimlik).sort(), ['att_a1', 'att_a2']);
    const a2 = opr.kayitlar.find((k) => k.kimlik === 'att_a2')!;
    assert.deepEqual({ tur: a2.govde['tur'], saat: a2.govde['saat'], onay: a2.govde['onay'] }, { tur: 'Fazla mesai', saat: 2, onay: 'Beklemede' }, 'IK-33: onay durumu gelir');
    const mud = await veri(c.mud);
    assert.deepEqual(mud.kayitlar.filter((k) => k.tur === 'att').map((k) => k.kimlik), ['att_m1'], 'IK-35: ekibin mesaisi görünmez');
    assert.deepEqual((await veri(c.opr2)).kayitlar.filter((k) => k.tur === 'att').map((k) => k.kimlik), ['att_b1']);
    // Personel kaydı eşleşmeyen kişi hiçbir mesai kaydı görmez.
    const eslesmeyen = await girisYap('v3-bos', 'operator', kim.yon);
    assert.deepEqual((await veri(eslesmeyen.cerez)).kayitlar.filter((k) => k.tur === 'att'), []);
    await ret(403, 'YETKI_YOK', c.opr, 'POST', '/ik/devam/att_a2/kaydet', { govde: devam('att_a2', 'emp_a', `${AY}-10`, 'Fazla mesai', 9, 'Onaylandı'), surum: 1 });
    await ret(403, 'YETKI_YOK', c.opr, 'POST', '/ik/devam/att_a2/iptal', { surum: 1 });
    // İK bütün kayıtları görmeye devam eder.
    assert.deepEqual((await veri(c.yon)).kayitlar.filter((k) => k.tur === 'att').map((k) => k.kimlik).sort(), ['att_a1', 'att_a2', 'att_b1', 'att_m1']);
  });

  test('IK-41: kesinleşmemiş (taslak) ayın bordrosu onaylanamaz: 409', async () => {
    await ret(409, 'CAKISMA', c.opr, 'POST', `/ik/bordrolar/pay_emp_a_${AY}/gordum`, { surum: 1 });
  });

  test('IK-40..IK-46: çalışan kendi kesinleşmiş bordrosunu bir kez onaylar; başkasınınki 403; onay tutarı değiştirmez; yeniden kesinleşince düşer', async () => {
    const ilk = await kesinlestir({ emp_a: GIRDI, emp_b: GIRDI });
    const a = ilk.kayitlar.find((k) => k.kimlik === `pay_emp_a_${AY}`)!;
    assert.equal('gordum' in a.govde, false, 'yeni kesinleşen bordro onaysızdır');
    const onceki = await vt().tek<{ net: string; surum: number; guncelleme: string }>('SELECT net::text, surum, guncelleme::text FROM ik_bordro WHERE kimlik = $1', [a.kimlik]);

    // IK-41: başkasının bordrosu: yöneticisi, yönetici rolü ve işlemi olan başka rol (bakım) de onaylayamaz.
    await ret(403, 'YETKI_YOK', c.opr2, 'POST', `/ik/bordrolar/${a.kimlik}/gordum`, { surum: a.surum });
    await ret(403, 'YETKI_YOK', c.mud, 'POST', `/ik/bordrolar/${a.kimlik}/gordum`, { surum: a.surum });
    await ret(403, 'YETKI_YOK', c.yon, 'POST', `/ik/bordrolar/${a.kimlik}/gordum`, { surum: a.surum });
    await ret(403, 'YETKI_YOK', c.bkm, 'POST', `/ik/bordrolar/${a.kimlik}/gordum`, { surum: a.surum });
    await ret(400, 'DOGRULAMA', c.opr, 'POST', `/ik/bordrolar/${a.kimlik}/gordum`, {});

    const onay = await tamam<IkYazCevabi>(c.opr, 'POST', `/ik/bordrolar/${a.kimlik}/gordum`, { surum: a.surum });
    assert.equal(onay.kayit.kimlik, a.kimlik);
    assert.match(String(onay.kayit.govde['gordum']), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, 'IK-44: onay zamanı');
    // IK-42: onaylayan TMI kişisi ve zaman sunucuda; ikinci onay yok.
    const defter = await vt().sorgu<{ kisi_id: number; kesinlestirme_sayisi: number }>(
      'SELECT o.kisi_id, o.kesinlestirme_sayisi FROM ik_bordro_onayi o JOIN ik_bordro b ON b.no = o.bordro_no WHERE b.kimlik = $1', [a.kimlik]);
    assert.deepEqual(defter, [{ kisi_id: kim.opr, kesinlestirme_sayisi: a.surum }]);
    await ret(409, 'CAKISMA', c.opr, 'POST', `/ik/bordrolar/${a.kimlik}/gordum`, { surum: a.surum });
    // IK-46: bordro, tutar ve kesinleştirme değişmez.
    assert.deepEqual(await vt().tek('SELECT net::text, surum, guncelleme::text FROM ik_bordro WHERE kimlik = $1', [a.kimlik]), onceki);
    // IK-44, IK-45: çalışan ve İK onay zamanını görür; onaylamayanın bordrosunda yok.
    assert.equal((await bordrosu(c.opr, a.kimlik))?.govde['gordum'], onay.kayit.govde['gordum']);
    assert.equal((await bordrosu(c.yon, a.kimlik))?.govde['gordum'], onay.kayit.govde['gordum']);
    assert.equal('gordum' in ((await bordrosu(c.yon, `pay_emp_b_${AY}`))?.govde ?? {}), false);

    // IK-43: yeniden kesinleşen bordronun eski onayı düşer; eski sürümle onay reddedilir, yeni sürüm yeniden onaylanır.
    const yeniden = await kesinlestir({ emp_a: { ...GIRDI, ek: 500 } });
    const a2 = yeniden.kayitlar[0]!;
    assert.equal(a2.surum, a.surum + 1);
    assert.equal('gordum' in a2.govde, false);
    assert.equal('gordum' in ((await bordrosu(c.opr, a.kimlik))?.govde ?? {}), false, 'önceki onay geçersiz');
    await ret(409, 'CAKISMA', c.opr, 'POST', `/ik/bordrolar/${a.kimlik}/gordum`, { surum: a.surum });
    const ikinci = await tamam<IkYazCevabi>(c.opr, 'POST', `/ik/bordrolar/${a.kimlik}/gordum`, { surum: a2.surum });
    assert.ok(ikinci.kayit.govde['gordum']);
    assert.equal((await vt().tek<{ n: string }>('SELECT count(*)::text AS n FROM ik_bordro_onayi'))!.n, '2', 'eski onay defterde kalır');
  });

  test('IK-42: onay defteri yalnız ekleme: değiştirilemez, silinemez', async () => {
    await assert.rejects(ortam!.vt.sorgu('UPDATE ik_bordro_onayi SET zaman = now()'));
    await assert.rejects(ortam!.vt.sorgu('DELETE FROM ik_bordro_onayi'));
  });

  test('rol x işlem göçü: bordro onayı İK İşlemlerim sayfasını alan her rolde; bakım ve sevkiyat dahil (karar 1-a)', async () => {
    const satirlar = await vt().sorgu<{ kod: string }>(
      "SELECT r.kod FROM rol_islemi ri JOIN rol r ON r.id = ri.rol_id WHERE ri.islem = 'ik.bordro-gordum' ORDER BY 1");
    const sayfali = await vt().sorgu<{ kod: string }>(
      "SELECT r.kod FROM rol_islemi ri JOIN rol r ON r.id = ri.rol_id WHERE ri.islem = 'sayfa.ik-islemlerim' ORDER BY 1");
    assert.deepEqual(satirlar.map((s) => s.kod), sayfali.map((s) => s.kod));
    assert.ok(satirlar.length >= 12);
    assert.ok(satirlar.some((s) => s.kod === 'bakim') && satirlar.some((s) => s.kod === 'sevkiyat'));
  });
});
