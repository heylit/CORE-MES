import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ElleYazilanStatu } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { CokSatir, Dugme, Rozet, Secim, Simge } from '../../ortak/arayuz/index.ts';
import { tarihMetni, zamanMetni } from '../../ortak/veri/zaman-metni.ts';
import { ELLE_YAZILIR, STATU, STATU_KAYNAGI } from './adim-durumu.ts';
import { useAdimKomutu } from './adim-komutu.ts';
import { GEREKCE_EN_AZ, hedefMesaji } from './adim-tablosu.ts';
import {
  emirKapali, gerekceYeterli, gorunenStatu, hazirlikOzeti, hazirlikOzetMetni, maddeDugmeleri, maddeGeriAlKomutu, maddeIslemi, statuKisaAdi,
  type Kalem, type MatrisMaddesi,
} from './adim-matrisi.ts';
import { HazirlikCubugu } from './HazirlikCubugu.tsx';
import { MADDE, halGorunumu } from './hazirlik-bilgisi.ts';
import { OpOzelBolumu } from './OpOzelBolumu.tsx';

// 3738: hücre paneli. Seçili adımın statüsü (elle yaz, otomatiğe dön) ve hazırlık maddeleri tek yerde; maddeler tek tek onaylanır, elle eksik
// işaretlenir, elle değer geri alınır. Komutlar Adım Durumu'ndakilerle aynıdır (adim-tablosu.ts) ve aynı uçlara gider; yazma yetkisi aynıdır.
interface Ozellikler {
  kalem: Kalem;
  yazabilir: boolean;
  // Dar ekranda panel alttaki yapışan şeridin içinde katlanır.
  katli: boolean;
  // Hücreden statü yazımı: çalışan adımda uyarı ve onay planı matrisin kendisindedir.
  statuYaz: (k: Kalem, hedef: ElleYazilanStatu | null) => void;
  mesgul: boolean;
  kapat: () => void;
  yenile: () => Promise<void>;
}

const maddeGorunumu = (m: MatrisMaddesi) => {
  if (m.elle === null) return halGorunumu(m.madde, m.hal);
  if (m.elle.tur === 'hazir') return { ton: 'tamam' as const, simge: 'check' as const, ad: 'Hazır', aciklama: '' };
  return { ton: MADDE[m.madde].uyarir ? 'uyari' as const : 'hata' as const, simge: 'x' as const, ad: 'Hazır değil', aciklama: '' };
};
const altSatir = (m: MatrisMaddesi): string => {
  if (m.elle !== null) {
    return `Elle ${m.elle.tur === 'hazir' ? 'hazır' : 'hazır değil'}: ${m.elle.kisiAdi ?? 'Kişi'} · ${zamanMetni(m.elle.zaman)}${m.elle.gerekce === null ? '' : ` · ${m.elle.gerekce}`}`;
  }
  if (m.hal === 'gerekmez') return 'Bu OP\'de gerekmiyor';
  if (m.hal === 'tamam') return 'Sistem doğruladı';
  if (m.hal === 'eksik') return 'Sistem: eksik';
  if (m.hal === 'muaf') return 'Müdür muaf tuttu';
  return 'Sistem bu maddeyi denetlemiyor';
};

export function HucrePaneli({ kalem, yazabilir, katli, statuYaz, mesgul, kapat, yenile }: Ozellikler) {
  const { emir, adim } = kalem;
  const g = gorunenStatu(adim);
  const kapali = emirKapali(emir);
  const duzenler = yazabilir && !kapali;
  const baslik = `${emir.emirNo} · OP ${String(adim.opNo)} ${adim.ad}`;
  const komut = useAdimKomutu(emir.emirId, adim.isEmriId, () => undefined);
  // Gerekçe isteyen madde: durduran maddenin elle onayı ya da elle eksiği (2893-2 b).
  const [gerekceli, gerekceliYaz] = useState<{ madde: MatrisMaddesi['madde']; hedef: 'hazir' | 'eksik' } | null>(null);
  const [gerekce, gerekceYaz] = useState('');
  const sonra = () => { void yenile(); };
  const kapatGerekce = () => { gerekceliYaz(null); gerekceYaz(''); };

  const maddeYaz = (m: MatrisMaddesi, hedef: 'hazir' | 'eksik') => {
    const { komut: k, gerekceIster } = maddeIslemi(adim, m, hedef);
    if (gerekceIster) { gerekceliYaz({ madde: m.madde, hedef }); gerekceYaz(''); return; }
    // Geri al yeniden yazım değil, önceki elle değeri döndürür (bildirimdeki "Geri al").
    const geri = maddeGeriAlKomutu(adim, m).geri;
    komut.yap({ ...k, mesaj: k.yol === 'hazirlik-onay-kaldir' ? `${MADDE[m.madde].ad}: otomatiğe döndü` : hedefMesaji(m, hedef), geri: { ...geri, sonra }, sonra });
  };
  const gerekceKaydet = (m: MatrisMaddesi, hedef: 'hazir' | 'eksik') => {
    const { komut: k } = maddeIslemi(adim, m, hedef);
    const geri = maddeGeriAlKomutu(adim, m).geri;
    komut.yap({ ...k, govde: { ...k.govde, gerekce: gerekce.trim() }, mesaj: hedefMesaji(m, hedef), geri: { ...geri, sonra }, sonra: () => { kapatGerekce(); sonra(); } });
  };
  const elleGeriAl = (m: MatrisMaddesi) => {
    const { ileri, geri } = maddeGeriAlKomutu(adim, m);
    komut.yap({ ...ileri, mesaj: `${MADDE[m.madde].ad}: otomatiğe döndü`, geri: { ...geri, sonra }, sonra });
  };

  const maddeSatiri = (m: MatrisMaddesi) => {
    const tanim = MADDE[m.madde];
    const gv = maddeGorunumu(m);
    const d = maddeDugmeleri(m);
    const durduran = !tanim.uyarir;
    const kilit = !duzenler || komut.mesgul;
    const acik = gerekceli?.madde === m.madde ? gerekceli : null;
    return (
      <li key={m.madde} className="tc-am-madde" data-ton={gv.ton}>
        <span className="tc-am-madde-ad">
          <span className={`tc-am-madde-simge tc-am-ton-${gv.ton}`}><Simge ad={gv.simge} boyut="k" /></span>
          <span>
            <b>{tanim.ad}</b>
            {durduran && <span className="tc-am-durduran" title="Eksikse iş emri başlamaz"><Simge ad="lock" boyut="k" />durduran</span>}
            <small>{altSatir(m)}</small>
          </span>
        </span>
        <span className="tc-am-madde-eylem">
          <Dugme simge="check" disabled={kilit || !d.onayla} aria-label={`${tanim.ad}: onayla`} title="Onayla" onClick={() => { maddeYaz(m, 'hazir'); }} />
          <Dugme simge="x" disabled={kilit || !d.eksik} aria-label={`${tanim.ad}: eksik işaretle`} title="Eksik" onClick={() => { maddeYaz(m, 'eksik'); }} />
          <Dugme simge="rotate" disabled={kilit || !d.geriAl} aria-label={`${tanim.ad}: elle değeri geri al`} title="Geri al" onClick={() => { elleGeriAl(m); }} />
        </span>
        {acik !== null && (
          <div className="tc-am-gerekce" role="group" aria-label={`${tanim.ad}: gerekçe`}>
            <CokSatir etiket="Gerekçe" rows={2} autoFocus value={gerekce} placeholder={`Zorunlu, en az ${String(GEREKCE_EN_AZ)} karakter`}
              ipucu={`${acik.hedef === 'hazir' ? 'Elle hazır için' : 'Elle eksik için'} gerekçe yazın; bu madde eksikken iş emri başlamaz.`}
              onChange={(o) => { gerekceYaz(o.target.value); }} />
            <span className="tc-am-gerekce-dugmeler">
              <Dugme tur="birincil" simge="check" disabled={komut.mesgul || !gerekceYeterli(gerekce)} onClick={() => { gerekceKaydet(m, acik.hedef); }}>Kaydet</Dugme>
              <Dugme onClick={kapatGerekce}>Vazgeç</Dugme>
            </span>
          </div>
        )}
      </li>
    );
  };

  const ozet = hazirlikOzeti(adim);
  const icerik = (
    <>
      <p className="tc-emir-not">{emir.urun.ad}{emir.teslim === null ? '' : ` · termin ${tarihMetni(emir.teslim)}`}</p>
      <div className="tc-am-panel-durum">
        <Rozet ton={STATU[g].ton}><Simge ad={STATU[g].simge} boyut="k" />{katli ? statuKisaAdi(g, STATU[g].ad) : STATU[g].ad}</Rozet>
        <Rozet ton="pasif">{adim.elle === null ? 'otomatik' : 'elle yazıldı'}</Rozet>
        <span className="tc-am-panel-hz" aria-label={hazirlikOzetMetni(ozet)}><HazirlikCubugu adim={adim} /></span>
      </div>
      {duzenler && (
        <div className="tc-am-panel-statu">
          <Secim etiket="Statü değiştir" bosSecenek="Otomatik (sistem)" value={adim.elle?.statu ?? ''} disabled={mesgul}
            onChange={(o) => {
              const v = o.target.value as ElleYazilanStatu | '';
              if (v === '') { if (adim.elle !== null) statuYaz(kalem, null); } else statuYaz(kalem, v);
            }}
            secenekler={ELLE_YAZILIR.map((x) => ({ deger: x, baslik: STATU[x].ad }))} />
          <Dugme simge="rotate" disabled={mesgul || adim.elle === null} onClick={() => { statuYaz(kalem, null); }}>Otomatiğe dön</Dugme>
        </div>
      )}
      <dl className="tc-am-ayrinti">
        <dt>Sistem</dt><dd>{STATU[adim.sistemStatusu].ad}<small>{STATU_KAYNAGI[adim.sistemStatusu]}</small></dd>
        <dt>İlerleme</dt><dd>{adim.yapilan} / {adim.hedef}</dd>
        <dt>Elle</dt>
        <dd>{adim.elle === null ? 'Yok (otomatik)' : <>{STATU[adim.elle.statu].ad}<small>{adim.elle.kisiAdi ?? 'Kişi'} · {zamanMetni(adim.elle.zaman)}{adim.elle.not === null || adim.elle.not === '' ? '' : ` · ${adim.elle.not}`}</small></>}</dd>
      </dl>
      {kapali && <p className="tc-emir-not">Emir bitti; elle statü ve hazırlık yazılmaz.</p>}
      {!yazabilir && <p className="tc-emir-not"><Simge ad="lock" boyut="k" /> Yazma yetkiniz yok.</p>}
      <section className="tc-am-bolum" aria-label="Hazırlık maddeleri">
        <h4>Hazırlık maddeleri</h4>
        {adim.maddeler.length === 0 ? <p className="tc-emir-not">Bu adımın hazırlık maddesi yok.</p> : <ul className="tc-am-maddeler">{adim.maddeler.map(maddeSatiri)}</ul>}
      </section>
      <OpOzelBolumu emirId={emir.emirId} isEmriId={adim.isEmriId} duzenler={duzenler} maddeler={adim.maddeler} yenile={yenile} />
      <Link className="tc-dugme tc-dugme-ikincil tc-dugme-normal" to={`/adim-durumu?emir=${String(emir.emirId)}`}>Emri aç</Link>
    </>
  );
  if (katli) {
    return (
      <aside className="tc-am-panel tc-am-panel-katli" aria-label="Adım ayrıntısı">
        <details open>
          <summary tabIndex={-1} data-ilk-odak>{baslik}</summary>
          {icerik}
        </details>
        <Dugme simge="x" aria-label="Ayrıntıyı kapat" onClick={kapat} />
      </aside>
    );
  }
  return (
    <aside className="tc-am-panel" aria-label="Adım ayrıntısı">
      <div className="tc-am-panel-ust">
        <h3 tabIndex={-1} data-ilk-odak>{baslik}</h3>
        <Dugme simge="x" aria-label="Ayrıntıyı kapat" onClick={kapat} />
      </div>
      {icerik}
    </aside>
  );
}
