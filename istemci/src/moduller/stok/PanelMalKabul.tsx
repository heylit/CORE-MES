import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GozOnerisiCevabi, KodCozCevabi, MalKabulCevabi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, KodOkuyucu, Pencere } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { BelirsizMiktarHatasi, belirsizMiktarVar } from './gorunum.ts';
import { HizliMalKabul, kabulGovdesi, kopyaSayisi, type BekleyenGiris } from './HizliMalKabul.tsx';
import { LotEtiketPenceresi } from './LotEtiketi.tsx';
import { useStokKodCoz } from './OkutmaSonucu.tsx';
import { hataMetni, korumaliPost } from './ortak.tsx';

// Teslim al altındaki Mal kabul (soru 89, stok.giris): okutulan malzeme eski Okut sayfasındaki hızlı kabulle alınır. Raf okutulmazsa
// mal kabul alanına girer; "Rafı okut" girişi bekletir, okutulan ya da önerilen göze yazar.
export function PanelMalKabul({ kod }: { kod: string }) {
  const stok = useStokKodCoz(kod);
  const [bekleyen, setBekleyen] = useState<BekleyenGiris | null>(null);
  const [son, setSon] = useState<{ belgeId: number; kopya: number; metin: string } | null>(null);
  const [etiket, setEtiket] = useState(false);
  return (
    <>
      <h3 className="tc-stok-teslim-baslik">Mal kabul</h3>
      {son && (
        <p className="tc-stok-bilgi" role="status"><span>{son.metin}</span>
          <Dugme tur="ikincil" simge="tag" onClick={() => setEtiket(true)}>Etiket bas</Dugme>
        </p>
      )}
      {stok.isPending ? <DurumKutusu durum="yukleniyor" />
        : stok.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(stok.error)} yenile={() => { void stok.refetch(); }} />
        : stok.data.tur !== 'malzeme' ? <p className="tc-stok-not">Mal kabul için malzemenin kodunu okutun; lot etiketi stoktaki partiyi gösterir.</p>
        : <Kabul ozet={stok.data.ozet} bekleyenAc={setBekleyen} bitti={(belgeId, kopya, metin) => setSon({ belgeId, kopya, metin })} />}
      {bekleyen && <RafOkut b={bekleyen} kapat={() => setBekleyen(null)} bitti={(belgeId, metin) => { setBekleyen(null); setSon({ belgeId, kopya: kopyaSayisi(bekleyen.ambalajSayisi), metin }); }} />}
      {etiket && son && <LotEtiketPenceresi baslik="Lot etiketi" yol={`/stok/mal-kabuller/${son.belgeId}/lot-etiketleri`} kopyalar={{ 1: son.kopya }} kapat={() => setEtiket(false)} />}
    </>
  );
}

function Kabul({ ozet, bekleyenAc, bitti }: { ozet: Extract<KodCozCevabi, { tur: 'malzeme' }>['ozet']; bekleyenAc: (b: BekleyenGiris) => void; bitti: (belgeId: number, kopya: number, metin: string) => void }) {
  return <HizliMalKabul key={ozet.id} malzeme={ozet} konumId={null} bekleyenAc={bekleyenAc} bitti={(belgeId, kopya) => bitti(belgeId, kopya, `${ozet.ad ?? ozet.kod} teslim alındı.`)} />;
}

function RafOkut({ b, kapat, bitti }: { b: BekleyenGiris; kapat: () => void; bitti: (belgeId: number, metin: string) => void }) {
  const istemci = useQueryClient();
  const [ileti, setIleti] = useState<string | null>(null);
  const oneri = useQuery({ queryKey: [...anahtarlar.hepsi, 'goz-onerisi', b.malzemeId], queryFn: () => api.get<GozOnerisiCevabi>(`/stok/malzemeler/${b.malzemeId}/goz-onerisi`) });
  const yaz = useMutation({
    mutationFn: (konumId: number) => {
      const govde = kabulGovdesi(b, konumId);
      return belirsizMiktarVar(govde) ? Promise.reject(new BelirsizMiktarHatasi()) : korumaliPost<MalKabulCevabi>('/stok/mal-kabul', govde);
    },
    onSuccess: (c) => { void istemci.invalidateQueries({ queryKey: anahtarlar.hepsi }); bitti(c.belge.id, `${b.ad} × ${b.miktar} rafa girdi (${c.belge.no}).`); },
  });
  const coz = useMutation({
    mutationFn: (kod: string) => api.get<KodCozCevabi>(`/stok/kod-coz?kod=${encodeURIComponent(kod)}`),
    onSuccess: (c) => { if (c.tur === 'konum') yaz.mutate(c.konum.id); else setIleti('Rafın ya da gözün etiketini okutun.'); },
  });
  const hata = coz.error ?? yaz.error;
  return (
    <Pencere acik kapat={kapat} baslik="Rafı okut">
      <div className="tc-stok-form">
        <p className="tc-stok-not"><strong>{b.ad}</strong> × {b.miktar} için rafı okut.</p>
        <KodOkuyucu okundu={(kod) => { setIleti(null); coz.mutate(kod.trim()); }} bekliyor={coz.isPending || yaz.isPending} ipucu="Rafın ya da gözün etiketi." />
        {oneri.data?.oneri && <Dugme tur="ikincil" yukleniyor={yaz.isPending} onClick={() => yaz.mutate(oneri.data.oneri!.konumId)}>Önerilen: {oneri.data.oneri.kod}</Dugme>}
        {ileti && <p className="tc-stok-bilgi tc-stok-bilgi-uyari" role="alert">{ileti}</p>}
        {hata && <p className="tc-stok-bilgi tc-stok-bilgi-uyari" role="alert">{hataMetni(hata)}</p>}
      </div>
    </Pencere>
  );
}
