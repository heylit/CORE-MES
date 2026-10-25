import type { ComponentType } from 'react';
import { islemMi, type Islem } from '#paylasilan/islemler.ts';
import { maddeGorunurMu } from '#paylasilan/sayfalar.ts';
import { SIMGELER, type SimgeAdi } from '../tasarim/simgeler.ts';

// Bütün sayfaların üst çubuğundaki modül düğmesi (istemci/src/moduller/<ad>/ust-eylem.tsx).
// Kabuk yalnız yeri, sırayı ve görünürlüğü verir; düğme, sayacı ve açtığı pencere modülündür. Yazma yetkisi modülün ucundadır.
export interface UstEylem {
  // Üst çubukta tekil; küçük harf, rakam, tire.
  anahtar: string;
  // Küçük önce gelir; eşitte anahtar sırası.
  sira: number;
  // 'oturum': giriş yapmış herkes görür (kişinin kendisiyle ilgili düğme; yazma yetkisi yine modülün ucundadır).
  islem: Islem | 'oturum';
  // 'sol': çubuğun en solunda, gezinme düğmelerinden önce (her sayfada aynı yerde aranan tuş, örneğin QR okut).
  // 'hesap': çubukta hiç yer tutmaz, yalnız Hesap menüsünde durur (seyrek kullanılan, kişinin kendi işi; soru 516 a).
  // Verilmezse sağda.
  yer?: 'sol' | 'hesap';
  // Verilirse düğme 768-1279 arasında çubukta yer tutmaz (başlık sığsın), Hesap menüsünde bu adla durur; seçilince
  // düğmenin acmaIstegi artar, düğme kendi penceresini açar. 'hesap' yerindeki eylemde zorunludur.
  hesapMaddesi?: { baslik: string; simge: SimgeAdi };
  dugme: ComponentType<UstEylemOzellikleri>;
  // Hesap düğmesinin köşesinde çizilir: dikkat isteyen durum varsa işaret, yoksa hiçbir şey (null). Menüye taşınan
  // eylemin uyarısı kaybolmasın diye (sistem uyarısı).
  isaret?: ComponentType;
}

export interface UstEylemOzellikleri {
  // Hesap menüsünden her seçilişte bir artar; verilmezse ya da 0 ise istek yok.
  acmaIstegi?: number;
}

const ANAHTAR_BICIMI = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// dosyalar: glob çıktısı (dosya yolu -> modül). Hata açılışta, dosyayı söyleyerek: yanlış bildirilen düğme sessizce düşmesin.
export function ustEylemleriTopla(dosyalar: Record<string, unknown>): UstEylem[] {
  const sahip = new Map<string, string>();
  const toplam: UstEylem[] = [];
  for (const dosya of Object.keys(dosyalar).sort()) {
    const { ustEylemler } = dosyalar[dosya] as { ustEylemler?: unknown };
    if (!Array.isArray(ustEylemler)) throw new Error(`Modül üst eylem dizisi vermiyor (export const ustEylemler): ${dosya}`);
    for (const e of ustEylemler as UstEylem[]) {
      if (!ANAHTAR_BICIMI.test(e.anahtar)) throw new Error(`Üst eylem anahtarı biçime uymuyor: "${e.anahtar}" (${dosya})`);
      if (!Number.isFinite(e.sira)) throw new Error(`Üst eylem sırası sayı değil: ${e.anahtar} (${dosya})`);
      if (e.islem !== 'oturum' && !islemMi(e.islem)) throw new Error(`Üst eylemin işlemi kayıtlı değil: ${String(e.islem)} (${e.anahtar}, ${dosya})`);
      if (e.yer !== undefined && e.yer !== 'sol' && e.yer !== 'hesap') throw new Error(`Üst eylemin yeri bilinmiyor: ${String(e.yer)} (${e.anahtar}, ${dosya})`);
      if (e.yer === 'hesap' && e.hesapMaddesi === undefined) throw new Error(`Hesap menüsündeki üst eylemin maddesi yok: ${e.anahtar} (${dosya})`);
      if (e.hesapMaddesi !== undefined && (e.hesapMaddesi.baslik.trim() === '' || !(e.hesapMaddesi.simge in SIMGELER))) {
        throw new Error(`Üst eylemin Hesap menüsü maddesi eksik ya da simgesi bilinmiyor: ${e.anahtar} (${dosya})`);
      }
      if (typeof e.dugme !== 'function' && (typeof e.dugme !== 'object' || e.dugme === null)) {
        throw new Error(`Üst eylemin bileşeni yok: ${e.anahtar} (${dosya})`);
      }
      if (e.isaret !== undefined && typeof e.isaret !== 'function' && (typeof e.isaret !== 'object' || e.isaret === null)) {
        throw new Error(`Üst eylemin işareti bileşen değil: ${e.anahtar} (${dosya})`);
      }
      const onceki = sahip.get(e.anahtar);
      if (onceki !== undefined) throw new Error(`Aynı anahtarla iki üst eylem verildi: ${e.anahtar} (${onceki}, ${dosya})`);
      sahip.set(e.anahtar, dosya);
      toplam.push(e);
    }
  }
  return toplam;
}

export function gorunenUstEylemler(eylemler: readonly UstEylem[], islemler: readonly string[]): UstEylem[] {
  return eylemler
    .filter((e) => e.islem === 'oturum' || maddeGorunurMu({ islem: e.islem }, islemler))
    .sort((a, b) => a.sira - b.sira || a.anahtar.localeCompare(b.anahtar));
}

export const ustEylemler: readonly UstEylem[] = ustEylemleriTopla(
  import.meta.glob('../../moduller/*/ust-eylem.tsx', { eager: true }),
);
