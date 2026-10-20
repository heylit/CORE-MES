import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BelgeAyrintisi } from '#paylasilan/sozlesme/cizimler.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { tekrarKorumaliGonder, yenidenDenenebilirMi, yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { DosyaHatasi, dosyaYukle } from './dosya-aktarimi.ts';

export function useYetki() {
  const islemler = useOturum().data?.islemler ?? [];
  return { yazar: islemler.includes('cizimler.yaz'), yayinlar: islemler.includes('cizimler.yayinla') };
}

// Belgeyi döndüren yazma komutu: gönder, modül verisini tazele, hatada iletiyi forma bırak.
export function useKomut(yol: string, tamam: (cevap: BelgeAyrintisi) => void, hataMetni = 'İşlem yapılamadı') {
  const istemci = useQueryClient();
  const [hata, hataYaz] = useState<string | null>(null);
  const komut = useMutation({
    mutationFn: (govde: unknown) => api.post<BelgeAyrintisi>(yol, govde),
    onMutate: () => { hataYaz(null); },
    onSuccess: async (cevap) => {
      await istemci.invalidateQueries({ queryKey: anahtarlar.kok });
      tamam(cevap);
    },
    onError: (e) => { hataYaz(hataIletisi(e, hataMetni)); },
  });
  return { gonder: (govde: unknown) => { komut.mutate(govde); }, yukleniyor: komut.isPending, hata };
}

// Önce dosya yüklenir, sonra özet komutla bağlanır. Komut sonucu bilinmeyen hatada aynı kimlikle yinelenir; sunucunun
// reddettiği (4xx) denemeden sonra yeni kimlik alınır: kullanıcı düzeltip yeniden gönderdiğinde ilk gövdeye takılmaz.
export function useDosyaliKomut<G>(yol: string, govdeKur: (ozet: string) => G, tamam: (cevap: BelgeAyrintisi) => void, hataMetni: string) {
  const istemci = useQueryClient();
  const [kimlik, kimlikYaz] = useState(yeniIstekKimligi);
  const [ilerleme, ilerlemeYaz] = useState<number | null>(null);
  const [hata, hataYaz] = useState<string | null>(null);
  const komut = useMutation({
    mutationFn: async (dosya: File) => {
      const veri = new Uint8Array(await dosya.arrayBuffer());
      const ozet = await dosyaYukle(veri, ilerlemeYaz);
      return tekrarKorumaliGonder((deneme) => api.post<BelgeAyrintisi>(yol, govdeKur(ozet), deneme), { istekKimligi: kimlik });
    },
    onMutate: () => { hataYaz(null); ilerlemeYaz(0); },
    onSuccess: async (cevap) => {
      await istemci.invalidateQueries({ queryKey: anahtarlar.kok });
      tamam(cevap);
    },
    onError: (e) => {
      ilerlemeYaz(null);
      if (!yenidenDenenebilirMi(e)) kimlikYaz(yeniIstekKimligi());
      hataYaz(e instanceof DosyaHatasi ? e.message : hataIletisi(e, hataMetni));
    },
  });
  return { gonder: (dosya: File) => { komut.mutate(dosya); }, yukleniyor: komut.isPending, ilerleme, hata };
}
