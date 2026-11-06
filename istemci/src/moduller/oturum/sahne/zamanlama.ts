// Giriş sahnesinin zaman ve yük kuralları (karar 2148-1): patlamaya kadar akıcı (her kare), sonra dönen O saniyede 30 kare;
// O 20 saniye döner ve durur, fare, dokunma ya da tuşla 20 saniye daha döner; zayıf cihazda parçacık yarıya iner.

export const PATLAMA = 3.0;
export const BITIS = 6.6;
// Patlama dalgası ve harflerin gelişi bitince hareket yalnız yavaş dönüştür.
export const YAVAS_BASI = PATLAMA + 2.4;
export const DONME_SURESI = 20;
export const ILK_DURMA = PATLAMA + DONME_SURESI;
// Hareket azaltma tercihinde gösterilen tek kare: harfler yerinde, yıldızlar halkada.
export const SABIT_KARE = PATLAMA + 8;

const YAVAS_ARALIK_MS = 1000 / 30;
// Tarayıcı kareleri ekran tazelemesine göre verir; 60 Hz ekranda 33,3 ms'lik aralık ikinci kareye 1 ms erken düşebilir.
const PAY_MS = 2;

// Bu kare çizilmeli mi: son çizimden bu yana geçen süreye ve sahne zamanına göre.
export function cizilmeli(t: number, gecenMs: number): boolean {
  return t < YAVAS_BASI || gecenMs + PAY_MS >= YAVAS_ARALIK_MS;
}

export const durmayiUzat = (durma: number, t: number): number => Math.max(durma, t + DONME_SURESI);

// Kalite ölçümü: ilk kareler (çizim programlarının derlenmesi) atlanır, ardından gelen kare sürelerinin ortancasına bakılır;
// tek bir uzun kare kararı bozmaz. Saniyede 40 kareden yavaşsa parçacık yarıya iner.
export const OLCUM_ATLA = 6;
export const OLCUM_KARE = 30;
const YAVAS_KARE_MS = 1000 / 40;
export function kaliteDusmeli(sureler: readonly number[]): boolean | null {
  if (sureler.length < OLCUM_KARE) return null;
  const s = [...sureler].sort((a, b) => a - b);
  return (s[Math.floor(s.length / 2)] ?? 0) > YAVAS_KARE_MS;
}

// Yarı kalitede çizilen parçacıklar tampona önde yazılır: çift sıralar ilk yarıda, tekler ikinci yarıda. Çizim aralığı ilk
// yarıya kısılınca her gruptan eşit pay kalır.
export const tamponSirasi = (i: number, n: number): number => (i % 2 === 0 ? i / 2 : Math.ceil(n / 2) + (i - 1) / 2);
