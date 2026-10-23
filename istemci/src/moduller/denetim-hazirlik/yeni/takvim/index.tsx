import { useState } from 'react';
import { Dugme, Kart, OnayPenceresi, Rozet, Simge } from '../../../../ortak/arayuz/index.ts';
import { useDenetim } from '../baglam.tsx';
import { guvenliAd, icsDosyasi, indir } from '../disa-aktar.ts';
import { OZF, PROGRAMLAR, PROGRAM_SIRASI } from '../icerik/programlar.ts';
import {
  butunDenetimler, denetimBasligi, devamiVar, sonrakiDenetimOnerisi, sonucMetni, type TakvimSatiri,
} from '../kurallar/denetim-takvimi.ts';
import { belgeSonGunuEsitle } from '../kurallar/denetim-takvimi.ts';
import { cihazDurumu, cihazVadesi } from '../kurallar/kalibrasyon.ts';
import { ozSonrakiVade } from '../kurallar/oz.ts';
import { profilAdi } from '../kurallar/profil.ts';
import { yeniDenetim } from '../normalize.ts';
import { aylar, bugunTarihi, gunFarki, tarihMetni, tariheGore } from '../tarih.ts';
import type { ProgramKodu } from '../tipler.ts';
import { DenetimFormu, useProfilDegistir, type FormAcilisi, type KayitSonucu } from './DenetimFormu.tsx';
import '../ic-denetim/p3-ortak.css';
import './takvim.css';

// Denetim takvimi: bütün profillerin ve programların denetimleri, son günleri ve sonraki denetim önerisi (prototip vTakvim, audAct).
// Takvime ekleme tarayıcıda .ics dosyası üretir; dış takvim servisine bağlantı yoktur.

type Kapsam = 'all' | 'mine';
const gunAyi = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return { gun: d.getDate(), ay: `${d.toLocaleDateString('tr-TR', { month: 'short' })} ${String(d.getFullYear())}` };
};
const ayAdi = (ym: string) => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1).toLocaleDateString('tr-TR', { month: 'short' });

function Tarih({ iso }: { iso: string | null }) {
  if (!iso) return <span className="tc-dhd-ttarih"><b>–</b></span>;
  const t = gunAyi(iso);
  return <span className="tc-dhd-ttarih"><b>{t.gun}</b><span>{t.ay}</span></span>;
}

const icsIndir = (ad: string, liste: readonly TakvimSatiri[]) => {
  indir(`${guvenliAd(ad)}.ics`, icsDosyasi(liste.map((o) => ({ a: o.a, profil: o.st }))), 'text/calendar');
};

interface SatirOzellikleri { o: TakvimSatiri; formAc: (f: FormAcilisi) => void; oneri: (pid: string, id: string) => void; sil: (o: TakvimSatiri) => void }

function DenetimSatiri({ o, formAc, oneri, sil }: SatirOzellikleri) {
  const d = useDenetim();
  const a = o.a;
  const sonGun = a.kind === 'deadline';
  const dd = gunFarki(a.date);
  const t = bugunTarihi();
  const gecti = (a.end || a.date) < t;
  const ne = a.status !== 'plan' ? sonucMetni(a) : dd > 0 ? `${String(dd)} gün kaldı` : dd === 0 ? 'Bugün' : sonGun ? `${String(-dd)} gün geçti` : 'Sonuç girilmedi';
  const sicak = a.status === 'plan' && dd >= 0 && dd < 14;
  const yaz = d.yetki.yazabilir;
  const ac = (mode: FormAcilisi['mode']) => { formAc({ mode, pid: o.pid, id: a.id, prog: a.prog }); };
  return (
    <li className={`tc-dhd-tsatir tc-dhd-p-${a.prog}${sonGun ? ' tc-dhd-tsatir-songun' : ''}${a.status !== 'plan' ? ' tc-dhd-tsatir-gecmis' : ''}`}>
      <Tarih iso={a.date} />
      <span className="tc-dhd-iki">
        <span className="tc-dhd-tbaslik"><Rozet ton="bilgi">{PROGRAMLAR[a.prog].s}</Rozet><b>{a.type || (sonGun ? 'Son gün' : 'Denetim')}</b></span>
        <small>{[profilAdi(o.st), a.end ? `${tarihMetni(a.date)} – ${tarihMetni(a.end)}` : '', a.cb, a.note].filter(Boolean).join(' · ')}</small>
      </span>
      <span className={sicak ? 'tc-dhy-ton-kotu tc-dhd-tne' : a.status === 'plan' && gecti && !sonGun ? 'tc-dhy-ton-uyari tc-dhd-tne' : 'tc-dhd-tne'}>{ne}</span>
      <span className="tc-dhd-teylem">
        {yaz && !sonGun && a.status === 'plan' && dd <= 0 && <Dugme tur="birincil" simge="check" onClick={() => { ac('done'); }}>Sonucu gir</Dugme>}
        {yaz && !sonGun && a.status === 'done' && !devamiVar(o) && <Dugme tur="birincil" simge="rotate" onClick={() => { oneri(o.pid, a.id); }}>Sonrakini planla</Dugme>}
        {yaz && !sonGun && a.status === 'done' && <Dugme onClick={() => { ac('done'); }}>Sonucu düzenle</Dugme>}
        {a.status === 'plan' && (
          <Dugme
            simge="download"
            onClick={() => {
              const alt = o.st.audits.filter((x) => x.parent === a.id && x.status === 'plan').map((x) => ({ pid: o.pid, a: x, st: o.st }));
              icsIndir(`${PROGRAMLAR[a.prog].s}-${a.type || 'denetim'}-${a.date}`, [o, ...alt]);
              d.bildir('Takvim dosyası indirildi', { ton: 'bilgi' });
            }}
          >
            Takvime ekle
          </Dugme>
        )}
        {yaz && <Dugme onClick={() => { ac('edit'); }}>Düzenle</Dugme>}
        {o.pid === d.depo.active && !sonGun && a.prog !== d.program && (
          <Dugme onClick={() => { d.programSec(a.prog); }}>{`${PROGRAMLAR[a.prog].s} çalışmasını aç`}</Dugme>
        )}
        {yaz && <Dugme simge="trash" aria-label={`${denetimBasligi(a, o.st)} sil`} onClick={() => { sil(o); }} />}
      </span>
    </li>
  );
}

export function Takvim() {
  const d = useDenetim();
  const profilDegistir = useProfilDegistir();
  const [kapsam, kapsamYaz] = useState<Kapsam>('all');
  const [form, formYaz] = useState<(FormAcilisi & { anahtar: number }) | null>(null);
  const [oneri, oneriYaz] = useState<{ pid: string; id: string } | null>(null);
  const [silinecek, silinecekYaz] = useState<TakvimSatiri | null>(null);
  const yaz = d.yetki.yazabilir;
  const t = bugunTarihi();
  const L = butunDenetimler(d.depo, kapsam);
  const formAc = (f: FormAcilisi) => { formYaz({ ...f, anahtar: Date.now() }); if (f.mode === 'new') oneriYaz(null); };
  const kaydedildi = (s: KayitSonucu) => {
    if (s.sonra === 'sonuc') { formAc({ mode: 'done', pid: s.pid, id: s.id, prog: s.prog }); return; }
    formYaz(null);
    if (s.sonra === 'oneri') oneriYaz({ pid: s.pid, id: s.id });
  };
  const yeni = () => {
    const pg = d.pg;
    formAc({ mode: 'new', pid: d.depo.active, id: '', prog: d.program, type: d.program === 'eydep' ? undefined : pg.types[2], cb: d.program === 'eydep' ? '' : d.profil.profile.kurulus });
  };

  const yakin = L.filter((o) => o.a.status === 'plan' && (o.a.end || o.a.date) >= t).sort((x, y) => tariheGore(x.a, y.a));
  const bekleyen = L.filter((o) => o.a.kind === 'audit' && o.a.status === 'plan' && (o.a.end || o.a.date) < t).sort((x, y) => tariheGore(y.a, x.a));
  const gecmis = L.filter((o) => o.a.status !== 'plan' || (o.a.kind === 'deadline' && o.a.date < t)).sort((x, y) => tariheGore(y.a, x.a));
  const aylarListesi = aylar(12, true);

  const satir = (o: TakvimSatiri) => (
    <DenetimSatiri key={`${o.pid}-${o.a.id}`} o={o} formAc={formAc} oneri={(pid, id) => { formYaz(null); oneriYaz({ pid, id }); window.scrollTo?.({ top: 0 }); }} sil={silinecekYaz} />
  );

  const ozler: { pid: string; k: ProgramKodu; due: string; acik: boolean; son: string; ad: string; freq: string }[] = [];
  for (const pid of d.depo.order) {
    if (kapsam === 'mine' && pid !== d.depo.active) continue;
    const st = d.depo.data[pid];
    if (!st) continue;
    for (const k of PROGRAM_SIRASI) {
      const oz = st.pw[k].oz;
      if (!oz.rounds.length && !oz.cur) continue;
      const lr = oz.rounds[oz.rounds.length - 1];
      ozler.push({ pid, k, due: ozSonrakiVade(oz), acik: !!oz.cur, son: lr ? lr.date : '', ad: profilAdi(st), freq: OZF[oz.freq].n });
    }
  }
  ozler.sort((a, b) => ((a.due || '9') < (b.due || '9') ? -1 : 1));
  const kalib = d.cihazlar.filter((x) => { const k = cihazDurumu(x).k; return k !== 'pasif' && k !== 'ok'; })
    .sort((a, b) => ((cihazVadesi(a) || '0') < (cihazVadesi(b) || '0') ? -1 : 1));

  const oneriSatiri = oneri ? (() => {
    const st = d.depo.data[oneri.pid];
    const a = st?.audits.find((x) => x.id === oneri.id);
    return st && a ? { st, a, sg: sonrakiDenetimOnerisi(a) } : null;
  })() : null;

  return (
    <div className="tc-dhd">
      {d.ekran.ux !== 'uzman' && <p className="tc-dhd-aciklama">ISO 9001, AS9100 ve EYDEP denetimleri, son teslim günleri ve sonraki denetimler tek yerde.</p>}
      <div className="tc-dhd-kapsam" role="group" aria-label="Kapsam">
        <Dugme aria-pressed={kapsam === 'all'} onClick={() => { kapsamYaz('all'); }}>Tüm firmalar</Dugme>
        <Dugme aria-pressed={kapsam === 'mine'} onClick={() => { kapsamYaz('mine'); }}>Bu firma</Dugme>
      </div>

      {oneriSatiri && yaz && (
        <Kart baslik="Sonraki denetim önerisi" baslikEki={<span className="tc-dhd-soluk">{profilAdi(oneriSatiri.st)}</span>}>
          <p className="tc-dhd-oneri"><b>{`${PROGRAMLAR[oneriSatiri.a.prog].s} · ${oneriSatiri.sg.type}`}</b>{` · ${tarihMetni(oneriSatiri.sg.date)}`}</p>
          <p className="tc-dhd-aciklama">{`${oneriSatiri.sg.why}.`}</p>
          <div className="tc-dhd-dugmeler tc-dhd-sola">
            <Dugme
              tur="birincil" simge="plus"
              onClick={() => {
                const { a, sg } = oneriSatiri;
                profilDegistir(oneri?.pid ?? '', null, (p) => { const n = yeniDenetim({ prog: a.prog, type: sg.type, date: sg.date, cb: a.cb }); p.audits.push(n); belgeSonGunuEsitle(n, p); });
                oneriYaz(null);
                d.bildir('Sonraki denetim takvime eklendi');
              }}
            >
              Bu tarihle ekle
            </Dugme>
            <Dugme
              onClick={() => {
                const { a, sg } = oneriSatiri;
                oneriYaz(null);
                formAc({ mode: 'new', pid: oneri?.pid ?? d.depo.active, id: '', prog: a.prog, type: sg.type, date: sg.date, cb: a.cb });
              }}
            >
              Tarihi değiştirerek ekle
            </Dugme>
            <Dugme onClick={() => { oneriYaz(null); }}>Şimdi değil</Dugme>
          </div>
        </Kart>
      )}

      <Kart
        baslik="Önümüzdeki 12 ay"
        sag={(
          <span className="tc-dhd-lejant">
            {PROGRAM_SIRASI.map((k) => <span key={k}><i className={`tc-dhd-nokta tc-dhd-p-${k}`} />{PROGRAMLAR[k].s}</span>)}
            <span><i className="tc-dhd-nokta tc-dhd-nokta-songun" />Son gün</span>
          </span>
        )}
      >
        <div className="tc-dhd-aylar">
          {aylarListesi.map((ym, i) => {
            const it = L.filter((o) => o.a.date.slice(0, 7) === ym && o.a.status !== 'cancel').sort((x, y) => tariheGore(x.a, y.a));
            return (
              <div key={ym} className={`tc-dhd-ay${it.length ? ' tc-dhd-ay-dolu' : ''}`}>
                <b>{ayAdi(ym)}{(i === 0 || ym.endsWith('-01')) && <span className="tc-dhd-soluk">{` ${ym.slice(0, 4)}`}</span>}</b>
                <span className="tc-dhd-noktalar">
                  {it.map((o) => (
                    <span
                      key={`${o.pid}-${o.a.id}`} className={`tc-dhd-gun tc-dhd-p-${o.a.prog}${o.a.kind === 'deadline' ? ' tc-dhd-gun-songun' : ''}`}
                      title={`${denetimBasligi(o.a, o.st)} · ${tarihMetni(o.a.date)}`}
                    >
                      {Number(o.a.date.slice(8, 10))}
                    </span>
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      </Kart>

      <Kart
        baslik="Yaklaşan"
        sag={(
          <span className="tc-dhd-dugmeler">
            {yakin.length > 0 && (
              <Dugme simge="download" onClick={() => { icsIndir(`denetim-takvimi-${t}`, yakin); d.bildir(`${String(yakin.length)} kayıt takvim dosyasına eklendi`, { ton: 'bilgi' }); }}>
                Tümünü takvime ekle
              </Dugme>
            )}
            {yaz && <Dugme tur="birincil" simge="plus" onClick={yeni}>Yeni denetim</Dugme>}
          </span>
        )}
      >
        {yakin.length ? <ul className="tc-dhd-tliste">{yakin.map(satir)}</ul> : (
          <div className="tc-dhd-bos">
            <Simge ad="clock" boyut="b" />
            <h3>Planlanmış denetim yok</h3>
            <p>{`${kapsam === 'mine' ? 'Bu firma' : 'Hiçbir firma'} için yaklaşan denetim girilmemiş. Denetim tarihini ekleyin; hazırlık takvimi ve geri sayım buna göre çalışır.`}</p>
          </div>
        )}
      </Kart>

      {bekleyen.length > 0 && (
        <Kart baslik="Sonucu girilmemiş denetimler">
          {d.ekran.ux !== 'uzman' && <p className="tc-dhd-aciklama">Sonucu girin; sistem bir sonraki denetim için tarih önersin.</p>}
          <ul className="tc-dhd-tliste">{bekleyen.map(satir)}</ul>
        </Kart>
      )}
      {gecmis.length > 0 && <Kart baslik="Geçmiş"><ul className="tc-dhd-tliste">{gecmis.slice(0, 12).map(satir)}</ul></Kart>}

      {ozler.length > 0 && (
        <Kart baslik="Öz değerlendirme turları">
          <ul className="tc-dhd-tliste">
            {ozler.map((x) => {
              const dd = x.due ? gunFarki(x.due) : null;
              return (
                <li key={`${x.pid}-${x.k}`} className={`tc-dhd-tsatir tc-dhd-tsatir-songun tc-dhd-p-${x.k}`}>
                  <Tarih iso={x.due || null} />
                  <span className="tc-dhd-iki">
                    <span className="tc-dhd-tbaslik"><Rozet ton="bilgi">{PROGRAMLAR[x.k].s}</Rozet><b>{x.acik ? 'Açık tur var' : 'Sıradaki tur'}</b></span>
                    <small>{[x.ad, x.freq, x.son ? `son tur ${tarihMetni(x.son)}` : ''].filter(Boolean).join(' · ')}</small>
                  </span>
                  <span className={dd != null && dd < 0 ? 'tc-dhy-ton-kotu tc-dhd-tne' : 'tc-dhd-tne'}>
                    {x.acik ? 'Devam ediyor' : dd == null ? '' : dd < 0 ? `${String(-dd)} gün gecikti` : dd === 0 ? 'Bugün' : `${String(dd)} gün kaldı`}
                  </span>
                  {x.pid === d.depo.active && (
                    <span className="tc-dhd-teylem"><Dugme simge="play" onClick={() => { d.git('kontrol', { program: x.k }); }}>Aç</Dugme></span>
                  )}
                </li>
              );
            })}
          </ul>
        </Kart>
      )}

      {kalib.length > 0 && (
        <Kart baslik="Kalibrasyon: gecikmiş ve 30 gün içinde" sag={<Dugme simge="chev-right" onClick={() => { d.git('kalib'); }}>Kalibrasyon sayfası</Dugme>}>
          <ul className="tc-dhd-tliste">
            {kalib.slice(0, 10).map((x) => {
              const st = cihazDurumu(x);
              const n = cihazVadesi(x);
              return (
                <li key={x.id} className={`tc-dhd-tsatir tc-dhd-tsatir-songun tc-dhd-k-${st.ton}`}>
                  <Tarih iso={n || null} />
                  <span className="tc-dhd-iki"><b>{`${x.no} · ${x.ad}`}</b><small>{[profilAdi(d.profil), x.yer, x.sorumlu].filter(Boolean).join(' · ')}</small></span>
                  <span className={st.ton === 'kotu' ? 'tc-dhy-ton-kotu tc-dhd-tne' : 'tc-dhd-tne'}>{st.t}</span>
                </li>
              );
            })}
          </ul>
          {kalib.length > 10 && <p className="tc-dhd-not">{`+${String(kalib.length - 10)} cihaz daha`}</p>}
        </Kart>
      )}

      {d.ekran.ux !== 'uzman' && (
        <p className="tc-dhd-ipucu">
          <Simge ad="help" />
          <span>&quot;Takvime ekle&quot; bir .ics dosyası indirir; Outlook, Apple Takvim ve Google Takvim bunu açar. Denetimler için 14 gün ve 1 gün önce, son teslim günleri için 3 gün ve 1 gün önce hatırlatma kurulur.</span>
        </p>
      )}

      {form && <DenetimFormu key={form.anahtar} acilis={form} kapat={() => { formYaz(null); }} kaydedildi={kaydedildi} />}
      <OnayPenceresi
        acik={silinecek !== null} baslik="Silinsin mi?" onayMetni="Sil" tehlikeli vazgec={() => { silinecekYaz(null); }}
        onayla={() => {
          const o = silinecek;
          silinecekYaz(null);
          if (!o) return;
          profilDegistir(o.pid, o.pid === d.depo.active ? 'Denetim silme' : null, (p) => { p.audits = p.audits.filter((x) => x.id !== o.a.id && x.parent !== o.a.id); });
          if (oneri?.id === o.a.id) oneriYaz(null);
          if (o.pid !== d.depo.active) d.bildir('Silindi');
        }}
      >
        {silinecek && <p>{`${denetimBasligi(silinecek.a, silinecek.st)} ve ona bağlı son günler silinir.`}</p>}
      </OnayPenceresi>
    </div>
  );
}
