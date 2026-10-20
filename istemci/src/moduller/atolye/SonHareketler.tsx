import { useMemo } from 'react';
import { DurumKutusu, KuyrukKarti } from '../../ortak/arayuz/index.ts';
import { ApiHatasi, hataIletisi } from '../../ortak/veri/api.ts';
import { sonHareketler } from './kurallar.ts';
import type { HareketSatiri } from './kurallar.ts';
import { SON_OLAY_SAYISI, useArkonOlaylari, useSonOlaylar } from './veri.ts';

// Harita yanında son terminal olayları: üretim emirleri ve Arkon (emre yansımayanlar), yeniden eskiye. Olay seçilince makinesi seçilir.
type OlayYeri = NonNullable<HareketSatiri['yer']>;

const yetkisiz = (hata: unknown): boolean => hata instanceof ApiHatasi && hata.durum === 403;

export function SonHareketler({ secili, nesne, sec }: {
  secili: string | null; nesne: (olay: OlayYeri) => string; sec: (anahtar: string) => void;
}) {
  const emir = useSonOlaylar();
  const arkon = useArkonOlaylari();
  const satirlar = useMemo(
    () => sonHareketler(emir.data?.olaylar ?? [], arkon.data?.olaylar ?? [], SON_OLAY_SAYISI),
    [emir.data, arkon.data],
  );
  if (emir.isPending && arkon.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (emir.isError && arkon.isError) {
    if (yetkisiz(emir.error) && yetkisiz(arkon.error)) return <p className="tc-atolye-ipucu">Son hareketleri görme yetkiniz yok (üretim emirleri ya da Üretim Hazırlık okuma yetkisi gerekir).</p>;
    return <DurumKutusu durum="hata" mesaj={hataIletisi(emir.error, 'Son hareketler alınamadı')} yenile={() => { void emir.refetch(); void arkon.refetch(); }} />;
  }
  const eksik = emir.isError ? 'Üretim emri olayları' : arkon.isError ? 'Terminal olayları' : null;
  return (
    <>
      {eksik && <p className="tc-atolye-ipucu">{eksik} okunamadı{(emir.isError ? yetkisiz(emir.error) : yetkisiz(arkon.error)) ? ' (yetki yok)' : ''}; liste eksik.</p>}
      {satirlar.length === 0 && !emir.isPending && !arkon.isPending && <p className="tc-atolye-ipucu">Henüz terminal hareketi yok.</p>}
      {satirlar.map((s) => {
        const zaman = new Date(s.zaman);
        const yer = s.yer;
        return (
          <KuyrukKarti
            key={s.anahtar}
            no={Number.isNaN(zaman.getTime()) ? '—' : zaman.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
            parca={s.baslik}
            adet={s.adet}
            ayrinti={s.ayrinti}
            durum={s.durum}
            durumMetni={s.metin}
            ilerleme={null}
            secili={yer !== null && secili !== null && secili === nesne(yer)}
            sec={() => { if (yer) sec(nesne(yer)); }}
          />
        );
      })}
    </>
  );
}
