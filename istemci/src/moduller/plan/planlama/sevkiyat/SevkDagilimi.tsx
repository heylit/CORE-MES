import { useMemo, useState, type ReactNode } from 'react';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import type { EmirNo } from '../ortak/emir-no.ts';
import { sevkFarki } from './liste.ts';
import {
  GECIKMIS, MATRIS_GUN, anahtarDegeri, bitissizSayisi, gecikmisSayisi, gunListesi, matris, takvimGunleri,
  type DagilimAnahtari, type GunSatiri, type GunSecimi, type GunSekmesi,
} from './dagilim.ts';
import { farkYaz, gunYaz, saatMetni, sayiYaz, tarihSaatYaz, type Olcu, type SevkSatiri } from './kurallar.ts';

// 3667: Sevk takvimi "Dağılım" görünümü. İki biçim: Takvim (ay ızgarası; günde bitecek, aşan, termin) ve Matris (müşteri, ürün ya da yer × gün).
// Gün ya da matris hücresi seçilince altta siparişler açılır. İki ayrı küme: Gecikmiş (plan bitişi bugünden önce, sevk yok) ve Aşan (planın bitişi termini aşıyor).
// Görünüm yalnız okur; hesaplar dagilim.ts ve kurallar.ts'tendir.

type Bicim = 'takvim' | 'matris';
const BICIM_ANAHTARI = 'tmi.sevkiyat.dagilim';
const GUN_AD = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const GUN_UZUN = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
const SEKMELER: readonly { deger: GunSekmesi; baslik: string }[] = [
  { deger: 'tumu', baslik: 'Tümü' }, { deger: 'bitecek', baslik: 'Bitecek' }, { deger: 'termin', baslik: 'Termin' }, { deger: 'asan', baslik: 'Aşan' },
];
const ANAHTARLAR: readonly { deger: DagilimAnahtari; baslik: string }[] = [{ deger: 'musteri', baslik: 'Müşteri' }, { deger: 'urun', baslik: 'Ürün' }, { deger: 'yer', baslik: 'Yer' }];
const OLCULER: readonly { deger: Olcu; baslik: string }[] = [{ deger: 'siparis', baslik: 'Sipariş' }, { deger: 'adet', baslik: 'Adet' }];
const ILK_GUN_DAR = 7;

function bicimOku(): Bicim {
  try { return localStorage.getItem(BICIM_ANAHTARI) === 'matris' ? 'matris' : 'takvim'; } catch { return 'takvim'; }
}
function sakla(deger: string): void {
  try { localStorage.setItem(BICIM_ANAHTARI, deger); } catch { /* depo kapalı: yalnız bu açılışta geçerli */ }
}

function Secici<T extends string>({ etiket, secenekler, secili, sec }: {
  etiket: string; secenekler: readonly { deger: T; baslik: string }[]; secili: T; sec: (d: T) => void;
}) {
  return (
    <div className="tc-pyv-seg" role="group" aria-label={etiket}>
      {secenekler.map((s) => <button key={s.deger} type="button" aria-pressed={s.deger === secili} onClick={() => { sec(s.deger); }}>{s.baslik}</button>)}
    </div>
  );
}

function SecimKutusu<T extends string>({ etiket, secenekler, secili, sec }: {
  etiket: string; secenekler: readonly { deger: T; baslik: string }[]; secili: T; sec: (d: T) => void;
}) {
  return (
    <label>
      <span>{etiket}</span>
      <select value={secili} onChange={(e) => { sec(e.target.value as T); }}>
        {secenekler.map((o) => <option key={o.deger} value={o.deger}>{o.baslik}</option>)}
      </select>
    </label>
  );
}

export interface SevkDagilimiOzellikleri {
  satirlar: readonly SevkSatiri[];
  taban: number;
  simdi: number;
  emirNo: EmirNo;
  dar: boolean;
  gorunum: ReactNode;
  // Siparişi Kokpit'te seçer ve Kokpit'i açar (3537-1 yolu).
  goster: (id: string) => void;
}

export function SevkDagilimi({ satirlar, taban, simdi, emirNo, dar, gorunum, goster }: SevkDagilimiOzellikleri) {
  const [bicim, bicimYaz] = useState<Bicim>(bicimOku);
  const [olcu, olcuYaz] = useState<Olcu>('siparis');
  const [anahtar, anahtarYaz] = useState<DagilimAnahtari>('musteri');
  const [secim, secimYaz] = useState<GunSecimi | null>(null);
  const [sekme, sekmeYaz] = useState<GunSekmesi>('tumu');
  const [hucre, hucreYaz] = useState<string | null>(null);
  const [daha, dahaYaz] = useState(false);
  const bicimSec = (b: Bicim): void => { bicimYaz(b); sakla(b); };
  const gunSec = (g: GunSecimi): void => { secimYaz(g); hucreYaz(null); };

  const ge = gecikmisSayisi(satirlar, simdi, olcu);
  const bitissiz = bitissizSayisi(satirlar);
  const takvim = useMemo(() => takvimGunleri(satirlar, taban, simdi, olcu), [satirlar, taban, simdi, olcu]);
  const m = useMemo(() => matris(satirlar, simdi, anahtar, olcu), [satirlar, simdi, anahtar, olcu]);
  const liste = useMemo(
    () => (secim === null ? [] : gunListesi(satirlar, simdi, secim, sekme, hucre === null ? null : { anahtar, deger: hucre })),
    [satirlar, simdi, secim, sekme, hucre, anahtar],
  );
  const gunAdi = (g: number): string => gunYaz(taban, g * 24);
  const bugunNo = Math.floor(simdi / 24);
  const secimAdi = secim === null ? '' : secim === GECIKMIS ? 'Gecikmiş siparişler' : gunYaz(taban, secim * 24);

  const gecikmisDugmesi = (
    <button type="button" className="tc-pyv-d-gecikmis" aria-pressed={secim === GECIKMIS} onClick={() => { gunSec(GECIKMIS); }}>
      <Simge ad="alert" boyut="k" />Gecikmiş ({sayiYaz(ge)})
    </button>
  );

  return (
    <>
      <div className="tc-pyv-serit">
        {gorunum}
        <Secici etiket="Biçim" secenekler={[{ deger: 'takvim', baslik: 'Takvim' }, { deger: 'matris', baslik: 'Matris' }]} secili={bicim} sec={bicimSec} />
        {dar
          ? (
            <span className="tc-pyv-d-sec">
              <SecimKutusu etiket="Ölçü" secenekler={OLCULER} secili={olcu} sec={olcuYaz} />
              {bicim === 'matris' && <SecimKutusu etiket="Satır" secenekler={ANAHTARLAR} secili={anahtar} sec={(a) => { anahtarYaz(a); hucreYaz(null); }} />}
            </span>
          )
          : (
            <>
              <Secici etiket="Ölçü" secenekler={OLCULER} secili={olcu} sec={olcuYaz} />
              {bicim === 'matris' && <Secici etiket="Satır" secenekler={ANAHTARLAR} secili={anahtar} sec={(a) => { anahtarYaz(a); hucreYaz(null); }} />}
            </>
          )}
      </div>

      {bicim === 'takvim' && (
        <div className="tc-pyv-d-takvim">
          <div>{gecikmisDugmesi}</div>
          {!dar && (
            <div className="tc-pyv-d-izgara" role="group" aria-label="Takvim">
              {GUN_AD.map((a, i) => <span key={a} className="tc-pyv-d-baslik" aria-label={GUN_UZUN[i]}>{a}</span>)}
              {takvim.map((g) => {
                const ad = `${gunAdi(g.gun)}: ${sayiYaz(g.sayi.bitecek)} bitecek, ${sayiYaz(g.sayi.asan)} aşan, ${sayiYaz(g.sayi.termin)} termin${g.bugun ? ', bugün' : ''}`;
                return (
                  <button
                    key={g.gun} type="button" className="tc-pyv-d-gun" disabled={g.bos} aria-label={ad} aria-pressed={secim === g.gun} aria-current={g.bugun ? 'date' : undefined}
                    data-bugun={g.bugun ? '' : undefined} data-ton={g.sayi.asan > 0 ? 'hata' : undefined} onClick={() => { gunSec(g.gun); }}
                  >
                    <span className="tc-pyv-d-tarih">{gunYaz(taban, g.gun * 24).slice(0, 5)}{g.bugun ? ' · bugün' : ''}</span>
                    {g.sayi.bitecek > 0 && <span data-k="bitecek"><Simge ad="truck" boyut="k" />{sayiYaz(g.sayi.bitecek)} bitecek</span>}
                    {g.sayi.asan > 0 && <span data-k="asan"><Simge ad="alert" boyut="k" />{sayiYaz(g.sayi.asan)} aşan</span>}
                    {g.sayi.termin > 0 && <span data-k="termin"><Simge ad="flag" boyut="k" />{sayiYaz(g.sayi.termin)} termin</span>}
                    {g.bos && <span className="tc-pyv-d-bos">{g.planDisi ? 'plan yok' : 'sipariş yok'}</span>}
                  </button>
                );
              })}
            </div>
          )}
          {dar && (
            <div className="tc-pyv-d-gunler" role="group" aria-label="Günler">
              {takvim.filter((g) => g.gun >= bugunNo).slice(0, MATRIS_GUN).filter((_, i) => daha || i < ILK_GUN_DAR).map((g) => (
                <button
                  key={g.gun} type="button" className="tc-pyv-d-gun" aria-pressed={secim === g.gun} data-bugun={g.bugun ? '' : undefined}
                  data-ton={g.sayi.asan > 0 ? 'hata' : undefined} onClick={() => { gunSec(g.gun); }}
                  aria-label={`${gunAdi(g.gun)}: ${sayiYaz(g.sayi.bitecek)} bitecek, ${sayiYaz(g.sayi.asan)} aşan, ${sayiYaz(g.sayi.termin)} termin${g.bugun ? ', bugün' : ''}`}
                >
                  <b className="tc-pyv-d-tarih">{gunAdi(g.gun)}{g.bugun ? ' · bugün' : ''}</b>
                  {g.sayi.bitecek > 0 && <span data-k="bitecek"><Simge ad="truck" boyut="k" />{sayiYaz(g.sayi.bitecek)} bitecek</span>}
                  {g.sayi.asan > 0 && <span data-k="asan"><Simge ad="alert" boyut="k" />{sayiYaz(g.sayi.asan)} aşan</span>}
                  {g.sayi.termin > 0 && <span data-k="termin"><Simge ad="flag" boyut="k" />{sayiYaz(g.sayi.termin)} termin</span>}
                  {g.bos && <span className="tc-pyv-d-bos">{g.planDisi ? 'plan yok' : 'sipariş yok'}</span>}
                </button>
              ))}
              {!daha && <button type="button" className="tc-pyv-d-daha" onClick={() => { dahaYaz(true); }}>Daha fazla gün</button>}
            </div>
          )}
        </div>
      )}

      {bicim === 'matris' && (
        <>
        <div className="tc-pyv-d-kap" tabIndex={0} role="region" aria-label="Matris, yana kaydırılabilir">
          <table className="tc-pyv-d-matris" aria-label={`${ANAHTARLAR.find((a) => a.deger === anahtar)?.baslik ?? ''} ve gün matrisi`}>
            <thead>
              <tr>
                <th scope="col">{ANAHTARLAR.find((a) => a.deger === anahtar)?.baslik}</th>
                <th scope="col">Gecikmiş</th>
                {m.gunler.map((g, i) => <th key={g} scope="col" data-bugun={i === 0 ? '' : undefined}>{gunAdi(g)}{i === 0 ? ' · bugün' : ''}</th>)}
                <th scope="col">Toplam</th>
              </tr>
            </thead>
            <tbody>
              {m.satirlar.map((s) => (
                <tr key={s.ad}>
                  <th scope="row">{s.ad}</th>
                  <td data-ton={s.gecikmis > 0 ? 'hata' : undefined} data-secili={secim === GECIKMIS && hucre === s.ad ? '' : undefined}>
                    {s.gecikmis > 0
                      ? <button type="button" aria-label={`${s.ad}, gecikmiş: ${sayiYaz(s.gecikmis)}`} onClick={() => { secimYaz(GECIKMIS); hucreYaz(s.ad); }}><Simge ad="alert" boyut="k" />{sayiYaz(s.gecikmis)}</button>
                      : <span className="tc-pyv-bos" aria-label="yok">·</span>}
                  </td>
                  {s.hucreler.map((h, i) => {
                    const g = m.gunler[i] ?? 0;
                    return (
                      <td key={g} data-ton={h.asan > 0 ? 'hata' : undefined} data-secili={secim === g && hucre === s.ad ? '' : undefined}>
                        {h.toplam > 0
                          ? (
                            <button type="button" aria-label={`${s.ad}, ${gunAdi(g)}: ${sayiYaz(h.toplam)} bitecek, ${sayiYaz(h.asan)} aşan`} onClick={() => { secimYaz(g); hucreYaz(s.ad); }}>
                              {sayiYaz(h.toplam)}{h.asan > 0 && <span className="tc-pyv-d-asan"><Simge ad="alert" boyut="k" />{sayiYaz(h.asan)}</span>}
                            </button>
                          )
                          : <span className="tc-pyv-bos" aria-label="yok">·</span>}
                      </td>
                    );
                  })}
                  <td className="tc-pyv-d-top">{sayiYaz(s.toplam)}</td>
                </tr>
              ))}
              <tr className="tc-pyv-d-toplam">
                <th scope="row">Toplam</th>
                <td>{m.gecikmisToplam > 0 ? sayiYaz(m.gecikmisToplam) : '·'}</td>
                {m.gunToplamlari.map((n, i) => <td key={m.gunler[i]}>{n > 0 ? sayiYaz(n) : '·'}</td>)}
                <td className="tc-pyv-d-top">{sayiYaz(m.genelToplam)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {dar && <p className="tc-pyv-not">Yatay kayar: Gecikmiş ve bugün sabit, ilerleyen günler sağda. Hücredeki üçgen ve sayı: o kadarı aşan.</p>}
        </>
      )}

      <p className="tc-pyv-not">
        Bitecek: son adımın plana göre bitişi o gün olan, sevk edilmemiş sipariş. Aşan: planın bitişi termini aşıyor. Gecikmiş: plan bitişi bugünden önce, sevk kaydı yok
        (aşan ve gecikmiş ayrı kümelerdir). Termin: müşteriye söz verilen gün.{bitissiz > 0 ? ` Plana göre bitişi olmayan ${sayiYaz(bitissiz)} sipariş günlere dağıtılmaz.` : ''}
      </p>

      {secim === null
        ? <p className="tc-pyv-not">{bicim === 'takvim' ? 'Bir gün seçin: o günün siparişleri burada açılır.' : 'Bir hücre seçin: siparişleri burada açılır.'}</p>
        : (
          <section className="tc-pyv-d-liste" aria-label="Seçilen günün siparişleri" aria-live="polite">
            <h3>
              {secim === GECIKMIS ? secimAdi : `${gunAdi(secim)} · ${sayiYaz(liste.length)} sipariş`}
              {secim === GECIKMIS && ` · ${sayiYaz(liste.length)} sipariş`}
              {hucre !== null && <> · {hucre} <button type="button" className="tc-pyv-l-temizle" onClick={() => { hucreYaz(null); }}>Süzgeci kaldır</button></>}
            </h3>
            {secim !== GECIKMIS && <Secici etiket="Liste" secenekler={SEKMELER} secili={sekme} sec={sekmeYaz} />}
            {liste.length === 0
              ? <p className="tc-pyv-not">Bu seçim için sipariş yok.</p>
              : <ul>{liste.map((s) => <GunSatiriGorunumu key={s.x.id} s={s} taban={taban} bugunNo={bugunNo} emirNo={emirNo} goster={goster} />)}</ul>}
          </section>
        )}
    </>
  );
}

function GunSatiriGorunumu({ s, taban, bugunNo, emirNo, goster }: { s: GunSatiri; taban: number; bugunNo: number; emirNo: EmirNo; goster: (id: string) => void }) {
  const { x } = s;
  const gecikmis = x.C !== null && Math.floor(x.C / 24) < bugunNo;
  const fark = sevkFarki(x);
  const durum = s.asan ? `Aşıyor +${saatMetni(x.T ?? 0)}` : gecikmis ? 'Gecikmiş' : '';
  return (
    <li data-ton={s.asan || gecikmis ? 'hata' : undefined}>
      <b className="mono">{emirNo(x.id)}</b>
      <span>{`${x.ad ?? '—'} · ${anahtarDegeri(x, 'musteri')} · ${x.adet === null ? '—' : sayiYaz(x.adet)} adet`}</span>
      <span className="tc-pyv-d-tarihler"><span>Termin <b className="mono">{tarihSaatYaz(taban, x.termin)}</b></span><span>Plan <b className="mono">{tarihSaatYaz(taban, x.C)}</b></span>{fark !== null && <span>Fark <b className="mono">{fark === 0 ? '0 sa' : farkYaz(fark)}</b></span>}</span>
      {durum !== '' && <span data-ton="hata" className="tc-pyv-d-durum"><Simge ad="alert" boyut="k" />{durum}</span>}
      <button type="button" className="tc-pyv-l-temizle tc-pyv-d-git" onClick={() => { goster(x.id); }}><Simge ad="target" boyut="k" />Kokpit'te gör</button>
    </li>
  );
}
