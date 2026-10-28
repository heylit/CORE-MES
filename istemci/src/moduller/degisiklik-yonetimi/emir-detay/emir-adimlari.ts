import type { EmirCevabi, KararSatiri } from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';
import {
  mrbKarariMi, type Cevap, type EmirDurumu, type GecmisOlayi, type KapanisKosulu, type KararKodu,
} from '#paylasilan/sozlesme/degisiklik-yonetimi-sabitleri.ts';

// ECO detayının ekran kuralları (prototipin pEco ve ecoDefaultTab'ı). İş kuralı sunucudadır; burada yalnız gösterim.

export const SEKMELER = ['rev', 'karar', 'fai', 'kayit'] as const;
export type EmirSekmesi = (typeof SEKMELER)[number];

export const ASAMALAR = ['Açıldı', 'Revizyon hazırlığı', 'Yayın onayı', 'Disposition', 'Uygulama ve FAI', 'Doğrulama', 'Kapandı'] as const;

// Kapandı aşamasının kendisi de biter: sıra aşama sayısını geçer, hepsi yeşil görünür.
const ASAMA_SIRASI: Readonly<Record<EmirDurumu, number>> = {
  acik: 0, revizyon_hazirlaniyor: 1, yayina_hazir: 2, karar: 3, uygulamada: 4, dogrulama: 5, kapandi: ASAMALAR.length,
};
export const asamaSirasi = (durum: EmirDurumu): number => ASAMA_SIRASI[durum];

// Aşamanın altındaki "kim, ne zaman" satırı: o aşamayı bitiren son olay.
const ASAMA_OLAYLARI: readonly (readonly GecmisOlayi[])[] = [
  ['emir_acildi'], ['yayina_gonderildi'], ['yayinlandi'], ['kararlar_tamam'], ['fai_tamam'], ['kapandi'], ['kapandi'],
];
export function asamaBilgileri(emir: Pick<EmirCevabi, 'gecmis'>, tarih: (zaman: string) => string): (string | null)[] {
  return ASAMA_OLAYLARI.map((olaylar) => {
    const son = emir.gecmis.filter((g) => olaylar.includes(g.olay)).sort((a, b) => b.zaman.localeCompare(a.zaman))[0];
    return son ? `${son.kisiAdi ?? 'Bilinmeyen kişi'}, ${tarih(son.zaman)}` : null;
  });
}

export function varsayilanSekme(durum: EmirDurumu): EmirSekmesi {
  if (durum === 'karar') return 'karar';
  if (durum === 'uygulamada' || durum === 'dogrulama') return 'fai';
  return 'rev';
}
export const sekmeMi = (deger: string | null): deger is EmirSekmesi => (SEKMELER as readonly string[]).includes(deger ?? '');

// Yayından önce geçerlilik ve kararlar belirlenmemiştir.
export const yayinOncesi = (durum: EmirDurumu): boolean => durum === 'acik' || durum === 'revizyon_hazirlaniyor' || durum === 'yayina_hazir';

export const bekleyenKararlar = (kararlar: readonly KararSatiri[]) => kararlar.filter((k) => k.verilenKod === null);

// Kararı hangi uç verir: MRB kararı mrb-karar ile, öbürü karar ile (S0 mrbKarariMi, istemci ve sunucu aynı kural).
export const kararUcu = (k: Pick<KararSatiri, 'mod'>, kod: KararKodu): 'karar' | 'mrb-karar' => (mrbKarariMi(k.mod, kod) ? 'mrb-karar' : 'karar');

// Toplu onayın kapsamı (P1 ucu): MRB olmayan, ertelemesiz, sapmasız ve izinli öneriler.
export function topluOnaylanabilir(kararlar: readonly KararSatiri[]): KararSatiri[] {
  return bekleyenKararlar(kararlar).filter((k) => !mrbKarariMi(k.mod, k.onerilenKod)
    && k.onerilenKod !== 'beklet' && k.onerilenKod !== 'eskiyle_tamamla_sapma' && k.izinliKodlar.includes(k.onerilenKod));
}

// Kapatma düğmesi: eksik koşul varsa kapalı. Sahibi bağlı olmayan koşul ('bilinmiyor', Aşama 1) düğmeyi kapatmaz; karar sunucunundur.
export const kapatilabilir = (emir: Pick<EmirCevabi, 'kapanisKosullari'>): boolean => emir.kapanisKosullari.every((k) => k.durum !== 'eksik');

export function kosulMetni(kosul: KapanisKosulu, emir: Pick<EmirCevabi, 'gecerlilik'>): string {
  switch (kosul) {
    case 'kararlar': return 'Tüm disposition kararları uygulandı';
    case 'fai': return 'İlk parça kontrolleri (FAI) onaylandı';
    case 'uyumsuz_seri': return 'Konfigürasyonu uyumsuz seri yok';
    case 'yeni_revizyonla_uretim':
      return emir.gecerlilik?.tur === 'seri'
        ? 'Geçerlilik başlangıcından itibaren en az bir seri yeni revizyonla tamamlandı'
        : 'Yeni rota ile en az bir operasyon tamamlandı';
  }
}

// Değiştirilebilirlik cevaplarından ekranda yeni parça numarası alanlarını açmak için önizleme. Kalem kaydedilince
// sunucunun hesabı (yeniParcaNoGerekir) geçerlidir; iki cevap da yoksa karar yoktur.
export function yeniParcaNoOnizleme(eskiYeniyeUyar: Cevap | null, yeniEskiyeUyar: Cevap | null): boolean | null {
  if (eskiYeniyeUyar === null || yeniEskiyeUyar === null) return null;
  return eskiYeniyeUyar === 'hayir' || yeniEskiyeUyar === 'hayir';
}

export function gecerlilikMetni(emir: Pick<EmirCevabi, 'gecerlilik'>, tarih: (gun: string) => string): string {
  const g = emir.gecerlilik;
  if (g === null) return 'Belirlenmedi';
  if (g.tur === 'seri') return `${g.sonUrun.kod ?? `Malzeme ${g.sonUrun.malzemeId}`}, ${g.ilkSeri} ve sonrası`;
  if (g.tur === 'tarih') return `${tarih(g.tarih)} ve sonrası başlayan emirler`;
  return 'Tüm açık emirler, karar tablosuna göre';
}

// Maliyet sahibi modülden gelir; bağlı değilse null, sıfır yazılmaz.
export function tutarMetni(tutar: string | null): string {
  if (tutar === null) return '—';
  const sayi = Number(tutar);
  return Number.isFinite(sayi) ? `${sayi.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} TL` : tutar;
}
