// Belgeyi gösteren modül (malzemeler, istasyonlar, atölye, Arkon, kalibrasyon) bağı kendi yazma ucundan kurar ve kaldırır,
// dosyayı kendi okuma ucundan verir: okuma yetkisi ve veri kapsamı bağlayan modülündür. Merkez o modülleri ithal etmez.
export type { BagliBelge, KayitBelgesiTuru, YayindakiBelge, YayindakiBelgeDosyasi, YayindakiOnizleme } from './servis.ts';
export {
  alinanRevizyonDosyasi, belgeAcVeBagla, kaydaBagla, kaydaBagliBelgeler, kayitlaraBagliBelgeler, kayittakiBelgeDosyasi, kayittanKaldir, yayindakiBelgeDosyasi, yayindakiBelgeler,
  yayindakiOnizleme, yayindakiOnizlemeKaresi,
} from './servis.ts';
// Liste ekranları (ör. üretim emirleri) satıra küçük resim koymak için: kayıt başına seçilmiş revizyon, tek sorguda (kart #688).
// Kare dosyası herkese açık ortak uçtan okunur (`GET /cizimler/kucuk-resim/:revizyonId/:kare`); yetki denetlemez.
export { kayitlarinKucukResimleri } from './servis.ts';
