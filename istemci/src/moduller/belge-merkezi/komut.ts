import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BelgeAyrintisi } from '#paylasilan/sozlesme/belge-merkezi.ts';
import type { AyniDosyaYeri } from '#paylasilan/sozlesme/dosya.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { tekrarKorumaliGonder, yenidenDenenebilirMi, yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { useTekGonderim } from '../../ortak/veri/korumali-komut.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { ayniDosyaYerleri } from './AyniDosya.tsx';
import { DosyaHatasi, dosyaYukle, sha256 } from './dosya-aktarimi.ts';

export function useYetki() {
  const islemler = useOturum().data?.islemler ?? [];
  return { yazar: islemler.includes('belge-merkezi.yaz'), yayinlar: islemler.includes('belge-merkezi.yayinla') };
}

// Belgeyi döndüren yazma komutu: gönder, modül verisini tazele, hatada iletiyi forma bırak. Çift tık tek istek gönderir (CIZ-4).
export function useKomut(yol: string, tamam: (cevap: BelgeAyrintisi) => void, hataMetni = 'İşlem yapılamadı') {
  const istemci = useQueryClient();
  const [hata, hataYaz] = useState<string | null>(null);
  const komut = useTekGonderim({
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

// Aynı içerikli dosya bulununca yükleme durur, kullanıcıya sorulur (3468-1); hata değildir.
class AyniDosyaVar extends Error {
  readonly yerler: AyniDosyaYeri[];
  readonly dosya: File;
  constructor(yerler: AyniDosyaYeri[], dosya: File) {
    super('Aynı dosya var');
    this.yerler = yerler;
    this.dosya = dosya;
  }
}

export interface AyniDosyaSorusu { dosyaAdi: string; yerler: AyniDosyaYeri[]; devam: () => void; vazgec: () => void }

// Önce dosya yüklenir, sonra özet komutla bağlanır. Komut sonucu bilinmeyen hatada aynı kimlikle yinelenir; sunucunun
// reddettiği (4xx) denemeden sonra yeni kimlik alınır: kullanıcı düzeltip yeniden gönderdiğinde ilk gövdeye takılmaz.
// `ayniDosyaSor`: yüklemeden önce aynı içerik başka yerde var mı diye sorulur (3468-1); varsa `ayni` dolar, kullanıcı sürdürür.
export function useDosyaliKomut<G>(
  yol: string, govdeKur: (ozet: string) => G, tamam: (cevap: BelgeAyrintisi) => void, hataMetni: string, ayniDosyaSor = false,
) {
  const istemci = useQueryClient();
  const [kimlik, kimlikYaz] = useState(yeniIstekKimligi);
  const [ilerleme, ilerlemeYaz] = useState<number | null>(null);
  const [hata, hataYaz] = useState<string | null>(null);
  const [ayni, ayniYaz] = useState<{ yerler: AyniDosyaYeri[]; dosya: File } | null>(null);
  const komut = useMutation({
    mutationFn: async ({ dosya, gec }: { dosya: File; gec: boolean }) => {
      const veri = new Uint8Array(await dosya.arrayBuffer());
      if (ayniDosyaSor && !gec) {
        const yerler = await ayniDosyaYerleri('/cizimler/ayni-dosya', await sha256(veri));
        if (yerler.length > 0) throw new AyniDosyaVar(yerler, dosya);
      }
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
      if (e instanceof AyniDosyaVar) { ayniYaz({ yerler: e.yerler, dosya: e.dosya }); return; }
      if (!yenidenDenenebilirMi(e)) kimlikYaz(yeniIstekKimligi());
      hataYaz(e instanceof DosyaHatasi ? e.message : hataIletisi(e, hataMetni));
    },
  });
  const soru: AyniDosyaSorusu | null = ayni === null ? null : {
    dosyaAdi: ayni.dosya.name,
    yerler: ayni.yerler,
    devam: () => { ayniYaz(null); komut.mutate({ dosya: ayni.dosya, gec: true }); },
    vazgec: () => { ayniYaz(null); },
  };
  return { gonder: (dosya: File) => { komut.mutate({ dosya, gec: false }); }, yukleniyor: komut.isPending, ilerleme, hata, ayni: soru };
}
