import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { ISLEMLER } from '#paylasilan/islemler.ts';
import { kisininIslemleri, matrisMetni, secimOku, yetkiMatrisiOku } from './yetki-matrisi-oku.ts';
import type { YetkiMatrisi } from './yetki-matrisi-oku.ts';

// Komut, oturumun yetki hesabıyla (rollerin işlemleri + kişiye verilen ek işlemler, yönetici bayrağı hepsi) aynı sonucu
// göstermelidir; yoksa "kimde ne var" sorusuna yanlış cevap verir.
describe('yetki matrisi komutu (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let matris: YetkiMatrisi;

  before(async () => {
    ortam = await testVeritabaniKur('yetkikomut');
    await ortam.vt.tx(async (tx) => {
      const ekle = async (kullanici: string, ad: string, roller: string[], ek: string[]): Promise<void> => {
        const kisi = await tx.tek<{ id: number }>(
          `INSERT INTO kisi (ad, kullanici_adi, parola_ozeti) VALUES ($1, $2, 'ozet') RETURNING id`, [ad, kullanici]);
        if (kisi === null) throw new Error('kişi eklenemedi');
        await tx.sorgu('INSERT INTO kisi_rolu (kisi_id, rol_id) SELECT $1, id FROM rol WHERE kod = ANY($2)', [kisi.id, roller]);
        for (const islem of ek) await tx.sorgu('INSERT INTO kisi_islemi (kisi_id, islem, veren_id) VALUES ($1, $2, $1)', [kisi.id, islem]);
      };
      await ekle('ornek.op', 'Örnek Operatör', ['operator'], ['arkon.planlama']);
      await ekle('ornek.yon', 'Örnek Yönetici', ['yonetici'], []);
      await ekle('ornek.iki', 'Örnek İki Rol', ['depo', 'kalite'], []);
      await tx.sorgu(`INSERT INTO kisi (ad, aktif, kullanici_adi, parola_ozeti) VALUES ('Pasif', false, NULL, NULL)`);
    });
    matris = await yetkiMatrisiOku(ortam.vt);
  });
  after(async () => { await ortam?.kaldir(); });

  test('yalnız etkin ve girişli kişiler; kişinin işlemleri rolleri ile ek işlemlerinin birleşimi, yönetici hepsi', () => {
    assert.deepEqual(matris.kisiler.map((k) => k.kullaniciAdi), ['ornek.iki', 'ornek.op', 'ornek.yon']);
    const kisi = (ad: string) => matris.kisiler.find((k) => k.kullaniciAdi === ad)!;
    const op = kisininIslemleri(matris, kisi('ornek.op'));
    assert.equal(op.includes('arkon.planlama'), true);
    assert.equal(op.includes('arkon.operator'), true);
    assert.equal(op.includes('finans.oku'), false);
    assert.deepEqual(kisininIslemleri(matris, kisi('ornek.yon')), [...ISLEMLER].sort());
    const iki = kisininIslemleri(matris, kisi('ornek.iki'));
    assert.equal(iki.includes('stok.giris') && iki.includes('kalibrasyon.yaz'), true);
  });

  test('--islem işlemin rollerini ve kişilerini, nereden geldiğiyle gösterir', () => {
    const metin = matrisMetni(matris, { tur: 'islem', deger: 'arkon.planlama' });
    assert.match(metin, /roller: yonetici planlama_proje/);
    assert.match(metin, /ornek\.op \(Örnek Operatör\): ek işlem/);
    assert.match(metin, /ornek\.yon \(Örnek Yönetici\): rolden yonetici/);
    assert.doesNotMatch(metin, /ornek\.iki/);
    assert.match(matrisMetni(matris, { tur: 'islem', deger: 'boyle.bir-islem' }), /kayıtlı bir işlem değil/);
  });

  test('genel görünüm rolleri, yalnız yöneticide olanları ve ek işlemli kişiyi sayar; --kisi ve --rol ayrıntı verir', () => {
    const metin = matrisMetni(matris, { tur: 'hepsi' });
    assert.match(metin, /yonetici \(Yönetici\): bütün sayfa ve işlemler/);
    assert.match(metin, /# Yalnız yöneticide: .*kisiler\.rol-yonet/);
    assert.match(metin, /ornek\.op \(Örnek Operatör\): operator \+ ek: arkon\.planlama/);
    assert.match(metin, /ek işlem verilmiş kişi: 1/);
    assert.match(matrisMetni(matris, { tur: 'kisi', deger: 'ornek.iki' }), /roller: depo kalite/);
    assert.match(matrisMetni(matris, { tur: 'rol', deger: 'operator' }), /işlemler: .*terminal\.uret/);
    assert.match(matrisMetni(matris, { tur: 'rol', deger: 'yok' }), /rolü yok/);
  });

  test('argümanlar: boş hepsi, tek bayrak ve değer; başka biçim kullanımı gösterir', () => {
    assert.deepEqual(secimOku([]), { tur: 'hepsi' });
    assert.deepEqual(secimOku(['--islem', 'stok.giris']), { tur: 'islem', deger: 'stok.giris' });
    assert.equal(secimOku(['--islem']), null);
    assert.equal(secimOku(['--baska', 'x']), null);
    assert.equal(secimOku(['--rol', 'a', 'b']), null);
  });
});
