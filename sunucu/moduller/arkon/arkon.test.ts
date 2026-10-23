import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type {
  ArkonBenCevabi, ArkonKisilerCevabi, BelgeCevabi, BelgeYazCevabi, BelgelerCevabi, EksikDosyaCevabi,
  IletilerCevabi, KayitlarCevabi, MerkezBelgelerCevabi, MerkezEkleCevabi, MerkezKontrolCevabi, RefakatKartlariCevabi,
} from '#paylasilan/sozlesme/arkon.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { emirCizimDurumlari } from './disari.ts';
import { uclar } from './uclar.ts';
import * as sorgular from './sorgular.ts';

const PAROLA = 'dogru-parola-1';

interface Cevap<T = unknown> { durum: number; govde: T }

describe('arkon (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let operator = '';
  let rolsuz = '';
  let yoneticiId = 0;
  let operatorId = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }

  async function istek<T = unknown>(cerez: string | null, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const cevap = await app.inject({
      method: yontem,
      url: `/api${yol}`,
      headers: { ...(cerez ? { cookie: cerez } : {}), ...(yontem === 'POST' && yol === '/uretim-emirleri' ? { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } : {}) },
      ...(govde === undefined ? {} : { payload: govde as object }),
    });
    return { durum: cevap.statusCode, govde: (cevap.body ? cevap.json() : undefined) as T };
  }
  const hataKodu = (c: Cevap): unknown => (c.govde as { kod?: unknown }).kod;
  // Dosya JSON değil, ikili cevaptır.
  async function indir(cerez: string, ozet: string): Promise<{ durum: number; icerik: Buffer }> {
    const cevap = await app.inject({ method: 'GET', url: `/api/arkon/dosyalar/${ozet}`, headers: { cookie: cerez } });
    return { durum: cevap.statusCode, icerik: cevap.rawPayload };
  }

  async function girisliKisiEkle(kullaniciAdi: string, rolKodu: string): Promise<number> {
    const yoneticiRolu = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    const rol = await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    if (!yoneticiRolu || !rol) throw new Error('rol yok');
    return vt().tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, id, rol.id);
      await rolAl(db, yoneticiId, id, yoneticiRolu.id);
      return id;
    });
  }

  let sayac = 0;
  const kod = (onek: string): string => `${onek}-${(sayac += 1)}`;

  async function istasyonKur(): Promise<{ merkez: string; istasyon: string; istasyonId: number; makine: string; makineId: number }> {
    const im = await istek<{ id: number; kod: string }>(yonetici, 'POST', '/is-merkezleri', { kod: kod('AM'), ad: 'Arkon Merkezi' });
    const ist = await istek<{ id: number; kod: string }>(yonetici, 'POST', '/istasyonlar', {
      kod: kod('AI'), ad: 'Arkon İstasyonu', isMerkeziId: im.govde.id, tip: 'kalite',
    });
    const mk = await istek<{ id: number; kod: string }>(yonetici, 'POST', '/makineler', {
      kod: kod('AK'), ad: 'Arkon Makinesi', istasyonId: ist.govde.id, baglantiTuru: 'mtconnect',
    });
    assert.equal(mk.durum, 200, JSON.stringify(mk.govde));
    return { merkez: im.govde.kod, istasyon: ist.govde.kod, istasyonId: ist.govde.id, makine: mk.govde.kod, makineId: mk.govde.id };
  }

  let projeId = 0;

  before(async () => {
    ortam = await testVeritabaniKur('arkon');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    // Denetim #27: rotasız emir varsayılan kapalı ve projeyle açılır; kurulum ayarı açar, test projesi verir.
    projeId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('TEST.PROJE', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    await ortam.sahip.sorgu("INSERT INTO ayar (anahtar, deger, guncelleyen_kisi_id) VALUES ('uretim-emirleri.rotasiz-emir', 'true', $1)", [yoneticiId]);
    // Arkon işlemleri henüz hiçbir onaylı role verilmedi (rol göçü kart #215'te bekliyor); burada geçici rol taşır.
    const gecici = await ortam.vt.tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('gecici_arkon', 'Geçici Arkon') RETURNING id");
    if (!gecici) throw new Error('rol kurulamadı');
    await ortam.vt.sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'arkon.operator'), ($1, 'sayfa.arkon')", [gecici.id]);
    operatorId = await girisliKisiEkle('operator1', 'gecici_arkon');
    await girisliKisiEkle('satin1', 'satin_alma');
    yonetici = await girisCerezi('yonetici');
    operator = await girisCerezi('operator1');
    rolsuz = await girisCerezi('satin1');
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('rol TMI işleminden gelir: yönetici admin, operatör operator; Arkon rolü olmayan 403, oturumsuz 401', async () => {
    assert.equal((await istek(null, 'GET', '/arkon/ben')).durum, 401);
    const red = await istek(rolsuz, 'GET', '/arkon/ben');
    assert.equal(red.durum, 403);
    assert.equal((await istek(rolsuz, 'GET', '/arkon/belgeler/pkgs')).durum, 403);
    assert.equal((await istek<ArkonBenCevabi>(yonetici, 'GET', '/arkon/ben')).govde.kisi.rol, 'admin');
    const op = await istek<ArkonBenCevabi>(operator, 'GET', '/arkon/ben');
    assert.deepEqual(op.govde.kisi, { kimlik: String(operatorId), ad: 'Deneme operator1', rol: 'operator', isMerkezleri: [], istasyon: null, istasyonlar: [], aktif: true });
  });

  // Kullanıcı kararı (soru 38/49 A): Arkon rolü kişinin rolünden gelir; ek Arkon işlemi rolü değiştirmez, rolünde Arkon işlemi
  // olmayan kişide rolü ek işlem verir.
  test('ek Arkon işlemi rolü değiştirmez; rolünde Arkon işlemi olmayana rolü ek işlem verir', async () => {
    const satinId = await vt().tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'satin1'");
    if (!satinId) throw new Error('kişi yok');
    await vt().sorgu("INSERT INTO kisi_islemi (kisi_id, islem, veren_id) VALUES ($1, 'arkon.planlama', $3), ($2, 'arkon.kalite', $3), ($2, 'sayfa.arkon', $3)",
      [operatorId, satinId.id, yoneticiId]);
    try {
      const op = await girisCerezi('operator1');
      const ekli = await girisCerezi('satin1');
      assert.equal((await istek<ArkonBenCevabi>(op, 'GET', '/arkon/ben')).govde.kisi.rol, 'operator');
      assert.equal((await istek<ArkonBenCevabi>(ekli, 'GET', '/arkon/ben')).govde.kisi.rol, 'quality');
      const liste = (await istek<ArkonKisilerCevabi>(yonetici, 'GET', '/arkon/kisiler')).govde.kisiler;
      assert.equal(liste.find((k) => k.kimlik === String(operatorId))?.rol, 'operator');
      assert.equal(liste.find((k) => k.kimlik === String(satinId.id))?.rol, 'quality');
    } finally {
      await vt().sorgu('DELETE FROM kisi_islemi WHERE kisi_id = ANY($1::int[])', [[operatorId, satinId.id]]);
    }
  });

  // Demo bulgusu: operatör ekranı kayıtlı istasyon yoksa kişinin TMI istasyonuyla açılır (ortak-ayarlar.ts myStation); kod buradan gelir.
  test('Arkon kişisi TMI istasyon atamasını taşır: en yüksek yüzdeli istasyonun kodu, ataması kalkınca null', async () => {
    const az = await istasyonKur();
    const t = await istasyonKur();
    for (const [ist, yuzde] of [[az, '30'], [t, '70']] as const) {
      const ata = await istek(yonetici, 'POST', `/istasyonlar/${ist.istasyonId}/kisiler/ata`, { kisiId: operatorId, yuzde });
      assert.equal(ata.durum, 200, JSON.stringify(ata.govde));
    }
    assert.equal((await istek<ArkonBenCevabi>(operator, 'GET', '/arkon/ben')).govde.kisi.istasyon, t.istasyon);
    const liste = (await istek<ArkonKisilerCevabi>(yonetici, 'GET', '/arkon/kisiler')).govde.kisiler;
    assert.equal(liste.find((k) => k.kimlik === String(operatorId))?.istasyon, t.istasyon);
    assert.equal(liste.find((k) => k.kimlik === String(yoneticiId))?.istasyon, null);
    for (const ist of [az, t]) {
      const cikar = await istek(yonetici, 'POST', `/istasyonlar/${ist.istasyonId}/kisiler/${operatorId}/cikar`, {});
      assert.equal(cikar.durum, 200, JSON.stringify(cikar.govde));
    }
    assert.equal((await istek<ArkonBenCevabi>(operator, 'GET', '/arkon/ben')).govde.kisi.istasyon, null);
  });

  // Kullanıcı bulgusu: Reçete ve Rota'da başka istasyona yetkin yapılan operatör terminalde o istasyonu görmüyordu.
  test('Arkon kişisinin yetkili istasyonları atama ve yetkinlikten birlikte gelir; tek istasyon yalnız atamadan', async () => {
    const atanan = await istasyonKur();
    const yetkin = await istasyonKur();
    assert.equal((await istek(yonetici, 'POST', `/istasyonlar/${atanan.istasyonId}/kisiler/ata`, { kisiId: operatorId, yuzde: '50' })).durum, 200);
    const yk = await istek(yonetici, 'POST', `/kisi-yetkinlikleri/${operatorId}/belirle`, { istasyonIdleri: [yetkin.istasyonId] });
    assert.equal(yk.durum, 200, JSON.stringify(yk.govde));
    const kisi = (await istek<ArkonBenCevabi>(operator, 'GET', '/arkon/ben')).govde.kisi;
    assert.deepEqual([kisi.istasyon, kisi.istasyonlar], [atanan.istasyon, [atanan.istasyon, yetkin.istasyon].sort((a, b) => a.localeCompare(b))]);
    const liste = (await istek<ArkonKisilerCevabi>(yonetici, 'GET', '/arkon/kisiler')).govde.kisiler;
    assert.deepEqual(liste.find((k) => k.kimlik === String(operatorId))?.istasyonlar, kisi.istasyonlar);
    assert.equal((await istek(yonetici, 'POST', `/istasyonlar/${atanan.istasyonId}/kisiler/${operatorId}/cikar`, {})).durum, 200);
    assert.equal((await istek(yonetici, 'POST', `/kisi-yetkinlikleri/${operatorId}/belirle`, { istasyonIdleri: [] })).durum, 200);
    assert.deepEqual((await istek<ArkonBenCevabi>(operator, 'GET', '/arkon/ben')).govde.kisi.istasyonlar, []);
  });

  // Uçtan uca deneme Y1: Kaynaklar'da makineye %100 atanan operatör terminalde kendi istasyonunu bulamıyordu.
  test('makineye atanan operatörün istasyonu makinenin istasyonudur; istasyon ataması öne geçer; atama kalkınca düşer', async () => {
    const makineli = await istasyonKur();
    const atanan = await istasyonKur();
    const ata = await istek(yonetici, 'POST', `/makineler/${makineli.makineId}/kisiler/ata`, { kisiId: operatorId, yuzde: '100' });
    assert.equal(ata.durum, 200, JSON.stringify(ata.govde));
    let kisi = (await istek<ArkonBenCevabi>(operator, 'GET', '/arkon/ben')).govde.kisi;
    assert.deepEqual([kisi.istasyon, kisi.istasyonlar], [makineli.istasyon, [makineli.istasyon]]);
    const liste = (await istek<ArkonKisilerCevabi>(yonetici, 'GET', '/arkon/kisiler')).govde.kisiler;
    assert.equal(liste.find((k) => k.kimlik === String(operatorId))?.istasyon, makineli.istasyon);
    assert.equal((await istek(yonetici, 'POST', `/makineler/${makineli.makineId}/kisiler/${operatorId}/cikar`, {})).durum, 200);
    assert.equal((await istek(yonetici, 'POST', `/makineler/${makineli.makineId}/kisiler/ata`, { kisiId: operatorId, yuzde: '40' })).durum, 200);
    assert.equal((await istek(yonetici, 'POST', `/istasyonlar/${atanan.istasyonId}/kisiler/ata`, { kisiId: operatorId, yuzde: '10' })).durum, 200);
    kisi = (await istek<ArkonBenCevabi>(operator, 'GET', '/arkon/ben')).govde.kisi;
    assert.deepEqual([kisi.istasyon, kisi.istasyonlar], [atanan.istasyon, [atanan.istasyon, makineli.istasyon].sort((a, b) => a.localeCompare(b))]);
    assert.equal((await istek(yonetici, 'POST', `/istasyonlar/${atanan.istasyonId}/kisiler/${operatorId}/cikar`, {})).durum, 200);
    assert.equal((await istek(yonetici, 'POST', `/makineler/${makineli.makineId}/kisiler/${operatorId}/cikar`, {})).durum, 200);
    kisi = (await istek<ArkonBenCevabi>(operator, 'GET', '/arkon/ben')).govde.kisi;
    assert.deepEqual([kisi.istasyon, kisi.istasyonlar], [null, []]);
  });

  test('Arkon kişi listesi: bütün liste yalnız kisiler.oku olana; öteki Arkon kullanıcısı yalnız kendi kaydını alır; rolsüz 403', async () => {
    const tam = (await istek<ArkonKisilerCevabi>(yonetici, 'GET', '/arkon/kisiler')).govde.kisiler;
    assert.deepEqual(tam.map((k) => k.rol).sort(), ['admin', 'operator']);
    const dar = await istek<ArkonKisilerCevabi>(operator, 'GET', '/arkon/kisiler');
    assert.equal(dar.durum, 200);
    assert.deepEqual(dar.govde.kisiler, [{ kimlik: String(operatorId), ad: 'Deneme operator1', rol: 'operator', isMerkezleri: [], istasyon: null, istasyonlar: [], aktif: true }]);
    assert.equal((await istek(rolsuz, 'GET', '/arkon/kisiler')).durum, 403);
    // Kabul: aynı operatör rolüne kisiler.oku eklenince bütün listeyi alır.
    const rol = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'gecici_arkon'");
    await vt().sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'kisiler.oku')", [rol?.id]);
    try {
      const genis = (await istek<ArkonKisilerCevabi>(operator, 'GET', '/arkon/kisiler')).govde.kisiler;
      assert.deepEqual(genis.map((k) => k.rol).sort(), ['admin', 'operator']);
    } finally {
      await vt().sorgu("DELETE FROM rol_islemi WHERE rol_id = $1 AND islem = 'kisiler.oku'", [rol?.id]);
    }
  });

  test('Arkon kişi listesi: pasif ve girişsiz Arkon rollü kişi listede yok; yeniden aktif yapılan döner', async () => {
    const rol = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'gecici_arkon'");
    if (!rol) throw new Error('rol yok');
    const surumu = async (id: number): Promise<number> => (await vt().tek<{ surum: number }>('SELECT surum FROM kisi WHERE id = $1', [id]))?.surum ?? 0;
    const girissiz = await vt().tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Deneme girişsiz') RETURNING id");
    const girissizId = girissiz?.id ?? 0;
    const ata = await istek(yonetici, 'POST', `/kisiler/${girissizId}/rol-ata`, { rolId: rol.id, surum: await surumu(girissizId) });
    assert.equal(ata.durum, 200, JSON.stringify(ata.govde));
    const pasifId = await girisliKisiEkle('pasif1', 'gecici_arkon');
    const surum = (): Promise<number> => surumu(pasifId);
    const listedekiler = async (): Promise<string[]> =>
      (await istek<ArkonKisilerCevabi>(yonetici, 'GET', '/arkon/kisiler')).govde.kisiler.map((k) => k.kimlik);

    assert.ok((await listedekiler()).includes(String(pasifId)));
    assert.equal((await istek(yonetici, 'POST', `/kisiler/${pasifId}/pasife-al`, { surum: await surum() })).durum, 200);
    const sonra = await listedekiler();
    assert.ok(!sonra.includes(String(pasifId)), 'pasif kişi listede');
    assert.ok(!sonra.includes(String(girissizId)), 'girişsiz kişi listede');
    assert.ok(sonra.includes(String(operatorId)));
    assert.equal((await istek(yonetici, 'POST', `/kisiler/${pasifId}/aktif-yap`, { surum: await surum() })).durum, 200);
    assert.ok((await listedekiler()).includes(String(pasifId)));
  });

  test('uç tanımı: okuma ve yazma uçları Arkon, Üretim Terminali ya da Kuyruk sayfasını ister (sayfası olmayan Arkon rollü kişi okuyamaz, yazamaz)', async () => {
    const okuma = uclar.filter((u) => u.yontem === 'GET' && !u.yol.startsWith('/arkon/tmi-yansimalari') && u.yol !== '/arkon/son-olaylar' && !u.yol.startsWith('/arkon/anomali'));
    assert.equal(okuma.length, 15);
    // Son olayları Fabrika Haritası da okur (#1122).
    assert.deepEqual(uclar.find((u) => u.yol === '/arkon/son-olaylar')?.yetki, { biri: ['sayfa.arkon', 'sayfa.uretim-terminali', 'sayfa.kuyruk', 'sayfa.atolye'] });
    for (const u of okuma) assert.deepEqual(u.yetki, { biri: ['sayfa.arkon', 'sayfa.uretim-terminali', 'sayfa.kuyruk'] }, u.yol);
    const yazma = uclar.filter((u) => u.yontem === 'POST' && !u.yol.startsWith('/arkon/tmi-yansimalari'));
    assert.equal(yazma.length, 9);
    for (const u of yazma) assert.deepEqual(u.yetki, { biri: ['sayfa.arkon', 'sayfa.uretim-terminali', 'sayfa.kuyruk'] }, u.yol);
    const rol = await vt().tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('gecici_sayfasiz', 'Geçici Sayfasız') RETURNING id");
    await vt().sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'arkon.operator')", [rol?.id]);
    await girisliKisiEkle('sayfasiz1', 'gecici_sayfasiz');
    const sayfasiz = await girisCerezi('sayfasiz1');
    const ornekYol = (yol: string) => yol.replace(':depo', 'pkgs').replace(':kimlik', 'x').replace(':tur', 'events').replace(':ozet', 'c'.repeat(64)).replace(':belgeId', '1');
    for (const u of okuma) assert.equal((await istek(sayfasiz, 'GET', ornekYol(u.yol))).durum, 403, u.yol);
    for (const u of yazma) assert.equal((await istek(sayfasiz, 'POST', ornekYol(u.yol), {})).durum, 403, u.yol);
    // Karşı örnek: Arkon MES sayfası olmayan ama Üretim Terminali sayfası olan operatör okur.
    await vt().sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'sayfa.uretim-terminali')", [rol?.id]);
    const terminalci = await girisCerezi('sayfasiz1');
    assert.equal((await istek(terminalci, 'GET', '/arkon/ben')).durum, 200);
    // Sayfa kapısından geçer; bozuk satır gövde denetiminde 400 alır (sayfasız kişi aynı istekte kapıda 403 aldı).
    assert.equal((await istek(terminalci, 'POST', '/arkon/kayitlar/counts/ekle', { satirlar: [{ at: 1 }], kaynak: 'c1' })).durum, 400);
  });

  test('varsayılan rollerden Arkon rolü olan her rol üç sayfadan birini görür: yazma uçlarının sayfa koşulu kimsenin yazmasını kaldırmaz', async () => {
    const roller = await vt().sorgu<{ kod: string; sayfali: boolean }>(
      `SELECT r.kod, bool_or(ri.islem IN ('sayfa.arkon', 'sayfa.uretim-terminali', 'sayfa.kuyruk')) AS sayfali
       FROM rol r JOIN rol_islemi ri ON ri.rol_id = r.id
       GROUP BY r.id, r.kod
       HAVING bool_or(ri.islem LIKE 'arkon.%') AND r.kod <> 'gecici_sayfasiz'`);
    assert.ok(roller.length > 0, 'Arkon rollü varsayılan rol yok');
    for (const r of roller) assert.ok(r.sayfali, r.kod);
  });

  test('79: tatil ve kapalı günler TMI Vardiya takviminden Arkon\'a tarih anahtarıyla gider; Arkon\'dan yazılamaz', async () => {
    const sahip = ortam!.sahip;
    await sahip.sorgu("INSERT INTO vardiya_takvim_gunu (tarih, tur, ad) VALUES ('2031-10-29', 'tatil', 'Deneme bayramı'), ('2031-11-03', 'kapali', NULL)");
    try {
      const belge = (await istek<BelgeCevabi>(operator, 'GET', '/arkon/belgeler/kv/holidays')).govde.belge;
      const gunler = (belge?.govde as { v: Record<string, unknown> }).v;
      assert.deepEqual([gunler['2031-10-29'], gunler['2031-11-03']], [{ type: 'tatil', name: 'Deneme bayramı' }, { type: 'kapali', name: null }]);
    } finally {
      await sahip.sorgu("DELETE FROM vardiya_takvim_gunu WHERE tarih IN ('2031-10-29', '2031-11-03')");
    }
  });

  test('A7-V1: Arkon vardiyaları TMI Vardiya modülünden okunur; pasif vardiya gelmez, Arkon\'dan yazılamaz', async () => {
    const sahip = ortam!.sahip;
    const v = await sahip.tek<{ id: number }>("INSERT INTO vardiya (ad, baslangic, bitis) VALUES ('Arkon Deneme Gece', '22:00', '06:00') RETURNING id");
    await sahip.sorgu("INSERT INTO vardiya_molasi (vardiya_id, baslangic, bitis) VALUES ($1, '23:50', '00:20')", [v!.id]);
    const p = await sahip.tek<{ id: number }>("INSERT INTO vardiya (ad, baslangic, bitis, aktif) VALUES ('Arkon Deneme Pasif', '07:00', '15:00', false) RETURNING id");
    try {
      const belge = (await istek<BelgeCevabi>(operator, 'GET', '/arkon/belgeler/kv/shifts')).govde.belge;
      const liste = (belge?.govde as { v: { name: string; start: string; end: string; breaks: unknown[] }[] }).v;
      assert.deepEqual(liste.find((x) => x.name === 'Arkon Deneme Gece'), { name: 'Arkon Deneme Gece', start: '22:00', end: '06:00', breaks: [{ at: '23:50', min: 30 }] });
      assert.equal(liste.some((x) => x.name === 'Arkon Deneme Pasif'), false);
      assert.equal((await istek(yonetici, 'POST', '/arkon/belgeler/kv/shifts/yaz', { taban: belge?.surum ?? null, govde: { v: [] }, kaynak: 'c1' })).durum, 403);
    } finally {
      await sahip.sorgu('DELETE FROM vardiya WHERE id = ANY($1)', [[v!.id, p!.id]]);
    }
  });

  test('A7-K1: Arkon ölçü aletleri TMI Kalibrasyon modülünden okunur; kayıtlı Arkon aleti gelmez; Arkon\'dan yazılamaz ve silinemez', async () => {
    const sahip = ortam!.sahip;
    const tur = await sahip.tek<{ id: number }>("SELECT id FROM olcu_aleti_turu WHERE ad = 'Kumpas'");
    const alet = await sahip.tek<{ id: number }>("INSERT INTO olcu_aleti (no, tur_id, yer, periyot_gun) VALUES ('ARK-DNM-K1', $1, 'Dolap', 90) RETURNING id", [tur!.id]);
    await sahip.sorgu("INSERT INTO kalibrasyon_kaydi (alet_id, tarih, kisi_id, sonuc, sertifika_no) VALUES ($1, '2026-03-10', $2, 'uygun', 'S-9')", [alet!.id, operatorId]);
    await sahip.sorgu("INSERT INTO arkon_belge (depo, kimlik, govde, surum, degistiren_id) VALUES ('gauges', 'eski-arkon', '{\"no\":\"ESKI\"}', 1, $1)", [operatorId]);
    const kimlik = `tmi-alet-${alet!.id}`;
    const liste = (await istek<BelgelerCevabi>(yonetici, 'GET', '/arkon/belgeler/gauges')).govde.belgeler;
    assert.equal(liste.some((b) => b.kimlik === 'eski-arkon'), false);
    const ogle = Date.UTC(2026, 2, 10, 9, 0, 0);
    assert.deepEqual(liste.find((b) => b.kimlik === kimlik)?.govde, {
      id: kimlik, no: 'ARK-DNM-K1', type: 'Kumpas', loc: 'Dolap', interval: 90, last: ogle, status: 'ok',
      cals: [{ at: ogle, by: 'Deneme operator1', res: 'ok', cert: 'S-9' }],
    });
    const tek = (await istek<BelgeCevabi>(yonetici, 'GET', `/arkon/belgeler/gauges/${kimlik}`)).govde.belge;
    assert.equal((tek?.govde as { no: string }).no, 'ARK-DNM-K1');
    const yaz = await istek(yonetici, 'POST', `/arkon/belgeler/gauges/${kimlik}/yaz`, { taban: tek?.surum ?? null, govde: { no: 'X', cals: [] }, kaynak: 'c1' });
    assert.equal(yaz.durum, 403);
    assert.equal((await istek(yonetici, 'POST', `/arkon/belgeler/gauges/${kimlik}/sil`, { kaynak: 'c1' })).durum, 403);
  });

  test('tesis, iş merkezi kısıtı TMI\'den okunur; TMI ayarı Arkon\'dan yazılamaz, yönetici ayarını yalnız Arkon yöneticisi yazar', async () => {
    const t = await istasyonKur();
    const plant = await istek<BelgeCevabi>(operator, 'GET', '/arkon/belgeler/kv/plant');
    const tesis = (plant.govde.belge?.govde as { v: { wcs: { id: string }[]; sts: unknown[]; mcs: unknown[] } }).v;
    assert.ok(tesis.wcs.some((w) => w.id === t.merkez));
    assert.ok(tesis.sts.some((s) => JSON.stringify(s) === JSON.stringify({ id: t.istasyon, name: 'Arkon İstasyonu', wc: t.merkez, t: 'kalite', active: true })));
    assert.ok(tesis.mcs.some((m) => (m as { id: string; st: string; conn: string }).id === t.makine && (m as { st: string }).st === t.istasyon && (m as { conn: string }).conn === 'mtc'));
    // Aynı içerik aynı sürümü verir: istemci gereksiz yere yeniden çizmez.
    assert.equal((await istek<BelgeCevabi>(operator, 'GET', '/arkon/belgeler/kv/plant')).govde.belge?.surum, plant.govde.belge?.surum);

    const tmi = await istek(yonetici, 'POST', '/arkon/belgeler/kv/plant/yaz', { taban: null, govde: { v: {} }, kaynak: 'c1' });
    assert.equal(tmi.durum, 403);
    assert.equal((await istek(operator, 'POST', '/arkon/belgeler/kv/perms/yaz', { taban: null, govde: { v: {} }, kaynak: 'c1' })).durum, 403);
    assert.equal((await istek(yonetici, 'POST', '/arkon/belgeler/kv/perms/yaz', { taban: null, govde: { v: { operator: [] } }, kaynak: 'c1' })).durum, 403);

    const im = await vt().tek<{ id: number }>('SELECT id FROM is_merkezi WHERE kod = $1', [t.merkez]);
    const belirle = await istek(yonetici, 'POST', `/kisi-is-merkezleri/${operatorId}/belirle`, { isMerkeziIdleri: [im?.id] });
    assert.equal(belirle.durum, 200, JSON.stringify(belirle.govde));
    assert.deepEqual((await istek<ArkonBenCevabi>(operator, 'GET', '/arkon/ben')).govde.kisi.isMerkezleri, [t.merkez]);
    await istek(yonetici, 'POST', `/kisi-is-merkezleri/${operatorId}/belirle`, { isMerkeziIdleri: [] });
  });

  test('ileti yoklaması (118 a): denetim kısa süre önbellekten geçer; rol alınınca yoklama da yazma da hemen 403', async () => {
    const id = await girisliKisiEkle('yoklama1', 'gecici_arkon');
    const cerez = await girisCerezi('yoklama1');
    const ilk = await istek<IletilerCevabi>(cerez, 'GET', '/arkon/iletiler?kaynak=y1');
    assert.equal(ilk.durum, 200);
    assert.equal((await istek(cerez, 'GET', `/arkon/iletiler?kaynak=y1&son=${ilk.govde.son}`)).durum, 200);
    const rol = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'gecici_arkon'");
    const baska = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'satin_alma'");
    await vt().tx(async (db) => {
      await rolAta(db, yoneticiId, id, baska?.id ?? 0);
      await rolAl(db, yoneticiId, id, rol?.id ?? 0);
    });
    assert.equal((await istek(cerez, 'GET', `/arkon/iletiler?kaynak=y1&son=${ilk.govde.son}`)).durum, 403);
    assert.equal((await istek(cerez, 'POST', '/arkon/iletiler', { ileti: { type: 'call', no: 'UE-9' }, kaynak: 'y1' })).durum, 403);
  });

  test('belge: yazılır ve olduğu gibi okunur; eski sürümle yazım çakışma döner ve yazmaz; silinir; değişiklik iletisi öteki cihaza gider', async () => {
    const ilk = await istek<IletilerCevabi>(operator, 'GET', '/arkon/iletiler?kaynak=c2');
    assert.deepEqual(ilk.govde.iletiler, []);
    const govde = { id: 'r1', state: 'running', good: 3, meas: { 1: { v: 40.01, ok: true, by: 'Deneme operator1' } }, blob: { $blob: 'a'.repeat(64), t: 'u8', n: 9 } };
    const y1 = await istek<BelgeYazCevabi>(operator, 'POST', '/arkon/belgeler/results/r1/yaz', { taban: null, govde, kaynak: 'c1' });
    assert.equal(y1.durum, 200, JSON.stringify(y1.govde));
    assert.equal(y1.govde.sonuc, 'yazildi');
    const s1 = y1.govde.sonuc === 'yazildi' ? y1.govde.surum : 0;
    const okunan = await istek<BelgeCevabi>(yonetici, 'GET', '/arkon/belgeler/results/r1');
    assert.deepEqual(okunan.govde.belge, { surum: s1, govde });

    const y2 = await istek<BelgeYazCevabi>(yonetici, 'POST', '/arkon/belgeler/results/r1/yaz', { taban: s1, govde: { ...govde, good: 4 }, kaynak: 'c2' });
    assert.equal(y2.govde.sonuc, 'yazildi');
    const s2 = y2.govde.sonuc === 'yazildi' ? y2.govde.surum : 0;
    assert.ok(s2 > s1);
    const eski = await istek<BelgeYazCevabi>(operator, 'POST', '/arkon/belgeler/results/r1/yaz', { taban: s1, govde: { ...govde, good: 9 }, kaynak: 'c1' });
    assert.deepEqual(eski.govde, { sonuc: 'cakisma', guncel: { surum: s2, govde: { ...govde, good: 4 } } });
    assert.equal(((await istek<BelgeCevabi>(operator, 'GET', '/arkon/belgeler/results/r1')).govde.belge?.govde as { good: number }).good, 4);

    const iletiler = await istek<IletilerCevabi>(operator, 'GET', `/arkon/iletiler?kaynak=c2&son=${ilk.govde.son}`);
    assert.deepEqual(iletiler.govde.iletiler, [{ type: '$db', store: 'results', id: 'r1' }]);
    assert.deepEqual((await istek<IletilerCevabi>(operator, 'GET', `/arkon/iletiler?kaynak=c1&son=${ilk.govde.son}`)).govde.iletiler,
      [{ type: '$db', store: 'results', id: 'r1' }]);

    assert.equal((await istek(operator, 'POST', '/arkon/belgeler/results/r1/sil', { kaynak: 'c1', taban: s2 })).durum, 403);
    assert.equal((await istek(yonetici, 'POST', '/arkon/belgeler/results/r1/sil', { kaynak: 'c1', taban: s2 })).durum, 200);
    assert.equal((await istek<BelgeCevabi>(operator, 'GET', '/arkon/belgeler/results/r1')).govde.belge, null);
    assert.equal((await istek(operator, 'POST', '/arkon/belgeler/results/r2/yaz', { taban: null, kaynak: 'c1' })).durum, 400);
  });

  test('TMI\'deki açık emir Hazırlık\'ta taslak paket görünür; paket kaydedilince kayıtlı belge geçerlidir', async () => {
    const t = await istasyonKur();
    const emir = await istek<{ emir: { id: number; emirNo: string } }>(yonetici, 'POST', '/uretim-emirleri', {
      parcaNo: 'DENEME-1', parcaAd: 'Deneme parçası', adet: 25, istasyonId: t.istasyonId, projeId,
    });
    assert.equal(emir.durum, 200, JSON.stringify(emir.govde));
    const kimlik = `tmi-ue-${emir.govde.emir.id}`;
    const liste = (await istek<BelgelerCevabi>(operator, 'GET', '/arkon/belgeler/pkgs')).govde.belgeler;
    const taslak = liste.find((b) => b.kimlik === kimlik)?.govde as Record<string, unknown> | undefined;
    assert.ok(taslak);
    assert.equal(taslak['no'], emir.govde.emir.emirNo);
    assert.equal(taslak['machine'], t.istasyon);
    assert.equal(taslak['opType'], 'kalite');
    assert.equal(taslak['target'], 25);
    assert.equal(taslak['status'], 'draft');
    assert.equal(taslak['malzemeNo'], null);
    assert.ok((await istek<BelgeCevabi>(operator, 'GET', `/arkon/belgeler/pkgs/${kimlik}`)).govde.belge);

    await istek(yonetici, 'POST', `/arkon/belgeler/pkgs/${kimlik}/yaz`, { taban: null, govde: { ...taslak, status: 'published', steps: [{ id: 's1' }] }, kaynak: 'c1' });
    const sonra = (await istek<BelgelerCevabi>(operator, 'GET', '/arkon/belgeler/pkgs')).govde.belgeler.filter((b) => b.kimlik === kimlik);
    assert.equal(sonra.length, 1);
    assert.equal((sonra[0]?.govde as { status: string }).status, 'published');
  });

  // Adım 1 (kart #199): rotalı emrin paketi iş emri başınadır (`tmi-ie`, yansima.test.ts); emir başına `tmi-ue` taslağı yalnız rotasız emirdedir.
  test('malzeme kartlı (rotalı) emrin emir başına taslak paketi yoktur; tek okuma da null döner', async () => {
    const t = await istasyonKur();
    const emir = await istek<{ emir: { id: number } }>(yonetici, 'POST', '/uretim-emirleri', {
      parcaNo: 'DENEME-MN', parcaAd: 'Deneme parçası', adet: 5, istasyonId: t.istasyonId, projeId,
    });
    assert.equal(emir.durum, 200, JSON.stringify(emir.govde));
    // Fikstür: malzemeler kartı ve emrin ürün bağı sahip bağlantısıyla yazılır (iş emirli açma komutu rota ister).
    const sahip = ortam!.sahip;
    await sahip.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT (onek) DO NOTHING', ['ARK-DNM-']);
    const kart = await sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('ark-dnm-1', 'mamul', 'ARK-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'ark-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId],
    );
    // Gerçek revizyon (emrin rota revizyonu bağı yabancı anahtar olunca da geçerli); iptal durumu tekil dizine takılmaz.
    const rev = (await sahip.tek<{ id: number }>(
      `INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme)
       VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id`, [kart!.no, yoneticiId]))!.id;
    await sahip.sorgu('UPDATE uretim_emri SET malzeme_no = $1, kaynak_rota_revizyonu_id = $2 WHERE id = $3', [kart!.no, rev, emir.govde.emir.id]);
    const kimlik = `tmi-ue-${emir.govde.emir.id}`;
    const liste = (await istek<BelgelerCevabi>(operator, 'GET', '/arkon/belgeler/pkgs')).govde.belgeler;
    assert.ok(!liste.some((b) => b.kimlik === kimlik));
    assert.equal((await istek<BelgeCevabi>(operator, 'GET', `/arkon/belgeler/pkgs/${kimlik}`)).govde.belge, null);
  });

  test('kart #156 refakat kartları: terminal istasyonu ve emirlerle kartları okur; iptal kart yok; bilinmeyen istasyon 404, rolsüz ve kapsam dışı 403, bozuk sorgu 400', async () => {
    const t = await istasyonKur();
    const emir = await istek<{ emir: { id: number; emirNo: string } }>(yonetici, 'POST', '/uretim-emirleri', {
      parcaNo: 'DENEME-RP', parcaAd: 'Deneme parçası', adet: 5, istasyonId: t.istasyonId, projeId,
    });
    assert.equal(emir.durum, 200, JSON.stringify(emir.govde));
    const sahip = ortam!.sahip;
    await sahip.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT (onek) DO NOTHING', ['ARK-DNM-']);
    const hm = (await sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('ark-dnm-rp', 'hammadde', 'ARK-DNM-', 90, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'ark-dnm-rp', com: { ad: 'Deneme çubuk' } }), yoneticiId]))!.no;
    const lot = (await sahip.tek<{ id: number }>("INSERT INTO stok_parti (malzeme_id, acan_kisi_id, lot_no) VALUES ($1, $2, 'LT-ARK-RP') RETURNING id", [hm, yoneticiId]))!.id;
    const kart = (await sahip.tek<{ id: number }>(
      'INSERT INTO stok_refakat_partisi (uretim_emri_id, sira, malzeme_id, parti_id, acan_kisi_id) VALUES ($1, 1, $2, $3, $4) RETURNING id',
      [emir.govde.emir.id, hm, lot, yoneticiId]))!.id;
    const iptal = (await sahip.tek<{ id: number }>(
      `INSERT INTO stok_refakat_partisi (uretim_emri_id, sira, malzeme_id, parti_id, acan_kisi_id, durum, iptal_eden_kisi_id, iptal_zamani)
       VALUES ($1, 2, $2, $3, $4, 'iptal', $4, now()) RETURNING id`,
      [emir.govde.emir.id, hm, lot, yoneticiId]))!.id;
    const yol = `/arkon/refakat-kartlari?istasyon=${encodeURIComponent(t.istasyon)}&emirler=${emir.govde.emir.id},999999999`;
    const c = await istek<RefakatKartlariCevabi>(operator, 'GET', yol);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.deepEqual(c.govde.kartlar.map((k) => [k.id, k.uretimEmriId, k.etiket, k.lotNo]), [[kart, emir.govde.emir.id, `${emir.govde.emir.emirNo}-P1`, 'LT-ARK-RP']]);
    assert.ok(!c.govde.kartlar.some((k) => k.id === iptal), 'iptal kart listelenmez');
    assert.equal((await istek(operator, 'GET', `/arkon/refakat-kartlari?istasyon=YOK-ISTASYON&emirler=${emir.govde.emir.id}`)).durum, 404);
    assert.equal((await istek(rolsuz, 'GET', yol)).durum, 403);
    assert.equal((await istek(null, 'GET', yol)).durum, 401);
    for (const bozuk of ['', '0', '1,,2', 'a', Array.from({ length: 51 }, (_, i) => i + 1).join(',')]) {
      assert.equal((await istek(operator, 'GET', `/arkon/refakat-kartlari?istasyon=${encodeURIComponent(t.istasyon)}&emirler=${bozuk}`)).durum, 400, bozuk);
    }
    const disariAdi = kod('rpk');
    const disariId = await girisliKisiEkle(disariAdi, 'gecici_arkon');
    const baska = await istasyonKur();
    const baskaMerkez = (await sahip.tek<{ id: number }>('SELECT is_merkezi_id AS id FROM istasyon WHERE id = $1', [baska.istasyonId]))!.id;
    await sahip.sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2)', [disariId, baskaMerkez]);
    assert.equal((await istek(await girisCerezi(disariAdi), 'GET', yol)).durum, 403, 'kapsam dışındaki istasyonun kartları okunmaz');
  });

  test('malzeme isteği stokta açılır: kart ve miktar zorunlu, yetkiyi stok denetler, durumu stoktan okunur, sonra Arkon\'dan değişmez', async () => {
    const t = await istasyonKur();
    const sahip = ortam!.sahip;
    await sahip.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT (onek) DO NOTHING', ['ARK-DNM-']);
    const kart = await sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('ark-dnm-2', 'sarf', 'ARK-DNM-', 2, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'ark-dnm-2', com: { ad: 'Deneme kesme sıvısı' } }), yoneticiId],
    );
    const malzemeId = kart!.no;
    const secici = await istek<{ malzemeler: { id: number; kod: string }[] }>(operator, 'GET', '/arkon/malzemeler?ara=ARK-DNM');
    assert.equal(secici.durum, 200, JSON.stringify(secici.govde));
    assert.ok(secici.govde.malzemeler.some((m) => m.id === malzemeId));
    assert.equal((await istek(rolsuz, 'GET', '/arkon/malzemeler')).durum, 403);

    const yaz = (kimlik: string, govde: Record<string, unknown>, taban: number | null = null) =>
      istek<BelgeYazCevabi>(operator, 'POST', `/arkon/belgeler/logi/${kimlik}/yaz`, { taban, govde, kaynak: 'c1' });
    const istekGovdesi = { id: 'lg-s1', kind: 'req', st: t.istasyon, item: 'ARK', malzemeId, qty: 4, note: 'acil', status: 'open', stokIstek: { id: 999, no: 'sahte' } };
    assert.equal((await yaz('lg-s0', { ...istekGovdesi, malzemeId: undefined })).durum, 400);
    assert.equal((await yaz('lg-s0', { ...istekGovdesi, qty: 0 })).durum, 400);
    // Stok, emri yürüten üretim işlemini ister: Arkon rolü yetmez ve Arkon belgesi de yazılmaz.
    assert.equal((await yaz('lg-s1', istekGovdesi)).durum, 403);
    assert.equal((await istek<BelgeCevabi>(operator, 'GET', '/arkon/belgeler/logi/lg-s1')).govde.belge, null);

    const rol = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'gecici_arkon'");
    await vt().sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'terminal.uret')", [rol?.id]);
    try {
      const yazilan = await yaz('lg-s1', istekGovdesi);
      assert.equal(yazilan.durum, 200, JSON.stringify(yazilan.govde));
      const stokta = await sahip.tek<{ no: string; miktar: string; istasyon_id: number; aciklama: string }>(
        "SELECT no, miktar::text AS miktar, istasyon_id, aciklama FROM stok_malzeme_istegi WHERE kaynak_kimligi = 'arkon:logi:lg-s1'",
      );
      assert.deepEqual({ ...stokta }, { no: stokta?.no, miktar: '4.000', istasyon_id: t.istasyonId, aciklama: 'acil' });
      const oku = async () => (await istek<BelgeCevabi>(operator, 'GET', '/arkon/belgeler/logi/lg-s1')).govde.belge;
      const ilk = await oku();
      assert.deepEqual((ilk?.govde as Record<string, unknown>)['stokIstek'], { id: (ilk?.govde as { stokIstek: { id: number } }).stokIstek.id, no: stokta?.no });
      assert.equal((ilk?.govde as Record<string, unknown>)['status'], 'open');

      await sahip.sorgu("UPDATE stok_malzeme_istegi SET durum = 'hazirlaniyor' WHERE kaynak_kimligi = 'arkon:logi:lg-s1'");
      const liste = (await istek<BelgelerCevabi>(operator, 'GET', '/arkon/belgeler/logi')).govde.belgeler.find((b) => b.kimlik === 'lg-s1');
      assert.equal((liste?.govde as Record<string, unknown>)['status'], 'prep');
      assert.equal(((await oku())?.govde as Record<string, unknown>)['status'], 'prep');

      // Stoka bağlı istek Arkon'dan değişmez ve silinmez.
      assert.equal((await yaz('lg-s1', { ...istekGovdesi, status: 'done' }, ilk?.surum ?? null)).durum, 403);
      assert.equal((await istek(yonetici, 'POST', '/arkon/belgeler/logi/lg-s1/sil', { kaynak: 'c1', taban: ilk?.surum })).durum, 403);
      assert.equal(await sahip.tek("SELECT 1 FROM stok_malzeme_istegi WHERE kaynak_kimligi = 'arkon:logi:lg-s1' AND durum = 'hazirlaniyor'") !== null, true);
    } finally {
      await vt().sorgu("DELETE FROM rol_islemi WHERE rol_id = $1 AND islem = 'terminal.uret'", [rol?.id]);
    }
  });

  test('hazırlıkta yazılan iyi parça sayımı 400 ile reddedilir ve kayda girmez', async () => {
    const satir = { cid: 'hz1', at: Date.now(), machine: 'TZG-04', wc: 'TAL', orderNo: 'UE-HZ', kind: 'good', delta: 1, state: 'setup' };
    const red = await istek<{ hata: { alan?: string } }>(operator, 'POST', '/arkon/kayitlar/counts/ekle', { satirlar: [satir], kaynak: 'hz' });
    assert.equal(red.durum, 400, JSON.stringify(red.govde));
    const okunan = (await istek<KayitlarCevabi>(yonetici, 'GET', '/arkon/kayitlar/counts?makine=TZG-04')).govde.satirlar;
    assert.equal(JSON.stringify(okunan).includes('hz1'), false);
  });

  test('kayıtlar yalnız eklenir: aynı cid ikinci kez yazılmaz, kişi TMI oturumundan yazılır, süzgeçler çalışır', async () => {
    const satir = { cid: 'k1', at: Date.parse('2001-10-07T08:00:00Z'), machine: 'TZG-04', wc: 'TAL', orderNo: 'UE-1', kind: 'good', delta: 1, userName: 'sahte' };
    const once = Date.now();
    assert.equal((await istek<{ eklenen: number }>(operator, 'POST', '/arkon/kayitlar/counts/ekle', { satirlar: [satir], kaynak: 'c1' })).govde.eklenen, 1);
    assert.equal((await istek<{ eklenen: number }>(operator, 'POST', '/arkon/kayitlar/counts/ekle', { satirlar: [satir], kaynak: 'c1' })).govde.eklenen, 0);
    await istek(operator, 'POST', '/arkon/kayitlar/counts/ekle', { satirlar: [{ ...satir, cid: 'k2', machine: 'FRZ-11' }], kaynak: 'c1' });
    const okunan = (await istek<KayitlarCevabi>(yonetici, 'GET', '/arkon/kayitlar/counts?makine=TZG-04')).govde.satirlar;
    // Zaman ve kişi sunucudandır: istemcinin at değeri istemciZamani'nda kalır, sahte userName yerine oturumdaki kişi yazılır.
    const { at, ...gerisi } = okunan[0] ?? {};
    assert.ok(Number(at) >= once && Number(at) <= Date.now());
    const { at: _istemci, ...beklenen } = satir;
    assert.deepEqual(gerisi, { ...beklenen, istemciZamani: satir.at, userId: String(operatorId), userName: 'Deneme operator1' });
    assert.equal((await istek<KayitlarCevabi>(yonetici, 'GET', `/arkon/kayitlar/counts?baslangic=${Date.now() + 1000}`)).govde.satirlar.length, 0);
    // Sınıra ulaşan liste kesildiğini söyler (en yeniler döner); sınırın altındaki söylemez.
    const kesik = (await istek<KayitlarCevabi>(yonetici, 'GET', '/arkon/kayitlar/counts?sinir=1')).govde;
    assert.deepEqual([kesik.satirlar.map((s) => s['cid']), kesik.kesildi], [['k2'], true]);
    assert.equal((await istek<KayitlarCevabi>(yonetici, 'GET', '/arkon/kayitlar/counts?sinir=3')).govde.kesildi, undefined);
    await istek(operator, 'POST', '/arkon/kayitlar/meas/ekle', {
      satirlar: [{ cid: 'm1', pkgId: 'p1', itemId: 4, value: 40.01, ok: true }, { cid: 'm2', pkgId: 'p1', itemId: 7, value: 90, ok: true }], kaynak: 'c1',
    });
    assert.equal((await istek<KayitlarCevabi>(yonetici, 'GET', '/arkon/kayitlar/meas?paketId=p1&madde=4')).govde.satirlar.length, 1);
    assert.equal((await istek(operator, 'POST', '/arkon/kayitlar/counts/ekle', { satirlar: [{ at: 1 }], kaynak: 'c1' })).durum, 400);
    await assert.rejects(vt().sorgu("UPDATE arkon_kayit SET emir_no = 'X'"));
  });

  test('dosya parça parça yüklenir, özetle doğrulanır ve aynen okunur; özeti tutmayan reddedilir', async () => {
    const icerik = Buffer.from('ISO-10303-21; deneme modeli '.repeat(40));
    const ozet = createHash('sha256').update(icerik).digest('hex');
    const eksik = await istek<EksikDosyaCevabi>(operator, 'POST', '/arkon/dosyalar/eksikler', { ozetler: [ozet] });
    assert.deepEqual(eksik.govde.eksikler, [ozet]);
    const yari = Math.floor(icerik.length / 2);
    const p1 = await istek<{ tamam: boolean }>(operator, 'POST', `/arkon/dosyalar/${ozet}/parca`, { sira: 0, toplam: 2, veri: icerik.subarray(0, yari).toString('base64') });
    assert.deepEqual(p1.govde, { tamam: false });
    assert.equal((await istek(operator, 'GET', `/arkon/dosyalar/${ozet}`)).durum, 404);
    const p2 = await istek<{ tamam: boolean }>(operator, 'POST', `/arkon/dosyalar/${ozet}/parca`, { sira: 1, toplam: 2, veri: icerik.subarray(yari).toString('base64') });
    assert.deepEqual(p2.govde, { tamam: true });
    // Yükleyen okur; dosyayı anan belge yokken başkası okuyamaz (yok sayılır). Belge anınca o belgeyi okuyabilen okur.
    const okunan = await indir(operator, ozet);
    assert.equal(okunan.durum, 200);
    assert.equal(okunan.icerik.equals(icerik), true);
    assert.equal((await indir(yonetici, ozet)).durum, 404);
    await vt().sorgu(
      "INSERT INTO arkon_belge (depo, kimlik, govde, surum, degistiren_id) VALUES ('draws', 'dosya-anan', $1, 1, $2)",
      [JSON.stringify({ id: 'dosya-anan', sayfalar: [{ ek: { $blob: ozet, t: 'u8', n: icerik.length } }] }), operatorId],
    );
    assert.equal((await indir(yonetici, ozet)).icerik.equals(icerik), true);
    assert.equal((await indir(rolsuz, ozet)).durum, 403);
    assert.deepEqual((await istek<EksikDosyaCevabi>(operator, 'POST', '/arkon/dosyalar/eksikler', { ozetler: [ozet] })).govde.eksikler, []);

    // Dosya içeriği denetim kaydına girmez: iki parçanın satırı vardır, gövde yerine yalnız özet taşır.
    const denetim = await vt().sorgu<{ govde: Record<string, unknown>; bayt: number }>(
      "SELECT govde, pg_column_size(d.*)::int AS bayt FROM denetim_kaydi d WHERE yol = '/arkon/dosyalar/:ozet/parca' AND parametre->>'ozet' = $1", [ozet],
    );
    assert.deepEqual(denetim.map((d) => [Object.keys(d.govde), d.bayt < 400]), [[['_ozet'], true], [['_ozet'], true]]);

    const yanlis = await istek(operator, 'POST', `/arkon/dosyalar/${'b'.repeat(64)}/parca`, { sira: 0, toplam: 1, veri: icerik.toString('base64') });
    assert.equal(yanlis.durum, 400);
    assert.equal(hataKodu(yanlis), 'DOGRULAMA');
  });

  describe('Çizim Merkezi\'nden dosya alma (kart #800)', () => {
    interface MerkezBelgesi { id: number; surum: number; revizyonlar: { id: number; harf: string }[] }
    const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex');
    const pdf = (not: string): Buffer => Buffer.from(`%PDF-1.4\n% ${not}\n%%EOF\n`);
    const step = (not: string): Buffer => Buffer.from(`ISO-10303-21;\nHEADER;\n/* ${not} */\nENDSEC;\nEND-ISO-10303-21;\n`);
    const png = (not: string): Buffer => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(not)]);

    async function merkez<T>(yol: string, govde: unknown): Promise<T> {
      const c = await app.inject({ method: 'POST', url: `/api${yol}`, payload: govde as object, headers: { cookie: yonetici, [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } });
      assert.equal(c.statusCode, 200, c.body);
      return c.json() as T;
    }
    async function merkezDosyasi(icerik: Buffer): Promise<string> {
      const o = sha(icerik);
      await merkez(`/dosyalar/${o}/parca`, { sira: 0, toplam: 1, veri: icerik.toString('base64') });
      return o;
    }
    async function belgeAc(ad: string, icerik: Buffer, dosyaAdi: string, yayinla: boolean, tur = 'teknik-resim'): Promise<number> {
      const b = await merkez<MerkezBelgesi>('/cizimler', { ad, tur, ozet: await merkezDosyasi(icerik), dosyaAdi });
      if (yayinla) await merkez(`/cizimler/${b.id}/revizyonlar/${b.revizyonlar[0]?.id}/yayinla`, { surum: b.surum });
      return b.id;
    }
    async function revizyonYayinla(belgeId: number, icerik: Buffer, dosyaAdi: string): Promise<void> {
      const b = (await istek<MerkezBelgesi>(yonetici, 'GET', `/cizimler/${belgeId}`)).govde;
      const r = await merkez<MerkezBelgesi>(`/cizimler/${belgeId}/revizyon-ekle`, { ozet: await merkezDosyasi(icerik), dosyaAdi, surum: b.surum });
      const yeni = r.revizyonlar.find((x) => x.harf === 'B');
      await merkez(`/cizimler/${belgeId}/revizyonlar/${yeni?.id}/yayinla`, { surum: r.surum });
    }
    const liste = async (cerez = yonetici): Promise<MerkezBelgelerCevabi['belgeler']> =>
      (await istek<MerkezBelgelerCevabi>(cerez, 'GET', '/arkon/cizim-merkezi/belgeler')).govde.belgeler;
    const kontrol = async (belgeId: number, ozet: string): Promise<MerkezKontrolCevabi['durumlar']> =>
      (await istek<MerkezKontrolCevabi>(yonetici, 'GET', `/arkon/cizim-merkezi/kontrol?dosyalar=${belgeId}:${ozet}`)).govde.durumlar;

    test('liste yalnız yayındaki ve Arkon\'un okuyabildiği belgeleri verir; ekleme dosyayı Arkon deposuna ve paket kaydına bağlı olarak alır', async () => {
      const yayinda = pdf('yayinda-a');
      const stepDosya = step('model-a');
      const pdfId = await belgeAc('Merkez Flans', yayinda, 'flans.pdf', true);
      const modelId = await belgeAc('Merkez Mil', stepDosya, 'mil.step', true, '3b-model');
      const taslakId = await belgeAc('Merkez Taslak', pdf('taslak-a'), 'taslak.pdf', false);
      const resimId = await belgeAc('Merkez Resim', png('resim-a'), 'resim.png', true, 'diger');
      const arsivId = await belgeAc('Merkez Arsiv', pdf('arsiv-a'), 'arsiv.pdf', true);
      const arsiv = (await istek<MerkezBelgesi>(yonetici, 'GET', `/cizimler/${arsivId}`)).govde;
      await merkez(`/cizimler/${arsivId}/arsivle`, { surum: arsiv.surum });

      const gorunen = await liste();
      const ids = gorunen.map((b) => b.id);
      assert.ok(ids.includes(pdfId) && ids.includes(modelId), 'yayındaki PDF ve model listede');
      for (const yok of [taslakId, resimId, arsivId]) assert.equal(ids.includes(yok), false, `listede olmamalı: ${yok}`);
      assert.deepEqual(gorunen.find((b) => b.id === pdfId), { id: pdfId, ad: 'Merkez Flans', tur: 'teknik-resim', harf: 'A', tip: 'pdf', dosyaAdi: 'Merkez Flans.pdf', ozet: sha(yayinda) });
      assert.deepEqual([gorunen.find((b) => b.id === modelId)?.tip, gorunen.find((b) => b.id === modelId)?.dosyaAdi], ['model', 'Merkez Mil.step']);

      const once = (await istek(yonetici, 'GET', '/cizimler')).govde;
      const ekle = await istek<MerkezEkleCevabi>(yonetici, 'POST', `/arkon/cizim-merkezi/belgeler/${pdfId}/ekle`);
      assert.equal(ekle.durum, 200, JSON.stringify(ekle.govde));
      assert.deepEqual(ekle.govde, {
        ozet: sha(yayinda), boyut: yayinda.length, kayit: { kind: 'pdf', name: 'Merkez Flans.pdf', merkez: pdfId, merkezOzet: sha(yayinda) },
      });
      assert.equal((await indir(yonetici, sha(yayinda))).icerik.equals(yayinda), true, 'Arkon deposundaki içerik merkezdekiyle aynı');
      // Aynı dosya ikinci kez alınınca depoda tek kayıt kalır.
      assert.equal((await istek(yonetici, 'POST', `/arkon/cizim-merkezi/belgeler/${pdfId}/ekle`)).durum, 200);
      assert.equal((await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM arkon_dosya WHERE ozet = $1', [sha(yayinda)]))?.n, 1);
      const modelEkle = await istek<MerkezEkleCevabi>(yonetici, 'POST', `/arkon/cizim-merkezi/belgeler/${modelId}/ekle`);
      assert.equal(modelEkle.govde.kayit.kind, 'model');
      // Arkon'dan yüklenen dosya merkeze gitmez: merkez belge listesi değişmez.
      const arkonDosyasi = pdf('arkon-yerel');
      const ozet = sha(arkonDosyasi);
      assert.equal((await istek(yonetici, 'POST', `/arkon/dosyalar/${ozet}/parca`, { sira: 0, toplam: 1, veri: arkonDosyasi.toString('base64') })).durum, 200);
      assert.deepEqual((await istek(yonetici, 'GET', '/cizimler')).govde, once);
      assert.equal((await liste()).some((b) => b.ozet === ozet), false);
    });

    test('taslak, arşivdeki ve resim belgesi eklenemez; paket düzenleme rolü olmayan listeyi göremez ve ekleyemez', async () => {
      const taslak = await belgeAc('Eklenemez Taslak', pdf('taslak-b'), 'taslak.pdf', false);
      const resim = await belgeAc('Eklenemez Resim', png('resim-b'), 'resim.png', true, 'diger');
      const arsiv = await belgeAc('Eklenemez Arsiv', pdf('arsiv-b'), 'arsiv.pdf', true);
      const b = (await istek<MerkezBelgesi>(yonetici, 'GET', `/cizimler/${arsiv}`)).govde;
      await merkez(`/cizimler/${arsiv}/arsivle`, { surum: b.surum });
      for (const id of [taslak, arsiv]) {
        const c = await istek(yonetici, 'POST', `/arkon/cizim-merkezi/belgeler/${id}/ekle`);
        assert.equal(c.durum, 404, `${id}: ${JSON.stringify(c.govde)}`);
      }
      const r = await istek(yonetici, 'POST', `/arkon/cizim-merkezi/belgeler/${resim}/ekle`);
      assert.equal(r.durum, 422, JSON.stringify(r.govde));
      assert.equal((await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM arkon_dosya WHERE ozet = $1', [sha(png('resim-b'))]))?.n, 0);

      const acik = await belgeAc('Rol Denemesi', pdf('rol'), 'rol.pdf', true);
      // Operatör Arkon rolüdür ama paket düzenlemez; rolsüz kişi Arkon'a hiç giremez.
      assert.equal((await istek(operator, 'GET', '/arkon/cizim-merkezi/belgeler')).durum, 403);
      assert.equal((await istek(operator, 'POST', `/arkon/cizim-merkezi/belgeler/${acik}/ekle`)).durum, 403);
      assert.equal((await istek(rolsuz, 'GET', '/arkon/cizim-merkezi/belgeler')).durum, 403);
      assert.equal((await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM arkon_dosya WHERE ozet = $1', [sha(pdf('rol'))]))?.n, 0);
    });

    test('merkezde yeni revizyon yayınlanınca kontrol "yeni-revizyon" der; yeniden alınca aynı kayıt güncel olur; yayından kalkan belge ayrı bildirilir', async () => {
      const a = pdf('rev-a');
      const b = pdf('rev-b');
      const id = await belgeAc('Revizyonlu', a, 'rev.pdf', true);
      const kayit = (await istek<MerkezEkleCevabi>(yonetici, 'POST', `/arkon/cizim-merkezi/belgeler/${id}/ekle`)).govde.kayit;
      assert.deepEqual(await kontrol(id, kayit.merkezOzet), [{ belgeId: id, durum: 'guncel', ozet: sha(a) }]);

      await revizyonYayinla(id, b, 'rev-b.pdf');
      assert.deepEqual(await kontrol(id, kayit.merkezOzet), [{ belgeId: id, durum: 'yeni-revizyon', ozet: sha(b) }]);
      assert.equal((await liste()).find((x) => x.id === id)?.harf, 'B');

      const yeni = (await istek<MerkezEkleCevabi>(yonetici, 'POST', `/arkon/cizim-merkezi/belgeler/${id}/ekle`)).govde;
      assert.deepEqual(yeni.kayit, { kind: 'pdf', name: 'Revizyonlu.pdf', merkez: id, merkezOzet: sha(b) });
      assert.deepEqual(await kontrol(id, yeni.kayit.merkezOzet), [{ belgeId: id, durum: 'guncel', ozet: sha(b) }]);
      assert.equal((await indir(yonetici, sha(b))).icerik.equals(b), true);

      const belge = (await istek<MerkezBelgesi>(yonetici, 'GET', `/cizimler/${id}`)).govde;
      await merkez(`/cizimler/${id}/arsivle`, { surum: belge.surum });
      assert.deepEqual(await kontrol(id, sha(b)), [{ belgeId: id, durum: 'yayindan-kalkti', ozet: null }]);
      assert.equal((await istek(yonetici, 'GET', '/arkon/cizim-merkezi/kontrol?dosyalar=abc')).durum, 400);
    });

    test('denetim #34: paketteki merkez çizimin yeni revizyonu yayındaysa ya da yayından kalktıysa iş başlatılamaz; paket güncel revizyonla yenilenince başlar', async () => {
      const id = await belgeAc('Baslatma Revizyonu', pdf('bas-a'), 'bas.pdf', true);
      const kayit = (await istek<MerkezEkleCevabi>(yonetici, 'POST', `/arkon/cizim-merkezi/belgeler/${id}/ekle`)).govde.kayit;
      const t = await istasyonKur();
      const emir = (await istek<{ emir: { id: number; emirNo: string } }>(yonetici, 'POST', '/uretim-emirleri', {
        parcaNo: 'DENEME-CZ', parcaAd: 'Deneme parçası', adet: 5, istasyonId: t.istasyonId, projeId,
      })).govde.emir;
      const paket = `tmi-ue-${emir.id}`;
      const taslak = (await istek<BelgelerCevabi>(yonetici, 'GET', '/arkon/belgeler/pkgs')).govde.belgeler.find((b) => b.kimlik === paket)?.govde as Record<string, unknown> | undefined;
      assert.ok(taslak);
      const paketYaz = async (dosya: unknown) => {
        const b = (await istek<{ belge: { surum: number } | null }>(yonetici, 'GET', `/arkon/belgeler/pkgs/${paket}`)).govde.belge;
        const c = await istek(yonetici, 'POST', `/arkon/belgeler/pkgs/${paket}/yaz`, { taban: b?.surum ?? null, govde: { ...taslak, status: 'published', steps: [{ id: 's1' }], files: [dosya, { kind: 'pdf', name: 'yerel.pdf', key: 'k1' }] }, kaynak: 'c1' });
        assert.equal(c.durum, 200, JSON.stringify(c.govde));
      };
      let n = 0;
      const baslat = (state = 'running') => istek<{ eklenen: number }>(operator, 'POST', '/arkon/kayitlar/events/ekle', {
        satirlar: [{ cid: `cz-rev-${(n += 1)}`, at: Date.now(), machine: t.istasyon, orderNo: emir.emirNo, pkgId: paket, state }], kaynak: 'cz',
      });
      const cizimDurumu = () => vt().tx(async (db) => (await emirCizimDurumlari(db, [emir.id, 0])));
      assert.deepEqual((await cizimDurumu()).get(emir.id), { durum: 'yok', zaman: null, secildi: false }, 'pakette merkez çizimi yok');
      assert.deepEqual((await cizimDurumu()).get(0), { durum: 'yok', zaman: null, secildi: false }, 'paketi olmayan emir');
      await paketYaz(kayit);
      const tamam = (await cizimDurumu()).get(emir.id);
      assert.equal(tamam?.durum, 'tamam');
      assert.ok(tamam?.secildi && tamam.zaman !== null);
      assert.equal((await baslat()).govde.eklenen, 1, 'güncel revizyonla başlar');
      await revizyonYayinla(id, pdf('bas-b'), 'bas-b.pdf');
      assert.deepEqual((await cizimDurumu()).get(emir.id), { durum: 'suruyor', zaman: null, secildi: true }, 'yeni revizyon yayında');
      const red = await baslat();
      assert.equal(red.durum, 409, JSON.stringify(red.govde));
      assert.match(JSON.stringify(red.govde), /Baslatma Revizyonu/);
      assert.equal((await baslat('paused')).govde.eklenen, 1, 'duraklatma engellenmez');
      const yeni = (await istek<MerkezEkleCevabi>(yonetici, 'POST', `/arkon/cizim-merkezi/belgeler/${id}/ekle`)).govde.kayit;
      await paketYaz(yeni);
      assert.equal((await baslat()).govde.eklenen, 1, 'paket yeni revizyonla yenilenince başlar');
      const belge = (await istek<MerkezBelgesi>(yonetici, 'GET', `/cizimler/${id}`)).govde;
      await merkez(`/cizimler/${id}/arsivle`, { surum: belge.surum });
      assert.equal((await baslat()).durum, 409, 'yayından kalkan çizimle başlanmaz');
      assert.equal((await cizimDurumu()).get(emir.id)?.durum, 'suruyor', 'yayından kalkan çizim');
    });
  });

  test('anlık ileti: gönderen cihaz kendi iletisini almaz, öteki cihaz alır', async () => {
    const { son } = (await istek<IletilerCevabi>(operator, 'GET', '/arkon/iletiler?kaynak=a')).govde;
    assert.equal((await istek(operator, 'POST', '/arkon/iletiler', { ileti: { type: 'call', no: 'UE-1' }, kaynak: 'a' })).durum, 200);
    assert.deepEqual((await istek<IletilerCevabi>(operator, 'GET', `/arkon/iletiler?kaynak=a&son=${son}`)).govde.iletiler, []);
    const b = await istek<IletilerCevabi>(yonetici, 'GET', `/arkon/iletiler?kaynak=b&son=${son}`);
    assert.deepEqual(b.govde.iletiler, [{ type: 'call', no: 'UE-1' }]);
    assert.ok(b.govde.son > son);
    assert.equal((await istek(operator, 'POST', '/arkon/iletiler', { ileti: { no: 1 }, kaynak: 'a' })).durum, 400);
  });

  test('anlık ileti: sunucunun ürettiği türler ($ ile başlayan) istemciden kabul edilmez ve öteki cihaza gitmez', async () => {
    const { son } = (await istek<IletilerCevabi>(yonetici, 'GET', '/arkon/iletiler?kaynak=b')).govde;
    for (const ileti of [{ type: '$reload' }, { type: '$db', store: 'pkgs', id: 'x' }, { type: '$log', kind: 'counts' }]) {
      for (const cerez of [operator, yonetici]) {
        const red = await istek(cerez, 'POST', '/arkon/iletiler', { ileti, kaynak: 'a' });
        assert.equal(red.durum, 400, ileti.type);
        assert.equal(hataKodu(red), 'DOGRULAMA');
      }
    }
    // Karşı örnek: olağan tür geçer; reddedilenlerden hiçbiri öteki cihaza ulaşmamıştır.
    assert.equal((await istek(operator, 'POST', '/arkon/iletiler', { ileti: { type: 'call' }, kaynak: 'a' })).durum, 200);
    assert.deepEqual((await istek<IletilerCevabi>(yonetici, 'GET', `/arkon/iletiler?kaynak=b&son=${son}`)).govde.iletiler, [{ type: 'call' }]);
  });

  test('arkon.yansima-oku Arkon rolü değildir: yalnız onu taşıyan kişi listeyi okur, Arkon uçlarında 403 alır ve hiçbir şey yazamaz', async () => {
    const rol = await vt().tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('gecici_yansima', 'Geçici Yansıma') RETURNING id");
    if (!rol) throw new Error('rol kurulamadı');
    await vt().sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'arkon.yansima-oku'), ($1, 'sayfa.arkon')", [rol.id]);
    await girisliKisiEkle('yansima1', 'gecici_yansima');
    const okuyucu = await girisCerezi('yansima1');
    assert.equal((await istek(okuyucu, 'GET', '/arkon/tmi-yansimalari')).durum, 200);
    assert.equal((await istek(okuyucu, 'GET', '/arkon/ben')).durum, 403);
    assert.equal((await istek(okuyucu, 'GET', '/arkon/ozet')).durum, 403, 'sayfa.arkon var, Arkon rolü yok');
    const once = await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM arkon_belge');
    const yaz = await istek(okuyucu, 'POST', '/arkon/belgeler/results/yansima-1/yaz', { taban: null, govde: { id: 'yansima-1' }, kaynak: 'c9' });
    assert.equal(yaz.durum, 403);
    assert.deepEqual(await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM arkon_belge'), once);
    // Listeyi okumak yeniden kuyruğa almaya yetmez (ayrı işlem).
    assert.equal((await istek(okuyucu, 'POST', '/arkon/tmi-yansimalari/1/yeniden-dene')).durum, 403);
    // Karşı örnek: aynı kişiye Arkon rol işlemi eklenince Arkon rolünü o işlemden alır.
    await vt().sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'arkon.operator')", [rol.id]);
    assert.equal((await istek<ArkonBenCevabi>(okuyucu, 'GET', '/arkon/ben')).durum, 200);
  });

  // Uç tanımında yetki 'oturum'dur; Arkon rolünü servis denetler. Her ucun kendi denetimi ayrı ayrı ölçülür.
  const OZET = 'c'.repeat(64);
  const UCLAR: readonly { yontem: 'GET' | 'POST'; yol: string; govde?: unknown }[] = [
    { yontem: 'GET', yol: '/arkon/tmi-yansimalari' },
    { yontem: 'POST', yol: '/arkon/tmi-yansimalari/999999999/yeniden-dene' },
    { yontem: 'GET', yol: '/arkon/ben' },
    { yontem: 'GET', yol: '/arkon/kisiler' },
    { yontem: 'GET', yol: '/arkon/malzemeler' },
    { yontem: 'GET', yol: '/arkon/belgeler/results' },
    { yontem: 'GET', yol: '/arkon/belgeler/results/yetki-1' },
    { yontem: 'POST', yol: '/arkon/belgeler/results/yetki-1/yaz', govde: { taban: null, govde: { id: 'yetki-1' }, kaynak: 'c9' } },
    { yontem: 'POST', yol: '/arkon/belgeler/results/yetki-2/sil', govde: { kaynak: 'c9', taban: 0 } },
    { yontem: 'POST', yol: '/arkon/kayitlar/events/ekle', govde: { satirlar: [{ cid: 'yetki-1', state: 'running' }], kaynak: 'c9' } },
    { yontem: 'GET', yol: '/arkon/kayitlar/events' },
    { yontem: 'POST', yol: '/arkon/dosyalar/eksikler', govde: { ozetler: [OZET] } },
    { yontem: 'POST', yol: `/arkon/dosyalar/${OZET}/parca`, govde: { sira: 0, toplam: 2, veri: 'QQ==' } },
    { yontem: 'GET', yol: `/arkon/dosyalar/${OZET}` },
    { yontem: 'GET', yol: '/arkon/iletiler' },
    { yontem: 'POST', yol: '/arkon/iletiler', govde: { ileti: { type: 'call' }, kaynak: 'c9' } },
    { yontem: 'GET', yol: '/arkon/plan-sira/surum' },
    { yontem: 'GET', yol: '/arkon/ozet' },
    { yontem: 'GET', yol: '/arkon/son-olaylar' },
    { yontem: 'GET', yol: '/arkon/operator-ozeti' },
    { yontem: 'GET', yol: '/arkon/makine-ayrimlari?emirId=999999999' },
    { yontem: 'GET', yol: '/arkon/refakat-kartlari?istasyon=YOK-ISTASYON&emirler=999999999' },
    { yontem: 'POST', yol: '/arkon/plan-sira/sirala', govde: { kaynak: { tur: 'makine', id: 999999999 }, onceki: [999999999], yeni: [999999999], planSurumu: 0 } },
    { yontem: 'GET', yol: '/arkon/cizim-merkezi/belgeler' },
    { yontem: 'GET', yol: `/arkon/cizim-merkezi/kontrol?dosyalar=999999999:${OZET}` },
    { yontem: 'POST', yol: '/arkon/cizim-merkezi/belgeler/999999999/ekle' },
    { yontem: 'POST', yol: '/arkon/makine-devral', govde: { emirId: 999999999, kullanimId: 999999999 } },
  ];

  // Rol panosu (kart #489): sayılar Arkon ekranlarının süzgeçleridir; kartın işlemi olmayana null.
  test('rol panosu özeti: hazırlıkta yayınlanmamış paket, bekleyen numune ve açık arıza sayılır; işlemi olmayan sayı null', async () => {
    type Ozet = { hazirlikBekleyen: number | null; kaliteBekleyen: number | null; bakimAcik: number | null };
    const ozet = async (cerez: string) => {
      const c = await istek<Ozet>(cerez, 'GET', '/arkon/ozet');
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
      return c.govde;
    };
    const yaz = async (depo: string, govde: { id: string } & Record<string, unknown>) => {
      const c = await istek<{ sonuc: string }>(yonetici, 'POST', `/arkon/belgeler/${depo}/${govde.id}/yaz`, { taban: null, govde, kaynak: 'c1' });
      assert.equal(c.govde.sonuc, 'yazildi', JSON.stringify(c.govde));
    };
    const once = await ozet(yonetici);
    // Arkon'da emir dışı yeni paket açılmaz (A5); paketler kayıtlı satır olarak kurulur.
    await vt().tx(async (db) => {
      for (const [id, status] of [['oz-p1', 'draft'], ['oz-p2', 'review'], ['oz-p3', 'published']] as const) {
        assert.ok(await sorgular.belgeYaz(db, 'pkgs', id, { id, status }, 1, yoneticiId));
      }
    });
    await yaz('requests', { id: 'oz-r1', status: 'waiting' });
    await yaz('requests', { id: 'oz-r2', status: 'measuring' });
    await yaz('requests', { id: 'oz-r3', status: 'approved' });
    await yaz('maint', { id: 'oz-m1', type: 'ariza', status: 'open' });
    await yaz('maint', { id: 'oz-m2', type: 'ariza', status: 'work' });
    await yaz('maint', { id: 'oz-m3', type: 'ariza', status: 'done' });
    await yaz('maint', { id: 'oz-m4', type: 'pm', status: 'open' });
    const sonra = await ozet(yonetici);
    assert.deepEqual(
      [sonra.hazirlikBekleyen! - once.hazirlikBekleyen!, sonra.kaliteBekleyen! - once.kaliteBekleyen!, sonra.bakimAcik! - once.bakimAcik!], [2, 2, 2]);
    assert.deepEqual(await ozet(operator), { hazirlikBekleyen: null, kaliteBekleyen: null, bakimAcik: null }, 'Arkon operatörünün kart işlemi yok');
    assert.equal((await istek(rolsuz, 'GET', '/arkon/ozet')).durum, 403);
  });

  test('her uç: oturumsuz 401, Arkon rolü olmayan oturumlu kişi 403 ve hiçbir şey yazılmaz; rolü olan geçer', async () => {
    // Anomali uçları (/arkon/anomaliler, /arkon/anomali-istatistik) Arkon rolüne değil hazırlık, planlama ya da yönetici işlemine bağlıdır
    // (operatör rolü okuyamaz): ayrı sınanır (anomali-akis.test.ts).
    assert.equal(UCLAR.length, uclar.filter((u) => !u.yol.startsWith('/arkon/anomali')).length, 'tablo modülün bütün uçlarını kapsamalı');
    const say = async (): Promise<number[]> => {
      const s = await vt().tek<{ b: number; k: number; p: number; i: number }>(
        `SELECT (SELECT count(*)::int FROM arkon_belge) AS b, (SELECT count(*)::int FROM arkon_kayit) AS k,
                (SELECT count(*)::int FROM arkon_dosya_parcasi) AS p, (SELECT count(*)::int FROM arkon_ileti) AS i`);
      return s ? [s.b, s.k, s.p, s.i] : [];
    };
    const once = await say();
    for (const uc of UCLAR) {
      const ad = `${uc.yontem} ${uc.yol}`;
      const oturumsuz = await istek(null, uc.yontem, uc.yol, uc.govde);
      assert.equal(oturumsuz.durum, 401, ad);
      const red = await istek(rolsuz, uc.yontem, uc.yol, uc.govde);
      assert.equal(red.durum, 403, ad);
    }
    assert.deepEqual(await say(), once);
    // Kabul: aynı isteklerle rolü olan kişi reddedilmez (yüklenmemiş dosyanın okuması 404'tür).
    for (const uc of UCLAR) {
      // Silme yetkisi, arkon.yansima-* işlemleri ve plan sıralaması operatörde yoktur: bu uçların kabulü yöneticiyle ölçülür. Bulunmayan yansıma 404,
      // canlı planda olmayan işin sıralaması 409'dur (yetkiden geçti).
      // Çizim Merkezi'nden alma paketi düzenleyen rolündür (operatörün değil).
      const yoneticiyle = uc.yol.endsWith('/sil') || uc.yol.startsWith('/arkon/tmi-yansimalari') || uc.yol === '/arkon/plan-sira/sirala' || uc.yol.startsWith('/arkon/cizim-merkezi') || uc.yol === '/arkon/makine-devral';
      const kabul = await istek(yoneticiyle ? yonetici : operator, uc.yontem, uc.yol, uc.govde);
      const bulunamaz = uc.yol === `/arkon/dosyalar/${OZET}` || uc.yol.endsWith('/yeniden-dene') || uc.yol.endsWith('/999999999/ekle') || uc.yol === '/arkon/makine-devral' || uc.yol.startsWith('/arkon/refakat-kartlari');
      assert.equal(kabul.durum, bulunamaz ? 404 : uc.yol === '/arkon/plan-sira/sirala' ? 409 : 200, `${uc.yontem} ${uc.yol}: ${JSON.stringify(kabul.govde)}`);
    }
  });

  test('ayar yazımı: TMI ayarlarını kimse yazamaz ve silemez; yönetici ayarlarını operatör rolü yazamaz ve silemez, Arkon yöneticisi yazar', async () => {
    const yaz = (cerez: string, kimlik: string) => istek(cerez, 'POST', `/arkon/belgeler/kv/${kimlik}/yaz`, { taban: null, govde: { v: {} }, kaynak: 'c9' });
    const sil = (cerez: string, kimlik: string) => istek(cerez, 'POST', `/arkon/belgeler/kv/${kimlik}/sil`, { kaynak: 'c9' });
    for (const kimlik of ['plant', 'reasons', 'scraps', 'perms', 'shifts', 'holidays']) {
      for (const cerez of [operator, yonetici]) {
        assert.equal((await yaz(cerez, kimlik)).durum, 403, kimlik);
        assert.equal((await sil(cerez, kimlik)).durum, 403, kimlik);
      }
    }
    for (const kimlik of ['mode', 'policy']) {
      assert.equal((await yaz(yonetici, kimlik)).durum, 200, kimlik);
      assert.equal((await yaz(operator, kimlik)).durum, 403, kimlik);
      assert.equal((await sil(operator, kimlik)).durum, 403, kimlik);
      assert.ok((await istek<BelgeCevabi>(operator, 'GET', `/arkon/belgeler/kv/${kimlik}`)).govde.belge, kimlik);
    }
    // Karşı örnek: yönetici ayarı olmayan kv belgesini operatör rolü yazar.
    assert.equal((await yaz(operator, 'handover')).durum, 200);
  });
});
