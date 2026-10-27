import type { KmResim } from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';
import { Dugme, Simge } from '../../../../ortak/arayuz/index.ts';
import { ApiHatasi } from '../../../../ortak/veri/api.ts';
import { useStudyoParcasi } from '../../../kalite-merkezi/disari.ts';
import { Cip } from './denetimler.tsx';
import { etkinResimler, kmResimDurumu } from './km-cizim.ts';
import type { Pkg } from './tipler.ts';

// Dokümanlar sekmesinde parçanın Kalite Merkezi resimleri (789): resim ve balonlar orada hazırlanır, burada yalnız pakete alınır.
export function KaliteMerkeziCizimleri({ p, malzemeNo, duzenler, mesgul, al }: {
  p: Pkg; malzemeNo: number; duzenler: boolean; mesgul: boolean; al: (r: KmResim) => void;
}) {
  const parca = useStudyoParcasi(malzemeNo);
  const resimler = parca.data ? etkinResimler(parca.data.resimler) : [];
  const yetkisiz = parca.error instanceof ApiHatasi && parca.error.durum === 403;
  return (
    <section className="tc-ay2-kart tc-ay2-genis" aria-label="Kalite Merkezi’nden">
      <div className="tc-ay2-kb">
        <span className="tc-ay2-kb-simge" data-ton="done"><Simge ad="target" /></span>
        <div><b>Kalite Merkezi’nden</b><small>Parçanın teknik resmi ve 3B modeli · balonlar Kalite Merkezi’nde düzenlenir, burada salt okunur</small></div>
      </div>
      {parca.isPending ? <p className="tc-ay2-soluk">Kalite Merkezi okunuyor…</p>
        : parca.isError ? <p className="tc-ay2-soluk">{yetkisiz ? 'Kalite Merkezi’ni okuma yetkin yok.' : 'Kalite Merkezi okunamadı: ' + parca.error.message}</p>
          : resimler.length ? (
            <div className="tc-ay2-cizimler">
              {resimler.map((r) => {
                const durum = kmResimDurumu(p, r);
                return (
                  <div key={r.id} className="tc-ay2-cizim" data-acik={durum === 'pakette' ? '' : undefined}>
                    <div className="tc-ay2-cizim-tur"><span data-tur={r.tur === 'resim' ? 'pdf' : 'model'}>{r.tur === 'resim' ? 'PDF' : '3B'}</span></div>
                    <div>
                      <b>{r.ad}</b>
                      <span>{r.revizyon ? 'Rev ' + r.revizyon + ' · ' : ''}{r.balonlar.length} balon</span>
                    </div>
                    {durum === 'pakette' ? <Cip ton="run">Pakette</Cip> : null}
                    {durum === 'degisti' ? <Cip ton="hold">Kalite Merkezi’nde değişti</Cip> : null}
                    {duzenler && durum !== 'pakette' ? (
                      <Dugme simge={durum === 'degisti' ? 'rotate' : 'plus'} disabled={mesgul} onClick={() => al(r)}>{durum === 'degisti' ? 'Güncelle' : 'Pakete al'}</Dugme>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : <p className="tc-ay2-soluk">Bu parçanın Kalite Merkezi’nde resmi yok. Teknik resim ve balonlar Kalite Merkezi stüdyosunda hazırlanır.</p>}
    </section>
  );
}
