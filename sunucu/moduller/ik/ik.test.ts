import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { IK_ISLEMLERIM_IKINCI_MENU } from '#paylasilan/sayfalar/ik.ts';
import type { IkAyarCevabi, IkBen, IkOzetiCevabi, IkTopluCevabi, IkVeriCevabi, IkYazCevabi } from '#paylasilan/sozlesme/ik.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { acikZimmetCozucusu } from './disari.ts';
import { motorKur } from './motor/arayuz.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';

const PAROLA = 'dogru-parola-1';
type Govde = Record<string, unknown>;

// Sınama kendi senaryosunun dağılımını kurar (ücret ve kilit yetkisi olmayan İK uzmanı gibi). Onaylı rol dağılımı göçü ve onun
// testi çekirdek isteğidir (CEKIRDEK-ISTEKLERI-ik.md); bu sınama ona bağlı değildir.
const ROL_ISLEMLERI: [string, string[]][] = [
  ['insan_kaynaklari', ['ik.oku', 'ik.personel-yaz', 'ik.izin-yaz', 'ik.izin-talep', 'ik.devam-yaz', 'ik.bordro-kesinlestir', 'ik.performans-yaz',
    'ik.egitim-yaz', 'ik.ise-alim-yaz', 'ik.ayar-yaz']],
  ['mudur', ['ik.izin-onay', 'ik.izin-talep', 'ik.pozisyon-onay', 'ik.devam-onay']],
  ['operator', ['ik.izin-talep']],
];

describe('İnsan Kaynakları (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const c: Record<'yon' | 'uzm' | 'mud' | 'opr' | 'opr2', string> = { yon: '', uzm: '', mud: '', opr: '', opr2: '' };
  const kim: Record<'yon' | 'uzm' | 'mud' | 'opr' | 'opr2', number> = { yon: 0, uzm: 0, mud: 0, opr: 0, opr2: 0 };
  let im1 = 0; let im2 = 0;
  // Rol göçünün dağılımı, test kendi rol satırlarını yazmadan önce okunur.
  let gocDagilimi: { kod: string; islem: string }[] = [];
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

  const surumler = new Map<string, number>();
  async function kaydet(cerezi: string, alan: string, govde: Govde): Promise<IkYazCevabi> {
    const id = String(govde['id']);
    const r = await tamam<IkYazCevabi>(cerezi, 'POST', `/ik/${alan}/${id}/kaydet`, { govde, surum: surumler.get(id) ?? null });
    surumler.set(id, r.kayit.surum);
    return r;
  }
  const kaydetGovdesi = (govde: Govde) => ({ govde, surum: surumler.get(String(govde['id'])) ?? null });
  const personel = (id: string, ek: Govde = {}): Govde => ({ id, kind: 'emp', ad: `Ad ${id}`, soyad: 'Deneme', iseGiris: '2024-01-01', isMerkeziId: im1, ...ek });
  const izin = (id: string, empId: string, durum: string, ek: Govde = {}): Govde =>
    ({ id, kind: 'leave', empId, tur: 'Yıllık izin', baslangic: '2026-12-07', bitis: '2026-12-09', gun: 3, durum, ...ek });
  const buAy = (): string => new Date().toISOString().slice(0, 7);
  const sonrakiAyBasi = (): string => { const d = new Date(); return new Date(Date.UTC(d.getFullYear(), d.getMonth() + 1, 1)).toISOString().slice(0, 10); };

  before(async () => {
    ortam = await testVeritabaniKur('ik');
    gocDagilimi = await ortam.vt.sorgu<{ kod: string; islem: string }>(
      "SELECT r.kod, ri.islem FROM rol_islemi ri JOIN rol r ON r.id = ri.rol_id WHERE ri.islem LIKE 'ik.%' OR ri.islem IN ('sayfa.ik', 'sayfa.ik-islemlerim') ORDER BY 1, 2");
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await ortam.vt.sorgu("DELETE FROM rol_islemi WHERE islem LIKE 'ik.%'");
    for (const [rol, islemler] of ROL_ISLEMLERI) {
      for (const islem of islemler) await ortam.vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ((SELECT id FROM rol WHERE kod = $1), $2)', [rol, islem]);
    }
    const merkezler = await ortam.vt.sorgu<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('IKM1', 'Merkez 1'), ('IKM2', 'Merkez 2') RETURNING id");
    im1 = merkezler[0]!.id; im2 = merkezler[1]!.id;
    const yon = await girisYap('ik-yon', 'yonetici');
    c.yon = yon.cerez; kim.yon = yon.id;
    for (const [k, ad, rol] of [['uzm', 'ik-uzm', 'insan_kaynaklari'], ['mud', 'ik-mud', 'mudur'], ['opr', 'ik-opr', 'operator'], ['opr2', 'ik-opr2', 'operator']] as const) {
      const g = await girisYap(ad, rol, yon.id);
      c[k] = g.cerez; kim[k] = g.id;
    }
    // İK uzmanı yalnız Merkez 1'de yetkili (iş merkezi kapsamı); yönetici kısıtsız.
    await ortam.vt.sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2)', [kim.uzm, im1]);
    await kaydet(c.yon, 'personel', personel('emp_m', { sicilNo: '2001', brutMaas: 90000, kisiId: kim.mud }));
    await kaydet(c.yon, 'personel', personel('emp_a', { sicilNo: '3001', yoneticiId: 'emp_m', brutMaas: 33030, tckn: '10000000146', iban: 'TR00 0000 0000 0000 0000 0000 00', kisiId: kim.opr }));
    await kaydet(c.yon, 'personel', personel('emp_b', { sicilNo: '3002', brutMaas: 50000, kisiId: kim.opr2 }));
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('IK-21, IK-24, IK-25: rol ve kapsam: İK hepsini, yönetici ekibini (süzülmüş), çalışan kendini görür', async () => {
    const ik = await tamam<IkVeriCevabi>(c.uzm, 'GET', '/ik/veri');
    assert.equal(ik.ben.rol, 'ik');
    assert.deepEqual(ik.kayitlar.filter((k) => k.tur === 'emp').map((k) => k.kimlik).sort(), ['emp_a', 'emp_b', 'emp_m']);
    assert.ok(ik.gecmis.length >= 3, 'İK geçmişi görür');
    const mud = await tamam<IkVeriCevabi>(c.mud, 'GET', '/ik/veri');
    assert.deepEqual({ rol: mud.ben.rol, ben: mud.ben.personelKimlik }, { rol: 'yonetici', ben: 'emp_m' });
    const a = mud.kayitlar.find((k) => k.kimlik === 'emp_a');
    assert.ok(a, 'ekip üyesi görünür');
    for (const alan of ['brutMaas', 'tckn', 'iban']) assert.equal(alan in a.govde, false, alan);
    assert.equal(mud.kayitlar.some((k) => k.kimlik === 'emp_b'), false, 'ekip dışı görünmez');
    assert.deepEqual(mud.gecmis, []);
    const opr = await tamam<IkVeriCevabi>(c.opr, 'GET', '/ik/veri');
    assert.deepEqual({ rol: opr.ben.rol, ben: opr.ben.personelKimlik }, { rol: 'calisan', ben: 'emp_a' });
    assert.equal(opr.kayitlar.find((k) => k.kimlik === 'emp_a')?.govde['brutMaas'], 33030, 'kendi kaydının tamamı');
    assert.deepEqual(opr.kayitlar.filter((k) => k.tur === 'emp').map((k) => k.kimlik).sort(), ['emp_a', 'emp_m'], 'yöneticisinin adı görünür');
    assert.equal(opr.kayitlar.find((k) => k.kimlik === 'emp_m')?.govde['brutMaas'], undefined);
    const ben = await tamam<IkBen>(c.yon, 'GET', '/ik/ben');
    assert.deepEqual({ rol: ben.rol, personel: ben.personelKimlik, salt: ben.saltOkunur }, { rol: 'ik', personel: null, salt: false });
    assert.ok(ben.secenekler.kisiler.some((k) => k.id === kim.opr), 'TMI kullanıcısı seçeneği');
    assert.deepEqual((await tamam<IkBen>(c.uzm, 'GET', '/ik/ben')).secenekler.isMerkezleri.map((m) => m.id), [im1], 'yalnız kapsamdaki iş merkezi');
    assert.deepEqual((await tamam<IkBen>(c.opr, 'GET', '/ik/ben')).secenekler, { kisiler: [], isMerkezleri: [] });
  });

  test('IK-0: her yazma ucu kendi işlemini ister', async () => {
    await ret(403, 'YETKI_YOK', c.opr, 'POST', '/ik/personel/emp_x/kaydet', { govde: personel('emp_x'), surum: null });
    await ret(403, 'YETKI_YOK', c.mud, 'POST', '/ik/devam/att_x/kaydet', { govde: { id: 'att_x', kind: 'att', empId: 'emp_a' }, surum: null });
    await ret(403, 'YETKI_YOK', c.uzm, 'POST', '/ik/izinler/leave_x/karar', { durum: 'Onaylandı', surum: 1 });
  });

  test('IK-13: ücret yetkisi olmayan ücret giremez ve değiştiremez', async () => {
    await ret(403, 'YETKI_YOK', c.uzm, 'POST', '/ik/personel/emp_u/kaydet', { govde: personel('emp_u', { brutMaas: 1 }), surum: null });
    await kaydet(c.uzm, 'personel', personel('emp_u', { telefon: '1' }));
    const a = (await tamam<IkVeriCevabi>(c.uzm, 'GET', '/ik/veri')).kayitlar.find((k) => k.kimlik === 'emp_a')!;
    surumler.set('emp_a', a.surum);
    await ret(403, 'YETKI_YOK', c.uzm, 'POST', '/ik/personel/emp_a/kaydet', kaydetGovdesi({ ...a.govde, brutMaas: 99999 }));
    await kaydet(c.uzm, 'personel', { ...a.govde, telefon: '0555' });
  });

  test('IK-19, IK-23: sürüm denetimi; kayıt zamanı sunucudan', async () => {
    const r = await kaydet(c.uzm, 'departmanlar', { id: 'dept_1', kind: 'dept', ad: 'Üretim', createdAt: '2000-01-01T00:00:00Z' });
    assert.notEqual(r.kayit.govde['createdAt'], '2000-01-01T00:00:00Z');
    assert.ok(Date.parse(String(r.kayit.govde['createdAt'])) > Date.parse('2026-01-01'));
    await ret(409, 'CAKISMA', c.uzm, 'POST', '/ik/departmanlar/dept_1/kaydet', { govde: { id: 'dept_1', kind: 'dept', ad: 'X' }, surum: null });
    await ret(409, 'CAKISMA', c.uzm, 'POST', '/ik/departmanlar/dept_1/kaydet', { govde: { id: 'dept_1', kind: 'dept', ad: 'X' }, surum: r.kayit.surum + 3 });
    const ikinci = await kaydet(c.uzm, 'departmanlar', { id: 'dept_1', kind: 'dept', ad: 'Üretim ve Bakım' });
    assert.equal(ikinci.kayit.surum, r.kayit.surum + 1);
    await ret(400, 'DOGRULAMA', c.uzm, 'POST', '/ik/departmanlar/dept_2/kaydet', { govde: { id: 'dept_3', kind: 'dept', ad: 'X' }, surum: null });
    await ret(400, 'DOGRULAMA', c.uzm, 'POST', '/ik/personel/pay_emp_a_2026-01/kaydet', { govde: { id: 'pay_emp_a_2026-01', kind: 'pay' }, surum: null });
    // Tam ayrıştırma: tanımsız alan ve zorunlu iş merkezi.
    await ret(400, 'DOGRULAMA', c.uzm, 'POST', '/ik/personel/emp_t/kaydet', { govde: personel('emp_t', { ayakkabiNo: 42 }), surum: null });
    await ret(400, 'DOGRULAMA', c.uzm, 'POST', '/ik/personel/emp_t/kaydet', { govde: { ...personel('emp_t'), isMerkeziId: undefined }, surum: null });
    await ret(409, 'CAKISMA', c.yon, 'POST', '/ik/personel/emp_t/kaydet', { govde: personel('emp_t', { kisiId: kim.opr }), surum: null });
  });

  test('IK-9, IK-3: çalışan kendi adına bekleyen talep açar; tarihleri sunucu yazar', async () => {
    await ret(403, 'YETKI_YOK', c.opr, 'POST', '/ik/izinler/leave_o2/talep', { govde: izin('leave_o2', 'emp_b', 'Beklemede'), surum: null });
    await ret(422, 'GECERSIZ', c.opr, 'POST', '/ik/izinler/leave_o3/talep', { govde: izin('leave_o3', 'emp_a', 'Onaylandı'), surum: null });
    const r = await tamam<IkYazCevabi>(c.opr, 'POST', '/ik/izinler/leave_o1/talep', { govde: izin('leave_o1', 'emp_a', 'Beklemede', { talepTarihi: '2001-01-01' }), surum: null });
    surumler.set('leave_o1', r.kayit.surum);
    assert.equal(r.kayit.govde['durum'], 'Beklemede');
    assert.notEqual(r.kayit.govde['talepTarihi'], '2001-01-01');
    await ret(409, 'BAGIMLI_KAYIT', c.uzm, 'POST', '/ik/izinler/leave_z/kaydet', { govde: izin('leave_z', 'emp_yok', 'Beklemede'), surum: null });
  });

  test('IK-7, IK-8: yönetici yalnız ekibine karar verir; kimse kendine karar veremez', async () => {
    const b = await tamam<IkYazCevabi>(c.opr2, 'POST', '/ik/izinler/leave_b1/talep', { govde: izin('leave_b1', 'emp_b', 'Beklemede'), surum: null });
    await ret(403, 'YETKI_YOK', c.mud, 'POST', '/ik/izinler/leave_b1/karar', { durum: 'Onaylandı', surum: b.kayit.surum });
    const m = await tamam<IkYazCevabi>(c.mud, 'POST', '/ik/izinler/leave_m1/talep', { govde: izin('leave_m1', 'emp_m', 'Beklemede'), surum: null });
    await ret(403, 'YETKI_YOK', c.mud, 'POST', '/ik/izinler/leave_m1/karar', { durum: 'Onaylandı', surum: m.kayit.surum });
    const sayac = await tamam<Record<string, number | null>>(c.mud, 'GET', '/ik/menu-sayaclari');
    assert.equal(sayac['onay'], 1, 'ekibinde bekleyen tek talep');
    assert.equal(sayac['izin'], null, 'İK sayısı yetkisizde null');
    const k = await tamam<IkYazCevabi>(c.mud, 'POST', '/ik/izinler/leave_o1/karar', { durum: 'Onaylandı', surum: surumler.get('leave_o1') });
    surumler.set('leave_o1', k.kayit.surum);
    assert.equal(k.kayit.govde['durum'], 'Onaylandı');
    assert.equal(k.kayit.govde['onaylayanId'], 'emp_m');
    assert.match(String(k.kayit.govde['karar']), /^\d{4}-\d{2}-\d{2}$/);
  });

  test('IK-5, IK-6: onaylı izin onaysız değişmez; sonuçlanmış izin değişmez', async () => {
    const v = (await tamam<IkVeriCevabi>(c.uzm, 'GET', '/ik/veri')).kayitlar.find((x) => x.kimlik === 'leave_o1')!;
    await ret(403, 'YETKI_YOK', c.uzm, 'POST', '/ik/izinler/leave_o1/kaydet', { govde: { ...v.govde, bitis: '2026-12-11' }, surum: v.surum });
    await ret(403, 'YETKI_YOK', c.uzm, 'POST', '/ik/izinler/leave_o1/kaydet', { govde: { ...v.govde, durum: 'İptal' }, surum: v.surum });
    await ret(403, 'YETKI_YOK', c.uzm, 'POST', '/ik/izinler/leave_o1/iptal', { surum: v.surum });
    await ret(422, 'GECERSIZ', c.opr, 'POST', '/ik/izinler/leave_o1/talep', { govde: { ...v.govde, durum: 'İptal' }, surum: v.surum });
    const iptal = await tamam<IkYazCevabi>(c.yon, 'POST', '/ik/izinler/leave_o1/kaydet', { govde: { ...v.govde, durum: 'İptal' }, surum: v.surum });
    await ret(422, 'GECERSIZ', c.yon, 'POST', '/ik/izinler/leave_o1/kaydet', { govde: { ...iptal.kayit.govde, durum: 'Beklemede' }, surum: iptal.kayit.surum });
  });

  test('IK-10, IK-11, IK-12: kadro talebi onayı, dört göz ve onaylı pozisyonun kadrosu', async () => {
    const job = (durum: string, ek: Govde = {}): Govde => ({ id: 'job_1', kind: 'job', baslik: 'Torna Operatörü', adet: 2, durum, isMerkeziId: im1, ...ek });
    await kaydet(c.uzm, 'pozisyonlar', job('Taslak'));
    await kaydet(c.uzm, 'pozisyonlar', job('Onay bekliyor'));
    await ret(403, 'YETKI_YOK', c.uzm, 'POST', '/ik/pozisyonlar/job_1/kaydet', kaydetGovdesi(job('Açık')));
    await ret(403, 'YETKI_YOK', c.mud, 'POST', '/ik/pozisyonlar/job_1/kaydet', kaydetGovdesi(job('Açık')));
    const acik = await tamam<IkYazCevabi>(c.mud, 'POST', '/ik/pozisyonlar/job_1/onayla', { surum: surumler.get('job_1') });
    surumler.set('job_1', acik.kayit.surum);
    assert.equal(acik.kayit.govde['durum'], 'Açık');
    await ret(422, 'GECERSIZ', c.mud, 'POST', '/ik/pozisyonlar/job_1/onayla', { surum: acik.kayit.surum });
    await ret(403, 'YETKI_YOK', c.uzm, 'POST', '/ik/pozisyonlar/job_1/kaydet', kaydetGovdesi(job('Açık', { adet: 5 })));
    await kaydet(c.uzm, 'pozisyonlar', job('Açık', { ozet: 'İlan metni' }));
    await ret(422, 'GECERSIZ', c.uzm, 'POST', '/ik/pozisyonlar/job_1/kaydet', kaydetGovdesi(job('Taslak', { ozet: 'İlan metni' })));
    // Dört göz: aynı kişi gönderip onaylayamaz (yönetici her işleme sahiptir).
    const j2 = (durum: string): Govde => ({ id: 'job_2', kind: 'job', baslik: 'Kalite Teknisyeni', durum, isMerkeziId: im1 });
    await kaydet(c.yon, 'pozisyonlar', j2('Onay bekliyor'));
    await ret(403, 'YETKI_YOK', c.yon, 'POST', '/ik/pozisyonlar/job_2/kaydet', kaydetGovdesi(j2('Açık')));
    const satir = await vt().tek<{ gonderen: number; onaylayan: number | null }>('SELECT gonderen_kisi_id AS gonderen, onaylayan_kisi_id AS onaylayan FROM ik_pozisyon WHERE kimlik = $1', ['job_1']);
    assert.ok(satir && satir.onaylayan !== null && satir.onaylayan !== satir.gonderen);
  });

  test('IK-15, IK-16, IK-17: bordro sunucuda hesaplanır; kesinleşmiş ay kilit açma ister', async () => {
    const ay = buAy();
    const girdi = { brut: 33030, gun: 30, ek: 0, mesaiSaat: 0, tatilSaat: 0, kesinti: 0 };
    // Borç 170: aynı istek kimliğiyle yinelenen kesinleştirme kilit açma istemez, ilk cevabı alır; kimliksiz istek reddedilir.
    const kimlik = randomUUID();
    const kesinlestir = () => app.inject({ method: 'POST', url: `/api/ik/bordro/${ay}/kesinlestir`, headers: { cookie: c.uzm, [ISTEK_KIMLIGI_BASLIGI]: kimlik }, payload: { girdiler: { emp_a: girdi } } });
    const ilkCevap = await kesinlestir();
    assert.equal(ilkCevap.statusCode, 200, ilkCevap.body);
    const r = ilkCevap.json() as IkTopluCevabi;
    const yinelenen = await kesinlestir();
    assert.equal(yinelenen.statusCode, 200, yinelenen.body);
    assert.deepEqual(yinelenen.json(), r);
    const kimliksiz = await app.inject({ method: 'POST', url: `/api/ik/bordro/${ay}/kesinlestir`, headers: { cookie: c.uzm }, payload: { girdiler: { emp_a: girdi } } });
    assert.equal(kimliksiz.statusCode, 400, kimliksiz.body);
    const k = r.kayitlar[0]!;
    assert.equal(k.kimlik, `pay_emp_a_${ay}`);
    assert.equal(Math.round(Number(k.govde['net']) * 100) / 100, 28075.5, 'asgari ücretin neti');
    assert.equal(typeof (k.govde['snap'] as Govde)['gv'], 'number');
    await ret(403, 'YETKI_YOK', c.uzm, 'POST', `/ik/bordro/${ay}/kesinlestir`, { girdiler: { emp_a: girdi } });
    const yeniden = await tamam<IkTopluCevabi>(c.yon, 'POST', `/ik/bordro/${ay}/kesinlestir`, { girdiler: { emp_a: { ...girdi, ek: 1000 } } });
    assert.equal(yeniden.kayitlar[0]!.surum, k.surum + 1);
    assert.ok(Number(yeniden.kayitlar[0]!.govde['net']) > 28075.5);
    await ret(409, 'BAGIMLI_KAYIT', c.yon, 'POST', `/ik/bordro/${ay}/kesinlestir`, { girdiler: { emp_yok: girdi } });
    await ret(400, 'DOGRULAMA', c.yon, 'POST', `/ik/bordro/${ay}/kesinlestir`, { girdiler: { emp_a: { ...girdi, net: 1 } } });
  });

  test('IK-20: kilitli parametre dönemi değişmez; yeni dönem geçmişe dönük açılamaz', async () => {
    const donemler = motorKur([], null).periods();
    const etkin = [...donemler].reverse().find((p) => p.baslangic <= `${buAy()}-01`)!;
    const degisti = (p: typeof etkin) => donemler.map((d) => (d.id === p.id ? { ...d, params: { ...d.params, asgariBrut: 1 } } : d));
    // Ayar hiç kaydedilmemişken varsayılan dönemler geçerlidir; bu ay kesinleşmiş bordro var (önceki test): etkin dönem kilitli.
    const ilk = await tamam<IkAyarCevabi>(c.uzm, 'POST', '/ik/ayarlar/kaydet', { govde: { sirket: 'Deneme' }, surum: null });
    await ret(409, 'CAKISMA', c.uzm, 'POST', '/ik/ayarlar/kaydet', { govde: { sirket: 'X' }, surum: null });
    await ret(422, 'GECERSIZ', c.uzm, 'POST', '/ik/ayarlar/kaydet', { govde: { donemler: degisti(etkin) }, surum: ilk.ayarlar.surum });
    await ret(422, 'GECERSIZ', c.uzm, 'POST', '/ik/ayarlar/kaydet', { govde: { donemler: donemler.filter((d) => d.id !== etkin.id) }, surum: ilk.ayarlar.surum });
    await ret(422, 'GECERSIZ', c.uzm, 'POST', '/ik/ayarlar/kaydet', { govde: { donemler: [...donemler, { id: 'p2', ad: 'Bu ay', baslangic: `${buAy()}-01`, params: {} }] }, surum: ilk.ayarlar.surum });
    const ikinci = await tamam<IkAyarCevabi>(c.uzm, 'POST', '/ik/ayarlar/kaydet', {
      govde: { sirket: 'Deneme A.Ş.', donemler: [...donemler, { id: 'p3', ad: 'Yeni', baslangic: sonrakiAyBasi(), params: { asgariBrut: 40000 } }] }, surum: ilk.ayarlar.surum,
    });
    assert.equal(ikinci.ayarlar.surum, ilk.ayarlar.surum + 1);
    assert.equal(ikinci.gecmis[0]?.op, 'ayarlar');
    await ret(403, 'YETKI_YOK', c.mud, 'POST', '/ik/ayarlar/kaydet', { govde: {}, surum: ikinci.ayarlar.surum });
  });

  test('IK-14: kişi yalnız kendi iletişim bilgisini değiştirir', async () => {
    const a = (await tamam<IkVeriCevabi>(c.opr, 'GET', '/ik/veri')).kayitlar.find((k) => k.kimlik === 'emp_a')!;
    const r = await tamam<IkYazCevabi>(c.opr, 'POST', '/ik/personel/emp_a/iletisim', { alanlar: { telefon: '0532 000 00 00' }, surum: a.surum });
    assert.equal(r.kayit.govde['telefon'], '0532 000 00 00');
    assert.equal(r.kayit.govde['brutMaas'], 33030, 'öteki alanlar korunur');
    const b = (await tamam<IkVeriCevabi>(c.uzm, 'GET', '/ik/veri')).kayitlar.find((k) => k.kimlik === 'emp_b')!;
    await ret(403, 'YETKI_YOK', c.opr, 'POST', '/ik/personel/emp_b/iletisim', { alanlar: { telefon: '1' }, surum: b.surum });
  });

  test('IK-18, IK-22: silme iptaldir, kopyası geçmişte kalır ve geri gelir; satır silinemez, geçmiş değişmez', async () => {
    const z = await kaydet(c.uzm, 'egitimler', { id: 'train_1', kind: 'train', ad: 'Deneme eğitimi' });
    const s = await tamam<IkYazCevabi>(c.uzm, 'POST', '/ik/egitimler/train_1/iptal', { surum: z.kayit.surum });
    assert.equal(s.gecmis[0]!.op, 'sil');
    assert.equal(s.gecmis[0]!.snap?.['ad'], 'Deneme eğitimi');
    const veri = await tamam<IkVeriCevabi>(c.uzm, 'GET', '/ik/veri');
    assert.equal(veri.kayitlar.some((k) => k.kimlik === 'train_1'), false);
    const geri = await tamam<IkYazCevabi>(c.uzm, 'POST', '/ik/egitimler/train_1/kaydet', { govde: s.gecmis[0]!.snap, surum: s.kayit.surum });
    assert.equal(geri.gecmis[0]!.op, 'geri');
    await assert.rejects(vt().sorgu("DELETE FROM ik_egitim WHERE kimlik = 'train_1'"), /silinmez/);
    await assert.rejects(vt().sorgu("UPDATE ik_egitim SET aciklama = aciklama WHERE kimlik = 'train_1'"), /sürümü/);
    await assert.rejects(vt().sorgu('UPDATE ik_kayit_gecmisi SET etiket = $1', ['x']), /yalnız ekleme/);
    await assert.rejects(vt().sorgu('DELETE FROM ik_kayit_gecmisi_alani'), /yalnız ekleme/);
  });

  test('kısıtlar: sicil tekil, durum ve dört göz veritabanında da korunur', async () => {
    await ret(409, 'CAKISMA', c.uzm, 'POST', '/ik/personel/emp_c/kaydet', { govde: personel('emp_c', { sicilNo: '3001' }), surum: null });
    const kisi = '(SELECT min(id) FROM kisi)';
    await assert.rejects(vt().sorgu(
      `INSERT INTO ik_izin (kimlik, personel_no, tur, baslangic, bitis, durum, olusturan_kisi_id, guncelleyen_kisi_id)
       VALUES ('leave_k', (SELECT no FROM ik_personel WHERE kimlik = 'emp_a'), 'Yıllık izin', '2026-01-02', '2026-01-03', 'Garip', ${kisi}, ${kisi})`,
    ), /ik_izin_durum_secenek/);
    await assert.rejects(vt().sorgu(
      `INSERT INTO ik_izin (kimlik, personel_no, tur, baslangic, bitis, durum, olusturan_kisi_id, guncelleyen_kisi_id)
       VALUES ('leave_k', (SELECT no FROM ik_personel WHERE kimlik = 'emp_a'), 'Yıllık izin', '2026-01-05', '2026-01-03', 'Beklemede', ${kisi}, ${kisi})`,
    ), /ik_izin_tarih_sirasi/);
    await assert.rejects(vt().sorgu(
      `INSERT INTO ik_pozisyon (kimlik, baslik, durum, is_merkezi_id, olusturan_kisi_id, guncelleyen_kisi_id, gonderen_kisi_id, onaylayan_kisi_id)
       VALUES ('job_k', 'X', 'Açık', ${im1}, ${kisi}, ${kisi}, ${kisi}, ${kisi})`,
    ), /ik_pozisyon_dort_goz/);
    await assert.rejects(vt().sorgu(
      `INSERT INTO ik_personel (kimlik, ad, soyad, olusturan_kisi_id, guncelleyen_kisi_id) VALUES ('emp_k', 'A', 'B', ${kisi}, ${kisi})`,
    ), /is_merkezi_id/);
  });

  test('IK-27: iş merkezi kapsamı okumada ve yazmada; personele ve pozisyona bağlı kayıtlar kapsamı onlardan alır', async () => {
    await kaydet(c.yon, 'personel', personel('emp_d', { isMerkeziId: im2 }));
    const uzm = await tamam<IkVeriCevabi>(c.uzm, 'GET', '/ik/veri');
    assert.equal(uzm.kayitlar.some((k) => k.kimlik === 'emp_d'), false, 'kapsam dışı personel görünmez');
    assert.ok((await tamam<IkVeriCevabi>(c.yon, 'GET', '/ik/veri')).kayitlar.some((k) => k.kimlik === 'emp_d'), 'kısıtsız kişi görür');
    await ret(403, 'YETKI_YOK', c.uzm, 'POST', '/ik/personel/emp_d/kaydet', kaydetGovdesi(personel('emp_d', { isMerkeziId: im2, telefon: '1' })));
    await ret(403, 'YETKI_YOK', c.uzm, 'POST', '/ik/izinler/leave_d/kaydet', { govde: izin('leave_d', 'emp_d', 'Beklemede'), surum: null });
    await ret(403, 'YETKI_YOK', c.uzm, 'POST', '/ik/personel/emp_x2/kaydet', { govde: personel('emp_x2', { isMerkeziId: im2 }), surum: null });
    // Kapsamdaki kaydı kapsam dışına taşıyamaz.
    const u = await kaydet(c.uzm, 'personel', personel('emp_e'));
    await ret(403, 'YETKI_YOK', c.uzm, 'POST', '/ik/personel/emp_e/kaydet', { govde: personel('emp_e', { isMerkeziId: im2 }), surum: u.kayit.surum });
    // Pozisyon ve adayı.
    await kaydet(c.yon, 'pozisyonlar', { id: 'job_d', kind: 'job', baslik: 'Uzak', durum: 'Taslak', isMerkeziId: im2 });
    await kaydet(c.yon, 'adaylar', { id: 'cand_d', kind: 'cand', ad: 'Aday', jobId: 'job_d' });
    const liste = (await tamam<IkVeriCevabi>(c.uzm, 'GET', '/ik/veri')).kayitlar.map((k) => k.kimlik);
    assert.equal(liste.includes('job_d') || liste.includes('cand_d'), false);
    await ret(403, 'YETKI_YOK', c.uzm, 'POST', '/ik/gorusmeler/intv_d/kaydet', { govde: { id: 'intv_d', kind: 'intv', candId: 'cand_d' }, surum: null });
    // Kapsam bilgisi olmayan iş merkezi.
    await ret(409, 'BAGIMLI_KAYIT', c.yon, 'POST', '/ik/personel/emp_x3/kaydet', { govde: personel('emp_x3', { isMerkeziId: 999999 }), surum: null });
  });

  test('IK-51: değişiklik geçmişi okuyanın kapsamıyla süzülür; kapsam dışı kişinin ücret ve banka geçmişi görünmez', async () => {
    await kaydet(c.yon, 'personel', personel('emp_g2', { isMerkeziId: im2, brutMaas: 40000 }));
    await kaydet(c.yon, 'personel', personel('emp_g2', { isMerkeziId: im2, brutMaas: 45000, iban: 'TR00 0000 0000 0000 0000 0000 01' }));
    await kaydet(c.yon, 'personel', personel('emp_g1', { brutMaas: 40000 }));
    await kaydet(c.yon, 'personel', personel('emp_g1', { brutMaas: 45000 }));
    const uzm = (await tamam<IkVeriCevabi>(c.uzm, 'GET', '/ik/veri')).gecmis.map((g) => g.rid);
    assert.equal(uzm.includes('emp_g2'), false, 'kapsam dışı kaydın geçmişi görünmez');
    assert.ok(uzm.includes('emp_g1'), 'kapsamdaki kaydın geçmişi görünür');
    assert.ok((await tamam<IkVeriCevabi>(c.yon, 'GET', '/ik/veri')).gecmis.some((g) => g.rid === 'emp_g2'), 'kısıtsız kişi görür');
  });

  test('IK-52: izin günü sunucuda denetlenir; sıfır, eksi ya da aralıktan uzun gün reddedilir', async () => {
    await kaydet(c.yon, 'personel', personel('emp_l1'));
    for (const gun of [-10, 0, 4]) {
      await ret(400, 'DOGRULAMA', c.uzm, 'POST', '/ik/izinler/leave_l1/kaydet', { govde: izin('leave_l1', 'emp_l1', 'Beklemede', { gun }), surum: null });
    }
    await kaydet(c.uzm, 'izinler', izin('leave_l1', 'emp_l1', 'Beklemede', { gun: 2.5 }));
  });

  test('IK-53: yönetici paneli özeti bugün izinli ve raporlu kişiyi sayar; ad dönmez, kapsamla süzülür, İK okuma ister', async () => {
    const gun = tesisGunu(new Date());
    const once = { yon: await tamam<IkOzetiCevabi>(c.yon, 'GET', '/ik/ozet'), uzm: await tamam<IkOzetiCevabi>(c.uzm, 'GET', '/ik/ozet') };
    await kaydet(c.yon, 'personel', personel('emp_oz1'));
    await kaydet(c.yon, 'personel', personel('emp_oz2'));
    await kaydet(c.yon, 'personel', personel('emp_oz3', { isMerkeziId: im2 }));
    const bugunku = (id: string, emp: string, tur: string): Govde => izin(id, emp, 'Onaylandı', { tur, baslangic: gun, bitis: gun, gun: 1 });
    // Takvim günüyle sayılan tür: yıllık izin hafta sonu girilemez, test her gün koşar.
    await kaydet(c.yon, 'izinler', bugunku('leave_oz1', 'emp_oz1', 'Ücretsiz izin'));
    await kaydet(c.yon, 'izinler', bugunku('leave_oz2', 'emp_oz2', 'Hastalık / rapor'));
    await kaydet(c.yon, 'izinler', bugunku('leave_oz3', 'emp_oz3', 'Ücretsiz izin'));
    const yon = await tamam<IkOzetiCevabi>(c.yon, 'GET', '/ik/ozet');
    assert.deepEqual(Object.keys(yon).sort(), ['izinli', 'raporlu'], 'yalnız sayı');
    assert.deepEqual({ izinli: yon.izinli - once.yon.izinli, raporlu: yon.raporlu - once.yon.raporlu }, { izinli: 2, raporlu: 1 });
    const uzm = await tamam<IkOzetiCevabi>(c.uzm, 'GET', '/ik/ozet');
    assert.deepEqual({ izinli: uzm.izinli - once.uzm.izinli, raporlu: uzm.raporlu - once.uzm.raporlu }, { izinli: 1, raporlu: 1 }, 'kapsam dışı personel sayılmaz');
    await ret(403, 'YETKI_YOK', c.opr, 'GET', '/ik/ozet');
  });

  test('ayarlar tablolara ayrışır ve aynı biçimde geri gelir; tanımsız ayar reddedilir', async () => {
    const v = await tamam<IkVeriCevabi>(c.yon, 'GET', '/ik/veri');
    const ayar = {
      ...(v.ayarlar.govde ?? {}),
      sirket: 'Deneme Makine A.Ş.', cumartesiIsGunu: true, tatiller: '01-01 Yılbaşı\n2026-03-20 Ramazan Bayramı', belgeler: 'Adli sicil\nDiploma',
      perfKriterler: 'İş kalitesi\nVerimlilik', mulakatKriterler: 'İletişim', ilanKanallari: [{ id: 'k1', ad: 'Kariyer sayfası', kod: 'WEB', aktif: true }],
      soruSetleri: [{ id: 'q1', ad: 'Genel', kategori: 'Tüm', odak: 'Motivasyon', sorular: 'Neden biz?\nGüçlü yönünüz?' }],
      gorevler: { 'leave:x': { ertele: '2026-12-01' } }, maliyetPlani: { yil: 2027, zam1: 25, zam2: 10, acik: true, ekler: [{ pozisyon: 'Operatör', brut: 40000, ay: 4, adet: 2 }] },
    };
    const r = await tamam<IkAyarCevabi>(c.yon, 'POST', '/ik/ayarlar/kaydet', { govde: ayar, surum: v.ayarlar.surum });
    for (const k of ['sirket', 'cumartesiIsGunu', 'tatiller', 'belgeler', 'perfKriterler', 'mulakatKriterler', 'ilanKanallari', 'soruSetleri', 'gorevler', 'maliyetPlani'] as const) {
      assert.deepEqual(r.ayarlar.govde[k], ayar[k], k);
    }
    const tatil = await vt().sorgu<{ yil: number | null; ay: number; gun: number }>('SELECT yil, ay, gun FROM ik_resmi_tatil ORDER BY sira');
    assert.deepEqual(tatil, [{ yil: null, ay: 1, gun: 1 }, { yil: 2026, ay: 3, gun: 20 }]);
    await ret(400, 'DOGRULAMA', c.yon, 'POST', '/ik/ayarlar/kaydet', { govde: { ...ayar, renkTemasi: 'mavi' }, surum: r.ayarlar.surum });
    await ret(400, 'DOGRULAMA', c.yon, 'POST', '/ik/ayarlar/kaydet', { govde: { ...ayar, tatiller: 'yılbaşı' }, surum: r.ayarlar.surum });
  });

  test('IK-72: IBAN, ücret, kan grubu ve engel durumunun değeri geçmişe yazılmaz; eski satırın değeri okurken gizlenir', async () => {
    const IBAN = 'TR00 0000 0000 0000 0000 0000 72';
    await kaydet(c.yon, 'personel', personel('emp_gz', { sicilNo: '7201', brutMaas: 40000, iban: IBAN, kanGrubu: 'A Rh+', engelDurumu: 'Yok' }));
    const r = await kaydet(c.yon, 'personel', personel('emp_gz', {
      sicilNo: '7201', brutMaas: 41000, iban: 'TR00 0000 0000 0000 0000 0000 73', kanGrubu: 'B Rh+', engelDurumu: '3. derece (%40–59)', telefon: '0500 000 00 72',
    }));
    const degisen = r.gecmis[0]!.changes;
    for (const f of ['brutMaas', 'iban', 'kanGrubu', 'engelDurumu']) assert.deepEqual(degisen.find((d) => d.f === f), { f, big: true, gizli: true }, f);
    assert.deepEqual(degisen.find((d) => d.f === 'telefon'), { f: 'telefon', from: null, to: '0500 000 00 72' }, 'öteki alanların değeri yazılır');
    const satirlar = await vt().sorgu<{ alan: string; onceki: string | null; sonraki: string | null }>(
      "SELECT a.alan, a.onceki, a.sonraki FROM ik_kayit_gecmisi_alani a JOIN ik_kayit_gecmisi g ON g.no = a.gecmis_no WHERE g.kimlik = 'emp_gz' AND a.alan IN ('brutMaas', 'iban', 'kanGrubu', 'engelDurumu')");
    assert.equal(satirlar.length, 4);
    for (const s of satirlar) assert.deepEqual([s.onceki, s.sonraki], [null, null], s.alan);
    // Karardan önce yazılmış satır yerinde kalır; değeri okurken gizlenir.
    const eski = await vt().tek<{ no: string }>("INSERT INTO ik_kayit_gecmisi (kimlik, tur, islem, etiket, kisi_id) VALUES ('emp_gz', 'emp', 'guncelle', 'eski', $1) RETURNING no::text AS no", [kim.yon]);
    await vt().sorgu('INSERT INTO ik_kayit_gecmisi_alani (gecmis_no, sira, alan, onceki, sonraki, buyuk) VALUES ($1, 1, $2, $3, $4, false)', [eski!.no, 'iban', JSON.stringify(IBAN), '"x"']);
    const okunan = (await tamam<IkVeriCevabi>(c.yon, 'GET', '/ik/veri')).gecmis.find((g) => g.id === `gecmis_${eski!.no}`);
    assert.deepEqual(okunan?.changes, [{ f: 'iban', big: true, gizli: true }]);
    assert.equal((await vt().tek<{ onceki: string }>('SELECT onceki FROM ik_kayit_gecmisi_alani WHERE gecmis_no = $1', [eski!.no]))?.onceki, JSON.stringify(IBAN), 'satır değişmez');
  });

  test('IK-73: kan grubu ve engel durumu yalnız özel veri yetkisiyle görünür ve değişir; kişi kendininkini görür', async () => {
    await kaydet(c.yon, 'personel', personel('emp_oz', { sicilNo: '7301', kanGrubu: '0 Rh-', engelDurumu: '2. derece (%60–79)' }));
    const yon = (await tamam<IkVeriCevabi>(c.yon, 'GET', '/ik/veri')).kayitlar.find((k) => k.kimlik === 'emp_oz')!;
    assert.deepEqual([yon.govde['kanGrubu'], yon.govde['engelDurumu']], ['0 Rh-', '2. derece (%60–79)'], 'yetkili görür');
    const uzm = (await tamam<IkVeriCevabi>(c.uzm, 'GET', '/ik/veri')).kayitlar.find((k) => k.kimlik === 'emp_oz')!;
    assert.equal('kanGrubu' in uzm.govde, false, 'ik.oku yetmez');
    assert.equal('engelDurumu' in uzm.govde, false);
    // Yetkisiz kişinin kaydı alanları silmez; cevap da alanları taşımaz.
    const r = await kaydet(c.uzm, 'personel', { ...uzm.govde, telefon: '0500 000 00 73' });
    assert.equal('kanGrubu' in r.kayit.govde, false);
    const db = await vt().tek<{ kan_grubu: string; engel_durumu: string }>("SELECT kan_grubu, engel_durumu FROM ik_personel WHERE kimlik = 'emp_oz'");
    assert.deepEqual([db?.kan_grubu, db?.engel_durumu], ['0 Rh-', '2. derece (%60–79)']);
    await ret(403, 'YETKI_YOK', c.uzm, 'POST', '/ik/personel/emp_oz/kaydet', kaydetGovdesi({ ...uzm.govde, telefon: '0500 000 00 73', kanGrubu: 'A Rh+' }));
    await ret(403, 'YETKI_YOK', c.uzm, 'POST', '/ik/personel/emp_oz/kaydet', kaydetGovdesi({ ...uzm.govde, telefon: '0500 000 00 73', engelDurumu: 'Yok' }));
    // Ekranın boş gönderdiği alan da değeri silmez.
    await kaydet(c.uzm, 'personel', { ...uzm.govde, telefon: '0500 000 00 74', kanGrubu: '', engelDurumu: null });
    const db2 = await vt().tek<{ kan_grubu: string; engel_durumu: string }>("SELECT kan_grubu, engel_durumu FROM ik_personel WHERE kimlik = 'emp_oz'");
    assert.deepEqual([db2?.kan_grubu, db2?.engel_durumu], ['0 Rh-', '2. derece (%60–79)']);
    // Kişi kendi kaydında görür.
    await kaydet(c.yon, 'personel', { ...(await tamam<IkVeriCevabi>(c.yon, 'GET', '/ik/veri')).kayitlar.find((k) => k.kimlik === 'emp_b')!.govde, kanGrubu: 'AB Rh+' });
    const kendi = (await tamam<IkVeriCevabi>(c.opr2, 'GET', '/ik/veri')).kayitlar.find((k) => k.kimlik === 'emp_b')!;
    assert.equal(kendi.govde['kanGrubu'], 'AB Rh+');
  });

  test('IK-75 (bildirim merkezi): onay bekleyen izin talebi izin onaylayanlara bildirim düşer; talebi giren ve onaysız durum almaz', async () => {
    const bildirimler = async (kaynak: string): Promise<{ kisi_id: number; baslik: string; metin: string | null; yol: string | null }[]> =>
      (await vt().sorgu<{ kisi_id: number; baslik: string; metin: string | null; yol: string | null }>(
        "SELECT kisi_id, baslik, metin, yol FROM bildirim_kaydi WHERE tekil_anahtar = $1 ORDER BY kisi_id", [`ik.izin-onay-bekliyor:${kaynak}`]));
    await kaydet(c.uzm, 'personel', personel('emp_bl', { sicilNo: '7501' }));
    await kaydet(c.uzm, 'izinler', izin('leave_bl1', 'emp_bl', 'Beklemede'));
    const ilk = await bildirimler('leave_bl1');
    assert.ok(ilk.some((b) => b.kisi_id === kim.mud), 'izin onaylayan müdür bildirim alır');
    assert.ok(!ilk.some((b) => b.kisi_id === kim.uzm), 'talebi giren almaz');
    assert.ok(!ilk.some((b) => b.kisi_id === kim.opr), 'izin onayı olmayan almaz');
    assert.deepEqual({ ...ilk.find((b) => b.kisi_id === kim.mud) }, {
      kisi_id: kim.mud, baslik: 'İzin talebi onay bekliyor', metin: 'Ad emp_bl Deneme · Yıllık izin · 2026-12-07 - 2026-12-09', yol: '/ik-islemlerim/onaylar',
    });
    // Bağlantı alıcının açabildiği sayfaya gider: müdürde sayfa.ik yok; Onaylar maddesi izin onayı yetkisiyle görünür.
    const madde = IK_ISLEMLERIM_IKINCI_MENU.gruplar.flatMap((g): readonly { yol: string; islem: string }[] => g.maddeler).find((m) => m.yol === ilk[0]!.yol);
    assert.equal(madde?.islem, 'ik.izin-onay');
    await kaydet(c.uzm, 'izinler', { ...izin('leave_bl1', 'emp_bl', 'Beklemede'), aciklama: 'not' });
    assert.equal((await bildirimler('leave_bl1')).length, ilk.length, 'bekleyen talebin düzeltilmesi yeni bildirim açmaz');
    await kaydet(c.yon, 'izinler', izin('leave_bl2', 'emp_bl', 'Onaylandı', { baslangic: '2027-01-04', bitis: '2027-01-04', gun: 1 }));
    assert.deepEqual(await bildirimler('leave_bl2'), [], 'onay beklemeyen izin bildirim açmaz');
  });

  test('IK-74 (168 c, 244 a): çıkış tarihi yazılan kişinin İdari İşler\'de açık zimmeti varsa çıkış kaydedilir ve cevap uyarı taşır', async () => {
    const acik = new Map<number, { demirbasNo: string; markaModel: string | null }[]>([[kim.uzm, [{ demirbasNo: 'DB-00007', markaModel: 'Deneme dizüstü' }]]]);
    const istenen: number[][] = [];
    acikZimmetCozucusu(async (_db, kisiIdleri) => { istenen.push([...kisiIdleri]); return acik; });
    const kisi = await kaydet(c.yon, 'personel', personel('emp_cz', { sicilNo: '7401', kisiId: kim.uzm }));
    assert.equal(kisi.uyari, undefined, 'çıkışı olmayan kişide uyarı yok');
    const cikis = { ...kisi.kayit.govde, cikisTarihi: '2026-10-31', cikisKodu: '03 Belirsiz süreli sözleşmenin işçi tarafından feshi (istifa)' };
    const r = await kaydet(c.yon, 'personel', cikis);
    assert.equal(r.uyari, 'Çıkış kaydedildi; kişinin üzerinde iade edilmemiş 1 zimmet var: DB-00007 Deneme dizüstü.');
    assert.deepEqual(istenen.at(-1), [kim.uzm], 'zimmet personelin bağlı olduğu kişiden sorulur');
    assert.equal((await vt().tek<{ t: string }>("SELECT cikis_tarihi::text AS t FROM ik_personel WHERE kimlik = 'emp_cz'"))?.t, '2026-10-31', 'çıkış engellenmez');
    acik.clear();
    assert.equal((await kaydet(c.yon, 'personel', { ...r.kayit.govde, telefon: '0500 000 00 74' })).uyari, undefined, 'iade edilince uyarı kalkar');
    const bagsiz = await kaydet(c.yon, 'personel', personel('emp_cz2', { sicilNo: '7402', cikisTarihi: '2026-10-31', cikisKodu: cikis.cikisKodu }));
    assert.equal(bagsiz.uyari, undefined, 'kişiye bağlı olmayan personelin zimmeti bilinmez, uyarı uydurulmaz');
  });

  test('IK-77, IK-78: devam onayı ayrı işlemdir; yazan onay veremez, onaycı kendi kaydını onaylamaz, içerik değişince onay düşer', async () => {
    const devam = (id: string, empId: string, ek: Govde = {}): Govde => ({ id, kind: 'att', empId, tarih: '2026-10-05', tur: 'Fazla mesai', saat: 2, onay: 'Onaylandı', ...ek });
    const yazilan = await kaydet(c.uzm, 'devam', devam('att_o1', 'emp_a'));
    assert.equal(yazilan.kayit.govde['onay'], 'Beklemede', 'devam yazma onay veremez');
    assert.equal(yazilan.uyari, 'Devam kaydı onay bekliyor; onayı devam onay yetkisi olan verir.');
    await ret(403, 'YETKI_YOK', c.opr, 'POST', '/ik/devam/att_o1/onay', { durum: 'Onaylandı', surum: surumler.get('att_o1') });
    await ret(403, 'YETKI_YOK', c.uzm, 'POST', '/ik/devam/att_o1/onay', { durum: 'Onaylandı', surum: surumler.get('att_o1') });
    const onay = await tamam<IkYazCevabi>(c.mud, 'POST', '/ik/devam/att_o1/onay', { durum: 'Onaylandı', surum: surumler.get('att_o1') });
    surumler.set('att_o1', onay.kayit.surum);
    assert.deepEqual({ onay: onay.kayit.govde['onay'], saat: onay.kayit.govde['saat'], uyari: onay.uyari }, { onay: 'Onaylandı', saat: 2, uyari: undefined });
    // Onaylı kaydın açıklaması değişir, onay kalır; süresi değişirse yeniden onay bekler.
    assert.equal((await kaydet(c.uzm, 'devam', devam('att_o1', 'emp_a', { aciklama: 'Not', onay: 'Onaylandı' }))).kayit.govde['onay'], 'Onaylandı');
    assert.equal((await kaydet(c.uzm, 'devam', devam('att_o1', 'emp_a', { aciklama: 'Not', saat: 5 }))).kayit.govde['onay'], 'Beklemede');
    await kaydet(c.uzm, 'devam', devam('att_o2', 'emp_m'));
    await ret(403, 'YETKI_YOK', c.mud, 'POST', '/ik/devam/att_o2/onay', { durum: 'Onaylandı', surum: surumler.get('att_o2') });
    await ret(404, 'BULUNAMADI', c.mud, 'POST', '/ik/devam/att_yok/onay', { durum: 'Onaylandı', surum: 1 });
    // Kendi personel kaydı olmayan onaycı (yönetici) formdan da onaylar.
    assert.equal((await kaydet(c.yon, 'devam', devam('att_o2', 'emp_m'))).kayit.govde['onay'], 'Onaylandı');
  });

  test('IK-79: eksi süre ve eksi bütçe sunucuda reddedilir; veritabanı kısıtı doğrulanmış durur', async () => {
    await ret(400, 'DOGRULAMA', c.uzm, 'POST', '/ik/devam/att_e1/kaydet', { govde: { id: 'att_e1', kind: 'att', empId: 'emp_a', tarih: '2026-10-06', tur: 'Fazla mesai', saat: -3 }, surum: null });
    await ret(400, 'DOGRULAMA', c.yon, 'POST', '/ik/departmanlar/dept_e1/kaydet', { govde: { id: 'dept_e1', kind: 'dept', ad: 'Deneme', butce: -5 }, surum: null });
    await kaydet(c.uzm, 'devam', { id: 'att_e2', kind: 'att', empId: 'emp_a', tarih: '2026-10-06', tur: 'Fazla mesai', saat: 0 });
    const kisitlar = await vt().sorgu<{ conname: string; convalidated: boolean }>(
      // Tablo adıyla süzülür: aynı veritabanında başka testin şeması da aynı kısıtı taşır.
      `SELECT conname, convalidated FROM pg_constraint WHERE conrelid IN ('ik_devam'::regclass, 'ik_departman'::regclass)
          AND conname IN ('ik_devam_saat_eksi_degil', 'ik_departman_butce_eksi_degil') ORDER BY 1`);
    assert.deepEqual(kisitlar, [{ conname: 'ik_departman_butce_eksi_degil', convalidated: true }, { conname: 'ik_devam_saat_eksi_degil', convalidated: true }]);
  });

  test('rol x işlem göçü: onaylı dağılım; İK sayfası yalnız İK uzmanında, herkes İK İşlemlerim ile izin talep eder ve bordrosunu onaylar; muhasebe İK kayıtlarını okumaz', () => {
    const rolun = (kod: string) => gocDagilimi.filter((d) => d.kod === kod).map((d) => d.islem);
    assert.deepEqual(rolun('insan_kaynaklari'), ['ik.ayar-yaz', 'ik.bordro-gordum', 'ik.bordro-kesinlestir', 'ik.bordro-kilit-ac', 'ik.devam-onay', 'ik.devam-yaz', 'ik.egitim-yaz',
      'ik.ise-alim-yaz', 'ik.izin-onay', 'ik.izin-talep', 'ik.izin-yaz', 'ik.oku', 'ik.ozel-veri-oku', 'ik.performans-yaz', 'ik.personel-yaz', 'ik.pozisyon-onay',
      'ik.ucret-yaz', 'sayfa.ik', 'sayfa.ik-islemlerim']);
    assert.deepEqual(rolun('mudur'), ['ik.bordro-gordum', 'ik.devam-onay', 'ik.izin-onay', 'ik.izin-talep', 'ik.pozisyon-onay', 'sayfa.ik-islemlerim']);
    for (const kod of ['planlama_proje', 'operator', 'kalite', 'satin_alma', 'muhasebe_finans', 'idari_isler', 'cam', 'depo', 'bakim', 'sevkiyat']) {
      assert.deepEqual(rolun(kod), ['ik.bordro-gordum', 'ik.izin-talep', 'sayfa.ik-islemlerim'], kod);
    }
  });
});
