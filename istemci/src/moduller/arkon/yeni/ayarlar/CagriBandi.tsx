import { useEffect, useRef, useState } from 'react';
import { cagridanArizaAc } from '../../../../../../arkon/web/src/data/ariza-ustlenme.ts';
import { CAGRI_EKIPLERIM_YENILEME_MS, type CagriEkiplerim } from '../../../../../../arkon/web/src/data/cagri-ekiplerim.ts';
import { Dugme } from '../../../../ortak/arayuz/index.ts';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import { bip } from '../cekirdek/ses.ts';
import { yerel } from '../cekirdek/yerel.ts';
import { useArkon, useIleti } from '../veri/baglam.ts';
import type { Ileti } from '../veri/depo.ts';
import { cagriBanaGelir, cagriCikar, cagriEkle, cagriMi, tazeCagrilar, yanitsizDakika, type Cagri } from './kurallar.ts';

// Başka istasyondan gelen çağrılar (giris-ayarlar-spc.ts CallBanner): kök her sayfanın altında çizer. Kime gideceğini TMI bildirim
// yönlendirmesi söyler (cagri-ekiplerim); üstlenen kişi kayda ve bakım çağrısında arıza kaydına yazılır.

const saatDakika = (t: number): string => new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

export function CagriBandi({ sayfa }: { sayfa: string }) {
  const { depo, kisi, yetkiVar } = useArkon();
  const [liste, listeYaz] = useState<Cagri[]>([]);

  // Yönlendirme ref'te tutulur: liste yenilenince ileti dinleyicisi yeniden kurulmaz. Kişi değişince yeniden okunur.
  const ekiplerim = useRef<CagriEkiplerim>(null);
  const kisiId = kisi?.id;
  useEffect(() => {
    let bitti = false;
    ekiplerim.current = null;
    const oku = () => { depo.Server.cagriEkiplerim().then((l) => { if (!bitti) ekiplerim.current = l; }, () => undefined); };
    oku();
    const t = setInterval(oku, CAGRI_EKIPLERIM_YENILEME_MS);
    return () => { bitti = true; clearInterval(t); };
  }, [depo, kisiId]);

  const alici = useRef({ ustlenebilir: false, rol: kisi?.role ?? null, sayfa });
  alici.current = { ustlenebilir: yetkiVar('prod.ack'), rol: kisi?.role ?? null, sayfa };
  const [dinleyici] = useState(() => (m: Ileti) => {
    if (cagriMi(m)) {
      const a = alici.current;
      if (cagriBanaGelir(m, { ...a, istasyon: yerel.oku<string>('station'), ekiplerim: ekiplerim.current })) {
        bip('call');
        listeYaz((l) => cagriEkle(l, m));
      }
    }
    if (m.type === 'call-ack' || m.type === 'call-done') listeYaz((l) => cagriCikar(l, m['t0']));
  });
  useIleti(dinleyici);

  useEffect(() => {
    if (!liste.length) return undefined;
    const t = setTimeout(() => listeYaz((l) => tazeCagrilar(l, Date.now())), 30000);
    return () => clearTimeout(t);
  }, [liste]);

  if (!liste.length) return null;
  const ad = kisi?.name ?? 'Operatör';
  const ustlen = async (m: Cagri) => {
    depo.Bus.send({ type: 'call-ack', machine: m.machine, t0: m.t0, who: ad });
    listeYaz((l) => cagriCikar(l, m.t0));
    void depo.Log.add('calls', { machine: m.machine, wc: m.wc || null, callId: String(m.t0), team: m.k, phase: 'ack' });
    if (m.k === 'bakim' && yetkiVar('maint.work')) {
      await cagridanArizaAc(
        { machine: m.machine ?? '', mc: m.mc ?? null, wc: m.wc ?? null, t0: m.t0, by: m.by ?? '', note: m.note ?? null, orderNo: m.orderNo ?? null },
        ad, Date.now(),
        { get: (id) => depo.DB.get('maint', id), put: (doc) => depo.DB.put('maint', doc), send: (x) => depo.Bus.send(x), yerel: (x) => depo.Bus.yerel(x) },
      );
    }
  };
  return (
    <div className="tc-ay6-bant" role="region" aria-label="Açık çağrılar">
      {liste.map((m) => (
        <div key={m.t0} className={`tc-ay6-cagri${m.esc ? ' tc-ay6-yukseltildi' : ''}`} role="alert">
          <span className="tc-ay6-cagri-simge" aria-hidden="true"><Simge ad="bell" /></span>
          <div className="tc-ay6-metin">
            <b>{m.machine} · {m.l}{m.esc ? ' · YÜKSELTİLDİ' : ''}</b>
            <small>
              {m.by} · {saatDakika(m.t0)}{m.note ? ` · ${m.note}` : ''}{m.esc ? ` · ${yanitsizDakika(m.t0, Date.now())} dk yanıtsız` : ''}
            </small>
          </div>
          <Dugme tur="birincil" onClick={() => { void ustlen(m); }}>Üstlen</Dugme>
          <Dugme simge="x" aria-label="Kapat" onClick={() => listeYaz((l) => cagriCikar(l, m.t0))} />
        </div>
      ))}
    </div>
  );
}
