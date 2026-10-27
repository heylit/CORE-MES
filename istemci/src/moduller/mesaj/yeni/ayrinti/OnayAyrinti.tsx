import { useState } from 'react';
import { Dugme, OnayPenceresi, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { tamTarih } from '../bicim.ts';
import { useMesaj } from '../durum.tsx';
import { bendenOnayBekliyor, onayDurumu } from '../kurallar.ts';
import { useIsEylemleri } from '../kartlar/eylemler.ts';
import { DAMGA_MS, hareketAzaltildi, kutlamaIste } from '../kartlar/kutlama.ts';
import { KisiIsareti } from '../kartlar/parcalar.tsx';
import { ReddetPenceresi } from '../kartlar/ReddetPenceresi.tsx';
import { ZenginMetin } from '../kartlar/ZenginMetin.tsx';
import { DurumRozeti, KisiRozeti } from '../ortak/index.ts';
import { duzenleyebilir } from '../yetki.ts';
import { NotListesi } from './Notlar.tsx';
import { Baslik, Bolum, KaynakBaglantisi, Ozellik } from './parcalar.tsx';

// Prototipin apprDetail'i: Onayla / Reddet onaylayacakta; Düzenle ve İsteği sil isteyende ve yöneticide (225 a).
export function OnayAyrinti({ id, kapat }: { id: string; kapat: () => void }) {
  const { ben, ad, veri, yetki, yaz, siparisler, ayrintiAc, formAc } = useMesaj();
  const { oyVer } = useIsEylemleri();
  const { bildir } = useBildirim();
  const [reddet, reddetYaz] = useState(false);
  const [silinsin, silinsinYaz] = useState(false);
  const [damga, damgaYaz] = useState(false);
  const a = veri.onaylar.find((o) => o.id === id);
  if (!a) return <p className="tc-mi-bos-kucuk">Bu istek silinmiş.</p>;
  const st = onayDurumu(a);
  const onayla = () => {
    kutlamaIste();
    if (hareketAzaltildi()) { oyVer(a.id, 'ok'); return; }
    damgaYaz(true);
    window.setTimeout(() => { oyVer(a.id, 'ok'); }, DAMGA_MS);
  };
  const siparis = a.orderId ? siparisler?.find((o) => o.id === a.orderId) : undefined;
  return (
    <div className="tc-mi-sayfa tc-mi-onay">
      {damga && <span className="tc-mi-damga tc-mi-damga-buyuk" aria-hidden="true">ONAYLANDI</span>}
      <Baslik simge="clipboard-check" baslik={<h3 className="tc-mi-sayfa-baslik">{a.title}</h3>} alt={<DurumRozeti tur="onay" durum={st.s} />} />
      <dl className="tc-mi-ozellikler">
        <Ozellik simge="user" ad="İsteyen"><span className="tc-mi-ust"><KisiRozeti id={a.by} boyut="s" />{ad(a.by)}</span></Ozellik>
        <Ozellik simge="clock" ad="Tarih">{tamTarih(a.createdAt || Date.now())}</Ozellik>
        <Ozellik simge="users" ad="Onaylayacaklar">
          <div className="tc-mi-kisiler">
            {st.ds.map((x) => (
              <KisiIsareti
                key={x.id} id={x.id} durum={x.v ? x.v.d : ''} isaret={x.v ? (x.v.d === 'ok' ? '✓' : '✕') : '…'}
                baslik={`${ad(x.id)}: ${x.v ? (x.v.d === 'ok' ? 'onayladı' : 'reddetti') : 'bekleniyor'}`}
              />
            ))}
          </div>
        </Ozellik>
        {siparis && (
          <Ozellik simge="box" ad="Sipariş">
            <button type="button" className="tc-mi-baglanti" onClick={() => ayrintiAc({ tur: 'siparis', id: siparis.id })}>#{siparis.no} {siparis.musteri}</button>
          </Ozellik>
        )}
        {(a.round ?? 1) > 1 && <Ozellik simge="rotate" ad="Gönderim">{a.round}. kez</Ozellik>}
      </dl>
      {a.note && <Bolum baslik="Açıklama"><ZenginMetin metin={a.note} /></Bolum>}
      {st.ds.filter((x) => x.v?.note).map((x) => <p key={x.id} className="tc-mi-oy-notu"><b>{ad(x.id)}:</b> {x.v?.note}</p>)}
      {yetki.yaz && bendenOnayBekliyor(a, ben.id) && (
        <div className="tc-mi-eylemler">
          <Dugme tur="birincil" simge="check" disabled={damga} onClick={onayla}>Onayla</Dugme>
          <Dugme onClick={() => reddetYaz(true)}>Reddet</Dugme>
        </div>
      )}
      {duzenleyebilir(a, yetki, ben.id) && (
        <div className="tc-mi-eylemler">
          {st.s !== 'ok' && (
            <Dugme simge="edit" onClick={() => formAc({ tur: 'onay', duzenle: a.id })}>{st.s === 'no' ? 'Düzenle ve yeniden gönder' : 'Düzenle'}</Dugme>
          )}
          <Dugme tur="tehlike" simge="trash" onClick={() => silinsinYaz(true)}>İsteği sil</Dugme>
        </div>
      )}
      <KaynakBaglantisi cid={a.cid} mid={a.mid} />
      <NotListesi koleksiyon="approvals" id={a.id} />
      <ReddetPenceresi acik={reddet} baslik={a.title} kapat={() => reddetYaz(false)} reddet={(n) => { reddetYaz(false); oyVer(a.id, 'no', n); }} />
      <OnayPenceresi
        acik={silinsin} baslik="İstek silinsin mi?" onayMetni="Sil" tehlikeli vazgec={() => silinsinYaz(false)}
        onayla={() => {
          silinsinYaz(false);
          void yaz.sil(`approvals/${a.id}`).then(() => { bildir('tamam', 'İstek silindi.'); kapat(); }).catch(() => undefined);
        }}
      >
        <p>Onay isteği herkes için kaldırılır.</p>
      </OnayPenceresi>
    </div>
  );
}
