import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VARSAYILAN_SINIRLAR, zipOku, ZipReddi } from './zip-oku.ts';
import { zipYaz } from './zip-yaz.ts';

const reddedilir = (tampon: Buffer, desen: RegExp, sinirlar = VARSAYILAN_SINIRLAR): void => {
  assert.throws(() => zipOku(tampon, sinirlar), (hata: unknown) => hata instanceof ZipReddi && desen.test(hata.message));
};

test('düz ve sıkıştırılmış girdi içeriğiyle okunur; klasör girdisi dosya sayılmaz', () => {
  const girdiler = zipOku(zipYaz([
    { ad: 'sunucu/' },
    { ad: 'sunucu/moduller/ornek/kurallar.ts', icerik: 'export const A = 1;\n' },
    { ad: 'FARK.md', icerik: 'değişen: kurallar.ts\n'.repeat(50), sikistir: true },
  ]));
  assert.deepEqual(girdiler.map((g) => g.yol), ['sunucu/moduller/ornek/kurallar.ts', 'FARK.md']);
  assert.equal(girdiler[0]?.icerik.toString('utf8'), 'export const A = 1;\n');
  assert.equal(girdiler[1]?.icerik.toString('utf8'), 'değişen: kurallar.ts\n'.repeat(50));
});

test('Windows arşivleyicisinin ters eğik çizgili adı depo yoluna çevrilir', () => {
  const [girdi] = zipOku(zipYaz([{ ad: 'sunucu\\moduller\\ornek\\uclar.ts', icerik: 'x' }]));
  assert.equal(girdi?.yol, 'sunucu/moduller/ornek/uclar.ts');
});

test('yol dışına çıkan girdi arşivin tamamını düşürür', () => {
  const temiz = { ad: 'sunucu/moduller/ornek/kurallar.ts', icerik: 'x' };
  assert.equal(zipOku(zipYaz([temiz])).length, 1);
  reddedilir(zipYaz([temiz, { ad: '../disari.ts', icerik: 'x' }]), /üst klasöre çıkan yol/);
  reddedilir(zipYaz([temiz, { ad: 'sunucu/moduller/ornek/../../cekirdek/uc.ts', icerik: 'x' }]), /üst klasöre çıkan yol/);
  reddedilir(zipYaz([temiz, { ad: 'sunucu\\..\\..\\disari.ts', icerik: 'x' }]), /üst klasöre çıkan yol/);
  reddedilir(zipYaz([temiz, { ad: '/etc/passwd', icerik: 'x' }]), /mutlak yol/);
  reddedilir(zipYaz([temiz, { ad: '\\\\sunucu\\paylasim\\a.ts', icerik: 'x' }]), /mutlak yol/);
  reddedilir(zipYaz([temiz, { ad: 'C:/Windows/a.ts', icerik: 'x' }]), /sürücü harfi/);
  reddedilir(zipYaz([temiz, { ad: 'c:a.ts', icerik: 'x' }]), /sürücü harfi/);
  reddedilir(zipYaz([temiz, { ad: 'sunucu/moduller/ornek/uclar.ts:gizli', icerik: 'x' }]), /izinsiz karakter/);
  reddedilir(zipYaz([temiz, { ad: 'sunucu/moduller/ornek/nul.ts', icerik: 'x' }]), /aygıt adı/);
  reddedilir(zipYaz([temiz, { ad: 'sunucu/moduller/ornek/uclar.ts.', icerik: 'x' }]), /noktayla biten ad/);
});

test('sembolik bağ ve özel dosya reddedilir; Unix kipli sıradan dosya okunur', () => {
  assert.equal(zipOku(zipYaz([{ ad: 'a.ts', icerik: 'x', kip: 0o100644 }])).length, 1);
  reddedilir(zipYaz([{ ad: 'sunucu/moduller/ornek/bag.ts', icerik: '../../cekirdek/uc.ts', kip: 0o120777 }]), /sembolik bağ/);
  reddedilir(zipYaz([{ ad: 'boru', kip: 0o010644 }]), /özel dosya türü/);
});

test('büyük-küçük harfle ayrışan iki girdi aynı dosyaya yazacağı için reddedilir', () => {
  reddedilir(zipYaz([{ ad: 'sunucu/A.ts', icerik: 'x' }, { ad: 'sunucu/a.ts', icerik: 'y' }]), /aynı yola iki girdi/);
});

test('sınırlar: girdi sayısı, tek dosya boyu ve toplam boy', () => {
  const sinirlar = { enCokGirdi: 2, enBuyukDosya: 10, enBuyukToplam: 15 };
  assert.equal(zipOku(zipYaz([{ ad: 'a', icerik: '1234567890' }, { ad: 'b', icerik: '12345' }]), sinirlar).length, 2);
  reddedilir(zipYaz([{ ad: 'a' }, { ad: 'b' }, { ad: 'c' }]), /çok fazla girdi/, sinirlar);
  reddedilir(zipYaz([{ ad: 'a', icerik: '12345678901' }]), /dosya çok büyük/, sinirlar);
  reddedilir(zipYaz([{ ad: 'a', icerik: '1234567890' }, { ad: 'b', icerik: '123456' }]), /toplam boy sınırı/, sinirlar);
});

test('dizinde küçük boy bildirip büyük açılan girdi reddedilir', () => {
  const sinirlar = { enCokGirdi: 10, enBuyukDosya: 100, enBuyukToplam: 1000 };
  reddedilir(zipYaz([{ ad: 'bomba.ts', icerik: 'a'.repeat(100_000), sikistir: true, bildirilenBoy: 50 }]), /bildirdiğinden büyük/, sinirlar);
});

test('zip olmayan ve bozuk içerik reddedilir', () => {
  reddedilir(Buffer.from('zip değil'), /zip dosyası değil/);
  reddedilir(Buffer.alloc(200), /zip dosyası değil/);
  const bozuk = zipYaz([{ ad: 'a.ts', icerik: 'export const A = 1;' }]);
  bozuk.writeUInt8(0x58, 30 + 'a.ts'.length);
  reddedilir(bozuk, /sağlama toplamı tutmuyor/);
});

// Arşivin alanlarını yerinde bozmak için: merkezi dizindeki `sira`'ncı kaydın yeri.
function merkezKaydi(z: Buffer, sira = 0): number {
  let yer = z.readUInt32LE(z.length - 22 + 16);
  for (let i = 0; i < sira; i += 1) yer += 46 + z.readUInt16LE(yer + 28) + z.readUInt16LE(yer + 30) + z.readUInt16LE(yer + 32);
  return yer;
}

test('yol parçası yalnız harf, rakam, nokta, tire ve alt çizgi taşır: boşluk, kabuk karakteri ve ASCII dışı ad reddedilir', () => {
  const kabul = zipOku(zipYaz([{ ad: 'sunucu/moduller/ornek-2/Ekran_A.test.tsx', icerik: 'x' }]));
  assert.equal(kabul[0]?.yol, 'sunucu/moduller/ornek-2/Ekran_A.test.tsx');
  for (const ad of [
    'sunucu/moduller/ornek/a b.ts', 'sunucu/moduller/ornek/a.ts ', ' sunucu/a.ts', 'sunucu/moduller/ornek/x&echo.test.ts',
    'sunucu/moduller/ornek/$(x).ts', 'sunucu/moduller/ornek/a;b.ts', 'sunucu/moduller/ornek/a"b.ts', 'sunucu/moduller/ornek/CONIN$',
    'sunucu/moduller/ornek/COM¹', 'sunucu/moduller/ornek/ç.ts', 'sunucu/moduller/ornek/a%b.ts', "sunucu/moduller/ornek/a'b.ts",
  ]) {
    reddedilir(zipYaz([{ ad, icerik: 'x' }]), /izinsiz karakter/);
  }
  reddedilir(zipYaz([{ ad: 'sunucu//a.ts', icerik: 'x' }]), /boş yol parçası/);
});

test('dizindeki ad ile yerel kayıttaki ad farklıysa arşiv reddedilir', () => {
  const z = zipYaz([{ ad: 'sunucu/moduller/x/aaaaaaaaa.ts', icerik: 'x' }]);
  z.write('sunucu/cekirdek/aaaaaaaa.ts', 30, 'utf8');
  reddedilir(z, /dizindeki ad ile yerel kayıttaki ad farklı/);
});

test('veri tanımlayıcılı girdi (yerel boylar sıfır) dizindeki boyla okunur', () => {
  const z = zipYaz([{ ad: 'a.ts', icerik: 'merhaba', sikistir: true }]);
  z.writeUInt16LE(0x0808, 6);
  z.writeUInt32LE(0, 14);
  z.writeUInt32LE(0, 18);
  z.writeUInt32LE(0, 22);
  assert.equal(zipOku(z)[0]?.icerik.toString('utf8'), 'merhaba');
});

test('parolalı girdi ve düz yöntemde yalan boy reddedilir', () => {
  const parolali = zipYaz([{ ad: 'a.ts', icerik: 'x' }]);
  parolali.writeUInt16LE(0x0801, merkezKaydi(parolali) + 8);
  reddedilir(parolali, /parolalı girdi/);

  reddedilir(zipYaz([{ ad: 'a.ts', icerik: 'a'.repeat(1000), bildirilenBoy: 10 }]), /boy bildirilenle uyuşmuyor/);
});

test('bir girdinin verisinin içine gömülmüş ikinci girdi reddedilir', () => {
  // İkinci girdinin yerel kaydı (başlık, ad, veri) birincinin içeriğine gömülür; adı ve sağlaması tutar, yalnız yeri örtüşür.
  const gomulen = zipYaz([{ ad: 'b.ts', icerik: 'y'.repeat(10) }]).subarray(0, 30 + 'b.ts'.length + 10);
  const dolgu = Buffer.alloc(20, 0x78);
  const z = zipYaz([{ ad: 'a.ts', icerik: Buffer.concat([dolgu, gomulen]) }, { ad: 'b.ts', icerik: 'y'.repeat(10) }]);
  assert.equal(zipOku(z).length, 2);
  z.writeUInt32LE(30 + 'a.ts'.length + dolgu.length, merkezKaydi(z, 1) + 42);
  reddedilir(z, /iki girdi aynı veriyi gösteriyor/);
});

test('klasör diye işaretli içerikli girdi ve sistemi gizlenmiş sembolik bağ reddedilir', () => {
  const klasor = zipYaz([{ ad: 'sunucu/cekirdek/uc.ts', icerik: 'kotu' }, { ad: 'FARK.md', icerik: 'x' }]);
  klasor.writeUInt32LE(0x10, merkezKaydi(klasor) + 38);
  reddedilir(klasor, /klasör diye işaretli ama içerikli girdi/);
  reddedilir(zipYaz([{ ad: 'sunucu/cekirdek/', icerik: 'kotu' }]), /klasör diye işaretli ama içerikli girdi/);

  const bag = zipYaz([{ ad: 'sunucu/moduller/x/bag.ts', icerik: '../../cekirdek/uc.ts', kip: 0o120777 }]);
  bag.writeUInt8(0, merkezKaydi(bag) + 5);
  reddedilir(bag, /sembolik bağ/);
});

test('son kayıttaki sayı ya da dizin boyu gerçek dizinle tutmuyorsa arşiv reddedilir', () => {
  const kur = (): Buffer => zipYaz([{ ad: 'FARK.md', icerik: 'x' }, { ad: 'sunucu/cekirdek/uc.ts', icerik: 'kotu' }]);
  const azSayi = kur();
  azSayi.writeUInt16LE(1, azSayi.length - 22 + 8);
  azSayi.writeUInt16LE(1, azSayi.length - 22 + 10);
  reddedilir(azSayi, /kayıt sayısı tutarsız/);
  const diskFarki = kur();
  diskFarki.writeUInt16LE(1, diskFarki.length - 22 + 8);
  reddedilir(diskFarki, /kayıt sayısı tutarsız/);
  const kisaDizin = kur();
  kisaDizin.writeUInt32LE(kisaDizin.readUInt32LE(kisaDizin.length - 22 + 12) - 4, kisaDizin.length - 22 + 12);
  reddedilir(kisaDizin, /kayıt sayısı tutarsız/);
});

test('aynı ad hem dosya hem klasör olamaz', () => {
  reddedilir(zipYaz([{ ad: 'a/b', icerik: 'a' }, { ad: 'a/b/c', icerik: 'b' }]), /hem dosya hem klasör/);
  reddedilir(zipYaz([{ ad: 'A/B/c.ts', icerik: 'b' }, { ad: 'a/b', icerik: 'a' }]), /hem dosya hem klasör/);
  assert.equal(zipOku(zipYaz([{ ad: 'a/b/' }, { ad: 'a/b/c', icerik: 'b' }])).length, 1);
});
