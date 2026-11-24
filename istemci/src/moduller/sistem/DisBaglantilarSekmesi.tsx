import type { DisBaglanti } from '#paylasilan/sozlesme/saglik.ts';
import { DurumKutusu, Rozet } from '../../ortak/arayuz/index.ts';
import { BAGLANTI_ADI, DURUM_BILGISI, PLAN_TURU_ADI, gorunenBaglanti, gunluSaat } from './izleme-yorumu.ts';
import { useDisBaglantilar, useSuAn } from './izleme-sorgusu.ts';

const YOK = '—';

function BaglantiKarti({ b, simdi }: { b: DisBaglanti; simdi: number }) {
  const g = gorunenBaglanti(b);
  const d = DURUM_BILGISI[g.durum];
  return (
    <li className="tc-izleme-baglanti-karti">
      <h3 className="tc-izleme-baglanti-ad">{BAGLANTI_ADI[b.anahtar]} <Rozet ton={d.ton}>{d.ad}</Rozet></h3>
      {g.neden !== null ? <p className="tc-izleme-neden">{g.neden}</p> : (
        <dl className="tc-sistem-liste">
          <dt>Son başarı</dt><dd>{b.sonBasari === null ? YOK : gunluSaat(b.sonBasari, simdi)}</dd>
          <dt>Son hata</dt><dd>{b.sonHata === null ? YOK : `${gunluSaat(b.sonHata.an, simdi)} · ${b.sonHata.mesaj}`}</dd>
          <dt>Bekleyen</dt><dd>{b.bekleyen ?? YOK}</dd>
          <dt>Yeniden denenen</dt><dd>{b.yenidenDenenen ?? YOK}</dd>
        </dl>
      )}
    </li>
  );
}

export function DisBaglantilarSekmesi({ simdi = Date.now() }: { simdi?: number }) {
  const dis = useDisBaglantilar();
  const suAn = useSuAn(false);
  if (dis.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (dis.isError) return <DurumKutusu durum="hata" hata={dis.error} yenile={() => { void dis.refetch(); }} />;
  const plan = suAn.data?.planHesaplari ?? [];
  return (
    <div className="tc-izleme-bolumler">
      <ul className="tc-izleme-baglantilar" aria-label="Dış bağlantılar">
        {dis.data.baglantilar.map((b) => <BaglantiKarti key={b.anahtar} b={b} simdi={simdi} />)}
        <li className="tc-izleme-baglanti-karti">
          <h3 className="tc-izleme-baglanti-ad">Plan motoru <Rozet ton={suAn.isError ? 'pasif' : 'tamam'}>{suAn.isError ? 'Bilinmiyor' : 'Ölçülüyor'}</Rozet></h3>
          {plan.length === 0 ? <p className="tc-sistem-soluk">Hesap bilgisi yok.</p> : (
            <ul className="tc-izleme-baglanti-plan">
              {plan.map((p) => <li key={p.tur}><b>{p.tur === 'motor' ? 'Motor' : PLAN_TURU_ADI[p.tur]}</b>: {p.calisan} çalışan · {p.zamanAsimi} zaman aşımı · {p.bellekAsimi} bellek aşımı</li>)}
            </ul>
          )}
        </li>
      </ul>
      <p className="tc-sistem-soluk">"—": ilgili modül henüz bu bilgiyi vermiyor. Tezgah okuma ve e-posta için bağlantı durumu ölçülmüyor.</p>
    </div>
  );
}
