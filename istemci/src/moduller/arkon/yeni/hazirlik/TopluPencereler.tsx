import { useMemo, useState } from 'react';
import { Dugme, Pencere, Simge } from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import type { Plant, Policy } from '../cekirdek/tipler.ts';
import {
  KOPYA_ALANLARI, benzerAdaylar, benzerKopya, enIyiAday, gelecekler, gidecekMi, gonderDugmesi, gonderimHali, gonderimSayilari, icerikDolu,
  kopyaAcikMi, silinecekler, uyariAnahtari, varsayilanKopya, type AdayDerecesi, type GonderimHali, type KopyaAlani,
} from './toplu.ts';
import type { Pkg } from './tipler.ts';

// 3362: Üretim Hazırlık toplu gönderim ve benzer paketten doldurma pencereleri. Kurallar toplu.ts'te; yazma Hazirlik.tsx'te.
const paketAdi = (p: Pkg) => `${p.no} · ${p.op || (p.tmi?.opNo !== undefined ? `Op ${String(p.tmi.opNo)}` : 'Operasyon girilmedi')}`;

interface Grup { anahtar: 'terminal' | 'kalite' | 'uyari' | 'engel'; baslik: string; simge: SimgeAdi; ton: string }
const GRUPLAR: readonly Grup[] = [
  { anahtar: 'terminal', baslik: 'Gönderilecek', simge: 'check', ton: 'run' },
  { anahtar: 'kalite', baslik: 'Kaliteye onaya gidecek', simge: 'target', ton: 'done' },
  { anahtar: 'uyari', baslik: 'Onayınız gerekiyor', simge: 'alert', ton: 'hold' },
  { anahtar: 'engel', baslik: 'Gönderilemez', simge: 'x', ton: 'stop' },
];

export interface GonderimIlerlemesi { n: number; toplam: number; metin: string }

// Uyarısı olan paket "Onayınız gerekiyor" grubunda her uyarısı ayrı kutuyla durur (Risk K1); işaretlenince sayılar canlı değişir.
export function TopluGonderPenceresi({ paketler, tesis, kurallar, ilerleme, kapat, gonder, durdur }: {
  paketler: readonly Pkg[] | null; tesis: Plant; kurallar: Pick<Policy, 'approval'>; ilerleme: GonderimIlerlemesi | null;
  kapat: () => void; gonder: (l: readonly Pkg[], onaylar: ReadonlySet<string>) => void; durdur: () => void;
}) {
  const [onaylar, onaylarYaz] = useState<ReadonlySet<string>>(() => new Set());
  const satirlar = useMemo(() => (paketler ?? []).map((p) => ({ p, h: gonderimHali(p, tesis, kurallar) })), [paketler, tesis, kurallar]);
  const sayilar = gonderimSayilari(satirlar, onaylar);
  const grubu = (h: GonderimHali): Grup['anahtar'] => (h.tur === 'engel' || h.tur === 'bekliyor' ? 'engel' : h.uyarilar.length ? 'uyari' : h.tur);
  const isaretle = (k: string, on: boolean) => onaylarYaz((o) => { const y = new Set(o); if (on) y.add(k); else y.delete(k); return y; });
  const kapan = () => { onaylarYaz(new Set()); kapat(); };
  const toplam = sayilar.terminal + sayilar.kalite;
  if (ilerleme) {
    return (
      <Pencere acik baslik={`Gönderiliyor ${String(ilerleme.n + 1)} / ${String(ilerleme.toplam)}`} kapat={() => undefined} alt={<Dugme tur="ikincil" onClick={durdur}>Kalanları durdur</Dugme>}>
        <div className="tc-ay2-toplu-ic">
          <progress className="tc-ay2-toplu-cubuk" max={ilerleme.toplam} value={ilerleme.n} aria-label="Gönderim ilerlemesi" />
          <p className="tc-ay2-soluk" role="status">{ilerleme.metin}</p>
          <p className="tc-ay2-soluk tc-ay2-toplu-not">Her iş göndermeden hemen önce yeniden okunur; bu arada başlayan ya da değişen iş atlanır.</p>
        </div>
      </Pencere>
    );
  }
  return (
    <Pencere
      acik={paketler !== null} kapat={kapan} baslik={`Terminale gönder · ${String(satirlar.length)} iş seçildi`}
      alt={(
        <>
          <span className="tc-ay2-soluk tc-ay2-toplu-sayi" aria-live="polite">
            {sayilar.terminal} iş terminale{sayilar.kalite ? `, ${String(sayilar.kalite)} iş kaliteye` : ''}
          </span>
          <Dugme tur="ikincil" onClick={kapan}>Vazgeç</Dugme>
          <Dugme tur="birincil" simge="next" disabled={toplam === 0} onClick={() => { const o = onaylar; onaylarYaz(new Set()); gonder(satirlar.filter((x) => gidecekMi(x.p.id, x.h, o)).map((x) => x.p), o); }}>
            {gonderDugmesi(sayilar)}
          </Dugme>
        </>
      )}
    >
      <div className="tc-ay2-toplu-ic">
        {GRUPLAR.map((g) => {
          const l = satirlar.filter((x) => grubu(x.h) === g.anahtar);
          if (!l.length) return null;
          return (
            <section key={g.anahtar} className="tc-ay2-toplu-grup" aria-label={g.baslik}>
              <h3 data-ton={g.ton}><Simge ad={g.simge} boyut="k" />{g.baslik}<b>{l.length}</b></h3>
              {g.anahtar === 'uyari' ? (
                l.flatMap(({ p, h }) => (h.tur === 'terminal' || h.tur === 'kalite' ? h.uyarilar : []).map((u) => {
                  const k = uyariAnahtari(p.id, u.tur);
                  return (
                    <label key={k} className="tc-ay2-toplu-kutu">
                      <input type="checkbox" checked={onaylar.has(k)} onChange={(o) => isaretle(k, o.target.checked)} />
                      <span>
                        <b>{u.tur === 'planYok' ? 'Kontrol planı yok' : 'Canlı planda değil'}</b> · {paketAdi(p)}{h.tur === 'kalite' ? ' · onaylanırsa kaliteye gider' : ''}
                        <small>{u.neden}</small>
                      </span>
                    </label>
                  );
                }))
              ) : (
                <ul>
                  {l.map(({ p, h }) => (
                    <li key={p.id}>
                      {paketAdi(p)}
                      {h.tur === 'engel' || h.tur === 'bekliyor' ? ` · ${h.neden}` : h.tur === 'kalite' ? ' · onaylanınca terminale gönderilebilir' : p.status !== 'draft' ? ' · değişiklik var, yeni sürüm gider' : ''}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
        <p className="tc-ay2-soluk tc-ay2-toplu-not">Hazırlıkta &quot;Durur&quot; görünen iş terminale gider ama eksik madde tamamlanmadan başlatılamaz.</p>
      </div>
    </Pencere>
  );
}

const DERECE_ADI: Readonly<Record<AdayDerecesi, string>> = {
  'ayni-op': 'Aynı parça, aynı operasyon', 'ayni-parca': 'Aynı parça, başka operasyon', 'ayni-tur': 'Aynı iş türü ve istasyon, başka parça',
};
const tarih = (ms: number | undefined) => (typeof ms === 'number' ? new Date(ms).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }) : '');
const adayOzeti = (p: Pkg) => [p.no, p.machine, `son gönderim ${tarih(p.publishedAt)}`, `${String(p.steps.length)} adım`, p.samp?.length ? 'numune' : ''].filter(Boolean).join(' · ');

// Tek paket: aday seçilir, alınacak alanlar işaretlenir; dolu alanın üzerine yazılacaksa ne silinip ne geleceği söylenir (Arayüz 2).
export function BenzerPaketPenceresi({ hedef, paketler, kapat, uygula }: {
  hedef: Pkg | null; paketler: readonly Pkg[]; kapat: () => void; uygula: (kaynak: Pkg, alanlar: ReadonlySet<KopyaAlani>) => void;
}) {
  const [ara, araYaz] = useState('');
  const adaylar = useMemo(() => (hedef ? benzerAdaylar(hedef, paketler) : []), [hedef, paketler]);
  const [secimId, secimIdYaz] = useState<string | null>(null);
  const [alanlar, alanlarYaz] = useState<ReadonlySet<KopyaAlani> | null>(null);
  const kucuk = ara.trim().toLocaleLowerCase('tr');
  const gorunen = kucuk ? adaylar.filter((a) => [a.p.no, a.p.partNo, a.p.part, a.p.machine, a.p.op].some((x) => String(x ?? '').toLocaleLowerCase('tr').includes(kucuk))) : adaylar;
  const kaynak = adaylar.find((a) => a.p.id === secimId)?.p ?? adaylar[0]?.p ?? null;
  const secili = hedef && kaynak ? (alanlar ?? varsayilanKopya(hedef, kaynak)) : new Set<KopyaAlani>();
  const kopya = hedef && kaynak ? benzerKopya(hedef, kaynak, secili) : {};
  const silinen = hedef ? silinecekler(hedef, kopya) : [];
  const gelen = gelecekler(kopya);
  const kapan = () => { araYaz(''); secimIdYaz(null); alanlarYaz(null); kapat(); };
  const sec = (id: string) => { secimIdYaz(id); alanlarYaz(null); };
  const isaretle = (k: KopyaAlani, on: boolean) => { const y = new Set(secili); if (on) y.add(k); else y.delete(k); alanlarYaz(y); };
  let onceki: AdayDerecesi | null = null;
  return (
    <Pencere
      acik={hedef !== null} kapat={kapan} baslik="Benzer paketten al"
      alt={(
        <>
          <Dugme tur="ikincil" onClick={kapan}>Vazgeç</Dugme>
          <Dugme tur="birincil" simge="layers" disabled={!kaynak || !gelen.length} onClick={() => { if (kaynak) { uygula(kaynak, secili); kapan(); } }}>
            {gelen.length ? `${String(gelen.length)} alanı al` : 'Alınacak alan yok'}
          </Dugme>
        </>
      )}
    >
      <div className="tc-ay2-toplu-ic">
        {adaylar.length ? (
          <>
            <input className="tc-ay2-toplu-ara" placeholder="Parça, emir ya da istasyon ara" aria-label="Benzer paketlerde ara" value={ara} onChange={(o) => araYaz(o.target.value)} />
            <div role="radiogroup" aria-label="Benzer paketler" className="tc-ay2-toplu-adaylar">
              {gorunen.map((a, i) => {
                const baslik = a.derece !== onceki ? DERECE_ADI[a.derece] : null;
                onceki = a.derece;
                return (
                  <div key={a.p.id}>
                    {baslik ? <p className="tc-ay2-ust-yazi">{baslik}</p> : null}
                    <label className="tc-ay2-toplu-aday" data-secili={kaynak?.id === a.p.id ? '' : undefined}>
                      <input type="radio" name="benzer-aday" checked={kaynak?.id === a.p.id} onChange={() => sec(a.p.id)} />
                      <span>
                        <b>{a.p.partNo || a.p.part} · Rev {a.p.rev} · {a.p.op}</b>
                        <small>{adayOzeti(a.p)}</small>
                      </span>
                      {i === 0 && !kucuk ? <span className="tc-ay2-toplu-oneri">Önerilen</span> : null}
                    </label>
                  </div>
                );
              })}
              {!gorunen.length ? <p className="tc-ay2-soluk">Aramaya uyan paket yok.</p> : null}
            </div>
            {hedef && kaynak ? (
              <>
                <p className="tc-ay2-ust-yazi">Neler alınsın</p>
                <div className="tc-ay2-toplu-alanlar">
                  {KOPYA_ALANLARI.map(({ k, ad }) => {
                    const acik = kopyaAcikMi(hedef, kaynak, k);
                    return (
                      <label key={k} className="tc-ay2-toplu-kutu" data-kapali={acik ? undefined : ''}>
                        <input type="checkbox" disabled={!acik} checked={acik && secili.has(k)} onChange={(o) => isaretle(k, o.target.checked)} />
                        <span>
                          {acik ? null : <Simge ad="lock" boyut="k" />}<b>{ad}</b>
                          {acik ? null : <small>{k === 'material' ? 'Parça farklı: alınmaz' : `Revizyon farklı (${kaynak.rev || '?'} → ${hedef.rev || '?'}): alınmaz`}</small>}
                        </span>
                      </label>
                    );
                  })}
                </div>
                {silinen.length ? (
                  <p className="tc-ay2-takip-uyari tc-ay2-toplu-sil"><Simge ad="alert" boyut="k" /><span>Bu pakette {silinen.join(', ')} var: silinir, yerine {gelen.join(', ')} gelir.</span></p>
                ) : null}
                <p className="tc-ay2-soluk tc-ay2-toplu-not">Seçilen alanlar bu paketteki değerlerin yerine geçer. Paket taslak kalır; terminale gitmez.</p>
              </>
            ) : null}
          </>
        ) : <p className="tc-ay2-soluk">Benzer paket bulunamadı. Aday yalnız en az bir kez terminale gönderilmiş paketlerdir.</p>}
      </div>
    </Pencere>
  );
}

// Toplu: her boş taslak kendi en iyi adayından varsayılan alanlarla doldurulur; dolu ya da adaysız olan atlanır.
export interface TopluDoldurmaSatiri { hedef: Pkg; kaynak: Pkg | null; neden: string | null }
export function topluDoldurmaPlani(hedefler: readonly Pkg[], paketler: readonly Pkg[]): TopluDoldurmaSatiri[] {
  return hedefler.map((hedef) => {
    if (hedef.status !== 'draft') return { hedef, kaynak: null, neden: 'taslak değil' };
    if (icerikDolu(hedef)) return { hedef, kaynak: null, neden: 'paket dolu (adımları var); tek tek açıp alın' };
    const a = enIyiAday(hedef, paketler);
    return a ? { hedef, kaynak: a.p, neden: null } : { hedef, kaynak: null, neden: 'benzer paket bulunamadı' };
  });
}
export function TopluBenzerPenceresi({ plan, mesgul, kapat, uygula }: {
  plan: readonly TopluDoldurmaSatiri[] | null; mesgul: boolean; kapat: () => void; uygula: (l: readonly TopluDoldurmaSatiri[]) => void;
}) {
  const l = plan ?? [];
  const dolacak = l.filter((x) => x.kaynak !== null);
  const atlanan = l.filter((x) => x.kaynak === null);
  return (
    <Pencere
      acik={plan !== null} kapat={kapat} baslik={`${String(l.length)} taslağı benzer paketten doldur`}
      alt={(
        <>
          <Dugme tur="ikincil" onClick={kapat}>Vazgeç</Dugme>
          <Dugme tur="birincil" simge="layers" yukleniyor={mesgul} disabled={!dolacak.length} onClick={() => uygula(dolacak)}>
            {dolacak.length ? `${String(dolacak.length)} taslağı doldur` : 'Doldurulacak taslak yok'}
          </Dugme>
        </>
      )}
    >
      <div className="tc-ay2-toplu-ic">
        {dolacak.length ? (
          <section className="tc-ay2-toplu-grup" aria-label="Doldurulacak">
            <h3 data-ton="run"><Simge ad="check" boyut="k" />Doldurulacak<b>{dolacak.length}</b></h3>
            <ul>
              {dolacak.map(({ hedef, kaynak }) => (
                <li key={hedef.id}>{paketAdi(hedef)} ← {kaynak!.partNo || kaynak!.part} Rev {kaynak!.rev} {kaynak!.op} ({gelecekler(benzerKopya(hedef, kaynak!, varsayilanKopya(hedef, kaynak!))).join(', ')})</li>
              ))}
            </ul>
          </section>
        ) : null}
        {atlanan.length ? (
          <section className="tc-ay2-toplu-grup" aria-label="Atlanacak">
            <h3 data-ton="idle"><Simge ad="x" boyut="k" />Atlanacak<b>{atlanan.length}</b></h3>
            <ul>{atlanan.map(({ hedef, neden }) => <li key={hedef.id}>{paketAdi(hedef)} · {neden}</li>)}</ul>
          </section>
        ) : null}
        <p className="tc-ay2-soluk tc-ay2-toplu-not">Resim ve kontrol planı yalnız aynı revizyonda alınır. Paketler taslak kalır; terminale gitmez.</p>
      </div>
    </Pencere>
  );
}
