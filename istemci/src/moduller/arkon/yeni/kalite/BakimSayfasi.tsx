import { useEffect, useState } from 'react';
import type { LogEvent, Maint, PlannedDown } from '../../../../../../arkon/shared/model.ts';
import { Dugme, Girdi, OnayPenceresi, Secim, Simge } from '../../../../ortak/arayuz/index.ts';
import { dakika, dakikaMetni, gunAy, gunAySaat, yerelGirdi } from '../cekirdek/bicim.ts';
import { aktif, istasyonBul, istasyonListesi } from '../cekirdek/tesis.ts';
import { belgeSil, belgeYaz, useArkon, useBelgeler, useSimdi } from '../veri/baglam.ts';
import {
  Cip, IstasyonSecimi, SayfaCercevesi, Secmeli, csvIndir, gunlugeYaz, useSoyle, useYerelSecim, useYetkiDenetimi, yeniKimlik, type Soyle,
} from '../pano/index.tsx';
import {
  ARIZA_SEBEPLERI, arizaMi, guvenilirlik, makineAdi, planKalanGun, planMi, planVadesi, yaklasanBakimSayisi, type Ariza, type BakimPlani, type YapilanBakim,
} from './kurallar.ts';

// Bakım (bakim-raporlar.ts MaintApp, FaultView, PmView, RelView): arıza kayıtları, periyodik bakım ve makine güvenilirliği (MTBF, MTTR).
// Arıza açma ve kapatma 'maint.work', plan 'maint.plan', bakım için planlı duruş 'down.edit' ister; sunucu da denetler.
const GUN = 864e5;
type Sekme = 'ariza' | 'plan' | 'mc';

export function BakimSayfasi() {
  const soyle = useSoyle();
  const [sekme, sekmeYaz] = useYerelSecim<Sekme>('maintTab', 'ariza');
  const { liste, yenile } = useBelgeler<Maint>('maint');
  const simdi = useSimdi(60000);
  const acik = liste.filter(arizaMi).filter((m) => m.status !== 'done').length;
  const vade = yaklasanBakimSayisi(liste, simdi);
  return (
    <SayfaCercevesi simge="wrench" baslik="Bakım" ek={(
      <Secmeli etiket="Bakım bölümü" deger={sekme} degistir={sekmeYaz}
        secenekler={[{ k: 'ariza', etiket: 'Arızalar', sayi: acik || null }, { k: 'plan', etiket: 'Periyodik bakım', sayi: vade || null }, { k: 'mc', etiket: 'Makine güvenilirliği' }]} />
    )}>
      {sekme === 'ariza' ? <Arizalar liste={liste} yenile={yenile} soyle={soyle} />
        : sekme === 'plan' ? <PeriyodikBakim liste={liste} yenile={yenile} soyle={soyle} />
          : <Guvenilirlik liste={liste} />}
    </SayfaCercevesi>
  );
}

type ArizaTaslagi = Ariza & { isNew?: boolean };

function Arizalar({ liste, yenile, soyle }: { liste: Maint[]; yenile: () => void; soyle: Soyle }) {
  const { depo, ayarlar, kisi, yetkiVar, saltOkunur } = useArkon();
  const [ed, edYaz] = useState<ArizaTaslagi | null>(null);
  const [gun, gunYaz] = useState(30);
  const simdi = useSimdi(30000);
  const duzenle = yetkiVar('maint.work') && !saltOkunur;
  const arizalar = liste.filter(arizaMi).sort((a, b) => b.openedAt - a.openedAt);
  const acik = arizalar.filter((m) => m.status !== 'done');
  const kapanan = arizalar.filter((m) => m.status === 'done' && (m.closedAt ?? 0) > simdi - gun * GUN);
  const ilkMakine = (st: string) => istasyonBul(ayarlar.tesis, st).mcs[0]?.id ?? '';

  const kaydet = async (m: Ariza, ek: Partial<Ariza>, ileti: string) => {
    const n: Ariza = { ...m, ...ek };
    await belgeYaz(depo, 'maint', n);
    gunlugeYaz(depo, 'bakım', ileti, n.st + (n.mc ? ` · ${n.mc}` : ''), n.title);
    yenile();
    edYaz(null);
    soyle(`Arıza kaydı: ${ileti}`);
  };
  const yeni = (): ArizaTaslagi => {
    const st = istasyonListesi(ayarlar.tesis)[0]?.id ?? '';
    return { id: `ar-${Date.now()}`, isNew: true, type: 'ariza', st, mc: ilkMakine(st), title: '', openedAt: Date.now(), openedBy: kisi?.name ?? '', status: 'open' };
  };
  const F = <K extends keyof ArizaTaslagi>(k: K, v: ArizaTaslagi[K]) => edYaz((e) => (e ? { ...e, [k]: v } : e));

  const form = (e: ArizaTaslagi) => (
    <form className="tc-ay3-kutu tc-ay3-form" aria-label={e.isNew ? 'Yeni arıza' : 'Arızayı kapat'}
      onSubmit={(o) => {
        o.preventDefault();
        const { isNew, ...d } = e;
        if (isNew) { if (d.title) void kaydet({ ...d, wc: istasyonBul(ayarlar.tesis, d.st).wc || null }, {}, 'açıldı'); return; }
        if (d.cause) void kaydet(d, { status: 'done', closedAt: Date.now(), closedBy: kisi?.name ?? '', repairMs: Date.now() - (d.openedAt || Date.now()) }, 'kapatıldı');
      }}>
      <div className="tc-ay3-alanlar">
        {e.isNew ? (
          <>
            <label className="tc-alan"><span className="tc-alan-etiket">İstasyon</span><IstasyonSecimi deger={e.st} degistir={(v) => edYaz({ ...e, st: v, mc: ilkMakine(v) })} /></label>
            <Secim etiket="Makine" value={e.mc || ''} onChange={(o) => F('mc', o.target.value)}
              secenekler={[{ deger: '', baslik: '—' }, ...istasyonBul(ayarlar.tesis, e.st).mcs.map((m) => ({ deger: m.id, baslik: `${m.id} · ${m.name}` }))]} />
            <Girdi etiket="Arıza" value={e.title} onChange={(o) => F('title', o.target.value)} placeholder="örn. Hidrolik kaçak, ayna basıncı düşük" />
          </>
        ) : (
          <>
            <Secim etiket="Sebep" value={e.cause || ''} onChange={(o) => F('cause', o.target.value)}
              secenekler={[{ deger: '', baslik: 'Seç' }, ...ARIZA_SEBEPLERI.map((c) => ({ deger: c, baslik: c }))]} />
            <Girdi etiket="Yapılan işlem" value={e.action || ''} onChange={(o) => F('action', o.target.value)} placeholder="örn. Conta değişti, basınç ayarlandı" />
            <Girdi etiket="Kullanılan parça" value={e.parts || ''} onChange={(o) => F('parts', o.target.value)} placeholder="örn. O-ring 32×3 (2 ad.)" />
          </>
        )}
      </div>
      <div className="tc-ay3-dugmeler">
        <Dugme onClick={() => edYaz(null)}>Vazgeç</Dugme>
        {e.isNew
          ? <Dugme type="submit" tur="birincil" simge="check" disabled={!e.title}>Arıza kaydı aç</Dugme>
          : <Dugme type="submit" tur="birincil" simge="check" disabled={!e.cause}>Kapat · makine hazır</Dugme>}
      </div>
    </form>
  );

  const satir = (m: Ariza) => (
    <div key={m.id} className="tc-ay3-kutu" aria-label={`Arıza ${m.st}`}>
      <div className="tc-ay3-arac">
        <Simge ad="wrench" />
        <div><b>{m.st}{m.mc ? ` · ${makineAdi(ayarlar, m.mc) || m.mc}` : ''}</b><div className="tc-ay3-not">{m.title}{m.orderNo ? ` · ${m.orderNo}` : ''}</div></div>
        <span className="tc-ay3-bosluk" />
        <Cip renk={m.status === 'done' ? 'run' : m.status === 'work' ? 'hazard' : 'stop'}>
          {m.status === 'done' ? `Kapandı · ${dakikaMetni(m.repairMs)}` : m.status === 'work' ? `Müdahalede · ${dakikaMetni(simdi - m.openedAt)}` : `Açık · ${dakikaMetni(simdi - m.openedAt)}`}
        </Cip>
      </div>
      <small className="tc-ay3-not">
        Açılış {gunAySaat(m.openedAt)} · {m.openedBy || '—'}{m.ackAt ? ` · üstlendi ${m.ackBy || ''} (${dakika(m.ackAt - m.openedAt)} dk sonra)` : ''}
        {m.closedAt ? ` · kapanış ${gunAySaat(m.closedAt)} · ${m.closedBy || ''}` : ''}
      </small>
      {m.status === 'done'
        ? <small><b>{m.cause}</b>{m.action ? ` · ${m.action}` : ''}{m.parts ? ` · Parça: ${m.parts}` : ''}</small>
        : duzenle && !(ed && ed.id === m.id) && (
          <div className="tc-ay3-dugmeler">
            {m.status === 'open' && <Dugme onClick={() => { void kaydet(m, { status: 'work', ackAt: Date.now(), ackBy: kisi?.name ?? '' }, 'üstlenildi'); }}>Üstlen</Dugme>}
            <Dugme tur="birincil" onClick={() => edYaz({ ...m })}>Kapat…</Dugme>
          </div>
        )}
      {ed && ed.id === m.id && !ed.isNew && form(ed)}
    </div>
  );

  return (
    <div className="tc-ay3-sayfa">
      <div className="tc-ay3-arac">
        <span className="tc-ay3-ust">Bakım çağrısı üstlenilince arıza kaydı kendiliğinden açılır. Kapatırken sebep ve yapılan işlem girilir; MTTR / MTBF bunlardan hesaplanır.</span>
        <span className="tc-ay3-bosluk" />
        {duzenle && <Dugme tur="birincil" simge="plus" onClick={() => edYaz(yeni())}>Arıza kaydı aç</Dugme>}
      </div>
      {ed?.isNew && form(ed)}
      <span className="tc-ay3-ust">Açık · {acik.length}</span>
      {acik.length ? acik.map(satir) : <small className="tc-ay3-not">Açık arıza yok.</small>}
      <div className="tc-ay3-arac">
        <span className="tc-ay3-ust">Kapanan · son</span>
        <Secmeli etiket="Kapanan aralığı" deger={gun} degistir={gunYaz} secenekler={[{ k: 7, etiket: '7 gün' }, { k: 30, etiket: '30 gün' }, { k: 90, etiket: '90 gün' }]} />
      </div>
      {kapanan.length ? kapanan.map(satir) : <small className="tc-ay3-not">Bu aralıkta kapanan arıza yok.</small>}
    </div>
  );
}

type PlanTaslagi = BakimPlani & { isNew?: boolean };
interface DurusTaslagi { p: BakimPlani; from: number; min: number }

function PeriyodikBakim({ liste, yenile, soyle }: { liste: Maint[]; yenile: () => void; soyle: Soyle }) {
  const { depo, ayarlar, ayarlariYenile, kisi, yetkiVar, saltOkunur } = useArkon();
  const yetkili = useYetkiDenetimi();
  const [ed, edYaz] = useState<PlanTaslagi | null>(null);
  const [dn, dnYaz] = useState<DurusTaslagi | null>(null);
  const [silinecek, silinecekYaz] = useState<BakimPlani | null>(null);
  const simdi = useSimdi(60000);
  const duzenle = yetkiVar('maint.plan') && !saltOkunur;
  const yapar = yetkiVar('maint.work') && !saltOkunur;
  const durusEkler = yetkiVar('down.edit') && !saltOkunur;
  const planlar = liste.filter(planMi).sort((a, b) => planVadesi(a) - planVadesi(b));
  const gecmis = liste.filter((m): m is YapilanBakim => m.type === 'pm').sort((a, b) => b.at - a.at);
  const makineler = ayarlar.tesis.mcs.filter(aktif);
  const F = <K extends keyof PlanTaslagi>(k: K, v: PlanTaslagi[K]) => edYaz((e) => (e ? { ...e, [k]: v } : e));

  const planKaydet = async () => {
    if (!ed) return;
    if (!ed.mc || !ed.title) { soyle('Makine ve bakım adı gerekli', 'hata'); return; }
    const { isNew, ...d } = ed;
    const kayit: BakimPlani = { ...d, st: ayarlar.tesis.mcs.find((m) => m.id === d.mc)?.st || '' };
    await belgeYaz(depo, 'maint', kayit);
    gunlugeYaz(depo, 'bakım', isNew ? 'periyodik plan eklendi' : 'periyodik plan değişti', kayit.mc, `${kayit.title} · ${kayit.everyDays} günde bir`);
    edYaz(null);
    yenile();
    soyle('Bakım planı kaydedildi');
  };
  const yapildi = async (p: BakimPlani) => {
    if (!yetkili('maint.work')) return;
    const at = Date.now();
    const pm: YapilanBakim = { id: `pm-${at}`, type: 'pm', planId: p.id, mc: p.mc, st: p.st, title: p.title, at, by: kisi?.name ?? '' };
    await belgeYaz(depo, 'maint', pm);
    const sonraki: BakimPlani = { ...p, lastAt: at };
    await belgeYaz(depo, 'maint', sonraki);
    gunlugeYaz(depo, 'bakım', 'periyodik bakım yapıldı', p.mc, p.title);
    yenile();
    soyle(`${p.title} yapıldı · sonraki ${gunAy(at + p.everyDays * GUN)}`);
  };
  const durusEkle = async () => {
    if (!dn || !yetkili('down.edit')) return;
    const p = dn.p;
    const neden = ayarlar.durusNedenleri.find((r) => r.code === 'D-07') ?? ayarlar.durusNedenleri.find((r) => r.cat === 'p');
    const d: PlannedDown = {
      id: `dn-${yeniKimlik()}`, title: `Bakım · ${p.title}`, reason: neden?.code ?? '', scope: 'st', target: p.st ?? '', from: dn.from, to: dn.from + dn.min * 60e3,
      rep: 'none', note: p.mc, by: kisi?.name ?? '', at: Date.now(),
    };
    await belgeYaz(depo, 'downs', d);
    ayarlariYenile();
    depo.Bus.send({ type: 'cfg' });
    gunlugeYaz(depo, 'planlı duruş', 'bakım için eklendi', d.title, gunAySaat(d.from));
    dnYaz(null);
    soyle(`Planlı duruş eklendi · ${gunAySaat(d.from)}`, 'bilgi');
  };
  const sil = async (p: BakimPlani) => {
    await belgeSil(depo, 'maint', p.id);
    gunlugeYaz(depo, 'bakım', 'periyodik plan silindi', p.mc, p.title);
    edYaz(null);
    yenile();
  };

  return (
    <div className="tc-ay3-sayfa">
      <div className="tc-ay3-arac">
        <span className="tc-ay3-ust">Makine başına periyodik bakımlar. Yaklaşan bakım için planlı duruş eklenince OEE ve iş planı buna göre ayarlanır.</span>
        <span className="tc-ay3-bosluk" />
        {duzenle && (
          <Dugme tur="birincil" simge="plus" onClick={() => edYaz({ id: `pl-${yeniKimlik()}`, isNew: true, type: 'plan', mc: makineler[0]?.id ?? '', title: '', everyDays: 30, durMin: 60, lastAt: Date.now() })}>
            Bakım planı ekle
          </Dugme>
        )}
      </div>
      {!makineler.length && (
        <small className="tc-ay3-not">{depo.status().mode === 'server' ? "Önce TMI'de İstasyonlar sayfasında makine tanımla." : "Önce Ayarlar › Tesis yapısı'nda makine tanımla."}</small>
      )}
      {ed && (
        <form className="tc-ay3-kutu tc-ay3-form" aria-label="Bakım planı" onSubmit={(o) => { o.preventDefault(); void planKaydet(); }}>
          <div className="tc-ay3-alanlar">
            <Secim etiket="Makine" value={ed.mc} onChange={(o) => F('mc', o.target.value)} secenekler={makineler.map((m) => ({ deger: m.id, baslik: `${m.id} · ${m.name}${m.st ? ` · ${m.st}` : ''}` }))} />
            <Girdi etiket="Bakım" value={ed.title} onChange={(o) => F('title', o.target.value)} placeholder="örn. Yağ ve filtre değişimi" />
            <Girdi etiket="Kaç günde bir" type="number" min={1} value={ed.everyDays} onChange={(o) => F('everyDays', +o.target.value || 1)} />
            <Girdi etiket="Süre (dk)" type="number" min={0} value={ed.durMin || 0} onChange={(o) => F('durMin', +o.target.value || 0)} />
            <Girdi etiket="Son yapıldığı gün" type="date" value={yerelGirdi(ed.lastAt || Date.now()).slice(0, 10)} onChange={(o) => { const t = new Date(`${o.target.value}T12:00`).getTime(); if (t) F('lastAt', t); }} />
            <Girdi etiket="Talimat / not" value={ed.note || ''} onChange={(o) => F('note', o.target.value)} />
          </div>
          <div className="tc-ay3-dugmeler">
            {!ed.isNew && <Dugme tur="tehlike" onClick={() => silinecekYaz(ed)}>Sil</Dugme>}
            <Dugme onClick={() => edYaz(null)}>Vazgeç</Dugme>
            <Dugme type="submit" tur="birincil" simge="check">Kaydet</Dugme>
          </div>
        </form>
      )}
      {planlar.map((p) => {
        const k = planKalanGun(p, simdi);
        return (
          <div key={p.id} className="tc-ay3-kutu" aria-label={`Bakım planı ${p.title}`}>
            <div className="tc-ay3-arac">
              <Simge ad="gauge" />
              <div><b>{p.title}</b><div className="tc-ay3-not">{p.mc} · {makineAdi(ayarlar, p.mc)}{p.st ? ` · ${p.st}` : ''} · {p.everyDays} günde bir{p.durMin ? ` · ${p.durMin} dk` : ''}</div></div>
              <span className="tc-ay3-bosluk" />
              <Cip renk={k.renk}>{k.etiket}</Cip>
            </div>
            <small className="tc-ay3-not">Son: {p.lastAt ? gunAy(p.lastAt) : '—'} · Sonraki: {gunAy(planVadesi(p))}{p.note ? ` · ${p.note}` : ''}</small>
            <div className="tc-ay3-dugmeler">
              {yapar && <Dugme tur="birincil" simge="check" onClick={() => { void yapildi(p); }}>Yapıldı</Dugme>}
              {durusEkler && p.st && (
                <Dugme simge="clock" onClick={() => { const t = new Date(Math.max(simdi + 3600e3, planVadesi(p))); t.setMinutes(0, 0, 0); dnYaz({ p, from: t.getTime(), min: p.durMin || 60 }); }}>
                  Planlı duruş ekle
                </Dugme>
              )}
              {duzenle && <Dugme onClick={() => edYaz({ ...p })}>Düzenle</Dugme>}
            </div>
            {dn && dn.p.id === p.id && (
              <form className="tc-ay3-form" aria-label="Bakım için planlı duruş" onSubmit={(o) => { o.preventDefault(); void durusEkle(); }}>
                <div className="tc-ay3-alanlar">
                  <Girdi etiket="Başlangıç" type="datetime-local" value={yerelGirdi(dn.from)} onChange={(o) => dnYaz({ ...dn, from: new Date(o.target.value).getTime() || dn.from })} />
                  <Girdi etiket="Süre (dk)" type="number" value={dn.min} onChange={(o) => dnYaz({ ...dn, min: +o.target.value || 30 })} />
                </div>
                <div className="tc-ay3-dugmeler">
                  <Dugme onClick={() => dnYaz(null)}>Vazgeç</Dugme>
                  <Dugme type="submit" tur="birincil">{p.st} için planlı duruş ekle</Dugme>
                </div>
              </form>
            )}
          </div>
        );
      })}
      {gecmis.length > 0 && (
        <details className="tc-ay3-kutu">
          <summary>Yapılan periyodik bakımlar · {gecmis.length}</summary>
          {gecmis.slice(0, 100).map((h) => (
            <div key={h.id} className="tc-ay3-satir"><b>{gunAy(h.at)}</b><span>{h.mc}</span><span>{h.title}</span><small>{h.by}</small></div>
          ))}
        </details>
      )}
      <OnayPenceresi acik={silinecek !== null} baslik="Bakım planını sil" tehlikeli onayMetni="Sil"
        onayla={() => { const p = silinecek; silinecekYaz(null); if (p) void sil(p); }} vazgec={() => silinecekYaz(null)}>
        <p>Plan silinsin mi?</p>
      </OnayPenceresi>
    </div>
  );
}

function Guvenilirlik({ liste }: { liste: Maint[] }) {
  const { depo, ayarlar } = useArkon();
  const [gun, gunYaz] = useState(90);
  const [olaylar, olaylarYaz] = useState<LogEvent[] | null>(null);
  const simdi = useSimdi(300000);
  useEffect(() => {
    olaylarYaz(null);
    void depo.Log.query('events', { from: Date.now() - gun * GUN - GUN, limit: 20000 }).then((r) => olaylarYaz(r as unknown as LogEvent[]), () => olaylarYaz([]));
  }, [depo, gun]);
  const satirlar = guvenilirlik(liste, olaylar, gun, simdi, ayarlar);
  const csv = () => csvIndir(`makine-guvenilirligi-${gun}gun`, [
    ['Makine', 'Ad', 'İstasyon', 'Arıza', 'Açık', 'Çalışma (sa)', 'MTBF (sa)', 'MTTR (dk)', 'Toplam onarım (dk)', 'En sık sebep'],
    ...satirlar.map((r) => [r.m.id, r.m.name, r.m.st, r.n, r.open, r.run != null ? r.run / 3600e3 : '', r.mtbf != null ? r.mtbf / 3600e3 : '', r.mttr != null ? r.mttr / 60000 : '', r.down / 60000, r.cause ? r.cause[0] : '']),
  ]);
  return (
    <div className="tc-ay3-sayfa">
      <div className="tc-ay3-arac">
        <span className="tc-ay3-ust">MTBF = çalışma süresi ÷ arıza sayısı · MTTR = ortalama onarım süresi (açılıştan kapanışa)</span>
        <span className="tc-ay3-bosluk" />
        <Secmeli etiket="Güvenilirlik aralığı" deger={gun} degistir={gunYaz} secenekler={[{ k: 30, etiket: '30 gün' }, { k: 90, etiket: '90 gün' }, { k: 365, etiket: '1 yıl' }]} />
        <Dugme simge="download" onClick={csv}>CSV</Dugme>
      </div>
      <div className="tc-ay4-tablo-kutu">
        <table className="tc-ay4-tablo" aria-label="Makine güvenilirliği">
          <thead><tr><th>Makine</th><th>İstasyon</th><th className="tc-ay4-sayi">Arıza</th><th className="tc-ay4-sayi">Çalışma</th><th className="tc-ay4-sayi">MTBF</th><th className="tc-ay4-sayi">MTTR</th><th className="tc-ay4-sayi">Onarım</th><th>En sık sebep</th></tr></thead>
          <tbody>
            {satirlar.map((r) => (
              <tr key={r.m.id}>
                <td><b>{r.m.id}</b> <small className="tc-ay3-not">{r.m.name}</small></td>
                <td>{r.m.st || '—'}</td>
                <td className="tc-ay4-sayi">{r.n}{r.open ? <small data-renk="stop"> ({r.open} açık)</small> : null}</td>
                <td className="tc-ay4-sayi">{r.run != null ? `${Math.round(r.run / 3600e3)} sa` : '…'}</td>
                <td className="tc-ay4-sayi">{r.mtbf != null ? `${(r.mtbf / 3600e3).toFixed(1)} sa` : '—'}</td>
                <td className="tc-ay4-sayi">{r.mttr != null ? `${dakika(r.mttr)} dk` : '—'}</td>
                <td className="tc-ay4-sayi">{dakikaMetni(r.down)}</td>
                <td>{r.cause ? `${r.cause[0]} (${r.cause[1]})` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
