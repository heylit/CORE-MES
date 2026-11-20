import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { TaslakKomutu } from '#paylasilan/sozlesme/planlama.ts';
import { Dugme, Simge } from '../../../../ortak/arayuz/index.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { EtkiBolumu, useEtki } from './etki.tsx';
import { fasonMu, type KokpitModeli } from './kurallar.ts';
import type { TaslakYazici } from './taslak.ts';

// Elle böl (3488 c): adımın adedi parçalara ayrılır, her parça adımın uygun bir tezgâhında ayrı iş olur. Komut kişinin taslağına yazılır ve
// önce etkisiyle gösterilir (etki.tsx, Adıma sorun bildir ile aynı akış). Parçaların yerini motor seçer; parça tahtadan ayrıca taşınabilir.
// Bölme yalnız plandadır, üretim emrini partiye bölmez. Kural ve sınırlar (toplam, tezgâh, başlamış adım) sunucudadır; burada yalnız
// girilen sayının düzgünlüğü denetlenir.

export const PARCA_EN_COK = 6;
export interface Parca { adet: string; tezgah: string }
// Önerilen bölme: kayıtlı bölme varsa o; yoksa adet ilk iki tezgâha yarı yarıya (kalan ilk parçaya).
export function ilkParcalar(adet: number, tezgahlar: readonly string[], kayitli: readonly { adet: number; m: string }[] | null): Parca[] {
  if (kayitli !== null && kayitli.length >= 2) return kayitli.map((p) => ({ adet: String(p.adet), tezgah: p.m }));
  const a = Math.ceil(adet / 2);
  return [{ adet: String(a), tezgah: tezgahlar[0] ?? '' }, { adet: String(adet - a), tezgah: tezgahlar[1] ?? tezgahlar[0] ?? '' }];
}
// Girilen parçalar: her adet pozitif tam sayı ve tezgâhı seçili olmalı; toplam adımın adedi olmalı. Hata yoksa komutun payları.
export function parcaDenetimi(l: readonly Parca[], adet: number): { paylar: { adet: number; tezgah: string }[] | null; toplam: number; hata: string | null } {
  const sayilar = l.map((p) => (/^\d+$/.test(p.adet.trim()) ? Number(p.adet.trim()) : NaN));
  const toplam = sayilar.reduce((t, n) => t + (Number.isFinite(n) ? n : 0), 0);
  if (l.length < 2) return { paylar: null, toplam, hata: 'En az iki parça girin.' };
  if (sayilar.some((n) => !Number.isInteger(n) || n < 1)) return { paylar: null, toplam, hata: 'Her parçanın adedi 1 ya da daha çok tam sayı olmalı.' };
  if (l.some((p) => p.tezgah === '')) return { paylar: null, toplam, hata: 'Her parçanın tezgâhını seçin.' };
  if (toplam !== adet) return { paylar: null, toplam, hata: `Parçaların toplamı adımın adedi (${String(adet)}) olmalı.` };
  return { paylar: l.map((p, i) => ({ adet: sayilar[i]!, tezgah: p.tezgah })), toplam, hata: null };
}

export interface ElleBolOzellikleri {
  c: PlanlamaCalismasi;
  m: Pick<KokpitModeli, 'emirler' | 'tezgahlar' | 'isler'>;
  isId: string;
  taslak: TaslakYazici | null;
  yazabilir: boolean;
  kapat: () => void;
}

export function ElleBol({ c, m, isId, taslak, yazabilir, kapat }: ElleBolOzellikleri) {
  const e = m.emirler.find((x) => x.adimlar.some((a) => a.id === isId));
  const a = e?.adimlar.find((x) => x.id === isId);
  const tezgahlar = (a?.adaylar ?? []).filter((t) => !fasonMu(t));
  const kayitli = (c as unknown as { elleBol?: Record<string, { adet: number; m: string }[]> }).elleBol?.[isId] ?? null;
  const adet = e?.adet ?? 0;
  const [l, setL] = useState<Parca[]>(() => ilkParcalar(adet, tezgahlar, kayitli));
  const [goster, setGoster] = useState(false);
  const { durum, dene, uygula, vazgec } = useEtki({ c, taslak, sonuc: () => undefined });
  const kilitli = !yazabilir || taslak === null || taslak.mesgul || durum.tur === 'hesap' || durum.tur === 'etki';
  const d = parcaDenetimi(l, adet);
  const kod = (id: string): string => m.tezgahlar.find((t) => t.id === id)?.kod ?? id;
  const kok = useRef<HTMLElement>(null);
  useEffect(() => { kok.current?.scrollIntoView?.({ block: 'start' }); }, []);
  const yaz = (i: number, p: Partial<Parca>): void => { setL((o) => o.map((x, j) => (j === i ? { ...x, ...p } : x))); };
  const gonder = (ev: FormEvent): void => {
    ev.preventDefault();
    setGoster(true);
    if (!e || d.paylar === null) return;
    void dene({ tur: 'elle-bol', isId, paylar: d.paylar } satisfies TaslakKomutu, [e.id]);
  };
  const kaldir = (): void => { if (e) void dene({ tur: 'elle-bol-sil', isId } satisfies TaslakKomutu, [e.id]); };
  const ileti = durum.tur === 'hata' ? durum.ileti : goster ? d.hata : null;

  return (
    <aside ref={kok} className="tc-pyq-ayrinti tc-pyq-ayarlar tc-pyq-elle-bol" aria-label="Adımı böl">
      <header>
        <div><b>Adımı böl</b><small>Adet parçalara ayrılır, her parça ayrı tezgâhta yapılır. Bölme yalnız bu plandadır, üretim emrini partiye bölmez.</small></div>
        <button type="button" className="tc-pyq-simge-dugme" aria-label="Adımı bölmeyi kapat" onClick={kapat}><Simge ad="x" boyut="k" /></button>
      </header>
      {!e || !a ? <p className="tc-pyq-not">Adım bulunamadı; plan değişmiş olabilir.</p> : (
        <>
          <dl className="tc-pyq-adim-ozet">
            <div><dt>Operasyon</dt><dd>{e.no} · {a.ad}</dd></div>
            <div><dt>Adet</dt><dd>{adet}</dd></div>
            <div><dt>Kayıtlı bölme</dt><dd data-kayitli-bolme={kayitli === null ? 'yok' : ''}>{kayitli === null ? 'yok' : kayitli.map((p) => `${kod(p.m)} ${String(p.adet)}`).join(', ')}</dd></div>
          </dl>
          {!yazabilir && <p className="tc-pyq-not">Adımı yalnız planı yazabilen kişi böler.</p>}
          {tezgahlar.length < 1 && <p className="tc-pyq-not">Bu adımın uygun tezgâhı yok; bölünemez.</p>}
          {durum.tur === 'etki' ? <EtkiBolumu ad="Bölmenin etkisi" e={durum.e} uygula={() => { void uygula(durum.e); }} vazgec={() => { void vazgec(); }} /> : yazabilir && tezgahlar.length > 0 && (
            <form className="tc-pyq-ayar-etki" noValidate aria-label="Parçalar" onSubmit={gonder}>
              {l.map((p, i) => (
                <fieldset key={i} className="tc-pyq-elle-parca" data-parca={i + 1}>
                  <legend>Parça {i + 1}</legend>
                  <label className="tc-pyq-ayar-alan">
                    <span>Adet</span>
                    <input className="tc-alan-kutu" inputMode="numeric" autoComplete="off" value={p.adet} disabled={kilitli} onChange={(ev) => { yaz(i, { adet: ev.target.value }); }} />
                  </label>
                  <label className="tc-pyq-ayar-alan">
                    <span>Tezgâh</span>
                    <select className="tc-alan-kutu" value={p.tezgah} disabled={kilitli} onChange={(ev) => { yaz(i, { tezgah: ev.target.value }); }}>
                      {p.tezgah === '' && <option value="">Seçin</option>}
                      {tezgahlar.map((t) => <option key={t} value={t}>{kod(t)}</option>)}
                    </select>
                  </label>
                  {l.length > 2 && <Dugme tur="ikincil" simge="trash" aria-label={`Parça ${String(i + 1)}'i sil`} disabled={kilitli} onClick={() => { setL((o) => o.filter((_, j) => j !== i)); }}>Sil</Dugme>}
                </fieldset>
              ))}
              {l.length < PARCA_EN_COK && <span><Dugme tur="ikincil" simge="plus" disabled={kilitli} onClick={() => { setL((o) => [...o, { adet: '', tezgah: tezgahlar[o.length % tezgahlar.length] ?? '' }]); }}>Parça ekle</Dugme></span>}
              <p className="tc-pyq-not" data-toplam={d.toplam} role="status">Toplam {d.toplam} / {adet} adet. Parçaların yerini sistem seçer; bir parçayı sonra tahtadan taşıyabilirsiniz. Sonraki adım bütün parçaları bekler.</p>
              {ileti !== null && <p className="tc-pyq-ayar-hata" role="alert">{ileti}</p>}
              <div className="tc-pyq-ayar-dugmeler">
                <Dugme type="submit" tur="birincil" simge="clock" disabled={kilitli} yukleniyor={durum.tur === 'hesap'}>{durum.tur === 'hesap' ? 'Hesaplanıyor' : 'Etkisini gör'}</Dugme>
                {kayitli !== null && <Dugme tur="ikincil" simge="x" disabled={kilitli} onClick={kaldir}>Bölmeyi kaldır</Dugme>}
              </div>
            </form>
          )}
        </>
      )}
    </aside>
  );
}
