import { describe, expect, it } from 'vitest';
import type { IsTuru } from '#paylasilan/sozlesme/sevkiyat.ts';
import { GUN_PLANI } from './test-verisi.ts';
import { yukTepesi } from './rota-duzeni.ts';

const ISLER = new Map<number, { tur: IsTuru; agirlikKilogram: string; paletSayisi: number }>([
  [1, { tur: 'teslimat', agirlikKilogram: '150', paletSayisi: 1 }],
  [2, { tur: 'teslimat', agirlikKilogram: '50.5', paletSayisi: 1 }],
  [3, { tur: 'alim', agirlikKilogram: '300', paletSayisi: 2 }],
  [4, { tur: 'aktarma', agirlikKilogram: '80', paletSayisi: 1 }],
]);
const bul = (id: number) => ISLER.get(id);

describe('yukTepesi (harita paketi yokken yük çubuğu)', () => {
  it('teslimatlar fabrikada yüklenir; tek teslimatlı araç işin ağırlığını gösterir', () => {
    expect(yukTepesi([{ isId: 1, alis: false }], bul)).toEqual({ kilogram: 150, palet: 1 });
  });
  it('teslimat bırakılınca düşer, alım eklenir; tepe en yüksek ara yüktür', () => {
    expect(yukTepesi([{ isId: 1, alis: false }, { isId: 2, alis: false }, { isId: 3, alis: true }], bul)).toEqual({ kilogram: 300, palet: 2 });
    expect(yukTepesi([{ isId: 3, alis: true }, { isId: 1, alis: false }], bul)).toEqual({ kilogram: 450, palet: 3 });
  });
  it('al-bırak alışta eklenir, bırakışta düşer; ara dönüş yeni sefer başlatır', () => {
    expect(yukTepesi([{ isId: 4, alis: true }, { isId: 4, alis: false }], bul)).toEqual({ kilogram: 80, palet: 1 });
    expect(yukTepesi([{ isId: 1, alis: false }, { araDonus: true }, { isId: 2, alis: false }], bul)).toEqual({ kilogram: 150, palet: 1 });
  });
  it('boş rota ve bilinmeyen iş sıfır yük verir', () => {
    expect(yukTepesi([], bul)).toEqual({ kilogram: 0, palet: 0 });
    expect(yukTepesi([{ isId: 99, alis: false }], bul)).toEqual({ kilogram: 0, palet: 0 });
  });
  it('sunucunun hesapladığı tepe yükle aynı sonucu verir (örnek plan)', () => {
    const isler = new Map(GUN_PLANI.isler.map((i) => [i.id, i]));
    const rota = GUN_PLANI.rotalar.find((r) => r.hesap !== null)!;
    expect(yukTepesi(rota.ogeler, (id) => isler.get(id))).toEqual({ kilogram: rota.hesap!.enCokKilogram, palet: rota.hesap!.enCokPalet });
  });
});
