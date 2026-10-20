import { ayarOku } from '#cekirdek/ayar.ts';
import { uygulamaHavuzuAc } from '#cekirdek/db.ts';
import { CANLI_RED, modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import { kablola } from '../sunucu/kablolama.ts';

// Kullanım: npm run ornek-veri
// Yalnız elle koşar; sunucu açılışı ve göç örnek veri yüklemez. Canlı ortamda bağlanmadan reddeder.
// Örnek veri emir açıp bitirebilir: stok ve sevkiyat bunu sunucudaki gibi duymalı.
kablola();
const ayar = ayarOku();
if (ayar.ortam === 'canli') {
  console.error(CANLI_RED);
  process.exit(1);
}

const vt = await uygulamaHavuzuAc(ayar).catch((hata: unknown) => {
  console.error(`Bağlanılamadı: ${hata instanceof Error ? hata.message : String(hata)}`);
  process.exit(1);
});
try {
  const liste = await modulOrnekVerileriniKesfet();
  if (liste.length === 0) {
    console.log('Örnek veri veren modül yok; bir şey yazılmadı.');
  } else {
    const sonuc = await ornekVeriYukle(vt, liste, { ortam: ayar.ortam, bildir: (satir) => console.log(satir) });
    if (sonuc.durum === 'yuklu') {
      console.log(`Örnek veri zaten yüklü (${sonuc.moduller.join(', ')}); bir şey yazılmadı.`);
    } else {
      console.log(`Örnek veri yüklendi: ${sonuc.moduller.join(', ')}`);
      if (sonuc.yuklu) console.log(`Zaten yüklü, atlandı: ${sonuc.yuklu.join(', ')}`);
    }
  }
} catch (hata) {
  console.error(`Yüklenemedi, hiçbir şey yazılmadı: ${hata instanceof Error ? hata.message : String(hata)}`);
  process.exitCode = 1;
} finally {
  await vt.kapat();
}
