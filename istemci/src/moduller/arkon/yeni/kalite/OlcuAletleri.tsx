import { Fragment, useState } from 'react';
import { ALET_YOK_ILETISI, aletSecimAnahtari, secilebilirAletler, seciliAlet, type OlcumAleti } from '../../../../ortak/cizim/cekirdek/olcum-aleti.ts';
import type { Gauge } from '../../../../../../arkon/shared/model.ts';
import { Dugme, Girdi, OnayPenceresi, Pencere, Secim, Simge } from '../../../../ortak/arayuz/index.ts';
import { gunAy, yerelGirdi } from '../cekirdek/bicim.ts';
import { yerel } from '../cekirdek/yerel.ts';
import { belgeSil, belgeYaz, useArkon, useBelgeler, useSimdi } from '../veri/baglam.ts';
import { Cip, csvIndir, gunlugeYaz, yeniKimlik, type Soyle } from '../pano/index.tsx';
import { aletDurumu, aletVadesi } from './kurallar.ts';

// Ölçü aletleri ve kalibrasyon (bakim-raporlar.ts GaugeView), ölçümde alet seçimi (olcum-aleti-secimi.ts) ve kaliteye numune penceresi
// (NumuneOv). Sunucuya bağlı Arkon'da aletler TMI'nin Kalibrasyon sayfasındadır; sunucu yazmayı reddeder, liste salt okunurdur (A7, #518).

const ALET_TURLERI = ['Mikrometre', 'Kumpas', 'Komparatör', 'Tampon mastar', 'Halka mastar', 'Diş mastarı', 'Radyus mastarı', 'Yükseklik mihengiri', 'İç çap mikrometresi', 'CMM', 'Tork anahtarı', 'Kaplama kalınlık ölçer'];

export function useOlcumAletleri(): OlcumAleti[] {
  return useBelgeler<OlcumAleti>('gauges').liste;
}
// Seçim cihazda alet türü başına saklanır: aynı türdeki sonraki ölçüm yeniden seçim istemez.
export const olcumAletiBul = (aletler: readonly OlcumAleti[], tool: unknown): OlcumAleti | null =>
  seciliAlet(aletler, tool, yerel.oku(aletSecimAnahtari(tool)), Date.now());

export function AletSecimi({ aletler, tool, onSec }: { aletler: readonly OlcumAleti[]; tool: unknown; onSec?: () => void }) {
  const simdi = useSimdi(600000);
  const [, yenile] = useState(0);
  const secenek = secilebilirAletler(aletler, tool, simdi);
  const secili = seciliAlet(aletler, tool, yerel.oku(aletSecimAnahtari(tool)), simdi);
  if (!secenek.length) return <span className="tc-ay3-gec">{ALET_YOK_ILETISI}</span>;
  return (
    <select className="tc-ay3-secim" aria-label={`Ölçü aleti: ${String(tool || '')}`} value={secili ? secili.id : ''}
      onChange={(o) => { yerel.yaz(aletSecimAnahtari(tool), o.target.value || null); yenile((n) => n + 1); onSec?.(); }}>
      <option value="">{String(tool || 'Ölçü aleti')} · seçin</option>
      {secenek.map((g) => <option key={g.id} value={g.id}>{g.no}{g.type ? ` · ${g.type}` : ''}</option>)}
    </select>
  );
}

interface Kalibrasyon { g: Gauge; date: string; res: 'ok' | 'nok'; cert: string; note: string }
type AletTaslagi = Gauge & { isNew?: boolean };

export function OlcuAletleri({ soyle }: { soyle: Soyle }) {
  const { depo, kisi, yetkiVar, saltOkunur } = useArkon();
  const { liste, yenile } = useBelgeler<Gauge>('gauges');
  const [ed, edYaz] = useState<AletTaslagi | null>(null);
  const [cal, calYaz] = useState<Kalibrasyon | null>(null);
  const [silinecek, silinecekYaz] = useState<Gauge | null>(null);
  const [q, qYaz] = useState('');
  const simdi = useSimdi(600000);
  const tmide = depo.status().mode === 'server';
  const duzenle = yetkiVar('gauge.edit') && !tmide && !saltOkunur;
  const F = <K extends keyof AletTaslagi>(k: K, v: AletTaslagi[K]) => edYaz((e) => (e ? { ...e, [k]: v } : e));

  const kaydet = async () => {
    if (!ed) return;
    if (!ed.no || !ed.type) { soyle('Alet no ve tür gerekli', 'hata'); return; }
    const { isNew, ...d } = ed;
    await belgeYaz(depo, 'gauges', d);
    gunlugeYaz(depo, 'kalibrasyon', isNew ? 'alet eklendi' : 'alet değişti', d.no, d.type);
    edYaz(null);
    yenile();
    soyle('Ölçü aleti kaydedildi');
  };
  const kalibrasyonKaydet = async () => {
    if (!cal) return;
    const g = cal.g;
    const at = new Date(`${cal.date}T12:00`).getTime() || Date.now();
    const n: Gauge = { ...g, last: cal.res === 'ok' ? at : g.last, status: cal.res === 'ok' ? 'ok' : 'out', cals: [...(g.cals ?? []), { at, by: kisi?.name ?? '', res: cal.res, cert: cal.cert, note: cal.note }].slice(-40) };
    await belgeYaz(depo, 'gauges', n);
    gunlugeYaz(depo, 'kalibrasyon', cal.res === 'ok' ? 'kalibre edildi' : 'uygunsuz · kullanım dışı', g.no, cal.cert || '');
    calYaz(null);
    yenile();
    soyle(`${g.no} kalibrasyon kaydedildi`);
  };
  const sil = async (g: Gauge) => {
    await belgeSil(depo, 'gauges', g.id);
    gunlugeYaz(depo, 'kalibrasyon', 'alet silindi', g.no);
    edYaz(null);
    yenile();
  };

  const ara = q.toLocaleLowerCase('tr-TR');
  const L = liste.filter((g) => !q || `${g.no} ${g.type} ${g.name || ''} ${g.loc || ''}`.toLocaleLowerCase('tr-TR').includes(ara)).sort((a, b) => aletVadesi(a) - aletVadesi(b));
  const csv = () => csvIndir('olcu-aletleri', [['Alet no', 'Tür', 'Ad / ölçme aralığı', 'Yer', 'Periyot (gün)', 'Son kalibrasyon', 'Sonraki', 'Durum'],
    ...L.map((g) => [g.no, g.type, `${g.name || ''} ${g.range || ''}`, g.loc || '', g.interval, g.last ? gunAy(g.last) : '', gunAy(aletVadesi(g)), aletDurumu(g, simdi).etiket])]);
  const gecmis = liste.filter((g) => g.status !== 'out' && aletVadesi(g) < simdi).length;
  const yaklasan = liste.filter((g) => g.status !== 'out' && aletVadesi(g) >= simdi && aletVadesi(g) < simdi + 30 * 864e5).length;
  return (
    <div className="tc-ay3-sayfa">
      <div className="tc-ay3-arac">
        <input className="tc-ay3-girdi" type="search" value={q} onChange={(o) => qYaz(o.target.value)} placeholder="Ara: alet no, tür, yer" aria-label="Ölçü aleti ara" />
        <span className="tc-ay3-not">{gecmis} geçmiş · {yaklasan} yaklaşan</span>
        <span className="tc-ay3-bosluk" />
        <Dugme simge="download" onClick={csv}>CSV</Dugme>
        {duzenle && <Dugme tur="birincil" simge="plus" onClick={() => edYaz({ id: `g-${yeniKimlik()}`, isNew: true, no: '', type: '', name: '', range: '', loc: '', interval: 365, last: Date.now(), status: 'ok' })}>Alet ekle</Dugme>}
      </div>
      {tmide && <small className="tc-ay3-not"><Simge ad="lock" boyut="k" /> Ölçü aletleri ve kalibrasyon kayıtları TMI&apos;de Kalibrasyon sayfasından girilir.</small>}
      {ed && (
        <form className="tc-ay3-kutu tc-ay3-form" aria-label="Ölçü aleti" onSubmit={(o) => { o.preventDefault(); void kaydet(); }}>
          <div className="tc-ay3-alanlar">
            <Girdi etiket="Alet no" value={ed.no} onChange={(o) => F('no', o.target.value.toUpperCase())} placeholder="MK-012" />
            <Girdi etiket="Tür (kontrol planındaki ölçü aleti adıyla)" value={ed.type} onChange={(o) => F('type', o.target.value)} list="tc-ay4-alet-turleri" placeholder="Mikrometre" />
            <Girdi etiket="Ölçme aralığı / çözünürlük" value={ed.range || ''} onChange={(o) => F('range', o.target.value)} placeholder="25–50 mm · 0,001" />
            <Girdi etiket="Yer / zimmet" value={ed.loc || ''} onChange={(o) => F('loc', o.target.value)} />
            <Girdi etiket="Kalibrasyon periyodu (gün)" type="number" min={1} value={ed.interval} onChange={(o) => F('interval', +o.target.value || 365)} />
            <Girdi etiket="Son kalibrasyon" type="date" value={yerelGirdi(ed.last || Date.now()).slice(0, 10)} onChange={(o) => F('last', new Date(`${o.target.value}T12:00`).getTime())} />
          </div>
          <datalist id="tc-ay4-alet-turleri">{ALET_TURLERI.map((x) => <option key={x} value={x} />)}</datalist>
          <div className="tc-ay3-dugmeler">
            {!ed.isNew && <Dugme type="button" tur="tehlike" onClick={() => silinecekYaz(ed)}>Sil</Dugme>}
            <Dugme type="button" onClick={() => edYaz(null)}>Vazgeç</Dugme>
            <Dugme type="submit" tur="birincil" simge="check">Kaydet</Dugme>
          </div>
        </form>
      )}
      <div className="tc-ay4-tablo-kutu">
        <table className="tc-ay4-tablo">
          <thead><tr><th>Alet</th><th>Tür</th><th>Yer</th><th className="tc-ay4-sayi">Periyot</th><th className="tc-ay4-sayi">Son</th><th className="tc-ay4-sayi">Sonraki</th><th>Durum</th><th /></tr></thead>
          <tbody>
            {L.map((g) => {
              const t = aletDurumu(g, simdi);
              return (
                <Fragment key={g.id}>
                  <tr>
                    <td><b>{g.no}</b> <small className="tc-ay3-not">{g.range || ''}</small></td><td>{g.type}</td><td>{g.loc || '—'}</td>
                    <td className="tc-ay4-sayi">{g.interval} gün</td><td className="tc-ay4-sayi">{g.last ? gunAy(g.last) : '—'}</td><td className="tc-ay4-sayi">{gunAy(aletVadesi(g))}</td>
                    <td><Cip renk={t.renk}>{t.etiket}</Cip></td>
                    <td>{duzenle && (
                      <span className="tc-ay3-dugmeler">
                        <Dugme onClick={() => calYaz({ g, date: yerelGirdi(Date.now()).slice(0, 10), res: 'ok', cert: '', note: '' })}>Kalibrasyon</Dugme>
                        <Dugme onClick={() => edYaz({ ...g })}>Düzenle</Dugme>
                      </span>
                    )}</td>
                  </tr>
                  {cal && cal.g.id === g.id && (
                    <tr><td colSpan={8}>
                      <form className="tc-ay3-form" aria-label="Kalibrasyon" onSubmit={(o) => { o.preventDefault(); void kalibrasyonKaydet(); }}>
                        <div className="tc-ay3-alanlar">
                          <Girdi etiket="Tarih" type="date" value={cal.date} onChange={(o) => calYaz({ ...cal, date: o.target.value })} />
                          <Secim etiket="Sonuç" value={cal.res} onChange={(o) => calYaz({ ...cal, res: o.target.value as 'ok' | 'nok' })} secenekler={[{ deger: 'ok', baslik: 'Uygun' }, { deger: 'nok', baslik: 'Uygunsuz · kullanım dışı' }]} />
                          <Girdi etiket="Sertifika no" value={cal.cert} onChange={(o) => calYaz({ ...cal, cert: o.target.value })} />
                          <Girdi etiket="Not" value={cal.note} onChange={(o) => calYaz({ ...cal, note: o.target.value })} />
                        </div>
                        <div className="tc-ay3-dugmeler"><Dugme type="button" onClick={() => calYaz(null)}>Vazgeç</Dugme><Dugme type="submit" tur="birincil">Kaydet</Dugme></div>
                        {(g.cals ?? []).length > 0 && (
                          <small className="tc-ay3-not">Geçmiş: {[...(g.cals ?? [])].reverse().slice(0, 6).map((x) => `${gunAy(x.at)} ${x.res === 'ok' ? 'uygun' : 'uygunsuz'}${x.cert ? ` (${x.cert})` : ''}`).join(' · ')}</small>
                        )}
                      </form>
                    </td></tr>
                  )}
                </Fragment>
              );
            })}
            {!L.length && <tr><td colSpan={8} className="tc-ay3-not">Ölçü aleti yok. Alet eklenince kalibrasyonu geçmiş türle ölçüm girilirken uyarı çıkar.</td></tr>}
          </tbody>
        </table>
      </div>
      <OnayPenceresi acik={silinecek !== null} baslik="Ölçü aletini sil" tehlikeli onayMetni="Sil"
        onayla={() => { const g = silinecek; silinecekYaz(null); if (g) void sil(g); }} vazgec={() => silinecekYaz(null)}>
        <p>{silinecek?.no} silinsin mi?</p>
      </OnayPenceresi>
    </div>
  );
}

export interface NumuneIstegi { hazir: boolean; bekliyor: boolean; gonder: () => void }
// Kaliteye numune isteği (kart #1083): görev kartındaki hatırlatma ve ilk parça uyarısı açar. A1 kullanır.
export function NumunePenceresi({ st, numune, kapat }: { st: string; numune: NumuneIstegi; kapat: () => void }) {
  return (
    <Pencere acik kapat={kapat} baslik={`Kaliteye numune · ${st}`}
      alt={(
        <>
          <Dugme boyut="ana" onClick={kapat} data-ilk-odak>Vazgeç</Dugme>
          <Dugme boyut="ana" tur="birincil" simge="target" disabled={!numune.hazir || numune.bekliyor} onClick={() => { kapat(); numune.gonder(); }}>Numune gönder</Dugme>
        </>
      )}>
      <p className="tc-ay3-not">
        {!numune.hazir ? 'Bu işin kontrol planı yok; numune gönderilemez.'
          : numune.bekliyor ? 'Önceki numune kalitede · sonuç bekleniyor.'
          : 'Numune isteği Kalite ekranına düşer. Onay ya da red kaliteciden gelir; gönderince iş onaylanmış olmaz.'}
      </p>
    </Pencere>
  );
}
