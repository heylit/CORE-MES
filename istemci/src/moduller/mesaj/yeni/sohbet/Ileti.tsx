import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Rozet, Simge } from '../../../../ortak/arayuz/index.ts';
import { boyutEtiketi, saatDakika, tamTarih } from '../bicim.ts';
import { useMesaj } from '../durum.tsx';
import { GorevSatiri, OnayKarti, ToplantiKarti } from '../kartlar/index.ts';
import { OkunduSatiri } from '../kartlar/DuyuruKarti.tsx';
import { duzMetin, yalnizEmoji } from '../kurallar.ts';
import { KisiRozeti } from '../ortak/index.ts';
import { useEkAdresi } from '../veri.ts';
import type { EkBilgisi, Ileti as IletiTipi, Kayit } from '../tipler.ts';
import { IletiMetni } from './IletiMetni.tsx';
import { KURAL_ADLARI, okuyanlar, tepkiOzetleri } from './yardimci.ts';

export interface IletiOlaylari {
  tepki: (ileti: Kayit<IletiTipi>, anahtar: string) => void;
  yanitla: (ileti: Kayit<IletiTipi>) => void;
  menu: (ileti: Kayit<IletiTipi>) => void;
  bilgi: (ileti: Kayit<IletiTipi>) => void;
  git: (iletiId: string) => void;
  duzenlemeKaydet: (metin: string) => void;
  duzenlemeBirak: () => void;
}

interface Ozellikler {
  ileti: Kayit<IletiTipi>;
  kanal: string;
  devam: boolean;
  duzenleniyor: string | null;
  olaylar: IletiOlaylari;
}

const UZUN_BASMA_MS = 450;
const KAYMA_ESIGI = 55;

function Ek({ ek }: { ek: EkBilgisi }) {
  const adres = useEkAdresi(ek);
  if (!adres) return null;
  if (/^image\//.test(ek.type || '')) {
    return <a className="tc-ms-ek-gorsel" href={adres} target="_blank" rel="noopener noreferrer"><img src={adres} alt={ek.name || 'Görsel'} loading="lazy" /></a>;
  }
  return (
    <a className="tc-ms-ek" href={adres} target="_blank" rel="noopener noreferrer">
      <Simge ad="file" boyut="b" />
      <span><b>{ek.name || 'Dosya'}</b><small>{boyutEtiketi(ek.size)}</small></span>
    </a>
  );
}

function Duzenleme({ ilk, olaylar }: { ilk: string; olaylar: IletiOlaylari }) {
  const [metin, metinYaz] = useState(ilk);
  const tus = (o: KeyboardEvent<HTMLTextAreaElement>) => {
    if (o.key === 'Enter' && !o.shiftKey && !o.nativeEvent.isComposing) { o.preventDefault(); olaylar.duzenlemeKaydet(metin); }
    else if (o.key === 'Escape') { o.preventDefault(); olaylar.duzenlemeBirak(); }
  };
  return (
    <div className="tc-ms-duzenleme">
      <textarea
        className="tc-ms-duzenleme-alan" rows={2} aria-label="Mesajı düzenle" value={metin} autoFocus
        onChange={(o) => { metinYaz(o.target.value); }} onKeyDown={tus}
        onFocus={(o) => { const n = o.target.value.length; o.target.setSelectionRange(n, n); }}
      />
      <div className="tc-ms-duzenleme-cubugu">
        <span>Esc vazgeç, Enter kaydet</span>
        <button type="button" className="tc-ms-kucuk-dugme" onClick={olaylar.duzenlemeBirak}>Vazgeç</button>
        <button type="button" className="tc-ms-kucuk-dugme tc-ms-kucuk-birincil" onClick={() => { olaylar.duzenlemeKaydet(metin); }}>Kaydet</button>
      </div>
    </div>
  );
}

// Tek ileti (msgHTML): yazar, alıntı, metin, gömülü kart, ek, duyuru okundu satırı, zaman ve okundu işareti, tepkiler,
// araç düğmeleri. Dokunmatikte uzun basma menüyü açar, sağa kaydırma yanıtlar.
export function Ileti({ ileti: m, kanal, devam, duzenleniyor, olaylar }: Ozellikler) {
  const { ben, ad, veri, yetki } = useMesaj();
  const benim = m.by === ben.id;
  const sistem = m.kind === 'system' && !m.by;
  const duyuru = m.kind === 'ann' ? veri.duyurular.find((d) => d.id === m.ref) : undefined;
  const duzenlemede = duzenleniyor === m.id;
  const bahis = !benim && !m.deleted && ((m.mentions ?? []).includes(ben.id) || Boolean(m.everyone));
  const kartli = (m.kind === 'approval' || m.kind === 'task' || m.kind === 'meeting') && !m.text;

  const sinif = ['tc-ms-ileti'];
  if (benim) sinif.push('tc-ms-ileti-ben');
  if (devam) sinif.push('tc-ms-ileti-devam');
  if (m.kind === 'auto') sinif.push('tc-ms-ileti-oto');
  if (duyuru && !m.deleted) sinif.push('tc-ms-ileti-duyuru');
  if (sistem) sinif.push('tc-ms-ileti-sistem');
  if (bahis) sinif.push('tc-ms-ileti-bahis');
  if (kartli) sinif.push('tc-ms-ileti-kartli');

  const basma = useRef<{ zamanlayici: number; x: number; y: number } | null>(null);
  const [kayiyor, kayiyorYaz] = useState(false);
  const etkilesimDisi = (o: { target: EventTarget }) => (o.target as Element).closest('button,a,textarea,input,select') !== null;
  const bas = (o: PointerEvent) => {
    if (o.pointerType === 'mouse' || etkilesimDisi(o)) return;
    const zamanlayici = window.setTimeout(() => { basma.current = null; olaylar.menu(m); }, UZUN_BASMA_MS);
    basma.current = { zamanlayici, x: o.clientX, y: o.clientY };
  };
  const kay = (o: PointerEvent) => {
    const b = basma.current;
    if (!b) return;
    const dx = o.clientX - b.x;
    if (Math.hypot(dx, o.clientY - b.y) > 10) window.clearTimeout(b.zamanlayici);
    kayiyorYaz(dx > KAYMA_ESIGI && Math.abs(o.clientY - b.y) < 20);
  };
  const birak = () => {
    const b = basma.current;
    if (b) window.clearTimeout(b.zamanlayici);
    basma.current = null;
    if (kayiyor && yetki.yaz) olaylar.yanitla(m);
    kayiyorYaz(false);
  };

  const etiketler = (
    <>
      {duyuru && <Rozet ton="uyari">Duyuru</Rozet>}
      {m.kind === 'auto' && <Rozet ton="bilgi">{KURAL_ADLARI[m.rule ?? ''] ?? 'Kural'}</Rozet>}
    </>
  );
  const etiketVar = Boolean(duyuru) || m.kind === 'auto';

  let govde;
  if (m.deleted) govde = <div className="tc-ms-metin tc-ms-silindi">🚫 Bu mesaj silindi.</div>;
  else if (duzenlemede) govde = <Duzenleme ilk={duzMetin(m.text ?? '', ad)} olaylar={olaylar} />;
  else {
    const onay = m.kind === 'approval' ? veri.onaylar.find((a) => a.id === m.ref) : undefined;
    const gorev = m.kind === 'task' ? veri.gorevler.find((t) => t.id === m.ref) : undefined;
    const toplanti = m.kind === 'meeting' ? veri.toplantilar.find((t) => t.id === m.ref) : undefined;
    govde = (
      <>
        {m.replyTo && (
          <button type="button" className="tc-ms-alinti" onClick={() => { olaylar.git(m.replyTo!.id); }}>
            <b>{m.replyTo.by === ben.id ? 'Sen' : ad(m.replyTo.by)}</b>
            <span>{duzMetin(m.replyTo.text || '', ad).replace(/\*\*/g, '').slice(0, 140)}</span>
          </button>
        )}
        {m.text && <div className={`tc-ms-metin${yalnizEmoji(m.text) ? ' tc-ms-metin-buyuk' : ''}`}><IletiMetni metin={m.text} /></div>}
        {m.kind === 'approval' && (onay ? <OnayKarti onay={onay} iletide /> : <div className="tc-ms-metin tc-ms-silindi">Onay isteği kaldırılmış.</div>)}
        {m.kind === 'task' && (gorev ? <div className="tc-ms-gomulu-gorev"><GorevSatiri gorev={gorev} /></div> : <div className="tc-ms-metin tc-ms-silindi">Görev kaldırılmış.</div>)}
        {m.kind === 'meeting' && (toplanti ? <ToplantiKarti toplanti={toplanti} iletide /> : <div className="tc-ms-metin tc-ms-silindi">Toplantı kaldırılmış.</div>)}
        {m.att && <Ek ek={m.att} />}
        {duyuru && <OkunduSatiri duyuru={duyuru} />}
      </>
    );
  }

  const okuyanSayisi = benim && !m.deleted ? okuyanlar(m, kanal, veri.okuma, ben.id).length : 0;
  const tepkiler = m.deleted ? [] : tepkiOzetleri(m, ben.id);
  const kisiAdi = (u: string) => (u === ben.id ? 'Sen' : ad(u));

  return (
    <article
      className={sinif.join(' ')} id={`ileti-${m.id}`} data-ileti={m.id}
      onPointerDown={bas} onPointerMove={kay} onPointerUp={birak} onPointerCancel={birak} onPointerLeave={birak}
      onContextMenu={(o) => { if ((o.target as Element).closest('a,textarea')) return; o.preventDefault(); olaylar.menu(m); }}
    >
      {!benim && (
        <div className="tc-ms-oluk">
          {devam ? null : sistem ? <span className="tc-ms-sistem-simge"><Simge ad="home" /></span> : <KisiRozeti id={m.by} />}
        </div>
      )}
      <div className={`tc-ms-baloncuk-kabi${kayiyor ? ' tc-ms-kayiyor' : ''}`}>
        <div className="tc-ms-baloncuk">
          {!devam && !benim && <div className="tc-ms-yazar"><span>{sistem ? 'Mesaj' : ad(m.by)}</span>{etiketler}</div>}
          {(devam || benim) && etiketVar && <div className="tc-ms-yazar">{etiketler}</div>}
          {govde}
          <span className="tc-ms-zaman-bilgisi">
            {m.scheduled && <span title="Zamanlanmış" aria-label="Zamanlanmış"><Simge ad="clock" boyut="k" /></span>}
            {m.edited && !m.deleted ? 'düzenlendi ' : ''}
            <time title={tamTarih(m.ts)}>{saatDakika(m.ts)}</time>
            {benim && !m.deleted && (
              <button
                type="button" className={`tc-ms-okundu-isareti${okuyanSayisi > 0 ? ' tc-ms-okundu-isareti-okundu' : ''}`}
                aria-label={okuyanSayisi > 0 ? `${okuyanSayisi} kişi okudu` : 'Gönderildi'} title={okuyanSayisi > 0 ? `${okuyanSayisi} kişi okudu` : 'Gönderildi'}
                onClick={() => { olaylar.bilgi(m); }}
              >
                <Simge ad="check" boyut="k" />{okuyanSayisi > 0 && <Simge ad="check" boyut="k" />}
              </button>
            )}
          </span>
        </div>
        {tepkiler.length > 0 && (
          <div className="tc-ms-tepkiler">
            {tepkiler.map((t) => (
              <button
                key={t.anahtar} type="button" disabled={!yetki.yaz} data-tepki={t.anahtar}
                className={`tc-ms-tepki${t.kurumsal && t.etiket ? ' tc-ms-tepki-kurumsal' : ''}${t.benim ? ' tc-ms-tepki-benim' : ''}`}
                title={`${t.etiket ? `${t.etiket}: ` : ''}${t.kisiler.map(kisiAdi).join(', ')}`}
                aria-pressed={t.benim}
                onClick={() => { olaylar.tepki(m, t.anahtar); }}
              >
                <span aria-hidden="true">{t.emoji}</span>
                {t.kurumsal && t.etiket && <span className="tc-ms-tepki-etiket">{t.etiket}</span>}
                <b>{t.kisiler.length}</b>
              </button>
            ))}
          </div>
        )}
      </div>
      {!m.deleted && !sistem && !duzenlemede && (
        <div className="tc-ms-araclar">
          {yetki.yaz && <button type="button" className="tc-ms-arac" title="Tamam" aria-label="Tamam tepkisi" onClick={() => { olaylar.tepki(m, 'c_tamam'); }}>✅</button>}
          {yetki.yaz && <button type="button" className="tc-ms-arac" title="Yanıtla" aria-label="Yanıtla" onClick={() => { olaylar.yanitla(m); }}><Simge ad="chev-left" /></button>}
          <button type="button" className="tc-ms-arac" title="Diğer" aria-label="Diğer işlemler" onClick={() => { olaylar.menu(m); }}><Simge ad="more" /></button>
        </div>
      )}
    </article>
  );
}
