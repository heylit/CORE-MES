import { useState, type FormEvent } from 'react';
import { DurumKutusu, Dugme, Girdi, Rozet, Simge } from '../../../../ortak/arayuz/index.ts';
import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import {
  arizaEkle, arizaKaldir, arizalar, girdiDegeri, girdiSaati, kilitDegistir, kilitliMi, saatYaz, sureYaz, tezgahKodu, yol,
  type OkunanPlan, type PlanIslemi, type SiparisOzeti, type TezgahOzeti,
} from './kurallar.ts';

// P1'in iki görünümünün (motor ve atölye) ortak parçaları: plan yok durumu, motor kapalı notu, tezgâh paneli ve siparişin yolu.

// Motor gerektiren işlevler (Çöz, İyileştir, önizleme, olay, çözüm yolları) yeni ekranda kapalıdır (soru 357 b): plan motoru
// bağlanınca açılır. Düğme görünür ama basılmaz; neden yanında yazar.
export const MOTOR_KAPALI = 'Plan motoru bağlanınca açılır.';

export function MotorDugmesi({ ad, simge }: { ad: string; simge: 'play' | 'bolt' | 'lab' | 'plus' | 'upload' | 'rotate' }) {
  return <Dugme simge={simge} disabled title={MOTOR_KAPALI} aria-description={MOTOR_KAPALI}>{ad}</Dugme>;
}

export function PlanYok({ c }: { c: PlanlamaCalismasi | null }) {
  if (c === null) return <div className="tc-pym-bos"><DurumKutusu durum="bos" mesaj="Planlama çalışması yok. Veri Reçete ve Rota'dan girince çalışma kurulur." /></div>;
  const D = c.D;
  return (
    <section className="tc-pym-bos" aria-labelledby="pym-bos-baslik">
      <Simge ad="gantt" boyut="b" />
      <h2 id="pym-bos-baslik">Plan henüz kurulmadı</h2>
      <p>Reçete ve Rota kaydı: {D.tezgahlar.length} tezgâh, {D.siparisler.length} sipariş, {D.personel?.length ?? 0} personel.</p>
      <ol className="tc-pym-adimlar">
        <li><b>Planı kur</b><small>Motor bütün kısıtlarla ilk planı kurar, kalan sürede iyileştirir.</small></li>
        <li><b>Sorunlara bak</b><small>Yapılacaklar gecikeni, malzemesi eksik olanı ve darboğazı sıralar.</small></li>
        <li><b>Karar ver</b><small>Her öneri önce önizlenir; Uygula demeden plan değişmez.</small></li>
      </ol>
      <div className="tc-pym-dugmeler"><MotorDugmesi ad="Planı kur" simge="play" /></div>
      <p className="tc-pym-not">{MOTOR_KAPALI}</p>
    </section>
  );
}

// Tezgâhın paneli (o-tahta tbTezPaneli): grup, doluluk, kuyruk, arıza ve bakım pencereleri.
export function TezgahPaneli({ o, c, t, kapat, secIslem }: {
  o: PlanlamaEkranOzellikleri; c: PlanlamaCalismasi; t: TezgahOzeti; kapat: () => void; secIslem: (r: PlanIslemi) => void;
}) {
  const D = c.D;
  const yaz = o.komut !== null && !t.fason;
  return (
    <section className="tc-pym-panel" aria-label={`Tezgâh ${tezgahKodu(t.id)}`}>
      <header className="tc-pym-panel-ust">
        <h3><span className="mono">{tezgahKodu(t.id)}</span> · {t.ad}</h3>
        <button type="button" className="tc-pym-kapat" onClick={kapat} aria-label="Kapat"><Simge ad="x" boyut="k" /></button>
      </header>
      <dl className="tc-pym-dl">
        <dt>Grup</dt><dd>{t.fason ? 'fason' : t.grup}</dd>
        <dt>Doluluk</dt><dd>{t.doluluk === null ? '—' : `%${Math.round(t.doluluk * 100)}`}</dd>
        <dt>Sırada</dt><dd>{t.kuyruk.length} iş</dd>
      </dl>
      <div className="tc-pym-dugmeler"><Dugme simge="wrench" onClick={() => { o.git('studio'); }}>Atölyede aç</Dugme></div>
      <h4>Kuyruk</h4>
      {t.kuyruk.length === 0 ? <p className="tc-pym-not">Sırada iş yok.</p> : (
        <ol className="tc-pym-liste">
          {t.kuyruk.slice(0, 12).map((r, i) => (
            <li key={r.id}>
              <button type="button" onClick={() => { secIslem(r); }}>
                <b className="mono">{i + 1}</b>
                <span><span className="mono">{r.job}</span> {r.id.slice(r.job.length + 1)}<small>{saatYaz(D, r.S)} → {saatYaz(D, r.C).slice(6)}</small></span>
                <span className="mono">{sureYaz(r.C - r.S)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {t.kuyruk.length > 12 && <p className="tc-pym-not">{t.kuyruk.length - 12} iş daha.</p>}
      {!t.fason && <Arizalar o={o} c={c} m={t.id} yaz={yaz} />}
    </section>
  );
}

function Arizalar({ o, c, m, yaz }: { o: PlanlamaEkranOzellikleri; c: PlanlamaCalismasi; m: string; yaz: boolean }) {
  const D = c.D;
  const l = arizalar(c, m);
  const [acik, setAcik] = useState(false);
  const [bas, setBas] = useState('');
  const [bit, setBit] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const ac = () => { setBas(''); setBit(''); setHata(null); setAcik(true); };
  const ekle = (e: FormEvent) => {
    e.preventDefault();
    const a = girdiSaati(D, bas), b = girdiSaati(D, bit);
    if (a === null || b === null) { setHata('Başlangıç ve bitişi gir.'); return; }
    if (!(b > a)) { setHata('Bitiş başlangıçtan sonra olmalı.'); return; }
    const ok = o.komut?.degistir('Arıza/bakım eklendi', (x) => arizaEkle(x, { m, from: a, to: b }), { ayrinti: `${m} ${saatYaz(D, a)} → ${saatYaz(D, b)}` });
    if (ok) setAcik(false);
  };
  return (
    <div className="tc-pym-bolum">
      <h4>Arıza ve bakım</h4>
      {l.length === 0 ? <p className="tc-pym-not">Kayıtlı arıza ya da bakım yok.</p> : (
        <ul className="tc-pym-liste">
          {l.map((d) => (
            <li key={d.i} className="tc-pym-satir">
              <span>{saatYaz(D, d.from)} → {saatYaz(D, d.to)}</span>
              {yaz && (
                <button
                  type="button" className="tc-pym-kapat" aria-label={`${saatYaz(D, d.from)} arızasını kaldır`}
                  onClick={() => { o.komut?.degistir('Arıza/bakım silindi', (x) => arizaKaldir(x, d.i), { ayrinti: `${m} ${saatYaz(D, d.from)}` }); }}
                ><Simge ad="trash" boyut="k" /></button>
              )}
            </li>
          ))}
        </ul>
      )}
      {yaz && !acik && <Dugme simge="wrench" onClick={ac}>Arıza ya da bakım ekle</Dugme>}
      {yaz && acik && (
        <form className="tc-pym-form" onSubmit={ekle} noValidate aria-label="Arıza ya da bakım ekle">
          <Girdi etiket="Başlangıç" type="datetime-local" value={bas} onChange={(e) => { setBas(e.target.value); }} min={girdiDegeri(D, 0)} required />
          <Girdi etiket="Bitiş" type="datetime-local" value={bit} onChange={(e) => { setBit(e.target.value); }} hata={hata ?? undefined} />
          <div className="tc-pym-dugmeler">
            <Dugme onClick={() => { setAcik(false); }}>Vazgeç</Dugme>
            <Dugme tur="birincil" type="submit" simge="check">Ekle</Dugme>
          </div>
          <p className="tc-pym-not">Plan yeniden çözülünce bu saatlerde tezgâha iş verilmez.</p>
        </form>
      )}
    </div>
  );
}

// Siparişin yolu (o-tahta tbOdakSeridi, zz36 cizSipAc): adımlar sırayla, aradaki bekleme; adım sabitlenebilir (plan.yaz).
export function SiparisYolu({ o, c, s, secili, secIslem, kapat }: {
  o: PlanlamaEkranOzellikleri; c: PlanlamaCalismasi; s: SiparisOzeti; secili: string | null; secIslem: (r: PlanIslemi) => void; kapat?: () => void;
}) {
  const D = c.D;
  const y = yol(s);
  return (
    <section className="tc-pym-yol" aria-label={`${s.id} siparişinin yolu`}>
      <header className="tc-pym-panel-ust">
        <h3><span className="mono">{s.id}</span> · {s.urun} · {s.adet} adet</h3>
        {s.durum === 'gec' ? <Rozet ton="hata">{sureYaz(s.gecikme)} geç</Rozet> : s.durum === 'risk' ? <Rozet ton="uyari">{sureYaz(s.pay)} pay</Rozet> : <Rozet ton="tamam">Zamanında</Rozet>}
        {kapat && <button type="button" className="tc-pym-kapat" onClick={kapat} aria-label="Odaktan çık"><Simge ad="x" boyut="k" /></button>}
      </header>
      <p className="tc-pym-not">{y.adimlar.length} adım · işlem {sureYaz(y.islem)} · bekleme {sureYaz(y.bekleme)} · bitiş {saatYaz(D, s.bitis)} · termin {saatYaz(D, s.termin)}</p>
      <ol className="tc-pym-adim-liste">
        {y.adimlar.map(({ islem: r, bekleme }, i) => {
          const kilitli = kilitliMi(c, r.id);
          return (
            <li key={r.id} aria-current={secili === r.id ? 'step' : undefined}>
              {bekleme !== null && bekleme > 0.5 && <span className="tc-pym-bekle mono" data-uzun={bekleme > 24 ? '' : undefined}>{sureYaz(bekleme)} bekler</span>}
              <div className="tc-pym-adim">
                <button type="button" onClick={() => { secIslem(r); }}>
                  <b className="mono">{i + 1}</b>
                  <span><span className="mono">{tezgahKodu(r.m)}</span>{r.fas ? ' (fason)' : ''} {r.id.slice(r.job.length + 1)}<small>{saatYaz(D, r.S)} → {saatYaz(D, r.C).slice(6)} · {sureYaz(r.C - r.S)}</small></span>
                </button>
                {o.komut !== null ? (
                  <button
                    type="button" className="tc-pym-kapat" aria-pressed={kilitli}
                    aria-label={kilitli ? `${r.id} sabitini kaldır` : `${r.id} adımını bu yerde sabitle`}
                    onClick={() => { o.komut?.degistir(kilitli ? 'Sabit kaldırıldı' : 'İş sabitlendi', (x) => { kilitDegistir(x, r); }, { ayrinti: `${r.id} ${tezgahKodu(r.m)} ${saatYaz(D, r.S)}` }); }}
                  ><Simge ad="lock" boyut="k" /></button>
                ) : kilitli ? <span title="Sabit"><Simge ad="lock" boyut="k" /></span> : null}
              </div>
            </li>
          );
        })}
      </ol>
      {y.adimlar.length === 0 && <p className="tc-pym-not">Bu siparişin planda adımı yok.</p>}
    </section>
  );
}

// Plan durumu rozeti (zk-kabuk sdCubuk): plan yok, güncel, veri değişti.
export function PlanDurumu({ p, guncel }: { p: OkunanPlan | null; guncel: boolean }) {
  if (p === null) return <Rozet ton="pasif">Plan yok</Rozet>;
  return guncel ? <Rozet ton="tamam">Güncel</Rozet> : <Rozet ton="uyari">Veri değişti</Rozet>;
}
