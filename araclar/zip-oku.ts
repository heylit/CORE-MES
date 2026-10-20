import { crc32, inflateRawSync } from 'node:zlib';

// Zip, diske açılmadan bellekte okunur: yol ve tür denetimi tek bir bayt yazılmadan biter.
// Dışarıdan gelen arşiv güvenilmezdir; kuşkulu tek girdi bütün arşivi düşürür.

export interface ZipSinirlari {
  enCokGirdi: number;
  enBuyukDosya: number;
  enBuyukToplam: number;
}

export const VARSAYILAN_SINIRLAR: ZipSinirlari = {
  enCokGirdi: 5000,
  enBuyukDosya: 5 * 1024 * 1024,
  enBuyukToplam: 100 * 1024 * 1024,
};

export interface ZipGirdisi {
  // Depo biçiminde göreli yol: eğik çizgi ayırır, baştaki `./` yoktur.
  yol: string;
  icerik: Buffer;
}

export class ZipReddi extends Error {
  override name = 'ZipReddi';
}

const SON_KAYIT = 0x06054b50;
const MERKEZ_KAYDI = 0x02014b50;
const YEREL_KAYIT = 0x04034b50;
const SON_KAYIT_BOYU = 22;
const UNIX = 3;
const TUR_MASKESI = 0o170000;
const TUR_DOSYA = 0o100000;
const TUR_KLASOR = 0o040000;
const TUR_BAG = 0o120000;

// Yol parçası yalnız bu karakterlerden oluşur. Boşluk, kabuk ve Windows özel karakterleri, gizli akış açan
// iki nokta üst üste ve ASCII dışı harf (aynı görünen iki ad, üst simge rakamlı aygıt adı) böylece hiç giremez.
const IZINLI_PARCA = /^[A-Za-z0-9._-]+$/;
const AYGIT_ADI = /^(?:con|prn|aux|nul|com\d|lpt\d)(?:\.|$)/i;

// Arşivdeki adı depo yoluna çevirir; depo dışına çıkabilecek ya da iki sistemde farklı yere düşebilecek adı reddeder.
export function guvenliYol(ham: string): string {
  const reddet = (neden: string): never => {
    throw new ZipReddi(`Zip reddedildi: ${neden}: ${JSON.stringify(ham)}`);
  };
  // Windows'un eski arşivleyicisi ters eğik çizgi yazar.
  const yol = ham.replaceAll('\\', '/');
  if (yol.startsWith('/')) reddet('mutlak yol');
  if (/^[A-Za-z]:/.test(yol)) reddet('sürücü harfi');
  const parcalar = yol.split('/').filter((p, sira, hepsi) => !(p === '' && sira === hepsi.length - 1));
  const temiz: string[] = [];
  for (const parca of parcalar) {
    if (parca === '.') continue;
    if (parca === '..') reddet('üst klasöre çıkan yol');
    if (parca === '') reddet('boş yol parçası');
    if (!IZINLI_PARCA.test(parca)) reddet('adında izinsiz karakter (yalnız harf, rakam, nokta, tire, alt çizgi)');
    if (parca.endsWith('.')) reddet('noktayla biten ad');
    if (AYGIT_ADI.test(parca)) reddet('aygıt adı');
    temiz.push(parca);
  }
  return temiz.join('/');
}

function sonKaydiBul(tampon: Buffer): number {
  const altSinir = Math.max(0, tampon.length - SON_KAYIT_BOYU - 0xffff);
  for (let i = tampon.length - SON_KAYIT_BOYU; i >= altSinir; i -= 1) {
    if (tampon.readUInt32LE(i) === SON_KAYIT) return i;
  }
  throw new ZipReddi('Zip reddedildi: zip dosyası değil ya da bozuk (son kayıt yok)');
}

export function zipOku(tampon: Buffer, sinirlar: ZipSinirlari = VARSAYILAN_SINIRLAR): ZipGirdisi[] {
  if (tampon.length < SON_KAYIT_BOYU) throw new ZipReddi('Zip reddedildi: zip dosyası değil ya da bozuk (çok kısa)');
  const son = sonKaydiBul(tampon);
  const buDisktekiSayi = tampon.readUInt16LE(son + 8);
  const girdiSayisi = tampon.readUInt16LE(son + 10);
  const merkezBoyu = tampon.readUInt32LE(son + 12);
  const merkezYeri = tampon.readUInt32LE(son + 16);
  if (girdiSayisi === 0xffff || merkezBoyu === 0xffffffff || merkezYeri === 0xffffffff) {
    throw new ZipReddi('Zip reddedildi: zip64 desteklenmiyor (arşiv teslim için fazla büyük)');
  }
  if (girdiSayisi > sinirlar.enCokGirdi) {
    throw new ZipReddi(`Zip reddedildi: çok fazla girdi (${girdiSayisi}; sınır ${sinirlar.enCokGirdi})`);
  }
  // Dizin tam olarak son kayıtta bitmeli ve bildirilen sayıda kayıt taşımalı: arada kalan ya da sayılmayan
  // kayıt, başka bir arşivleyicinin açıp bizim görmediğimiz girdi demektir.
  const tutarsiz = (): never => {
    throw new ZipReddi('Zip reddedildi: bozuk (dizinin yeri, boyu ya da kayıt sayısı tutarsız)');
  };
  if (buDisktekiSayi !== girdiSayisi || merkezYeri + merkezBoyu !== son) tutarsiz();

  const girdiler: ZipGirdisi[] = [];
  const gorulen = new Set<string>();
  const araliklar: { bas: number; son: number; yol: string }[] = [];
  let toplam = 0;
  let yer = merkezYeri;
  for (let sira = 0; sira < girdiSayisi; sira += 1) {
    if (yer + 46 > son || tampon.readUInt32LE(yer) !== MERKEZ_KAYDI) tutarsiz();
    const sistem = tampon.readUInt8(yer + 5);
    const bayraklar = tampon.readUInt16LE(yer + 8);
    const yontem = tampon.readUInt16LE(yer + 10);
    const saglama = tampon.readUInt32LE(yer + 16);
    const sikisikBoy = tampon.readUInt32LE(yer + 20);
    const boy = tampon.readUInt32LE(yer + 24);
    const adBoyu = tampon.readUInt16LE(yer + 28);
    const ekBoyu = tampon.readUInt16LE(yer + 30);
    const yorumBoyu = tampon.readUInt16LE(yer + 32);
    const disOzellik = tampon.readUInt32LE(yer + 38);
    const yerelYer = tampon.readUInt32LE(yer + 42);
    const adBaytlari = tampon.subarray(yer + 46, yer + 46 + adBoyu);
    const hamAd = adBaytlari.toString('utf8');
    yer += 46 + adBoyu + ekBoyu + yorumBoyu;
    if (yer > son) tutarsiz();

    const yol = guvenliYol(hamAd);
    // Tür bitlerine, arşivi yazdığını söyleyen sistem ne olursa olsun bakılır: bağ, sistem alanı değiştirilerek gizlenemesin.
    const tur = (disOzellik >>> 16) & TUR_MASKESI;
    if (tur === TUR_BAG) throw new ZipReddi(`Zip reddedildi: sembolik bağ: ${JSON.stringify(hamAd)}`);
    if (sistem === UNIX && tur !== 0 && tur !== TUR_DOSYA && tur !== TUR_KLASOR) {
      throw new ZipReddi(`Zip reddedildi: özel dosya türü: ${JSON.stringify(hamAd)}`);
    }
    if ((bayraklar & 1) !== 0) throw new ZipReddi(`Zip reddedildi: parolalı girdi: ${JSON.stringify(hamAd)}`);
    if ((sistem === UNIX && tur === TUR_KLASOR) || /[\\/]$/.test(hamAd) || (disOzellik & 0x10) !== 0) {
      // Klasör diye işaretlenip içerik taşıyan girdi atlanırsa başka arşivleyicinin açacağı dosya gözden kaçar.
      if (boy !== 0 || sikisikBoy !== 0) {
        throw new ZipReddi(`Zip reddedildi: klasör diye işaretli ama içerikli girdi: ${JSON.stringify(hamAd)}`);
      }
      continue;
    }
    if (yol === '') throw new ZipReddi('Zip reddedildi: adsız girdi');

    // Büyük-küçük harf ayırmayan dosya sisteminde iki girdi aynı dosyaya yazar; hangisinin kaldığı belirsizdir.
    const anahtar = yol.toLowerCase();
    if (gorulen.has(anahtar)) throw new ZipReddi(`Zip reddedildi: aynı yola iki girdi: ${JSON.stringify(yol)}`);
    gorulen.add(anahtar);

    if (boy === 0xffffffff || sikisikBoy === 0xffffffff || yerelYer === 0xffffffff) {
      throw new ZipReddi(`Zip reddedildi: zip64 girdisi: ${JSON.stringify(yol)}`);
    }
    if (boy > sinirlar.enBuyukDosya) {
      throw new ZipReddi(`Zip reddedildi: dosya çok büyük (${boy} bayt; sınır ${sinirlar.enBuyukDosya}): ${JSON.stringify(yol)}`);
    }
    toplam += boy;
    if (toplam > sinirlar.enBuyukToplam) {
      throw new ZipReddi(`Zip reddedildi: açılmış toplam boy sınırı aşıyor (sınır ${sinirlar.enBuyukToplam} bayt)`);
    }
    if (yontem !== 0 && yontem !== 8) throw new ZipReddi(`Zip reddedildi: desteklenmeyen sıkıştırma (${yontem}): ${JSON.stringify(yol)}`);

    if (yerelYer + 30 > merkezYeri || tampon.readUInt32LE(yerelYer) !== YEREL_KAYIT) {
      throw new ZipReddi(`Zip reddedildi: bozuk (yerel kayıt yok): ${JSON.stringify(yol)}`);
    }
    const yerelAdBoyu = tampon.readUInt16LE(yerelYer + 26);
    // Kimi arşivleyici yerel kayıttaki adla açar; iki ad ayrıysa denetlenen ad yazılacak ad değildir.
    if (!tampon.subarray(yerelYer + 30, yerelYer + 30 + yerelAdBoyu).equals(adBaytlari)) {
      throw new ZipReddi(`Zip reddedildi: dizindeki ad ile yerel kayıttaki ad farklı: ${JSON.stringify(yol)}`);
    }
    const veriYeri = yerelYer + 30 + yerelAdBoyu + tampon.readUInt16LE(yerelYer + 28);
    if (veriYeri + sikisikBoy > merkezYeri) throw new ZipReddi(`Zip reddedildi: bozuk (veri dizine taşıyor): ${JSON.stringify(yol)}`);
    araliklar.push({ bas: yerelYer, son: veriYeri + sikisikBoy, yol });
    const ham = tampon.subarray(veriYeri, veriYeri + sikisikBoy);

    let icerik: Buffer;
    if (yontem === 0) {
      icerik = Buffer.from(ham);
    } else {
      try {
        // Dizindeki boy yalan söyleyebilir; açma, bildirilen boyda kesilir.
        icerik = inflateRawSync(ham, { maxOutputLength: Math.max(boy, 1) });
      } catch {
        throw new ZipReddi(`Zip reddedildi: açılamadı ya da bildirdiğinden büyük: ${JSON.stringify(yol)}`);
      }
    }
    if (icerik.length !== boy) throw new ZipReddi(`Zip reddedildi: boy bildirilenle uyuşmuyor: ${JSON.stringify(yol)}`);
    if (crc32(icerik) !== saglama) throw new ZipReddi(`Zip reddedildi: sağlama toplamı tutmuyor: ${JSON.stringify(yol)}`);
    girdiler.push({ yol, icerik });
  }
  if (yer !== son) tutarsiz();

  araliklar.sort((a, b) => a.bas - b.bas);
  for (let i = 1; i < araliklar.length; i += 1) {
    const onceki = araliklar[i - 1];
    const bu = araliklar[i];
    if (onceki !== undefined && bu !== undefined && bu.bas < onceki.son) {
      throw new ZipReddi(`Zip reddedildi: iki girdi aynı veriyi gösteriyor: ${JSON.stringify(onceki.yol)}, ${JSON.stringify(bu.yol)}`);
    }
  }
  // Bir yol hem dosya hem klasör olamaz; hangisinin yazılacağı açan araca kalır.
  for (const g of girdiler) {
    const parcalar = g.yol.toLowerCase().split('/');
    for (let i = 1; i < parcalar.length; i += 1) {
      if (gorulen.has(parcalar.slice(0, i).join('/'))) {
        throw new ZipReddi(`Zip reddedildi: aynı ad hem dosya hem klasör: ${JSON.stringify(g.yol)}`);
      }
    }
  }
  return girdiler;
}
