import assert from 'node:assert/strict';
import { createServer, type Server, type Socket } from 'node:net';
import { after, before, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { Gunluk } from '#cekirdek/gunluk.ts';
import { testVeritabaniKur, type TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { tesisSaati } from '#paylasilan/tesis-zamani.ts';
import {
  epostaDefterCevabi, epostaDurumuCevabi, epostaSablonlariCevabi, epostaTetikleyicileriCevabi, type EpostaTetikleyiciDegistirGovdesi,
} from '#paylasilan/sozlesme/bildirim-eposta.ts';
import type { BildirimTuru } from '#paylasilan/sozlesme/bildirim.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { bildirimGonder } from './disari.ts';
import { epostaTuru, type EpostaTuruSonucu } from './eposta.ts';

const PAROLA = 'dogru-parola-1';
const ONAY: BildirimTuru = 'satin-alma.talep-onay-bekliyor';
// Kayda bağlı tür (alan işlemi yok): yalnız adıyla verilen kişi alır; e-posta varsayılanı kapalı, testte açılır.
const TUR: BildirimTuru = 'satin-alma.talep-onaylandi';
const ACIL: BildirimTuru = 'istasyonlar.makine-durdu';
interface Cevap<T = unknown> { durum: number; govde: T }

// Sahte kurum içi posta sunucusu (127.0.0.1, şifresiz): gelen her iletiyi alıcısıyla kaydeder; RCPT yanıtı testte değişir.
const posta = { rcpt: '250 tamam', iletiler: [] as { alici: string; veri: string }[] };
function sahteSunucu(): Promise<{ sunucu: Server; kapi: number }> {
  const sunucu = createServer((s: Socket) => {
    let tampon = '';
    let veriKipi = false;
    let alici = '';
    s.write('220 deneme\r\n');
    s.on('data', (d) => {
      tampon += d.toString('utf8');
      for (;;) {
        if (veriKipi) {
          const son = tampon.indexOf('\r\n.\r\n');
          if (son < 0) return;
          posta.iletiler.push({ alici, veri: tampon.slice(0, son) });
          tampon = tampon.slice(son + 5);
          veriKipi = false;
          s.write('250 alindi\r\n');
          continue;
        }
        const i = tampon.indexOf('\r\n');
        if (i < 0) return;
        const satir = tampon.slice(0, i);
        tampon = tampon.slice(i + 2);
        const k = satir.slice(0, 4).toUpperCase();
        if (k === 'EHLO') s.write('250-deneme\r\n250 8BITMIME\r\n');
        else if (k === 'MAIL') s.write('250 tamam\r\n');
        else if (k === 'RCPT') { alici = /<(.*)>/.exec(satir)?.[1] ?? ''; s.write(`${posta.rcpt}\r\n`); }
        else if (k === 'DATA') { veriKipi = true; s.write('354 basla\r\n'); }
        else if (k === 'QUIT') { s.write('221 hoscakal\r\n'); s.end(); }
        else s.write('502 yok\r\n');
      }
    });
  });
  return new Promise((coz) => {
    sunucu.listen(0, '127.0.0.1', () => {
      const a = sunucu.address();
      coz({ sunucu, kapi: typeof a === 'object' && a !== null ? a.port : 0 });
    });
  });
}

// Gövde base64'tür: düz metin parçası çözülerek okunur.
const metinParcasi = (veri: string): string => {
  const e = /Content-Type: text\/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)\r\n--/i.exec(veri);
  return Buffer.from((e?.[1] ?? '').replace(/\r\n/g, ''), 'base64').toString('utf8');
};
const konuBasligi = (veri: string): string => {
  const ham = /^Subject: (.*)$/m.exec(veri.replace(/\r\n[ \t]/g, ' '))?.[1] ?? '';
  return ham.replace(/=\?UTF-8\?B\?([^?]*)\?=\s?/g, (_, b: string) => Buffer.from(b, 'base64').toString('utf8')).trim();
};

describe('bildirim e-postası (ADR 0015, 3397; gerçek PostgreSQL, sahte posta sunucusu)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let sunucu: Server | undefined;
  const cerezler = new Map<string, string>();
  const kisiler = new Map<string, number>();
  let sayac = 0;
  const uyarilar: string[] = [];
  const gunluk: Gunluk = { uyar: (m) => { uyarilar.push(m); }, hata: () => undefined };

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const kim = (ad: string): number => {
    const id = kisiler.get(ad);
    if (id === undefined) throw new Error(`kişi yok: ${ad}`);
    return id;
  };
  const rolNo = async (kod: string): Promise<number> => {
    const r = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]);
    if (!r) throw new Error(`rol yok: ${kod}`);
    return r.id;
  };

  async function istek<T = unknown>(ad: string | null, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const basliklar: Record<string, string> = ad === null ? {} : { cookie: cerezler.get(ad) ?? '' };
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: basliklar, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  async function tamam<T = unknown>(yontem: 'GET' | 'POST', yol: string, govde?: unknown, ad = 'yonetici'): Promise<T> {
    const c = await istek<T>(ad, yontem, yol, govde);
    assert.equal(c.durum, 200, `${yol}: ${JSON.stringify(c.govde)}`);
    return c.govde;
  }
  async function giris(kullaniciAdi: string): Promise<void> {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    cerezler.set(kullaniciAdi, String(c.headers['set-cookie']).split(';')[0] ?? '');
  }
  async function personel(kisiId: number, eposta: string | null): Promise<void> {
    const im = await o().sahip.tek<{ id: number }>('SELECT id FROM is_merkezi ORDER BY id LIMIT 1');
    await o().sahip.sorgu(
      `INSERT INTO ik_personel (kimlik, ad, soyad, kisi_id, is_merkezi_id, eposta, olusturan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'Ad', 'Deneme', $2, $3, $4, $5, $5)`, [`dnm_eposta_${String(++sayac)}`, kisiId, im?.id, eposta, kim('yonetici')]);
  }
  async function kisiEkle(kullaniciAdi: string, rolKodu: string, eposta: string | null): Promise<void> {
    const rol = await rolNo(rolKodu);
    const yoneticiRolu = await rolNo('yonetici');
    const id = await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, kim('yonetici'), yeni, rol);
      await rolAl(db, kim('yonetici'), yeni, yoneticiRolu);
      return yeni;
    });
    kisiler.set(kullaniciAdi, id);
    if (eposta !== undefined) await personel(id, eposta);
    await giris(kullaniciAdi);
  }

  const ayar = (anahtar: string, deger: unknown): Promise<unknown> => tamam('POST', `/ayarlar/${anahtar}/degistir`, { deger });
  async function tetikle(tur: BildirimTuru, g: Partial<EpostaTetikleyiciDegistirGovdesi>): Promise<Cevap> {
    const t = epostaTetikleyicileriCevabi.parse(await tamam('GET', '/bildirimler/eposta/tetikleyiciler')).satirlar.find((r) => r.tur === tur);
    assert.ok(t);
    return istek('yonetici', 'POST', `/bildirimler/eposta/tetikleyiciler/${tur}/degistir`, {
      eposta: t.eposta, zaman: t.zaman, tekrarGun: t.tekrarGun, tekrarEnCok: t.tekrarEnCok, yukseltGun: t.yukseltGun,
      yukseltRolIdleri: t.yukseltRolIdleri, yukseltKisiIdleri: t.yukseltKisiIdleri, surum: t.surum, ...g,
    });
  }
  const gonder = (tur: BildirimTuru, alicilar: string[], ek: { kayitNo?: string } = {}): Promise<number> => o().vt.tx((db) => bildirimGonder(db, {
    tur, baslik: `Olay: ${ek.kayitNo ?? `ORN-TLP-${String(++sayac).padStart(4, '0')}`}`, metin: 'Gizli serbest metin', kaynakKimlik: `k${String(++sayac)}`,
    yol: tur === ACIL ? '/istasyonlar' : tur === ONAY ? '/satin-alma/onaylar' : '/taleplerim', kisiler: alicilar.map(kim), yalnizKisiler: tur !== TUR,
  }));
  const tur = async (): Promise<EpostaTuruSonucu> => {
    const r = await epostaTuru(o().vt, gunluk);
    assert.ok(!('durum' in r), JSON.stringify(r));
    return r;
  };
  const kuyruk = (): Promise<{ id: number; kisiId: number | null; kademe: number; tekrarNo: number; ozet: boolean; deneme: number; gelecek: boolean }[]> =>
    o().sahip.sorgu(`SELECT id, kisi_id AS "kisiId", kademe, tekrar_no AS "tekrarNo", ozet, deneme, zamani > now() AS gelecek
                       FROM bildirim_eposta_kuyrugu ORDER BY id`);
  const zamaniGelsin = (): Promise<unknown> => o().sahip.sorgu("UPDATE bildirim_eposta_kuyrugu SET zamani = now() - interval '1 second'");
  let sonDefter = 0;
  const yeniDefter = async (): Promise<{ kisiId: number | null; tur: string; sonuc: string; neden: string | null; kayitNo: string | null }[]> => {
    const r = await o().sahip.sorgu<{ id: number; kisiId: number | null; tur: string; sonuc: string; neden: string | null; kayitNo: string | null }>(
      'SELECT id, kisi_id AS "kisiId", tur, sonuc, neden, kayit_no AS "kayitNo" FROM bildirim_eposta_defteri WHERE id > $1 ORDER BY id', [sonDefter]);
    sonDefter = r.at(-1)?.id ?? sonDefter;
    return r.map(({ id: _, ...x }) => x);
  };

  before(async () => {
    const f = await sahteSunucu();
    sunucu = f.sunucu;
    Object.assign(process.env, {
      TMIV2_POSTA_SUNUCUSU: `127.0.0.1:${String(f.kapi)}`, TMIV2_POSTA_ALAN_ADI: 'ornek.local', TMIV2_POSTA_GONDEREN: 'mes@ornek.local', TMIV2_POSTA_GUVENLIK: 'yok',
    });
    ortam = await testVeritabaniKur('eposta');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    kisiler.set('yonetici', await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA })));
    await giris('yonetici');
    await ortam.sahip.sorgu("INSERT INTO is_merkezi (kod, ad) VALUES ('TEMEP', 'Deneme Merkezi')");
    await personel(kim('yonetici'), 'yonetici@ornek.local');
    await kisiEkle('mudur', 'mudur', 'Mudur@Ornek.Local');
    await kisiEkle('adressiz', 'mudur', null);
    await kisiEkle('disari', 'mudur', 'disari@baska.com');
    await kisiEkle('kalite', 'kalite', 'kalite@ornek.local');
    await kisiEkle('operator', 'operator', 'operator@ornek.local');
    // Varsayılan kip dış servis (3397-4 a); test kurum içi sahte sunucuyla koşar.
    await ayar('bildirim.eposta-kipi', 'kurum-ici');
    // Sessiz saat yok (başlangıç = bitiş); sessiz saat testi kendisi açar.
    await ayar('bildirim.eposta-sessiz-baslangic', 0);
    await ayar('bildirim.eposta-sessiz-bitis', 0);
    assert.equal((await tetikle(TUR, { eposta: true })).durum, 200);
  });
  beforeEach(async () => {
    posta.rcpt = '250 tamam';
    posta.iletiler.length = 0;
    await o().sahip.sorgu('DELETE FROM bildirim_eposta_kuyrugu');
    await yeniDefter();
  });
  after(async () => {
    await app?.close();
    await ortam?.kaldir();
    sunucu?.close();
  });

  test('yönetim uçları bildirim.eposta-yonet ister: oturumsuz 401, yetkisiz 403, yönetici 200', async () => {
    for (const [y, yol] of [['GET', '/bildirimler/eposta/durum'], ['GET', '/bildirimler/eposta/sablonlar'], ['GET', '/bildirimler/eposta/tetikleyiciler'],
      ['GET', '/bildirimler/eposta/defter'], ['POST', '/bildirimler/eposta/sina']] as const) {
      assert.equal((await istek(null, y, yol, y === 'POST' ? {} : undefined)).durum, 401, yol);
      assert.equal((await istek('mudur', y, yol, y === 'POST' ? {} : undefined)).durum, 403, yol);
    }
    assert.equal((await istek('mudur', 'POST', '/bildirimler/eposta/deneme', {})).durum, 403);
    assert.equal((await istek('mudur', 'POST', `/bildirimler/eposta/tetikleyiciler/${TUR}/degistir`, {
      eposta: false, zaman: 'hemen', tekrarGun: null, tekrarEnCok: null, yukseltGun: null, yukseltRolIdleri: [], yukseltKisiIdleri: [], surum: null,
    })).durum, 403);
    const d = epostaDurumuCevabi.parse(await tamam('GET', '/bildirimler/eposta/durum'));
    assert.equal(d.ortam, 'hazir');
    assert.equal(d.kip, 'kurum-ici');
    assert.equal(d.guvenlik, 'yok');
    assert.deepEqual(d.alanAdlari, ['ornek.local']);
    assert.equal(d.gonderen, 'mes@ornek.local');
    // Adressiz ve izinsiz alan adlı kişi.
    assert.equal(d.epostasizKisi, 2);
  });

  test('dış servis kipinde dış adres yoksa kanal tanımsızdır: kurum içi adres kullanılmaz, deneme ve sınama gitmez (3397-4 a)', async () => {
    await ayar('bildirim.eposta-kipi', 'dis-servis');
    try {
      const d = epostaDurumuCevabi.parse(await tamam('GET', '/bildirimler/eposta/durum'));
      assert.deepEqual({ ortam: d.ortam, kip: d.kip, adres: d.adres }, { ortam: 'tanimsiz', kip: 'dis-servis', adres: null });
      const deneme = await tamam('POST', '/bildirimler/eposta/deneme', {}) as { sonuc: string };
      assert.equal(deneme.sonuc, 'atlandi');
      const sina = await tamam('POST', '/bildirimler/eposta/sina', {}) as { tamam: boolean };
      assert.equal(sina.tamam, false);
      assert.equal(posta.iletiler.length, 0);
    } finally {
      await ayar('bildirim.eposta-kipi', 'kurum-ici');
    }
    assert.equal(epostaDurumuCevabi.parse(await tamam('GET', '/bildirimler/eposta/durum')).ortam, 'hazir');
  });

  test('ayar kapalıyken kuyruk birikir, gönderilmez; açılınca gider; metin ve izinsiz alıcı gitmez, operatör kuyruğa girmez', async () => {
    await ayar('bildirim.eposta', false);
    await gonder(TUR, ['mudur', 'adressiz', 'disari', 'operator'], { kayitNo: 'ORN-TLP-0042' });
    assert.equal((await kuyruk()).length, 3);
    assert.deepEqual(await epostaTuru(o().vt, gunluk), { durum: 'bekliyor', neden: 'E-posta gönderimi Sistem Ayarları\'nda kapalı' });
    assert.equal(posta.iletiler.length, 0);
    assert.equal(epostaDurumuCevabi.parse(await tamam('GET', '/bildirimler/eposta/durum')).kuyrukta, 3);

    await ayar('bildirim.eposta', true);
    assert.deepEqual(await tur(), { gonderilen: 1, hata: 0, atlanan: 2, ertelenen: 0 });
    assert.deepEqual(posta.iletiler.map((i) => i.alici), ['mudur@ornek.local']);
    const ileti = posta.iletiler[0]?.veri ?? '';
    assert.equal(konuBasligi(ileti), '[CORE MES] Satın alma talebin onaylandı · ORN-TLP-0042');
    const metin = metinParcasi(ileti);
    assert.match(metin, /Merhaba Deneme mudur/);
    assert.match(metin, /Kayıt no: ORN-TLP-0042/);
    assert.doesNotMatch(ileti + metin, /Gizli serbest metin/);
    assert.match(ileti, /Content-ID: <simge>/);
    assert.deepEqual(await yeniDefter(), [
      { kisiId: kim('mudur'), tur: TUR, sonuc: 'gonderildi', neden: null, kayitNo: 'ORN-TLP-0042' },
      { kisiId: kim('adressiz'), tur: TUR, sonuc: 'atlandi', neden: 'İK\'da iş e-postası yok', kayitNo: 'ORN-TLP-0042' },
      { kisiId: kim('disari'), tur: TUR, sonuc: 'atlandi', neden: 'Adres izinli alan adında değil', kayitNo: 'ORN-TLP-0042' },
    ].sort((a, b) => (a.kisiId ?? 0) - (b.kisiId ?? 0)));
    assert.deepEqual(await kuyruk(), []);
  });

  test('defter yalnız eklenir ve sonuca göre süzülür', async () => {
    await ayar('bildirim.eposta', true);
    await gonder(TUR, ['adressiz']);
    await tur();
    const l = epostaDefterCevabi.parse(await tamam('GET', '/bildirimler/eposta/defter?sayfa=1&sonuc=atlandi'));
    assert.ok(l.satirlar.length > 0 && l.satirlar.every((s) => s.sonuc === 'atlandi'));
    assert.equal(l.satirlar[0]?.kisiAdi, 'Deneme adressiz');
    await assert.rejects(o().vt.tx((db) => db.sorgu('DELETE FROM bildirim_eposta_defteri')));
  });

  test('tetikleyici kapalıysa ve kişi Profil\'de kapattıysa e-posta kuyruğa girmez', async () => {
    await ayar('bildirim.eposta', true);
    assert.equal((await tetikle(ONAY, { eposta: false })).durum, 200);
    await gonder(ONAY, ['mudur']);
    assert.equal((await kuyruk()).length, 0);
    assert.equal((await tetikle(ONAY, { eposta: true })).durum, 200);

    await tamam('POST', '/bildirimler/tercihler/degistir', { tur: ONAY, mesaj: false, eposta: false });
    await gonder(ONAY, ['yonetici', 'mudur']);
    assert.deepEqual((await kuyruk()).map((q) => q.kisiId), [kim('mudur')]);
    await tamam('POST', '/bildirimler/tercihler/degistir', { tur: ONAY, mesaj: false, eposta: true });
  });

  test('tetikleyici doğrulaması: eksik tekrar, günsüz kademe, olmayan rol, eski sürüm', async () => {
    assert.equal((await tetikle(TUR, { tekrarGun: 2, tekrarEnCok: null })).durum, 400);
    assert.equal((await tetikle(TUR, { yukseltGun: null, yukseltRolIdleri: [await rolNo('kalite')] })).durum, 400);
    assert.equal((await tetikle(TUR, { yukseltGun: 1, yukseltRolIdleri: [999999] })).durum, 400);
    assert.equal((await tetikle(TUR, { yukseltGun: 1, yukseltKisiIdleri: [kim('mudur'), kim('mudur')] })).durum, 400);
    assert.equal((await tetikle(TUR, { yukseltGun: 1, yukseltKisiIdleri: [999999] })).durum, 400);
    assert.equal((await tetikle(TUR, {})).durum, 200);
    assert.equal((await tetikle(TUR, { surum: 1 })).durum, 409);
  });

  test('tekrar: iş açık kaldıkça en çok N kez; iş yapılınca tekrar düşer', async () => {
    await ayar('bildirim.eposta', true);
    assert.equal((await tetikle(TUR, { tekrarGun: 1, tekrarEnCok: 2 })).durum, 200);
    await gonder(TUR, ['mudur']);
    await tur();
    assert.deepEqual((await kuyruk()).map((q) => [q.tekrarNo, q.gelecek]), [[1, true]]);
    await zamaniGelsin();
    await tur();
    assert.deepEqual((await kuyruk()).map((q) => q.tekrarNo), [2]);
    await zamaniGelsin();
    await tur();
    assert.deepEqual(await kuyruk(), []);
    assert.equal(posta.iletiler.length, 3);

    posta.iletiler.length = 0;
    await gonder(TUR, ['mudur']);
    await tur();
    await o().sahip.sorgu("UPDATE bildirim_kaydi SET okundu = now() WHERE tur = $1 AND okundu IS NULL", [TUR]);
    await zamaniGelsin();
    await tur();
    assert.equal(posta.iletiler.length, 1);
    assert.deepEqual(await kuyruk(), []);
    assert.equal((await tetikle(TUR, { tekrarGun: null, tekrarEnCok: null })).durum, 200);
  });

  test('kademe: gün dolunca iş hâlâ açıksa seçilen role gider; iş kapandıysa gitmez', async () => {
    await ayar('bildirim.eposta', true);
    assert.equal((await tetikle(TUR, { yukseltGun: 2, yukseltRolIdleri: [await rolNo('kalite')] })).durum, 200);
    await gonder(TUR, ['mudur']);
    await tur();
    assert.deepEqual((await kuyruk()).map((q) => [q.kisiId, q.kademe, q.gelecek]), [[null, 1, true]]);
    await zamaniGelsin();
    await tur();
    assert.deepEqual(posta.iletiler.map((i) => i.alici), ['mudur@ornek.local', 'kalite@ornek.local']);
    assert.deepEqual(await kuyruk(), []);

    posta.iletiler.length = 0;
    await gonder(TUR, ['mudur']);
    await tur();
    await o().sahip.sorgu("UPDATE bildirim_kaydi SET okundu = now() WHERE tur = $1 AND okundu IS NULL", [TUR]);
    await zamaniGelsin();
    await tur();
    assert.deepEqual(posta.iletiler.map((i) => i.alici), ['mudur@ornek.local']);
    assert.deepEqual(await kuyruk(), []);
    assert.equal((await tetikle(TUR, { yukseltGun: null, yukseltRolIdleri: [] })).durum, 200);
  });

  test('sessiz saatte acil olmayan bekler, acil gider', async () => {
    await ayar('bildirim.eposta', true);
    assert.equal((await tetikle(ACIL, { eposta: true })).durum, 200);
    const saat = Number(tesisSaati(Date.now()).slice(11, 13));
    await ayar('bildirim.eposta-sessiz-baslangic', saat);
    await ayar('bildirim.eposta-sessiz-bitis', (saat + 1) % 24);
    try {
      await gonder(TUR, ['mudur']);
      await gonder(ACIL, ['mudur']);
      const r = await tur();
      assert.equal(r.gonderilen, 1);
      assert.equal(r.ertelenen, 1);
      assert.match(konuBasligi(posta.iletiler[0]?.veri ?? ''), /Makine durdu/);
      assert.deepEqual((await kuyruk()).map((q) => q.gelecek), [true]);
    } finally {
      await ayar('bildirim.eposta-sessiz-baslangic', 0);
      await ayar('bildirim.eposta-sessiz-bitis', 0);
      assert.equal((await tetikle(ACIL, { eposta: false })).durum, 200);
    }
  });

  test('günlük üst sınırı aşan özet saatine kalır; özet kişi başına tek e-posta', async () => {
    await ayar('bildirim.eposta', true);
    // Sınır kişinin bugün aldıklarıyla birlikte sayılır: bugüne dek alınanlara bir ekle.
    const once = (await o().sahip.tek<{ n: number }>(
      "SELECT count(*)::int AS n FROM bildirim_eposta_defteri WHERE kisi_id = $1 AND sonuc = 'gonderildi' AND zaman >= now() - interval '1 day'", [kim('kalite')]))?.n ?? 0;
    await ayar('bildirim.eposta-gunluk-en-cok', once + 1);
    try {
      await gonder(TUR, ['kalite']);
      await gonder(TUR, ['kalite']);
      const r = await tur();
      assert.equal(r.gonderilen, 1);
      assert.equal(r.ertelenen, 1);
      assert.deepEqual((await kuyruk()).map((q) => [q.ozet, q.gelecek]), [[true, true]]);
      await gonder(TUR, ['kalite']);
      await o().sahip.sorgu('UPDATE bildirim_eposta_kuyrugu SET ozet = true');
      await zamaniGelsin();
      posta.iletiler.length = 0;
      await tur();
      assert.equal(posta.iletiler.length, 1);
      assert.match(konuBasligi(posta.iletiler[0]?.veri ?? ''), /Günlük özet · 2 bildirim/);
      assert.deepEqual(await kuyruk(), []);
    } finally {
      await ayar('bildirim.eposta-gunluk-en-cok', 40);
    }
  });

  test('özet zamanlı tür özet saatini bekler', async () => {
    await ayar('bildirim.eposta', true);
    assert.equal((await tetikle(TUR, { zaman: 'ozet' })).durum, 200);
    await gonder(TUR, ['mudur']);
    assert.deepEqual((await kuyruk()).map((q) => [q.ozet, q.gelecek]), [[true, true]]);
    await tur();
    assert.equal(posta.iletiler.length, 0);
    assert.equal((await tetikle(TUR, { zaman: 'hemen' })).durum, 200);
  });

  test('geçici hata yeniden denenir; kalıcı hata deftere gönderilemedi yazılır', async () => {
    await ayar('bildirim.eposta', true);
    posta.rcpt = '451 sonra';
    await gonder(TUR, ['mudur']);
    const r = await tur();
    assert.equal(r.gonderilen + r.hata, 0);
    assert.deepEqual((await kuyruk()).map((q) => [q.deneme, q.gelecek]), [[1, true]]);
    assert.deepEqual(await yeniDefter(), []);
    posta.rcpt = '550 yok';
    await zamaniGelsin();
    assert.equal((await tur()).hata, 1);
    assert.deepEqual((await yeniDefter()).map((d) => [d.sonuc, d.neden]), [['gonderilemedi', 'Sunucu alıcı adresini reddetti (550)']]);
    assert.deepEqual(await kuyruk(), []);
    assert.ok(uyarilar.some((u) => u.includes('gönderilemedi')));
  });

  test('şablon: bilinmeyen yer tutucu reddedilir; değişiklik sonraki e-postada; varsayılana dönülür', async () => {
    await ayar('bildirim.eposta', true);
    const s0 = epostaSablonlariCevabi.parse(await tamam('GET', '/bildirimler/eposta/sablonlar')).satirlar.find((x) => x.konu === 'satin-alma');
    assert.ok(s0);
    assert.equal(s0.surum, null);
    const yol = '/bildirimler/eposta/sablonlar/satin-alma/degistir';
    const govde = { simge: 'cart', konuKalibi: 'Onay: {kayit_no}', govde: 'Merhaba {alici_adi}', tabloAlanlari: ['kayit_no'], surum: null };
    const red = await istek<{ hata?: { ileti?: string } }>('yonetici', 'POST', yol, { ...govde, govde: 'Müşteri {musteri_adi}' });
    assert.equal(red.durum, 400);
    assert.match(JSON.stringify(red.govde), /musteri_adi/);
    const s1 = epostaSablonlariCevabi.parse(await tamam('POST', yol, govde)).satirlar.find((x) => x.konu === 'satin-alma');
    assert.equal(s1?.surum, 1);
    await gonder(TUR, ['mudur'], { kayitNo: 'ORN-TLP-0077' });
    await tur();
    assert.equal(konuBasligi(posta.iletiler[0]?.veri ?? ''), 'Onay: ORN-TLP-0077');
    assert.equal((await istek('yonetici', 'POST', yol, govde)).durum, 409);
    const s2 = epostaSablonlariCevabi.parse(await tamam('POST', yol, { ...govde, varsayilan: true, surum: 1 })).satirlar.find((x) => x.konu === 'satin-alma');
    assert.deepEqual(s2, s0);
  });

  test('ortam değişkeni yokken kuyruğa yazılmaz; aynı olay okunmadan yinelenince ikinci e-posta doğmaz', async () => {
    await ayar('bildirim.eposta', false);
    const adres = process.env['TMIV2_POSTA_SUNUCUSU'];
    delete process.env['TMIV2_POSTA_SUNUCUSU'];
    try {
      await gonder(TUR, ['mudur']);
      assert.deepEqual(await kuyruk(), []);
    } finally {
      process.env['TMIV2_POSTA_SUNUCUSU'] = adres;
    }
    const ayni = () => o().vt.tx((db) => bildirimGonder(db, {
      tur: TUR, baslik: 'Olay: ORN-TLP-0900', metin: 'Gizli serbest metin', kaynakKimlik: 'yinelenen-olay', yol: '/taleplerim', kisiler: [kim('mudur')], yalnizKisiler: false,
    }));
    await ayni();
    await ayni();
    assert.equal((await kuyruk()).length, 1);
    await o().sahip.sorgu('DELETE FROM bildirim_eposta_kuyrugu');
  });

  test('kapatılamaz türde (3396-3) kişinin kapalı e-posta tercihi yok sayılır', async () => {
    const KILITLI = 'projeler.hazirlik-hatirlatma' as BildirimTuru;
    await ayar('bildirim.eposta', false);
    assert.equal((await tetikle(KILITLI, { eposta: true })).durum, 200);
    await o().sahip.sorgu(
      `INSERT INTO bildirim_tercihi (kisi_id, tur, mesaj, eposta) VALUES ($1, $2, false, false)
       ON CONFLICT (kisi_id, tur) DO UPDATE SET eposta = false`, [kim('yonetici'), KILITLI]);
    await o().vt.tx((db) => bildirimGonder(db, {
      tur: KILITLI, baslik: 'Hazırlık: ORN-PRJ-0001', metin: 'Gizli serbest metin', kaynakKimlik: 'kilitli-1', yol: '/proje-gorevlerim', kisiler: [kim('yonetici')], yalnizKisiler: true,
    }));
    assert.deepEqual((await kuyruk()).map((q) => q.kisiId), [kim('yonetici')]);
    await o().sahip.sorgu('DELETE FROM bildirim_eposta_kuyrugu');
  });

  test('günlük sınır tam sınırda: N e-posta gider, N+1\'inci özete kalır', async () => {
    await ayar('bildirim.eposta', true);
    const once = (await o().sahip.tek<{ n: number }>(
      "SELECT count(*)::int AS n FROM bildirim_eposta_defteri WHERE kisi_id = $1 AND sonuc = 'gonderildi' AND zaman >= now() - interval '1 day'", [kim('kalite')]))?.n ?? 0;
    await ayar('bildirim.eposta-gunluk-en-cok', once + 2);
    try {
      await gonder(TUR, ['kalite']);
      await gonder(TUR, ['kalite']);
      await gonder(TUR, ['kalite']);
      const r = await tur();
      assert.deepEqual([r.gonderilen, r.ertelenen], [2, 1]);
      assert.deepEqual((await kuyruk()).map((q) => q.ozet), [true]);
    } finally {
      await ayar('bildirim.eposta-gunluk-en-cok', 40);
      await o().sahip.sorgu('DELETE FROM bildirim_eposta_kuyrugu');
    }
  });

  test('kademe: girişi etkin olmayan kişi kademe e-postası almaz', async () => {
    await ayar('bildirim.eposta', true);
    await kisiEkle('pasif', 'kalite', 'pasif@ornek.local');
    assert.equal((await tetikle(TUR, { yukseltGun: 1, yukseltRolIdleri: [], yukseltKisiIdleri: [kim('pasif'), kim('kalite')] })).durum, 200);
    try {
      await o().sahip.sorgu('UPDATE kisi SET aktif = false WHERE id = $1', [kim('pasif')]);
      await gonder(TUR, ['mudur']);
      await tur();
      await zamaniGelsin();
      await tur();
      assert.deepEqual(posta.iletiler.map((i) => i.alici), ['mudur@ornek.local', 'kalite@ornek.local']);
    } finally {
      assert.equal((await tetikle(TUR, { yukseltGun: null, yukseltRolIdleri: [], yukseltKisiIdleri: [] })).durum, 200);
    }
  });

  test('deneme: iş e-postası izinli alan adında değilse atlanır, ileti gitmez', async () => {
    await o().sahip.sorgu("UPDATE ik_personel SET eposta = 'yonetici@baska.com', surum = surum + 1 WHERE kisi_id = $1", [kim('yonetici')]);
    try {
      const r = await tamam<{ sonuc: string; neden: string | null }>('POST', '/bildirimler/eposta/deneme', {});
      assert.deepEqual(r, { sonuc: 'atlandi', neden: 'İş e-postanız izinli alan adında değil' });
      assert.equal(posta.iletiler.length, 0);
    } finally {
      await o().sahip.sorgu("UPDATE ik_personel SET eposta = 'yonetici@ornek.local', surum = surum + 1 WHERE kisi_id = $1", [kim('yonetici')]);
    }
  });

  test('ayarlar.yaz yetkisi e-posta yönetimine yetmez: şablon, defter ve deneme 403; ayar yazmak 200', async () => {
    await kisiEkle('ayarci', 'mudur', 'ayarci@ornek.local');
    await o().sahip.sorgu("INSERT INTO kisi_islemi (kisi_id, islem, veren_id) VALUES ($1, 'ayarlar.yaz', $2)", [kim('ayarci'), kim('yonetici')]);
    await giris('ayarci');
    assert.equal((await istek('ayarci', 'POST', '/ayarlar/bildirim.eposta-sessiz-bitis/degistir', { deger: 0 })).durum, 200);
    assert.equal((await istek('ayarci', 'POST', '/bildirimler/eposta/sablonlar/genel/degistir', { simge: 'bell', konuKalibi: '{olay}', govde: '{olay}', tabloAlanlari: [], surum: null })).durum, 403);
    assert.equal((await istek('ayarci', 'GET', '/bildirimler/eposta/defter')).durum, 403);
    assert.equal((await istek('ayarci', 'POST', '/bildirimler/eposta/deneme', {})).durum, 403);
  });

  test('deneme e-postası yalnız isteyenin kendi adresine gider ve deftere yazılır; sınama ileti göndermez', async () => {
    await ayar('bildirim.eposta', false);
    const r = await tamam<{ sonuc: string }>('POST', '/bildirimler/eposta/deneme', { konu: 'uretim' });
    assert.equal(r.sonuc, 'gonderildi');
    assert.deepEqual(posta.iletiler.map((i) => i.alici), ['yonetici@ornek.local']);
    assert.deepEqual((await yeniDefter()).map((d) => [d.kisiId, d.tur, d.sonuc]), [[kim('yonetici'), 'bildirim.deneme', 'gonderildi']]);
    posta.iletiler.length = 0;
    assert.deepEqual(await tamam('POST', '/bildirimler/eposta/sina', {}), { tamam: true, neden: null });
    assert.equal(posta.iletiler.length, 0);
  });
});
