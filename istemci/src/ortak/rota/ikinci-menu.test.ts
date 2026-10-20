import { describe, expect, it } from 'vitest';
import { matchPath } from 'react-router-dom';
import { islemMi } from '#paylasilan/islemler.ts';
import { SAYFA_YOLLARI, ikinciMenulerinHatalari } from '#paylasilan/sayfalar.ts';
import { SIMGELER } from '../tasarim/simgeler.ts';
import { modulRotalari } from './kesif.ts';
import { IKINCI_MENU_TANIMLARI, acikIkinciMenu, etkinMadde, ikinciMenuyuSuz, menuMaddeleri, type IkinciMenu } from './ikinci-menu.ts';

const MENU: IkinciMenu = {
  kok: '/ornek',
  baslik: 'Örnek',
  simge: 'cube',
  gruplar: [
    { maddeler: [
      { anahtar: 'ana', baslik: 'Ana', yol: '/ornek', simge: 'list', islem: 'sayfa.ornek' },
      { anahtar: 'is', baslik: 'İş kutusu', yol: '/ornek/is', simge: 'box', islem: 'ornek.is' },
    ] },
    { baslik: 'Tanımlar', maddeler: [{ anahtar: 'tur', baslik: 'Türler', yol: '/ornek/tur', simge: 'grid', islem: 'ornek.tanim' }] },
    { baslik: 'Sistem', maddeler: [{ anahtar: 'ayar', baslik: 'Ayarlar', yol: '/ornek/ayar', simge: 'wrench', islem: 'ornek.yonet' }] },
  ],
};
const HEPSI = ['sayfa.ornek', 'ornek.is', 'ornek.tanim', 'ornek.yonet'];
const anahtarlar = (menu: IkinciMenu | null) => (menu === null ? null : menuMaddeleri(menu).map((m) => m.anahtar));

describe('ikinci menü süzgeci', () => {
  it('bütün işlemleri taşıyan kullanıcı (bayraklı yönetici) her maddeyi görür', () => {
    expect(anahtarlar(ikinciMenuyuSuz(MENU, HEPSI))).toEqual(['ana', 'is', 'tur', 'ayar']);
  });

  it('işlemi olmayan madde düşer; maddesi kalmayan grup da düşer', () => {
    const suzulmus = ikinciMenuyuSuz(MENU, ['sayfa.ornek', 'ornek.yonet']);
    expect(anahtarlar(suzulmus)).toEqual(['ana', 'ayar']);
    expect(suzulmus?.gruplar.map((g) => g.baslik)).toEqual([undefined, 'Sistem']);
  });

  it('veya listesindeki işlemlerden biri maddeyi gösterir; hiçbiri yoksa madde düşer', () => {
    const coklu: IkinciMenu = { ...MENU, gruplar: [{ maddeler: [
      { anahtar: 'ana', baslik: 'Ana', yol: '/ornek', simge: 'list', islem: 'sayfa.ornek' },
      { anahtar: 'kalite', baslik: 'Kalite', yol: '/ornek/kalite', simge: 'target', islem: 'ornek.kalite', veya: ['ornek.yonet', 'ornek.denetci'] },
    ] }] };
    expect(anahtarlar(ikinciMenuyuSuz(coklu, ['sayfa.ornek', 'ornek.denetci']))).toEqual(['ana', 'kalite']);
    expect(anahtarlar(ikinciMenuyuSuz(coklu, ['sayfa.ornek', 'ornek.kalite']))).toEqual(['ana', 'kalite']);
    expect(anahtarlar(ikinciMenuyuSuz(coklu, ['sayfa.ornek', 'ornek.is']))).toEqual(['ana']);
  });

  it('hiç maddesi kalmayan menü yoktur', () => {
    expect(ikinciMenuyuSuz(MENU, ['baska.islem'])).toBeNull();
    expect(ikinciMenuyuSuz(MENU, [])).toBeNull();
  });

  it('menü yalnız kendi sayfasında açılır', () => {
    expect(anahtarlar(acikIkinciMenu([MENU], '/ornek', HEPSI))).toEqual(['ana', 'is', 'tur', 'ayar']);
    expect(acikIkinciMenu([MENU], '/baska', HEPSI)).toBeNull();
    expect(acikIkinciMenu([MENU], null, HEPSI)).toBeNull();
    expect(acikIkinciMenu([MENU], '/ornek', [])).toBeNull();
  });
});

describe('etkin madde', () => {
  const maddeler = menuMaddeleri(MENU);
  const etkin = (adres: string) => etkinMadde(maddeler, adres)?.anahtar ?? null;

  it('adresi kapsayan en uzun yol seçilir', () => {
    expect(etkin('/ornek')).toBe('ana');
    expect(etkin('/ornek/is')).toBe('is');
    expect(etkin('/ornek/is/12/ayrinti')).toBe('is');
    expect(etkin('/ornek/tur')).toBe('tur');
  });

  it('başka maddeye düşmeyen alt adreste kök yoldaki madde etkindir; benzer önek kapsamaz', () => {
    expect(etkin('/ornek/bilinmeyen')).toBe('ana');
    expect(etkin('/ornek/isler')).toBe('ana');
    expect(etkin('/ornekler')).toBeNull();
    expect(etkin('/baska')).toBeNull();
  });

  it('sonuç maddelerin sırasına bağlı değildir', () => {
    expect(etkinMadde([...maddeler].reverse(), '/ornek/is')?.anahtar).toBe('is');
  });
});

// Menüde olup rotası olmayan madde tıklanınca "sayfa bulunamadı" açardı.
const rotasizMaddeler = (menuler: readonly IkinciMenu[], rotalar: readonly { yol: string }[]): string[] =>
  menuler.flatMap((menu) => menuMaddeleri(menu)).map((m) => m.yol).filter((yol) => !rotalar.some((r) => matchPath(r.yol, yol) !== null));

describe('bildirilen ikinci menüler', () => {
  it('her madde yolunun modül rotalarında karşılığı vardır', () => {
    expect(rotasizMaddeler(IKINCI_MENU_TANIMLARI, modulRotalari)).toEqual([]);
    // Denetimin kendisi: parametreli rota maddeyi karşılar, üst yolun rotası alt yolu karşılamaz.
    expect(rotasizMaddeler([MENU], [{ yol: '/ornek' }, { yol: '/ornek/:gorunum' }])).toEqual([]);
    expect(rotasizMaddeler([MENU], [{ yol: '/ornek' }, { yol: '/ornek/is' }, { yol: '/ornek/tur/:id' }])).toEqual(['/ornek/tur', '/ornek/ayar']);
    expect(rotasizMaddeler([MENU], [])).toEqual(['/ornek', '/ornek/is', '/ornek/tur', '/ornek/ayar']);
  });

  const baglam = { sayfaYollari: SAYFA_YOLLARI, islemMi, simgeMi: (ad: string) => ad in SIMGELER };

  it('modüllerin bildirdiği her menü geçerlidir: simgeler ortak sette, işlemler kayıtlı', () => {
    expect(ikinciMenulerinHatalari(IKINCI_MENU_TANIMLARI, baglam)).toEqual([]);
  });

  it('ortak sette olmayan simge burada yakalanır', () => {
    const madde = { anahtar: 'a', baslik: 'A', yol: '/stok', islem: 'sayfa.stok' } as const;
    const menu = (simge: string) => ({ kok: '/stok', baslik: 'Deneme', simge: 'cube', gruplar: [{ maddeler: [{ ...madde, simge }] }] } as const);
    expect(ikinciMenulerinHatalari([menu('olmayan-simge')], baglam)).toEqual(['/stok: madde simgesi geçersiz: "olmayan-simge" (/stok)']);
    expect(ikinciMenulerinHatalari([menu('box')], baglam)).toEqual([]);
  });
});
