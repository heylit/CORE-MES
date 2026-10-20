import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { SAYFALAR, type Sayfa } from '#paylasilan/sayfalar.ts';
import type { GorunumCevabi, KurumLogosuCevabi } from '#paylasilan/sozlesme/ayarlar.ts';
import type { CikisCevabi, GirisGovdesi, OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import { OTURUM_BITTI, api } from './api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { gosteriBitir, gosteriKur } from './gorunum.ts';
import { GIRIS_LOGOSU_ADRESI } from './kurum-logosu.ts';
import { karsilamaSifirla } from './karsilama.ts';

export type { Kullanici };

// Menü yalnız sayfanın kendi işleminden süzülür: veri okuma yetkisi sayfayı menüye getirmez,
// menüde görünmek de veri yetkisi vermez; o karar sunucudadır.
export function gorunurSayfalar(kullanici: Kullanici): readonly Sayfa[] {
  return SAYFALAR.filter((s) => kullanici.islemler.includes(s.islem));
}

export function useOturum() {
  const istemci = useQueryClient();
  // Herhangi bir istek 401 dönerse oturum sunucuda bitmiştir; giriş ekranına düşmek için yeniden sorulur.
  useEffect(() => {
    const bitti = () => { void istemci.invalidateQueries({ queryKey: anahtarlar.oturum }); };
    window.addEventListener(OTURUM_BITTI, bitti);
    return () => window.removeEventListener(OTURUM_BITTI, bitti);
  }, [istemci]);

  return useQuery({
    queryKey: anahtarlar.oturum,
    queryFn: async () => {
      const { kullanici } = await api.get<OturumCevabi>('/oturum');
      // Oturumsuz geçen her an karşılama işaretini siler: oturumu biten (401) ya da çıkan kişi sonraki girişte yeniden karşılanır.
      // Giriş ekranı oturumu kendisi yazar; işaret bu yüzden girişte değil oturum kalkınca silinir.
      // Oturum bitince (401 ya da başka sekmede çıkış) önceki kullanıcının verisi önbellekte kalmaz: aynı tarayıcıda
      // sonra giren kişi, kendi verisi gelene kadar ötekinin kayıtlarını görmez. Oturum sorgusu kendi cevabıyla yazılır.
      if (kullanici === null) {
        karsilamaSifirla();
        istemci.removeQueries({ predicate: (q) => q.queryKey[0] !== anahtarlar.oturum[0] });
        istemci.getMutationCache().clear();
      }
      return kullanici;
    },
    staleTime: Infinity,
  });
}

export function useGiris() {
  const istemci = useQueryClient();
  return useMutation({
    mutationFn: (govde: GirisGovdesi) => api.post<OturumCevabi>('/oturum/giris', govde, { oturumBitirmez: true }),
    onSuccess: (cevap) => { istemci.setQueryData(anahtarlar.oturum, cevap.kullanici); },
  });
}

export type CikisKancasi = () => void | Promise<void>;
const cikisKancalari = new Set<CikisKancasi>();

// Modül, sayfası açık olmasa da çıkışta cihazdaki verisini silebilsin diye kaydolur (Arkon, karar 102 a). Dönen işlev kaydı bırakır.
// Kanca sunucu çıkışı onayladıktan sonra çalışır; beklenmez ve hatası yutulur: bir modülün kusuru çıkışı durdurmaz.
export function cikistaCalistir(kanca: CikisKancasi): () => void {
  cikisKancalari.add(kanca);
  return () => { cikisKancalari.delete(kanca); };
}

function cikisKancalariniCalistir(): void {
  for (const kanca of [...cikisKancalari]) {
    try {
      void Promise.resolve(kanca()).catch(() => undefined);
    } catch {
      // Bir kancanın hatası ötekileri atlatmasın.
    }
  }
}

export function useCikis() {
  const istemci = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<CikisCevabi> => { await api.post('/oturum/cikis'); },
    // Gösteri düğmeye basıldığı anda başlar, sunucunun cevabını beklemez; çıkış olmazsa kalkar ve hata görünür.
    onMutate: () => {
      const gorunum = istemci.getQueryData<GorunumCevabi>(anahtarlar.gorunum);
      const logo = istemci.getQueryData<KurumLogosuCevabi>(anahtarlar.kurumLogosu)?.logo ?? GIRIS_LOGOSU_ADRESI;
      if (gorunum !== undefined) gosteriKur(gorunum.acilis, gorunum.acilisSuresi, logo, false);
    },
    onError: () => { gosteriBitir(); },
    // Önceki kullanıcının verisi sonraki girişe sızmasın diye bütün önbellek boşaltılır.
    onSuccess: () => {
      cikisKancalariniCalistir();
      karsilamaSifirla();
      istemci.clear();
      istemci.setQueryData(anahtarlar.oturum, null);
    },
  });
}
