import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { renkImzasi } from '#paylasilan/pdf-renk.ts';
import { denetimYaz } from '../../denetim/disari.ts';
import { tekrarDeposu } from '../../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../../kisiler/disari.ts';
import { kimlikCozucu } from '../../oturum/disari.ts';
import { goruntuTuru, pdfGoruntusu } from './servis.ts';
import { AZAMI_RES, goruntuAyari, goruntuIsleri, IMZA_DESENI, pdfBasligiVar, VARSAYILAN_RES } from './kurallar.ts';
import { goruntuOrtami, goruntuSureciKur } from './surec.ts';

// ADR 0032. PDF'ler test içinde üretilen sentetik sayfalardır.
function deneme(cizgi = '0 0 0 RG 4 w 20 20 m 280 180 l S'): Buffer {
  const nesneler = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << >> >>',
    `<< /Length ${String(cizgi.length)} >>\nstream\n${cizgi}\nendstream`,
  ];
  let metin = '%PDF-1.4\n';
  const yerler: number[] = [];
  nesneler.forEach((n, i) => { yerler.push(metin.length); metin += `${String(i + 1)} 0 obj\n${n}\nendobj\n`; });
  const xref = metin.length;
  metin += `xref\n0 ${String(nesneler.length + 1)}\n0000000000 65535 f \n${yerler.map((y) => `${String(y).padStart(10, '0')} 00000 n \n`).join('')}`;
  metin += `trailer\n<< /Size ${String(nesneler.length + 1)} /Root 1 0 R >>\nstartxref\n${String(xref)}\n%%EOF\n`;
  return Buffer.from(metin, 'latin1');
}

describe('arkon PDF görüntüsü: kurallar', () => {
  test('P-K2 bir kaynak için dört ayrı imza (iki tema x iki boy); hepsi okuma ucunun desenine uyar', () => {
    const isler = goruntuIsleri(goruntuAyari({ look: 'blue', bold: 2, res: 3000 }));
    assert.equal(new Set(isler.map((i) => i.imza)).size, 4);
    for (const i of isler) {
      assert.match(i.imza, IMZA_DESENI);
      assert.equal(i.imza, renkImzasi(i.ayar));
    }
    assert.deepEqual(isler.map((i) => [i.ayar.koyu, i.ayar.lo]), [[false, true], [false, false], [true, true], [true, false]]);
  });

  test('P-K3 okuma ayarı yoksa ya da bozuksa tabletin varsayılanları kullanılır', () => {
    assert.deepEqual(goruntuAyari(null), { res: VARSAYILAN_RES, look: 'net', bold: 1 });
    assert.deepEqual(goruntuAyari({ res: -5, look: 'x', bold: 'y' }), { res: VARSAYILAN_RES, look: 'net', bold: 1 });
    assert.deepEqual(goruntuAyari({ res: 2000, look: 'orig', bold: 0 }), { res: 2000, look: 'orig', bold: 0 });
  });

  test('P-K6 çözünürlük 8000 ile sınırlıdır (güvenilmeyen paket ayarı süreci şişirmez)', () => {
    assert.equal(AZAMI_RES, 8000);
    assert.equal(goruntuAyari({ res: 8000 }).res, 8000);
    assert.equal(goruntuAyari({ res: 8001 }).res, 8000);
    assert.equal(goruntuAyari({ res: 1e9 }).res, 8000);
    assert.equal(goruntuAyari({ res: Number.POSITIVE_INFINITY }).res, VARSAYILAN_RES);
  });

  test('P-K4 PDF başlığı ilk 1024 baytta aranır', () => {
    assert.equal(pdfBasligiVar(deneme()), true);
    assert.equal(pdfBasligiVar(Buffer.concat([Buffer.alloc(100, 32), deneme()])), true);
    assert.equal(pdfBasligiVar(Buffer.from('ISO-10303-21;')), false);
  });
});

describe('arkon PDF görüntüsü: ayrı süreç', () => {
  const surec = goruntuSureciKur({ sureMs: 60_000 });
  after(() => { surec.kapat(); });
  const isler = goruntuIsleri(goruntuAyari({ res: 900 }));

  test('P-S1 sürece yalnız izinli ortam değişkenleri geçer', () => {
    assert.deepEqual(goruntuOrtami({ PATH: '/bin', TEMP: '/t', TMIV2_PG_PASSWORD: 'x', PGPASSWORD: 'y', HOME: '/h' }), { PATH: '/bin', TEMP: '/t' });
  });

  test('P-S2 PDF olmayan dosya kalıcı hatayla döner; içerik hataya girmez', async () => {
    const y = await surec.hazirla({ veri: new Uint8Array(Buffer.from('gizli-icerik ISO-10303-21;')), sayfa: 1, res: 900, isler });
    assert.equal(y.tamam, false);
    if (y.tamam) return;
    assert.equal(y.kalici, true);
    assert.doesNotMatch(y.hata, /gizli-icerik/);
  });

  test('P-S3 sentetik PDF her imza için PNG verir; olmayan sayfa kalıcı hata', async () => {
    const y = await surec.hazirla({ veri: new Uint8Array(deneme()), sayfa: 1, res: 900, isler });
    assert.equal(y.tamam, true, JSON.stringify(y));
    if (!y.tamam) return;
    // 900 px sayfa 1600 px sığan boydan küçük: yalnız yakınlaşma (hi) görüntüleri çizilir, lo imzaları üretilmez.
    assert.deepEqual(y.goruntuler.map((g) => g.imza).sort(), isler.filter((i) => !i.ayar.lo).map((i) => i.imza).sort());
    for (const g of y.goruntuler) {
      assert.equal(g.genislik, 900);
      assert.equal(g.yukseklik, 600);
      assert.deepEqual([...g.png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
    }
    const yok = await surec.hazirla({ veri: new Uint8Array(deneme()), sayfa: 3, res: 900, isler });
    assert.equal(yok.tamam, false);
    if (!yok.tamam) assert.equal(yok.kalici, true);
  });
});

describe('arkon PDF görüntüsü: iş ve okuma ucu (gerçek PostgreSQL)', () => {
  const PAROLA = 'dogru-parola-1';
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let operator = '';
  let rolsuz = '';
  let yoneticiId = 0;
  const surec = goruntuSureciKur({ sureMs: 60_000 });
  const uyarilar: string[] = [];
  const gunluk = { uyar: (m: string) => { uyarilar.push(m); }, hata: (m: string) => { uyarilar.push(m); } };
  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const ilk = deneme();
  const ikinci = deneme('0 0 0 RG 6 w 20 180 m 280 20 l S');
  const ozet = (b: Buffer): string => createHash('sha256').update(b).digest('hex');
  const isler = goruntuIsleri(goruntuAyari({ res: 900 }));
  const acikHi = isler.find((i) => !i.ayar.koyu && !i.ayar.lo)!.imza;
  const acikLo = isler.find((i) => !i.ayar.koyu && i.ayar.lo)!.imza;

  async function giris(kullaniciAdi: string): Promise<string> {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200);
    return String(c.headers['set-cookie']).split(';')[0] ?? '';
  }
  async function kisi(kullaniciAdi: string, rolKodu: string): Promise<void> {
    const yr = (await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'"))!;
    const rol = (await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]))!;
    await o().vt.tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, id, rol.id);
      await rolAl(db, yoneticiId, id, yr.id);
    });
  }
  async function yukle(icerik: Buffer): Promise<string> {
    const c = await app.inject({ method: 'POST', url: `/api/arkon/dosyalar/${ozet(icerik)}/parca`, headers: { cookie: operator }, payload: { sira: 0, toplam: 1, veri: icerik.toString('base64') } });
    assert.equal(c.statusCode, 200, c.body);
    return ozet(icerik);
  }
  // Arkon'un kendi paketi: iş emri paketi (tmi-ie-) iş emri yoksa gösterilmez, görüntü ucu dosyayı ancak görünen paketten verir.
  const paketYaz = (dosya: string): Promise<unknown> => o().sahip.sorgu(
    `INSERT INTO arkon_belge (depo, kimlik, govde, surum, degistiren_id) VALUES ('pkgs', 'pdf-paket-1', $1, 1, $2)
     ON CONFLICT (depo, kimlik) DO UPDATE SET govde = EXCLUDED.govde, surum = arkon_belge.surum + 1`,
    [JSON.stringify({ id: 'pdf-paket-1', no: 'IE-DENEME', status: 'published', readCfg: { res: 900 }, files: [{ kind: 'pdf', page: 1, bytes: { $blob: dosya, t: 'u8', n: 1 } }] }), yoneticiId],
  );
  const goruntuAl = async (cerez: string, dosya: string, imza: string) => {
    const c = await app.inject({ method: 'GET', url: `/api/arkon/dosyalar/${dosya}/goruntu?sayfa=1&imza=${imza}`, headers: { cookie: cerez } });
    return { durum: c.statusCode, tur: c.headers['content-type'], govde: c.rawPayload };
  };

  before(async () => {
    ortam = await testVeritabaniKur('arkon_pdf_goruntu');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const gecici = (await ortam.vt.tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('gecici_arkon', 'Geçici Arkon') RETURNING id"))!;
    await ortam.vt.sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'arkon.operator'), ($1, 'sayfa.arkon')", [gecici.id]);
    await kisi('operator1', 'gecici_arkon');
    await kisi('satin1', 'satin_alma');
    yonetici = await giris('yonetici');
    operator = await giris('operator1');
    rolsuz = await giris('satin1');
  });
  after(async () => { surec.kapat(); await ortam?.kaldir(); });

  test('P-V1 iş yayındaki paketin PDF\'ini görüntüye çevirir; okuyabilen alır, okuyamayan alamaz; gerekmeyen boy boş döner', async () => {
    const a = await yukle(ilk);
    await paketYaz(a);
    assert.equal((await goruntuAl(yonetici, a, acikHi)).durum, 204, 'iş koşmadan görüntü yok, tablet kendisi çizer');
    assert.equal(await goruntuTuru(o().vt, gunluk, surec), 1);
    const g = await goruntuAl(yonetici, a, acikHi);
    assert.equal(g.durum, 200);
    assert.equal(g.tur, 'image/png');
    assert.deepEqual([...g.govde.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
    assert.equal((await goruntuAl(yonetici, a, acikLo)).durum, 204);
    assert.equal((await goruntuAl(rolsuz, a, acikHi)).durum, 403);
    assert.equal((await goruntuAl(yonetici, a, 'bozuk-imza')).durum, 400);
    // Her şey hazırsa sonraki tur iş bulmaz.
    assert.equal(await goruntuTuru(o().vt, gunluk, surec), 0);
    assert.deepEqual(uyarilar, []);
  });

  test('P-V2 revizyon değişince eski görüntü verilmez: yeni özetin görüntüsü üretilir, eskisi silinir', async () => {
    const a = ozet(ilk);
    const eski = (await goruntuAl(yonetici, a, acikHi)).govde;
    const b = await yukle(ikinci);
    await paketYaz(b);
    assert.equal((await goruntuAl(yonetici, b, acikHi)).durum, 204);
    assert.equal(await goruntuTuru(o().vt, gunluk, surec), 1);
    const yeni = await goruntuAl(yonetici, b, acikHi);
    assert.equal(yeni.durum, 200);
    assert.equal(yeni.govde.equals(eski), false);
    const kalan = await o().sahip.sorgu<{ kaynak: string }>('SELECT DISTINCT kaynak FROM arkon_pdf_goruntu');
    assert.deepEqual(kalan.map((r) => r.kaynak), [b]);
  });

  test('P-V3 PDF olmayan dosya bir kez hatayla kapanır, her turda yeniden denenmez', async () => {
    const c = await yukle(Buffer.from('ISO-10303-21; pdf degil'));
    await paketYaz(c);
    assert.equal(await goruntuTuru(o().vt, gunluk, surec), 1);
    assert.equal(await goruntuTuru(o().vt, gunluk, surec), 0);
    const satirlar = await o().sahip.sorgu<{ hata: string | null }>('SELECT hata FROM arkon_pdf_goruntu WHERE kaynak = $1', [c]);
    assert.equal(satirlar.length, 4);
    assert.ok(satirlar.every((r) => r.hata !== null));
    assert.equal((await goruntuAl(yonetici, c, acikHi)).durum, 204);
  });

  test('P-V6 alt süreç çöker ya da tuval kitaplığı yüklenemezse sunucu ayakta kalır, uç 204 döner, iş bir kez yazıp geçer', async () => {
    const klasor = mkdtempSync(join(tmpdir(), 'pdf-goruntu-bozuk-'));
    try {
      const yuklenemez = join(klasor, 'yuklenemez.mjs'), coker = join(klasor, 'coker.mjs');
      // Yerel ikili yüklenemeyince süreç açılışta düşer (Windows'ta eksik @napi-rs/canvas ikilisi gibi).
      writeFileSync(yuklenemez, "throw new Error('ikili yuklenemedi');\n");
      // İş ortasında çökme (yerel kitaplıkta bellek hatası gibi).
      writeFileSync(coker, "process.on('message', () => process.exit(70));\n");
      for (const [i, giris] of [yuklenemez, coker].entries()) {
        const bozuk = goruntuSureciKur({ giris, sureMs: 20_000 });
        try {
          const dosya = await yukle(deneme(`0 0 0 RG ${String(i + 1)} w 30 30 m 270 170 l S`));
          await paketYaz(dosya);
          uyarilar.length = 0;
          assert.equal(await goruntuTuru(o().vt, gunluk, bozuk), 1);
          assert.equal(uyarilar.length, 1);
          assert.match(uyarilar[0]!, /kapandı/);
          assert.doesNotMatch(uyarilar[0]!, /yuklenemedi/, 'çocuğun hata metni günlüğe taşınmaz');
          assert.equal((await goruntuAl(yonetici, dosya, acikHi)).durum, 204);
          // Aynı dosya her turda süreci yeniden düşürmez.
          assert.equal(await goruntuTuru(o().vt, gunluk, bozuk), 0);
        } finally { bozuk.kapat(); }
      }
      // Ana süreç ve sağlam görüntü süreci çalışmayı sürdürür.
      await paketYaz(await yukle(deneme('0 0 0 RG 3 w 50 50 m 250 150 l S')));
      assert.equal(await goruntuTuru(o().vt, gunluk, surec), 1);
      const saglam = ozet(deneme('0 0 0 RG 3 w 50 50 m 250 150 l S'));
      assert.equal((await goruntuAl(yonetici, saglam, acikHi)).durum, 200);
    } finally { rmSync(klasor, { recursive: true, force: true }); }
  });

  test('P-V4 telefon profili çizim görüntüsü alamaz', async () => {
    await assert.rejects(
      o().vt.okumaTx((db) => pdfGoruntusu(db, { cihazProfili: 'telefon' } as Kullanici, ozet(ikinci), 1, acikHi)),
      (h: unknown) => h instanceof UygulamaHatasi && h.kod === 'YETKI_YOK',
    );
  });
});
