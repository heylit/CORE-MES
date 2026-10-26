import { useState, type ReactNode } from 'react';
import { Dugme, Sekmeler, Simge } from '../../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../../ortak/tasarim/simgeler.ts';
import { Sihirbaz, type SihirbazAcilisi, type SihirbazTanimi } from './Sihirbaz.tsx';
import './sade.css';

// Eski planlama yan sayfalarının sade kabuğu (zz24-sade.betik sdSayfa; tasarım koruma): başlık ve açıklama, üç sekme. Özet (durum kutuları,
// "Şimdi ne yapmalı", Veri gir kartları, "Bu sayfa nasıl çalışır?"), Veri gir (form kartları ya da açık sihirbaz), Tüm ayrıntılar (asıl
// sayfa, aynen). Formu olmayan (yetkisi olmayan) kişide Veri gir sekmesi yoktur.

export type SadeTon = 'tamam' | 'uyari' | 'hata';
export interface SadeKutu { simge: SimgeAdi; ad: string; deger: string | null; not?: string; ton?: SadeTon }
export interface SadeIs {
  simge: SimgeAdi; metin: string; neden?: string; ton?: SadeTon;
  dugme?: { ad: string; simge: SimgeAdi; yap: () => void; birincil?: boolean };
}
export type SadeSekme = 'ozet' | 'gir' | 'tum';
// Özetteki işlerin düğmeleri: bir formu (gerekirse dolu ve belli adımdan) açar ya da sekmeye geçer.
export interface SadeGecis { form: (id: string, acilis?: SihirbazAcilisi) => void; sekme: (s: SadeSekme) => void }

export interface SadeTanimi {
  ad: string; simge: SimgeAdi; ne: string;
  kutular: readonly SadeKutu[];
  yapilacak: (g: SadeGecis) => readonly SadeIs[];
  nasil: readonly string[];
  // Kişinin açabildiği formlar (yetki çağıranda süzülür).
  formlar: readonly SihirbazTanimi[];
  tum: () => ReactNode;
  // Plan var ve bu sayfadaki veriden sonra kurulmamış (eski S.plan && !planGuncel()); sayfa verir, kabuk hesaplamaz.
  planEski?: boolean;
  // Planı iyileştirme yetkisi (eski plan.yaz).
  iyilestirYetkisi?: boolean;
}

const OZET_EN_COK = 6;

function Kutu({ k }: { k: SadeKutu }) {
  return (
    <div className="tc-sade-kutu" data-ton={k.ton}>
      <span className="tc-sade-kutu-ad"><Simge ad={k.simge} boyut="k" />{k.ad}</span>
      <b className="tc-sade-kutu-d">{k.deger ?? '—'}</b>
      {k.not && <span className="tc-sade-kutu-not">{k.not}</span>}
    </div>
  );
}

function Is({ x }: { x: SadeIs }) {
  return (
    <li className="tc-sade-is" data-ton={x.ton}>
      <span className="tc-sade-is-sm"><Simge ad={x.simge} boyut="k" /></span>
      <span className="tc-sade-is-m"><b>{x.metin}</b>{x.neden && <small>{x.neden}</small>}</span>
      {x.dugme && <Dugme tur={x.dugme.birincil ? 'birincil' : 'ikincil'} simge={x.dugme.simge} onClick={x.dugme.yap}>{x.dugme.ad}</Dugme>}
    </li>
  );
}

function FormKarti({ f, ac }: { f: SihirbazTanimi; ac: () => void }) {
  return (
    <button type="button" className="tc-sade-fkart" onClick={ac}>
      <span className="tc-sade-is-sm"><Simge ad={f.simge} boyut="k" /></span>
      <span className="tc-sade-is-m"><b>{f.ad}</b><small>{f.ne}</small></span>
      <Simge ad="chev-right" boyut="k" />
    </button>
  );
}

export const PLAN_ESKI_NOTU = 'Plan bu değişikliği henüz içermiyor. Planı iyileştir deyince yeni plan kurulur; Planlama stüdyosunda inceleyip onaya gönderirsiniz.';
export const MOTOR_KAPALI_NOTU = 'Plan motoru bu ekrana bağlanınca açılır.';

// Kayıttan sonraki kart (eski sdSonKart); ısı haritası açılımında da kullanılır. Plan eskiyse eski not ve yetkiliye "Planı iyileştir":
// motor isteyen düğme yerinde görünür ama pasiftir (357 b).
export function SonKart({ metin, kapat, planEski = false, iyilestirYetkisi = false }: {
  metin: string; kapat: () => void; planEski?: boolean; iyilestirYetkisi?: boolean;
}) {
  const dugme = planEski && iyilestirYetkisi;
  return (
    <div className="tc-sade-son" role="status">
      <span className="tc-sade-is-sm"><Simge ad="check" boyut="k" /></span>
      <span className="tc-sade-is-m"><b>{metin}</b><small>{planEski ? PLAN_ESKI_NOTU : 'Kaydedildi.'}</small>{dugme && <small>{MOTOR_KAPALI_NOTU}</small>}</span>
      <span className="tc-sade-son-dugmeler">
        {dugme && <Dugme tur="birincil" simge="play" disabled title={MOTOR_KAPALI_NOTU}>Planı iyileştir</Dugme>}
        <Dugme simge="x" onClick={kapat} aria-label="Kapat" />
      </span>
    </div>
  );
}

export function SadeSayfa({ tanim }: { tanim: SadeTanimi }) {
  const [sek, sekYaz] = useState<SadeSekme>('ozet');
  const [formId, formIdYaz] = useState<string | null>(null);
  // Her açılış sihirbazı baştan kurar (aynı form başka değerle yeniden açılabilir).
  const [acilis, acilisYaz] = useState<{ no: number; deger?: SihirbazAcilisi }>({ no: 0 });
  const [son, sonYaz] = useState<string | null>(null);
  const { formlar } = tanim;
  const secili: SadeSekme = sek === 'gir' && !formlar.length ? 'ozet' : sek;
  const sekmeyeGec = (s: SadeSekme): void => { sekYaz(s); if (s !== 'gir') formIdYaz(null); };
  const formAc = (id: string, deger?: SihirbazAcilisi): void => {
    if (!formlar.some((f) => f.id === id)) return;
    sekYaz('gir'); formIdYaz(id); acilisYaz((a) => ({ no: a.no + 1, deger })); sonYaz(null);
  };
  const acik = secili === 'gir' ? formlar.find((f) => f.id === formId) ?? null : null;
  const sekmeler = [
    { anahtar: 'ozet' as const, baslik: 'Özet', simge: 'eye' as const },
    ...(formlar.length ? [{ anahtar: 'gir' as const, baslik: 'Veri gir', simge: 'plus' as const }] : []),
    { anahtar: 'tum' as const, baslik: 'Tüm ayrıntılar', simge: 'list' as const },
  ];
  const sonKart = son !== null && <SonKart metin={son} kapat={() => { sonYaz(null); }} planEski={tanim.planEski} iyilestirYetkisi={tanim.iyilestirYetkisi} />;
  const formKartlari = <div className="tc-sade-formlar">{formlar.map((f) => <FormKarti key={f.id} f={f} ac={() => { formAc(f.id); }} />)}</div>;

  let govde: ReactNode;
  if (secili === 'tum') govde = tanim.tum();
  else if (acik) {
    govde = <Sihirbaz key={`${acik.id}-${acilis.no}`} tanim={acik} acilis={acilis.deger} vazgec={() => { formIdYaz(null); }} bitti={(m) => { formIdYaz(null); sonYaz(m); }} />;
  } else if (secili === 'gir') {
    govde = (
      <>
        {sonKart}
        <section className="tc-sade-bolum"><h3 className="tc-sade-bas"><Simge ad="plus" boyut="k" />Ne girmek istiyorsunuz?</h3>{formKartlari}</section>
      </>
    );
  } else {
    const isler = tanim.yapilacak({ form: formAc, sekme: sekmeyeGec });
    govde = (
      <>
        {sonKart}
        <section className="tc-sade-bolum" aria-label="Durum"><div className="tc-sade-kutular">{tanim.kutular.map((k) => <Kutu key={k.ad} k={k} />)}</div></section>
        <section className="tc-sade-bolum" aria-label="Şimdi ne yapmalı">
          <h3 className="tc-sade-bas"><Simge ad="target" boyut="k" />Şimdi ne yapmalı</h3>
          {isler.length
            ? <ul className="tc-sade-isler">{isler.slice(0, OZET_EN_COK).map((x) => <Is key={x.metin} x={x} />)}</ul>
            : <p className="tc-sade-bos"><Simge ad="check" boyut="k" />Şu an bu sayfada yapılacak bir şey yok.</p>}
        </section>
        {formlar.length > 0 && (
          <section className="tc-sade-bolum" aria-label="Veri gir"><h3 className="tc-sade-bas"><Simge ad="plus" boyut="k" />Veri gir</h3>{formKartlari}</section>
        )}
        {tanim.nasil.length > 0 && (
          <details className="tc-sade-nasil">
            <summary><Simge ad="help" boyut="k" />Bu sayfa nasıl çalışır?</summary>
            <ul>{tanim.nasil.map((m) => <li key={m}>{m}</li>)}</ul>
          </details>
        )}
      </>
    );
  }
  return (
    <div className="tc-sade">
      <header className="tc-sade-ust">
        <div className="tc-sade-baslik">
          <h2><Simge ad={tanim.simge} />{tanim.ad}</h2>
          <p>{tanim.ne}</p>
        </div>
        <Sekmeler etiket="Görünüm" sekmeler={sekmeler} secili={secili} sec={sekmeyeGec} />
      </header>
      <div className="tc-sade-govde" data-sek={secili}>{govde}</div>
    </div>
  );
}
