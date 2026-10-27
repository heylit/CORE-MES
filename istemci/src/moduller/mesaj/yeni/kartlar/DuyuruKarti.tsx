import { useState } from 'react';
import { Dugme, Simge, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { kisaZaman } from '../bicim.ts';
import { useMesaj } from '../durum.tsx';
import { duyuruBekliyor, kisiAnahtari } from '../kurallar.ts';
import type { Duyuru, Kayit } from '../tipler.ts';
import { IletiMetni } from '../sohbet/IletiMetni.tsx';
import { OkuyanlarPenceresi } from '../sohbet/OkuyanlarPenceresi.tsx';
import { duyuruOkuyanlari, ilkAd } from '../sohbet/yardimci.ts';
import { kutlamaIste } from './kutlama.ts';
import '../sohbet/sohbet.css';

// "Okudum, anladım" yazma işidir; duyurunun sahibi okumaz, okuyan sayısı ve okumayanlar listesi herkese açıktır.
export function OkunduSatiri({ duyuru }: { duyuru: Kayit<Duyuru> }) {
  const { ben, yetki, yaz } = useMesaj();
  const { bildir } = useBildirim();
  const [liste, listeYaz] = useState(false);
  const okuyan = duyuruOkuyanlari(duyuru);
  const benim = duyuru.by === ben.id;

  const okudum = async () => {
    try {
      kutlamaIste();
      await yaz.guncelle(`duyurular/${duyuru.id}`, { ack: { [kisiAnahtari(ben.id)]: ben.id } });
      bildir('tamam', 'Okundu olarak işaretlendi.');
    } catch { /* ileti veri katmanında gösterildi */ }
  };

  return (
    <div className="tc-ms-okundu-satiri">
      {!benim && (duyuruBekliyor(duyuru, ben.id)
        ? (yetki.yaz && <Dugme tur="birincil" simge="check" onClick={() => { void okudum(); }}>Okudum, anladım</Dugme>)
        : <span className="tc-ms-okudu"><Simge ad="check" boyut="k" /> Okudun</span>)}
      <button type="button" className="tc-ms-baglanti-dugme" onClick={() => { listeYaz(true); }}>
        {okuyan.length} kişi okudu{benim ? ', kimler okumadı?' : ''}
      </button>
      {liste && <OkuyanlarPenceresi duyuru={duyuru} kapat={() => { listeYaz(false); }} />}
    </div>
  );
}

// Okunması gereken duyuru (annCard): metin, yazan, zaman, kanal ve okundu satırı.
export function DuyuruKarti({ duyuru }: { duyuru: Kayit<Duyuru> }) {
  const { ad, veri } = useMesaj();
  const kanal = veri.kanallar.find((c) => c.id === duyuru.cid);
  return (
    <article className="tc-ms-duyuru">
      <span className="tc-ms-duyuru-simge"><Simge ad="bell" /></span>
      <div className="tc-ms-duyuru-govde">
        <div className="tc-ms-duyuru-metin"><IletiMetni metin={duyuru.text} /></div>
        <div className="tc-ms-ust-bilgi">
          <span>{ilkAd(ad(duyuru.by))}</span>
          <span>{kisaZaman(duyuru.ts)}</span>
          {kanal && <span>#{kanal.name}</span>}
        </div>
        <OkunduSatiri duyuru={duyuru} />
      </div>
    </article>
  );
}
