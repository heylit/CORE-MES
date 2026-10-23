import { createReadStream, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { SONUCLAR } from '../../ekran-testleri/benzetim/sozlesme.ts';
import {
  KOSU_KIMLIGI, adimlariOku, araSiraDusenler, egilim, ekTuru, ekYolu, kosulariListele, ozetOku, portOku, rolBasinaSon,
  sonKosular, sonucKokuOku, suzgec, ucSureleri, yorumOku,
} from './okuma.js';

// Robot izleme uygulaması: ana uygulamadan ayrı tek süreç, yalnız 127.0.0.1, yalnız okuma (GET). Koşu klasörü dışında
// hiçbir yere bağlanmaz; chart.js depodaki paketten servis edilir, CDN yoktur.

export const ADRES = '127.0.0.1';
const BURASI = dirname(fileURLToPath(import.meta.url));
const CHART_JS = join(dirname(createRequire(import.meta.url).resolve('chart.js')), 'chart.umd.js');
export const SAYFA_BOYU = 50;

const DURAGAN = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/uygulama.js': ['uygulama.js', 'text/javascript; charset=utf-8'],
  '/stil.css': ['stil.css', 'text/css; charset=utf-8'],
};

// Başka sitenin sayfası tarayıcı üzerinden bu sürece istek atamasın: yalnız yerel ad kabul edilir (DNS yeniden bağlama).
const yerelAd = (host, port) => [`127.0.0.1:${String(port)}`, `localhost:${String(port)}`].includes(String(host ?? '').toLowerCase());

const tamSayiMi = (d) => typeof d === 'string' && /^\d+$/.test(d);

export function izlemeKur({ kok, port, gunluk = false }) {
  const app = Fastify({ logger: gunluk });

  app.addHook('onRequest', async (istek, cevap) => {
    if (!yerelAd(istek.headers.host, port)) return cevap.code(421).send({ hata: 'yalnız 127.0.0.1' });
    if (istek.method !== 'GET' && istek.method !== 'HEAD') return cevap.code(405).header('allow', 'GET').send({ hata: 'izleme yalnız okur' });
  });
  app.addHook('onSend', async (_istek, cevap, govde) => {
    cevap.header('content-security-policy', "default-src 'self'; img-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    cevap.header('x-content-type-options', 'nosniff');
    cevap.header('referrer-policy', 'no-referrer');
    cevap.header('cache-control', 'no-store');
    return govde;
  });

  for (const [yol, [dosya, tur]] of Object.entries(DURAGAN)) {
    app.get(yol, async (_i, c) => c.type(tur).send(readFileSync(join(BURASI, dosya))));
  }
  app.get('/favicon.ico', async (_i, c) => c.code(204).send());
  app.get('/chart.js', async (_i, c) => c.type('text/javascript; charset=utf-8').send(readFileSync(CHART_JS)));

  const kosuyuBul = (id, cevap) => {
    if (!KOSU_KIMLIGI.test(id)) { cevap.code(400).send({ hata: 'koşu kimliği geçersiz' }); return null; }
    const ozet = ozetOku(kok, id);
    if (ozet === null) { cevap.code(404).send({ hata: 'koşu yok' }); return null; }
    if (typeof ozet === 'string') { cevap.code(422).send({ hata: `özet okunamadı: ${ozet}` }); return null; }
    const okunan = adimlariOku(kok, id) ?? { adimlar: [], bozuk: [], yazilmakta: false };
    return { ozet, ...okunan };
  };

  app.get('/api/kosular', async () => ({ kok, kosular: kosulariListele(kok) }));

  app.get('/api/kosular/:id', async (istek, cevap) => {
    const k = kosuyuBul(istek.params.id, cevap);
    if (k === null) return cevap;
    return {
      ozet: k.ozet,
      adimSayisi: k.adimlar.length,
      bozuk: k.bozuk,
      yazilmakta: k.yazilmakta,
      sonAdimlar: rolBasinaSon(k.adimlar).map((a) => ({ ...a, sira: k.adimlar.lastIndexOf(a) })),
      roller: [...new Set(k.adimlar.map((a) => a.rol))].sort(),
      senaryolar: [...new Set(k.adimlar.map((a) => a.senaryo))].sort(),
      gunler: [...new Set(k.adimlar.map((a) => a.gun))].sort((x, y) => x - y),
      uclar: ucSureleri(k.adimlar).slice(0, 20),
      yorumVar: yorumOku(kok, k.ozet.kosuId) !== null,
    };
  });

  app.get('/api/kosular/:id/adimlar', async (istek, cevap) => {
    const k = kosuyuBul(istek.params.id, cevap);
    if (k === null) return cevap;
    const { sonuc, rol, senaryo, gun, sayfa } = istek.query;
    if (sonuc !== undefined && !SONUCLAR.includes(sonuc)) return cevap.code(400).send({ hata: 'sonuc bilinmiyor' });
    if ((gun !== undefined && !tamSayiMi(gun)) || (sayfa !== undefined && !tamSayiMi(sayfa))) return cevap.code(400).send({ hata: 'gun ve sayfa tam sayı' });
    const hepsi = suzgec(k.adimlar, { sonuc, rol, senaryo, gun: gun === undefined ? undefined : Number(gun) });
    // Son adımlar önce: canlı koşuda yeni gelen satır ilk sayfadadır.
    const ters = hepsi.reverse();
    const s = sayfa === undefined ? 0 : Number(sayfa);
    return { toplam: ters.length, sayfa: s, sayfaBoyu: SAYFA_BOYU, adimlar: ters.slice(s * SAYFA_BOYU, (s + 1) * SAYFA_BOYU) };
  });

  app.get('/api/kosular/:id/adimlar/:sira', async (istek, cevap) => {
    const k = kosuyuBul(istek.params.id, cevap);
    if (k === null) return cevap;
    const { sira } = istek.params;
    if (!tamSayiMi(sira) || Number(sira) >= k.adimlar.length) return cevap.code(404).send({ hata: 'adım yok' });
    const a = k.adimlar[Number(sira)];
    return { sira: Number(sira), ...a, ek: a.ek.map((yol) => ({ yol, var: ekYolu(kok, k.ozet.kosuId, yol) !== null, tur: ekTuru(yol) })) };
  });

  app.get('/api/kosular/:id/ek', async (istek, cevap) => {
    const { id } = istek.params;
    if (!KOSU_KIMLIGI.test(id)) return cevap.code(400).send({ hata: 'koşu kimliği geçersiz' });
    const yol = ekYolu(kok, id, istek.query.yol);
    if (yol === null) return cevap.code(404).send({ hata: 'ek yok ya da koşu klasörü dışında' });
    const tur = ekTuru(yol);
    if (tur === 'application/octet-stream') cevap.header('content-disposition', 'attachment');
    return cevap.type(tur).send(createReadStream(yol));
  });

  app.get('/api/kosular/:id/yorum', async (istek, cevap) => {
    const { id } = istek.params;
    if (!KOSU_KIMLIGI.test(id)) return cevap.code(400).send({ hata: 'koşu kimliği geçersiz' });
    return { yorum: yorumOku(kok, id) };
  });

  app.get('/api/egilim', async () => ({ kosular: egilim(sonKosular(kok)) }));
  app.get('/api/ara-sira', async () => ({ adimlar: araSiraDusenler(sonKosular(kok)) }));

  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const kok = sonucKokuOku(process.env);
  const port = portOku(process.env);
  const app = izlemeKur({ kok, port, gunluk: { level: 'warn' } });
  await app.listen({ host: ADRES, port });
  console.log(`Robot izleme: http://${ADRES}:${String(port)}  (koşu kökü: ${kok})`);
}
