import { z } from 'zod';
import { tarihSemasi } from '../zaman.ts';

// Takvim (891 a, 1160 a): başka modüllerin tarihlerini tek yerde gösterir, yalnız okur (1161 a). Kaynak listesi 1162 b.
// Her kaynak kendi modülünün disari.ts `takvimKayitlari(db, baslangic, bitis)` işlevinden gelir; sahibi o modüldür.
export const TAKVIM_KAYNAKLARI = [
  'siparis', 'emir-plan', 'emir-bitis', 'sevk', 'satin-alma', 'kalibrasyon', 'denetim', 'izin', 'vergi', 'planli-durus',
] as const;
export const takvimKaynagiSemasi = z.enum(TAKVIM_KAYNAKLARI);
export type TakvimKaynagi = z.output<typeof takvimKaynagiSemasi>;

// Tek okumada en uzun aralık (gün): ay görünümü altı hafta gösterir, çeyrek yıl tabloya yeter.
export const AZAMI_TAKVIM_GUNU = 93;

const gunFarki = (a: string, b: string): number => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000;

// Aralık tesis günüyle verilir, iki uç dahil.
export const takvimSorgusu = z.object({ baslangic: tarihSemasi, bitis: tarihSemasi })
  .refine((s) => gunFarki(s.baslangic, s.bitis) >= 0, { message: 'Bitiş başlangıçtan önce olamaz.', path: ['bitis'] })
  .refine((s) => gunFarki(s.baslangic, s.bitis) < AZAMI_TAKVIM_GUNU, { message: `En çok ${AZAMI_TAKVIM_GUNU} gün okunur.`, path: ['bitis'] });
export type TakvimSorgusu = z.output<typeof takvimSorgusu>;

// kimlik kaynağın içinde tekildir ve kaynağın kendi ekranını açar (sipariş id'si, alet no ...). no ekranda gösterilen belge numarasıdır.
// bitti: kayıt kapanmıştır (sevk edildi, ödendi ...); geçmiş tarihli açık kayıt gecikmiş sayılır. Bilinmeyen alan null.
export const takvimKaydiSemasi = z.object({
  kaynak: takvimKaynagiSemasi,
  kimlik: z.string().min(1),
  tarih: tarihSemasi,
  no: z.string().nullable(),
  baslik: z.string().min(1),
  ilgili: z.string().nullable(),
  durum: z.string().min(1),
  bitti: z.boolean(),
});
export type TakvimKaydi = z.output<typeof takvimKaydiSemasi>;

export const takvimTatiliSemasi = z.object({ tarih: tarihSemasi, ad: z.string().nullable() });

// kaynaklar: bu kullanıcının okuyabildiği kaynaklar; okuyamadığı kaynak hiç gelmez (1163 a).
// bekleyenler: okuyabildiği ama henüz bağlanmamış kaynaklar (Aşama 1, UYUM-BORCU); ekranda "bağlanmadı" görünür, boş liste veri yok demek değildir.
export const takvimCevabi = z.object({
  kaynaklar: z.array(takvimKaynagiSemasi),
  bekleyenler: z.array(takvimKaynagiSemasi),
  kayitlar: z.array(takvimKaydiSemasi),
  tatiller: z.array(takvimTatiliSemasi),
});
export type TakvimCevabi = z.output<typeof takvimCevabi>;
