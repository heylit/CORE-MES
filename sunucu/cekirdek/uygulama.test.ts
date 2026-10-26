import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify from 'fastify';
import { z } from 'zod';
import { gizliMi, taninmayanTurler } from '#paylasilan/gizli.ts';
import type { Ayar } from './ayar.ts';
import type { Veritabani } from './db.ts';
import { ucEnvanteri } from './uc.ts';
import { hataYonetiminiKur, modulUclariniKesfet, uygulamaKur } from './uygulama.ts';

const AYAR: Ayar = {
  ortam: 'test',
  port: 4100,
  pg: { host: '127.0.0.1', port: 5432, kullanici: 'k', parola: 'p', veritabani: 'sahte', baglantiSureMs: 5000, sorguSureMs: 20000, okumaSureMs: 20000, havuzBoyutu: 10, kilitSureMs: 5000, bosTxSureMs: 30000 },
  pgTestVeritabani: null,
  commit: null,
};

const sahteVt: Veritabani = {
  sorgu: async <T>(): Promise<T[]> => [],
  tek: async <T>(): Promise<T | null> => null,
  tx: async (is) => is(sahteVt),
  okumaTx: async (is) => is(sahteVt),
  kapat: async () => undefined,
};

// Kimlik yalnız uç katmanında sorulur: sayaç, isteğin keşfedilmiş bir uca ulaştığını modülün
// cevap biçimine ve durum koduna bağlanmadan gösterir.
test('modül keşfi sağlık ucunu ortak kayıt dosyası olmadan bulur ve uygulamaya kaydeder', async () => {
  const kesfedilen = await modulUclariniKesfet();
  assert.equal(kesfedilen.some((u) => u.yontem === 'GET' && u.yol === '/saglik'), true);

  let kimlikSorgusu = 0;
  const app = await uygulamaKur({ vt: sahteVt, ayar: AYAR, kimlik: async () => { kimlikSorgusu += 1; return null; } });
  const cevap = await app.inject({ method: 'GET', url: '/api/saglik' });
  assert.equal(kimlikSorgusu, 1);
  assert.notEqual(cevap.statusCode, 404);

  const bilinmeyen = await app.inject({ method: 'GET', url: '/api/boyle-bir-yol-yok' });
  assert.equal(bilinmeyen.statusCode, 404);
  assert.equal(kimlikSorgusu, 1);
});

test('test dışı ortamda uygulama eksik seçenekle kurulmaz: kimlik, denetim ve tekrar deposu ayrı ayrı zorunludur; test ortamında eksikle kurulur', async () => {
  const tam = {
    vt: sahteVt,
    kimlik: async () => null,
    denetle: async () => undefined,
    tekrar: { ayir: async () => null, sonucYaz: async () => undefined, birak: async () => undefined },
  };
  for (const ortam of ['gelistirme', 'canli'] as const) {
    const ayar: Ayar = { ...AYAR, ortam };
    for (const ad of ['kimlik', 'denetle', 'tekrar'] as const) {
      const { [ad]: _atilan, ...eksik } = tam;
      await assert.rejects(
        uygulamaKur({ ...eksik, ayar }),
        new RegExp(`eksik seçenekle kurulamaz \\(ortam: ${ortam}\\); verilmeyen: ${ad}$`),
        `${ortam} ${ad}`,
      );
      // Aynı eksik seçenek test ortamında engel değildir.
      await (await uygulamaKur({ ...eksik, ayar: AYAR })).close();
    }
    await assert.rejects(uygulamaKur({ vt: sahteVt, ayar }), /verilmeyen: kimlik, denetle, tekrar$/);
    const app = await uygulamaKur({ ...tam, ayar });
    assert.notEqual((await app.inject({ method: 'GET', url: '/api/saglik' })).statusCode, 404);
    await app.close();
  }
});

test('bilinmeyen /api yolu BULUNAMADI gövdesiyle 404 döner', async () => {
  const app = await uygulamaKur({ vt: sahteVt, ayar: AYAR });
  const cevap = await app.inject({ method: 'GET', url: '/api/boyle-bir-yol-yok' });
  assert.equal(cevap.statusCode, 404);
  assert.equal(cevap.json().kod, 'BULUNAMADI');
});

test('beklenmeyen hata 500 SUNUCU döner, iç ayrıntı cevaba sızmaz', async () => {
  const app = Fastify();
  hataYonetiminiKur(app);
  app.get('/patla', async () => {
    throw new Error('relation "gizli_tablo" does not exist');
  });
  const cevap = await app.inject({ method: 'GET', url: '/patla' });
  assert.equal(cevap.statusCode, 500);
  assert.deepEqual(Object.keys(cevap.json()).sort(), ['kod', 'mesaj']);
  assert.equal(cevap.json().kod, 'SUNUCU');
  assert.equal(cevap.body.includes('gizli_tablo'), false);
});

test('bozuk JSON gövdesi 400 DOGRULAMA döner', async () => {
  const app = Fastify();
  hataYonetiminiKur(app);
  app.post('/govde', async () => ({ tamam: true }));
  const cevap = await app.inject({
    method: 'POST',
    url: '/govde',
    headers: { 'content-type': 'application/json' },
    payload: '{bozuk',
  });
  assert.equal(cevap.statusCode, 400);
  assert.equal(cevap.json().kod, 'DOGRULAMA');
});

// Gövdesi deftere girmeyen ('govdesiz') ya da hiç denetlenmeyen ('yok') uçlar. Her satır kullanıcı kararıdır (kart #212;
// sayım uçları kart #189): listeye uç eklemek denetimin kapsamını daraltır; karar karta yazılmadan güncellenmez.
// '+secim': uç gövdeden deftere alan seçer (kart #231). Seçim serbest metin taşıyabilir ve maske yalnız alan adına bakar:
// seçici eklemek ya da kaldırmak da karardır.
const TAM_DENETLENMEYEN_UCLAR = [
  // Güncelleme paketi parçası: içerik deftere girmez (kart #870, kullanıcı kararı 2026-10-12).
  'POST /guncelleme/yuklemeler/:kimlik/parca govdesiz',
  'POST /arkon/dosyalar/:ozet/parca govdesiz',
  'POST /arkon/dosyalar/eksikler govdesiz',
  // Dosya saklama yüklemesi: içerik deftere girmez (kart #82, DS9 a).
  'POST /dosyalar/:ozet/parca govdesiz',
  'POST /dosyalar/eksikler govdesiz',
  'POST /malzeme-katalogu-kartlari/:kimlik/kaydet govdesiz+secim',
  'POST /malzeme-katalogu-sablonlari/:kimlik/kaydet govdesiz',
  'POST /satin-alma-talepleri/ac govdesiz',
  'POST /satin-alma-talepleri/:id/kaydet govdesiz',
  'POST /finans/toplu-ice-aktar govdesiz',
  'POST /portal/ekler/yukle govdesiz+secim',
  // Mesaj eki: içerik (base64) deftere girmez, ad ve tür girer (kullanıcı kararı 12.10.2026, "girmesin").
  'POST /mesaj/ekler/yukle govdesiz+secim',
  // Denetim hazırlığı ek yüklemesi: içerik (base64) deftere girmez, ad ve tür girer (kullanıcı kararı 12.10.2026, "girmesin").
  'POST /denetim-hazirlik/ekler/yukle govdesiz+secim',
  // CNC Kurulum Motoru her değişiklikte bütün durumunu yazar: gövde deftere girmez, anahtar ve beklenen sürüm girer (kullanıcı kararı, 12.10.2026).
  'POST /cnc-kurulum/kayitlar/yaz govdesiz+secim',
  // Reçete ve Rota Motoru da her değişiklikte bütün durumunu yazar: aynı kalıp (paket varsayımı, 13.10.2026).
  'POST /recete-rota/kayitlar/yaz govdesiz+secim',
  // Planlama çalışması aynı kayıttan plan modülüne taşındı (658 b, 662 a): aynı kalıp, kapsam genişlemez.
  'POST /plan/planlama-kayitlari/yaz govdesiz+secim',
  // Kalite Merkezi kaydı fotoğraf taşır: içerik deftere girmez; kayıt adresle, sürüm ve geri yüklemenin parça bilgisi seçimle girer (kullanıcı kararı 16.10.2026, "Gövdesiz").
  'POST /kalite-merkezi/kayitlar/:koleksiyon/:kimlik/yaz govdesiz+secim',
  'POST /kalite-merkezi/geri-yukle govdesiz+secim',
];

// 385 a: dosya veren okuma ucu dosyayı verirken denetime yazılır. Yalnız ekranın kendiliğinden yüklediği, kişinin dosya olarak
// açmadığı dosyalar yazılmaz (koordinatör kapsam daraltması 21.10.2026: atölye haritasının 3B modelleri).
const KENDILIGINDEN_YUKLENEN_DOSYALAR = [
  'GET /atolye/istasyonlar/:id/merkez-modeli',
  'GET /atolye/malzemeler/:no/merkez-modeli',
];

test('indirme denetimi kapsamı: denetime yazılmayan dosya uçları onaylı sabit listeyle aynıdır (385 a)', async () => {
  const uclar = await modulUclariniKesfet();
  assert.equal(uclar.some((u) => u.ikili && u.yol === '/cizimler/:id/revizyonlar/:revizyonId/dosya'), true);
  const disarida = ucEnvanteri(uclar).filter((u) => u.kendiligindenYuklenir === true).map((u) => `${u.yontem} ${u.yol}`).sort();
  assert.deepEqual(disarida, [...KENDILIGINDEN_YUKLENEN_DOSYALAR].sort(),
    'İndirme denetiminin kapsamı değişti: bir dosya ucu deftere yazılmıyor. Bu kullanıcı kararıdır (385 a); karar alınmadan liste güncellenmez.');
});

test('denetim kapsamı: gövdesiz ya da denetimsiz uçlar kullanıcı kararıyla onaylanmış sabit listeyle aynıdır (kart #212)', async () => {
  const yazmalar = (await modulUclariniKesfet()).filter((u) => u.yontem !== 'GET');
  // Keşif gerçekten yazma uçlarını getiriyor ve kipi okuyor: boş listede karşılaştırma kendiliğinden geçerdi.
  assert.equal(yazmalar.some((u) => u.yol === '/oturum/giris' && u.denetim === 'tam'), true);
  const daraltilmis = ucEnvanteri(yazmalar).filter((u) => u.denetim !== undefined)
    .map((u) => `${u.yontem} ${u.yol} ${u.denetim}${u.denetimSecimi === true ? '+secim' : ''}`).sort();
  assert.deepEqual(
    daraltilmis,
    [...TAM_DENETLENMEYEN_UCLAR].sort(),
    'Denetim kaydının kapsamı değişti: bir ucun gövdesi deftere girmiyor ya da uç hiç denetlenmiyor. Bu kullanıcı kararıdır (kart #212); '
      + 'karar alınmadan TAM_DENETLENMEYEN_UCLAR listesi güncellenmez.',
  );
});

// Adı sır taşıdığını söyleyen gövde alanı sözleşmede gizli işaretlidir (kart #1584): ad listesi yalnız ikinci katmandır;
// işaretsiz yeni alan (ör. "eski") deftere düz girerdi ve defter silinemez.
const SIR_ADI = /^eski$|pin$|parola|sifre|password/i;
test('denetim: sır adlı her gövde alanı sözleşmede gizli işaretlidir (kart #1584)', async () => {
  const yazmalar = (await modulUclariniKesfet()).filter((u) => u.yontem !== 'GET' && u.govde !== null);
  const sirlar: string[] = [];
  const isaretsiz: string[] = [];
  for (const u of yazmalar) {
    let sema = u.govde as z.ZodTypeAny;
    while (sema instanceof z.ZodEffects) sema = sema.innerType() as z.ZodTypeAny;
    if (!(sema instanceof z.ZodObject)) continue;
    for (const [ad, alan] of Object.entries(sema.shape as Record<string, z.ZodTypeAny>)) {
      if (!SIR_ADI.test(ad)) continue;
      sirlar.push(`${u.yontem} ${u.yol} ${ad}`);
      let ic = alan;
      while (!gizliMi(ic) && (ic instanceof z.ZodOptional || ic instanceof z.ZodNullable)) ic = ic.unwrap() as z.ZodTypeAny;
      if (!gizliMi(ic)) isaretsiz.push(`${u.yontem} ${u.yol} ${ad}`);
    }
  }
  assert.equal(sirlar.includes('POST /hesabim/pin-degistir eski'), true, 'keşif PIN değiştirme gövdesini okumuyor');
  assert.deepEqual(isaretsiz, [], 'Sır taşıyan gövde alanı gizli(...) ile işaretlenmeli (paylasilan/gizli.ts).');
});

// Defter maskesi tanımadığı türü kapalı tutar (değeri "[gizli]" yazar). Uç şemalarında öyle tür olmamalı: olursa defter
// o alanı göstermez; maskeye yeni türü öğretmek gerekir.
test('denetim: her uç şemasındaki her türü gizli alan maskesi tanır', async () => {
  const taninmayan: string[] = [];
  for (const u of await modulUclariniKesfet()) {
    for (const [ad, sema] of [['parametre', u.parametre], ['govde', u.govde]] as const) {
      const turler = taninmayanTurler(sema as z.ZodTypeAny | null);
      if (turler.length > 0) taninmayan.push(`${u.yontem} ${u.yol} ${ad}: ${[...new Set(turler)].join(', ')}`);
    }
  }
  assert.deepEqual(taninmayan, []);
});
