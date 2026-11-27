import { useEffect, useRef } from 'react';
import type { TeklifFormuAlanAnahtari, TeklifFormuDegerliAlan, TeklifFormuDili, TeklifFormuIcerigi } from '#paylasilan/sozlesme/siparisler.ts';
import { CokSatir, Dugme, Girdi, Rozet, Simge, useBildirim, useTelefon } from '../../ortak/arayuz/index.ts';
import {
  ALAN_DEGERI_EN_COK, ALAN_ETIKETI_EN_COK, FORM_ALAN_BOLUMLERI, FORM_ALAN_TANIMLARI, FORM_SOZLERI, alanAyari, alanDegistir, type AlanTanimi,
} from './teklif-formu.ts';

interface Ozellikler {
  icerik: TeklifFormuIcerigi;
  dil: TeklifFormuDili;
  degistir: (p: Partial<TeklifFormuIcerigi>) => void;
  // Teklifin kayıttaki metin değerleri; verilmezse (şablon) değer kutusu çizilmez, şablon yalnız etiket ve görünüm taşır.
  kayit?: Record<TeklifFormuDegerliAlan, string | null>;
}

const ad = (t: AlanTanimi) => FORM_SOZLERI.tr[t.soz];

// 3794 (A): formun basılı alanları bölüm bölüm. Göz alanı gizler (listede kalır), çöp formdan kaldırır (Kaldırılanlar'a gider, geri gelir).
// Kilitli alanın değeri sürümden gelir, yalnız gizlenir; metin alanının değeri bu teklifin formuna yazılabilir. Veri silinmez.
export function AlanPaneli({ icerik, dil, degistir, kayit }: Ozellikler) {
  const telefon = useTelefon();
  const { bildir } = useBildirim();
  // "Geri al" bildirimden sonra gelir: o anki içerik ve yazıcı kullanılır, eski kopya üstüne yazılmaz.
  const son = useRef({ icerik, degistir });
  useEffect(() => { son.current = { icerik, degistir }; });
  const kaldirilanlar = useRef<HTMLDivElement>(null);
  const yaz = (k: TeklifFormuAlanAnahtari, parca: Parameters<typeof alanDegistir>[2]) => {
    const { icerik: i, degistir: d } = son.current;
    d({ alanlar: alanDegistir(i, k, parca) });
  };
  const kaldir = (t: AlanTanimi) => {
    yaz(t.anahtar, { durum: 'kaldirildi' });
    bildir('tamam', `${ad(t)} formdan kaldırıldı.`, { eylem: { etiket: 'Geri al', yap: () => yaz(t.anahtar, { durum: null }) } });
  };
  const durum = (t: AlanTanimi) => alanAyari(icerik, t.anahtar).durum;
  const kalan = FORM_ALAN_TANIMLARI.filter((t) => durum(t) === 'kaldirildi');
  const gizliSayisi = FORM_ALAN_TANIMLARI.filter((t) => durum(t) === 'gizli').length;

  return (
    <div className="tc-tf-alanlar">
      <div className="tc-tf-arac">
        <Dugme simge="list" disabled={kalan.length === 0} onClick={() => kaldirilanlar.current?.scrollIntoView({ block: 'center' })}
          aria-label={`Alanlar: ${String(gizliSayisi)} gizli, ${String(kalan.length)} kaldırıldı${kalan.length > 0 ? '. Kaldırılanlara git' : ''}`}>
          {`${String(gizliSayisi)} gizli · ${String(kalan.length)} kaldırıldı`}
        </Dugme>
      </div>
      <p className="tc-tf-ipucu">Göz alanı gizler, alan listede kalır. Çöp alanı formdan kaldırır; Kaldırılanlar'dan geri gelir. Kilitli değer sürümden gelir, o alan yalnız gizlenir.</p>
      {kalan.length > 0 && (
        <div ref={kaldirilanlar} className="tc-tf-kaldirilanlar" role="group" aria-label="Kaldırılan alanlar">
          <span className="tc-tf-ipucu">Kaldırılanlar (dokunun: geri gelir)</span>
          <div className="tc-tf-cipler">
            {kalan.map((t) => (
              <button key={t.anahtar} type="button" className="tc-tf-cip tc-tf-geri" aria-label={`${ad(t)} alanını forma geri al`} onClick={() => yaz(t.anahtar, { durum: null })}>
                <Simge ad="plus" boyut="k" />{ad(t)}
              </button>
            ))}
          </div>
        </div>
      )}
      {FORM_ALAN_BOLUMLERI.map((bolum, sira) => {
        const tanimlar = FORM_ALAN_TANIMLARI.filter((t) => t.bolum === bolum && durum(t) !== 'kaldirildi');
        if (tanimlar.length === 0) return null;
        const gizli = tanimlar.filter((t) => durum(t) === 'gizli').length;
        return (
          <details key={bolum} className="tc-tf-alan-bolum" open={!telefon || sira === 0}>
            <summary>
              <span>{bolum}</span>
              <small>{`${String(tanimlar.length)} alan${gizli > 0 ? ` · ${String(gizli)} gizli` : ''}`}</small>
              <Simge ad="down" boyut="k" />
            </summary>
            <div className="tc-tf-alan-liste">
              {tanimlar.map((t) => <AlanSatiri key={t.anahtar} t={t} icerik={icerik} dil={dil} kayit={kayit} yaz={yaz} kaldir={kaldir} />)}
            </div>
          </details>
        );
      })}
    </div>
  );
}

interface SatirOzellikleri {
  t: AlanTanimi;
  icerik: TeklifFormuIcerigi;
  dil: TeklifFormuDili;
  kayit: Record<TeklifFormuDegerliAlan, string | null> | undefined;
  yaz: (k: TeklifFormuAlanAnahtari, parca: Parameters<typeof alanDegistir>[2]) => void;
  kaldir: (t: AlanTanimi) => void;
}

function AlanSatiri({ t, icerik, dil, kayit, yaz, kaldir }: SatirOzellikleri) {
  const ayar = alanAyari(icerik, t.anahtar);
  const gizli = ayar.durum === 'gizli';
  const kayittaki = kayit === undefined || !t.degerli ? undefined : kayit[t.anahtar as TeklifFormuDegerliAlan];
  const degerOzellikleri = {
    etiket: `${ad(t)} değeri (bu forma)`,
    maxLength: ALAN_DEGERI_EN_COK,
    value: ayar.deger ?? '',
    placeholder: kayittaki ?? '',
    ipucu: 'Boşsa kayıttaki basılır.',
  };
  return (
    <div className="tc-tf-alan-satiri" data-gizli={gizli || undefined}>
      <Dugme
        simge="eye"
        className="tc-tf-alan-dugme"
        aria-pressed={!gizli}
        aria-label={gizli ? `${ad(t)} gizli; forma bas` : `${ad(t)} alanını gizle`}
        onClick={() => yaz(t.anahtar, { durum: gizli ? null : 'gizli' })}
      />
      <div className="tc-tf-alan-govde">
        <Girdi
          etiket={`${ad(t)} etiketi`}
          autoComplete="off"
          maxLength={ALAN_ETIKETI_EN_COK}
          value={ayar.etiket ?? ''}
          placeholder={FORM_SOZLERI[dil][t.soz]}
          onChange={(o) => yaz(t.anahtar, { etiket: o.target.value })}
        />
        {gizli && <Rozet ton="pasif">Gizli: basılmaz</Rozet>}
        {t.kilitli && <span className="tc-tf-kilit" title="Değiştirmek için teklife yeni sürüm verilir."><Simge ad="lock" boyut="k" />Sürümden gelir</span>}
        {kayittaki !== undefined && (t.cokSatir
          ? <CokSatir {...degerOzellikleri} rows={2} onChange={(o) => yaz(t.anahtar, { deger: o.target.value })} />
          : <Girdi {...degerOzellikleri} autoComplete="off" onChange={(o) => yaz(t.anahtar, { deger: o.target.value })} />)}
      </div>
      {t.kilitli
        ? <span className="tc-tf-alan-dugme" aria-hidden="true" />
        : <Dugme simge="trash" className="tc-tf-alan-dugme" aria-label={`${ad(t)} alanını formdan kaldır`} onClick={() => kaldir(t)} />}
    </div>
  );
}
