import { useMemo } from 'react';
import { useOturum } from '../../../../ortak/veri/oturum.ts';
import { useKabulIsleri, type KabulIsi } from '../../../stok/disari.ts';
import type { IstasyonAyari } from './kurallar.ts';
import type { OpType } from './tipler.ts';

// 3703: depo istasyonunda adımın modu "Mal kabul (giriş)" ise terminal sayaçla kabul ekranıdır: Kabul +1 ya da Toplu giriş sayar, Bitir
// "Kabulü yaz" penceresini açar. Fasonda Stok'a tek karantina kaydı yazılır, ara stokta kayıt yazılmaz (yalnız sayılır). Bu dosya saf kuralları taşır.
export const kabulAdimiMi = (opT: OpType, ayar: Pick<IstasyonAyari, 'mode'>): boolean => opT === 'depo' && ayar.mode === 'receive';

export type KabulDurumu = 'sifir' | 'yarim' | 'tam';
export interface KabulHesabi {
  // Bu yazımda Stok'a girecek adet (sayılan eksi daha önce yazılan).
  yazilacak: number;
  // Bu yazımdan sonra hedefe kalan adet.
  kalan: number;
  // sifir: yazılacak adet yok; yarim: iş açık kalır; tam: iş bitebilir.
  durum: KabulDurumu;
}
// Eksik adette iş açık kalır (kullanıcı kararı, 3703): yazılan adet işin kaydında (sr.kabulYazilan) birikir, sayaç sıfırlanmaz.
export function kabulHesabi(sayilan: number, yazilan: number, hedef: number): KabulHesabi {
  const yazilacak = Math.max(0, sayilan - yazilan);
  const kalan = Math.max(0, hedef - yazilan - yazilacak);
  return { yazilacak, kalan, durum: yazilacak === 0 ? 'sifir' : kalan === 0 ? 'tam' : 'yarim' };
}

// Kabul +1 hedefte durur ve nedeni yazar; hedef bilinmiyorsa (0) sayma kapanmaz.
export const kabulArtiNedeni = (sayilan: number, hedef: number): string | null =>
  hedef > 0 && sayilan >= hedef ? `Hedef ${String(hedef)} adet; fazlası kabul edilmez.` : null;

export type KabulTuru = 'fason' | 'ara';
// Adımın kaydı: aynı emrin açık fason dönüş satırı varsa fason dönüşüdür (Stok'a karantina kaydı yazılır); yoksa ara stoktur ve Stok'a kayıt yazılmaz,
// adım yalnız sayılır (kullanıcı kararı 25.11). Ara stok Stok'a hiç yazılmadığı için aynı parça iki kez girmez.
export function kabulTuruBul(isler: readonly KabulIsi[], emirNo: string): { tur: KabulTuru; fason: KabulIsi | null } {
  const fason = isler.find((k) => k.tur === 'fason' && k.satir.emirNo === emirNo) ?? null;
  return { tur: fason ? 'fason' : 'ara', fason };
}

export interface KabulKaynagi { tur: KabulTuru | null; fason: KabulIsi | null; yukleniyor: boolean; hata: string | null }
// fasonDonusu: paketin `tmi.fasonDonusu` alanı (sunucu yazar: emrin bitmemiş fason adımı var mı). false ise ara stoktur ve Stok okuması gerekmez;
// true ise fasondur ve Stok'un dönüş satırı (stok.giris yetkisi) gerekir; alan yoksa (eski paket) tür Stok'un satırından bilinir.
export function useKabulTuru(emirNo: string, fasonDonusu?: boolean): KabulKaynagi {
  const v = useKabulIsleri();
  // Oturum gelmeden yetki bilinmez: bu sürede "yetki yok" denmez.
  const oturumBekliyor = useOturum().isPending;
  return useMemo(() => {
    if (fasonDonusu === false) return { tur: 'ara' as const, fason: null, yukleniyor: false, hata: null };
    if (v.isler === null) return { tur: null, fason: null, yukleniyor: oturumBekliyor || v.yukleniyor, hata: v.hata };
    const t = kabulTuruBul(v.isler, emirNo);
    return { ...t, tur: fasonDonusu === true ? 'fason' as const : t.tur, yukleniyor: false, hata: null };
  }, [oturumBekliyor, fasonDonusu, v.isler, v.yukleniyor, v.hata, emirNo]);
}

export const kabulGirisYeri = (tur: KabulTuru): string => (tur === 'fason' ? 'Karantina (karar bekliyor)' : 'Stok\'a yazılmaz; yalnız sayılır');
export const kabulArdindan = (tur: KabulTuru): string => (tur === 'fason' ? 'GKK kuyruğu' : 'Sıradaki adım sırada');
