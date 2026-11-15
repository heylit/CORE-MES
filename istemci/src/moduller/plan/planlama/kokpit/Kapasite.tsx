import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { TaslakKomutu } from '#paylasilan/sozlesme/planlama.ts';
import { Dugme, Simge } from '../../../../ortak/arayuz/index.ts';
import { durusDenetle, girdiSaati, girdidenSaat } from '../ic/veri/kurallar.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { EtkiBolumu, useEtki } from './etki.tsx';
import type { KokpitModeli } from './kurallar.ts';
import type { TaslakYazici } from './taslak.ts';

// Kokpit'in Duruşlar bölümü (3282 2a-1): tezgâhın arıza ve bakım duruşları. Elle girilen duruş kişinin taslağına komut olarak yazılır ve
// önce etkisiyle gösterilir (etki.tsx, Ayarlar paneliyle aynı akış). Arızadan ve bakım planından kendiliğinden gelen duruş burada silinmez
// (Risk 2a S3); sunucu da reddeder. Saatler planın ekseninde, çeyrek saat adımlıdır (motorun dilimi).

type Durus = { m: string; from: number; to: number; neden: string | null; oto: boolean };
const ceyrek = (h: number): number => Math.round(h * 4) / 4;
const anahtar = (a: number, b: number, oto: boolean): string => `${String(a)}-${String(b)}-${oto ? 'o' : 'e'}`;

export function duruslar(c: PlanlamaCalismasi, tezgah: string, simdi: number): Durus[] {
  return c.down
    .filter((d) => String(d['m']) === tezgah && typeof d['from'] === 'number' && typeof d['to'] === 'number' && (d['to'] as number) > simdi)
    .map((d) => ({ m: tezgah, from: d['from'] as number, to: d['to'] as number, neden: typeof d['neden'] === 'string' ? d['neden'] : null, oto: Boolean(d['oto']) }))
    .sort((a, b) => a.from - b.from);
}

export interface KapasiteOzellikleri {
  c: PlanlamaCalismasi;
  m: Pick<KokpitModeli, 'tezgahlar' | 'simdi'>;
  taslak: TaslakYazici | null;
  yazabilir: boolean;
  zaman: (t: number) => string;
  kapat: () => void;
}

export function Kapasite({ c, m, taslak, yazabilir, zaman, kapat }: KapasiteOzellikleri) {
  const tezgahlar = m.tezgahlar.filter((t) => !t.fason);
  const [tezgah, setTezgah] = useState(tezgahlar[0]?.id ?? '');
  const [neden, setNeden] = useState<'arıza' | 'bakım'>('arıza');
  const ilk = Math.ceil(m.simdi);
  const [bas, setBas] = useState(() => girdiSaati(c.D, ilk));
  const [bit, setBit] = useState(() => girdiSaati(c.D, ilk + 8));
  const [hata, setHata] = useState<string | null>(null);
  const { durum, dene, uygula, vazgec } = useEtki({ c, taslak, sonuc: () => undefined });
  const kilitli = !yazabilir || taslak === null || taslak.mesgul || durum.tur === 'hesap' || durum.tur === 'etki';
  const kod = (id: string) => tezgahlar.find((t) => t.id === id)?.kod ?? id;
  const l = duruslar(c, tezgah, m.simdi);
  // Uygula'dan sonra odak ve kaydırma eklenen satıra gider (dar ekranda form listenin altındadır).
  const kok = useRef<HTMLElement>(null);
  const [odak, setOdak] = useState<string | null>(null);
  useEffect(() => {
    if (odak === null || durum.tur !== 'duzen') return;
    const li = kok.current?.querySelector<HTMLElement>(`[data-anahtar="${odak}"]`);
    if (!li) return;
    li.focus();
    li.scrollIntoView?.({ block: 'nearest' });
    setOdak(null);
  }, [odak, durum.tur, l]);

  const ekle = (e: FormEvent) => {
    e.preventDefault();
    const a = girdidenSaat(c.D, bas), b = girdidenSaat(c.D, bit);
    const h = durusDenetle(a, b) ?? (b !== null && b <= m.simdi ? 'Bitiş şimdiden sonra olmalı.' : null);
    setHata(h);
    if (h !== null || a === null || b === null) return;
    setOdak(anahtar(ceyrek(a), ceyrek(b), false));
    void dene({ tur: 'durus', tezgah, bas: ceyrek(a), bit: ceyrek(b), neden } satisfies TaslakKomutu);
  };
  const sil = (d: Durus) => { setOdak(null); void dene({ tur: 'durus-sil', tezgah: d.m, bas: d.from, bit: d.to } satisfies TaslakKomutu); };

  return (
    <aside ref={kok} className="tc-pyq-ayrinti tc-pyq-ayarlar tc-pyq-kapasite" aria-label="Duruşlar">
      <header>
        <div><b>Duruşlar</b><small>Tezgâhın arıza ve bakım duruşları.</small></div>
        <button type="button" className="tc-pyq-simge-dugme" aria-label="Duruşları kapat" onClick={kapat}><Simge ad="x" boyut="k" /></button>
      </header>
      {!yazabilir && <p className="tc-pyq-not">Duruşu yalnız planı yazabilen kişi ekler ya da siler.</p>}
      <div className="tc-pyq-ayar-alan">
        <label htmlFor="tc-pyq-kap-tezgah">Tezgâh</label>
        <select id="tc-pyq-kap-tezgah" className="tc-alan-kutu" value={tezgah} disabled={durum.tur === 'hesap' || durum.tur === 'etki'} onChange={(ev) => { setTezgah(ev.target.value); }}>
          {tezgahlar.map((t) => <option key={t.id} value={t.id}>{t.ad ? `${t.kod} · ${t.ad}` : t.kod}</option>)}
        </select>
      </div>
      <h3>Arıza ve bakım</h3>
      {l.length === 0 ? <p className="tc-pyq-not">{`${kod(tezgah)} için önümüzdeki duruş yok.`}</p> : (
        <ul className="tc-pyq-kap-liste">
          {l.map((d) => (
            <li key={anahtar(d.from, d.to, d.oto)} data-anahtar={anahtar(d.from, d.to, d.oto)} tabIndex={-1} data-oto={d.oto ? '' : undefined}>
              <span><b>{d.neden === 'bakım' ? 'Bakım' : 'Arıza'}</b> {zaman(d.from)} → {zaman(d.to)}{d.oto && <small> · kendiliğinden geldi</small>}</span>
              {!d.oto && yazabilir && (
                <button type="button" className="tc-pyq-simge-dugme" disabled={kilitli} aria-label={`${kod(d.m)} ${zaman(d.from)} → ${zaman(d.to)} duruşunu sil`} title="Duruşu sil" onClick={() => { sil(d); }}>
                  <Simge ad="trash" boyut="k" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {l.some((d) => d.oto) && <p className="tc-pyq-not">Arıza bildiriminden ya da bakım planından gelen duruş burada silinmez; kaynağında kapanınca kalkar.</p>}
      {durum.tur === 'etki' ? (
        <EtkiBolumu ad="Duruşun etkisi" e={durum.e} uygula={() => { void uygula(durum.e); }} vazgec={() => { setOdak(null); void vazgec(); }} />
      ) : yazabilir && (
        <form className="tc-pyq-ayar-etki" noValidate aria-label="Arıza ya da bakım ekle" onSubmit={ekle}>
          <div className="tc-pyq-ayar-alan">
            <label htmlFor="tc-pyq-kap-neden">Tür</label>
            <select id="tc-pyq-kap-neden" className="tc-alan-kutu" value={neden} disabled={kilitli} onChange={(ev) => { setNeden(ev.target.value === 'bakım' ? 'bakım' : 'arıza'); }}>
              <option value="arıza">Arıza</option><option value="bakım">Bakım</option>
            </select>
          </div>
          <div className="tc-pyq-ayar-alan">
            <label htmlFor="tc-pyq-kap-bas">Başlangıç</label>
            <input id="tc-pyq-kap-bas" className="tc-alan-kutu" type="datetime-local" step={900} value={bas} disabled={kilitli} onChange={(ev) => { setBas(ev.target.value); }} />
          </div>
          <div className="tc-pyq-ayar-alan">
            <label htmlFor="tc-pyq-kap-bit">Bitiş</label>
            <input id="tc-pyq-kap-bit" className="tc-alan-kutu" type="datetime-local" step={900} value={bit} disabled={kilitli} onChange={(ev) => { setBit(ev.target.value); }} />
          </div>
          {(hata ?? (durum.tur === 'hata' ? durum.ileti : null)) !== null && <p className="tc-pyq-ayar-hata" role="alert">{hata ?? (durum.tur === 'hata' ? durum.ileti : '')}</p>}
          <div className="tc-pyq-ayar-dugmeler">
            <Dugme type="submit" tur="ikincil" simge="plus" disabled={kilitli}>{durum.tur === 'hesap' ? 'Hesaplanıyor' : 'Duruş ekle, etkisini gör'}</Dugme>
          </div>
        </form>
      )}
    </aside>
  );
}

