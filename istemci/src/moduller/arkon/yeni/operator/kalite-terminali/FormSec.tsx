import { useState } from 'react';
import { Dugme, Simge } from '../../../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../../../ortak/veri/api.ts';
import {
  bosIcerik, formAdimlari, terminalFormEksikleri, terminalFormSonucu, useTerminalFormlari,
  type FormIcerigi, type FormKaydi, type TerminalFormu,
} from '../../../../kalite-merkezi/disari.ts';
import { FormAdimlari } from './FormAdimlari.tsx';
import { taslakIcerigi } from './kurallar.ts';

// 2196, 2196-2 a: terminalde kalite formu. Liste yalnız "terminalde doldurulur" işaretli şablonlardır; kişinin taslağı sürer.
// Kayıt Kalite Merkezi'nindir ("Onay bekliyor" ile gider, onay Kalite Merkezi'nde ya da bu terminalin kuyruğunda verilir).
interface Acik { f: TerminalFormu; icerik: FormIcerigi; onceki: FormKaydi | null; sira: number; ozet: boolean }

export function FormSec({ bolum, soyle }: { bolum: string; soyle: (metin: string, ton: 'ok' | 'stop') => void }) {
  const t = useTerminalFormlari();
  const [acik, acikYaz] = useState<Acik | null>(null);
  const [gidiyor, gidiyorYaz] = useState(false);

  if (acik) {
    const adimlar = formAdimlari(acik.f.bolumler);
    const baglam = { dolduran: t.dolduran, bolum };
    const kaydet = async (durum: 'Taslak' | 'Onay bekliyor') => {
      gidiyorYaz(true);
      try {
        await t.kaydet(acik.f, acik.icerik, baglam, durum, acik.onceki);
        soyle(durum === 'Taslak' ? `${acik.f.kod} taslak bırakıldı` : `${acik.f.kod} onaya gönderildi`, 'ok');
        acikYaz(null);
      } catch (h) {
        soyle(hataIletisi(h, 'Form kaydedilemedi.'), 'stop');
      } finally {
        gidiyorYaz(false);
      }
    };
    return (
      <section className="tc-kt" aria-label={`${acik.f.kod} ${acik.f.ad}`}>
        <div className="tc-kt-baslik-satir">
          <b>{acik.f.kod} · {acik.f.ad}</b>
          <small className="tc-ay1-mono tc-ay1-soluk">Rev {acik.f.rev || '00'}</small>
          <span className="tc-kt-bosluk" />
          <Dugme tur="ikincil" simge="x" onClick={() => acikYaz(null)}>Kapat</Dugme>
        </div>
        {acik.ozet || !adimlar.length ? (
          <FormGonder f={acik.f} icerik={acik.icerik} eksikler={terminalFormEksikleri(acik.f, acik.icerik, baglam)} dolduran={t.dolduran} bolum={bolum}
            gidiyor={gidiyor} geri={adimlar.length ? () => acikYaz({ ...acik, ozet: false }) : null} kaydet={(d) => { void kaydet(d); }} />
        ) : (
          <FormAdimlari adimlar={adimlar} icerik={acik.icerik} degistir={(icerik) => acikYaz({ ...acik, icerik })}
            sira={Math.min(acik.sira, adimlar.length - 1)} siraYaz={(sira) => acikYaz({ ...acik, sira })} bitir={() => acikYaz({ ...acik, ozet: true })} />
        )}
      </section>
    );
  }

  return (
    <section className="tc-kt" aria-label="Kalite formları">
      {t.taslaklar.length ? (
        <div className="tc-kt-alan">
          <span className="tc-ay1-ust-yazi">Taslaklarım</span>
          <div className="tc-kt-form-listesi">
            {t.taslaklar.map((k) => {
              const f = t.formlar.find((x) => x.kod === k.kod);
              return f ? (
                <button key={k._id} type="button" className="tc-kt-form-tus" data-taslak=""
                  onClick={() => acikYaz({ f, icerik: taslakIcerigi(k), onceki: k, sira: 0, ozet: false })}>
                  <Simge ad="rotate" /><span><b>{f.kod} · {f.ad}</b><small>Taslak · {k.tarih ?? ''}</small></span>
                </button>
              ) : null;
            })}
          </div>
        </div>
      ) : null}
      <div className="tc-kt-alan">
        <span className="tc-ay1-ust-yazi">Yeni form</span>
        {t.formlar.length ? (
          <div className="tc-kt-form-listesi">
            {t.formlar.map((f) => (
              <button key={f.kod} type="button" className="tc-kt-form-tus" onClick={() => acikYaz({ f, icerik: bosIcerik(), onceki: null, sira: 0, ozet: false })}>
                <Simge ad="clipboard-check" /><span><b>{f.kod} · {f.ad}</b><small>Rev {f.rev || '00'} · {formAdimlari(f.bolumler).length} adım</small></span>
              </button>
            ))}
          </div>
        ) : <p className="tc-ay1-soluk">Terminalde doldurulan form yok. Kalite Merkezi'nde şablonda "Terminalde doldurulur" işaretlenir.</p>}
      </div>
    </section>
  );
}

function FormGonder({ f, icerik, eksikler, dolduran, bolum, gidiyor, geri, kaydet }: {
  f: TerminalFormu; icerik: FormIcerigi; eksikler: readonly string[]; dolduran: string; bolum: string; gidiyor: boolean;
  geri: (() => void) | null; kaydet: (durum: 'Taslak' | 'Onay bekliyor') => void;
}) {
  const sonuc = terminalFormSonucu(f, icerik);
  const hayir = Object.values(icerik.liste).filter((y) => y === 'Hayır').length;
  return (
    <div className="tc-kt-form">
      <div className="tc-kt-ozet">
        <div><small>Dolduran</small><b>{dolduran || '—'}</b></div>
        <div><small>Bölüm</small><b className="tc-ay1-mono">{bolum}</b></div>
        <div data-ton={hayir ? 'kotu' : 'iyi'}><small>Sonuç</small><b>{sonuc || '—'}</b></div>
        <div data-ton={hayir ? 'kotu' : undefined}><small>"Hayır" yanıtı</small><b className="tc-ay1-mono">{hayir}</b></div>
      </div>
      {eksikler.length ? (
        <div className="tc-ay1-not" role="status"><Simge ad="alert" boyut="k" /><span>{eksikler.join(' · ')}</span></div>
      ) : <small className="tc-ay1-soluk">Gönderilen form Kalite Merkezi'nde onay bekler.</small>}
      <div className="tc-kt-onay">
        {geri ? <Dugme simge="back" onClick={geri}>Adımlara dön</Dugme> : null}
        <span className="tc-kt-bosluk" />
        <Dugme tur="ikincil" simge="rotate" disabled={gidiyor} onClick={() => kaydet('Taslak')}>Taslak bırak</Dugme>
        <Dugme tur="birincil" boyut="ana" simge="check" disabled={!!eksikler.length} yukleniyor={gidiyor} onClick={() => kaydet('Onay bekliyor')}>Onaya gönder</Dugme>
      </div>
    </div>
  );
}
