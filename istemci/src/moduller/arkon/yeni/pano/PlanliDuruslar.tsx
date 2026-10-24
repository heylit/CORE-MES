import { useState } from 'react';
import type { PlannedDown } from '../../../../../../arkon/shared/model.ts';
import { Dugme, Girdi, OnayPenceresi, Secim } from '../../../../ortak/arayuz/index.ts';
import { durusNedeni } from '../cekirdek/ayarlar.ts';
import { gunAy, gunAySaat, saat, yerelGirdi } from '../cekirdek/bicim.ts';
import { durusGerceklesmeleri } from '../cekirdek/vardiya.ts';
import { belgeSil, belgeYaz, useArkon, useBelgeler, useSimdi } from '../veri/baglam.ts';
import {
  GUNLER, durusGunlukMetni, durusHatasi, durusKapsami, duruslariSirala, seritKonumu, yeniDurus, yeniKimlik, type DurusTaslagi,
} from './kurallar.ts';
import { IstasyonSecimi, gunlugeYaz, useSoyle } from './ortak.tsx';
import { istasyonListesi } from '../cekirdek/tesis.ts';

// Planlı duruş takvimi (pano-planlama.ts DownsView): bakım, toplantı, eğitim, sayım. OEE'de planlı süreden düşülür, operatörde uyarı
// çıkar, plan tahminleri bunlara göre kayar. Yazma 'down.edit' ister (sunucu da denetler).
const GUN = 864e5;
const HAFTA_SIRASI = [1, 2, 3, 4, 5, 6, 0] as const;

export function PlanliDuruslar() {
  const { depo, ayarlar, ayarlariYenile, yetkiVar, saltOkunur } = useArkon();
  const soyle = useSoyle();
  const { liste, yenile } = useBelgeler<PlannedDown>('downs', ['cfg']);
  const [ed, edYaz] = useState<DurusTaslagi | null>(null);
  const [silinecek, silinecekYaz] = useState<PlannedDown | null>(null);
  const simdi = useSimdi(60000);
  const duzenle = yetkiVar('down.edit') && !saltOkunur;

  const kaydet = async () => {
    if (!ed) return;
    const hata = durusHatasi(ed);
    if (hata) { soyle(hata, 'hata'); return; }
    const { isNew, ...d } = ed;
    const kayit: PlannedDown = { ...d, title: d.title || durusNedeni(ayarlar, d.reason)?.l || '', by: d.by || depo.Auth.current()?.name || '', at: d.at || Date.now() };
    await belgeYaz(depo, 'downs', kayit);
    ayarlariYenile();
    depo.Bus.send({ type: 'cfg' });
    gunlugeYaz(depo, 'planlı duruş', isNew ? 'eklendi' : 'değiştirildi', kayit.title, durusGunlukMetni(kayit, ayarlar));
    edYaz(null);
    yenile();
    soyle('Planlı duruş kaydedildi');
  };
  const sil = async (d: PlannedDown) => {
    await belgeSil(depo, 'downs', d.id);
    ayarlariYenile();
    depo.Bus.send({ type: 'cfg' });
    gunlugeYaz(depo, 'planlı duruş', 'silindi', d.title);
    yenile();
  };

  const gun0 = new Date(simdi).setHours(0, 0, 0, 0);
  const F = <K extends keyof DurusTaslagi>(k: K, v: DurusTaslagi[K]) => edYaz((e) => (e ? { ...e, [k]: v } : e));
  const planliNedenler = ayarlar.durusNedenleri.filter((r) => r.cat === 'p' && r.active !== false);
  const sirali = duruslariSirala(liste, simdi);
  return (
    <div className="tc-ay3-sayfa">
      <div className="tc-ay3-arac">
        <span className="tc-ay3-ust">Planlı duruşlar OEE&apos;de planlı üretim süresinden düşülür; operatör ekranında uyarı çıkar, plan tahminleri bunlara göre kayar.</span>
        <span className="tc-ay3-bosluk" />
        {duzenle && <Dugme tur="birincil" simge="plus" onClick={() => edYaz(yeniDurus(Date.now(), ayarlar, yeniKimlik()))}>Planlı duruş ekle</Dugme>}
      </div>
      {ed && (
        <form className="tc-ay3-kutu tc-ay3-form" aria-label="Planlı duruş" onSubmit={(o) => { o.preventDefault(); void kaydet(); }}>
          <div className="tc-ay3-alanlar">
            <Secim etiket="Neden" value={ed.reason || ''} onChange={(o) => F('reason', o.target.value)} secenekler={planliNedenler.map((r) => ({ deger: r.code, baslik: r.l }))} />
            <Girdi etiket="Başlık (isteğe bağlı)" value={ed.title || ''} onChange={(o) => F('title', o.target.value)} placeholder={durusNedeni(ayarlar, ed.reason)?.l || ''} />
            <Secim etiket="Kapsam" value={ed.scope} secenekler={[{ deger: 'all', baslik: 'Bütün tesis' }, { deger: 'wc', baslik: 'İş merkezi' }, { deger: 'st', baslik: 'İstasyon' }]}
              onChange={(o) => {
                const scope = o.target.value as PlannedDown['scope'];
                const target = scope === 'wc' ? ayarlar.tesis.wcs[0]?.id ?? '' : scope === 'st' ? istasyonListesi(ayarlar.tesis)[0]?.id ?? '' : '';
                edYaz({ ...ed, scope, target });
              }} />
            {ed.scope === 'wc' && <Secim etiket="İş merkezi" value={ed.target || ''} onChange={(o) => F('target', o.target.value)} secenekler={ayarlar.tesis.wcs.map((w) => ({ deger: w.id, baslik: w.name }))} />}
            {ed.scope === 'st' && <label className="tc-alan"><span className="tc-alan-etiket">İstasyon</span><IstasyonSecimi deger={ed.target} degistir={(v) => F('target', v)} /></label>}
            <Girdi etiket="Başlangıç" type="datetime-local" value={yerelGirdi(ed.from)}
              onChange={(o) => { const t = new Date(o.target.value).getTime(); if (t) edYaz({ ...ed, from: t, to: t + (ed.to - ed.from) }); }} />
            <Girdi etiket="Bitiş" type="datetime-local" value={yerelGirdi(ed.to)} onChange={(o) => { const t = new Date(o.target.value).getTime(); if (t) F('to', t); }} />
            <Secim etiket="Tekrar" value={ed.rep} onChange={(o) => F('rep', o.target.value as PlannedDown['rep'])}
              secenekler={[{ deger: 'none', baslik: 'Bir kez' }, { deger: 'daily', baslik: 'Her gün' }, { deger: 'weekly', baslik: 'Haftanın günleri' }]} />
            {ed.rep !== 'none' && (
              <Girdi etiket="Bitiş tarihi (boş: süresiz)" type="date" value={ed.until ? yerelGirdi(ed.until).slice(0, 10) : ''}
                onChange={(o) => F('until', o.target.value ? new Date(`${o.target.value}T23:59`).getTime() : null)} />
            )}
          </div>
          {ed.rep === 'weekly' && (
            <div className="tc-ay3-secmeli" role="group" aria-label="Günler">
              {HAFTA_SIRASI.map((k) => {
                const secili = (ed.days ?? []).includes(k);
                return <button key={k} type="button" aria-pressed={secili} onClick={() => F('days', secili ? (ed.days ?? []).filter((x) => x !== k) : [...(ed.days ?? []), k])}>{GUNLER[k]}</button>;
              })}
            </div>
          )}
          <Girdi etiket="Not" value={ed.note || ''} onChange={(o) => F('note', o.target.value)} placeholder="örn. yıllık bakım firması gelecek" />
          <div className="tc-ay3-dugmeler">
            <Dugme type="button" onClick={() => edYaz(null)}>Vazgeç</Dugme>
            <Dugme type="submit" tur="birincil" simge="check">Kaydet</Dugme>
          </div>
        </form>
      )}
      <div className="tc-ay3-kutu tc-ay3-hafta" aria-label="Haftalık planlı duruşlar">
        <div className="tc-ay3-hafta-satir">
          <span />
          <div className="tc-ay3-gunler">{[0, 1, 2, 3, 4, 5, 6].map((i) => <span key={i}>{GUNLER[new Date(gun0 + i * GUN).getDay()]} {gunAy(gun0 + i * GUN)}</span>)}</div>
        </div>
        {sirali.length ? sirali.map((d) => {
          const olaylar = durusGerceklesmeleri(d, gun0, gun0 + 7 * GUN);
          const siradaki = durusGerceklesmeleri(d, simdi, simdi + 400 * GUN)[0];
          const tekrar = d.rep === 'daily' ? ' · her gün' : d.rep === 'weekly' ? ` · ${(d.days ?? []).map((k) => GUNLER[k]).join(' ')}` : ` · ${gunAy(d.from)}`;
          return (
            <div key={d.id} className="tc-ay3-hafta-satir" data-kapali={d.active === false || undefined}>
              <div>
                <b>{d.title || durusNedeni(ayarlar, d.reason)?.l}</b>
                <small className="tc-ay3-not"> {durusKapsami(d, ayarlar)} · {saat(d.from)}–{saat(d.to)}{tekrar}{siradaki ? '' : ' · geçmiş'}</small>
                {duzenle && (
                  <div className="tc-ay3-dugmeler">
                    <Dugme onClick={() => edYaz({ ...d })}>Düzenle</Dugme>
                    <Dugme tur="tehlike" onClick={() => silinecekYaz(d)}>Sil</Dugme>
                  </div>
                )}
              </div>
              <svg className="tc-ay3-zaman" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                {[1, 2, 3, 4, 5, 6].map((i) => <line key={i} className="tc-ay3-izgara" x1={(i / 7) * 100} x2={(i / 7) * 100} y1={0} y2={10} vectorEffect="non-scaling-stroke" />)}
                {olaylar.map((w) => (
                  <rect key={w.s} className="tc-ay3-blok" x={seritKonumu(w.s, gun0)} y={2} height={6}
                    width={Math.max(0.6, seritKonumu(w.e, gun0) - seritKonumu(w.s, gun0))}><title>{`${gunAySaat(w.s)} – ${saat(w.e)}`}</title></rect>
                ))}
                <line className="tc-ay3-simdi" x1={seritKonumu(simdi, gun0)} x2={seritKonumu(simdi, gun0)} y1={0} y2={10} vectorEffect="non-scaling-stroke" />
              </svg>
            </div>
          );
        }) : <p className="tc-ay3-not">Planlı duruş yok. Bakım, toplantı, eğitim, sayım gibi olayları buraya gir; OEE hesabı ve iş planı bunlara göre ayarlanır.</p>}
      </div>
      <OnayPenceresi acik={silinecek !== null} baslik="Planlı duruşu sil" tehlikeli onayMetni="Sil"
        onayla={() => { const d = silinecek; silinecekYaz(null); if (d) void sil(d); }} vazgec={() => silinecekYaz(null)}>
        <p>{silinecek?.title} silinsin mi?</p>
      </OnayPenceresi>
    </div>
  );
}
