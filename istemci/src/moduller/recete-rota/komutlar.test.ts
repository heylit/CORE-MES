import { describe, expect, it } from 'vitest';
import { gorunenKomutlar, komutlariTopla } from '../../ortak/rota/komutlar.ts';
import { IKINCI_MENULER, SAYFALAR } from '#paylasilan/sayfalar.ts';
import { komutlar } from './komutlar.ts';

const topla = () => komutlariTopla({ './komutlar.ts': { komutlar } });
// Kabuk komuta yalnız kişinin gördüğü sayfaları verir.
const gorunen = (islemler: string[]) => gorunenKomutlar(topla(), {
  sayfalar: SAYFALAR.filter((s) => islemler.includes(s.islem)), menuler: IKINCI_MENULER, islemler,
}).map((k) => k.anahtar);

describe('Reçete ve Rota genel komutları (kart #1241)', () => {
  it('komutlar geçerli: yol menü maddesidir, işlem kayıtlıdır', () => {
    expect(topla().map((k) => k.anahtar)).toEqual(['recete-rota-yeni-rota', 'recete-rota-yeni-emir', 'recete-rota-yeni-sartname', 'recete-rota-yeni-talimat']);
  });

  it('izinli: sayfayı gören kişi yalnız düğmesinin işlemi olan komutu görür', () => {
    expect(gorunen(['sayfa.recete-rota', 'rota.yaz'])).toEqual(['recete-rota-yeni-rota']);
    expect(gorunen(['sayfa.recete-rota', 'rota.emre-kopyala'])).toEqual(['recete-rota-yeni-emir']);
    expect(gorunen(['sayfa.recete-rota', 'rota.sartname-yaz', 'rota.talimat-yaz'])).toEqual(['recete-rota-yeni-sartname', 'recete-rota-yeni-talimat']);
  });

  it('reddedilen: Reçete ve Rota sayfası kapalı kişi işlemi olsa da komut görmez; salt okuyan hiç görmez', () => {
    expect(gorunen(['rota.yaz', 'uretim-emirleri.yaz', 'rota.sartname-yaz', 'rota.talimat-yaz'])).toEqual([]);
    expect(gorunen(['sayfa.recete-rota'])).toEqual([]);
  });
});
