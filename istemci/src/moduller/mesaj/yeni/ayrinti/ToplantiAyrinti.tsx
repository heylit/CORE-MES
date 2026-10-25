import { useState } from 'react';
import { Dugme, OnayPenceresi, Rozet, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { useMesaj } from '../durum.tsx';
import { baslamaMetni, toplantiZamani } from '../kurallar.ts';
import { iz, useIsEylemleri } from '../kartlar/eylemler.ts';
import { KatilBaglantisi, KatilimDugmeleri, Katilimcilar } from '../kartlar/ToplantiKarti.tsx';
import { ZenginMetin } from '../kartlar/ZenginMetin.tsx';
import { HATIRLATMALAR } from '../takvim/ToplantiFormu.tsx';
import { duzenleyebilir } from '../yetki.ts';
import { NotListesi } from './Notlar.tsx';
import { Baslik, Bolum, KaynakBaglantisi, Ozellik } from './parcalar.tsx';

// Prototipin meetDetail'i. Google, Outlook ve e-posta daveti yok (208 a); takvim dosyası kalır.
export function ToplantiAyrinti({ id }: { id: string }) {
  const { ben, ad, veri, yetki, yaz, formAc } = useMesaj();
  const { toplantiIcs } = useIsEylemleri();
  const { bildir } = useBildirim();
  const [iptal, iptalYaz] = useState(false);
  const mt = veri.toplantilar.find((t) => t.id === id);
  if (!mt) return <p className="tc-mi-bos-kucuk">Bu toplantı silinmiş.</p>;
  const benim = duzenleyebilir(mt, yetki, ben.id);
  const hatirlatma = (HATIRLATMALAR.find(([v]) => v === (mt.remind ?? 0)) ?? HATIRLATMALAR[0])?.[1];
  return (
    <div className="tc-mi-sayfa">
      <Baslik
        simge="clock" baslik={<h3 className="tc-mi-sayfa-baslik">{mt.title}</h3>}
        alt={mt.cancelled ? <Rozet ton="hata">İptal edildi</Rozet> : <span className="tc-mi-teslim-soon">{baslamaMetni(mt.start)}</span>}
      />
      <KatilBaglantisi toplanti={mt} metin="Toplantıya katıl" />
      <dl className="tc-mi-ozellikler">
        <Ozellik simge="clock" ad="Zaman">{toplantiZamani(mt)}</Ozellik>
        <Ozellik simge="rotate" ad="Süre">{mt.dur ?? 30} dakika</Ozellik>
        {mt.loc && <Ozellik simge="pin" ad="Yer">{mt.loc}</Ozellik>}
        {mt.link && (
          <Ozellik simge="laptop" ad="Bağlantı">
            <a href={mt.link} target="_blank" rel="noopener noreferrer">{mt.link.replace(/^https?:\/\//, '').slice(0, 40)}</a>
          </Ozellik>
        )}
        <Ozellik simge="users" ad="Katılımcılar"><Katilimcilar toplanti={mt} /></Ozellik>
        <Ozellik simge="bell" ad="Hatırlatma">{hatirlatma}</Ozellik>
        <Ozellik simge="user" ad="Düzenleyen">{ad(mt.by)}</Ozellik>
      </dl>
      <KatilimDugmeleri toplanti={mt} />
      {mt.agenda && <Bolum baslik="Gündem"><ZenginMetin metin={mt.agenda} /></Bolum>}
      <Bolum baslik="Takvim">
        <div className="tc-mi-eylemler"><Dugme simge="download" onClick={() => toplantiIcs(mt.id)}>Telefona / takvime ekle (.ics)</Dugme></div>
      </Bolum>
      <KaynakBaglantisi cid={mt.cid} mid={mt.mid} />
      <NotListesi koleksiyon="toplantilar" id={mt.id} baslik="Toplantı notları ve kararlar" />
      {yetki.yaz && (
        <div className="tc-mi-eylemler">
          {benim && !mt.cancelled && (
            <>
              <Dugme simge="edit" onClick={() => formAc({ tur: 'toplanti', duzenle: mt.id })}>Düzenle</Dugme>
              <Dugme tur="tehlike" onClick={() => iptalYaz(true)}>Toplantıyı iptal et</Dugme>
            </>
          )}
          <Dugme simge="clipboard-check" onClick={() => formAc({ tur: 'gorev', ilk: { cid: mt.cid ?? null } })}>Karardan görev çıkar</Dugme>
        </div>
      )}
      <OnayPenceresi
        acik={iptal} baslik="Toplantı iptal edilsin mi?" onayMetni="İptal et" tehlikeli vazgec={() => iptalYaz(false)}
        onayla={() => {
          iptalYaz(false);
          void yaz.guncelle(`toplantilar/${mt.id}`, { cancelled: true, last: iz(ben.id, 'toplantıyı iptal etti') })
            .then(() => bildir('tamam', 'Toplantı iptal edildi.')).catch(() => undefined);
        }}
      >
        <p>Katılımcılar iptali görür.</p>
      </OnayPenceresi>
    </div>
  );
}
