import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BasCevabi, KayitTuru } from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { kayitYazicisi, type CihazYazicisi } from './cihaz-yazicisi.ts';
import { secimSiniri } from './kayit-secimi.ts';

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
  const m = useMutation({
    mutationFn: ({ y, idler }: { y: CihazYazicisi; idler: number[] }) =>
      api.post<BasCevabi>(`/etiket-merkezi/sablonlar/${encodeURIComponent(y.sablonAnahtar)}/bas`,
        { yaziciId: y.yaziciId, adet: 1, kayit: { tur: kayitTuru, idler } }, { istekKimligi: yeniIstekKimligi(), zamanAsimiMs: 15000 }),
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
