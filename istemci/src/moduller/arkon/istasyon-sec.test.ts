import { describe, expect, it } from 'vitest';
import { ilkAcilis, istasyonSec, secilebilirIstasyonlar } from '../../../../arkon/web/src/data/istasyon-sec.ts';
import { oturumKisisi } from '../../../../arkon/web/src/data/oturum-kisisi.ts';
import { arkonKisisi } from './baglanti.ts';

// Demo bulgusu: operatör ekranı ilk açılışta listedeki ilk istasyonla açılıyordu; kişinin TMI istasyonu öne alınır.
describe('operatör ekranının istasyonu', () => {
  const L = ['DT1', 'DF1'];
  it('cihazda seçilmiş istasyon önce gelir', () => expect(istasyonSec('DF1', 'DT1', L)).toBe('DF1'));
  it('seçim yoksa kişinin CORE istasyonu, ilk istasyon değil', () => expect(istasyonSec(null, 'DF1', L)).toBe('DF1'));
  it('listede olmayan seçim ve atama atlanır; hiçbiri yoksa ilk istasyon', () => {
    expect(istasyonSec('ESKI', 'DF1', L)).toBe('DF1');
    expect(istasyonSec(null, 'PASIF', L)).toBe('DT1');
    expect(istasyonSec(null, null, L)).toBe('DT1');
    expect(istasyonSec('X', null, [])).toBe('X');
  });
  // Uçtan uca deneme Y1: ataması olmayan operatörün terminali yetkisi olmayan ilk istasyonla açılıyordu.
  it('atama yoksa listede ilk yetkili istasyon; yetkili de yoksa ilk istasyon', () => {
    expect(istasyonSec(null, null, L, ['DF1'])).toBe('DF1');
    expect(istasyonSec(null, null, L, ['PASIF'])).toBe('DT1');
    expect(istasyonSec(null, 'DT1', L, ['DF1'])).toBe('DT1');
  });
  it('açılışta oturum kişisi tazelenirken yetkili istasyonlar korunur', () => {
    const me = { id: '7', name: 'A', role: 'operator' as const, wcs: ['M1'], st: null, sts: ['DF1'], active: true };
    expect(oturumKisisi(me)).toEqual({ id: '7', name: 'A', role: 'operator', wcs: ['M1'], st: null, sts: ['DF1'], mks: null });
    expect(oturumKisisi({ id: '7', name: 'A', role: 'operator' })).toEqual({ id: '7', name: 'A', role: 'operator', wcs: [], st: null, sts: [], mks: null });
    expect(oturumKisisi({ id: '7', name: 'A', role: 'operator', mks: ['TZG-04'] }).mks).toEqual(['TZG-04']);
  });
  it('köprü kişinin istasyonunu Arkon kullanıcısına taşır', () => {
    expect(arkonKisisi({ kimlik: '7', ad: 'A', rol: 'operator', isMerkezleri: [], istasyon: 'DF1', aktif: true }).st).toBe('DF1');
  });
  it('köprü kişinin yetkili istasyonlarını taşır; alan yoksa boş liste', () => {
    expect(arkonKisisi({ kimlik: '7', ad: 'A', rol: 'operator', isMerkezleri: [], istasyon: 'DF1', istasyonlar: ['DF1', 'DT1'], aktif: true }).sts).toEqual(['DF1', 'DT1']);
    expect(arkonKisisi({ kimlik: '7', ad: 'A', rol: 'operator', isMerkezleri: [], istasyon: null, aktif: true }).sts).toEqual([]);
  });
  it('2046 a: köprü çalışabildiği makineleri taşır; alan yoksa taşınmaz (süzgeç yok), boş liste hiç makine demektir', () => {
    expect(arkonKisisi({ kimlik: '7', ad: 'A', rol: 'operator', isMerkezleri: [], istasyon: null, makineler: ['TZG-04'], aktif: true }).mks).toEqual(['TZG-04']);
    expect(arkonKisisi({ kimlik: '7', ad: 'A', rol: 'operator', isMerkezleri: [], istasyon: null, makineler: [], aktif: true }).mks).toEqual([]);
    expect(arkonKisisi({ kimlik: '7', ad: 'A', rol: 'operator', isMerkezleri: [], istasyon: null, aktif: true }).mks).toBeUndefined();
  });
});

// Kullanıcı onayı: istasyon değiştirme yetkisi olmayan operatör yalnız kendi yetkili istasyonları arasında geçer.
describe('istasyon seçicideki liste', () => {
  const L = [{ id: 'DT1' }, { id: 'DF1' }, { id: 'KL1' }];
  it('prod.station yetkisi olan bütün istasyonları görür', () => expect(secilebilirIstasyonlar(L, true, []).map((x) => x.id)).toEqual(['DT1', 'DF1', 'KL1']));
  it('yetkisi olmayan yalnız yetkili istasyonlarını görür; yetkili istasyonu yoksa hiçbirini', () => {
    expect(secilebilirIstasyonlar(L, false, ['KL1', 'DT1']).map((x) => x.id)).toEqual(['DT1', 'KL1']);
    expect(secilebilirIstasyonlar(L, false, undefined)).toEqual([]);
  });
});

// Denetim bulgusu: TMI istasyonuyla açılan ekran istasyonu cihaza yazmazsa üretim kaydı (isStationTablet) düşer.
describe('operatör ekranının ilk açılışı', () => {
  it('kişinin CORE istasyonuyla açıldıysa istasyon cihaza yazılır, sorulmaz', () => expect(ilkAcilis(null, 'DF1', 'DF1', true)).toBe('kaydet'));
  it('atama yoksa ya da açılan istasyon atanan değilse sorulur', () => {
    expect(ilkAcilis(null, null, 'DT1', true)).toBe('sor');
    expect(ilkAcilis(null, 'PASIF', 'DT1', true)).toBe('sor');
  });
  it('cihazda istasyon varsa ya da kişi üretim kaydı yapamıyorsa bir şey yapılmaz', () => {
    expect(ilkAcilis('DT1', 'DF1', 'DT1', true)).toBe(null);
    expect(ilkAcilis(null, 'DF1', 'DF1', false)).toBe(null);
  });
});
