import { bildirimGonder } from '../bildirim/disari.ts';
import { istasyonAdlari, istasyondakiKisiler } from '../istasyonlar/disari.ts';
import { projeNo } from '../projeler/disari.ts';
import { adimBittiDinle, emirBittiDinle } from './emir-olaylari.ts';
import { fasonMu, siradakiIsEmri } from './kurallar.ts';
import * as s from './sorgular.ts';

// 3596: gerçekleşen iş olayları Bildirim Merkezi'ne. Olaylar varsayılan kapalıdır (3478-2 a); açılınca bitiren kişi kendisi almaz.
// Bildirim komutla aynı işlemdedir: bitirme geri alınırsa bildirim de yazılmaz.

// Adım bitti: sıradaki adım terminalde bekliyorsa onun istasyonuna bugün atanmış kişilere. Sıradaki adım fasonsa, istasyonsuzsa
// ya da paralel adım zaten çalışıyorsa istasyon alıcısı yoktur; seçilen rol ve kişiler yine alır. Son adımda bu olay değil
// "emir tamamlandı" gider.
adimBittiDinle(async (db, olay) => {
  const adimlar = await s.isEmirleriGetir(db, [olay.uretimEmriId]);
  const biten = adimlar.find((a) => a.id === olay.isEmriId);
  const sonraki = siradakiIsEmri(adimlar);
  if (biten === undefined || sonraki === null) return;
  const emir = await s.ustEmirBul(db, olay.uretimEmriId);
  if (emir === null) return;
  const istasyonId = sonraki.durum === 'bekliyor' && !fasonMu(sonraki) ? sonraki.istasyonId : null;
  const istasyon = istasyonId === null ? null : (await istasyonAdlari(db, [istasyonId])).get(istasyonId) ?? null;
  await bildirimGonder(db, {
    tur: 'uretim-emirleri.adim-tamamlandi',
    baslik: `${emir.emirNo}: op ${biten.opNo} bitti, sıra op ${sonraki.opNo}`,
    metin: `${emir.parcaAd} (${emir.parcaNo}), ${biten.saglamAdet ?? 0} sağlam. Sıradaki adım: ${sonraki.ad}${istasyon === null ? '' : `, ${istasyon}`}.`,
    kisiler: istasyonId === null ? [] : (await istasyondakiKisiler(db, istasyonId)).map((k) => k.kisiId),
    haric: olay.kisiId, kaynakKimlik: `is-emri:${biten.id}`, yol: '/uretim-terminali',
  });
});

// Emir bitti (son adım, elle kapanış, hatalı parçanın dönüşü): planlamaya. Tekil anahtar emir başınadır: yeniden açılıp biten emir
// ikinci satır açmaz, var olan satır tekrar sayısını artırır.
emirBittiDinle(async (db, olay) => {
  const emir = await s.ustEmirBul(db, olay.uretimEmriId);
  if (emir === null || emir.malzemeNo === null) return;
  const proje = emir.projeId === null ? null : await projeNo(db, emir.projeId);
  await bildirimGonder(db, {
    tur: 'uretim-emirleri.emir-tamamlandi',
    baslik: `${emir.emirNo} tamamlandı: ${emir.parcaAd}`,
    metin: `${olay.saglamAdet} / ${emir.adet} sağlam${proje === null ? '' : `, proje ${proje}`}.`,
    haric: olay.kisiId, kaynakKimlik: `emir:${emir.id}`, yol: '/uretim-emirleri',
    alanlar: { malzeme_kodu: emir.parcaNo, proje },
  });
});
