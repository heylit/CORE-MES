import { useNavigate } from 'react-router-dom';
import { Dugme, Simge } from '../../../../ortak/arayuz/index.ts';
import { useYetki } from '../../../../ortak/veri/yetki.ts';
import { studyoParcaYolu, useIlkParcaKaynagi } from '../../../kalite-merkezi/disari.ts';

// 3689-2: ilk parça onayının tek kaynağı Kalite Merkezi numune planıdır; rota adımı yalnız gösterir. Opta plan yoksa ya da plan kapılı ilk
// parça taşımıyorsa rotadaki eski seçim geçerlidir (geçiş kuralı; göç yok) ve "rota seçimi" diye salt okunur görünür. Kilidi plan yalnız
// kuralsız ("İlk parça yok") kaydedilince kapatır.
export type IlkParcaDurumu =
  | { kaynak: 'plan'; acik: boolean; surum: number }
  | { kaynak: 'rota'; acik: boolean; planSurum?: number }
  | { kaynak: 'bilinmiyor'; acik: boolean };

export function useIlkParcaDurumu(malzemeNo: number, opNo: number | null, rotaSecimi: string | undefined): IlkParcaDurumu {
  const k = useIlkParcaKaynagi(malzemeNo > 0 ? malzemeNo : null);
  const rotaAcik = rotaSecimi !== undefined && rotaSecimi !== 'yok';
  if (!k.data) return { kaynak: k.isError ? 'bilinmiyor' : 'rota', acik: rotaAcik };
  const plan = k.data.operasyonlar.find((o) => o.opNo === opNo)?.plan ?? null;
  if (plan === null) return { kaynak: 'rota', acik: rotaAcik };
  return plan.ilkParca === null ? { kaynak: 'rota', acik: rotaAcik, planSurum: plan.surum } : { kaynak: 'plan', acik: plan.ilkParca, surum: plan.surum };
}

export const ilkParcaOzeti = (d: IlkParcaDurumu): string => `ilk parça ${d.acik ? 'açık' : 'kapalı'} (${d.kaynak === 'plan' ? 'kalite planı' : 'rota seçimi'})`;

export function IlkParcaSatiri({ malzemeNo, d }: { malzemeNo: number; d: IlkParcaDurumu }) {
  const git = useNavigate();
  const yetki = useYetki();
  const acabilir = yetki.var('kalite-merkezi.oku');
  const durum = d.acik ? 'açık' : 'kapalı';
  return (
    <div className="tc-rr1-ilk-parca" role="group" aria-label="İlk parça onayı">
      <Simge ad="lock" boyut="k" />
      <span className="tc-rr1-ilk-parca-metin">
        {d.kaynak === 'plan'
          ? <><b>İlk parça: Kalite Merkezi numune planı ({durum})</b><small className="tc-rr1-ipucu">{`Plan sürüm ${String(d.surum)} · burada değiştirilmez`}</small></>
          : d.kaynak === 'rota' && d.planSurum !== undefined
            ? <><b>İlk parça: rota seçimi (planda kapılı ilk parça yok) · {durum}</b>
              <small className="tc-rr1-ipucu">{`Plan sürüm ${String(d.planSurum)} · kapılı ilk parça kuralı eklenir ya da plan kuralsız kaydedilirse plan geçerli olur.`}</small></>
            : <><b>İlk parça: rota seçimi (plan yokken geçerli) · {durum}</b>
              <small className="tc-rr1-ipucu">{d.kaynak === 'bilinmiyor' ? 'Kalite planı okunamadı; rota seçimi gösteriliyor. ' : ''}Kalite Merkezi bu op için numune planı yazınca plan geçerli olur.</small></>}
      </span>
      <Dugme tur="ikincil" simge="file" disabled={!acabilir} title={acabilir ? undefined : 'Kalite Merkezi’ni görme yetkiniz yok'}
        onClick={() => { void git(studyoParcaYolu(malzemeNo)); }}>
        Stüdyoda aç
      </Dugme>
    </div>
  );
}
