import { describe, expect, it } from 'vitest';
import { IKINCI_MENULER, SAYFALAR } from '#paylasilan/sayfalar.ts';
import { gorunenKomutlar, komutlariTopla } from '../../ortak/rota/komutlar.ts';
import { komutlar } from './komutlar.ts';

// Rol x işlem dağılımı ayrıca onaylanır; burada yalnız işlem setlerinden hangi komutun göründüğü denetlenir.
const OKUYUCU = ['sayfa.siparisler', 'siparisler.oku'];
const YAZAR = [...OKUYUCU, 'siparisler.yaz'];
const ONAYLAYAN = [...OKUYUCU, 'siparisler.onayla'];

const gorunen = (islemler: readonly string[]) => gorunenKomutlar(komutlar, {
  sayfalar: SAYFALAR.filter((s) => islemler.includes(s.islem)),
  menuler: IKINCI_MENULER,
  islemler,
}).map((k) => k.anahtar);

describe('Siparişler Ctrl K komutları (1242)', () => {
  it('komutlar toplanırken geçerlidir: yol bir sayfa ya da menü maddesi, işlem kayıtlı, simge sette', () => {
    expect(komutlariTopla({ '../../moduller/siparisler/komutlar.ts': { komutlar } }).map((k) => k.anahtar)).toEqual([
      'siparis-yeni', 'teklif-yeni', 'siparis-onay-bekleyen', 'teklif-revizyon',
    ]);
  });

  it('izinli: okuyan listeyi, yazan yeni kayıt formlarını, onaylayan onay bekleyenleri görür', () => {
    expect(gorunen(OKUYUCU)).toEqual(['teklif-revizyon']);
    expect(gorunen(YAZAR)).toEqual(['siparis-yeni', 'teklif-yeni', 'teklif-revizyon']);
    expect(gorunen(ONAYLAYAN)).toEqual(['siparis-onay-bekleyen', 'teklif-revizyon']);
  });

  it('reddedilen: sayfayı görmeyen işlemi olsa da komut görmez; işlemsiz kişi hiçbirini görmez', () => {
    expect(gorunen(['siparisler.oku', 'siparisler.yaz', 'siparisler.onayla'])).toEqual([]);
    expect(gorunen(['sayfa.siparisler'])).toEqual([]);
  });
});
