import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, useLocation } from 'react-router-dom';
import { YalitilmisCerceve } from '../arayuz/YalitilmisCerceve.tsx';
import { useCerceveGorunumu, useYalitilmisGorunum } from './cerceve-gorunumu.ts';
import {
  CERCEVE_KANALI, CERCEVE_SURUMU, SAYAC_ANAHTAR_SINIRI, SAYAC_ANAHTAR_UZUNLUGU, cerceveKoprusuKur, cerceveSayaclariMi,
  cercevedenIletiMi, kabukKoprusuKur, kabuktanIletiMi,
  type CercevedenIleti, type KabuktanIleti,
} from './cerceve-iletisi.ts';
import type { IkinciMenu } from './ikinci-menu.ts';
import { KaliciEkranlar } from './kalici.tsx';

const KOKEN = 'http://uygulama.test';
const BAS = { kanal: CERCEVE_KANALI, surum: CERCEVE_SURUMU } as const;
const HAZIR: CercevedenIleti = { ...BAS, tip: 'hazir' };
// sira: çerçevenin o ana kadar kabuktan aldığı son sıra.
const degisti = (gorunum: string, sira: number): CercevedenIleti => ({ ...BAS, tip: 'gorunum-degisti', gorunum, sira });
const goster = (gorunum: string, sira: number): KabuktanIleti => ({ ...BAS, tip: 'gorunum', gorunum, sira });
const sayacIletisi = (sayaclar: unknown) => ({ ...BAS, tip: 'sayaclar', sayaclar });
const sahibeGit = (yol: unknown) => ({ ...BAS, tip: 'sahibe-git', yol });
// Çerçevenin kabuğu götürmeye çalışabileceği uygulama dışı ya da biçimsiz adresler.
const KOTU_YOLLAR = ['', 'malzemeler', '//dis.test/x', 'https://dis.test', 'javascript:alert(1)', '/malzemeler/../ayarlar', '/Malzemeler', '/malzemeler#x', 3, null];

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

// Tarayıcının teslim ettiği ileti: köken ve kaynak pencereyi tarayıcı yazar, gönderen değiştiremez.
function ilet(hedef: Window, veri: unknown, koken: string, kaynak: Window) {
  act(() => { hedef.dispatchEvent(new MessageEvent('message', { data: veri, origin: koken, source: kaynak })); });
}

describe('kabuk köprüsü', () => {
  function kur(kabul: (gorunum: string) => boolean = () => true) {
    const cerceve = cerceveAc();
    const gonderilen = vi.spyOn(cerceve, 'postMessage').mockImplementation(() => undefined);
    const gorunumDegisti = vi.fn(kabul);
    const hazir = vi.fn();
    const sayaclar = vi.fn();
    const sahibeGitti = vi.fn();
    const kopru = kabukKoprusuKur({ cerceve: () => cerceve, koken: KOKEN, gorunumDegisti, hazir, sayaclar, sahibeGit: sahibeGitti });
    kapatilacak.push(kopru.kapat);
    return { cerceve, gonderilen, gorunumDegisti, hazir, sayaclar, sahibeGitti, kopru };
  }

  it('sahibe git iletisi hazır beklemeden kabuğa geçer; başka kökenden, başka pencereden ya da biçimsiz yolla gelen geçmez', () => {
    const { cerceve, gonderilen, gorunumDegisti, sahibeGitti } = kur();
    ilet(window, sahibeGit('/malzemeler'), 'http://baska.test', cerceve);
    ilet(window, sahibeGit('/malzemeler'), KOKEN, cerceveAc());
    for (const yol of KOTU_YOLLAR) ilet(window, sahibeGit(yol), KOKEN, cerceve);
    ilet(window, sahibeGit('/malzemeler/12'), KOKEN, cerceve);
    expect(sahibeGitti.mock.calls).toEqual([['/malzemeler/12']]);
    expect(gorunumDegisti).not.toHaveBeenCalled();
    expect(gonderilen).not.toHaveBeenCalled();
  });

  it('sayaç iletisi hazır beklemeden kabuğa geçer; başka kökenden, başka pencereden ya da biçimsiz gelen geçmez', () => {
    const { cerceve, gonderilen, gorunumDegisti, sayaclar } = kur();
    const baska = cerceveAc();
    ilet(window, sayacIletisi({ is: 3 }), 'http://baska.test', cerceve);
    ilet(window, sayacIletisi({ is: 3 }), KOKEN, baska);
    ilet(window, sayacIletisi({ is: -1 }), KOKEN, cerceve);
    ilet(window, sayacIletisi({ is: 4, tur: null }), KOKEN, cerceve);
    expect(sayaclar.mock.calls).toEqual([[{ is: 4, tur: null }]]);
    // Sayaç görünüm akışına dokunmaz: adres değişmez, çerçeveye bir şey gitmez.
    expect(gorunumDegisti).not.toHaveBeenCalled();
    expect(gonderilen).not.toHaveBeenCalled();
  });

  it('görünüm çerçeve hazır olunca gider: yalnız çerçevenin kökenine, sürümlü ve sıralı biçimde; bekleyenlerden sonuncusu', () => {
    const { cerceve, gonderilen, hazir, kopru } = kur();
    kopru.gorunumGonder('pano');
    kopru.gorunumGonder('kalite');
    expect(gonderilen).not.toHaveBeenCalled();
    ilet(window, HAZIR, KOKEN, cerceve);
    expect(hazir).toHaveBeenCalledTimes(1);
    expect(gonderilen.mock.calls).toEqual([[{ kanal: 'tmi-gorunum', surum: 1, tip: 'gorunum', gorunum: 'kalite', sira: 1 }, KOKEN]]);
    kopru.gorunumGonder('bakim');
    expect(gonderilen.mock.calls.at(-1)).toEqual([goster('bakim', 2), KOKEN]);
  });

  it('başka kökenden gelen ileti yok sayılır; doğru kökenden gelen işlenir', () => {
    const { cerceve, gonderilen, gorunumDegisti, hazir, kopru } = kur();
    kopru.gorunumGonder('pano');
    ilet(window, HAZIR, 'http://baska.test', cerceve);
    ilet(window, HAZIR, 'null', cerceve);
    expect(hazir).not.toHaveBeenCalled();
    expect(gonderilen).not.toHaveBeenCalled();
    ilet(window, HAZIR, KOKEN, cerceve);
    ilet(window, degisti('kalite', 1), 'http://baska.test', cerceve);
    ilet(window, degisti('kalite', 1), 'null', cerceve);
    expect(gorunumDegisti).not.toHaveBeenCalled();
    ilet(window, degisti('kalite', 1), KOKEN, cerceve);
    expect(gorunumDegisti.mock.calls).toEqual([['kalite']]);
  });

  it('aynı kökendeki başka pencereden gelen ileti yok sayılır', () => {
    const { cerceve, gorunumDegisti, hazir } = kur();
    const baska = cerceveAc();
    ilet(window, HAZIR, KOKEN, baska);
    expect(hazir).not.toHaveBeenCalled();
    ilet(window, HAZIR, KOKEN, cerceve);
    ilet(window, degisti('kalite', 0), KOKEN, baska);
    ilet(window, degisti('kalite', 0), KOKEN, window);
    expect(gorunumDegisti).not.toHaveBeenCalled();
    ilet(window, degisti('kalite', 0), KOKEN, cerceve);
    expect(gorunumDegisti).toHaveBeenCalledTimes(1);
  });

  it('başka kanal, başka sürüm ve biçimsiz ileti yok sayılır', () => {
    const { cerceve, gorunumDegisti, hazir } = kur();
    for (const veri of [null, 'hazir', { tip: 'hazir' }, { ...HAZIR, kanal: 'hammadde' }, { ...HAZIR, surum: 2 }]) ilet(window, veri, KOKEN, cerceve);
    expect(hazir).not.toHaveBeenCalled();
    ilet(window, HAZIR, KOKEN, cerceve);
    for (const veri of [
      { ...BAS, tip: 'gorunum-degisti', sira: 0 }, { ...BAS, tip: 'gorunum-degisti', gorunum: '', sira: 0 }, { ...BAS, tip: 'gorunum-degisti', gorunum: 7, sira: 0 },
      { ...BAS, tip: 'gorunum-degisti', gorunum: 'pano' }, { ...BAS, tip: 'gorunum-degisti', gorunum: 'pano', sira: '0' }, { ...BAS, tip: 'gorunum-degisti', gorunum: 'pano', sira: -1 },
      { ...degisti('pano', 0), surum: 2 }, goster('pano', 1),
    ]) ilet(window, veri, KOKEN, cerceve);
    expect(gorunumDegisti).not.toHaveBeenCalled();
    ilet(window, degisti('pano', 0), KOKEN, cerceve);
    expect(gorunumDegisti.mock.calls).toEqual([['pano']]);
  });

  it('hazır gelmeden bildirilen açılış görünümü yok sayılır: derin bağlantı köke düşmez', () => {
    const { cerceve, gonderilen, gorunumDegisti, kopru } = kur();
    kopru.gorunumGonder('kalite');
    ilet(window, degisti('ana', 0), KOKEN, cerceve);
    expect(gorunumDegisti).not.toHaveBeenCalled();
    ilet(window, HAZIR, KOKEN, cerceve);
    expect(gonderilen.mock.calls).toEqual([[goster('kalite', 1), KOKEN]]);
  });

  it('hazırdan sonra gelen ama kabuğun isteğini görmeden yola çıkmış bildirim yok sayılır; isteği görmüş olan kabul edilir', () => {
    const { cerceve, gonderilen, gorunumDegisti, kopru } = kur();
    kopru.gorunumGonder('kalite');
    ilet(window, HAZIR, KOKEN, cerceve);
    // Çerçeve "kalite" isteğini (sıra 1) almadan önce kendi açılış görünümünü bildirmiş.
    ilet(window, degisti('ana', 0), KOKEN, cerceve);
    expect(gorunumDegisti).not.toHaveBeenCalled();
    // Bellek ezilmedi: aynı görünüm yeniden gönderilmez.
    kopru.gorunumGonder('kalite');
    expect(gonderilen).toHaveBeenCalledTimes(1);
    kopru.gorunumGonder('bakim');
    ilet(window, degisti('pano', 1), KOKEN, cerceve);
    expect(gorunumDegisti).not.toHaveBeenCalled();
    ilet(window, degisti('pano', 2), KOKEN, cerceve);
    expect(gorunumDegisti.mock.calls).toEqual([['pano']]);
  });

  it('çerçeve yeniden hazır olunca son görünüm yeni sırayla yeniden gider; kabuğun istediğinin yankısı bildirilmez', () => {
    const { cerceve, gonderilen, gorunumDegisti, kopru } = kur();
    ilet(window, HAZIR, KOKEN, cerceve);
    kopru.gorunumGonder('pano');
    ilet(window, degisti('pano', 1), KOKEN, cerceve);
    expect(gorunumDegisti).not.toHaveBeenCalled();
    ilet(window, degisti('kalite', 1), KOKEN, cerceve);
    expect(gorunumDegisti.mock.calls).toEqual([['kalite']]);
    gonderilen.mockClear();
    ilet(window, HAZIR, KOKEN, cerceve);
    expect(gonderilen.mock.calls).toEqual([[goster('kalite', 2), KOKEN]]);
    // Hiç istek gitmemiş çerçevenin (adres menüde değil) bildirimi sıra 0 ile kabul edilir.
    const bos = kur();
    ilet(window, HAZIR, KOKEN, bos.cerceve);
    ilet(window, degisti('pano', 0), KOKEN, bos.cerceve);
    expect(bos.gorunumDegisti.mock.calls).toEqual([['pano']]);
  });

  it('reddedilen görünüm adı belleğe yazılmaz: aynı görünüm çerçeveye yeniden gönderilir, yeniden hazırda adresteki gider', () => {
    const { cerceve, gonderilen, gorunumDegisti, kopru } = kur((g) => g !== 'olmayan');
    ilet(window, HAZIR, KOKEN, cerceve);
    kopru.gorunumGonder('ana');
    ilet(window, degisti('olmayan', 1), KOKEN, cerceve);
    expect(gorunumDegisti.mock.calls).toEqual([['olmayan']]);
    // Çerçeve reddedilen görünümde: etkin maddeye yeniden tıklamak onu geri çağırır.
    kopru.gorunumGonder('ana');
    expect(gonderilen.mock.calls.at(-1)).toEqual([goster('ana', 2), KOKEN]);
    // Çerçeve yerindeyken aynı görünüm yeniden gönderilmez.
    kopru.gorunumGonder('ana');
    expect(gonderilen).toHaveBeenCalledTimes(2);
    ilet(window, degisti('olmayan', 2), KOKEN, cerceve);
    gonderilen.mockClear();
    ilet(window, HAZIR, KOKEN, cerceve);
    expect(gonderilen.mock.calls).toEqual([[goster('ana', 3), KOKEN]]);
  });

  it('çerçeve yeniden yüklenmeden yeniden hazır bildirirse sıra geri dönmez: iki hazır arasında yola çıkmış bildirim yeni isteği ezmez', () => {
    const { cerceve, gonderilen, gorunumDegisti, kopru } = kur();
    ilet(window, HAZIR, KOKEN, cerceve);
    kopru.gorunumGonder('x');
    expect(gonderilen.mock.calls.at(-1)).toEqual([goster('x', 1), KOKEN]);
    ilet(window, HAZIR, KOKEN, cerceve);
    expect(gonderilen.mock.calls.at(-1)).toEqual([goster('x', 2), KOKEN]);
    // Kullanıcı ikinci isteği görmeden içeride tıklamış (sıra 1): bildirim eskidir.
    ilet(window, degisti('a', 1), KOKEN, cerceve);
    expect(gorunumDegisti).not.toHaveBeenCalled();
    // Bellek ezilmedi, çerçeve de x'i uygulayacak: aynı görünüm yeniden gönderilmez.
    kopru.gorunumGonder('x');
    expect(gonderilen).toHaveBeenCalledTimes(2);
    // İkinci isteği gördükten sonraki tıklama kabul edilir; sonraki hazırda o görünüm gider.
    ilet(window, degisti('a', 2), KOKEN, cerceve);
    expect(gorunumDegisti.mock.calls).toEqual([['a']]);
    ilet(window, HAZIR, KOKEN, cerceve);
    expect(gonderilen.mock.calls.at(-1)).toEqual([goster('a', 3), KOKEN]);
  });

  it('kapatılan köprü dinlemez', () => {
    const { cerceve, gorunumDegisti, kopru } = kur();
    ilet(window, HAZIR, KOKEN, cerceve);
    kopru.kapat();
    ilet(window, degisti('kalite', 0), KOKEN, cerceve);
    expect(gorunumDegisti).not.toHaveBeenCalled();
  });
});

describe('çerçeve köprüsü', () => {
  function kur(iste: (gorunum: string) => void | Promise<void> = () => undefined) {
    const pencere = cerceveAc();
    const ust = { postMessage: vi.fn() };
    const gorunumIste = vi.fn(iste);
    const kopru = cerceveKoprusuKur({ pencere, ust: ust as unknown as Window, koken: KOKEN, gorunumIste, hazirAraligiMs: 100, hazirYinelemeSiniri: 3 });
    kapatilacak.push(kopru.kapat);
    return { pencere, ust, gorunumIste, kopru };
  }
  const kabuktan = (pencere: Window, veri: unknown, koken: string, kaynak: unknown) => {
    const olay = new MessageEvent('message', { data: veri, origin: koken });
    Object.defineProperty(olay, 'source', { value: kaynak });
    pencere.dispatchEvent(olay);
  };

  it('hazır ve görünüm değişti iletileri yalnız kabuğun kökenine gider; bildirim kabuktan alınan son sırayı taşır', () => {
    const { pencere, ust, kopru } = kur();
    kopru.hazirBildir();
    kopru.gorunumBildir('pano');
    kabuktan(pencere, goster('kalite', 3), KOKEN, ust);
    kopru.gorunumBildir('bakim');
    expect(ust.postMessage.mock.calls).toEqual([[HAZIR, KOKEN], [degisti('pano', 0), KOKEN], [degisti('bakim', 3), KOKEN]]);
    // Çerçeve sıraya anlam yüklemez: yeniden hazır bildirse de aldığı son sırayı yazar.
    kopru.hazirBildir();
    kopru.gorunumBildir('pano');
    expect(ust.postMessage.mock.calls.at(-1)).toEqual([degisti('pano', 3), KOKEN]);
  });

  it('hazır, kabuktan görünüm gelene kadar aralıkla yinelenir; gelince durur', () => {
    vi.useFakeTimers();
    try {
      const { pencere, ust, kopru } = kur();
      const hazirSayisi = () => ust.postMessage.mock.calls.filter((c) => (c[0] as CercevedenIleti).tip === 'hazir').length;
      kopru.hazirBildir();
      expect(hazirSayisi()).toBe(1);
      vi.advanceTimersByTime(250);
      expect(hazirSayisi()).toBe(3);
      kabuktan(pencere, goster('kalite', 1), KOKEN, ust);
      vi.advanceTimersByTime(1000);
      expect(hazirSayisi()).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('hazır yinelemesi üst sınırda durur; kapatılan köprü yinelemez', () => {
    vi.useFakeTimers();
    try {
      const sinirli = kur();
      sinirli.kopru.hazirBildir();
      vi.advanceTimersByTime(5000);
      expect(sinirli.ust.postMessage).toHaveBeenCalledTimes(4);
      const kapanan = kur();
      kapanan.kopru.hazirBildir();
      kapanan.kopru.kapat();
      vi.advanceTimersByTime(5000);
      expect(kapanan.ust.postMessage).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('kabuğun isteği uygulanırken yapılan bildirim gönderilmez; uygulandıktan sonraki gönderilir', async () => {
    let coz: () => void = () => undefined;
    const bildirenler: (() => void)[] = [];
    const { pencere, ust, kopru } = kur((gorunum) => {
      // Uygulama sırasında çerçevenin kendi "görünüm değişti" olayı eski görünümle tetiklenir.
      bildirenler.forEach((b) => b());
      return gorunum === 'yavas' ? new Promise<void>((c) => { coz = c; }) : undefined;
    });
    bildirenler.push(() => kopru.gorunumBildir('ana'));
    kabuktan(pencere, goster('kalite', 1), KOKEN, ust);
    expect(ust.postMessage).not.toHaveBeenCalled();
    kopru.gorunumBildir('kalite');
    expect(ust.postMessage.mock.calls).toEqual([[degisti('kalite', 1), KOKEN]]);
    // Eşzamansız uygulama: söz çözülene kadar bildirim bastırılır.
    kabuktan(pencere, goster('yavas', 2), KOKEN, ust);
    kopru.gorunumBildir('kalite');
    expect(ust.postMessage).toHaveBeenCalledTimes(1);
    coz();
    await Promise.resolve();
    await Promise.resolve();
    kopru.gorunumBildir('pano');
    expect(ust.postMessage.mock.calls.at(-1)).toEqual([degisti('pano', 2), KOKEN]);
  });

  it('kabuğun isteği yalnız kabuğun kökeninden ve üst pencereden gelirse uygulanır', () => {
    const { pencere, ust, gorunumIste } = kur();
    kabuktan(pencere, goster('kalite', 1), 'http://baska.test', ust);
    kabuktan(pencere, goster('kalite', 1), KOKEN, {});
    kabuktan(pencere, { ...goster('kalite', 1), surum: 2 }, KOKEN, ust);
    kabuktan(pencere, { ...BAS, tip: 'gorunum', gorunum: 'kalite' }, KOKEN, ust);
    kabuktan(pencere, HAZIR, KOKEN, ust);
    expect(gorunumIste).not.toHaveBeenCalled();
    kabuktan(pencere, goster('kalite', 1), KOKEN, ust);
    expect(gorunumIste.mock.calls).toEqual([['kalite']]);
  });
});

describe('çerçeve köprüsü: sayaçlar', () => {
  it('sayaçlar yalnız kabuğun kökenine sürümlü iletiyle gider; biçime uymayan eşlem gönderilmez, hata verir', () => {
    const ust = { postMessage: vi.fn() };
    const kopru = cerceveKoprusuKur({ pencere: cerceveAc(), ust: ust as unknown as Window, koken: KOKEN, gorunumIste: () => undefined });
    kapatilacak.push(kopru.kapat);
    kopru.sayaclarBildir({ is: 2, tur: null });
    expect(() => { kopru.sayaclarBildir({ is: 1.5 }); }).toThrow(TypeError);
    expect(ust.postMessage.mock.calls).toEqual([[sayacIletisi({ is: 2, tur: null }), KOKEN]]);
    expect(cercevedenIletiMi(ust.postMessage.mock.calls[0]?.[0])).toBe(true);
  });
});

describe('çerçeve köprüsü: sahibe git', () => {
  it('yol yalnız kabuğun kökenine sürümlü iletiyle gider; biçimsiz yol gönderilmez, hata verir', () => {
    const ust = { postMessage: vi.fn() };
    const kopru = cerceveKoprusuKur({ pencere: cerceveAc(), ust: ust as unknown as Window, koken: KOKEN, gorunumIste: () => undefined });
    kapatilacak.push(kopru.kapat);
    kopru.sahibeGit('/istasyonlar/4');
    expect(() => { kopru.sahibeGit('//dis.test'); }).toThrow(TypeError);
    expect(ust.postMessage.mock.calls).toEqual([[sahibeGit('/istasyonlar/4'), KOKEN]]);
    expect(cercevedenIletiMi(ust.postMessage.mock.calls[0]?.[0])).toBe(true);
    expect(kabuktanIletiMi(sahibeGit('/istasyonlar/4'))).toBe(false);
  });
});

describe('sayaç biçimi', () => {
  const anahtarlar = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`m${i}`, i]));

  it('kabul: madde anahtarı -> eksi olmayan tam sayı ya da null; boş eşlem; sınırdaki anahtar sayısı ve uzunluğu', () => {
    expect(cerceveSayaclariMi({})).toBe(true);
    expect(cerceveSayaclariMi({ is: 0, 'tur-2': null, ayar: Number.MAX_SAFE_INTEGER })).toBe(true);
    expect(cerceveSayaclariMi(Object.assign(Object.create(null) as object, { is: 1 }))).toBe(true);
    expect(cerceveSayaclariMi(anahtarlar(SAYAC_ANAHTAR_SINIRI))).toBe(true);
    expect(cerceveSayaclariMi({ [`a${'b'.repeat(SAYAC_ANAHTAR_UZUNLUGU - 1)}`]: 1 })).toBe(true);
    expect(cercevedenIletiMi(sayacIletisi({ is: 1 }))).toBe(true);
  });

  it('red: eksi, kesirli, sonsuz, NaN, metin, iç içe değer; dizi, null, sınıf örneği; sınırı aşan anahtar sayısı ve uzunluğu; anahtar kuralı dışı ad', () => {
    for (const deger of [-1, 1.5, Infinity, Number.NaN, '3', { a: 1 }, [1], true, undefined, Number.MAX_SAFE_INTEGER + 1]) {
      expect(cerceveSayaclariMi({ is: deger }), String(deger)).toBe(false);
    }
    for (const eslem of [null, undefined, [], [1], 3, 'is', new Map([['is', 1]]), new Date()]) {
      expect(cerceveSayaclariMi(eslem), String(eslem)).toBe(false);
    }
    expect(cerceveSayaclariMi(anahtarlar(SAYAC_ANAHTAR_SINIRI + 1))).toBe(false);
    expect(cerceveSayaclariMi({ [`a${'b'.repeat(SAYAC_ANAHTAR_UZUNLUGU)}`]: 1 })).toBe(false);
    for (const ad of ['', 'Is', '1is', 'is kutusu', '__proto__', 'constructor_', '/stok/is']) {
      expect(cerceveSayaclariMi({ [ad]: 1 }), ad).toBe(false);
    }
    expect(cerceveSayaclariMi({ [Symbol('is')]: 1 })).toBe(false);
    expect(cercevedenIletiMi(sayacIletisi({ is: -1 }))).toBe(false);
    expect(cercevedenIletiMi({ ...BAS, tip: 'sayaclar' })).toBe(false);
    expect(cercevedenIletiMi({ ...sayacIletisi({ is: 1 }), surum: CERCEVE_SURUMU + 1 })).toBe(false);
    // Kabuktan çerçeveye yönde sayaç iletisi yoktur.
    expect(kabuktanIletiMi(sayacIletisi({ is: 1 }))).toBe(false);
  });
});

describe('ileti biçimi', () => {
  it('iki yönün iletileri birbirinin yerine geçmez', () => {
    expect(kabuktanIletiMi(goster('a', 1))).toBe(true);
    expect(kabuktanIletiMi(goster('a', 0))).toBe(false);
    expect(kabuktanIletiMi(degisti('a', 1))).toBe(false);
    expect(cercevedenIletiMi(degisti('a', 0))).toBe(true);
    expect(cercevedenIletiMi(HAZIR)).toBe(true);
    expect(cercevedenIletiMi(goster('a', 1))).toBe(false);
  });
});

describe('useCerceveGorunumu', () => {
  const MENU: IkinciMenu = {
    kok: '/ornek',
    baslik: 'Örnek',
    simge: 'cube',
    gruplar: [{ maddeler: [
      { anahtar: 'ana', baslik: 'Ana', yol: '/ornek', simge: 'list', islem: 'ornek.oku' },
      { anahtar: 'kalite', baslik: 'Kalite', yol: '/ornek/kalite', simge: 'ruler', islem: 'ornek.oku' },
    ] }],
  };

  function Ekran() {
    const cerceve = useRef<HTMLIFrameElement>(null);
    const gorunum = useCerceveGorunumu({ cerceve, kok: '/ornek', menuler: [MENU] });
    const konum = useLocation();
    return (
      <>
        <p data-testid="durum">{`${konum.pathname} ${gorunum ?? 'yok'}`}</p>
        <Link to="/ornek">anaya</Link>
        <Link to="/ornek/kalite">kaliteye</Link>
        <iframe ref={cerceve} title="Örnek" />
      </>
    );
  }

  function ac(adres: string) {
    render(<MemoryRouter initialEntries={[adres]}><Ekran /></MemoryRouter>);
    const cerceve = (screen.getByTitle('Örnek') as HTMLIFrameElement).contentWindow as Window;
    const gonderilen = vi.spyOn(cerceve, 'postMessage').mockImplementation(() => undefined);
    return { cerceve, gonderilen, durum: () => screen.getByTestId('durum').textContent };
  }
  const koken = () => window.location.origin;
  const tikla = (ad: string) => act(() => { screen.getByRole('link', { name: ad }).click(); });

  it('adresteki maddenin anahtarı çerçeve hazır olunca gönderilir; menüden gezinince yenisi gider', () => {
    const { cerceve, gonderilen, durum } = ac('/ornek');
    expect(durum()).toBe('/ornek ana');
    ilet(window, HAZIR, koken(), cerceve);
    expect(gonderilen.mock.calls).toEqual([[goster('ana', 1), koken()]]);
    tikla('kaliteye');
    expect(durum()).toBe('/ornek/kalite kalite');
    expect(gonderilen.mock.calls.at(-1)).toEqual([goster('kalite', 2), koken()]);
  });

  it('derin bağlantı: çerçeve açılış görünümünü hazırdan önce ya da hemen sonra bildirse de adres yerinde kalır', () => {
    const { cerceve, gonderilen, durum } = ac('/ornek/kalite');
    ilet(window, degisti('ana', 0), koken(), cerceve);
    expect(durum()).toBe('/ornek/kalite kalite');
    ilet(window, HAZIR, koken(), cerceve);
    ilet(window, degisti('ana', 0), koken(), cerceve);
    expect(durum()).toBe('/ornek/kalite kalite');
    expect(gonderilen.mock.calls).toEqual([[goster('kalite', 1), koken()]]);
  });

  it('çerçeve içinden görünüm değişince adres o maddenin yoluna çekilir; yabancı köken adresi değiştirmez', () => {
    const { cerceve, gonderilen, durum } = ac('/ornek');
    ilet(window, HAZIR, koken(), cerceve);
    gonderilen.mockClear();
    ilet(window, degisti('kalite', 1), 'http://baska.test', cerceve);
    expect(durum()).toBe('/ornek ana');
    ilet(window, degisti('kalite', 1), koken(), cerceve);
    expect(durum()).toBe('/ornek/kalite kalite');
    // Çerçeve zaten o görünümdedir: geri gönderilmez.
    expect(gonderilen).not.toHaveBeenCalled();
  });

  it('menüde olmayan görünüm adı adresi değiştirmez; sonra etkin maddeye tıklamak görünümü çerçeveye yeniden gönderir', () => {
    const { cerceve, gonderilen, durum } = ac('/ornek');
    ilet(window, HAZIR, koken(), cerceve);
    ilet(window, degisti('olmayan', 1), koken(), cerceve);
    expect(durum()).toBe('/ornek ana');
    gonderilen.mockClear();
    tikla('anaya');
    expect(gonderilen.mock.calls).toEqual([[goster('ana', 2), koken()]]);
    // Çerçeve yerindeyken etkin maddeye tıklamak bir şey göndermez.
    tikla('anaya');
    expect(gonderilen).toHaveBeenCalledTimes(1);
    ilet(window, degisti('olmayan', 2), koken(), cerceve);
    gonderilen.mockClear();
    ilet(window, HAZIR, koken(), cerceve);
    expect(gonderilen.mock.calls).toEqual([[goster('ana', 3), koken()]]);
  });
});

describe('useYalitilmisGorunum', () => {
  const MENU: IkinciMenu = {
    kok: '/ornek',
    baslik: 'Örnek',
    simge: 'cube',
    gruplar: [{ maddeler: [
      { anahtar: 'ana', baslik: 'Ana', yol: '/ornek', simge: 'list', islem: 'ornek.oku' },
      { anahtar: 'kalite', baslik: 'Kalite', yol: '/ornek/kalite', simge: 'ruler', islem: 'ornek.oku' },
    ] }],
  };
  const SAYFA = '<!doctype html><html><head></head><body></body></html>';

  function Ekran({ modulun }: { modulun: (veri: unknown) => void }) {
    const gorunumIletisi = useYalitilmisGorunum('/ornek', [MENU]);
    const konum = useLocation();
    return (
      <>
        <p data-testid="durum">{konum.pathname}</p>
        <Link to="/ornek/kalite">kaliteye</Link>
        <YalitilmisCerceve
          baslik="Örnek"
          sayfa={SAYFA}
          iletiGeldi={(veri, yanitla) => { if (!gorunumIletisi(veri, yanitla)) modulun(veri); }}
        />
      </>
    );
  }

  function ac(adres: string) {
    const modulun = vi.fn();
    render(<MemoryRouter initialEntries={[adres]}><Ekran modulun={modulun} /></MemoryRouter>);
    const cerceve = (screen.getByTitle('Örnek') as HTMLIFrameElement).contentWindow as Window;
    const gonderilen = vi.spyOn(cerceve, 'postMessage').mockImplementation(() => undefined);
    return { cerceve, gonderilen, modulun, durum: () => screen.getByTestId('durum').textContent };
  }

  it('opak kökenli çerçevede hazır gelince adresteki görünüm gider; menüden gezinme yenisini yollar; içerideki geçiş adresi değiştirir', () => {
    const { cerceve, gonderilen, modulun, durum } = ac('/ornek');
    ilet(window, HAZIR, 'null', cerceve);
    // Opak kökene adresle gönderilemez: hedef '*', alıcıyı kaynak pencere belirler.
    expect(gonderilen.mock.calls).toEqual([[goster('ana', 1), '*']]);
    act(() => { screen.getByRole('link', { name: 'kaliteye' }).click(); });
    expect(gonderilen.mock.calls.at(-1)).toEqual([goster('kalite', 2), '*']);
    ilet(window, degisti('ana', 2), 'null', cerceve);
    expect(durum()).toBe('/ornek');
    expect(modulun).not.toHaveBeenCalled();
  });

  it('reddedilen: menüde olmayan görünüm adresi değiştirmez; yalıtılmamış kökenden gelen ileti köprüye ulaşmaz', () => {
    const { cerceve, gonderilen, durum } = ac('/ornek');
    ilet(window, HAZIR, window.location.origin, cerceve);
    expect(gonderilen).not.toHaveBeenCalled();
    ilet(window, HAZIR, 'null', cerceve);
    ilet(window, degisti('olmayan', 1), 'null', cerceve);
    expect(durum()).toBe('/ornek');
  });

  it('sahibe git: kayıtlı sayfaya ya da altına gezinir; kayıtsız ve biçimsiz yol adresi değiştirmez', () => {
    const { cerceve, durum } = ac('/ornek/kalite');
    ilet(window, sahibeGit('/olmayan-sayfa'), 'null', cerceve);
    ilet(window, sahibeGit('/malzemelerx'), 'null', cerceve);
    for (const yol of KOTU_YOLLAR) ilet(window, sahibeGit(yol), 'null', cerceve);
    expect(durum()).toBe('/ornek/kalite');
    ilet(window, sahibeGit('/malzemeler/12'), 'null', cerceve);
    expect(durum()).toBe('/malzemeler/12');
  });

  it('reddedilen: gizli kalıcı ekrandaki çerçeve adresi değiştiremez; görünür olunca yine değiştirir', () => {
    function Kalici() { return <Ekran modulun={() => undefined} />; }
    function Disari() { return <><Link to="/baska">dışarı</Link><Link to="/ornek">geri</Link></>; }
    render(
      <MemoryRouter initialEntries={['/ornek']}>
        <Disari />
        <KaliciEkranlar rotalar={[{ yol: '/ornek', ekran: Kalici, kalici: true }]} />
      </MemoryRouter>,
    );
    const cerceve = (screen.getByTitle('Örnek') as HTMLIFrameElement).contentWindow as Window;
    vi.spyOn(cerceve, 'postMessage').mockImplementation(() => undefined);
    const durum = () => screen.getByTestId('durum').textContent;
    ilet(window, HAZIR, 'null', cerceve);
    act(() => { screen.getByRole('link', { name: 'dışarı' }).click(); });
    expect(durum()).toBe('/baska');
    ilet(window, degisti('kalite', 1), 'null', cerceve);
    ilet(window, sahibeGit('/malzemeler/12'), 'null', cerceve);
    expect(durum()).toBe('/baska');
    act(() => { screen.getByRole('link', { name: 'geri' }).click(); });
    ilet(window, sahibeGit('/malzemeler/12'), 'null', cerceve);
    expect(durum()).toBe('/malzemeler/12');
  });

  it('reddedilen: görünüm kanalı dışındaki ileti köprüde işlenmez, modülün kendi işleyicisine gider', () => {
    const { cerceve, gonderilen, modulun } = ac('/ornek');
    const istek = { kanal: 'ornek', yon: 'istek', id: 1, tip: 'liste' };
    ilet(window, istek, 'null', cerceve);
    expect(modulun.mock.calls).toEqual([[istek]]);
    expect(gonderilen).not.toHaveBeenCalled();
  });
});
