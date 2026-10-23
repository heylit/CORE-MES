import { useState } from 'react';
import { Dugme, Simge } from '../../../../ortak/arayuz/index.ts';
import { useMesaj } from '../durum.tsx';
import { bendenOnayBekliyor, onayDurumu } from '../kurallar.ts';
import { DurumRozeti } from '../ortak/index.ts';
import type { Kayit, Onay } from '../tipler.ts';
import { duzenleyebilir } from '../yetki.ts';
import { useIsEylemleri } from './eylemler.ts';
import { KisiIsareti, SiparisCipi } from './parcalar.tsx';
import { ReddetPenceresi } from './ReddetPenceresi.tsx';
import { ZenginMetin } from './ZenginMetin.tsx';
import './kartlar.css';

// Prototipin apCard'ı. Onayla ve Reddet onaylayacak kişide, yeniden gönderme reddedilen isteğin sahibinde.
export function OnayKarti({ onay: a, iletide, tam }: { onay: Kayit<Onay>; iletide?: boolean; tam?: boolean }) {
  const { ben, ad, ilkAd, yetki, ayrintiAc, formAc } = useMesaj();
  const { oyVer } = useIsEylemleri();
  const [reddet, reddetYaz] = useState(false);
  const st = onayDurumu(a);
  const notlar = st.ds.filter((x) => x.v?.note);
  return (
    <div className={`tc-mi-satir tc-mi-onay tc-mi-onay-${st.s}${iletide ? ' tc-mi-iletide' : ''}`}>
      <span className="tc-mi-simge" aria-hidden="true"><Simge ad="clipboard-check" /></span>
      <div className="tc-mi-govde">
        <button type="button" className="tc-mi-baslik" onClick={() => ayrintiAc({ tur: 'onay', id: a.id })}>{a.title}</button>
        {tam && a.note && <ZenginMetin metin={a.note} sinif="tc-mi-not" />}
        <div className="tc-mi-ust">
          <DurumRozeti tur="onay" durum={st.s} />
          <span>{a.by === ben.id ? 'Senin isteğin' : `${ilkAd(a.by)} istedi`}</span>
          <SiparisCipi siparisId={a.orderId ?? null} />
        </div>
        <div className="tc-mi-kisiler">
          {st.ds.map((x) => (
            <KisiIsareti
              key={x.id} id={x.id} durum={x.v ? x.v.d : ''} isaret={x.v ? (x.v.d === 'ok' ? '✓' : '✕') : '…'}
              baslik={`${ad(x.id)}: ${x.v ? (x.v.d === 'ok' ? 'onayladı' : 'reddetti') : 'bekleniyor'}`}
            />
          ))}
        </div>
        {notlar.map((x) => <p key={x.id} className="tc-mi-oy-notu"><b>{ilkAd(x.id)}:</b> {x.v?.note}</p>)}
        {yetki.yaz && bendenOnayBekliyor(a, ben.id) && (
          <div className="tc-mi-eylemler">
            <Dugme tur="birincil" simge="check" onClick={() => oyVer(a.id, 'ok')}>Onayla</Dugme>
            <Dugme onClick={() => reddetYaz(true)}>Reddet</Dugme>
          </div>
        )}
        {duzenleyebilir(a, yetki, ben.id) && st.s === 'no' && (
          <div className="tc-mi-eylemler">
            <Dugme onClick={() => formAc({ tur: 'onay', duzenle: a.id })}>Düzenle ve yeniden gönder</Dugme>
          </div>
        )}
      </div>
      <ReddetPenceresi acik={reddet} baslik={a.title} kapat={() => reddetYaz(false)} reddet={(n) => { reddetYaz(false); oyVer(a.id, 'no', n); }} />
    </div>
  );
}
