// Tür kuralları: kod düzeni, kart adı ve Açıklama 1-3 kalıbı, zorunlu alanlar, çakışma alanları. Firma kodu kutusu Mamul alanlarında da çizilir.
import { useEffect, useState } from 'react';
import { Dugme, Girdi, IsaretKutusu, Tablo, type Sutun } from '../../../../../ortak/arayuz/index.ts';
import type { Duzen } from '../duzen.ts';
import {
  CAKISMA_OZEL, CAKISMA_VARSAYILAN, FIRMA_KODU_DESEN, KOD_TUR, TURLER, alanZorunlu, cakismaAlanAdi, firmaKodluTurler, turAlanlari, type Alan,
} from '../kaynak.ts';
import { asc, cakismaYaz, kalipYaz, kuralVarsayilanaDon, turKurali, zorunluYaz } from '../islemler.ts';
import { BolumBasligi, Kutu, Secici } from '../parcalar.tsx';

const turAdi = (t: string) => TURLER[t]?.ad ?? t;

export function FirmaKodu({ d, kilitli }: { d: Duzen; kilitli: boolean }) {
  const kayitli = String((d.genel as { firmaKodu?: string }).firmaKodu ?? '');
  const [deger, degerYaz] = useState(kayitli);
  useEffect(() => { degerYaz(kayitli); }, [kayitli]);
  const yaz = () => {
    const v = asc(deger).replace(/[^A-Z0-9]/g, '');
    if (v && (!FIRMA_KODU_DESEN.test(v) || Object.values(KOD_TUR).includes(v))) {
      d.bildir('hata', 'Firma kodu 2-5 harf ya da rakam olmalı ve tür kısaltması (HM, YM, MM, SF, DB, HZ) olamaz.');
      degerYaz(kayitli);
      return;
    }
    if (v === kayitli) { degerYaz(kayitli); return; }
    d.genelYaz({ firmaKodu: v }, v ? `Firma kodlu türlerin yeni kartları ${v}- koduyla açılır.` : 'Kodlar tür-grup-sıra yapısına döndü.');
  };
  const turler = firmaKodluTurler(d.b).map(turAdi).join(', ') || 'hiçbiri';
  return (
    <>
      <div className="tc-ma-dar">
        <Girdi
          etiket="Firma kodu (firma kodlu türlerde kodun başı)" maxLength={5} placeholder="ör. ABC" autoComplete="off" className="tc-ma-buyuk"
          disabled={kilitli} value={deger} onChange={(e) => degerYaz(e.target.value)} onBlur={yaz}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); yaz(); } }}
        />
      </div>
      <p className="tc-ma-yardim">
        Doluysa firma kodlu türlerin ({turler}) yeni kartları {kayitli || 'FİRMA'}-MM-00001 biçiminde kod alır (her tür kendi sırasıyla); boşsa tür-grup-sıra (MM-GRP-00001).
        Türler "Ad, açıklama ve zorunlu alanlar" bölümünde seçilir. Var olan kodlar değişmez.
      </p>
    </>
  );
}

function Kalip({ d, tur, yol, baslik, kayitli }: { d: Duzen; tur: string; yol: 'ad' | 'ac0' | 'ac1' | 'ac2'; baslik: string; kayitli: string }) {
  const [deger, degerYaz] = useState(kayitli);
  useEffect(() => { degerYaz(kayitli); }, [kayitli]);
  return (
    <Girdi
      etiket={baslik} maxLength={200} autoComplete="off" placeholder="Boş: otomatik" disabled={d.ro} value={deger}
      onChange={(e) => degerYaz(e.target.value)}
      onBlur={() => { if (deger.trim() !== kayitli) d.degis(kalipYaz(d.v, tur, yol, deger)); }}
    />
  );
}

export function TurKurallari({ d }: { d: Duzen }) {
  const t = d.secim.kuralTur;
  const K = turKurali(d.v, t);
  const alanlar = turAlanlari(t, d.b);
  const ac = K.ac ?? [];
  const fk = firmaKodluTurler(d.b).includes(t);
  const firmaKodu = String((d.genel as { firmaKodu?: string }).firmaKodu ?? '');
  const ornekKod = firmaKodu && fk ? `${firmaKodu}-${KOD_TUR[t]}-00001` : `${KOD_TUR[t]}-GRP-00001`;
  const cs = new Set(Array.isArray(K.cakisma) ? K.cakisma : []);
  const csSecenek = [...Object.keys(CAKISMA_OZEL), ...alanlar.map((a) => a.k)];
  const jetonlar = [['OTO', 'bu yerin otomatik değeri'], ['AD', 'kartın adı'], ...alanlar.map((a) => [a.k, a.ad])] as const;

  const firmaTuru = (secili: boolean) => {
    const once = firmaKodluTurler(d.b);
    const l = once.filter((x) => x !== t);
    if (secili) l.push(t);
    d.genelYaz({ firmaKoduTurleri: l });
  };

  const zorunluSutunlari: Sutun<Alan>[] = [
    {
      anahtar: 'zorunlu', baslik: 'Zorunlu', hucre: (a) => (
        <input
          type="checkbox" aria-label={`${a.ad} zorunlu`} checked={alanZorunlu(t, a, d.b)} disabled={d.ro || (a.k === 'ad' && a.gerekli)}
          onChange={(e) => d.degis(zorunluYaz(d.v, t, a, e.target.checked))}
        />
      ),
    },
    { anahtar: 'alan', baslik: 'Alan', hucre: (a) => a.ad },
    { anahtar: 'varsayilan', baslik: 'Varsayılan', hucre: (a) => (a.gerekli ? 'zorunlu' : 'isteğe bağlı') },
  ];

  return (
    <>
      <BolumBasligi
        baslik="Ad, açıklama ve zorunlu alanlar"
        aciklama="Her tür için kod düzeni, kart adı ve Açıklama 1, 2, 3 kalıbı, zorunlu alanlar ve çakışma kontrolü. Boş kalıp bugünkü otomatik değeri verir; elle değiştirilmiş ad ve açıklama satırı kalıptan etkilenmez."
        eylem={!d.ro && <Dugme simge="rotate" onClick={() => d.degis(kuralVarsayilanaDon(d.v, t))}>Bu türü varsayılana döndür</Dugme>}
      />
      <Secici<string>
        satirlar={[{ anahtar: 'tur', baslik: 'Tür', secili: t, sec: (k) => d.sec({ kuralTur: k }), secenekler: Object.keys(KOD_TUR).map((k) => ({ deger: k, baslik: turAdi(k) })) }]}
        ozet={<>Seçili tür: <b>{turAdi(t)}</b></>}
      />
      <Kutu baslik="Kod düzeni">
        <IsaretKutusu etiket="Şirket kodu + tür + numara" checked={fk} disabled={d.ro} onChange={(e) => firmaTuru(e.target.checked)} />
        <p className="tc-ma-yardim">
          Yeni kartın kodu: <b>{ornekKod}</b>. {firmaKodu ? '' : 'Firma kodu boş; doldurulunca seçili türler bu düzene geçer. '}Numara her tür için ayrı sıradır; var olan kodlar değişmez.
        </p>
        <FirmaKodu d={d} kilitli={d.ro} />
      </Kutu>
      <Kutu baslik="Kart adı ve açıklamalar">
        <div className="tc-ma-alanlar tc-ma-alanlar-genis">
          <Kalip key={`${t}-ad`} d={d} tur={t} yol="ad" baslik="Kart adı" kayitli={K.ad ?? ''} />
          {([0, 1, 2] as const).map((i) => <Kalip key={`${t}-ac${i}`} d={d} tur={t} yol={`ac${i}`} baslik={`Açıklama ${i + 1}`} kayitli={ac[i] ?? ''} />)}
        </div>
        <p className="tc-ma-yardim">Kullanılabilir yer tutucular:</p>
        <p className="tc-ma-jetonlar">{jetonlar.map(([k, ad]) => <span key={k}><code>{`{${k}}`}</code> {ad}</span>)}</p>
        <p className="tc-ma-yardim">
          Örnek: <code>{'{OTO}; {musteri}'}</code> otomatik değerin sonuna müşteri kodunu ekler.
          {(t === 'mamul' || t === 'yarimamul') && ' Bu türde otomatik Açıklama 3 müşteri kodunu zaten başta taşır.'}
        </p>
      </Kutu>
      <Kutu baslik="Zorunlu alanlar">
        {alanlar.length ? (
          <>
            <Tablo etiket={`${turAdi(t)} zorunlu alanları`} sutunlar={zorunluSutunlari} satirlar={alanlar} satirAnahtari={(a) => a.k} />
            <p className="tc-ma-yardim">Zorunlu alan boşken kartın o adımı tamamlanmaz; Excel şablonunda da zorunlu görünür. Ad alanı her zaman zorunludur.</p>
          </>
        ) : (
          <p className="tc-ma-yardim">Bu türün alanları {t === 'hammadde' ? 'aile, form ve ölçü adımlarından gelir' : 'kategoriye göre değişir'}; zorunlulukları türün kendi ayarlarındadır.</p>
        )}
      </Kutu>
      <Kutu baslik="Çakışma kontrolü">
        <p className="tc-ma-yardim">
          Yeni kartta seçilen alanların hepsi başka bir kartla aynıysa kart "aynı" sayılır ve kaydetmek için gerekçe istenir; harf, boşluk ve noktalama farkı yok sayılır.
          Eski / ERP kodu her zaman denetlenir. Hiçbiri seçili değilse varsayılan kural: {CAKISMA_VARSAYILAN[t] ?? ''}. Seçim hem ekran uyarısını hem sunucunun mükerrer engelini belirler;
          kaydedince bu türün kartları yeni kurala göre yeniden denetlenir ve birbirine çakışan etkin kart varsa ayar kaydedilmez.
        </p>
        <div className="tc-ma-isaretler">
          {csSecenek.map((k) => (
            <IsaretKutusu key={k} etiket={cakismaAlanAdi(t, k, d.b)} checked={cs.has(k)} disabled={d.ro} onChange={(e) => d.degis(cakismaYaz(d.v, t, k, e.target.checked))} />
          ))}
        </div>
      </Kutu>
    </>
  );
}
