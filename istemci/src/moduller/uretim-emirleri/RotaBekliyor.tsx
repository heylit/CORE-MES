import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dugme, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';

// 3272-2 a: siparişten açılan emrin ürününde yürürlükte rota yoksa emir adımsız ve "rota bekliyor" açılır; planlanmaz, başlatılmaz.
// Rota yürürlüğe girince kendiliğinden dolar; yürürlüğe alanın yetkisi yoksa ya da uygulama atlandıysa "Rotayı uygula" elle uygular.
// Uç rota modülündedir (rota.emre-kopyala); düğme yetkisiz kişide pasiftir ve nedeni yanında yazar.
export const ROTA_UYGULAMA_YETKISI = 'rota.emre-kopyala';

export function RotaBekliyorSeridi({ emirId }: { emirId: number }) {
  const yetkili = ((useOturum().data?.islemler ?? []) as readonly string[]).includes(ROTA_UYGULAMA_YETKISI);
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const komut = useMutation({
    mutationFn: () => api.post<{ kaynakRevizyon: { harf: string } }>(`/rota/emirler/${String(emirId)}/bekleyen-rotayi-uygula`, {}, { istekKimligi: yeniIstekKimligi() }),
    onSuccess: async (c) => {
      bildir('tamam', `Rota uygulandı (Rev ${c.kaynakRevizyon.harf}).`);
      await istemci.invalidateQueries({ queryKey: anahtarlar.hepsi });
    },
  });
  return (
    <section className="tc-emir-bekleme" role="status" aria-label="Emir rota bekliyor">
      <Simge ad="route" />
      <div className="tc-emir-bekleme-metin">
        <b>Rota bekliyor</b>
        <span>Emir siparişten rotasız açıldı; adımı yok, planlanmaz ve başlatılmaz. Ürünün rotası yürürlüğe girince kendiliğinden dolar.</span>
        {!yetkili && <small>Rotayı elle uygulamak için rotadan emir açma yetkisi gerekir.</small>}
        {komut.isError && <small className="tc-emir-hurda" role="alert">{hataIletisi(komut.error, 'Rota uygulanamadı.')}</small>}
      </div>
      <Dugme simge="route" disabled={!yetkili} yukleniyor={komut.isPending} onClick={() => { komut.mutate(); }}>Rotayı uygula</Dugme>
    </section>
  );
}
