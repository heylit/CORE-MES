import { useId, useMemo, useState } from 'react';
import { Dugme, Pencere, Simge } from '../../../../ortak/arayuz/index.ts';
import { AcKapa } from '../../../../ortak/arayuz/AcKapa.tsx';
import {
  BASTAN_KUR_SATIRI_EN_COK, baslamisListesi, bastanKurDugmesi, bastanKurNedeni, bastanKurOzeti, gerideKartlari, kartAdi, kartAra,
  type BastanKurIstegi, type BastanKurKapsami,
} from './bastan-kur.ts';
import type { KokpitModeli } from './kurallar.ts';
import type { SiraKarti } from './yerlestirme.ts';

// Baştan kur penceresi (3600, seçenek B): önce kapsam, sonra neyin yerinde kaldığı, onaydan önce etki. Seçilmeyen siparişler yerinde kalır.
// Elle kilitli işler varsayılan olarak dizilir ve kilitleri onayda kalkar (Geri al getirir). Başlamış işin kalanı yalnız yönetici anahtarıyla
// ve ikinci onay penceresinden sonra dizilir (Karar 1 b); anahtar kapalıyken başlamış iş yerinde kalır.
export interface BastanKurOnayi { isler: string[]; kilitKaldir: boolean; baslamisDiz: boolean; ileti: string }
export interface BastanKurOzellikleri {
  m: Pick<KokpitModeli, 'isler' | 'simdi' | 'emirler'> & Partial<Pick<KokpitModeli, 'tezgahlar'>>;
  kartlar: readonly SiraKarti[];
  planYok: boolean;
  // Kilit kaldırmak plan.kilitle ister; yetkisizde anahtar pasif ve kapalıdır (sunucu yine reddeder).
  kilitYetkisi: boolean;
  // plan.baslamis-diz (yalnız yönetici): yetkisiz kişide anahtar pasif ve kapalıdır, sunucu yine reddeder.
  baslamisYetkisi: boolean;
  // Çalışmanın gercek kaydı (yapılan sayısı ve sürüyor işareti); ikinci pencerede gösterilir.
  gercek: Readonly<Record<string, unknown>> | null;
  ilkKapsam: BastanKurKapsami;
  ilkSecili: readonly string[];
  vazgec: () => void;
  onayla: (o: BastanKurOnayi) => void;
}

const BASLAMIS_SATIRI_EN_COK = 5;
const KAPSAM_ADI: Record<BastanKurKapsami, string> = { tum: 'Bütün plan', geride: 'Geride kalanlar', secili: 'Seçili siparişler' };

export function BastanKur({ m, kartlar, planYok, kilitYetkisi, baslamisYetkisi, gercek, ilkKapsam, ilkSecili, vazgec, onayla }: BastanKurOzellikleri) {
  const [kapsam, setKapsam] = useState<BastanKurKapsami>(ilkKapsam);
  const [secili, setSecili] = useState<readonly string[]>(ilkSecili);
  const [ara, setAra] = useState('');
  const [kilitDiz, setKilitDiz] = useState(kilitYetkisi);
  const [baslamisDiz, setBaslamisDiz] = useState(false);
  const [onayAcik, setOnayAcik] = useState(false);
  const kimlik = useId();
  const geride = useMemo(() => gerideKartlari(m, kartlar), [m, kartlar]);
  const baslamisAcik = baslamisDiz && baslamisYetkisi;
  const istek: BastanKurIstegi = { kapsam, secili, kilitDiz: kilitDiz && kilitYetkisi, baslamisDiz: baslamisAcik };
  const o = useMemo(() => bastanKurOzeti(m, kartlar, istek), [m, kartlar, kapsam, secili, kilitDiz, kilitYetkisi, baslamisAcik]);
  const neden = bastanKurNedeni(planYok, kapsam, o);
  const sayi: Record<BastanKurKapsami, number> = { tum: kartlar.length, geride: geride.length, secili: secili.length };
  const bulunan = useMemo(() => kartAra(kartlar, ara), [kartlar, ara]);
  const gorunen = bulunan.slice(0, BASTAN_KUR_SATIRI_EN_COK);
  const gorunenKokler = new Set(gorunen.map((k) => k.kok));
  const listedeOlmayan = secili.filter((k) => !gorunenKokler.has(k)).length;
  const secKapa = (kok: string): void => { setSecili((l) => (l.includes(kok) ? l.filter((x) => x !== kok) : [...l, kok])); };
  const kilitNotu = o.kilitli === 0 ? 'Seçili kapsamda kilitli iş yok.'
    : !kilitYetkisi ? 'Kilitleri kaldırmak plan kilitleme yetkisi ister; kilitli işler yerinde kalır.'
    : kilitDiz ? `Onayda ${String(o.kalkacakKilit)} elle kilit kalkar; Geri al ile döner.` : `${String(o.kilitli)} kilitli iş yerinde kalır.`;
  const ileti = `${kapsam === 'tum' ? 'Plan' : kapsam === 'geride' ? `Geride kalan ${String(o.siparis)} sipariş` : `${String(o.siparis)} sipariş`} baştan kuruldu${o.kalkacakKilit > 0 ? `; ${String(o.kalkacakKilit)} kilit kalktı` : ''}${baslamisAcik && o.baslamis > 0 ? `; ${String(o.baslamis)} başlamış işin kalanı dizildi` : ''}.`;
  const baslamisIsleri = useMemo(() => (baslamisAcik ? baslamisListesi(m, kartlar, istek, gercek) : []), [m, kartlar, kapsam, secili, kilitDiz, kilitYetkisi, baslamisAcik, gercek]);
  const onayla_ = (): void => { onayla({ isler: o.isler, kilitKaldir: o.kalkacakKilit > 0, baslamisDiz: baslamisAcik && o.baslamis > 0, ileti }); };
  // Başlamış iş dahilse onay ikinci pencerede alınır (Arayüz Y7 a): düğme "Devam" der.
  const ikinciOnay = baslamisAcik && o.baslamis > 0;

  return (
    <>
    <Pencere
      acik
      kapat={vazgec}
      baslik="Planı baştan kur"
      alt={(
        <div className="tc-pyq-bk-alt">
          {neden !== null && <p className="tc-pyq-bk-neden" role="status">{neden}</p>}
          <Dugme onClick={vazgec} data-ilk-odak>Vazgeç</Dugme>
          <Dugme tur="birincil" simge="rotate" disabled={neden !== null} onClick={() => { if (ikinciOnay) setOnayAcik(true); else onayla_(); }}>{bastanKurDugmesi(kapsam, o.siparis, ikinciOnay)}</Dugme>
        </div>
      )}
    >
      <div className="tc-pyq-bk">
        <p className="tc-pyq-bk-not">Sıra yeniden dizilir; plansız emirler de yerleşir. Seçilmeyen siparişler yerinde kalır.</p>
        <div role="radiogroup" aria-label="Kapsam" className="tc-pyq-bk-kapsam">
          {(['tum', 'geride', 'secili'] as const).map((k) => (
            <button
              key={k} type="button" role="radio" aria-checked={kapsam === k} data-kapsam={k}
              disabled={k === 'geride' && geride.length === 0}
              onClick={() => { setKapsam(k); }}
            >{KAPSAM_ADI[k]} <small>({String(sayi[k])})</small></button>
          ))}
        </div>

        {kapsam === 'secili' && (
          <div className="tc-pyq-bk-secim">
            <label className="tc-pyq-bk-ara" htmlFor={`${kimlik}-ara`}>
              <Simge ad="search" boyut="k" />
              <input id={`${kimlik}-ara`} type="search" value={ara} placeholder="Sipariş no, ürün ya da müşteri ara" onChange={(e) => { setAra(e.target.value); }} />
            </label>
            <ul className="tc-pyq-bk-liste" aria-label="Siparişler">
              {gorunen.map((k) => {
                const on = secili.includes(k.kok);
                const kilitli = k.emirler.flatMap((e) => e.adimlar).filter((a) => m.isler[a.id]?.kilitli === true && m.isler[a.id]?.basladi !== true).length;
                const basladi = k.emirler.flatMap((e) => e.adimlar).filter((a) => m.isler[a.id]?.basladi === true && m.isler[a.id]?.bitti !== true).length;
                return (
                  <li key={k.kok}>
                    <label>
                      <input type="checkbox" checked={on} onChange={() => { secKapa(k.kok); }} />
                      <span className="tc-pyq-bk-no">{kartAdi(k)}</span>
                      <span className="tc-pyq-bk-urun">{k.emirler[0]?.urun ?? ''}</span>
                      <span className="tc-pyq-bk-rozetler">
                        {kilitli > 0 && <span title="Elle kilitli iş"><Simge ad="lock" boyut="k" />{kilitli}</span>}
                        {basladi > 0 && <span title="Başlamış iş"><Simge ad="play" boyut="k" />{basladi}</span>}
                        {k.durum === 'gec' && <span data-gec="">Geç</span>}
                      </span>
                    </label>
                  </li>
                );
              })}
              {gorunen.length === 0 && <li className="tc-pyq-bk-bos">Eşleşen sipariş yok.</li>}
            </ul>
            {bulunan.length > gorunen.length && <p className="tc-pyq-bk-not">{String(bulunan.length)} sonuç, ilk {String(gorunen.length)} gösteriliyor. Aramayı daraltın.</p>}
            {listedeOlmayan > 0 && (
              <p className="tc-pyq-bk-not">
                Listede görünmeyen {String(listedeOlmayan)} seçili sipariş var.{' '}
                <button type="button" className="tc-pyq-bk-baglanti" onClick={() => { setSecili((l) => l.filter((k) => gorunenKokler.has(k))); }}>Görünmeyenleri çıkar</button>
              </p>
            )}
          </div>
        )}

        <div className="tc-pyq-bk-blok" role="group" aria-label="Kilitli ve başlamış işler">
          <div>
            <Simge ad="lock" boyut="k" />
            <span><b>Kilitli işler dizilir</b><small>{kilitNotu}</small></span>
            <AcKapa etiket="Kilitli işleri de diz" acik={kilitDiz && kilitYetkisi && o.kilitli > 0} degistir={setKilitDiz} disabled={!kilitYetkisi || o.kilitli === 0} />
          </div>
          <div>
            <Simge ad="play" boyut="k" />
            <span>
              <b>{baslamisAcik ? 'Başlamış işlerin kalanı dizilir' : 'Başlamış işler yerinde kalır'}</b>
              <small>{o.baslamis === 0 ? 'Seçili kapsamda başlamış iş yok.'
                : !baslamisYetkisi ? `${String(o.baslamis)} başlamış iş yerinde kalır. Kalanını dizmek yönetici yetkisi ister (plan.baslamis-diz).`
                : baslamisAcik ? `${String(o.baslamis)} başlamış işin kalanı dizilir; yapılan sayı terminalde kalır. Devam'da onay istenir.`
                : `${String(o.baslamis)} başlamış iş yerinde kalır; terminaldeki sayım değişmez.`}</small>
            </span>
            <AcKapa etiket="Başlamış işlerin kalanını da diz" acik={baslamisAcik && o.baslamis > 0} degistir={setBaslamisDiz} disabled={!baslamisYetkisi || o.baslamis === 0} />
          </div>
        </div>

        <dl className="tc-pyq-bk-etki" aria-label="Onaydan önce etki">
          <div><dt>Yeniden dizilir</dt><dd>{String(o.diz)} iş</dd></div>
          <div><dt>Kalkacak kilit</dt><dd>{String(o.kalkacakKilit)}</dd></div>
          <div><dt>Yerinde kalan</dt><dd>{String((baslamisAcik ? 0 : o.baslamis) + (kilitDiz && kilitYetkisi ? 0 : o.kilitli))} iş</dd></div>
        </dl>
      </div>
    </Pencere>
    {onayAcik && (
      <Pencere
        acik
        kapat={() => { setOnayAcik(false); }}
        baslik="Başlamış işler de dizilsin mi?"
        alt={(
          <div className="tc-pyq-bk-alt">
            <Dugme onClick={() => { setOnayAcik(false); }} data-ilk-odak>Vazgeç</Dugme>
            <Dugme tur="tehlike" simge="rotate" onClick={() => { setOnayAcik(false); onayla_(); }}>Başlamış işlerle birlikte diz</Dugme>
          </div>
        )}
      >
        <div className="tc-pyq-bk" role="group" aria-label="Etkilenen başlamış işler">
          <p className="tc-pyq-bk-not">
            Aşağıdaki {String(baslamisIsleri.length)} başlamış işte terminaldeki makine ya da kişi plandan ayrışabilir. Yapılan sayı terminalde kalır; yalnız kalan adet dizilir.
            Terminalde şu an çalışan iş canlıda yerinde kalır.
          </p>
          <ul className="tc-pyq-bk-liste" aria-label="Başlamış işler">
            {baslamisIsleri.slice(0, BASLAMIS_SATIRI_EN_COK).map((b) => (
              <li key={b.id}>
                <span className="tc-pyq-bk-no">{b.emirNo} · {b.ad}</span>
                <span className="tc-pyq-bk-urun">{m.tezgahlar?.find((t) => t.id === b.tezgah)?.kod ?? b.tezgah}</span>
                <span className="tc-pyq-bk-rozetler">
                  {b.yapilan !== null && b.kalan !== null && <span>yapılan {String(b.yapilan)} / kalan {String(b.kalan)}</span>}
                  {b.calisiyor && <span title="Terminalde çalışıyor"><Simge ad="play" boyut="k" />terminalde çalışıyor</span>}
                </span>
              </li>
            ))}
          </ul>
          {baslamisIsleri.length > BASLAMIS_SATIRI_EN_COK && <p className="tc-pyq-bk-not">+{String(baslamisIsleri.length - BASLAMIS_SATIRI_EN_COK)} iş daha</p>}
        </div>
      </Pencere>
    )}
    </>
  );
}
