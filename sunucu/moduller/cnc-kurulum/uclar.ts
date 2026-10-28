import { uc } from '#cekirdek/uc.ts';
import {
  benCevabi, emirSecCevabi, emirSecGovdesi, emirlerCevabi, hazirlikCevabi, hazirlikOnayGovdesi, kayitlarCevabi, kurulumTamamCevabi,
  kurulumTamamGovdesi, silCevabi, silGovdesi, stokDusCevabi, stokDusGovdesi, stokKartiBaglaCevabi, stokKartiBaglaGovdesi, stokKartlariCevabi,
  stokKartlariSorgusu, takimOlaylariCevabi, takimOlaylariGovdesi, tezgahAyarCevabi, tezgahAyarGovdesi, tezgahlarCevabi, tezgahParametresi, yazCevabi,
  yazGovdesi,
} from '#paylasilan/sozlesme/cnc-kurulum.ts';
import {
  ben, emirSec, emirler, hazirlik, hazirlikOnayla, kayitlar, kurulumTamam, sil, stokDus, stokKartiBagla, stokKartlari, takimOlaylari, tezgahAyarYaz,
  tezgahlar, yaz,
} from './servis.ts';

// Çerçevedeki prototipin yerel deposu bu uçlara gelir (istemci/src/moduller/cnc-kurulum/kopru.ts). Her yazma uçtan geçer:
// yetki ve denetim kaydı uç katmanındadır.
const OKUMA = { biri: ['sayfa.cnc-kurulum', 'cnc-kurulum.oku', 'cnc-kurulum.yaz', 'cnc-kurulum.hazirlik-onayla'] } as const;

export const uclar = [
  uc({
    yontem: 'GET',
    yol: '/cnc-kurulum/ben',
    yetki: OKUMA,
    cevap: benCevabi,
    isle: ({ kullanici }) => ben(kullanici),
  }),
  uc({
    yontem: 'GET',
    yol: '/cnc-kurulum/kayitlar',
    yetki: OKUMA,
    cevap: kayitlarCevabi,
    isle: ({ db }) => kayitlar(db),
  }),
  uc({
    yontem: 'GET',
    yol: '/cnc-kurulum/emirler',
    yetki: OKUMA,
    cevap: emirlerCevabi,
    isle: ({ db, kullanici }) => emirler(db, kullanici),
  }),
  uc({
    yontem: 'POST',
    yol: '/cnc-kurulum/kayitlar/yaz',
    yetki: 'cnc-kurulum.yaz',
    // Prototip her değişiklikte bütün durumunu (son NC programı dahil, yüzlerce KB) yazar: gövde deftere girmez, anahtar ve
    // beklenen sürüm girer (kullanıcı kararı, 12.10.2026).
    denetim: 'govdesiz',
    denetimOzeti: (g) => ({ anahtar: g.anahtar, bicim: g.bicim, beklenenSurum: g.beklenenSurum }),
    govde: yazGovdesi,
    cevap: yazCevabi,
    isle: ({ db, kullanici, govde }) => yaz(db, kullanici, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/cnc-kurulum/hazirlik/onayla',
    // Hazırlık onayı yalnız bu iki uçtan yazılır (kart #1583): köprü yalnız onay alanlarını gönderir; gövde küçüktür, deftere
    // tam girer. Yazma işlemi olmayan onaylayıcı buradan onaylar.
    yetki: 'cnc-kurulum.hazirlik-onayla',
    govde: hazirlikOnayGovdesi,
    cevap: yazCevabi,
    isle: ({ db, kullanici, govde }) => hazirlikOnayla(db, kullanici, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/cnc-kurulum/hazirlik/yazar-onayla',
    // Yazma işlemi olan kişi önceden genel uçtan onaylayabiliyordu; onay hakkı aynı kalır, yolu buraya taşınır. Yazma ucu
    // tek işlem alır: aynı işleyici ikinci uçla yazma işlemine açılır.
    yetki: 'cnc-kurulum.yaz',
    govde: hazirlikOnayGovdesi,
    cevap: yazCevabi,
    isle: ({ db, kullanici, govde }) => hazirlikOnayla(db, kullanici, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/cnc-kurulum/emir-sec',
    // Kurulum üretim emri başınadır: emir değişince kurulum emre saklanır, yeni emrinki açılır. Gövde küçüktür, deftere tam girer.
    yetki: 'cnc-kurulum.yaz',
    govde: emirSecGovdesi,
    cevap: emirSecCevabi,
    isle: ({ db, kullanici, govde }) => emirSec(db, kullanici, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/cnc-kurulum/kurulum-tamam',
    yetki: 'cnc-kurulum.yaz',
    govde: kurulumTamamGovdesi,
    cevap: kurulumTamamCevabi,
    isle: ({ db, kullanici, govde }) => kurulumTamam(db, kullanici, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/cnc-kurulum/takimlar/olaylar',
    // Takım değişimi ve kullanım düzeltmesi ayrı işlemdir (300 a): operatör kurulum kaydını yazmadan ömrü sıfırlar. Gövde
    // küçüktür, deftere tam girer. Düzeltme farktır: yinelenen istek ikinci kez yazılmaz.
    tekrarKorumali: true,
    yetki: 'cnc-kurulum.takim-degistir',
    govde: takimOlaylariGovdesi,
    cevap: takimOlaylariCevabi,
    isle: ({ db, kullanici, govde }) => takimOlaylari(db, kullanici, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/cnc-kurulum/takimlar/stok-dus',
    // 164 b: stok kartına bağlı kalemin prototipte azalan adedi stoktan düşer; yinelenen istek ikinci kez düşmez.
    tekrarKorumali: true,
    yetki: 'cnc-kurulum.stok-dus',
    govde: stokDusGovdesi,
    cevap: stokDusCevabi,
    isle: ({ db, kullanici, govde }) => stokDus(db, kullanici, govde),
  }),
  uc({
    yontem: 'GET',
    yol: '/cnc-kurulum/takimlar/stok-kartlari',
    yetki: 'malzemeler.yaz',
    sorgu: stokKartlariSorgusu,
    cevap: stokKartlariCevabi,
    isle: ({ db, sorgu }) => stokKartlari(db, sorgu),
  }),
  uc({
    yontem: 'POST',
    yol: '/cnc-kurulum/takimlar/stok-karti',
    // 163 b: kalemin stok kartı bağı kart verisidir; kartı yazan kurar.
    yetki: 'malzemeler.yaz',
    govde: stokKartiBaglaGovdesi,
    cevap: stokKartiBaglaCevabi,
    isle: ({ db, govde }) => stokKartiBagla(db, govde),
  }),
  uc({
    yontem: 'GET',
    yol: '/cnc-kurulum/hazirlik',
    yetki: OKUMA,
    cevap: hazirlikCevabi,
    isle: ({ db }) => hazirlik(db),
  }),
  uc({
    yontem: 'POST',
    yol: '/cnc-kurulum/kayitlar/sil',
    yetki: 'cnc-kurulum.yaz',
    govde: silGovdesi,
    cevap: silCevabi,
    isle: ({ db, govde }) => sil(db, govde.anahtar, govde.beklenenSurum),
  }),
  uc({
    yontem: 'GET',
    yol: '/cnc-kurulum/tezgahlar',
    yetki: OKUMA,
    cevap: tezgahlarCevabi,
    isle: ({ db }) => tezgahlar(db),
  }),
  uc({
    yontem: 'POST',
    yol: '/cnc-kurulum/tezgahlar/:makineId/ayar',
    // 1136 a: tezgâh ayarını bugün Tanımlar'da yazan roller yazar; yeni işlem yok. Gövde küçüktür, deftere tam girer.
    yetki: 'cnc-kurulum.yaz',
    parametre: tezgahParametresi,
    govde: tezgahAyarGovdesi,
    cevap: tezgahAyarCevabi,
    isle: ({ db, kullanici, parametre, govde }) => tezgahAyarYaz(db, kullanici, parametre.makineId, govde),
  }),
];
