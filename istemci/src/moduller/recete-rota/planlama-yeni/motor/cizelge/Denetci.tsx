import { Rozet, Simge } from '../../../../../ortak/arayuz/index.ts';
import type { CalismaKomutu } from '../../kayit.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import {
  ayristir, KATEGORI_AD, nedenMetni, ONCELIK_AD, saatYaz, saatYazi, sayiYaz,
  type Ayrisim, type Derleme, type OkunanPlan, type SureKategorisi,
} from '../kurallar.ts';
import { degisken, MOTOR_NOTU, YOK_NOTU } from '../ortak.tsx';
import type { CizelgeMercegi } from './CizelgeGorunumu.tsx';
import { Dg } from './Dugme.tsx';
import { adaylar, kapasitesizEnErken, tezgahAdi, tezgahKuyrugu } from './kurallar.ts';

// Ayrıntı sekmesinin seçim panelleri: iş (c-masa.betik opDenetci), sipariş (isDenetci), tezgâh (o-tahta.betik tbTezPaneli).
// Tezgâh stüdyosu yeni ekranda yok (459/5 a). Kilitle ve kilidi aç çalışmaya yazar (plan.kilitle, 223 a ile ortak plan.yaz); taşımak, sıra ve öne almak motorla gelir (357 b).
export interface DenetciOzellikleri {
  c: PlanlamaCalismasi; p: OkunanPlan; cx: Derleme; komut: CalismaKomutu | null; planYaz: boolean; planKilitle: boolean;
  opSec: (id: string) => void; secimTemizle: () => void; tezKapat: () => void; mercekSec: (m: CizelgeMercegi) => void;
}

const kisaId = (id: string) => id.slice(id.lastIndexOf('.') + 1);
const tezYaz = (m: string) => m.replace('@', 'fason ');
const yuzdeYaz = (x: number) => `%${sayiYaz(x * 100, 0)}`;

function Kapat({ yap }: { yap: () => void }) {
  return <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" title="Kapat" aria-label="Kapat" onClick={yap}><Simge ad="x" boyut="k" /></button>;
}
function Durum({ T }: { T: number | null | undefined }) {
  return T != null && T > 0.01 ? <Rozet ton="hata">{saatYazi(T)} gecikme</Rozet> : T != null ? <Rozet ton="tamam">Zamanında</Rozet> : null;
}

// Süre ayrışımının çubuğu ve açıklaması (ayrisimCubugu): çubukta kategori sırası, açıklamada büyükten küçüğe.
const KAT_SIRA = Object.keys(KATEGORI_AD) as SureKategorisi[];
function AyrisimCubugu({ a }: { a: Ayrisim }) {
  const top = a.toplam || 1;
  const sira = KAT_SIRA.filter((k) => (a.seg[k] ?? 0) > 0.01);
  return (
    <>
      <div className="tc-pym-ay-yol" role="img" aria-label={sira.map((k) => `${KATEGORI_AD[k]} ${sayiYaz(a.seg[k] ?? 0, 1)} sa`).join(', ')}>
        {sira.map((k) => <i key={k} data-k={k} ref={degisken({ '--w': `${((a.seg[k] ?? 0) / top) * 100}%` })} title={`${KATEGORI_AD[k]}: ${sayiYaz(a.seg[k] ?? 0, 1)} sa`} />)}
      </div>
      <ul className="tc-pym-ay-lejant">
        {[...sira].sort((x, y) => (a.seg[y] ?? 0) - (a.seg[x] ?? 0)).map((k) => (
          <li key={k}><i data-k={k} /><span>{KATEGORI_AD[k]}</span><b className="tc-pym-mono">{saatYazi(a.seg[k])}</b><span className="tc-pym-mono tc-pym-kucuk-yazi">{yuzdeYaz((a.seg[k] ?? 0) / top)}</span></li>
        ))}
      </ul>
    </>
  );
}

// Siparişin adımları: her adımın tezgâhı ve başlangıcı, süresi; basmak o adımı seçer.
function Adimlar({ o, jid, secili, kilitGoster }: { o: DenetciOzellikleri; jid: string; secili?: string; kilitGoster?: boolean }) {
  const { c, p, cx } = o;
  return (
    <ul className="tc-pym-zincir">
      {(cx.jobs[jid]?.ops ?? []).map((x) => {
        const z = p.ops[x.id]; const yer = z && Number.isFinite(z.C);
        return (
          <li key={x.id}>
            <button type="button" aria-current={secili === undefined ? undefined : secili === x.id} onClick={() => o.opSec(x.id)}>
              <b className="tc-pym-mono">{kisaId(x.id)}</b>
              <span>{x.ad}<br /><small className="tc-pym-kucuk-yazi">{yer ? `${tezYaz(z.m)} · ${saatYaz(c.D, z.S)}${kilitGoster && c.locks[x.id] ? ' · kilitli' : ''}` : 'planlanmadı'}</small></span>
              <span className="tc-pym-mono">{yer ? saatYazi(z.C - z.S) : '—'}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function OpDenetci({ id, ...o }: DenetciOzellikleri & { id: string }) {
  const { c, p, cx, komut, planYaz: yaz, planKilitle } = o; const D = c.D;
  const r = p.ops[id]; if (!r) return null;
  const ad = cx.byId[id]; const s = D.siparisler.find((z) => z.id === r.job); const j = p.J[r.job];
  const l = c.locks[id]; const kilit = l && typeof l === 'object' ? (l as Record<string, unknown>) : null;
  const q = tezgahKuyrugu(p, r.m); const i = q.findIndex((x) => x.id === id);
  const komsu = q.slice(Math.max(0, i - 2), i + 3);
  const a = ayristir(p, cx, r.job);
  const kilitle = planKilitle && komut ? () => { komut.degistir('İş kilitlendi', (t) => { t.locks[id] = { m: r.m, S: r.S }; }, { ayrinti: `${id} → ${r.m} ${saatYaz(D, r.S)}`, planKoru: true }); } : null;
  const kilitAc = planKilitle && komut ? () => { komut.degistir('Kilit açıldı', (t) => { delete t.locks[id]; }, { ayrinti: id, planKoru: true }); } : null;
  const kS = kilit && typeof kilit.S === 'number' ? kilit.S : null;
  return (
    <section className="tc-pym-panel tc-pym-denetci" aria-label={`${r.job} adım ${kisaId(id)}`}>
      <div className="tc-pym-panel-ust"><h2><span className="tc-pym-mono">{r.job}</span> · adım {kisaId(id)}</h2><Kapat yap={o.secimTemizle} /></div>
      <dl className="tc-pym-dl">
        <dt>Sipariş</dt><dd><b className="tc-pym-mono">{r.job}</b> · {D.urunler.find((u) => u.id === s?.urun)?.ad ?? s?.urun ?? ''} · {s?.adet} adet</dd>
        <dt>Adım</dt><dd>{ad ? `${kisaId(id)} ${ad.ad}` : id}</dd>
        <dt>Tezgâh</dt><dd>{tezgahAdi(D, r.m)}</dd>
        <dt>Başla</dt><dd className="tc-pym-mono">{saatYaz(D, r.S)}</dd>
        {r.su > 0 && <><dt>Ayar biter</dt><dd className="tc-pym-mono">{saatYaz(D, r.Su)} · {saatYazi(r.su)}{r.famHit ? ' · aynı aile' : ''}</dd></>}
        <dt>Biter</dt><dd className="tc-pym-mono">{saatYaz(D, r.C)}</dd>
        <dt>Termin</dt><dd className="tc-pym-mono">{s?.termin || '—'} <Durum T={j?.T} /></dd>
        <dt>Bolluk</dt><dd>{r.sl == null ? '—' : r.sl <= 0.5 ? <><Rozet ton="hata">Kritik</Rozet> kayarsa sipariş ya da sonraki iş gecikir</> : `${saatYazi(r.sl)} kayabilir`}</dd>
        {kilit && <><dt>Kilit</dt><dd>{typeof kilit.m === 'string' ? tezYaz(kilit.m) : '—'}{kS != null && kS > 7 ? `, en erken ${saatYaz(D, kS)}` : ', yalnız tezgâh'}</dd></>}
      </dl>
      <div className="tc-pym-neden"><Simge ad="help" boyut="k" /><span><b>Neden bu saatte:</b> {nedenMetni(r)}</span></div>
      <div className="tc-pym-dugmeler tc-pym-hamleler">
        {kilit ? <Dg ad="Kilidi aç" simge="lock" yap={kilitAc} not="Kilitleme yetkiniz yok." />
          : <Dg ad="Kilitle" simge="lock" yap={kilitle} not="Kilitleme yetkiniz yok." ipucu="Bu tezgâhta, bu saatten erken başlamasın" />}
        <Dg ad="Siparişi öne al" simge="up" not={yaz ? MOTOR_NOTU : 'Plan yazma yetkiniz yok.'} />
      </div>
      {!r.fas && (
        <div className="tc-pym-bolum">
          <h3>Tezgâh kuyruğu · {r.m}</h3>
          <ul className="tc-pym-zincir">
            {komsu.map((x) => (
              <li key={x.id}>
                <button type="button" aria-current={x.id === id} onClick={() => o.opSec(x.id)}>
                  <b className="tc-pym-mono">{q.indexOf(x) + 1}</b>
                  <span><span className="tc-pym-mono">{x.job}·{kisaId(x.id)}</span><br /><small className="tc-pym-kucuk-yazi">{saatYaz(D, x.S)}{x.su > 0 ? ` · ayar ${saatYazi(x.su)}` : ''}</small></span>
                  <span className="tc-pym-mono">{saatYazi(x.C - x.S)}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="tc-pym-dugmeler">
            <Dg ad="Bir öne" simge="up" not={i > 0 ? MOTOR_NOTU : 'Kuyruğun başında.'} />
            <Dg ad="Bir arkaya" simge="down" not={i < q.length - 1 ? MOTOR_NOTU : 'Kuyruğun sonunda.'} />
          </div>
        </div>
      )}
      {ad && ad.c.length > 0 && (
        <div className="tc-pym-bolum">
          <h3>Uygun tezgâhlar</h3>
          <div className="tc-tablo-kap">
            <table className="tc-tablo">
              <tbody>
                {adaylar(c, cx, id).map((x) => (
                  <tr key={x.m} data-secili={r.m === x.m ? '' : undefined}>
                    <td data-baslik="Tezgâh">{tezgahAdi(D, x.m)}</td>
                    <td data-baslik="Süre" className="tc-pym-num">{x.sure == null ? 'fason' : saatYazi(x.sure)}</td>
                    <td data-baslik="">{r.m === x.m ? <Rozet ton="tamam">Planda</Rozet> : <Dg ad="Taşı" not={yaz ? MOTOR_NOTU : 'Plan yazma yetkiniz yok.'} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {a && a !== 'eksik' && <div className="tc-pym-bolum"><h3>Siparişin süresi nereye gitti</h3><AyrisimCubugu a={a} /></div>}
      <div className="tc-pym-bolum"><h3>Siparişin adımları</h3><Adimlar o={o} jid={r.job} secili={id} /></div>
    </section>
  );
}

const ONCELIK_TON: Record<number, 'hata' | 'pasif' | 'bilgi'> = { 1: 'hata', 3: 'pasif' };
export function IsDenetci({ jid, ...o }: DenetciOzellikleri & { jid: string }) {
  const { c, p, cx, planYaz: yaz } = o; const D = c.D;
  const s = D.siparisler.find((z) => z.id === jid); if (!s) return null;
  const j = p.J[jid]; const a = ayristir(p, cx, jid); const onc = Number(s.oncelik); const lb = kapasitesizEnErken(c, jid);
  return (
    <section className="tc-pym-panel tc-pym-denetci" aria-label={`Sipariş ${jid}`}>
      <div className="tc-pym-panel-ust"><h2><span className="tc-pym-mono">{jid}</span></h2><Kapat yap={o.secimTemizle} /></div>
      <dl className="tc-pym-dl">
        <dt>Ürün</dt><dd>{D.urunler.find((u) => u.id === s.urun)?.ad ?? s.urun} · {s.adet} adet</dd>
        <dt>Öncelik</dt><dd><Rozet ton={ONCELIK_TON[onc] ?? 'bilgi'}>{ONCELIK_AD[onc] ?? '—'}</Rozet></dd>
        <dt>Termin</dt><dd className="tc-pym-mono">{s.termin || '—'}</dd>
        <dt>Planlanan bitiş</dt><dd className="tc-pym-mono">{j?.C != null ? saatYaz(D, j.C) : '—'} {j?.T == null ? <Rozet ton="hata">Planlanmadı</Rozet> : <Durum T={j.T} />}</dd>
        <dt>Kapasitesiz en erken</dt>
        <dd className="tc-pym-mono">{lb != null ? saatYaz(D, lb) : '—'}{lb != null && j?.C != null && <> <span className="tc-pym-kucuk-yazi">(plan {saatYazi(j.C - lb)} sonra)</span></>}</dd>
        {s.serbest && <><dt>Serbest</dt><dd className="tc-pym-mono">{s.serbest}</dd></>}
      </dl>
      <div className="tc-pym-dugmeler tc-pym-hamleler">
        <Dg ad="Siparişi öne al" simge="up" not={yaz ? MOTOR_NOTU : 'Plan yazma yetkiniz yok.'} />
        <Dg ad="Düzenle" simge="edit" not={YOK_NOTU} />
      </div>
      {a && a !== 'eksik' && (
        <div className="tc-pym-bolum">
          <h3>Süre nereye gitti</h3><AyrisimCubugu a={a} />
          <p className="tc-pym-kucuk-yazi">Son biten adımdan geriye, onu bekleten öncüle doğru yürünür. Bekleme sebebi motorun kaydettiği nedendir.</p>
        </div>
      )}
      <div className="tc-pym-bolum"><h3>Adımlar</h3><Adimlar o={o} jid={jid} kilitGoster /></div>
    </section>
  );
}

export function TezgahDenetci({ m, ...o }: DenetciOzellikleri & { m: string }) {
  const { c, p, cx, planYaz: yaz } = o; const D = c.D;
  const T = D.tezgahlar.find((x) => x.id === m); const u = p.util[m]; const fason = m.startsWith('@');
  const ops = tezgahKuyrugu(p, m).filter((r) => r.C > cx.now);
  return (
    <section className="tc-pym-panel tc-pym-denetci" aria-label={`Tezgâh ${m}`}>
      <div className="tc-pym-panel-ust"><h2><span className="tc-pym-mono">{fason ? m.slice(1) : m}</span> · {T?.ad ?? ''}</h2><Kapat yap={o.tezKapat} /></div>
      <dl className="tc-pym-dl">
        <dt>Grup</dt><dd>{cx.M[m] ? cx.M[m].grup : 'fason'}</dd>
        <dt>Doluluk</dt><dd>{u ? yuzdeYaz(u.u) : '—'}</dd>
        <dt>Sırada</dt><dd>{ops.length} iş</dd>
      </dl>
      <div className="tc-pym-dugmeler"><Dg ad="Stüdyoda aç" simge="wrench" birincil not={YOK_NOTU} /></div>
      {yaz && !fason && (
        <>
          <div className="tc-pym-dugmeler"><Dg ad="Arıza ya da bakım ekle" simge="wrench" /><Dg ad="Kuyrukta aç" simge="sort" yap={() => o.mercekSec('kuyruk')} /></div>
          <div className="tc-pym-dugmeler"><Dg ad="Tezgâhı boşalt" simge="trash" /><Dg ad="Bugünü boşalt" simge="sun" /></div>
          <p className="tc-pym-kucuk-yazi">Boşaltmak işleri yapabilen en hızlı başka tezgâha taşır ve orada sabitler; başka tezgâhı olmayan iş yerinde kalır.</p>
        </>
      )}
      <div className="tc-pym-bolum">
        <h3>Kuyruk</h3>
        <ul className="tc-pym-zincir">
          {ops.length ? ops.slice(0, 12).map((r, i) => (
            <li key={r.id}>
              <button type="button" onClick={() => o.opSec(r.id)}>
                <b className="tc-pym-mono">{i + 1}</b>
                <span><span className="tc-pym-mono">{r.job}</span> {cx.byId[r.id]?.ad ?? ''}<br /><small className="tc-pym-kucuk-yazi">{saatYaz(D, r.S)} → {saatYaz(D, r.C).slice(6)}{(p.J[r.job]?.T ?? 0) > 0.05 ? ' · sipariş gecikiyor' : ''}</small></span>
                <span className="tc-pym-mono">{saatYazi(r.C - r.S)}</span>
              </button>
            </li>
          )) : <li className="tc-pym-kucuk-yazi">Sırada iş yok.</li>}
        </ul>
        {ops.length > 12 && <p className="tc-pym-kucuk-yazi">{ops.length - 12} iş daha.</p>}
      </div>
      <p className="tc-pym-kucuk-yazi">Bir işi tutup başka tezgâhın kartına bırakın; motor sonucu önizler. Karta çift tıklayınca tezgâh stüdyosu açılır.</p>
    </section>
  );
}
