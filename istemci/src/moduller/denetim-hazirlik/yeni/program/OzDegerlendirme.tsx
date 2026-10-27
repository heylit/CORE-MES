import { useState } from 'react';
import { Dugme, Girdi, Kart, Rozet } from '../../../../ortak/arayuz/index.ts';
import { useDenetim } from '../baglam.tsx';
import { prototipSimgesi } from '../gorunumler.ts';
import { indir, guvenliAd, icsKatla } from '../disa-aktar.ts';
import { CRIT, SCALE } from '../icerik/iso9001.ts';
import { OZF, OZV } from '../icerik/programlar.ts';
import { ozKapsama, ozNotu, ozSonrakiVade, ozTurAdi, ozTurBaslat, ozTurBitir, turDegisimi, turPuani } from '../kurallar/oz.ts';
import { aktifSorular, grupYuzdesi, kuralBaglami, puanHesapla } from '../kurallar/puan.ts';
import { gunFarki, tarihMetni } from '../tarih.ts';

import type { Cevap, OzSikligi } from '../tipler.ts';
import { notTonu, ozIcsSatirlari, PUANLAMA_KURALI, puanTonu } from './hesaplar.ts';
import { OzEgri } from './grafikler.tsx';
import { ProgramBandi, PSimge, rozetTonu, SatirOnayi, tonSinifi } from './ortak.tsx';
import { useSoruyaGit } from './paylasilan.tsx';

const kisaTarih = (iso: string): string => { const t = new Date(`${iso}T00:00:00`); return `${String(t.getDate())} ${t.toLocaleDateString('tr-TR', { month: 'short' })}`; };
const BUYUKLUKLER = [5, 10, 15, 20] as const;
const PUANLAR: readonly Cevap[] = ['0', '1', '2', '3', 'na'];
type Onay = 'bastan' | 'iptal' | 'bitir' | { sil: string } | null;

const NotRozeti = ({ g }: { g: string }) => <Rozet ton={rozetTonu(notTonu(g))}>{g}</Rozet>;

export function OzDegerlendirme() {
  const d = useDenetim();
  const soruyaGit = useSoruyaGit();
  const [onay, onayYaz] = useState<Onay>(null);
  const kb = d.kb;
  const w = kb.calisma;
  const o = w.oz;
  const pg = kb.pg;
  const yaz = d.yetki.yazabilir;
  const qs = aktifSorular(pg, w.def);
  const soruyla = new Map(pg.Q.map((q) => [q.id, q]));
  const turlar = o.rounds.map((r) => { const sc = turPuani(r, pg); return { r, pct: sc.pct, g: ozNotu(sc.pct), n: Object.keys(r.items).length }; });
  const son = turlar[turlar.length - 1];
  const vade = ozSonrakiVade(o);
  const kalan = vade ? gunFarki(vade) : null;
  const kapsama = ozKapsama(kb);
  const genel = puanHesapla(qs, w.ans, pg);
  const genelNot = ozNotu(genel.pct);
  const fark = son ? turDegisimi(son.r, pg) : null;
  const gruplar = pg.GORDER.filter((g) => qs.some((x) => x.g === g));
  const grupAdi = (g: string) => `${d.program === 'eydep' ? '' : `${g} `}${pg.CL[g]?.n ?? g}`;
  const c = o.cur;
  const puanli = c ? c.qids.filter((id) => OZV.has(c.items[id]?.v ?? '')).length : 0;

  // Tur başlatma ve değiştirme: kayıt üzerinde kural çalışır; düşen puan sayısı bildirilir (prototip ozAct).
  const turKur = (tur: 'full' | 'group' | 'rot', grup = '') => {
    const degisim = !!o.cur;
    let dusen = 0;
    onayYaz(null);
    if (!degisim) d.degistir(null, (t) => { dusen = ozTurBaslat(kuralBaglami(t, d.program), tur, grup); });
    else {
      // Bildirim metni yazmadan sonra belli olur (düşen puan); geri al etiketi prototipteki gibi "Tur değişikliği".
      d.degistir('Tur değişikliği', (t) => { dusen = ozTurBaslat(kuralBaglami(t, d.program), tur, grup); }, { sessiz: true });
      const metin = dusen ? `${String(dusen)} puan yeni turun dışında kaldı`
        : tur === 'full' ? 'Tam tura geçildi, puanlar korundu' : tur === 'rot' ? `${String(o.size)} soruluk tura geçildi, puanlar korundu` : 'Tur değiştirildi, puanlar korundu';
      d.bildir(metin, { geriAl: true });
    }
    document.getElementById('tc-dhp-acik-tur')?.scrollIntoView({ block: 'start' });
  };
  const bitir = () => {
    onayYaz(null);
    let tamam = false;
    let pct: number | null = null;
    d.degistir('Tur kaydı', (t) => {
      const oz = t.pw[d.program].oz;
      tamam = ozTurBitir(kuralBaglami(t, d.program));
      const r = oz.rounds[oz.rounds.length - 1];
      if (tamam && r) pct = turPuani(r, pg).pct;
    }, { sessiz: true });
    if (!tamam) { d.bildir('Puanlanmış soru yok', { ton: 'bilgi' }); return; }
    window.scrollTo({ top: 0 });
    d.bildir(`Tur kaydedildi: %${pct == null ? '–' : String(pct)} · ${ozNotu(pct)}`, { geriAl: true });
  };
  const onayla = () => {
    const o2 = onay;
    onayYaz(null);
    if (o2 === 'bastan') d.degistir('Baştan başlatma', (t) => { const cur = t.pw[d.program].oz.cur; if (cur) cur.items = {}; }, { bildirim: 'Turun puanları silindi' });
    else if (o2 === 'iptal') { d.degistir('Tur iptali', (t) => { t.pw[d.program].oz.cur = null; }, { bildirim: 'Açık tur iptal edildi' }); window.scrollTo({ top: 0 }); }
    else if (o2 === 'bitir') bitir();
    else if (o2 && typeof o2 === 'object') d.degistir('Tur silme', (t) => { const oz = t.pw[d.program].oz; oz.rounds = oz.rounds.filter((r) => r.id !== o2.sil); }, { bildirim: 'Tur silindi' });
  };
  const ayar = (f: (oz: typeof o) => void) => { d.degistir(null, (t) => { f(t.pw[d.program].oz); }); };
  const icsIndir = () => {
    indir(`${guvenliAd(`oz-degerlendirme-${pg.s}-${kb.profil.profile.firma || 'firma'}`)}.ics`, `${ozIcsSatirlari(kb, d.depo.active).map(icsKatla).join('\r\n')}\r\n`, 'text/calendar');
    d.bildir('Tekrarlayan hatırlatma dosyası indirildi');
  };

  const grupSecimi = (bos: string) => (
    <label className="tc-dhp-secim">
      <span className="tc-gizli-etiket">{`${pg.unit} bazında tur`}</span>
      <select value="" aria-label={`${pg.unit} bazında tur`} onChange={(e) => { if (e.target.value) turKur('group', e.target.value); }}>
        <option value="">{bos}</option>
        {gruplar.map((g) => <option key={g} value={g}>{grupAdi(g)}</option>)}
      </select>
    </label>
  );

  const baslik = son ? (kalan != null && kalan < 0 ? 'Tur zamanı geçti' : kalan === 0 ? 'Bugün tur günü' : `Sıradaki tura ${String(kalan)} gün`) : 'İlk turunuzu başlatın';

  return (
    <div className="tc-dhp">
      <ProgramBandi r={genel} />
      <Kart>
        <div className="tc-dhp-oz-ust">
          <div className={`tc-dhp-not-kutu ${tonSinifi(notTonu(genelNot))}`}>
            <b>{genelNot}</b>
            <span>{genel.pct == null ? 'Not yok' : `%${String(genel.pct)} güncel`}</span>
          </div>
          <div className="tc-dhp-oz-metin">
            <h2 className="tc-dhp-hero-baslik">{baslik}</h2>
            <ul className="tc-dhp-olgular">
              {son ? (
                <li>
                  <PSimge ad="clock" />
                  <span>
                    {`Son tur: ${tarihMetni(son.r.date)} · %${String(son.pct)} `}<NotRozeti g={son.g} />
                    {fark != null && <b className={tonSinifi(fark > 0 ? 'iyi' : fark < 0 ? 'kotu' : 'soluk')}>{` ${fark > 0 ? '+' : ''}${String(fark)} puan, aynı sorularda`}</b>}
                  </span>
                </li>
              ) : (
                <li><PSimge ad="info" /><span>{`Her tur ${String(o.size)} soru sorar; cevaplar genel hazırlık notunuza işler. ${OZF[o.freq].n} bir tur, bir yılda tüm soruları birkaç kez taramanızı sağlar.`}</span></li>
              )}
              {vade && (
                <li>
                  <PSimge ad="cal" />
                  <span>{`Sıradaki tur: ${tarihMetni(vade)}`}{kalan != null && kalan < 0 && <b className="tc-dhy-ton-kotu">{` · ${String(-kalan)} gün gecikti`}</b>}</span>
                </li>
              )}
              <li><PSimge ad="target" /><span>{`Kapsama: son ${String(kapsama.win)} günde ${String(kapsama.k)}/${String(kapsama.n)} soru değerlendirildi`}</span></li>
            </ul>
            {yaz && (c ? (
              <div className="tc-dhp-dugmeler">
                <Dugme tur="birincil" simge="clipboard-check" onClick={() => { document.getElementById('tc-dhp-acik-tur')?.scrollIntoView({ block: 'start' }); }}>Açık tura devam et</Dugme>
                {c.kind === 'full'
                  ? <Dugme onClick={() => { turKur('rot'); }}>{`${String(o.size)} soruluk tura geç`}</Dugme>
                  : <Dugme onClick={() => { turKur('full'); }}>{`Tam tura geç (${String(qs.length)})`}</Dugme>}
                <Dugme simge="x" onClick={() => { onayYaz('iptal'); }}>Turu iptal et</Dugme>
              </div>
            ) : (
              <div className="tc-dhp-dugmeler">
                <Dugme tur="birincil" simge="play" onClick={() => { turKur('rot'); }}>{`Turu başlat (${String(Math.min(o.size, qs.length))} soru)`}</Dugme>
                <Dugme onClick={() => { turKur('full'); }}>{`Tam tur (${String(qs.length)} soru)`}</Dugme>
                {grupSecimi(`${pg.unit} bazında tur…`)}
              </div>
            ))}
            <div className="tc-dhp-oz-ayar">
              <div className="tc-dhp-alan">
                <span>Sıklık</span>
                <div className="tc-dhp-segment" role="group" aria-label="Sıklık">
                  {(Object.keys(OZF) as OzSikligi[]).map((k) => <button key={k} type="button" aria-pressed={o.freq === k} disabled={!yaz} onClick={() => { ayar((oz) => { oz.freq = k; }); }}>{OZF[k].n}</button>)}
                </div>
              </div>
              <div className="tc-dhp-alan">
                <span>Tur büyüklüğü</span>
                <div className="tc-dhp-segment" role="group" aria-label="Tur büyüklüğü">
                  {BUYUKLUKLER.map((n) => <button key={n} type="button" aria-pressed={o.size === n} disabled={!yaz} onClick={() => { ayar((oz) => { oz.size = n; }); }}>{n}</button>)}
                </div>
              </div>
              <Girdi
                etiket="Değerlendiren" defaultValue={o.by} placeholder="Ad soyad" autoComplete="off" list="tc-dhp-kisiler" readOnly={!yaz}
                onChange={(e) => { const v = e.target.value; ayar((oz) => { oz.by = v; if (oz.cur) oz.cur.by = v; }); }}
              />
              <datalist id="tc-dhp-kisiler">{d.kisiler.map((k) => <option key={k.id} value={k.ad} />)}</datalist>
              <Dugme simge="download" onClick={icsIndir}>Takvime tekrarlayan hatırlatma</Dugme>
            </div>
          </div>
        </div>
      </Kart>

      {c && (
        <div id="tc-dhp-acik-tur">
          <Kart simge={prototipSimgesi('clip')} baslik={`Açık tur · ${tarihMetni(c.date)} · ${ozTurAdi(c.kind, pg)}`} sag={<small className="tc-dhy-ton-soluk">{`${String(puanli)}/${String(c.qids.length)} puanlandı`}</small>}>
            {yaz && (
              <div className="tc-dhp-cubuk tc-dhp-yapiskan">
                <span className="tc-dhp-cubuk-yazi">{`${String(puanli)}/${String(c.qids.length)} puanlandı`}</span>
                <div className="tc-dhp-segment" role="group" aria-label="Tur türü">
                  <button type="button" aria-pressed={c.kind === 'rot'} onClick={() => { turKur('rot'); }}>{`${String(o.size)} soru`}</button>
                  <button type="button" aria-pressed={c.kind === 'full'} onClick={() => { turKur('full'); }}>Tam tur</button>
                </div>
                {grupSecimi(c.kind.startsWith('group:') ? ozTurAdi(c.kind, pg) : `${pg.unit}…`)}
                <Dugme simge="rotate" disabled={!d.geriAlinabilir} title="Son işlemi geri al (Ctrl Z)" onClick={d.geriAl}>Geri al</Dugme>
                {onay === 'bastan'
                  ? <SatirOnayi metin={`${String(puanli)} puan silinsin mi?`} evet="Baştan başlat" onayla={onayla} vazgec={() => { onayYaz(null); }} />
                  : <Dugme simge="rotate" disabled={!puanli} onClick={() => { onayYaz('bastan'); }}>Baştan başlat</Dugme>}
                {onay === 'iptal'
                  ? <SatirOnayi metin="Tur iptal edilsin mi?" evet="İptal et" onayla={onayla} vazgec={() => { onayYaz(null); }} />
                  : <Dugme simge="x" onClick={() => { onayYaz('iptal'); }}>İptal</Dugme>}
              </div>
            )}
            <progress className="tc-dhp-ilerleme" aria-label="Puanlanan" max={Math.max(1, c.qids.length)} value={puanli} />
            <details className="tc-dhp-rehber">
              <summary><PSimge ad="info" /> Puanlama nasıl? Örnekle</summary>
              <dl>{SCALE.map((s) => <div key={s.v} className={`tc-dhp-p${s.v}`}><dt>{`${s.v === 'na' ? 'N/A' : s.v} · ${s.t}`}</dt><dd>{s.d}</dd></div>)}</dl>
              <p className="tc-dhy-ton-soluk">{PUANLAMA_KURALI}</p>
            </details>
            <ol className="tc-dhp-oz-liste">
              {c.qids.map((id) => {
                const x = soruyla.get(id);
                if (!x) return null;
                const it = c.items[id] ?? { v: '', n: '' };
                const onceki = w.ans[id];
                const sonGun = o.last[id];
                return (
                  <li key={id} className={`tc-dhp-oz-soru${OZV.has(it.v) ? ' tc-dhp-oz-soru-tamam' : ''}`}>
                    <div className="tc-dhp-balon-kim">
                      <span className="tc-dhp-madde">{x.c}</span>
                      <span>{pg.CL[x.g]?.s ?? x.g}</span>
                      <span className={x.w === 3 ? 'tc-dhy-ton-kotu' : x.w === 2 ? 'tc-dhy-ton-uyari' : 'tc-dhy-ton-soluk'}>{CRIT[x.w]}</span>
                      <span className="tc-dhp-sag tc-dhy-ton-soluk">{`${onceki === undefined ? 'İlk kez' : `Önceki: ${onceki === 'na' ? 'N/A' : onceki}`}${sonGun ? ` · ${String(-gunFarki(sonGun))} gün önce` : ''}`}</span>
                    </div>
                    <p>{x.q}</p>
                    <details><summary>Aranan kanıtlar</summary><ul>{x.ev.map((k) => <li key={k}>{k}</li>)}</ul></details>
                    <div className="tc-dhp-segment" role="group" aria-label="Puan">
                      {PUANLAR.map((v) => (
                        <button
                          key={v} type="button" aria-pressed={it.v === v} disabled={!yaz} title={SCALE.find((s) => s.v === v)?.t}
                          className={`tc-dhp-p${v}`}
                          onClick={() => { onayYaz(null); d.degistir('Puan', (t) => { const cur = t.pw[d.program].oz.cur; if (!cur) return; const m = cur.items[id] ?? (cur.items[id] = { v: '', n: '' }); m.v = m.v === v ? '' : v; }, { sessiz: true }); }}
                        >{v === 'na' ? 'N/A' : v}</button>
                      ))}
                    </div>
                    <input
                      className="tc-dhp-kisa-not" defaultValue={it.n} readOnly={!yaz} aria-label="Kısa not" placeholder="Kısa not veya kanıtın yeri (isteğe bağlı)"
                      onChange={(e) => { const v = e.target.value; d.degistir(null, (t) => { const cur = t.pw[d.program].oz.cur; if (!cur) return; const m = cur.items[id] ?? (cur.items[id] = { v: '', n: '' }); m.n = v; }); }}
                    />
                  </li>
                );
              })}
            </ol>
            {yaz && (onay === 'bitir' ? (
              <SatirOnayi
                tur="birincil" metin={`${String(c.qids.length - puanli)} soru puanlanmadı; bunlar tura dahil edilmeyecek.`} evet="Yine de tamamla"
                onayla={onayla} vazgec={() => { onayYaz(null); }}
              />
            ) : (
              <div className="tc-dhp-dugmeler">
                <Dugme tur="birincil" simge="check" disabled={!puanli} onClick={() => { if (puanli < c.qids.length) onayYaz('bitir'); else bitir(); }}>Turu tamamla ve not ver</Dugme>
                <Dugme onClick={() => { onayYaz('iptal'); }}>Turu iptal et</Dugme>
              </div>
            ))}
          </Kart>
        </div>
      )}

      {turlar.length > 0 && (
        <>
          <Kart simge={prototipSimgesi('chart')} baslik="Not eğilimi" sag={<small className="tc-dhy-ton-soluk">Her nokta bir tur</small>}>
            <OzEgri turlar={turlar.slice(-24).map((t) => ({ date: t.r.date, pct: t.pct, g: t.g, n: t.n, tur: ozTurAdi(t.r.kind, pg) }))} />
          </Kart>
          <Kart simge={prototipSimgesi('layers')} baslik={`${pg.unit} bazında son turlar`}>
            <div className="tc-dhp-tablo-kap">
              <table className="tc-dhp-tablo">
                <thead><tr><th scope="col"><span className="tc-gizli-etiket">{pg.unit}</span></th>{turlar.slice(-6).map((t) => <th key={t.r.id} scope="col">{kisaTarih(t.r.date)}</th>)}</tr></thead>
                <tbody>
                  {gruplar.map((g) => (
                    <tr key={g}>
                      <th scope="row">{pg.CL[g]?.s ?? g}</th>
                      {turlar.slice(-6).map((t) => { const p = grupYuzdesi(turPuani(t.r, pg).groups[g]); return <td key={t.r.id}><span className={`tc-dhp-oz-hucre ${p == null ? 'tc-dhp-oz-hucre-bos' : tonSinifi(puanTonu(p))}`}>{p == null ? '–' : p}</span></td>; })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Kart>
          {son && (() => {
            const gerileyen = Object.entries(son.r.items).map(([id, it]) => ({ x: soruyla.get(id), it }))
              .filter((g) => g.x && g.it.pv !== '' && g.it.pv !== 'na' && g.it.v !== 'na' && Number(g.it.v) < Number(g.it.pv));
            if (!gerileyen.length) return null;
            return (
              <Kart simge={prototipSimgesi('alert')} baslik="Son turda gerileyenler">
                <ul className="tc-dhp-adimlar">
                  {gerileyen.map(({ x, it }) => x && (
                    <li key={x.id}>
                      <button type="button" className="tc-dhp-adim tc-dhp-adim-risk" onClick={() => { soruyaGit(x.id); }}>
                        <span className="tc-dhp-adim-simge"><PSimge ad="alert" /></span>
                        <span><b>{x.q}</b><small>{`${x.c} · ${it.pv} → ${it.v}${it.n ? ` · ${it.n}` : ''}`}</small></span>
                        <PSimge ad="chev" />
                      </button>
                    </li>
                  ))}
                </ul>
              </Kart>
            );
          })()}
          <Kart simge={prototipSimgesi('list')} baslik="Tur geçmişi">
            <ul className="tc-dhp-gecmis">
              {turlar.slice().reverse().map((t) => {
                const dl = turDegisimi(t.r, pg);
                return (
                  <li key={t.r.id}>
                    <b>{tarihMetni(t.r.date)}</b>
                    <span className="tc-dhy-ton-soluk">{[ozTurAdi(t.r.kind, pg), `${String(t.n)} soru`, t.r.by].filter(Boolean).join(' · ')}</span>
                    <b>{`%${t.pct == null ? '–' : String(t.pct)}`}</b>
                    <NotRozeti g={t.g} />
                    <span className={tonSinifi(dl == null ? 'soluk' : dl > 0 ? 'iyi' : dl < 0 ? 'kotu' : 'soluk')}>{dl == null ? 'ilk' : `${dl > 0 ? '+' : ''}${String(dl)}`}</span>
                    {yaz && (typeof onay === 'object' && onay?.sil === t.r.id
                      ? <SatirOnayi metin="Silinsin mi?" evet="Sil" onayla={onayla} vazgec={() => { onayYaz(null); }} />
                      : <button type="button" className="tc-dhp-baglanti" aria-label="Turu sil" title="Turu sil" onClick={() => { onayYaz({ sil: t.r.id }); }}><PSimge ad="trash" /></button>)}
                  </li>
                );
              })}
            </ul>
            <p className="tc-dhy-ton-soluk">Değişim, turdaki soruların bir önceki puanlarıyla karşılaştırılır. Bir turu silmek geçmişten kaldırır; o turda verilen cevaplar genel hazırlık notunda kalır.</p>
          </Kart>
        </>
      )}
      {!turlar.length && !c && (
        <Kart>
          <div className="tc-dhp-bos-durum">
            <span className="tc-dhp-bos-simge"><PSimge ad="repeat" /></span>
            <h2>Nasıl çalışır?</h2>
            <p>{`${OZF[o.freq].n} kısa bir tur yapın. Araç en uzun süredir bakılmayan, kritik ve zayıf soruları seçer; siz dürüstçe puanlarsınız. Her turun notu kaydedilir, eğilim grafiği ve gerileyen sorular burada görünür. Cevaplar genel hazırlık puanınızı da günceller.`}</p>
          </div>
        </Kart>
      )}

    </div>
  );
}
