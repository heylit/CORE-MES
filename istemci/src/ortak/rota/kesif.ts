import type { ComponentType } from 'react';
import type { Sayfa } from '#paylasilan/sayfalar.ts';
import { acikModulDosyalari } from '#paylasilan/sayfalar.ts';
import { rotaninSayfasi } from './sayfa.ts';

export interface ModulRotasi {
  yol: string;
  ekran: ComponentType;
  // Ağır ekran (çerçeve gibi) başka sayfaya geçince silinmez, gizlenir; dönüşte yeniden yüklenmez (kalici.tsx).
  kalici?: boolean;
  // Kalıcı ekranın ağır parçasını (prototip belgesi gibi) önceden indirir; kabuk, sayfayı görebilen kişide boşta bir kez
  // çağırır. Ekranı kurmaz: açılışta aynı yükleme önbellekten döner.
  onYukle?: () => Promise<unknown>;
}

export interface RotaPlani {
  ekranlar: ModulRotasi[];
  yerTutucular: Sayfa[];
}

// Görünürlük yol önekine bakar; biçim serbest kalırsa '/Stok' ya da 'stok' sayfasına bağlanmadan açılırdı.
// İlk parça parametre olamaz: '/:x' her sayfanın adresini yakalar, sayfayı göremeyene de açılırdı.
const YOL_BICIMI = /^\/$|^\/[a-z0-9-]+(?:\/(?:[a-z0-9-]+|:[A-Za-z0-9_]+))*$/;

// Parametre adı adresi değiştirmez: '/a/:id' ile '/a/:no' aynı adrese düşer.
const cakismaAnahtari = (yol: string): string => yol.replace(/:[^/]+/g, ':');

// dosyalar: glob çıktısı (dosya yolu -> modül). Çakışma sessizce çözülmez: hangi ekranın açılacağı
// dosya sırasına kalırdı.
export function rotalariTopla(dosyalar: Record<string, unknown>): ModulRotasi[] {
  const sahip = new Map<string, string>();
  const toplam: ModulRotasi[] = [];
  for (const dosya of Object.keys(dosyalar).sort()) {
    const { rotalar } = dosyalar[dosya] as { rotalar?: unknown };
    if (!Array.isArray(rotalar)) throw new Error(`Modül rota dizisi vermiyor (export const rotalar): ${dosya}`);
    for (const rota of rotalar as ModulRotasi[]) {
      // Ana sayfa kabuğundur: modül oraya ekran değil kart verir (ana-sayfa.tsx).
      if (rota.yol === '/') throw new Error(`Ana sayfa kabuğundur; modül kartını ana-sayfa.tsx ile bildirir (${dosya})`);
      if (!YOL_BICIMI.test(rota.yol)) throw new Error(`Rota yolu biçime uymuyor: "${rota.yol}" (${dosya})`);
      const anahtar = cakismaAnahtari(rota.yol);
      const onceki = sahip.get(anahtar);
      if (onceki !== undefined) throw new Error(`Aynı yola iki rota verildi: ${rota.yol} (${onceki}, ${dosya})`);
      sahip.set(anahtar, dosya);
      toplam.push(rota);
    }
  }
  return toplam;
}

// Yetki kararı sunucudadır; burada yalnız kullanıcının göremediği sayfanın rotası kurulmaz.
// Hiçbir sayfaya ait olmayan yol oturumu olan herkese açıktır.
export function rotaPlani(rotalar: readonly ModulRotasi[], gorunur: readonly Sayfa[]): RotaPlani {
  const gorunurYollar = new Set<string>(gorunur.map((s) => s.yol));
  const ekranlar = rotalar.filter((r) => {
    const sayfa = rotaninSayfasi(r.yol);
    return sayfa === null || gorunurYollar.has(sayfa);
  });
  const verilen = new Set(ekranlar.map((r) => r.yol));
  return { ekranlar, yerTutucular: gorunur.filter((s) => !verilen.has(s.yol)) };
}

export const modulRotalari: readonly ModulRotasi[] = rotalariTopla(
  acikModulDosyalari(import.meta.glob('../../moduller/*/rotalar.tsx', { eager: true })),
);
