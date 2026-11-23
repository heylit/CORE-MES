// Rota bağlantısının devir kuralı (3603): plan motoru (Kokpit taslağı, elle taşıma) ve sunucu (sıra denetimi, canlıya alma) aynı tanımı okur.
// Motor `vm` içinde düz betik olarak koştuğundan bu dosyayı ithal edemez; motor/engine.js `devirPartisi` işlevi bunun aynısıdır ve
// plan/devir-kurali.test.ts ikisini birlikte sınar. Burayı değiştiren motoru da değiştirir.

// Bağlantı türleri. Rota ekranı (Reçete ve Rota) ortulu, bagimli ya da bagimsiz der; iş emri ve sunucu akisli, bekleyen ya da bagimsiz;
// motor 'o' (ilk parti gelince başlar), 'b' (öncül bitince başlar) ya da hiç bağ kurmaz.
//   ortulu    = akisli   = 'o'   ardıl, öncülün ilk devir partisi gelince başlar ve öncülden önce bitemez
//   bagimli   = bekleyen = 'b'   ardıl, öncül bitince başlar
//   bagimsiz  = bagimsiz = bağ yok ardıl öncülü beklemez
export type RotaBagimliligi = 'ortulu' | 'bagimli' | 'bagimsiz';
export type EmirBagimliligi = 'akisli' | 'bekleyen' | 'bagimsiz';
export type MotorBagTuru = 'o' | 'b';

export const BAGIMLILIK_TABLOSU: readonly { rota: RotaBagimliligi; emir: EmirBagimliligi; motor: MotorBagTuru | null }[] = [
  { rota: 'ortulu', emir: 'akisli', motor: 'o' },
  { rota: 'bagimli', emir: 'bekleyen', motor: 'b' },
  { rota: 'bagimsiz', emir: 'bagimsiz', motor: null },
];

// Devir adedi ARDILIN bağındadır ("kaç adet çıkınca başlasın"): ardıl kendi öncüllerinden o kadar adet gelince başlar ve en son o kadar
// adetlik parti öncülün bitişinden sonra işler (son devir partisi). Öncülün ilk partisi bu yüzden ardılın devir adedidir; öncülün kendi
// bağındaki devir adedi öncülün ilk partisine karışmaz. Parti öncülün adedini (hurdası düşülmüş adım adedi) aşamaz.
// Boş (girilmemiş ya da sıfırdan küçük) devir adedi adedin dörtte biridir (motor ayarı transferOran); iş emrinde akışlı bağın devir adedi
// zorunludur (veritabanı kısıtı), boş değer yalnız motora giden eski ya da elle kurulmuş rotada görülür.
export const DEVIR_YEDEK_ORAN = 0.25;

export function devirPartisi(devirAdedi: number | null | undefined, adet: number, yedekOran: number = DEVIR_YEDEK_ORAN): number {
  if (!(adet > 0)) return 0;
  const istenen = devirAdedi !== null && devirAdedi !== undefined && Number.isFinite(devirAdedi) && devirAdedi > 0 ? devirAdedi : Math.ceil(adet * yedekOran);
  return Math.min(adet, Math.max(1, istenen));
}
