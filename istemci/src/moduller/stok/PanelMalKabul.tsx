import { Suspense, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GozOnerisiCevabi, KodCozCevabi, MalKabulCevabi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, KodOkuyucu, Pencere, useOkutmaGecmisi } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { MalzemeKesiti } from '../malzemeler/disari.ts';
import { anahtarlar } from './anahtarlar.ts';
import { BelirsizMiktarHatasi, belirsizMiktarVar } from './gorunum.ts';
import { HizliMalKabul, kabulGovdesi, kopyaSayisi, type BekleyenGiris } from './HizliMalKabul.tsx';
import { EtiketMerkeziDugmesi } from './Etiketler.tsx';
import { useStokKodCoz } from './OkutmaSonucu.tsx';
import { hataMetni, korumaliPost } from './ortak.tsx';

// Teslim al altındaki Mal kabul (soru 89, stok.giris): okutulan malzeme eski Okut sayfasındaki hızlı kabulle alınır. Raf okutulmazsa
// mal kabul alanına girer; "Rafı okut" girişi bekletir, okutulan ya da önerilen göze yazar. 3584 a: terminal kabulü `kabulEdildi` ile
// alır ve lot etiketini kendi yuvasından basar; o zaman panel kendi "Etiket bas"ını göstermez.
export interface YazilanKabul { belgeId: number; belgeNo: string }
export function PanelMalKabul({ kod, kabulEdildi }: { kod: string; kabulEdildi?: (k: YazilanKabul) => void }) {
  const stok = useStokKodCoz(kod);
  const [bekleyen, setBekleyen] = useState<BekleyenGiris | null>(null);
  const [son, sonYaz] = useState<{ belgeId: number; kopya: number; metin: string } | null>(null);
  const setSon = (k: { belgeId: number; belgeNo: string; kopya: number; metin: string }) => {
    if (kabulEdildi) { kabulEdildi({ belgeId: k.belgeId, belgeNo: k.belgeNo }); return; }
    sonYaz(k);
  };
  return (
    <>
      <h3 className="tc-stok-teslim-baslik">Mal kabul</h3>
      {son && (
        <p className="tc-stok-bilgi" role="status"><span>{son.metin}</span>
          <EtiketMerkeziDugmesi tur="mal-kabul" idler={[son.belgeId]}>Etiket bas</EtiketMerkeziDugmesi>
        </p>
      )}
      {stok.isPending ? <DurumKutusu durum="yukleniyor" />
        : stok.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(stok.error)} yenile={() => { void stok.refetch(); }} />
        : stok.data.tur !== 'malzeme' ? <p className="tc-stok-not">Mal kabul için malzemenin kodunu okutun; lot etiketi stoktaki partiyi gösterir.</p>
        : (
          <>
            {/* Kabul eden gelen malı kartın ölçüsüyle karşılaştırır; kesit yalnız hammaddede ve ölçü tamken gelir. */}
            {stok.data.kesit && <Suspense fallback={null}><MalzemeKesiti form={stok.data.kesit.form} olcu={stok.data.kesit.olcu} kod={stok.data.ozet.kod} /></Suspense>}
            <Kabul ozet={stok.data.ozet} bekleyenAc={setBekleyen} bitti={(belgeId, kopya, metin, belgeNo) => setSon({ belgeId, belgeNo, kopya, metin })} />
          </>
        )}
      {bekleyen && <RafOkut b={bekleyen} kapat={() => setBekleyen(null)} bitti={(belgeId, belgeNo, metin) => { setBekleyen(null); setSon({ belgeId, belgeNo, kopya: kopyaSayisi(bekleyen.ambalajSayisi), metin }); }} />}
    </>
  );
}

function Kabul({ ozet, bekleyenAc, bitti }: { ozet: Extract<KodCozCevabi, { tur: 'malzeme' }>['ozet']; bekleyenAc: (b: BekleyenGiris) => void; bitti: (belgeId: number, kopya: number, metin: string, belgeNo: string) => void }) {
  return <HizliMalKabul key={ozet.id} malzeme={ozet} konumId={null} bekleyenAc={bekleyenAc} bitti={(belgeId, kopya, belgeNo) => bitti(belgeId, kopya, `${ozet.ad ?? ozet.kod} teslim alındı.`, belgeNo)} />;
}

function RafOkut({ b, kapat, bitti }: { b: BekleyenGiris; kapat: () => void; bitti: (belgeId: number, belgeNo: string, metin: string) => void }) {
  const istemci = useQueryClient();
  const [ileti, setIleti] = useState<string | null>(null);
  const oneri = useQuery({ queryKey: [...anahtarlar.hepsi, 'goz-onerisi', b.malzemeId], queryFn: () => api.get<GozOnerisiCevabi>(`/stok/malzemeler/${b.malzemeId}/goz-onerisi`) });
  const yaz = useMutation({
    mutationFn: (konumId: number) => {
      const govde = kabulGovdesi(b, konumId);
      return belirsizMiktarVar(govde) ? Promise.reject(new BelirsizMiktarHatasi()) : korumaliPost<MalKabulCevabi>('/stok/mal-kabul', govde);
    },
    onSuccess: (c) => { void istemci.invalidateQueries({ queryKey: anahtarlar.hepsi }); bitti(c.belge.id, c.belge.no, `${b.ad} × ${b.miktar} rafa girdi (${c.belge.no}).`); },
  });
  const gecmis = useOkutmaGecmisi();
  const coz = useMutation({
    mutationFn: (kod: string) => api.get<KodCozCevabi>(`/stok/kod-coz?kod=${encodeURIComponent(kod)}`),
    onError: (e, kod) => gecmis.bildir(kod, 'hata', hataMetni(e)),
    onSuccess: (c, kod) => {
      if (c.tur === 'konum') { gecmis.bildir(kod, 'tamam', c.konum.kod); yaz.mutate(c.konum.id); return; }
      const ileti = 'Rafın ya da gözün etiketini okutun.';
      gecmis.bildir(kod, 'hata', ileti);
      setIleti(ileti);
    },
  });
  const hata = coz.error ?? yaz.error;
  return (
    <Pencere acik kapat={kapat} baslik="Rafı okut">
      <div className="tc-stok-form">
        <p className="tc-stok-not"><strong>{b.ad}</strong> × {b.miktar} için rafı okut.</p>
        <KodOkuyucu okundu={(kod) => { setIleti(null); coz.mutate(kod.trim()); }} bekliyor={coz.isPending || yaz.isPending} ipucu="Rafın ya da gözün etiketi." geribildirim={gecmis} />
        {oneri.data?.oneri && <Dugme tur="ikincil" yukleniyor={yaz.isPending} onClick={() => yaz.mutate(oneri.data.oneri!.konumId)}>Önerilen: {oneri.data.oneri.kod}</Dugme>}
        {ileti && <p className="tc-stok-bilgi tc-stok-bilgi-uyari" role="alert">{ileti}</p>}
        {hata && <p className="tc-stok-bilgi tc-stok-bilgi-uyari" role="alert">{hataMetni(hata)}</p>}
      </div>
    </Pencere>
  );
}
