import { describe, expect, it } from 'vitest';
import { IKINCI_MENULER, SAYFALAR } from '#paylasilan/sayfalar.ts';
import { gorunenKomutlar, komutAra, komutlariTopla } from '../../ortak/rota/komutlar.ts';
import { acilisOku } from './merkez/bagla.ts';
import { komutlar } from './komutlar.ts';

// İşlem setleri menu.test.ts'teki rol satırlarıyla aynıdır (kisiler göçleri).
const ROL_ISLEMLERI: Record<string, readonly string[]> = {
  satin_alma: ['sayfa.satin-alma', 'sayfa.taleplerim', 'satin-alma.ayar', 'satin-alma.oku', 'satin-alma.talep-ac', 'satin-alma.yaz'],
  mudur: ['sayfa.satin-alma', 'sayfa.taleplerim', 'satin-alma.oku', 'satin-alma.onayla', 'satin-alma.talep-ac'],
  muhasebe_finans: ['sayfa.satin-alma', 'satin-alma.oku'],
  kalite: ['sayfa.taleplerim', 'satin-alma.talep-ac'],
};
const gor = (rol: string) => {
  const islemler = ROL_ISLEMLERI[rol]!;
  return gorunenKomutlar(komutlar, { sayfalar: SAYFALAR.filter((s) => islemler.includes(s.islem)), menuler: IKINCI_MENULER, islemler }).map((k) => k.anahtar);
};

describe('Satın alma Ctrl K komutları', () => {
  it('bildirim geçerli: anahtar, işlem, simge ve yol kabuğun denetiminden geçer', () => {
    expect(komutlariTopla({ '../../moduller/satin-alma/komutlar.ts': { komutlar } }).map((k) => k.anahtar)).toEqual(komutlar.map((k) => k.anahtar));
  });

  it('izinli: satın almacı yeni talebi, müdür onayları, talep eden kendi formunu görür', () => {
    expect(gor('satin_alma')).toEqual(['satin-alma-yeni-talep', 'satin-alma-talep-ac']);
    expect(gor('mudur')).toEqual(['satin-alma-talep-ac', 'satin-alma-onay-bekleyenler']);
    expect(gor('kalite')).toEqual(['satin-alma-talep-ac']);
  });

  it('reddedilen: yalnız okuyan finans hiçbir komut görmez', () => {
    expect(gor('muhasebe_finans')).toEqual([]);
  });

  it('"talep aç" iki formu da bulur; yollar ekranın okuduğu açılışa çözülür', () => {
    // Başlığı sorgunun ilk sözcüğüyle başlayan önce gelir ("talep" ile "talebi" ayrıdır).
    expect(komutAra(komutlar, 'talep aç').map((k) => k.anahtar)).toEqual(['satin-alma-talep-ac', 'satin-alma-yeni-talep']);
    const yeni = komutlar.find((k) => k.anahtar === 'satin-alma-yeni-talep')!;
    expect(acilisOku(new URLSearchParams(yeni.yol.split('?')[1]))).toEqual({ talep: null, bolum: null, yeniTalep: true });
  });
});
