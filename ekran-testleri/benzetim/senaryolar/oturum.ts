import { HESAPLAR } from '../../hesaplar.ts';
import { senaryo } from '../senaryo.ts';

// Çatı denemesi: her rol aynı anda oturumunu okur. Akış senaryoları (S1-S5) ayrı dosyalarda gelir.
export default senaryo({
  ad: 'oturum',
  roller: HESAPLAR,
  kopya: 1,
  async kos(b) {
    await Promise.all(HESAPLAR.map((h) => b.bekle(h, 'oturumu oku', 'GET', '/api/oturum', 200)));
  },
});
