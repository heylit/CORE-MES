import { useId, useState } from 'react';
import { Dugme, Kart, Rozet, Sekmeler, Simge, type RozetTonu } from '../../../../ortak/arayuz/index.ts';
import { SatirOnayi } from '../program/ortak.tsx';
import { useDenetim } from '../baglam.tsx';
import { ICR } from '../icerik/ic-denetim.ts';
import { PROC_TPL } from '../icerik/kys-yapi.ts';
import { PTYPE } from '../icerik/programlar.ts';
import {
  ayEtiketi, buAy, icBaslat, icBitir, icOtomatikPlan, icPlaniEsitle, icPlanSatirlari, icRaporMetni, icSayilari, icVadesiGelenler, planAylari,
  SAHA_SABLONLARI, sahaAcikUygunsuzluklar, sahaSon, sahaVadesi,
} from '../kurallar/ic-denetim.ts';
import { yeniKimlik } from '../kurallar/profil.ts';
import { bugunTarihi, tarihMetni } from '../tarih.ts';
import type { IcSonucu, IcYurutme, Profil, SahaMaddesi, SahaTuru, Surec } from '../tipler.ts';
import './p3-ortak.css';
import './ic-denetim.css';

// İç denetim (ISO 9001 9.2): yıllık plan, süreç denetimi yürütme ve saha kontrolleri. Hesaplar kurallar/ic-denetim.ts'tedir; ekran
// yalnız gösterir ve kaydı useDenetim().degistir ile değiştirir. Yazma düğmeleri yalnız yazabilende görünür (T11).

type Sekme = 'plan' | 'yurut' | 'saha';
const SEKMELER: { anahtar: Sekme; baslik: string; simge: 'clock' | 'clipboard-check' | 'pin' }[] = [
  { anahtar: 'plan', baslik: 'Yıllık plan', simge: 'clock' },
  { anahtar: 'yurut', baslik: 'Denetimler', simge: 'clipboard-check' },
  { anahtar: 'saha', baslik: 'Saha kontrolleri', simge: 'pin' },
];
const sekmeMi = (v: string): v is Sekme => v === 'plan' || v === 'yurut' || v === 'saha';
const esit = (a: string, b: string) => a.trim().toLocaleLowerCase('tr') === b.trim().toLocaleLowerCase('tr');
const SONUC_TONU: Record<Exclude<IcSonucu, ''>, RozetTonu> = { u: 'tamam', g: 'bilgi', m: 'uyari', M: 'hata', na: 'pasif' };
const SAHA_SONUCU: [SahaMaddesi['r'], string][] = [['ok', 'Uygun'], ['no', 'Uygun değil'], ['na', 'N/A']];

// Kişi alanları serbest metindir; kişiler listesi yalnız öneridir (210.5).
function KisiOnerisi({ id }: { id: string }) {
  const d = useDenetim();
  return <datalist id={id}>{d.kisiler.map((k) => <option key={k.id} value={k.ad} />)}</datalist>;
}

export function IcDenetim() {
  const d = useDenetim();
  const tab: Sekme = sekmeMi(d.ekran.ic.tab) ? d.ekran.ic.tab : 'plan';
  // Açık yürütme ya da saha turu ("s:<id>"). Kayıttaki son değerden başlar; okuyucu da bitmiş denetimi açıp görebilsin diye ekrandadır.
  const [acik, acikYaz] = useState(d.profil.ic.cur);
  const sekmeSec = (s: Sekme) => { d.ekranDegistir((e) => { e.ic.tab = s; }); acikYaz(''); };
  const ac = (id: string, s: Sekme) => { d.ekranDegistir((e) => { e.ic.tab = s; }); acikYaz(id); window.scrollTo?.({ top: 0 }); };

  const yurutme = d.profil.ic.runs.find((x) => x.id === acik);
  const saha = acik.startsWith('s:') ? d.profil.ic.saha.find((x) => `s:${x.id}` === acik) : undefined;

  let icerik;
  if (saha) icerik = <SahaYurut tur={saha} kapat={() => { acikYaz(''); }} />;
  else if (yurutme && tab === 'yurut') icerik = <Yurut r={yurutme} kapat={() => { acikYaz(''); }} />;
  else if (tab === 'plan') icerik = <Plan ac={ac} />;
  else if (tab === 'yurut') icerik = <Liste ac={ac} />;
  else icerik = <SahaKontrolleri ac={ac} />;

  return (
    <div className="tc-dhd">
      {d.ekran.ux !== 'uzman' && (
        <p className="tc-dhd-aciklama">ISO 9001 · 9.2: planlı iç denetimler ve atölyede kısa saha kontrolleri. Bulgular takvime, DÖF son günlerine ve Performans sayfasına otomatik işlenir.</p>
      )}
      <Sekmeler etiket="İç denetim sekmeleri" sekmeler={SEKMELER} secili={tab} sec={sekmeSec} />
      {icerik}
    </div>
  );
}

function tipikSurecleriEkle(t: Profil) {
  for (const tp of PROC_TPL) {
    t.kys.procs.push({
      id: `s${yeniKimlik()}`, type: tp[0] as Surec['type'], name: tp[1], owner: tp[2], inputs: tp[3], outputs: tp[4], kpi: tp[5], unit: tp[6], target: tp[7], dir: tp[8],
      res: tp[9] || '', who: tp[10] || '', how: tp[11] || '', risk: tp[12] || '', vals: {},
    });
  }
}

function Plan({ ac }: { ac: (id: string, s: Sekme) => void }) {
  const d = useDenetim();
  const liste = useId();
  const satirlar = icPlanSatirlari(d.profil);
  const cy = buAy();
  const pencere = planAylari();
  const vade = icVadesiGelenler(d.profil);
  const yaz = d.yetki.yazabilir;
  const baslat = (pid: string) => {
    let id: string | null = null;
    d.degistir('İç denetim', (t) => { id = icBaslat(t, pid); }, { sessiz: true });
    if (id) ac(id, 'yurut');
  };

  if (!satirlar.length) {
    return (
      <Kart>
        <div className="tc-dhd-bos">
          <Simge ad="rotate" boyut="b" />
          <h3>Önce süreçlerinizi tanımlayın</h3>
          <p>İç denetim planı süreç bazında yapılır. KYS · Süreçler bölümünde süreçlerinizi tanımlayın ya da tipik bir üretim firmasının süreçleriyle başlayın.</p>
          <div className="tc-dhd-dugmeler">
            {yaz && (
              <Dugme tur="birincil" simge="plus" onClick={() => { d.degistir('Süreç şablonu', tipikSurecleriEkle, { bildirim: `${String(PROC_TPL.length)} süreç eklendi; sahiplerini ve hedeflerini düzenleyin` }); }}>Tipik süreçleri ekle</Dugme>
            )}
            <Dugme onClick={() => { d.git('kys', { kys: 'surec' }); }}>Süreçlere git</Dugme>
          </div>
        </div>
      </Kart>
    );
  }

  let planli = 0;
  let yapilan = 0;
  for (const o of satirlar) {
    for (const ym of o.r.months) {
      if (!pencere.includes(ym)) continue;
      planli++;
      if (d.profil.ic.runs.some((x) => x.pid === o.r.pid && x.done && x.date.slice(0, 7) === ym)) yapilan++;
    }
  }
  const hucreDegistir = (pid: string, ym: string) => {
    d.degistir(null, (t) => {
      icPlaniEsitle(t);
      const row = t.ic.plan.rows.find((r) => r.pid === pid);
      if (!row) return;
      const i = row.months.indexOf(ym);
      if (i >= 0) row.months.splice(i, 1); else row.months.push(ym);
      row.months.sort();
    });
  };
  const denetciYaz = (pid: string, v: string) => {
    d.degistir(null, (t) => {
      icPlaniEsitle(t);
      const row = t.ic.plan.rows.find((r) => r.pid === pid);
      if (row) row.aud = v.slice(0, 80);
    });
  };

  return (
    <>
      {vade.length > 0 && (
        <Kart baslik="Şimdi yapılacak" baslikEki={<Rozet ton="uyari">{`${String(vade.length)} denetim`}</Rozet>}>
          <ul className="tc-dhd-satirlar">
            {vade.map((v) => (
              <li key={`${v.o.r.pid}-${v.m}`} className="tc-dhd-satir">
                <Simge ad="clipboard-check" />
                <span className="tc-dhd-iki">
                  <b>{v.o.p.name}</b>
                  <small>{`${ayEtiketi(v.m)} · ${v.late ? 'gecikti' : 'bu ay'}${v.o.r.aud ? ` · denetçi ${v.o.r.aud}` : ''}`}</small>
                </span>
                {yaz && <Dugme tur="birincil" onClick={() => { baslat(v.o.r.pid); }}>Başlat</Dugme>}
              </li>
            ))}
          </ul>
        </Kart>
      )}
      <Kart
        baslik="İç denetim programı · önümüzdeki 12 ay"
        baslikEki={<Rozet ton="bilgi">{`${String(yapilan)}/${String(planli)} tamamlandı`}</Rozet>}
        sag={yaz ? (
          <Dugme
            simge="bolt"
            onClick={() => { d.degistir('İç denetim planı', icOtomatikPlan, { bildirim: 'Plan oluşturuldu: ana süreçler yılda iki, diğerleri bir kez' }); }}
          >
            Otomatik planla
          </Dugme>
        ) : undefined}
      >
        {d.ekran.ux !== 'uzman' && (
          <p className="tc-dhd-aciklama">Hücreye tıklayarak o aya denetim planlayın. Ana süreçler yılda iki kez, diğerleri en az bir kez denetlenmeli. Denetçi kendi sürecini denetleyemez.</p>
        )}
        <KisiOnerisi id={liste} />
        <div className="tc-dhd-kaydir">
          <table className="tc-dhd-plan" aria-label="İç denetim programı">
            <thead>
              <tr>
                <th scope="col">Süreç</th>
                <th scope="col">Denetçi</th>
                {pencere.map((ym) => <th key={ym} scope="col" className={ym === cy ? 'tc-dhd-buay' : undefined}>{ayEtiketi(ym)}</th>)}
              </tr>
            </thead>
            <tbody>
              {satirlar.map((o) => {
                const bagimsizDegil = !!o.r.aud && !!o.p.owner && esit(o.r.aud, o.p.owner);
                return (
                  <tr key={o.r.pid}>
                    <th scope="row">
                      <span className="tc-dhd-iki"><b>{o.p.name}</b><small>{(PTYPE[o.p.type] ?? '') + (o.p.owner ? ` · ${o.p.owner}` : '')}</small></span>
                    </th>
                    <td>
                      {yaz ? (
                        <input
                          className="tc-dhd-girdi" aria-label={`${o.p.name} denetçisi`} list={liste} value={o.r.aud} placeholder="Ad soyad" aria-invalid={bagimsizDegil || undefined}
                          onChange={(e) => { denetciYaz(o.r.pid, e.target.value); }}
                        />
                      ) : <span>{o.r.aud || '–'}</span>}
                      {bagimsizDegil && <small className="tc-dhy-ton-kotu">Bağımsız değil</small>}
                    </td>
                    {pencere.map((ym) => {
                      const pl = o.r.months.includes(ym);
                      const dn = d.profil.ic.runs.some((x) => x.pid === o.r.pid && x.done && x.date.slice(0, 7) === ym);
                      const st = dn ? 'yapildi' : pl && ym < cy ? 'gecikti' : pl ? 'planli' : 'bos';
                      const durum = { yapildi: 'yapıldı', gecikti: 'gecikti', planli: 'planlandı', bos: 'plan yok' }[st];
                      return (
                        <td key={ym} className={ym === cy ? 'tc-dhd-buay' : undefined}>
                          <button
                            type="button" className={`tc-dhd-hucre tc-dhd-hucre-${st}`} disabled={!yaz} aria-pressed={pl}
                            aria-label={`${o.p.name} ${ayEtiketi(ym)}: ${durum}`} onClick={() => { hucreDegistir(o.r.pid, ym); }}
                          >
                            {dn ? <Simge ad="check" boyut="k" /> : pl ? '●' : ''}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="tc-dhd-lejant">
          <span><i className="tc-dhd-hucre tc-dhd-hucre-planli">●</i>Planlandı</span>
          <span><i className="tc-dhd-hucre tc-dhd-hucre-yapildi">✓</i>Yapıldı</span>
          <span><i className="tc-dhd-hucre tc-dhd-hucre-gecikti">●</i>Gecikti</span>
        </div>
      </Kart>
    </>
  );
}

function sonucOzeti(r: IcYurutme): string {
  const c = icSayilari(r);
  if (!r.done) return `Devam ediyor · ${String(r.items.length - c.x)}/${String(r.items.length)}`;
  return `${c.M ? `${String(c.M)} majör · ` : ''}${c.m ? `${String(c.m)} minör · ` : ''}${c.g ? `${String(c.g)} gözlem · ` : ''}${String(c.u)} uygun`;
}

function Liste({ ac }: { ac: (id: string, s: Sekme) => void }) {
  const d = useDenetim();
  const I = d.profil.ic;
  const acik = I.runs.filter((x) => !x.done);
  const biten = I.runs.filter((x) => x.done);
  const procs = d.profil.kys.procs;
  const yaz = d.yetki.yazabilir;
  return (
    <>
      {yaz && (
        <Kart baslik="Plansız denetim başlat">
          {procs.length ? (
            <label className="tc-dhd-secim">
              <span className="tc-dhd-gizli">Süreç</span>
              <select
                value=""
                onChange={(e) => {
                  const pid = e.target.value;
                  if (!pid) return;
                  let id: string | null = null;
                  d.degistir('İç denetim', (t) => { id = icBaslat(t, pid); }, { sessiz: true });
                  if (id) ac(id, 'yurut');
                }}
              >
                <option value="">Süreç seçin…</option>
                {procs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          ) : <p className="tc-dhd-aciklama">Önce KYS · Süreçler bölümünde süreç tanımlayın.</p>}
        </Kart>
      )}
      <Kart baslik="Denetimler" baslikEki={<Rozet ton="bilgi">{`${String(acik.length)} açık · ${String(biten.length)} tamamlandı`}</Rozet>}>
        {!I.runs.length && <p className="tc-dhd-aciklama">Henüz iç denetim yok. Yıllık plandan ya da yukarıdan bir süreç seçerek başlayın.</p>}
        <ul className="tc-dhd-satirlar">
          {acik.concat(biten).slice(0, 40).map((r) => (
            <li key={r.id} className="tc-dhd-satir">
              <Simge ad={r.done ? 'check' : 'clipboard-check'} />
              <span className="tc-dhd-iki">
                <b>{r.pname}</b>
                <small>{`${tarihMetni(r.date)} · ${sonucOzeti(r)}${r.aud ? ` · ${r.aud}` : ''}`}</small>
              </span>
              <Dugme tur={!r.done && yaz ? 'birincil' : 'ikincil'} onClick={() => { ac(r.id, 'yurut'); }}>{!r.done && yaz ? 'Devam et' : 'Görüntüle'}</Dugme>
            </li>
          ))}
        </ul>
      </Kart>
    </>
  );
}

function Yurut({ r, kapat }: { r: IcYurutme; kapat: () => void }) {
  const d = useDenetim();
  const liste = useId();
  const [silSor, silSorYaz] = useState(false);
  const c = icSayilari(r);
  const k = r.items.length - c.x;
  const kilitli = r.done || !d.yetki.yazabilir;
  const yurutmeDegistir = (f: (x: IcYurutme) => void, etiket: string | null = null) => {
    d.degistir(etiket, (t) => {
      const x = t.ic.runs.find((y) => y.id === r.id);
      if (x && !x.done) f(x);
    });
  };
  const kopyala = () => {
    const metin = icRaporMetni(d.profil, r);
    if (!(navigator.clipboard as Clipboard | undefined)) { d.bildir('Kopyalanamadı; tarayıcı izin vermedi', { ton: 'hata' }); return; }
    navigator.clipboard.writeText(metin).then(() => { d.bildir('Rapor kopyalandı', { ton: 'bilgi' }); }, () => { d.bildir('Kopyalanamadı; tarayıcı izin vermedi', { ton: 'hata' }); });
  };

  return (
    <>
      <Kart
        baslik={r.pname}
        baslikEki={<Rozet ton={r.done ? 'tamam' : 'bilgi'}>{r.done ? 'Tamamlandı' : 'Süreç denetimi · kontrol listesi'}</Rozet>}
        sag={<Dugme simge="chev-left" onClick={kapat}>Listeye dön</Dugme>}
      >
        <KisiOnerisi id={liste} />
        <div className="tc-dhd-meta">
          <label className="tc-dhd-alan">
            <span>Tarih</span>
            <input type="date" className="tc-dhd-girdi" value={r.date} disabled={kilitli} onChange={(e) => { const v = e.target.value; if (/^\d{4}-\d{2}-\d{2}$/.test(v)) yurutmeDegistir((x) => { x.date = v; }); }} />
          </label>
          <label className="tc-dhd-alan">
            <span>Denetçi</span>
            <input className="tc-dhd-girdi" list={liste} value={r.aud} placeholder="Ad soyad" disabled={kilitli} onChange={(e) => { const v = e.target.value.slice(0, 80); yurutmeDegistir((x) => { x.aud = v; }); }} />
          </label>
          <span className="tc-dhd-ozet">
            <Rozet ton="pasif">{`${String(k)}/${String(r.items.length)}`}</Rozet>
            {c.M > 0 && <Rozet ton="hata">{`${String(c.M)} majör`}</Rozet>}
            {c.m > 0 && <Rozet ton="uyari">{`${String(c.m)} minör`}</Rozet>}
            {c.g > 0 && <Rozet ton="bilgi">{`${String(c.g)} gözlem`}</Rozet>}
          </span>
        </div>
        <progress className="tc-dhd-ilerleme" max={r.items.length || 1} value={k} aria-label="Cevaplanan madde" />
      </Kart>
      <ol className="tc-dhd-maddeler">
        {r.items.map((i, ix) => (
          <li key={`${String(ix)}-${i.c}`} className={`tc-dhd-madde${i.r ? ` tc-dhd-madde-${i.r}` : ''}`}>
            <div className="tc-dhd-madde-bas"><span className="tc-dhd-mono">{i.c}</span><b>{i.t}</b></div>
            {i.h && <small className="tc-dhd-soluk">{`Kanıt: ${i.h}`}</small>}
            <div className="tc-dhd-secenekler" role="group" aria-label={`${String(ix + 1)}. madde sonucu`}>
              {(Object.keys(ICR) as Exclude<IcSonucu, ''>[]).map((v) => (
                <button
                  key={v} type="button" className={`tc-dhd-sec tc-dhd-sec-${SONUC_TONU[v]}`} aria-pressed={i.r === v} disabled={kilitli}
                  onClick={() => { yurutmeDegistir((x) => { const it = x.items[ix]; if (it) it.r = it.r === v ? '' : v; }); }}
                >
                  {ICR[v]}
                </button>
              ))}
            </div>
            {((i.r && i.r !== 'u' && i.r !== 'na') || i.n) && (
              <input
                className="tc-dhd-girdi" aria-label={`${String(ix + 1)}. madde bulgusu`} value={i.n} placeholder="Bulgu: ne görüldü, hangi kayıtta, örnek" disabled={kilitli}
                onChange={(e) => { const v = e.target.value.slice(0, 400); yurutmeDegistir((x) => { const it = x.items[ix]; if (it) it.n = v; }); }}
              />
            )}
          </li>
        ))}
      </ol>
      <Kart>
        <div className="tc-dhd-alt">
          {r.done ? (
            <>
              <span className="tc-dhd-soluk">Bulgular takvime ve Performans sayfasına işlendi; majör ve minör bulgular için DÖF son günü oluşturuldu.</span>
              <span className="tc-dhd-dugmeler">
                <Dugme simge="file" onClick={kopyala}>Raporu kopyala</Dugme>
                <Dugme onClick={() => { d.git('takvim'); }}>Takvimde gör</Dugme>
              </span>
            </>
          ) : (
            <>
              <span className="tc-dhd-soluk">{c.x ? `${String(c.x)} madde cevaplanmadı.` : 'Tüm maddeler cevaplandı.'}</span>
              {d.yetki.yazabilir && (
                <span className="tc-dhd-dugmeler">
                  {silSor ? (
                    <SatirOnayi
                      metin="Denetim silinsin mi?" evet="Sil" vazgec={() => { silSorYaz(false); }}
                      onayla={() => {
                        silSorYaz(false);
                        d.degistir('İç denetim silme', (t) => { t.ic.runs = t.ic.runs.filter((x) => x.id !== r.id); t.ic.cur = ''; }, { bildirim: 'Denetim silindi' });
                        kapat();
                      }}
                    />
                  ) : <Dugme simge="trash" onClick={() => { silSorYaz(true); }}>Sil</Dugme>}
                  <Dugme
                    tur="birincil" simge="check" disabled={c.x > 0}
                    onClick={() => {
                      d.degistir('İç denetim kaydı', (t) => { const x = t.ic.runs.find((y) => y.id === r.id); if (x && !x.done && !icSayilari(x).x) icBitir(t, x); }, { bildirim: 'İç denetim tamamlandı; bulgular takvime ve Performans\'a işlendi' });
                      window.scrollTo?.({ top: 0 });
                    }}
                  >
                    Denetimi tamamla
                  </Dugme>
                </span>
              )}
            </>
          )}
        </div>
      </Kart>
    </>
  );
}

const siklikMetni = (f: number): string => (f === 7 ? 'Haftalık' : f === 14 ? 'İki haftada bir' : 'Aylık');

function SahaKontrolleri({ ac }: { ac: (id: string, s: Sekme) => void }) {
  const d = useDenetim();
  const acikUyg = sahaAcikUygunsuzluklar(d.profil);
  const gecmis = d.profil.ic.saha.filter((x) => x.done).slice(0, 10);
  const yaz = d.yetki.yazabilir;
  const baslat = (tpl: string) => {
    const t0 = SAHA_SABLONLARI.find((s) => s.id === tpl);
    if (!t0) return;
    const id = `s${yeniKimlik()}`;
    d.degistir(null, (t) => {
      t.ic.saha.unshift({ id, tpl: t0.id, date: bugunTarihi(), by: t.kys.roles['kys']?.kisi ?? '', done: false, items: t0.items.map(() => ({ r: '', n: '', fix: false })) });
      t.ic.cur = `s:${id}`;
    });
    ac(`s:${id}`, 'saha');
  };

  return (
    <>
      <div className="tc-dhd-izgara">
        {SAHA_SABLONLARI.map((t) => {
          const son = sahaSon(d.profil, t.id);
          const vade = sahaVadesi(d.profil, t);
          const hata = acikUyg.L.filter((x) => x.run.tpl === t.id).length;
          return (
            <Kart key={t.id} baslik={t.n} baslikEki={<span className="tc-dhd-mono">{t.c}</span>}>
              <div className="tc-dhd-sablon">
                <small className="tc-dhd-soluk">{`${siklikMetni(t.f)} · ${String(t.items.length)} madde`}</small>
                <span className="tc-dhd-sablon-durum">
                  <span>{son ? `Son: ${tarihMetni(son.date)}` : 'Henüz yapılmadı'}</span>
                  {vade && (
                    <span className={vade.dd < 0 ? 'tc-dhy-ton-kotu' : vade.dd <= 2 ? 'tc-dhy-ton-uyari' : undefined}>
                      {vade.dd < 0 ? `${String(-vade.dd)} gün gecikti` : vade.dd === 0 ? 'bugün' : `${String(vade.dd)} gün sonra`}
                    </span>
                  )}
                </span>
                {hata > 0 && <Rozet ton="hata">{`${String(hata)} açık uygunsuzluk`}</Rozet>}
                {yaz && <Dugme tur="birincil" simge="play" onClick={() => { baslat(t.id); }}>Başlat</Dugme>}
              </div>
            </Kart>
          );
        })}
      </div>
      {acikUyg.n > 0 && (
        <Kart baslik="Açık uygunsuzluklar" baslikEki={<Rozet ton="hata">{String(acikUyg.n)}</Rozet>}>
          <ul className="tc-dhd-satirlar">
            {acikUyg.L.map((x) => {
              const t = SAHA_SABLONLARI.find((s) => s.id === x.run.tpl);
              const it = x.run.items[x.k];
              return (
                <li key={`${x.run.id}-${String(x.k)}`} className="tc-dhd-satir">
                  <Simge ad="alert" />
                  <span className="tc-dhd-iki">
                    <b>{t?.items[x.k] ?? ''}</b>
                    <small>{`${t?.n ?? ''} · ${tarihMetni(x.run.date)}${it?.n ? ` · ${it.n}` : ''}`}</small>
                  </span>
                  {yaz && (
                    <Dugme
                      onClick={() => {
                        d.degistir('Saha düzeltme', (tt) => { const s = tt.ic.saha.find((y) => y.id === x.run.id); const m = s?.items[x.k]; if (m) m.fix = true; }, { bildirim: 'Düzeltildi olarak işaretlendi' });
                      }}
                    >
                      Düzeltildi
                    </Dugme>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="tc-dhd-not">
            Tekrar eden ya da ciddi uygunsuzluklar için DÖF açın.{' '}
            <button type="button" className="tc-dhd-baglanti" onClick={() => { d.git('kys', { kys: 'uret', dokuman: 'f_dof' }); }}>Uygunsuzluk ve DÖF formu</button>
          </p>
        </Kart>
      )}
      {gecmis.length > 0 && (
        <Kart baslik="Son turlar">
          <ul className="tc-dhd-satirlar">
            {gecmis.map((x) => {
              const t = SAHA_SABLONLARI.find((s) => s.id === x.tpl);
              const no = x.items.filter((i) => i.r === 'no').length;
              return (
                <li key={x.id} className="tc-dhd-satir">
                  <Simge ad={no ? 'alert' : 'check'} />
                  <span className="tc-dhd-iki">
                    <b>{t?.n ?? x.tpl}</b>
                    <small>{`${tarihMetni(x.date)} · ${no ? `${String(no)} uygunsuz` : 'tümü uygun'}${x.by ? ` · ${x.by}` : ''}`}</small>
                  </span>
                </li>
              );
            })}
          </ul>
        </Kart>
      )}
    </>
  );
}

function SahaYurut({ tur, kapat }: { tur: SahaTuru; kapat: () => void }) {
  const d = useDenetim();
  const liste = useId();
  const t = SAHA_SABLONLARI.find((s) => s.id === tur.tpl);
  const k = tur.items.filter((i) => i.r).length;
  const kilitli = tur.done || !d.yetki.yazabilir;
  const turDegistir = (f: (x: SahaTuru) => void, etiket: string | null = null) => {
    d.degistir(etiket, (tt) => { const x = tt.ic.saha.find((y) => y.id === tur.id); if (x) f(x); });
  };
  if (!t) return null;
  return (
    <>
      <Kart
        baslik={t.n}
        baslikEki={<span className="tc-dhd-soluk">{`${t.c} · sahada maddeleri tek tek kontrol edin`}</span>}
        sag={(
          <Dugme
            simge="chev-left"
            onClick={() => {
              if (!tur.done && d.yetki.yazabilir) d.degistir(null, (tt) => { tt.ic.saha = tt.ic.saha.filter((x) => x.id !== tur.id); tt.ic.cur = ''; });
              kapat();
            }}
          >
            {tur.done ? 'Listeye dön' : 'Vazgeç'}
          </Dugme>
        )}
      >
        <KisiOnerisi id={liste} />
        <div className="tc-dhd-meta">
          <label className="tc-dhd-alan">
            <span>Kontrol eden</span>
            <input className="tc-dhd-girdi" list={liste} value={tur.by} placeholder="Ad soyad" disabled={kilitli} onChange={(e) => { const v = e.target.value.slice(0, 80); turDegistir((x) => { x.by = v; }); }} />
          </label>
          <Rozet ton="pasif">{`${String(k)}/${String(tur.items.length)}`}</Rozet>
        </div>
      </Kart>
      <ol className="tc-dhd-maddeler">
        {t.items.map((metin, ix) => {
          const i = tur.items[ix];
          if (!i) return null;
          return (
            <li key={metin} className={`tc-dhd-madde${i.r ? ` tc-dhd-saha-${i.r}` : ''}`}>
              <div className="tc-dhd-madde-bas"><b>{metin}</b></div>
              <div className="tc-dhd-secenekler" role="group" aria-label={`${String(ix + 1)}. madde sonucu`}>
                {SAHA_SONUCU.map(([v, ad]) => (
                  <button
                    key={v} type="button" className={`tc-dhd-sec tc-dhd-sec-${v === 'ok' ? 'tamam' : v === 'no' ? 'hata' : 'pasif'}`} aria-pressed={i.r === v} disabled={kilitli}
                    onClick={() => { turDegistir((x) => { const m = x.items[ix]; if (m) m.r = m.r === v ? '' : v; }); }}
                  >
                    {ad}
                  </button>
                ))}
              </div>
              {(i.r === 'no' || i.n) && (
                <input
                  className="tc-dhd-girdi" aria-label={`${String(ix + 1)}. madde notu`} value={i.n} placeholder="Ne görüldü? Örn. tezgâhta eski revizyon resim" disabled={kilitli}
                  onChange={(e) => { const v = e.target.value.slice(0, 300); turDegistir((x) => { const m = x.items[ix]; if (m) m.n = v; }); }}
                />
              )}
            </li>
          );
        })}
      </ol>
      {!tur.done && d.yetki.yazabilir && (
        <Kart>
          <div className="tc-dhd-alt">
            <span className="tc-dhd-soluk">{k < tur.items.length ? `${String(tur.items.length - k)} madde kaldı.` : 'Tüm maddeler kontrol edildi.'}</span>
            <Dugme
              tur="birincil" simge="check" disabled={k < tur.items.length}
              onClick={() => {
                const no = tur.items.filter((i) => i.r === 'no').length;
                d.degistir('Saha turu', (tt) => {
                  const x = tt.ic.saha.find((y) => y.id === tur.id);
                  if (x) { x.done = true; x.date = bugunTarihi(); }
                  tt.ic.cur = '';
                }, { bildirim: no ? `${String(no)} uygunsuzluk kaydedildi` : 'Tur kaydedildi: tümü uygun' });
                kapat();
              }}
            >
              Turu kaydet
            </Dugme>
          </div>
        </Kart>
      )}
    </>
  );
}
