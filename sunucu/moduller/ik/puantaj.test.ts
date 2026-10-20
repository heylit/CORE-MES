import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { IkPuantajCevabi, IkPuantajYazCevabi, IkYazCevabi } from '#paylasilan/sozlesme/ik.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { puantajAralikCozucusu, puantajTakvimCozucusu, vardiyaMatrisCozucusu, vardiyaTanimCozucusu } from './disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';

// Puantaj (kart #1571): kişi sayfası ve toplu matris aynı uçtan okur ve yazar. Sınama kendi rol dağılımını kurar: İK uzmanı devam
// yazar ama bordro kilidini açamaz; yönetici her şeyi alır; operatör yalnız kendi puantajını görür.
const ROL_ISLEMLERI: [string, string[]][] = [
  ['insan_kaynaklari', ['ik.oku', 'ik.personel-yaz', 'ik.devam-yaz', 'ik.bordro-kesinlestir']],
  ['operator', ['ik.izin-talep']],
];
const PAROLA = 'dogru-parola-1';
type Govde = Record<string, unknown>;
type Anahtar = 'yon' | 'uzm' | 'opr' | 'opr2';
const AY = '2026-09';
const gun = (g: number): string => `${AY}-${String(g).padStart(2, '0')}`;
const yarin = (): string => tesisGunu(Date.now() + 86_400_000);
interface Gun { personel: string; tarih: string; durum: string | null; giris: string | null; cikis: string | null; aciklama: string | null; surum: number | null }
const calisti = (personel: string, tarih: string, giris: string, cikis: string | null, surum: number | null = null): Gun =>
  ({ personel, tarih, durum: 'calisti', giris, cikis, aciklama: null, surum });

describe('İK puantaj (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const c: Record<Anahtar, string> = { yon: '', uzm: '', opr: '', opr2: '' };
  const kim: Record<Anahtar, number> = { yon: 0, uzm: 0, opr: 0, opr2: 0 };
  let im1 = 0;
  let im2 = 0;
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
  const personel = (id: string, ek: Govde = {}): Govde => ({ id, kind: 'emp', ad: `Ad ${id}`, soyad: 'Deneme', iseGiris: '2024-01-01', isMerkeziId: im1, ...ek });
  const yaz = (cerezi: string, gunler: Gun[]): Promise<IkPuantajYazCevabi> => tamam<IkPuantajYazCevabi>(cerezi, 'POST', '/ik/puantaj/yaz', { gunler });
  const oku = (cerezi: string, sorgu = `ay=${AY}`): Promise<IkPuantajCevabi> => tamam<IkPuantajCevabi>(cerezi, 'GET', `/ik/puantaj?${sorgu}`);
  const kayit = (p: IkPuantajCevabi, personelKimlik: string, tarih: string) =>
    p.kisiler.find((k) => k.personel === personelKimlik)?.kayitlar.find((k) => k.tarih === tarih);

  before(async () => {
    ortam = await testVeritabaniKur('ik_puantaj');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await ortam.vt.sorgu("DELETE FROM rol_islemi WHERE islem LIKE 'ik.%'");
    for (const [rol, islemler] of ROL_ISLEMLERI) {
      for (const islem of islemler) await ortam.vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ((SELECT id FROM rol WHERE kod = $1), $2)', [rol, islem]);
    }
    const merkezler = await ortam.vt.sorgu<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('PUM1', 'Merkez 1'), ('PUM2', 'Merkez 2') RETURNING id");
    im1 = merkezler[0]!.id; im2 = merkezler[1]!.id;
    const yon = await girisYap('pu-yon', 'yonetici');
    c.yon = yon.cerez; kim.yon = yon.id;
    for (const [k, ad, rol] of [['uzm', 'pu-uzm', 'insan_kaynaklari'], ['opr', 'pu-opr', 'operator'], ['opr2', 'pu-opr2', 'operator']] as const) {
      const g = await girisYap(ad, rol, yon.id);
      c[k] = g.cerez; kim[k] = g.id;
    }
    // İK uzmanı yalnız Merkez 1'de yetkili; yönetici kısıtsız.
    await ortam.vt.sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2)', [kim.uzm, im1]);
    for (const p of [
      personel('emp_a', { sicilNo: '5001', brutMaas: 33030, kisiId: kim.opr }),
      personel('emp_b', { sicilNo: '5002', brutMaas: 33030, kisiId: kim.opr2 }),
      personel('emp_c', { sicilNo: '5003', isMerkeziId: im2 }),
      personel('emp_d', { sicilNo: '5004', iseGiris: '2026-09-10' }),
    ]) await tamam<IkYazCevabi>(c.yon, 'POST', `/ik/personel/${String(p['id'])}/kaydet`, { govde: p, surum: null });
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('kişi sayfası ve matris aynı kaydı okur; sunucu yazanı ve süreyi verir', async () => {
    const c1 = await yaz(c.uzm, [calisti('emp_a', gun(1), '08:00', '17:00')]);
    assert.deepEqual(c1.kayitlar.map((k) => [k.personel, k.tarih, k.giris, k.cikis, k.surum]), [['emp_a', gun(1), '08:00', '17:00', 1]]);
    assert.equal(c1.kayitlar[0]!.yazan, 'Deneme pu-uzm');
    const matris = await oku(c.uzm);
    assert.deepEqual(matris.gunler.length, 30);
    assert.deepEqual(matris.kisiler.map((k) => k.personel).sort(), ['emp_a', 'emp_b', 'emp_d'], 'İK kapsamındakiler; Merkez 2 görünmez');
    const kisiSayfasi = await oku(c.uzm, `ay=${AY}&personel=emp_a`);
    assert.deepEqual(kayit(kisiSayfasi, 'emp_a', gun(1)), kayit(matris, 'emp_a', gun(1)));
    // Bu kişinin vardiya planı yok (istasyona atanmamış): süre hesaplanır, fazla bilinmez (sıfır uydurulmaz).
    assert.deepEqual({ ...kayit(matris, 'emp_a', gun(1)), yazildi: '' }, {
      tarih: gun(1), durum: 'calisti', giris: '08:00', cikis: '17:00', aciklama: null, surum: 1, yazan: 'Deneme pu-uzm', yazildi: '',
      calismaDakika: 540, fazlaDakika: null, fazlaTuru: null,
    });
    assert.equal(matris.kisiler.find((k) => k.personel === 'emp_a')!.plan, null);
  });

  test('puantaj satırı İK değişiklik geçmişine yazılmaz; yazma çekirdek denetim kaydına düşer (UYUM-BORCU)', async () => {
    const gecmis = async (): Promise<number> => (await vt().tek<{ sayi: number }>("SELECT count(*)::int AS sayi FROM ik_kayit_gecmisi"))!.sayi;
    const denetim = async (): Promise<number> =>
      (await vt().tek<{ sayi: number }>("SELECT count(*)::int AS sayi FROM denetim_kaydi WHERE yol = '/ik/puantaj/yaz' AND kisi_id = $1", [kim.uzm]))!.sayi;
    const [g0, d0] = [await gecmis(), await denetim()];
    await yaz(c.uzm, [calisti('emp_a', gun(21), '08:00', '17:00')]);
    assert.deepEqual([await gecmis(), await denetim()], [g0, d0 + 1]);
  });

  test('IK-67: çalışan yalnız kendi puantajını okur; başkasınınki bulunmaz; yazamaz', async () => {
    const opr = await oku(c.opr);
    assert.deepEqual(opr.kisiler.map((k) => k.personel), ['emp_a']);
    await ret(404, 'BULUNAMADI', c.opr, 'GET', `/ik/puantaj?ay=${AY}&personel=emp_b`);
    await ret(403, 'YETKI_YOK', c.opr, 'POST', '/ik/puantaj/yaz', { gunler: [calisti('emp_a', gun(2), '08:00', '17:00')] });
  });

  test('IK-27: kapsam dışındaki personele yazılmaz; yönetici yazar', async () => {
    await ret(403, 'YETKI_YOK', c.uzm, 'POST', '/ik/puantaj/yaz', { gunler: [calisti('emp_c', gun(2), '08:00', '17:00')] });
    await yaz(c.yon, [calisti('emp_c', gun(2), '08:00', '17:00')]);
  });

  test('IK-61, IK-62: saat yalnız çalışılan günde; çıkış girişle aynı olamaz; gece çalışması ertesi güne uzanır', async () => {
    await ret(400, 'DOGRULAMA', c.uzm, 'POST', '/ik/puantaj/yaz', { gunler: [{ ...calisti('emp_b', gun(3), '08:00', null), durum: 'devamsiz' }] });
    await ret(400, 'DOGRULAMA', c.uzm, 'POST', '/ik/puantaj/yaz', { gunler: [calisti('emp_b', gun(3), '08:00', '08:00')] });
    await ret(400, 'DOGRULAMA', c.uzm, 'POST', '/ik/puantaj/yaz', { gunler: [calisti('emp_b', gun(3), '8:00', '17:00')] });
    const g = await yaz(c.uzm, [calisti('emp_b', gun(3), '22:00', '06:00')]);
    assert.equal(g.kayitlar[0]!.calismaDakika, 480);
  });

  test('IK-63, IK-64: ileri tarihe, işe girişten önceye yazılmaz', async () => {
    await ret(422, 'GECERSIZ', c.uzm, 'POST', '/ik/puantaj/yaz', { gunler: [calisti('emp_b', yarin(), '08:00', '17:00')] });
    await ret(422, 'GECERSIZ', c.uzm, 'POST', '/ik/puantaj/yaz', { gunler: [calisti('emp_d', gun(9), '08:00', '17:00')] });
    await yaz(c.uzm, [calisti('emp_d', gun(10), '08:00', '17:00')]);
  });

  test('IK-66: var olan gün okunan sürümle değişir; eski sürüm ve sürümsüz yazma reddedilir; boş durum günü siler', async () => {
    const ilk = await yaz(c.uzm, [calisti('emp_b', gun(4), '08:00', null)]);
    assert.equal(ilk.kayitlar[0]!.calismaDakika, null, 'çıkış yoksa süre yok');
    await ret(409, 'CAKISMA', c.uzm, 'POST', '/ik/puantaj/yaz', { gunler: [calisti('emp_b', gun(4), '08:00', '17:00')] });
    const ikinci = await yaz(c.uzm, [calisti('emp_b', gun(4), '08:00', '17:00', 1)]);
    assert.equal(ikinci.kayitlar[0]!.surum, 2);
    await ret(409, 'CAKISMA', c.uzm, 'POST', '/ik/puantaj/yaz', { gunler: [calisti('emp_b', gun(4), '08:00', '18:00', 1)] });
    await ret(409, 'CAKISMA', c.uzm, 'POST', '/ik/puantaj/yaz', { gunler: [calisti('emp_b', gun(5), '08:00', '18:00', 1)] });
    const sil = await yaz(c.uzm, [{ personel: 'emp_b', tarih: gun(4), durum: null, giris: null, cikis: null, aciklama: null, surum: 2 }]);
    assert.deepEqual(sil, { kayitlar: [], silinen: [{ personel: 'emp_b', tarih: gun(4) }] });
    assert.equal(kayit(await oku(c.uzm), 'emp_b', gun(4)), undefined);
  });

  test('toplu yazma tek işlemdir: bir gün reddedilirse hiçbiri yazılmaz; aynı gün iki kez gönderilemez', async () => {
    const gunler = [calisti('emp_b', gun(7), '08:00', '17:00'), calisti('emp_b', gun(8), '08:00', '17:00'), calisti('emp_b', yarin(), '08:00', '17:00')];
    await ret(422, 'GECERSIZ', c.uzm, 'POST', '/ik/puantaj/yaz', { gunler });
    const p = await oku(c.uzm);
    assert.equal(kayit(p, 'emp_b', gun(7)), undefined);
    assert.equal(kayit(p, 'emp_b', gun(8)), undefined);
    await ret(400, 'DOGRULAMA', c.uzm, 'POST', '/ik/puantaj/yaz', { gunler: [gunler[0], gunler[0]] });
    const toplu = await yaz(c.uzm, gunler.slice(0, 2));
    assert.deepEqual(toplu.kayitlar.map((k) => k.tarih), [gun(7), gun(8)]);
    await ret(400, 'DOGRULAMA', c.uzm, 'POST', '/ik/puantaj/yaz', { gunler: [] });
  });

  test('IK-65: bordrosu kesinleşmiş kişinin ayı kilit açma yetkisi olmadan değişmez', async () => {
    await tamam(c.yon, 'POST', `/ik/bordro/${AY}/kesinlestir`, { girdiler: { emp_b: { brut: 33030, gun: 30, ek: 0, mesaiSaat: 0, tatilSaat: 0, kesinti: 0 } } });
    const p = await oku(c.uzm);
    assert.deepEqual(p.kisiler.filter((k) => k.kilitli).map((k) => k.personel), ['emp_b']);
    await ret(403, 'YETKI_YOK', c.uzm, 'POST', '/ik/puantaj/yaz', { gunler: [calisti('emp_b', gun(11), '08:00', '17:00')] });
    await yaz(c.uzm, [calisti('emp_a', gun(11), '08:00', '17:00')]);
    await yaz(c.yon, [calisti('emp_b', gun(11), '08:00', '17:00')]);
  });

  test('IK-68, IK-69: vardiya planından mola düşülür, fazla ve önerilen türü hesaplanır', async () => {
    // Vardiya planı ters bağla gelir; burada Vardiya modülünün yerine sabit bir plan bağlanır (gerçek bağı kablolama testi sınar).
    const plan = (tarih: string) => (new Date(`${tarih}T12:00:00+03:00`).getUTCDay() % 6 === 0 || tarih === gun(15) ? []
      : [{ baslangic: `${tarih}T08:00:00+03:00`, bitis: `${tarih}T12:00:00+03:00` }, { baslangic: `${tarih}T13:00:00+03:00`, bitis: `${tarih}T17:00:00+03:00` }]);
    puantajTakvimCozucusu(async (_db, kaynaklar, aralik) => new Map(kaynaklar.map((k) => [`kisi:${k.id}`, k.id !== kim.opr ? null : {
      isMerkeziId: im1, vardiyaId: null,
      gunler: Array.from({ length: 30 }, (_, i) => gun(i + 1)).filter((t) => t >= aralik.baslangic && t <= aralik.bitis).map((t) => ({
        tarih: t, dakika: plan(t).length ? 480 : 0, kapali: t === gun(15) ? { tur: 'tatil' as const, ad: 'Tatil' } : null,
      })),
    }])));
    puantajAralikCozucusu(async (_db, kaynaklar) => new Map(kaynaklar.map((k) => [`kisi:${k.id}`, k.id !== kim.opr ? null
      : new Map(Array.from({ length: 30 }, (_, i) => gun(i + 1)).map((t) => [t, { araliklar: plan(t), molalar: plan(t).length ? [{ baslangic: `${t}T12:00:00+03:00`, bitis: `${t}T13:00:00+03:00` }] : [] }]))])));
    // 2026-09-14 pazartesi, 2026-09-13 pazar, 2026-09-15 tatil.
    const c1 = await yaz(c.uzm, [
      calisti('emp_a', gun(14), '07:30', '19:00'), calisti('emp_a', gun(13), '09:00', '13:00'), calisti('emp_a', gun(15), '08:00', '12:00'),
      calisti('emp_a', gun(16), '08:00', '16:00'),
    ]);
    const ozet = c1.kayitlar.map((k) => [k.tarih, k.calismaDakika, k.fazlaDakika, k.fazlaTuru]);
    assert.deepEqual(ozet, [
      [gun(13), 240, 240, 'Hafta tatili çalışması'],
      [gun(14), 630, 150, 'Fazla mesai'],
      [gun(15), 240, 240, 'Resmi tatil çalışması'],
      [gun(16), 420, 0, null],
    ]);
    const kisi = (await oku(c.uzm, `ay=${AY}&personel=emp_a`)).kisiler[0]!;
    assert.deepEqual(kisi.plan!.find((p) => p.tarih === gun(14)), { tarih: gun(14), dakika: 480, baslangic: '08:00', bitis: '17:00', kapali: null, ad: null });
    assert.deepEqual(kisi.plan!.find((p) => p.tarih === gun(15)), { tarih: gun(15), dakika: 0, baslangic: null, bitis: null, kapali: 'tatil', ad: 'Tatil' });
  });

  test('soru 55: yıllık izin günü iş günüyle sınırlıdır; hafta sonu İK ayarından, tatil vardiya takviminden gelir', async () => {
    // Bir önceki testin sabit planı yerindedir: emp_a'nın takviminde 2026-09-15 tatil. 11 cuma, 12 cumartesi (ayar: iş günü değil), 13 pazar.
    const izin = (id: string, empId: string, bas: number, bit: number, g: number) => istek(c.yon, 'POST', `/ik/izinler/${id}/kaydet`, {
      govde: { id, kind: 'leave', empId, tur: 'Yıllık izin', baslangic: gun(bas), bitis: gun(bit), gun: g, durum: 'Beklemede' }, surum: null,
    });
    // Cuma-salı: 11 ve 14 iş günü, 15 tatil: en çok 2.
    assert.equal((await izin('leave_ig1', 'emp_a', 11, 15, 3)).statusCode, 400);
    assert.equal((await izin('leave_ig1', 'emp_a', 11, 15, 2)).statusCode, 200);
    // Takvimi olmayan kişide yalnız hafta sonu düşer: cuma-pazartesi en çok 2.
    const r = await izin('leave_ig2', 'emp_b', 11, 14, 4);
    assert.deepEqual([r.statusCode, (r.json() as { kod?: string }).kod], [400, 'DOGRULAMA'], r.body);
    assert.equal((await izin('leave_ig2', 'emp_b', 11, 14, 1.5)).statusCode, 200);
    // İş günü olmayan aralığa yıllık izin girilmez; takvim günüyle sayılan tür girilir.
    assert.equal((await izin('leave_ig3', 'emp_b', 12, 13, 1)).statusCode, 400);
    const rapor = await istek(c.yon, 'POST', '/ik/izinler/leave_ig4/kaydet', {
      govde: { id: 'leave_ig4', kind: 'leave', empId: 'emp_b', tur: 'Hastalık / rapor', baslangic: gun(12), bitis: gun(13), gun: 2, durum: 'Beklemede' }, surum: null,
    });
    assert.equal(rapor.statusCode, 200, rapor.body);
  });

  test('soru 74: izin ekranının gün önerisi kaydın sınırıyla aynı iş günü hesabından gelir; çalışan yalnız kendisininkini okur', async () => {
    const gunu = (cerezi: string, personel: string, bas: number, bit: number) => istek(cerezi, 'GET', `/ik/izin-gunu?personel=${personel}&baslangic=${gun(bas)}&bitis=${gun(bit)}`);
    const r = await gunu(c.uzm, 'emp_a', 11, 15);
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(r.json(), { isGunu: 2 }, 'cuma-salı, salı vardiya takviminde tatil');
    assert.deepEqual((await gunu(c.uzm, 'emp_b', 11, 15)).json(), { isGunu: 3 }, 'takvimsiz kişide yalnız hafta sonu düşer');
    assert.deepEqual((await gunu(c.opr, 'emp_a', 11, 15)).json(), { isGunu: 2 }, 'çalışan kendi kaydı');
    await ret(404, 'BULUNAMADI', c.opr, 'GET', `/ik/izin-gunu?personel=emp_b&baslangic=${gun(11)}&bitis=${gun(15)}`);
    await ret(404, 'BULUNAMADI', c.uzm, 'GET', `/ik/izin-gunu?personel=emp_c&baslangic=${gun(11)}&bitis=${gun(15)}`);
    await ret(400, 'DOGRULAMA', c.uzm, 'GET', `/ik/izin-gunu?personel=emp_a&baslangic=${gun(15)}&bitis=${gun(11)}`);
  });

  test('soru 75: kişi sayfası kişinin vardiyasını salt okunur görür; vardiya seçilmediyse iş merkezinin bütün açık vardiyaları', async () => {
    // Önceki testlerin sabit planı yerindedir: emp_a (opr) Merkez 1'e bağlı, vardiyası seçilmemiş; emp_b'nin takvimi yok.
    const v = (id: number, ad: string, baslangic: string, bitis: string, aktif = true) => ({ id, ad, baslangic, bitis, aktif });
    vardiyaTanimCozucusu(async () => [v(1, 'Gündüz', '08:00', '16:00'), v(2, 'Gece', '00:00', '08:00', false), v(3, 'Cumartesi', '08:00', '13:00'), v(4, 'Akşam', '16:00', '00:00')]);
    vardiyaMatrisCozucusu(async () => [
      ...[1, 2, 3, 4, 5].flatMap((g) => [{ isMerkeziId: im1, gun: g, vardiyaId: 4 }, { isMerkeziId: im1, gun: g, vardiyaId: 1 }]),
      { isMerkeziId: im1, gun: 1, vardiyaId: 2 }, { isMerkeziId: im1, gun: 6, vardiyaId: 3 }, { isMerkeziId: im2, gun: 7, vardiyaId: 1 },
    ]);
    const vardiyasi = (cerezi: string, personel: string) => istek(cerezi, 'GET', `/ik/kisi-vardiyasi?personel=${personel}`);
    const gunduz = { ad: 'Gündüz', baslangic: '08:00', bitis: '16:00' };
    const aksam = { ad: 'Akşam', baslangic: '16:00', bitis: '00:00' };
    const r = await vardiyasi(c.uzm, 'emp_a');
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(r.json(), { vardiya: {
      isMerkezi: { id: im1, kod: 'PUM1', ad: 'Merkez 1' }, secili: null,
      hafta: [1, 2, 3, 4, 5].map((gun) => ({ gun, vardiyalar: [gunduz, aksam] }))
        .concat([{ gun: 6, vardiyalar: [{ ad: 'Cumartesi', baslangic: '08:00', bitis: '13:00' }] }, { gun: 7, vardiyalar: [] }]),
    } }, 'kapalı vardiya ve başka iş merkezi görünmez; vardiyalar başlangıca göre');
    assert.deepEqual((await vardiyasi(c.opr, 'emp_a')).json(), r.json(), 'çalışan kendi kaydı');
    assert.deepEqual((await vardiyasi(c.uzm, 'emp_b')).json(), { vardiya: null }, 'iş merkezine bağlanamayan kişi');
    assert.deepEqual((await vardiyasi(c.uzm, 'emp_d')).json(), { vardiya: null }, 'TMI kullanıcısına bağlı olmayan personel');
    await ret(404, 'BULUNAMADI', c.opr, 'GET', '/ik/kisi-vardiyasi?personel=emp_b');
    await ret(404, 'BULUNAMADI', c.uzm, 'GET', '/ik/kisi-vardiyasi?personel=emp_c');
    // Kişiye vardiya seçilmişse yalnız o vardiyanın günleri.
    puantajTakvimCozucusu(async (_db, kaynaklar) => new Map(kaynaklar.map((k) => [`kisi:${k.id}`, k.id !== kim.opr ? null : { isMerkeziId: im1, vardiyaId: 3, gunler: [] }])));
    const secili = (await tamam<{ vardiya: { secili: string; hafta: { gun: number; vardiyalar: unknown[] }[] } }>(c.uzm, 'GET', '/ik/kisi-vardiyasi?personel=emp_a')).vardiya;
    assert.equal(secili.secili, 'Cumartesi');
    assert.deepEqual(secili.hafta.filter((h) => h.vardiyalar.length > 0).map((h) => h.gun), [6]);
  });
});
