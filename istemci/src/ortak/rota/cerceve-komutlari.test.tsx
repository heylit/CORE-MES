import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { YalitilmisCerceve } from '../arayuz/YalitilmisCerceve.tsx';
import { useYalitilmisGorunum } from './cerceve-gorunumu.ts';
import {
  CERCEVE_KANALI, CERCEVE_SURUMU, KOMUT_ANAHTAR_UZUNLUGU, KOMUT_SINIRI, cerceveKomutlariMi, cerceveKoprusuKur,
  cercevedenIletiMi, kabukKoprusuKur, kabuktanIletiMi, type CerceveKomutu,
} from './cerceve-iletisi.ts';
import type { IkinciMenu } from './ikinci-menu.ts';
import { SayfaKomutBaglami, type SayfaKomutu } from './sayfa-komutlari.ts';

const KOKEN = 'http://uygulama.test';
const BAS = { kanal: CERCEVE_KANALI, surum: CERCEVE_SURUMU } as const;
const komutIletisi = (komutlar: unknown) => ({ ...BAS, tip: 'komutlar', komutlar });
const calistirIletisi = (anahtar: unknown) => ({ ...BAS, tip: 'komut-calistir', anahtar });
const GUN_OZETI: CerceveKomutu = { anahtar: 'gun-ozeti', baslik: 'Gün özeti', simge: 'list', sozcukler: ['rapor'] };
const ARIZA: CerceveKomutu = { anahtar: 'ariza', baslik: 'Arıza gir', simge: 'alert', aciklama: 'Tezgahı arızaya alır' };

const kapatilacak: (() => void)[] = [];
afterEach(() => {
  cleanup();
  kapatilacak.splice(0).forEach((k) => k());
  document.body.replaceChildren();
});

function cerceveAc(): Window {
  const cerceve = document.createElement('iframe');
  document.body.append(cerceve);
  return cerceve.contentWindow as Window;
}

function ilet(hedef: Window, veri: unknown, koken: string, kaynak: Window) {
  act(() => { hedef.dispatchEvent(new MessageEvent('message', { data: veri, origin: koken, source: kaynak })); });
}

describe('komut biçimi (kural 7)', () => {
  it('kabul: boş liste, isteğe bağlı alanlar, sınırdaki komut sayısı ve anahtar uzunluğu', () => {
    expect(cerceveKomutlariMi([])).toBe(true);
    expect(cerceveKomutlariMi([GUN_OZETI, ARIZA, { anahtar: 'yinele', baslik: 'Yinele' }])).toBe(true);
    expect(cerceveKomutlariMi(Array.from({ length: KOMUT_SINIRI }, (_, i) => ({ anahtar: `k${i}`, baslik: 'K' })))).toBe(true);
    expect(cerceveKomutlariMi([{ anahtar: `a${'b'.repeat(KOMUT_ANAHTAR_UZUNLUGU - 1)}`, baslik: 'K' }])).toBe(true);
    expect(cercevedenIletiMi(komutIletisi([GUN_OZETI]))).toBe(true);
    expect(kabuktanIletiMi(calistirIletisi('gun-ozeti'))).toBe(true);
  });

  it('red: tek bozuk komut bütün listeyi düşürür; sınır aşımı, aynı anahtar, boş başlık, biçimsiz anahtar, nesne olmayan', () => {
    expect(cerceveKomutlariMi(Array.from({ length: KOMUT_SINIRI + 1 }, (_, i) => ({ anahtar: `k${i}`, baslik: 'K' })))).toBe(false);
    expect(cerceveKomutlariMi([GUN_OZETI, GUN_OZETI])).toBe(false);
    for (const kotu of [
      { anahtar: 'a', baslik: ' ' }, { anahtar: 'a' }, { anahtar: 'A', baslik: 'K' }, { anahtar: '__proto__', baslik: 'K' },
      { anahtar: `a${'b'.repeat(KOMUT_ANAHTAR_UZUNLUGU)}`, baslik: 'K' }, { anahtar: 'a', baslik: 'K', simge: 3 },
      { anahtar: 'a', baslik: 'K', aciklama: '' }, { anahtar: 'a', baslik: 'K', sozcukler: 'rapor' },
      { anahtar: 'a', baslik: 'K', sozcukler: [''] }, { anahtar: 'a', baslik: 'x'.repeat(81) }, null, 'a', [GUN_OZETI],
    ]) {
      expect(cerceveKomutlariMi([GUN_OZETI, kotu]), JSON.stringify(kotu)).toBe(false);
    }
    for (const liste of [null, undefined, {}, 'gun-ozeti', new Set([GUN_OZETI])]) expect(cerceveKomutlariMi(liste)).toBe(false);
    expect(cercevedenIletiMi({ ...BAS, tip: 'komutlar' })).toBe(false);
    expect(cercevedenIletiMi({ ...komutIletisi([]), surum: CERCEVE_SURUMU + 1 })).toBe(false);
    // Yönler karışmaz: kabuk komut listesi almaz, çerçeve komut çalıştırma iletisi yollamaz.
    expect(kabuktanIletiMi(komutIletisi([GUN_OZETI]))).toBe(false);
    expect(cercevedenIletiMi(calistirIletisi('gun-ozeti'))).toBe(false);
    for (const anahtar of ['', 'A', 3, null, '__proto__']) expect(kabuktanIletiMi(calistirIletisi(anahtar))).toBe(false);
  });
});

describe('kabuk köprüsü: komutlar', () => {
  function kur() {
    const cerceve = cerceveAc();
    const gonderilen = vi.spyOn(cerceve, 'postMessage').mockImplementation(() => undefined);
    const komutlar = vi.fn();
    const kopru = kabukKoprusuKur({ cerceve: () => cerceve, koken: KOKEN, gorunumDegisti: () => true, komutlar });
    kapatilacak.push(kopru.kapat);
    return { cerceve, gonderilen, komutlar, kopru };
  }

  it('izinli: liste hazır beklemeden kopyalanarak geçer, sette olmayan simge ve bilinmeyen alan düşer; seçilen komut çerçeveye gider', () => {
    const { cerceve, gonderilen, komutlar, kopru } = kur();
    const gelen = [GUN_OZETI, { anahtar: 'yinele', baslik: 'Yinele', simge: 'boyle-simge-yok', fazla: 'x' }];
    ilet(window, komutIletisi(gelen), KOKEN, cerceve);
    expect(komutlar).toHaveBeenCalledWith([GUN_OZETI, { anahtar: 'yinele', baslik: 'Yinele' }]);
    expect(komutlar.mock.calls[0]?.[0][0]).not.toBe(GUN_OZETI);
    kopru.komutCalistir('gun-ozeti');
    expect(gonderilen.mock.calls).toEqual([[calistirIletisi('gun-ozeti'), KOKEN]]);
  });

  it('reddedilen: başka kökenden, başka pencereden ve bozuk liste geçmez; biçimsiz anahtar çerçeveye gönderilmez', () => {
    const { cerceve, gonderilen, komutlar, kopru } = kur();
    ilet(window, komutIletisi([GUN_OZETI]), 'http://baska.test', cerceve);
    ilet(window, komutIletisi([GUN_OZETI]), KOKEN, cerceveAc());
    ilet(window, komutIletisi([GUN_OZETI, GUN_OZETI]), KOKEN, cerceve);
    expect(komutlar).not.toHaveBeenCalled();
    kopru.komutCalistir('Gun Ozeti');
    expect(gonderilen).not.toHaveBeenCalled();
  });
});

describe('çerçeve köprüsü: komutlar', () => {
  it('liste kabuğun kökenine gider, bozuk liste hata verir; kabuğun seçtiği komut çağrılır, görünüm isteği sayılmaz', () => {
    const ust = cerceveAc();
    const yollanan = vi.spyOn(ust, 'postMessage').mockImplementation(() => undefined);
    const pencere = cerceveAc();
    const gorunumIste = vi.fn();
    const komutCalistir = vi.fn();
    const kopru = cerceveKoprusuKur({ pencere, ust, koken: KOKEN, gorunumIste, komutCalistir });
    kapatilacak.push(kopru.kapat);
    kopru.komutlarBildir([ARIZA]);
    expect(() => { kopru.komutlarBildir([ARIZA, ARIZA]); }).toThrow(TypeError);
    expect(yollanan.mock.calls).toEqual([[komutIletisi([ARIZA]), KOKEN]]);
    ilet(pencere, calistirIletisi('ariza'), KOKEN, ust);
    ilet(pencere, calistirIletisi('ariza'), 'http://baska.test', ust);
    expect(komutCalistir.mock.calls).toEqual([['ariza']]);
    expect(gorunumIste).not.toHaveBeenCalled();
  });
});

describe('useYalitilmisGorunum: komutlar paletin "Bu sayfa" grubuna', () => {
  const MENU: IkinciMenu = {
    kok: '/ornek', baslik: 'Örnek', simge: 'cube',
    gruplar: [{ maddeler: [{ anahtar: 'ana', baslik: 'Ana', yol: '/ornek', simge: 'list', islem: 'ornek.oku' }] }],
  };

  function Ekran() {
    const gorunumIletisi = useYalitilmisGorunum('/ornek', [MENU]);
    return (
      <YalitilmisCerceve
        baslik="Örnek"
        sayfa="<!doctype html><html><head></head><body></body></html>"
        iletiGeldi={(veri, yanitla) => { gorunumIletisi(veri, yanitla); }}
      />
    );
  }

  function ac() {
    let son: readonly SayfaKomutu[] | null = null;
    const yaz = vi.fn((_kaynak: string, liste: readonly SayfaKomutu[] | null) => { son = liste; });
    const sonuc = render(
      <MemoryRouter initialEntries={['/ornek']}>
        <SayfaKomutBaglami.Provider value={yaz}><Ekran /></SayfaKomutBaglami.Provider>
      </MemoryRouter>,
    );
    const cerceve = (screen.getByTitle('Örnek') as HTMLIFrameElement).contentWindow as Window;
    const gonderilen = vi.spyOn(cerceve, 'postMessage').mockImplementation(() => undefined);
    return { cerceve, gonderilen, yaz, son: () => son, sonuc };
  }

  it('izinli: çerçevenin listesi kabuğa yazılır, seçilen komut çerçeveye döner; çerçeve kalkınca liste silinir', () => {
    const { cerceve, gonderilen, yaz, son, sonuc } = ac();
    ilet(window, komutIletisi([GUN_OZETI, { anahtar: 'yinele', baslik: 'Yinele' }]), 'null', cerceve);
    expect(son()?.map((k) => [k.anahtar, k.simge])).toEqual([['gun-ozeti', 'list'], ['yinele', 'bolt']]);
    act(() => { son()?.[0]?.calistir(); });
    expect(gonderilen.mock.calls).toEqual([[calistirIletisi('gun-ozeti'), '*']]);
    ilet(window, komutIletisi([]), 'null', cerceve);
    expect(son()).toBeNull();
    ilet(window, komutIletisi([ARIZA]), 'null', cerceve);
    const kaynak = yaz.mock.calls.at(-1)?.[0];
    sonuc.unmount();
    expect(yaz.mock.calls.at(-1)).toEqual([kaynak, null]);
  });

  it('reddedilen: yalıtılmamış kökenden gelen liste palete girmez', () => {
    const { cerceve, son } = ac();
    ilet(window, komutIletisi([GUN_OZETI]), window.location.origin, cerceve);
    expect(son()).toBeNull();
  });
});
