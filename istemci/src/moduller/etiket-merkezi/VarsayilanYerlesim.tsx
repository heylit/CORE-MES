import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SablonListesiOgesi } from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { Dugme, Rozet, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { anahtarlar } from './anahtarlar.ts';

// 3544: etiket türünün varsayılan yerleşimi; kayıt basımda başka seçilmedikçe bu yerleşimle basılır.
export function VarsayilanYerlesim({ sablon }: { sablon: SablonListesiOgesi }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const yap = useMutation({
    mutationFn: () => api.post<unknown>(`/etiket-merkezi/sablonlar/${sablon.anahtar}/varsayilan`, {}, { istekKimligi: yeniIstekKimligi() }),
    onSuccess: () => {
      bildir('tamam', `${sablon.ad} bu ölçünün varsayılanı oldu.`);
      void istemci.invalidateQueries({ queryKey: anahtarlar.sablonlar });
    },
    onError: (h) => bildir('hata', hataIletisi(h, 'Varsayılan kaydedilemedi; yeniden deneyin.')),
  });
  return (
    <section className="tc-etk-bolum" aria-label="Varsayılan yerleşim">
      <h4 className="tc-etk-bolum-baslik">Varsayılan yerleşim {sablon.varsayilan && <Rozet ton="bilgi">Varsayılan</Rozet>}</h4>
      {sablon.varsayilan ? (
        <p className="tc-etk-not">{sablon.ad} bu tür ve ölçünün varsayılanı: bu ölçüdeki kayıt basımı bu yerleşimle açılır.</p>
      ) : (
        <>
          {sablon.uyari && <p className="tc-etk-not"><Rozet ton="uyari">Satır düşer</Rozet> {sablon.uyari}</p>}
          <p className="tc-etk-not">{sablon.ad} bu tür ve ölçünün varsayılanı olur; başka ölçülerin varsayılanı değişmez.</p>
          <Dugme simge="check" yukleniyor={yap.isPending} onClick={() => yap.mutate()}>Varsayılan yap</Dugme>
        </>
      )}
    </section>
  );
}
