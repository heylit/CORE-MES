import { isBekliyor, isTanimi } from '#cekirdek/zamanlayici.ts';
import { ortamIstemcisi } from './baglanti.ts';
import { BEKLEME_NEDENLERI, yeniTurBellegi, zamanlanmisTur } from './servis.ts';

// İş her zaman koşar; istek ancak "Tezgâh bağlantısı okuması" ayarı açık ve TMIV2_TEZGAH_MTCONNECT_ADRESI varken çıkar.
export const turBellegi = yeniTurBellegi();

export const isler = [
  isTanimi({
    ad: 'tezgah-baglantisi-okuma',
    // Zamanlayıcı her saniye uyanır; okuma ancak ayardaki (hatada uzayan) aralık dolunca yapılır.
    aralikMs: 1000,
    txDisi: async (vt) => {
      const r = await zamanlanmisTur(vt, { istemci: ortamIstemcisi, saat: () => new Date(), bellek: turBellegi });
      if (r.tur === 'kapali' || r.tur === 'adres-yok') return isBekliyor(BEKLEME_NEDENLERI[r.tur]);
      if (r.tur === 'hata') throw new Error(r.ileti);
      return undefined;
    },
  }),
];
