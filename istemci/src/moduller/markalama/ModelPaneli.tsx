import { useQuery } from '@tanstack/react-query';
import type { Vector3 } from 'three';
import type { MalzemeBelgeleriCevabi } from '#paylasilan/sozlesme/belge-merkezi.ts';
import type { MarkalamaTanimi } from '#paylasilan/sozlesme/markalama.ts';
import { DurumKutusu, Secim } from '../../ortak/arayuz/index.ts';
import { api, ApiHatasi, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { Markalama3B, type SahneMarkasi } from './Markalama3B.tsx';
import { ikiliOku, modelSecenekleri } from './veri.ts';

type ModelBagi = MarkalamaTanimi['model'];

const yetkiIletisi = (hata: unknown, ekran: string): string =>
  hata instanceof ApiHatasi && hata.durum === 403 ? 'Modeli görmek için çizim okuma yetkisi gerekir.' : hataIletisi(hata, ekran);

// Model, malzemeye bağlı çizim belgesinin revizyonudur (Çizim Merkezi); tanım belge ve revizyon harfini tutar.
export function ModelPaneli({ malzemeId, model, modelSec, markalar, secili, yerSec }: {
  malzemeId: number;
  model: ModelBagi;
  modelSec?: (m: ModelBagi) => void;
  markalar: readonly SahneMarkasi[];
  secili: number | null;
  yerSec?: (nokta: Vector3, normal: Vector3) => void;
}) {
  const belgeler = useQuery({
    queryKey: anahtarlar.modeller(malzemeId),
    queryFn: () => api.get<MalzemeBelgeleriCevabi>(`/cizimler/malzemeler/${malzemeId}/belgeler`),
    retry: false,
  });
  const secenekler = belgeler.data ? modelSecenekleri(belgeler.data) : [];
  const aktif = model === null ? undefined : secenekler.find((s) => s.belgeId === model.belgeId && s.harf === model.revizyon);
  const dosya = useQuery({
    queryKey: anahtarlar.modelDosyasi(aktif?.belgeId ?? 0, aktif?.revizyonId ?? 0),
    queryFn: ({ signal }) => ikiliOku(`/cizimler/${aktif!.belgeId}/revizyonlar/${aktif!.revizyonId}/dosya`, signal),
    enabled: aktif !== undefined,
    staleTime: Infinity,
    retry: false,
  });

  if (belgeler.isPending) return <DurumKutusu durum="yukleniyor" mesaj="Modeller okunuyor" />;
  if (belgeler.isError) return <DurumKutusu durum="hata" mesaj={yetkiIletisi(belgeler.error, 'Malzemenin modelleri okunamadı.')} />;

  return (
    <div className="tc-mrk-model-panel">
      {modelSec && (
        <Secim
          etiket="3B model"
          ipucu={secenekler.length === 0 ? 'Bu malzemeye bağlı model yok; Çizim Merkezi\'nden STEP ya da STL ekleyin.' : 'Yer, seçilen revizyonun üstünde işaretlenir.'}
          secenekler={secenekler.map((s) => ({ deger: `${s.belgeId}:${s.harf}`, baslik: `${s.belgeAdi} · Rev ${s.harf}${s.durum === 'taslak' ? ' (taslak)' : ''}` }))}
          bosSecenek="Model yok"
          value={model === null ? '' : `${model.belgeId}:${model.revizyon}`}
          onChange={(o) => {
            const s = secenekler.find((x) => `${x.belgeId}:${x.harf}` === o.target.value);
            modelSec(s ? { belgeId: s.belgeId, revizyon: s.harf } : null);
          }}
        />
      )}
      {model !== null && aktif === undefined && (
        <DurumKutusu durum="hata" mesaj={`Tanımdaki model (Rev ${model.revizyon}) artık yok ya da eskidi; yeni revizyonu seçip yerleri yeniden işaretleyin.`} />
      )}
      {model === null && !modelSec && <DurumKutusu durum="bos" mesaj="Bu tanıma model bağlanmamış." />}
      {aktif && dosya.isPending && <DurumKutusu durum="yukleniyor" mesaj="Model indiriliyor" />}
      {aktif && dosya.isError && <DurumKutusu durum="hata" mesaj={yetkiIletisi(dosya.error, 'Model dosyası okunamadı.')} />}
      {aktif && dosya.data && (
        <Markalama3B veri={dosya.data} bicim={aktif.bicim} markalar={markalar} secili={secili} {...(yerSec ? { yerSec } : {})} />
      )}
    </div>
  );
}
