import { useState } from 'react';
import { Dugme, Simge } from '../../../../../ortak/arayuz/index.ts';
import { adimEksigi, LISTE_YANITLARI, type FormAdimi, type FormIcerigi } from '../../../../kalite-merkezi/disari.ts';
import { DegerKutusu, OndalikTuslar } from './TusTakimi.tsx';

// 2196: Kalite Merkezi formu terminalde adım adım: ekranda tek madde ya da alan. Evet/Hayır/UD üç büyük düğme; "Hayır" açıklama
// ister (hazır seçenek ya da not); sayı ekran tuşlarıyla; seçim büyük düğmelerle; tablo satır satır.
const HAYIR_NOTLARI = ['Uygunsuzluk var', 'Yeniden yapıldı', 'Fotoğraf Kalite Merkezi\'ne eklenecek'] as const;

export function FormAdimlari({ adimlar, icerik, degistir, sira, siraYaz, bitir }: {
  adimlar: readonly FormAdimi[]; icerik: FormIcerigi; degistir: (ic: FormIcerigi) => void; sira: number; siraYaz: (n: number) => void; bitir: () => void;
}) {
  const a = adimlar[sira];
  if (!a) return null;
  const eksik = adimEksigi(a, icerik);
  const son = sira === adimlar.length - 1;
  return (
    <div className="tc-kt-form">
      <div className="tc-kt-baslik-satir">
        <span className="tc-ay1-ust-yazi">{a.baslik}</span>
        <small className="tc-ay1-mono tc-ay1-soluk">{sira + 1} / {adimlar.length}</small>
      </div>
      <div className="tc-kt-adimlar" aria-hidden="true">
        {adimlar.map((x, i) => <i key={i} data-durum={i === sira ? 'su' : adimEksigi(x, icerik) ? undefined : (x.tur === 'madde' && icerik.liste[x.anahtar] === 'Hayır' ? 'nok' : 'ok')} />)}
      </div>
      {a.tur === 'madde' ? <Madde a={a} icerik={icerik} degistir={degistir} />
        : a.tur === 'alan' ? <Alan a={a} icerik={icerik} degistir={degistir} />
          : <TabloAdimi a={a} icerik={icerik} degistir={degistir} />}
      <div className="tc-kt-onay">
        <Dugme simge="back" disabled={sira === 0} onClick={() => siraYaz(sira - 1)}>Geri</Dugme>
        {eksik ? <small className="tc-ay1-soluk" role="status">{eksik}</small> : null}
        <span className="tc-kt-bosluk" />
        <Dugme tur="birincil" boyut="ana" simge={son ? 'check' : 'next'} disabled={!!eksik} onClick={() => (son ? bitir() : siraYaz(sira + 1))}>{son ? 'Özete geç' : 'Sonraki'}</Dugme>
      </div>
    </div>
  );
}

function Madde({ a, icerik, degistir }: { a: Extract<FormAdimi, { tur: 'madde' }>; icerik: FormIcerigi; degistir: (ic: FormIcerigi) => void }) {
  const y = icerik.liste[a.anahtar] ?? '';
  const not = icerik.listeNot[a.anahtar] ?? '';
  const yaz = (yanit: string) => degistir({ ...icerik, liste: { ...icerik.liste, [a.anahtar]: yanit } });
  const notYaz = (n: string) => degistir({ ...icerik, listeNot: { ...icerik.listeNot, [a.anahtar]: n } });
  return (
    <>
      <p className="tc-kt-soru">{a.metin}</p>
      <div className="tc-kt-cevaplar" role="radiogroup" aria-label={a.metin}>
        {LISTE_YANITLARI.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={y === c} className="tc-kt-cevap" data-ton={c === 'Evet' ? 'iyi' : c === 'Hayır' ? 'kotu' : undefined} onClick={() => yaz(c)}>
            <Simge ad={c === 'Evet' ? 'check' : c === 'Hayır' ? 'x' : 'minus'} /><b>{c}</b>{c === 'UD' ? <small>uygulanmaz</small> : null}
          </button>
        ))}
      </div>
      {y === 'Hayır' ? (
        <div className="tc-kt-alan">
          <span className="tc-ay1-ust-yazi">"Hayır" açıklaması</span>
          <div className="tc-kt-secmeler">
            {HAYIR_NOTLARI.map((n) => <button key={n} type="button" className="tc-kt-secme" data-ton="kotu" aria-pressed={not === n} onClick={() => notYaz(not === n ? '' : n)}>{n}</button>)}
          </div>
          <textarea className="tc-ay1-kalite-not" rows={2} maxLength={300} aria-label="Hayır açıklaması" value={HAYIR_NOTLARI.includes(not as never) ? '' : not}
            placeholder="ya da yazın" onChange={(e) => notYaz(e.target.value)} />
        </div>
      ) : null}
    </>
  );
}

function Alan({ a, icerik, degistir }: { a: Extract<FormAdimi, { tur: 'alan' }>; icerik: FormIcerigi; degistir: (ic: FormIcerigi) => void }) {
  const v = icerik.veri[a.anahtar];
  const yaz = (d: unknown) => degistir({ ...icerik, veri: { ...icerik.veri, [a.anahtar]: d } });
  const metin = typeof v === 'string' ? v : '';
  const etiket = `${a.alan.etiket}${a.alan.zorunlu ? ' *' : ''}`;
  if (a.alan.tur === 'sayi') {
    return (
      <>
        <p className="tc-kt-soru">{etiket}</p>
        <DegerKutusu etiket={a.alan.etiket} deger={metin} secili />
        <OndalikTuslar etiket={a.alan.etiket} deger={metin} degistir={yaz} />
      </>
    );
  }
  if (a.alan.tur === 'secim' || a.alan.tur === 'isaretler') {
    const coklu = a.alan.tur === 'isaretler';
    const secili: readonly string[] = coklu ? (Array.isArray(v) ? (v as string[]) : []) : metin ? [metin] : [];
    const sec = (s: string) => (coklu ? yaz(secili.includes(s) ? secili.filter((x) => x !== s) : [...secili, s]) : yaz(metin === s ? '' : s));
    return (
      <>
        <p className="tc-kt-soru">{etiket}</p>
        <div className="tc-kt-secmeler tc-kt-secmeler-buyuk" role="group" aria-label={a.alan.etiket}>
          {(a.alan.secenekler ?? []).filter(Boolean).map((s) => <button key={s} type="button" className="tc-kt-secme" aria-pressed={secili.includes(s)} onClick={() => sec(s)}>{s}</button>)}
        </div>
        {coklu ? <small className="tc-ay1-soluk">Birden çok seçilebilir.</small> : null}
      </>
    );
  }
  return (
    <label className="tc-kt-alan">
      <span className="tc-kt-soru">{etiket}</span>
      {a.alan.tur === 'cokSatir' ? (
        <textarea className="tc-ay1-kalite-not" rows={3} maxLength={1000} value={metin} aria-label={a.alan.etiket} onChange={(e) => yaz(e.target.value)} />
      ) : (
        <input className="tc-kt-girdi" type={a.alan.tur === 'tarih' ? 'date' : 'text'} value={metin} aria-label={a.alan.etiket} onChange={(e) => yaz(e.target.value)} />
      )}
    </label>
  );
}

function TabloAdimi({ a, icerik, degistir }: { a: Extract<FormAdimi, { tur: 'tablo' }>; icerik: FormIcerigi; degistir: (ic: FormIcerigi) => void }) {
  const anahtar = String(a.bolum);
  const satirlar = icerik.tablo[anahtar] ?? [{}];
  const [satir, satirYaz] = useState(0);
  const s = satirlar[Math.min(satir, satirlar.length - 1)] ?? {};
  const yaz = (rows: Record<string, string>[]) => degistir({ ...icerik, tablo: { ...icerik.tablo, [anahtar]: rows } });
  const hucre = (ci: number, d: string) => yaz(satirlar.map((x, i) => (i === Math.min(satir, satirlar.length - 1) ? { ...x, [`c${String(ci)}`]: d } : x)));
  return (
    <>
      <div className="tc-kt-baslik-satir">
        <p className="tc-kt-soru">Tablo · satır {Math.min(satir, satirlar.length - 1) + 1} / {satirlar.length}</p>
        <span className="tc-kt-satir-tuslar">
          <Dugme simge="chev-left" aria-label="Önceki satır" disabled={satir <= 0} onClick={() => satirYaz(satir - 1)} />
          <Dugme simge="chev-right" aria-label="Sonraki satır" disabled={satir >= satirlar.length - 1} onClick={() => satirYaz(satir + 1)} />
          <Dugme simge="plus" onClick={() => { yaz([...satirlar, {}]); satirYaz(satirlar.length); }}>Satır ekle</Dugme>
        </span>
      </div>
      <div className="tc-kt-tablo-satir">
        {a.sutunlar.map((sutun, ci) => (
          <label key={sutun} className="tc-kt-alan">
            <span className="tc-ay1-ust-yazi">{sutun}</span>
            <input className="tc-kt-girdi" aria-label={sutun} value={s[`c${String(ci)}`] ?? ''} onChange={(e) => hucre(ci, e.target.value)} />
          </label>
        ))}
      </div>
      <small className="tc-ay1-soluk">Boş satır kaydedilmez.</small>
    </>
  );
}
