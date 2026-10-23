import { strict as assert } from 'node:assert';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { KosuKaydi } from '../../ekran-testleri/benzetim/kayit.ts';
import {
  adimlariAyikla, adimlariOku, araSiraDusenler, egilim, ekTuru, ekYolu, kosulariListele, ozetOku, portOku, rolBasinaSon,
  sonKosular, sonucKokuOku, suzgec, ucSureleri, yorumOku, yuzdelik,
} from './okuma.js';

const kok = mkdtempSync(join(tmpdir(), 'tmiv2-izleme-test-'));
const kokEk = mkdtempSync(join(tmpdir(), 'tmiv2-izleme-ek-'));
const dis = mkdtempSync(join(tmpdir(), 'tmiv2-izleme-dis-'));
after(() => { for (const k of [kok, kokEk, dis]) rmSync(k, { recursive: true, force: true }); });

const adim = (ek) => ({
  gun: 1, rol: 'ornek.depo', senaryo: 'BNZ-s', adim: 'stok girisi', tur: 'api', sonuc: 'gecti', sureMs: 10,
  yontem: 'POST', yol: '/stok/giris', beklenen: '200', gelen: '200', ileti: null, ek: [], ...ek,
});

function kosuAc(kosuId, saat, satirlar, kokAdi = kok) {
  const k = new KosuKaydi({
    kok: kokAdi, kosuId, taban: 'abc1234', tohum: 1, gunSayisi: 2, roller: ['ornek.depo', 'ornek.planlama'], senaryolar: ['BNZ-s'],
    model: { kip: 'kapali', ustSinir: 0 }, simdi: () => new Date(`2026-10-23T${saat}:00Z`),
  });
  for (const s of satirlar) k.adim(s);
  return k;
}

describe('ayar', () => {
  it('port varsayılanı 4200, geçersizi reddeder', () => {
    assert.equal(portOku({}), 4200);
    assert.equal(portOku({ TMIV2_ROBOT_IZLEME_PORT: '4300' }), 4300);
    assert.throws(() => portOku({ TMIV2_ROBOT_IZLEME_PORT: 'x' }), /geçersiz/);
    assert.throws(() => portOku({ TMIV2_ROBOT_IZLEME_PORT: '70000' }), /geçersiz/);
  });
  it('sonuç kökü robotla aynı varsayılanı kullanır', () => {
    assert.equal(sonucKokuOku({}), join(tmpdir(), 'tmiv2-robot'));
    assert.equal(sonucKokuOku({ TMIV2_ROBOT_SONUC: dis }), dis);
  });
});

describe('koşu okuma (robotun KosuKaydi ile yazdığı dosyalar)', () => {
  const k1 = kosuAc('kosu-1', '10:00', [adim({}), adim({ sonuc: 'dustu', adim: 'sevk', sureMs: 900 })]);
  k1.bitir('bitti');
  const k2 = kosuAc('kosu-2', '11:00', [adim({ sonuc: 'dustu' }), adim({ rol: 'ornek.planlama', sonuc: 'ara-sira', adim: 'plan oku', yol: '/plan', yontem: 'GET' })]);

  it('listeler, yeniden eskiye sıralar, sürüm dışı özeti hatasıyla gösterir', () => {
    mkdirSync(join(kok, 'eski-surum'));
    writeFileSync(join(kok, 'eski-surum', 'ozet.json'), JSON.stringify({ surum: 99, kosuId: 'eski-surum', baslangic: '2026-01-01' }));
    mkdirSync(join(kok, 'ozetsiz'));
    const liste = kosulariListele(kok);
    assert.deepEqual(liste.filter((k) => k.ozet).map((k) => k.kosuId), ['kosu-2', 'kosu-1']);
    assert.match(liste.find((k) => k.kosuId === 'eski-surum').hata, /sürüm 99/);
    assert.equal(liste.some((k) => k.kosuId === 'ozetsiz'), false);
  });
  it('kök yoksa boş liste', () => {
    assert.deepEqual(kosulariListele(join(dis, 'yok')), []);
  });
  it('özet ve adımlar okunur; kimliği geçersiz koşu okunmaz', () => {
    assert.equal(ozetOku(kok, 'kosu-2').durum, 'kosuyor');
    assert.equal(ozetOku(kok, 'kosu-1').durum, 'bitti');
    assert.equal(adimlariOku(kok, 'kosu-2').adimlar.length, 2);
    assert.equal(ozetOku(kok, '../kosu-1'), null);
    assert.equal(adimlariOku(kok, '..'), null);
    assert.equal(yorumOku(kok, 'kosu-1'), null);
    k1.yorumYaz('BNZ yorum');
    assert.equal(yorumOku(kok, 'kosu-1'), 'BNZ yorum');
  });
  it('yazılmakta olan son satır bozuk sayılmaz, bozuk satır nedeniyle döner', () => {
    appendFileSync(join(k2.klasor, 'adimlar.jsonl'), '{"yarim":');
    const o = adimlariOku(kok, 'kosu-2');
    assert.equal(o.adimlar.length, 2);
    assert.equal(o.yazilmakta, true);
    assert.deepEqual(o.bozuk, []);
    const b = adimlariAyikla('{bozuk}\n\n');
    assert.deepEqual(b.bozuk, [{ satir: 1, neden: 'JSON değil' }]);
    assert.equal(b.yazilmakta, false);
  });
  it('eğilim ve ara sıra son koşulardan hesaplanır', () => {
    const son = sonKosular(kok);
    assert.deepEqual(son.map((k) => k.ozet.kosuId), ['kosu-2', 'kosu-1']);
    const e = egilim(son);
    assert.deepEqual(e.map((k) => k.kosuId), ['kosu-1', 'kosu-2']);
    assert.deepEqual(e[1].yeniDusen, ['BNZ-s / stok girisi']);
    assert.deepEqual(araSiraDusenler(son).map((a) => a.adim), ['BNZ-s / plan oku']);
  });
});

describe('ek yolu koşu klasörü dışına çıkamaz', () => {
  const k = kosuAc('ekli', '12:00', [], kokEk);
  const yol = k.ek('ekran.png', 'png');
  writeFileSync(join(dis, 'gizli.txt'), 'dis');
  writeFileSync(join(k.klasor, 'ozet-kopya.json'), '{}');

  it('ekler altındaki dosya verilir', () => {
    assert.equal(ekYolu(kokEk, 'ekli', yol)?.endsWith('ekran.png'), true);
  });
  for (const kotu of ['../../kosu-1/ozet.json', 'ekler/../ozet.json', 'ozet-kopya.json', '/etc/passwd', 'C:/x.png', 'ekler\\..\\ozet.json',
    'ekler/yok.png', 'ekler', '', 'ekler/a\0.png', join(dis, 'gizli.txt')]) {
    it(`reddedilir: ${JSON.stringify(kotu)}`, () => { assert.equal(ekYolu(kokEk, 'ekli', kotu), null); });
  }
  it('geçersiz koşu kimliği reddedilir', () => { assert.equal(ekYolu(kokEk, '..', 'ekler/ekran.png'), null); });
  it('bağlantı (symlink) ile dışarı çıkış reddedilir', (t) => {
    try {
      symlinkSync(join(dis, 'gizli.txt'), join(k.klasor, 'ekler', 'baglanti.txt'));
    } catch {
      t.skip('bu sistemde bağlantı kurulamıyor (Windows yetkisi)');
      return;
    }
    assert.equal(ekYolu(kokEk, 'ekli', 'ekler/baglanti.txt'), null);
  });
  it('bilinmeyen tür indirilir', () => {
    assert.equal(ekTuru('ekler/a.png'), 'image/png');
    assert.equal(ekTuru('ekler/iz.zip'), 'application/octet-stream');
    assert.equal(ekTuru('ekler/a.html'), 'application/octet-stream');
  });
});

describe('saf hesaplar', () => {
  it('yüzdelik veri yoksa null', () => {
    assert.equal(yuzdelik([], 0.95), null);
    assert.equal(yuzdelik([5], 0.5), 5);
    assert.equal(yuzdelik([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.5), 5);
    assert.equal(yuzdelik([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95), 10);
  });
  it('uç süreleri yolsuz adımı saymaz, p95 büyükten küçüğe', () => {
    const u = ucSureleri([adim({ sureMs: 5 }), adim({ sureMs: 50, yol: '/a', yontem: 'GET' }), adim({ yol: null, yontem: null, tur: 'ekran' })]);
    assert.deepEqual(u.map((x) => x.uc), ['GET /a', 'POST /stok/giris']);
  });
  it('rol başına son adım', () => {
    const s = rolBasinaSon([adim({ adim: 'a' }), adim({ rol: 'ornek.kalite', adim: 'b' }), adim({ adim: 'c' })]);
    assert.deepEqual(s.map((a) => `${a.rol}:${a.adim}`), ['ornek.depo:c', 'ornek.kalite:b']);
  });
  it('süzgeç sırayı korur', () => {
    const s = suzgec([adim({}), adim({ sonuc: 'dustu' }), adim({ sonuc: 'dustu', gun: 2 })], { sonuc: 'dustu', gun: 2 });
    assert.deepEqual(s.map((a) => a.sira), [2]);
  });
  it('eğilim: düzelen ve yavaşlayan uç; önceki koşuda olmayan kıyaslanmaz', () => {
    const kosu = (id, saat, adimlar) => ({ ozet: { kosuId: id, baslangic: `2026-10-23T${saat}:00Z`, taban: null }, adimlar });
    const e = egilim([
      kosu('b', '11:00', [adim({ sureMs: 1000 }), adim({ adim: 'yeni', sonuc: 'dustu' })]),
      kosu('a', '10:00', [adim({ sureMs: 100 }), adim({ adim: 'eski', sonuc: 'dustu' })]),
    ]);
    assert.deepEqual(e[0].yeniDusen, []);
    assert.deepEqual(e[1].yeniDusen, []);
    assert.deepEqual(e[1].duzelen, []);
    assert.deepEqual(e[1].yavaslayan, [{ uc: 'POST /stok/giris', onceki: 100, simdi: 1000 }]);
    const d = egilim([kosu('a', '10:00', [adim({ sonuc: 'dustu' })]), kosu('b', '11:00', [adim({})])]);
    assert.deepEqual(d[1].duzelen, ['BNZ-s / stok girisi']);
  });
});
