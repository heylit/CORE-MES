import { useMutation, useQueryClient } from '@tanstack/react-query';
import { REFAKAT_KOPYA_SAYISI } from '#paylasilan/etiket-sabitleri.ts';
import type { BasCevabi, IndirCevabi, KayitTuru } from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { kayitYazicisi, type CihazYazicisi } from './cihaz-yazicisi.ts';
import { secimSiniri } from './kayit-secimi.ts';
import { eslesmisYazici, usbHatasi, usbyeGonder } from './web-usb.ts';

// 2916 a: olay ekranı (mal kabul, konum, refakat...) etiketi Etiket Merkezi'ne gitmeden bu cihazın varsayılan yazıcısına basar.
// Baskı Etiket Merkezi'nin kendi ucundan geçer: yetki (etiket-merkezi.bas), yazıcı ve doğrudan baskı denetimi ve defter kaydı aynıdır.
// Varsayılan yoksa ya da işlem yoksa `yazici` null döner; çağıran bugünkü gibi Etiket Merkezi'ni açar.
export const BAS_ISLEMI = 'etiket-merkezi.bas';
const MERKEZDEN = "Etiket Merkezi'nden basın.";
// Yazıcı cevap verdiyse sorun çoğu kez yazıcıdadır (kâğıt, şerit, kapalı): Merkez'de aynı yazıcı da basamaz.
const YAZICI_HATASI = "Yazıcıyı kontrol edin ya da Etiket Merkezi'nden başka yazıcıya basın.";

export function useDogrudanBasim(kayitTuru: KayitTuru): {
  yazici: CihazYazicisi | null; bas: (idler: readonly number[]) => void; basiyor: boolean;
} {
  const izin = (useOturum().data?.islemler ?? []).includes(BAS_ISLEMI);
  const yazici = izin ? kayitYazicisi(kayitTuru) : null;
  const { bildir } = useBildirim();
  const istemci = useQueryClient();
  // USB varsayılanı (2953 c) indirme ucundan komutu alır (yetki, defter sunucuda) ve bu bilgisayarda eşleşmiş aygıta aktarır.
  const m = useMutation({
    mutationFn: async ({ y, idler }: { y: CihazYazicisi; idler: number[] }): Promise<Pick<BasCevabi, 'sonuc' | 'ileti'>> => {
      const govde = { yaziciId: y.yaziciId, adet: kayitTuru === 'refakat-partisi' ? REFAKAT_KOPYA_SAYISI : 1, kayit: { tur: kayitTuru, idler }, ...(y.olcu ? { olcu: y.olcu } : {}) };
      const yol = `/etiket-merkezi/sablonlar/${encodeURIComponent(y.sablonAnahtar)}`;
      if (y.baglanti !== 'usb') return api.post<BasCevabi>(`${yol}/bas`, govde, { istekKimligi: yeniIstekKimligi(), zamanAsimiMs: 15000 });
      const aygit = await eslesmisYazici();
      if (aygit === null) return { sonuc: 'hata', ileti: 'Bu bilgisayarda eşleşmiş USB yazıcı yok.' };
      const c = await api.post<IndirCevabi>(`${yol}/indir`, govde, { istekKimligi: yeniIstekKimligi() });
      try { await usbyeGonder(aygit, c.komut); return { sonuc: 'gonderildi', ileti: null }; } catch (h) { return { sonuc: 'hata', ileti: usbHatasi(h).message }; }
    },
    onSuccess: (c, { y }) => {
      if (c.sonuc === 'hata') bildir('hata', `${c.ileti ?? 'Yazıcı hata verdi.'} ${YAZICI_HATASI}`);
      else bildir('tamam', `Etiketler gönderildi: ${y.yaziciAd}.`);
      void istemci.invalidateQueries({ queryKey: anahtarlar.baskilar });
      void istemci.invalidateQueries({ queryKey: anahtarlar.bekleyenler });
    },
    onError: (h) => bildir('hata', `${hataIletisi(h, 'Etiket basılamadı.')} ${MERKEZDEN}`),
  });
  return {
    yazici,
    bas: (idler) => {
      const tekil = [...new Set(idler)];
      if (yazici === null || tekil.length === 0) return;
      // Etiket Merkezi'nin tek baskıda aldığı en çok kayıt; kalanı ayrı baskıyla gider.
      for (let i = 0; i < tekil.length; i += secimSiniri) m.mutate({ y: yazici, idler: tekil.slice(i, i + secimSiniri) });
    },
    basiyor: m.isPending,
  };
}
