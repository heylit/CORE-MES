import { useState } from 'react';
import type { TezgahAyrintisiCevabi, TezgahTuru } from '#paylasilan/sozlesme/tezgah-baglantisi.ts';
import { Dugme, Secim } from '../../ortak/arayuz/index.ts';
import { Cizim, EKSEN_ROLU, TUR_ADI, TURLER } from './Cizim.tsx';
import { ZamanCizgisi } from './Egri.tsx';
import { DURUM, YOK, dakikaMetni, degerAdi, degerMetni } from './gosterim.ts';
import { EKSENLER, anDegeri, bosluktaMi, eksenleriBul, oranla, oynatmaAnlari } from './simulasyon.ts';
import type { Eksen } from './simulasyon.ts';

type Ayrinti = TezgahAyrintisiCevabi;

const alanDegeri = (a: Ayrinti, tur: string, bilesen?: string): string | null =>
  a.alanlar.find((x) => x.tur === tur && (bilesen === undefined || x.bilesen === bilesen))?.deger ?? null;

// Canlı tezgâh görünümü (kart 3659-2): kayıtlı eksen konumlarından çizilen şematik gösterim ve son bir saatin geri oynatması.
// Yalnız gösterir; üretim kaydına hiçbir şey işlenmez. Çizim şematiktir ve seçilen tezgâh türüne göre yapılır; ölçek son saatteki hareket aralığıdır.
export function Simulasyon({ a, turSec, turKaydediliyor = false }: { a: Ayrinti; turSec: (tur: TezgahTuru | null) => void; turKaydediliyor?: boolean }) {
  const tur = a.tezgahTuru;
  const seriler = eksenleriBul(a.alanlar);
  const anlar = oynatmaAnlari(seriler);
  const [secim, secimYaz] = useState<number | null>(null);
  if (seriler.length === 0) {
    return <p role="status" className="tc-tzb-not">Eksen konumu yok: bu tezgâh eksen konumu göndermiyor.</p>;
  }
  const gecmis = secim !== null && anlar.length > 0;
  const an = gecmis ? anlar[Math.min(secim, anlar.length - 1)] ?? null : null;
  const anIndeks = an === null ? -1 : anlar.indexOf(an);
  const bosluk = an !== null && bosluktaMi(a.bosluklar, an, anIndeks > 0 ? anlar[anIndeks - 1] ?? null : null);
  const eski = !gecmis && Date.now() - new Date(a.okundu).getTime() > 2 * a.aralikSaniye * 1000;
  const deger = (e: Eksen): number | null => {
    const s = seriler.find((x) => x.eksen === e);
    if (s === undefined || bosluk) return null;
    return an === null ? s.simdi : anDegeri(s, an);
  };
  const oran = (e: Eksen): number => {
    const s = seriler.find((x) => x.eksen === e);
    return s === undefined ? 0.5 : oranla(deger(e), s);
  };
  const birim = (e: Eksen): string | null => seriler.find((x) => x.eksen === e)?.birim ?? null;
  const hiz = alanDegeri(a, 'SpindleSpeed') ?? alanDegeri(a, 'RotaryVelocity');
  const donuyor = !gecmis && hiz !== null && Number(hiz) > 0;
  const rol = tur === null ? null : EKSEN_ROLU[tur];
  return (
    <div className="tc-sim">
      <div className="tc-sim-tur">
        <Secim etiket="Tezgâh türü" value={tur ?? ''} bosSecenek="Seçilmedi" disabled={turKaydediliyor}
          secenekler={TURLER.map((t) => ({ deger: t, baslik: TUR_ADI[t] }))}
          onChange={(e) => turSec(e.target.value === '' ? null : (TURLER.find((t) => t === e.target.value) ?? null))} />
      </div>
      {tur === null ? (
        <p role="status" className="tc-tzb-not tc-sim-uyari">Tezgâh türü seçilmedi, bu yüzden çizim yok; yalnız konum değerleri gösterilir. Türü seçince şema çizilir.</p>
      ) : (
        <svg className="tc-sim-resim" data-durum={a.durum} data-eski={(eski || bosluk) || undefined} viewBox="0 0 200 140" role="img" aria-label={`Tezgâh şeması, ${TUR_ADI[tur]}: ${DURUM[a.durum].metin}${gecmis ? `, geçmiş görünüm${bosluk ? ', veri yok' : ''}` : eski ? ', eski okuma, konumlar güncel değil' : ', canlı'}`} focusable="false">
          <Cizim tur={tur} girdi={{ x: oran('X'), y: oran('Y'), z: oran('Z'), donuyor }} />
        </svg>
      )}
      {rol !== null && <p className="tc-tzb-not">Çizimde: {EKSENLER.filter((e) => !(tur === 'torna' && e === 'Y')).map((e) => `${e} = ${rol[e]}`).join(', ')}.</p>}
      <dl className="tc-sim-okuma">
        {EKSENLER.filter((e) => !(tur === 'torna' && e === 'Y')).map((e) => (
          <div key={e} className="tc-sim-satir">
            <dt>{e} konumu{rol === null ? '' : ` · ${rol[e]}`}{gecmis ? ' (ort.)' : ''}</dt>
            <dd className="tc-tzb-mono">{seriler.some((s) => s.eksen === e) ? degerMetni(deger(e) === null ? null : String(deger(e)), birim(e)) : YOK}</dd>
          </div>
        ))}
        <div className="tc-sim-satir"><dt>İş mili</dt><dd className="tc-tzb-mono">{gecmis ? YOK : degerMetni(hiz, 'REVOLUTION/MINUTE')}</dd></div>
        <div className="tc-sim-satir"><dt>Çalışma</dt><dd>{degerAdi('Execution', alanDegeri(a, 'Execution')) ?? YOK}</dd></div>
        <div className="tc-sim-satir"><dt>Program</dt><dd className="tc-tzb-mono">{alanDegeri(a, 'Program') ?? YOK}</dd></div>
      </dl>
      {anlar.length > 1 && (
        <div className="tc-sim-gecmis">
          <ZamanCizgisi basi={a.egriBasi} sonu={a.egriSonu} bosluklar={a.bosluklar} />
          <label className="tc-sim-cubuk">
            <span className="tc-tzb-alt">{an === null ? (eski ? 'Eski okuma: konumlar güncel değil' : 'Canlı') : bosluk ? `Geçmiş görünüm ${dakikaMetni(an)} · veri yok` : `Geçmiş görünüm ${dakikaMetni(an)} · dakikalık ortalama`}</span>
            <input type="range" min={0} max={anlar.length - 1} value={secim ?? anlar.length - 1} aria-label="Geçmiş görünüm zamanı" aria-valuetext={an === null ? 'Canlı' : dakikaMetni(an)}
              onChange={(e) => secimYaz(Number(e.target.value) >= anlar.length - 1 ? null : Number(e.target.value))} />
          </label>
          <span className="tc-sim-uclar tc-tzb-alt"><span>{dakikaMetni(anlar[0] ?? '')}</span><span>şimdi</span></span>
          {an !== null && <Dugme onClick={() => secimYaz(null)}>Canlıya dön</Dugme>}
        </div>
      )}
      <p className="tc-tzb-not">
        Yalnız gösterir. Çizim şematiktir ve seçilen türe göredir; ölçek son saatteki hareket aralığıdır (hareket yoksa orta konum), gerçek strok değildir. Geçmiş görünüm dakikalık ortalama konumlarla
        yapılır; veri boşluğu olan dakikada konum yazılmaz. İş mili hızı yalnız canlıda gösterilir.
      </p>
    </div>
  );
}
