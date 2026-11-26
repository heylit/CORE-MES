import { isBekliyor, isTanimi } from '#cekirdek/zamanlayici.ts';
import { lsv2Adlari, lsv2IstemcisiVer, lsv2Makineleri, ortamIstemcisi } from './baglanti.ts';
import { LSV2_BEKLEME_NEDENLERI, lsv2Turu, yeniLsv2Bellegi } from './lsv2-tur.ts';
import { BEKLEME_NEDENLERI, yeniTurBellegi, zamanlanmisTur } from './servis.ts';

// İş her zaman koşar; istek ancak "Tezgâh bağlantısı okuması" ayarı açık ve TMIV2_TEZGAH_MTCONNECT_ADRESI varken çıkar.
export const turBellegi = yeniTurBellegi();
// Heidenhain (LSV2) okuması ayrı iştir: kendi ayarı ("Heidenhain okuması") ve makine listesi (TMIV2_TEZGAH_LSV2_MAKINELERI) ister.
export const lsv2Bellegi = yeniLsv2Bellegi();

export const isler = [
  isTanimi({
    ad: 'tezgah-baglantisi-okuma',
    // Zamanlayıcı her saniye uyanır; okuma ancak ayardaki (hatada uzayan) aralık dolunca yapılır.
    aralikMs: 1000,
    txDisi: async (vt) => {
      const r = await zamanlanmisTur(vt, { istemci: ortamIstemcisi, saat: () => new Date(), bellek: turBellegi, lsv2Adlari });
      if (r.tur === 'kapali' || r.tur === 'adres-yok') return isBekliyor(BEKLEME_NEDENLERI[r.tur]);
      if (r.tur === 'hata') throw new Error(r.ileti);
      return undefined;
    },
  }),
  isTanimi({
    ad: 'tezgah-baglantisi-lsv2-okuma',
    // Her makine kendi aralığıyla okunur; kapalı makine ötekileri bekletmez, hata sayılmaz (makine kartında uyarı olur).
    aralikMs: 1000,
    txDisi: async (vt) => {
      const r = await lsv2Turu(vt, {
        makineler: lsv2Makineleri, istemciKur: lsv2IstemcisiVer, saat: () => new Date(), bellek: lsv2Bellegi, ortak: turBellegi,
        mtconnectVar: ortamIstemcisi !== null,
      });
      if (r.tur === 'kapali' || r.tur === 'ayar-yok') return isBekliyor(LSV2_BEKLEME_NEDENLERI[r.tur]);
      return undefined;
    },
  }),
];
