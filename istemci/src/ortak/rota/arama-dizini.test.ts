import { describe, expect, it } from 'vitest';
import { SAYFALAR } from '#paylasilan/sayfalar.ts';
import type { IkinciMenu } from './ikinci-menu.ts';
import { ara, aramaDizini, sadelestir } from './arama-dizini.ts';

const MENU: IkinciMenu = {
  kok: '/stok',
  baslik: 'Stok Merkezi',
  simge: 'box',
  gruplar: [
    { maddeler: [
      { anahtar: 'is', baslik: 'İş kutusu', yol: '/stok', simge: 'dash', islem: 'ornek.oku' },
      { anahtar: 'cek', baslik: 'Çek ve senet', yol: '/stok/cek', simge: 'layers', islem: 'ornek.oku' },
    ] },
    { baslik: 'Sistem', maddeler: [{ anahtar: 'ayar', baslik: 'Ayarlar', yol: '/stok/ayar', simge: 'gear', islem: 'ornek.yonet' }] },
  ],
};
const STOK = SAYFALAR.filter((s) => s.yol === '/stok' || s.yol === '/recete-rota');
const yollar = (sonuc: { yol: string }[]) => sonuc.map((s) => s.yol);

describe('aramaDizini', () => {
  it('görülen sayfalar ve yetkisi yeten maddeler dizine girer; kök maddesi sayfanın kendisidir, adı sayfaya yazılır', () => {
    const dizin = aramaDizini(STOK, [MENU], ['ornek.oku']);
    expect(yollar(dizin).sort()).toEqual(['/recete-rota', '/stok', '/stok/cek']);
    expect(dizin.find((d) => d.yol === '/stok/cek')).toMatchObject({ ust: 'Stok Merkezi', grup: null, baslik: 'Çek ve senet' });
    expect(dizin.find((d) => d.yol === '/stok')).toMatchObject({ baslik: 'Stok Merkezi', kokAdi: 'İş kutusu' });
  });

  it('reddedilen: işlemi olmayan madde ve kişinin görmediği sayfanın maddeleri dizine girmez', () => {
    expect(yollar(aramaDizini(STOK, [MENU], ['ornek.oku']))).not.toContain('/stok/ayar');
    const rotasiz = SAYFALAR.filter((s) => s.yol === '/recete-rota');
    expect(yollar(aramaDizini(rotasiz, [MENU], ['ornek.oku', 'ornek.yonet']))).toEqual(['/recete-rota']);
  });

  it('reddedilen: menüde gizli (bekletilen) sayfa dizinde yoktur', () => {
    const gizli = STOK.map((s) => (s.yol === '/recete-rota' ? { ...s, menudeGizli: true as const } : s));
    expect(yollar(aramaDizini(gizli, [], []))).toEqual(['/stok']);
  });
});

describe('ara', () => {
  const dizin = aramaDizini(STOK, [MENU], ['ornek.oku', 'ornek.yonet']);

  it('Türkçe harf ve büyük-küçük farkı yok sayılır', () => {
    expect(sadelestir('  Çek  ve ŞENET ')).toBe('cek ve senet');
    expect(sadelestir('İŞ')).toBe('is');
    expect(yollar(ara(dizin, 'cek'))).toEqual(['/stok/cek']);
    expect(yollar(ara(dizin, 'IS KUTU'))).toEqual(['/stok']);
  });

  it('her sözcük ad ya da sayfa adında geçmeli; sayfa adıyla maddeleri de bulunur, sayfanın kendisi önce gelir', () => {
    expect(yollar(ara(dizin, 'stok'))).toEqual(['/stok', '/stok/cek', '/stok/ayar']);
    expect(yollar(ara(dizin, 'stok ayar'))).toEqual(['/stok/ayar']);
  });

  it('reddedilen: boş sorgu ve eşleşmeyen sözcük sonuç vermez', () => {
    expect(ara(dizin, '   ')).toEqual([]);
    expect(ara(dizin, 'cek fatura')).toEqual([]);
  });
});
