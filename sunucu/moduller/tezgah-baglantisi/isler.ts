import { isBekliyor, isTanimi } from '#cekirdek/zamanlayici.ts';
import { ortamIstemcisi } from './baglanti.ts';
import { OKUMA_ARALIGI_MS } from './kurallar.ts';
import { BEKLEME_NEDENLERI, okumaTuru, yeniTurBellegi } from './servis.ts';

// İş her zaman koşar; istek ancak "Tezgah bağlantısı okuması" ayarı açık ve TMIV2_TEZGAH_MTCONNECT_ADRESI varken çıkar.
export const turBellegi = yeniTurBellegi();

export const isler = [
  isTanimi({
    ad: 'tezgah-baglantisi-okuma',
    aralikMs: OKUMA_ARALIGI_MS,
    txDisi: async (vt) => {
      const r = await okumaTuru(vt, { istemci: ortamIstemcisi, saat: () => new Date(), bellek: turBellegi });
      if (r.tur === 'kapali' || r.tur === 'adres-yok') return isBekliyor(BEKLEME_NEDENLERI[r.tur]);
      if (r.tur === 'hata') throw new Error(r.ileti);
      return undefined;
    },
  }),
];
