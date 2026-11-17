import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { TaslakKomutu } from '#paylasilan/sozlesme/planlama.ts';
import { Dugme, Simge } from '../../../../ortak/arayuz/index.ts';
import { girdiSaati, girdidenSaat } from '../ic/veri/kurallar.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { EtkiBolumu, useEtki } from './etki.tsx';
import { BEKLEME_ADI, adimBeklemeleri, adimEkleri, adimEkYazisi, type BeklemeNedeni, type KokpitModeli } from './kurallar.ts';
import type { TaslakYazici } from './taslak.ts';

// Adıma sorun bildirme (3335 a, dilim 3b ve 3c): planda yeri olan adımın kaç saat uzadığı ya da malzeme ve kişi yokluğundan ne zamana
// kadar başlayamayacağı kişinin taslağına komut olarak yazılır ve önce etkisiyle gösterilir (etki.tsx, Duruş ve mesai ile aynı akış).
// Uzama adımın plandaki bitişine eklenir; bekleme adımın en erken başlangıcıdır. Kural ve sınırlar sunucudadır.

const EN_AZ = 0.25, EN_COK = 240;
const ARALIK = 'Uzamayı 0,25 ile 240 saat arasında, çeyrek saat adımıyla girin.';
const BEKLEME_GECMIS = 'Şimdiden sonraki bir tarih ve saat girin.';
type Tur = 'uzadi' | BeklemeNedeni;
const TURLER: readonly { id: Tur; ad: string }[] = [{ id: 'uzadi', ad: 'Adım uzadı' }, { id: 'malzeme', ad: 'Malzeme yok' }, { id: 'kisi', ad: 'Kişi yok' }];
const ACIKLAMA: Record<Tur, string> = {
  uzadi: 'Süre adımın plandaki bitişine eklenir; sonraki adımlar ve tezgâhtaki işler buna göre kayar.',
  malzeme: 'Adım bu andan önce başlamaz; tezgâh o zamana kadar başka işe verilebilir. Aynı malzemeyi kullanan öteki emirler etkilenmez.',
  kisi: 'Adım bu andan önce başlamaz; tezgâh o zamana kadar başka işe verilebilir. Kişinin öteki işleri etkilenmez.',
};
const ceyrek = (h: number): number => Math.round(h * 4) / 4;

// Girilen saat: virgül de kabul edilir; çeyrek saatin katı değilse ya da aralık dışındaysa null.
export function ekSaatOku(v: string): number | null {
  const n = Number(v.trim().replace(',', '.'));
  if (v.trim() === '' || !Number.isFinite(n) || n < EN_AZ || n > EN_COK || Math.abs(n * 4 - Math.round(n * 4)) > 1e-9) return null;
  return Math.round(n * 4) / 4;
}

export interface AdimSorunuOzellikleri {
  c: PlanlamaCalismasi;
  m: Pick<KokpitModeli, 'isler' | 'emirler' | 'tezgahlar' | 'simdi'>;
  isId: string;
  taslak: TaslakYazici | null;
  yazabilir: boolean;
  zaman: (t: number) => string;
  kapat: () => void;
}

export function AdimSorunu({ c, m, isId, taslak, yazabilir, zaman, kapat }: AdimSorunuOzellikleri) {
  const x = m.isler[isId];
  const emir = m.emirler.find((e) => e.adimlar.some((a) => a.id === isId));
  const kayitli = adimEkleri(c)[isId] ?? null;
  const bekleme = adimBeklemeleri(c, m.simdi)[isId] ?? null;
  const basladi = x?.basladi === true;
  const [tur, setTur] = useState<Tur>(() => (bekleme !== null && !basladi ? bekleme.neden : 'uzadi'));
  const [saat, setSaat] = useState(() => (kayitli === null ? '' : String(kayitli).replace('.', ',')));
  // Öneri: kayıtlı bekleme anı; yoksa ertesi günün aynı saati (çeyrek saate yuvarlanır).
  const [kadar, setKadar] = useState(() => girdiSaati(c.D, bekleme?.kadar ?? Math.ceil(m.simdi) + 24));
  const [hata, setHata] = useState<string | null>(null);
  const [etkiAdi, setEtkiAdi] = useState('Uzamanın etkisi');
  const { durum, dene, uygula, vazgec } = useEtki({ c, taslak, sonuc: () => undefined });
  const kilitli = !yazabilir || taslak === null || taslak.mesgul || durum.tur === 'hesap' || durum.tur === 'etki';
  const kok = useRef<HTMLElement>(null);
  useEffect(() => {
    kok.current?.querySelector<HTMLElement>('#tc-pyq-adim-ek, #tc-pyq-adim-bekle')?.focus({ preventScroll: true });
    kok.current?.scrollIntoView?.({ block: 'start' });
  }, []);

  const gonder = (e: FormEvent) => {
    e.preventDefault();
    if (tur === 'uzadi') {
      const n = ekSaatOku(saat);
      setHata(n === null ? ARALIK : null);
      if (n === null) return;
      setEtkiAdi('Uzamanın etkisi');
      void dene({ tur: 'adim-uzadi', isId, ekSaat: n } satisfies TaslakKomutu);
      return;
    }
    const t = girdidenSaat(c.D, kadar);
    const gecersiz = t === null || !(ceyrek(t) > m.simdi);
    setHata(gecersiz ? BEKLEME_GECMIS : null);
    if (gecersiz) return;
    setEtkiAdi('Beklemenin etkisi');
    void dene({ tur: 'adim-bekler', isId, kadar: ceyrek(t), neden: tur } satisfies TaslakKomutu);
  };
  const kaldir = () => { setHata(null); setEtkiAdi('Uzamanın etkisi'); void dene({ tur: 'adim-uzadi-sil', isId } satisfies TaslakKomutu); };
  const beklemeKaldir = () => { setHata(null); setEtkiAdi('Beklemenin etkisi'); void dene({ tur: 'adim-bekler-sil', isId } satisfies TaslakKomutu); };
  const ileti = hata ?? (durum.tur === 'hata' ? durum.ileti : null);
  const tezgah = x ? (x.fason ? 'Fason' : m.tezgahlar.find((t) => t.id === x.m)?.kod ?? x.m) : null;
  const bekler = tur !== 'uzadi';

  return (
    <aside ref={kok} className="tc-pyq-ayrinti tc-pyq-ayarlar tc-pyq-adim-sorunu" aria-label="Adıma sorun bildir">
      <header>
        <div><b>Adıma sorun bildir</b><small>Adım uzadıysa kaç saat uzadığını, malzeme ya da kişi yoksa ne zaman başlayabileceğini yazın.</small></div>
        <button type="button" className="tc-pyq-simge-dugme" aria-label="Adıma sorun bildirmeyi kapat" onClick={kapat}><Simge ad="x" boyut="k" /></button>
      </header>
      {!x ? <p className="tc-pyq-not">Bu adım planda yerleşmemiş; önce plana alın.</p> : (
        <>
          <dl className="tc-pyq-adim-ozet">
            <div><dt>Operasyon</dt><dd>{emir ? `${emir.no} · ${x.ad}` : x.ad}</dd></div>
            <div><dt>Tezgâh</dt><dd>{tezgah}</dd></div>
            <div><dt>Plandaki bitiş</dt><dd className="tc-pyq-mono">{zaman(x.C)}</dd></div>
            <div><dt>Bildirilen uzama</dt><dd data-adim-ek={kayitli === null ? 'yok' : ''}>{kayitli === null ? 'yok' : adimEkYazisi(kayitli)}</dd></div>
            <div><dt>Bildirilen bekleme</dt><dd data-adim-bekle={bekleme === null ? 'yok' : ''}>{bekleme === null ? 'yok' : `${BEKLEME_ADI[bekleme.neden]}, ${zaman(bekleme.kadar)}'e kadar`}</dd></div>
          </dl>
          {!yazabilir && <p className="tc-pyq-not">Adıma sorunu yalnız planı yazabilen kişi bildirir.</p>}
          {durum.tur === 'etki' ? <EtkiBolumu ad={etkiAdi} e={durum.e} uygula={() => { void uygula(durum.e); }} vazgec={() => { void vazgec(); }} /> : yazabilir && (
            <form className="tc-pyq-ayar-etki" noValidate aria-label="Sorun bildirimi" onSubmit={gonder}>
              <div className="tc-pyq-ayar-alan">
                <label htmlFor="tc-pyq-adim-tur">Sorun</label>
                <select id="tc-pyq-adim-tur" className="tc-alan-kutu" value={tur} disabled={kilitli} aria-describedby={basladi ? 'tc-pyq-adim-tur-not' : undefined}
                  onChange={(ev) => { setHata(null); setTur(TURLER.find((t) => t.id === ev.target.value)?.id ?? 'uzadi'); }}>
                  {TURLER.map((t) => <option key={t.id} value={t.id} disabled={basladi && t.id !== 'uzadi'}>{t.ad}</option>)}
                </select>
                {basladi && <small id="tc-pyq-adim-tur-not">Adım başlamış; malzeme ya da kişi yokluğu başlamamış adıma bildirilir.</small>}
              </div>
              {bekler ? (
                <div className="tc-pyq-ayar-alan">
                  <label htmlFor="tc-pyq-adim-bekle">{tur === 'malzeme' ? 'Malzeme ne zaman gelir' : 'Ne zamana kadar'}</label>
                  <input id="tc-pyq-adim-bekle" className="tc-alan-kutu" type="datetime-local" step={900} value={kadar} disabled={kilitli}
                    aria-invalid={hata !== null || undefined} aria-describedby="tc-pyq-adim-ek-not" onChange={(ev) => { setKadar(ev.target.value); }} />
                </div>
              ) : (
                <div className="tc-pyq-ayar-alan">
                  <label htmlFor="tc-pyq-adim-ek">{kayitli === null ? 'Kaç saat uzadı' : 'Toplam kaç saat uzadı'}</label>
                  <input id="tc-pyq-adim-ek" className="tc-alan-kutu" type="text" inputMode="decimal" autoComplete="off" value={saat} disabled={kilitli}
                    aria-invalid={hata !== null || undefined} aria-describedby="tc-pyq-adim-ek-not" onChange={(ev) => { setSaat(ev.target.value); }} />
                </div>
              )}
              <p className="tc-pyq-not" id="tc-pyq-adim-ek-not">{ACIKLAMA[tur]}</p>
              {ileti !== null && <p className="tc-pyq-ayar-hata" role="alert">{ileti}</p>}
              <div className="tc-pyq-ayar-dugmeler">
                <Dugme type="submit" tur="ikincil" simge="clock" disabled={kilitli}>{durum.tur === 'hesap' ? 'Hesaplanıyor' : 'Etkisini gör'}</Dugme>
                {!bekler && kayitli !== null && <Dugme tur="ikincil" simge="x" disabled={kilitli} onClick={kaldir}>Uzamayı kaldır</Dugme>}
                {bekleme !== null && (bekler || kayitli === null) && <Dugme tur="ikincil" simge="x" disabled={kilitli} onClick={beklemeKaldir}>Bildirimi kaldır</Dugme>}
              </div>
            </form>
          )}
        </>
      )}
    </aside>
  );
}
