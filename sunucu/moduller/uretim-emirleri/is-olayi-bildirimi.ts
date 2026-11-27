import { bildirimGonder } from '../bildirim/disari.ts';
import { istasyonAdlari, istasyondakiKisiler } from '../istasyonlar/disari.ts';
import { projeNo } from '../projeler/disari.ts';
import { adimBittiDinle, emirBittiDinle, fasonHareketiDinle } from './emir-olaylari.ts';
import { fasonMu, otomatikMuayeneMi, siradakiIsEmri } from './kurallar.ts';
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

// 3809: kaynağında muayene seçili fason adımın gidişi Kalite Merkezi'ne görevdir (muayene firmada yapılır, rapor yüklenip onaylanır).
// Görev muayene adımı başınadır: sonraki gidişler aynı görevi tazeler; onayla kapanır.
export const kaynaktaMuayeneKaynagi = (muayeneIsEmriId: number): string => `muayene:${String(muayeneIsEmriId)}`;
fasonHareketiDinle(async (db, olay) => {
  const h = await s.fasonHareketiBul(db, olay.hareketId);
  if (h === null || h.yon !== 'gidis') return;
  const fason = await s.isEmriBul(db, h.isEmriId);
  if (fason === null || fason.kontrolTuru !== 'kaynakta') return;
  const adimlar = await s.isEmirleriGetir(db, [fason.uretimEmriId]);
  const muayene = adimlar.filter((a) => a.sira > fason.sira && otomatikMuayeneMi(a)).sort((a, b) => a.sira - b.sira)[0];
  const emir = await s.ustEmirBul(db, fason.uretimEmriId);
  if (muayene === undefined || muayene.durum === 'tamam' || emir === null) return;
  await bildirimGonder(db, {
    tur: 'uretim-emirleri.kaynakta-muayene-bekliyor',
    baslik: `Kaynağında muayene: ${emir.emirNo} · OP ${String(fason.opNo)}`.slice(0, 200),
    metin: `${String(h.adet)} adet firmaya gitti; muayene raporu yüklenip onaylanır.`,
    haric: olay.kisiId, kaynakKimlik: kaynaktaMuayeneKaynagi(muayene.id),
  });
});
