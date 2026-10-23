import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { haritaUclariniOku, ornekYol, oturumluYazmalar, yetkisizYazmalar } from './harita-uclari.ts';

// araclar/harita.ts haritaMetni biçiminde, uydurma modül ve işlem adlarıyla.
const METIN = [
  'bnz-bir',
  '  sunucu var, istemci var (rota var), sözleşme yok',
  '  Uçlar (5)',
  '    GET   /bnz-bir/liste                 biri:bnz-bir.oku|bnz-bir.yaz',
  '    POST  /bnz-bir/:id/kaydet            bnz-bir.yaz                   denetim:govdesiz',
  '    POST  /bnz-bir/:id/belge/:belgeId    biri:bnz-bir.yaz|bnz-iki.yaz',
  '    POST  /bnz-bir/giris                 acik                          txDisi',
  '    POST  /bnz-bir/hesabim               oturum',
  '  İşlemler (2): bnz-bir.oku, bnz-bir.yaz',
  '  Tablolar (0)',
  '    yok',
  '',
  'bnz-iki',
  '  sunucu yok, istemci var (rota yok), sözleşme yok',
  '',
  'bnz-uc',
  '  sunucu var, istemci yok, sözleşme yok',
  '  Uçlar (0)',
  '    yok',
  '  İşlemler (0): yok',
  '',
  'Modüle ait olmayanlar',
  '  Göçler (1)',
  '    POST  /bu-uc-degil    bnz.yaz',
].join('\n');

describe('harita uçları', () => {
  it('modül, yöntem, yol ve yetkiyi okur; uç bölümü dışını almaz', () => {
    const uclar = haritaUclariniOku(METIN);
    assert.equal(uclar.length, 5);
    assert.deepEqual(uclar[0], { modul: 'bnz-bir', yontem: 'GET', yol: '/bnz-bir/liste', yetki: { tur: 'biri', islemler: ['bnz-bir.oku', 'bnz-bir.yaz'] } });
    assert.deepEqual(uclar[1]?.yetki, { tur: 'islem', islem: 'bnz-bir.yaz' });
    assert.deepEqual(uclar[3]?.yetki, { tur: 'acik' });
    assert.deepEqual(uclar[4]?.yetki, { tur: 'oturum' });
    assert.ok(uclar.every((u) => u.modul === 'bnz-bir'));
  });

  it('Windows satır sonunu da okur', () => {
    assert.equal(haritaUclariniOku(METIN.replace(/\n/g, '\r\n')).length, 5);
  });

  it('başlıktaki sayı tutmazsa hata atar: biçim kayması eksik liste vermez', () => {
    assert.throws(() => haritaUclariniOku(METIN.replace('Uçlar (5)', 'Uçlar (6)')), /6 uç bekleniyordu, 5 okundu/);
    assert.throws(() => haritaUclariniOku(METIN.replace('Uçlar (5)', 'Uçlar (4)')), /4 uç bekleniyordu/);
  });

  it('okunamayan satır ve yetki hata atar', () => {
    assert.throws(() => haritaUclariniOku(METIN.replace('POST  /bnz-bir/hesabim', 'GONDER  /bnz-bir/hesabim')), /Uç satırı okunamadı/);
    assert.throws(() => haritaUclariniOku(METIN.replace('    POST  /bnz-bir/hesabim               oturum', '    POST  /bnz-bir/hesabim')), /Uç satırı okunamadı/);
    assert.throws(() => haritaUclariniOku(METIN.replace('oturum\n', 'Oturum!\n')), /Uç yetkisi okunamadı/);
    assert.throws(() => haritaUclariniOku(METIN.replace('biri:bnz-bir.oku|bnz-bir.yaz', 'biri:')), /Uç yetkisi okunamadı/);
  });

  it('boş metin boş liste verir', () => {
    assert.deepEqual(haritaUclariniOku(''), []);
  });
});

describe('reddedilecek uçlar', () => {
  const uclar = haritaUclariniOku(METIN);
  const yollar = (l: readonly { yontem: string; yol: string }[]): string[] => l.map((u) => `${u.yontem} ${u.yol}`);

  it('işlemsiz rol işlem isteyen bütün yazma uçlarında reddedilir; okuma, oturum ve açık uç denenmez', () => {
    assert.deepEqual(yollar(yetkisizYazmalar(uclar, [])), ['POST /bnz-bir/:id/kaydet', 'POST /bnz-bir/:id/belge/:belgeId']);
  });

  it('işlemi olan rol o uçta denenmez; "biri" uçta tek işlem yeter', () => {
    assert.deepEqual(yollar(yetkisizYazmalar(uclar, ['bnz-bir.yaz'])), []);
    assert.deepEqual(yollar(yetkisizYazmalar(uclar, ['bnz-iki.yaz'])), ['POST /bnz-bir/:id/kaydet']);
    assert.deepEqual(yollar(yetkisizYazmalar(uclar, ['bnz-bir.oku'])), ['POST /bnz-bir/:id/kaydet', 'POST /bnz-bir/:id/belge/:belgeId']);
  });

  it('oturumsuz istek açık uç dışındaki bütün yazma uçlarında reddedilir', () => {
    assert.deepEqual(yollar(oturumluYazmalar(uclar)), ['POST /bnz-bir/:id/kaydet', 'POST /bnz-bir/:id/belge/:belgeId', 'POST /bnz-bir/hesabim']);
  });

  it('yol parametreleri sayıyla doldurulur', () => {
    assert.equal(ornekYol('/bnz-bir/:id/belge/:belgeId'), '/bnz-bir/1/belge/1');
    assert.equal(ornekYol('/bnz/:kod(\\d+)/sil'), '/bnz/1/sil');
    assert.equal(ornekYol('/bnz/liste'), '/bnz/liste');
  });
});
