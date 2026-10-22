import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { YalitilmisCerceve } from '../arayuz/YalitilmisCerceve.tsx';
import { useYalitilmisGorunum } from './cerceve-gorunumu.ts';
import {
  CERCEVE_KANALI, CERCEVE_SURUMU, KOMUT_ANAHTAR_UZUNLUGU, KOMUT_METNI_UZUNLUGU, KOMUT_ONERI_SINIRI, KOMUT_SINIRI, cerceveKomutlariMi, cerceveKoprusuKur,
  cercevedenIletiMi, kabukKoprusuKur, kabuktanIletiMi, type CerceveKomutu,
} from './cerceve-iletisi.ts';
import type { IkinciMenu } from './ikinci-menu.ts';
import { SayfaKomutBaglami, type SayfaKomutu } from './sayfa-komutlari.ts';

const KOKEN = 'http://uygulama.test';
const BAS = { kanal: CERCEVE_KANALI, surum: CERCEVE_SURUMU } as const;
const komutIletisi = (komutlar: unknown) => ({ ...BAS, tip: 'komutlar', komutlar });
const calistirIletisi = (anahtar: unknown) => ({ ...BAS, tip: 'komut-calistir', anahtar });
const metinIletisi = (metin: unknown, sira: unknown) => ({ ...BAS, tip: 'komut-metni', metin, sira });
const oneriIletisi = (sira: unknown, komutlar: unknown) => ({ ...BAS, tip: 'komut-onerileri', sira, komutlar });
const ONE_AL: CerceveKomutu = { anahtar: 'sp-116-one-al', baslik: 'SP-116 öne al', simge: 'next', aciklama: '434,1 sa -> 376,1 sa' };
const sekiz = (n: number) => Array.from({ length: n }, (_, i) => ({ anahtar: `o${i}`, baslik: 'Öneri' }));
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
    // Kaynak başına son yazılan; önerilerin ayrı kaynağı (#oneri) sabit listeyi ezmez.
    const kayitlar = new Map<string, readonly SayfaKomutu[] | null>();
    const yaz = vi.fn((kaynak: string, liste: readonly SayfaKomutu[] | null) => { kayitlar.set(kaynak, liste); });
    const son = () => [...kayitlar.entries()].find(([k]) => !k.endsWith('#oneri'))?.[1] ?? null;
    const sonuc = render(
      <MemoryRouter initialEntries={['/ornek']}>
        <SayfaKomutBaglami.Provider value={yaz}><Ekran /></SayfaKomutBaglami.Provider>
      </MemoryRouter>,
    );
    const cerceve = (screen.getByTitle('Örnek') as HTMLIFrameElement).contentWindow as Window;
    const gonderilen = vi.spyOn(cerceve, 'postMessage').mockImplementation(() => undefined);
    return { cerceve, gonderilen, yaz, son, kayitlar, sonuc };
  }

  it('izinli: çerçevenin listesi kabuğa yazılır, seçilen komut çerçeveye döner; çerçeve kalkınca liste silinir', () => {
    const { cerceve, gonderilen, son, sonuc } = ac();
    ilet(window, komutIletisi([GUN_OZETI, { anahtar: 'yinele', baslik: 'Yinele' }]), 'null', cerceve);
    expect(son()?.map((k) => [k.anahtar, k.simge])).toEqual([['gun-ozeti', 'list'], ['yinele', 'bolt']]);
    act(() => { son()?.[0]?.calistir(); });
    expect(gonderilen.mock.calls).toEqual([[calistirIletisi('gun-ozeti'), '*']]);
    ilet(window, komutIletisi([]), 'null', cerceve);
    expect(son()).toBeNull();
    ilet(window, komutIletisi([ARIZA]), 'null', cerceve);
    expect(son()).not.toBeNull();
    sonuc.unmount();
    expect(son()).toBeNull();
  });

  it('reddedilen: yalıtılmamış kökenden gelen liste palete girmez', () => {
    const { cerceve, son } = ac();
    ilet(window, komutIletisi([GUN_OZETI]), window.location.origin, cerceve);
    expect(son()).toBeNull();
  });
});

describe('değer alan komut biçimi (kural 8)', () => {
  it('kabul: metin ve sıra; en çok 8 öneri; iki yön karışmaz', () => {
    expect(kabuktanIletiMi(metinIletisi('116 o', 1))).toBe(true);
    expect(kabuktanIletiMi(metinIletisi('x'.repeat(KOMUT_METNI_UZUNLUGU), 3))).toBe(true);
    expect(cercevedenIletiMi(oneriIletisi(1, [ONE_AL]))).toBe(true);
    expect(cercevedenIletiMi(oneriIletisi(2, sekiz(KOMUT_ONERI_SINIRI)))).toBe(true);
    expect(cercevedenIletiMi(oneriIletisi(1, []))).toBe(true);
    expect(cercevedenIletiMi(metinIletisi('116 o', 1))).toBe(false);
    expect(kabuktanIletiMi(oneriIletisi(1, [ONE_AL]))).toBe(false);
  });

  it('red: boş ya da uzun metin, sırasız ya da sıfır sıra, sınırı aşan ya da bozuk öneri', () => {
    for (const metin of ['', '  ', 'x'.repeat(KOMUT_METNI_UZUNLUGU + 1), 3, null]) expect(kabuktanIletiMi(metinIletisi(metin, 1))).toBe(false);
    for (const sira of [0, -1, 1.5, '1', null, undefined]) {
      expect(kabuktanIletiMi(metinIletisi('116', sira)), String(sira)).toBe(false);
      expect(cercevedenIletiMi(oneriIletisi(sira, [ONE_AL])), String(sira)).toBe(false);
    }
    expect(cercevedenIletiMi(oneriIletisi(1, sekiz(KOMUT_ONERI_SINIRI + 1)))).toBe(false);
    expect(cercevedenIletiMi(oneriIletisi(1, [ONE_AL, ONE_AL]))).toBe(false);
    expect(cercevedenIletiMi(oneriIletisi(1, [{ anahtar: 'A', baslik: 'x' }]))).toBe(false);
  });
});

describe('kabuk köprüsü: komut metni', () => {
  function kur() {
    const cerceve = cerceveAc();
    const gonderilen = vi.spyOn(cerceve, 'postMessage').mockImplementation(() => undefined);
    const komutOnerileri = vi.fn();
    const kopru = kabukKoprusuKur({ cerceve: () => cerceve, koken: KOKEN, gorunumDegisti: () => true, komutOnerileri });
    kapatilacak.push(kopru.kapat);
    return { cerceve, gonderilen, komutOnerileri, kopru };
  }

  it('izinli: metin artan sırayla gider (kırpılır); yalnız son sıranın cevabı kopyalanarak geçer', () => {
    const { cerceve, gonderilen, komutOnerileri, kopru } = kur();
    kopru.komutMetni(' 116 ');
    kopru.komutMetni('116 o');
    expect(gonderilen.mock.calls).toEqual([[metinIletisi('116', 1), KOKEN], [metinIletisi('116 o', 2), KOKEN]]);
    ilet(window, oneriIletisi(1, [{ anahtar: 'eski', baslik: 'Eski' }]), KOKEN, cerceve);
    expect(komutOnerileri).not.toHaveBeenCalled();
    ilet(window, oneriIletisi(2, [ONE_AL]), KOKEN, cerceve);
    expect(komutOnerileri.mock.calls).toEqual([[[ONE_AL]]]);
    expect(komutOnerileri.mock.calls[0]?.[0][0]).not.toBe(ONE_AL);
  });

  it('reddedilen: boş metin gönderilmez ve bekleyen soruyu düşürür; sorulmamış, başka kökenden ya da bozuk cevap geçmez', () => {
    const { cerceve, gonderilen, komutOnerileri, kopru } = kur();
    ilet(window, oneriIletisi(1, [ONE_AL]), KOKEN, cerceve);
    kopru.komutMetni('116');
    ilet(window, oneriIletisi(1, [ONE_AL]), 'http://baska.test', cerceve);
    ilet(window, oneriIletisi(1, [ONE_AL]), KOKEN, cerceveAc());
    ilet(window, oneriIletisi(1, sekiz(KOMUT_ONERI_SINIRI + 1)), KOKEN, cerceve);
    kopru.komutMetni('  ');
    kopru.komutMetni('x'.repeat(KOMUT_METNI_UZUNLUGU + 1));
    ilet(window, oneriIletisi(1, [ONE_AL]), KOKEN, cerceve);
    expect(komutOnerileri).not.toHaveBeenCalled();
    expect(gonderilen.mock.calls).toEqual([[metinIletisi('116', 1), KOKEN]]);
  });
});

describe('çerçeve köprüsü: komut metni', () => {
  it('kabuğun metni sırasıyla çağrılır; öneriler o sırayla gider, bozuk öneri ya da sıra hata verir', () => {
    const ust = cerceveAc();
    const yollanan = vi.spyOn(ust, 'postMessage').mockImplementation(() => undefined);
    const pencere = cerceveAc();
    const komutMetni = vi.fn();
    const gorunumIste = vi.fn();
    const kopru = cerceveKoprusuKur({ pencere, ust, koken: KOKEN, gorunumIste, komutMetni });
    kapatilacak.push(kopru.kapat);
    ilet(pencere, metinIletisi('116 o', 4), KOKEN, ust);
    ilet(pencere, metinIletisi('116 o', 5), 'http://baska.test', ust);
    expect(komutMetni.mock.calls).toEqual([['116 o', 4]]);
    expect(gorunumIste).not.toHaveBeenCalled();
    kopru.komutOnerileriBildir(4, [ONE_AL]);
    expect(() => { kopru.komutOnerileriBildir(0, [ONE_AL]); }).toThrow(TypeError);
    expect(() => { kopru.komutOnerileriBildir(4, sekiz(KOMUT_ONERI_SINIRI + 1)); }).toThrow(TypeError);
    expect(yollanan.mock.calls).toEqual([[oneriIletisi(4, [ONE_AL]), KOKEN]]);
  });
});
