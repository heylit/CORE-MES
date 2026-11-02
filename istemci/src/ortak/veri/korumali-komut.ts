import { useRef } from 'react';
import { useMutation, type UseMutationOptions, type UseMutationResult } from '@tanstack/react-query';
import { type Deneme, tekrarKorumaliGonder, type TekrarSecenegi, yeniIstekKimligi, yenidenDenenebilirMi } from './istek-kimligi.ts';

type Secenek<G, C> = Omit<UseMutationOptions<C, Error, G>, 'mutationFn'>;

// Gönderim sürerken gelen ikinci çağrı düşer: düğmenin `disabled={isPending}` değeri ancak yeniden çizimde gelir, çift
// tıkın ikinci tıkı ondan önce düşer. Kilit eşzamanlıdır; `mutate` sessizce yok sayılır, `mutateAsync` süren gönderimin
// sözünü döner. Böylece ikinci istek ve ikinci "kaydedildi" bildirimi çıkmaz. Kilit, gönderim bitince (başarı ya da hata) kalkar.
export function useTekGonderim<G = void, C = unknown>(
  secenek: Secenek<G, C> & { mutationFn: (govde: G) => Promise<C> },
): UseMutationResult<C, Error, G> {
  const suren = useRef<Promise<C> | null>(null);
  const komut = useMutation<C, Error, G>(secenek);
  type Cagri = Parameters<UseMutationResult<C, Error, G>['mutateAsync']>[1];
  const mutateAsync = (govde: G, cagri?: Cagri): Promise<C> => {
    if (suren.current !== null) return suren.current;
    const soz = komut.mutateAsync(govde, cagri).finally(() => { suren.current = null; });
    suren.current = soz;
    return soz;
  };
  return {
    ...komut,
    mutateAsync,
    // `mutate` hata fırlatmaz; hata `onError` ve `error` ile görünür.
    mutate: (govde: G, cagri?: Cagri) => { mutateAsync(govde, cagri).catch(() => undefined); },
  } as UseMutationResult<C, Error, G>;
}

// Kancası değiştirilemeyen (çok ekranın paylaştığı) gönderimi ekranda kilitler: `kilitli(() => komut.mutateAsync(g))`.
// Süren iş bitene dek yeni çağrı düşer; hata `onError`dadır, burada yutulur.
export function useGonderimKilidi(): (is: () => Promise<unknown>) => void {
  const suruyor = useRef(false);
  return (is) => {
    if (suruyor.current) return;
    suruyor.current = true;
    is().catch(() => undefined).finally(() => { suruyor.current = false; });
  };
}

export interface KorumaliKomutSecenegi<G, C> extends Secenek<G, C> {
  // Gönderim; deneme isteğe yayılır: `api.post(yol, govde, deneme)`. Deneme yalnız `korumali` false dönen gövdede yoktur.
  gonder: (govde: G, deneme: Deneme | undefined) => Promise<C>;
  // Aynı kancadan hem korumalı hem korumasız uca gidiliyorsa (yeni kayıt korumalı, güncelleme sürümlü): false dönen gövde
  // kimliksiz ve tek denemeyle gider, kimlik değişmez. Verilmezse her gövde korumalıdır.
  korumali?: (govde: G) => boolean;
  // Yeniden deneme ayarı (`tekrarKorumaliGonder`); kimlik ve iptal bu kancanındır.
  tekrar?: Omit<TekrarSecenegi, 'istekKimligi' | 'sinyal'>;
}

// Formun ya da düğmenin tek kimliği: sonucu bilinmeyen hatadan (ağ, zaman aşımı, 5xx) sonraki her gönderim aynı kimlikle
// gider, komut sunucuda ikinci kez uygulanmaz. Başarıdan ve sunucunun reddinden (4xx) sonra kimlik yenilenir: sonraki
// gönderim yeni komuttur ("Yeniden hesapla" ikinci kez), düzeltilen form ilk gövdeye takılmaz. Her tıkta yeni kimlik
// üretmek korumayı boşa çıkarır; kimliği hiç yenilememek ikinci komutu "kimlik başka istekte kullanılmış" diye reddettirir.
// YALNIZ sunucuda tekrar korumalı tanımlanmış uçla kullanılır; korumasız uçta `useTekGonderim`.
export function useKorumaliKomut<G = void, C = unknown>(secenek: KorumaliKomutSecenegi<G, C>): UseMutationResult<C, Error, G> {
  const { gonder, tekrar, korumali, onSuccess, onError, ...kalan } = secenek;
  const kimlik = useRef<string | null>(null);
  const korunur = (govde: G): boolean => korumali?.(govde) ?? true;
  return useTekGonderim<G, C>({
    ...kalan,
    mutationFn: (govde) => {
      if (!korunur(govde)) return gonder(govde, undefined);
      kimlik.current ??= yeniIstekKimligi();
      return tekrarKorumaliGonder((d) => gonder(govde, d), { ...tekrar, istekKimligi: kimlik.current });
    },
    onSuccess: (...a) => {
      if (korunur(a[1])) kimlik.current = null;
      return onSuccess?.(...a);
    },
    onError: (...a) => {
      if (korunur(a[1]) && !yenidenDenenebilirMi(a[0])) kimlik.current = null;
      return onError?.(...a);
    },
  });
}
