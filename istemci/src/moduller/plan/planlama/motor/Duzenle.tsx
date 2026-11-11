import { Simge } from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import type { PlanlamaSecimi } from '../gorunumler.ts';
import type { CalismaKomutu } from '../kayit.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { adaylar } from './cizelge/kurallar.ts';
import { saatYaz, saatYazi, type Derleme, type OkunanPlan, type PlanIslemi } from './kurallar.ts';
import { MOTOR_NOTU, YOK_NOTU } from './ortak.tsx';
import { hamleYapisi, siraAdimi, type Hamleci } from './hamle/hamle.ts';
import type { BolKipi } from './bol/BolPenceresi.tsx';
import { bolDurumu, bolKaldir, bolunmus } from './bol/kurallar.ts';

// Düzenle menüsü ve Değişiklikler (zp-klavye.betik): seçilene göre numaralı komutlar; sayıya basmak komutu çalıştırır. Plana dokunan
// komutlar motorun hamlesiyle gelir, görünür ve pasiftir (357 b); sabitlemek çalışmaya yazar (223 a). Tezgâhın "sırasını düzenle"si Tezgâh sırası aracını açar.
export type KbPanel = 'dz' | 'sp' | 'kl' | 'sr' | 'bl';
export type KbHedef = { k: 'is' | 'sip'; r: PlanIslemi } | { k: 'tez'; m: string };
// `alt`: komut menüyü kapatmaz, alt listeye geçer. `pencere`: komut köşede kendi penceresini açar, menü onunla kapanır.
export interface KbKomut { ad: string; simge: SimgeAdi; ipucu: string; yap: (() => void) | null; not: string; alt?: boolean; pencere?: boolean }

const kbTez = (m: string) => (m.startsWith('@') ? `fason ${m.slice(1)}` : m);
const HEDEF_AD: Record<KbHedef['k'], string> = { is: 'İş adımı', sip: 'Sipariş', tez: 'Tezgâh' };

// Siparişin düzenlenecek adımı: şimdiden sonra başlayan ilk başlamamış adım, yoksa ilk başlamamış, yoksa ilki (kbSipIsi).
function siparisIsi(p: OkunanPlan, now: number, job: string): PlanIslemi | null {
  const l = Object.values(p.ops).filter((r) => r.job === job && Number.isFinite(r.S)).sort((a, b) => a.S - b.S);
  return l.find((x) => !x.act && x.S >= now) ?? l.find((x) => !x.act) ?? l[0] ?? null;
}
export function kbHedefler(p: OkunanPlan, cx: Derleme, s: PlanlamaSecimi): KbHedef[] {
  const l: KbHedef[] = []; const is = s.adim ? p.ops[s.adim] : undefined;
  if (is) l.push({ k: 'is', r: is });
  if (s.siparis && is?.job !== s.siparis) { const r = siparisIsi(p, cx.now, s.siparis); if (r) l.push({ k: 'sip', r }); }
  if (s.tezgah) l.push({ k: 'tez', m: s.tezgah });
  return l;
}
export const kbBaglam = (l: KbHedef[], hedef: KbHedef['k'] | null): KbHedef | null => l.find((h) => h.k === hedef) ?? l[0] ?? null;

// p ve hamle (2149): kuyrukta sıra ve başka tezgâha taşıma motorun önizlemesini ister; verilmezse komutlar pasiftir.
interface Baglam {
  c: PlanlamaCalismasi; cx: Derleme; komut: CalismaKomutu | null; altAc: () => void; siraAc?: ((m: string) => void) | null;
  p?: OkunanPlan | null; hamle?: Hamleci | null;
  // Aynı tezgâhta saat kaydırma atölyenin iş taşıma komutudur (sunucu, plan yeniden dizilir); yazamayana null.
  tasi?: ((id: string, m: string, S: number) => void) | null;
  // Böl penceresi (2524 b); yazamayana null.
  bolAc?: ((id: string, kip: BolKipi) => void) | null;
}
export const KAYDIRMA_SABIT = 'Sabit, başlamış ya da fason iş kaydırılmaz.';
export const KAYDIRMA_YETKISIZ = 'Plan yazma yetkiniz yok.';
// Seçili işi aynı tezgâhta saat kadar kaydırır (← → 1 saat, Shift ile çeyrek). Saat çeyreğe yuvarlanır, şimdiden önceye gitmez (atolye/gonder.ts tasimaSaati).
export function kaydirmaAdimi(o: Pick<Baglam, 'c' | 'tasi'>, r: PlanIslemi, saat: number): { yap: (() => void) | null; not: string } {
  if (!o.tasi) return { yap: null, not: KAYDIRMA_YETKISIZ };
  if (o.c.locks[r.id] || r.act || r.fas) return { yap: null, not: KAYDIRMA_SABIT };
  const tasi = o.tasi;
  return { yap: () => { tasi(r.id, r.m, r.S + saat); }, not: '' };
}
const motor = (ad: string, simge: SimgeAdi, ipucu: string): KbKomut => ({ ad, simge, ipucu, yap: null, not: MOTOR_NOTU });
// Yapabilen tezgâhlar, süresi kısadan uzuna, en çok dokuz.
function tasiKomutlari(o: Baglam, r: PlanIslemi): KbKomut[] {
  const sabit = !!o.c.locks[r.id] || r.act || r.fas;
  return adaylar(o.c, o.cx, r.id).filter((a) => a.m !== r.m).sort((a, b) => (a.sure ?? Infinity) - (b.sure ?? Infinity)).slice(0, 9)
    .map((a): KbKomut => {
      const ipucu = `${saatYazi(a.sure)} sürer`;
      if (a.m.startsWith('@')) return motor(kbTez(a.m), 'truck', ipucu);
      const y = sabit ? { yap: null, not: 'Sabit ya da başlamış iş taşınmaz.' } : hamleYapisi(o.hamle, (h) => { h.sirala(a.m, [r.id]); });
      return { ad: kbTez(a.m), simge: 'target', ipucu, ...y };
    });
}
function siraKomutu(o: Baglam, r: PlanIslemi, ad: string, simge: SimgeAdi, ipucu: string, yon: -1 | 1): KbKomut {
  return { ad, simge, ipucu, ...(o.p ? siraAdimi(o.hamle, o.p, r.id, yon) : { yap: null, not: MOTOR_NOTU }) };
}
// Elle böl ve payları birleştir (2524 b): sabit, başlamış ya da fason işte pasif ve nedeniyle; elle karar varsa kaldırılabilir.
function bolKomutlari(o: Baglam, r: PlanIslemi): KbKomut[] {
  if (!o.p) return [];
  const d = bolDurumu(o.c, o.cx, o.p, r); const { bolAc, komut } = o;
  const yetki = (engel: string | null, f: () => void) => (!bolAc || !komut ? { yap: null, not: KAYDIRMA_YETKISIZ } : engel ? { yap: null, not: engel } : { yap: f, not: '' });
  const l: KbKomut[] = [{ ad: 'Böl…', simge: 'grid', ipucu: `en çok ${String(d.enCok)} pay, adet ve tezgâh seçilir`, pencere: true, ...yetki(d.bolEngeli, () => bolAc?.(r.id, 'bol')) }];
  if (bolunmus(d)) l.push({ ad: 'Payları birleştir', simge: 'layers', ipucu: 'tek tezgâhta tek iş', pencere: true, ...yetki(d.engel, () => bolAc?.(r.id, 'birlestir')) });
  if (d.elle) {
    l.push({ ad: 'Elle bölmeyi kaldır', simge: 'trash', ipucu: 'motor rotadaki bölme ayarına döner', ...yetki(d.engel, () => {
      komut?.degistir('Elle bölme kaldırıldı', (t) => { bolKaldir(t, d.id); }, { ayrinti: d.id });
    }) });
  }
  return l;
}
export function kbKomutlari(o: Baglam, b: KbHedef | null, alt: boolean): KbKomut[] {
  if (!b) return [];
  if (b.k === 'tez') {
    return [
      { ad: `${kbTez(b.m)} sırasını düzenle`, simge: 'sort', ipucu: 'sürükleyerek ya da oklarla', yap: o.siraAc && !b.m.startsWith('@') ? () => o.siraAc?.(b.m) : null, not: YOK_NOTU, pencere: true },
      motor(`${kbTez(b.m)} bugün boşalt`, 'next', 'bugünkü işler yapabilen tezgâhlara'), motor(`${kbTez(b.m)} tamamen boşalt`, 'next', 'bütün bekleyen işler taşınır'),
    ];
  }
  const { r } = b;
  if (alt) return tasiKomutlari(o, r);
  const n = tasiKomutlari(o, r).length; const sabit = !!o.c.locks[r.id]; const { komut } = o;
  const l: KbKomut[] = [{ ad: `${r.job} siparişini öne al`, simge: 'flag', ipucu: 'öne almanın yollarını dener, en iyisini önizler', ...hamleYapisi(o.hamle, (h) => { h.oneAl(r.job); }) }];
  if (n) l.push({ ad: 'Başka tezgâha taşı', simge: 'next', ipucu: `yapabilen ${n} tezgâh`, yap: o.altAc, not: '', alt: true });
  l.push({ ad: '1 saat sonraya', simge: 'chev-right', ipucu: '→, Shift ile çeyrek saat', ...kaydirmaAdimi(o, r, 1) },
    { ad: '1 saat önceye', simge: 'chev-left', ipucu: '←', ...kaydirmaAdimi(o, r, -1) },
    siraKomutu(o, r, 'Kuyrukta bir öne', 'up', '[', -1), siraKomutu(o, r, 'Kuyrukta bir arkaya', 'down', ']', 1));
  l.push({
    ad: sabit ? 'Sabitliği kaldır' : 'Bu saate sabitle', simge: 'lock', ipucu: 'motor sabit işe dokunmaz', not: 'Kilitleme yetkiniz yok.',
    yap: komut ? () => {
      komut.degistir(sabit ? 'Sabitlik kaldırıldı' : 'İş sabitlendi', (t) => { if (sabit) delete t.locks[r.id]; else t.locks[r.id] = { m: r.m, S: r.S }; },
        { ayrinti: `${r.id} · ${saatYaz(o.c.D, r.S)}`, planKoru: true });
    } : null,
  });
  l.push(...bolKomutlari(o, r));
  l.push(motor(`${r.job} siparişini havuza geri al`, 'box', 'plandan çıkar, sonra yeniden yerleştirilir'));
  l.push({ ad: `${kbTez(r.m)} sırasını düzenle`, simge: 'sort', ipucu: 'tezgâhın bütün kuyruğu', yap: o.siraAc && !r.m.startsWith('@') ? () => o.siraAc?.(r.m) : null, not: YOK_NOTU, pencere: true });
  return l;
}

function Kapat({ kapat }: { kapat: () => void }) {
  return <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" title="Kapat (Esc)" aria-label="Kapat (Esc)" onClick={kapat}><Simge ad="x" boyut="k" /></button>;
}

interface MenuOzellikleri {
  c: PlanlamaCalismasi; hl: KbHedef[]; b: KbHedef | null; l: KbKomut[]; alt: boolean; yaz: boolean;
  kos: (i: number) => void; geri: () => void; hedefSec: (k: KbHedef['k']) => void; kapat: () => void;
}
export function DuzenleMenusu({ c, hl, b, l, alt, yaz, kos, geri, hedefSec, kapat }: MenuOzellikleri) {
  return (
    <section className="tc-pym-yp tc-pym-kb" role="dialog" aria-label="Düzenle">
      <header>
        <b><Simge ad="wrench" boyut="k" />{alt ? 'Hangi tezgâha?' : 'Düzenle'}</b>
        <span className="tc-pym-ara" />
        {alt && <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" title="Geri (Backspace)" aria-label="Geri (Backspace)" onClick={geri}><Simge ad="chev-left" boyut="k" /></button>}
        <Kapat kapat={kapat} />
      </header>
      {b && hl.length > 1 && (
        <div className="tc-pym-kb-hedef" role="group" aria-label="Neyi düzenle (Tab)">
          {hl.map((h) => (
            <button key={h.k} type="button" aria-pressed={h.k === b.k} onClick={() => hedefSec(h.k)}>
              <small>{HEDEF_AD[h.k]}</small><b className="tc-pym-mono">{h.k === 'tez' ? kbTez(h.m) : h.k === 'sip' ? h.r.job : h.r.id}</b>
            </button>
          ))}
          <kbd>Tab</kbd>
        </div>
      )}
      {b && (
        <div className="tc-pym-kb-bas">
          <span className="tc-pym-kb-tur">{HEDEF_AD[b.k]}</span>
          {b.k === 'tez' ? <><b className="tc-pym-mono">{kbTez(b.m)}</b><small>bu tezgâhın kuyruğu</small></> : (
            <><b className="tc-pym-mono">{b.k === 'sip' ? b.r.job : b.r.id}</b>
              <small>{b.k === 'sip' ? `sıradaki adımı ${b.r.id} · ` : ''}{kbTez(b.r.m)} · {saatYaz(c.D, b.r.S)}{c.locks[b.r.id] ? ' · sabit' : ''}</small></>
          )}
        </div>
      )}
      {!b ? <p>Önce bir iş, sipariş ya da tezgâh seçin; sonra E.</p> : l.length ? (
        <ol className="tc-pym-kb-l">
          {l.map((k, i) => (
            <li key={k.ad}>
              <button type="button" className="tc-pym-kb-k" aria-disabled={k.yap ? undefined : 'true'} title={k.yap ? undefined : `${k.ad}: ${k.not}`} onClick={() => kos(i)}>
                <kbd>{i < 9 ? i + 1 : ''}</kbd><Simge ad={k.simge} boyut="k" /><span><b>{k.ad}</b>{k.ipucu && <small>{k.ipucu}</small>}</span>
              </button>
            </li>
          ))}
        </ol>
      ) : <p>Bu iş başka tezgâhta yapılamıyor.</p>}
      {b && b.k !== 'tez' && yaz && (
        <p className="tc-pym-kb-ip"><kbd>←</kbd><kbd>→</kbd> saat · <kbd>↑</kbd><kbd>↓</kbd> tezgâh · <kbd>Shift</kbd> çeyrek saat · <kbd>Ctrl Z</kbd> geri al</p>
      )}
    </section>
  );
}

// Değişiklikler (kbSepetHtml, s-gun taslakPaneli): sepetin satırları motorun hamlesinden doğar; motor bağlanana dek sepet boştur, toplamlar
// plandandır. "Stüdyoda incele" Planlama stüdyosuna gider (zz22-plan-atolyesi pa-git).
export function Degisiklikler({ p, studyo, kapat }: { p: OkunanPlan; studyo: () => void; kapat: () => void }) {
  const o = p.ozet;
  return (
    <section className="tc-pym-yp tc-pym-kb" role="dialog" aria-label="Değişiklikler">
      <header><b><Simge ad="layers" boyut="k" />Değişiklikler</b><Kapat kapat={kapat} /></header>
      <p>Plan her değişiklikte hemen güncellenir. Bir satırın geri düğmesi o değişiklikten öncesine döner.</p>
      <section className="tc-pym-taslak" aria-label="Taslak">
        <header><Simge ad="layers" boyut="k" /><b>Sepet</b><span className="tc-pym-mono">0 değişiklik</span></header>
        <div className="tc-pym-taslak-ozet tc-pym-mono"><span>ağırlıklı gecikme {saatYazi(o.wT)} → <b>{saatYazi(o.wT)}</b></span><span>geciken {o.late} → <b>{o.late}</b></span></div>
        <p className="tc-pym-kucuk-yazi">İşleri taşıyın, sıralayın ya da bir olay deneyin; her biri burada bir adım olur.</p>
        <div className="tc-pym-dugmeler">
          <button type="button" className="tc-dugme tc-pym-kucuk" onClick={studyo}><Simge ad="flag" boyut="k" />Stüdyoda incele</button>
        </div>
      </section>
      <p className="tc-pym-kb-ip"><kbd>Ctrl Z</kbd> geri al · <kbd>Ctrl Shift Z</kbd> yinele · <kbd>Ctrl Enter</kbd> onayla, listeyi temizle</p>
    </section>
  );
}
