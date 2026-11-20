import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { HizliAcGovdesi, KabulSiniri, MalzemeSecenekleriCevabi, OnTalep, Talebim, TalebimGuncellemeYazimi, TalebimiDuzenleYazimi, TalepTuru } from '#paylasilan/sozlesme/satin-alma.ts';
import { CokSatir, Dugme, Girdi, Kart, Rozet, useAcilirKonum, useBildirim } from '../../../ortak/arayuz/index.ts';
import { ApiHatasi } from '../../../ortak/veri/api.ts';
import { BELIRSIZ_MIKTAR, belirsizMiktarVar, miktarGirdisi } from '../../../ortak/veri/miktar.ts';
import { tekrarKorumaliGonder, yeniIstekKimligi } from '../../../ortak/veri/istek-kimligi.ts';
import { CizimSecici, TalepCizimleri, cizimBagla, type SecilenCizim } from './Cizimler.tsx';
import { KabulSinirlari, kapaliZarfNotu, useKabulZarfi } from './KabulSinirlari.tsx';
import { KART_SAYFASI, SURE, adettenKg, anahtarlar, cagri, kartKarsiligi, karsilikYaz, parcaKg } from './ortak.ts';
import './talep.css';

type KartSecenegi = MalzemeSecenekleriCevabi['malzemeler'][number];

// Kalem ya kartlıdır (malzeme kartından seçilir) ya da adıyla yazılır ve "kart bekler"; kart bağlanmadan sipariş verilmez.
// 898 a: hizmet kalemi uygulanacak parçayı taşır; ön talepten gelen kalem fason iş emrini ve kaynağının adını taşır.
interface Uygulanan { no: number; kod: string; ad: string }
interface KalemTaslagi {
  anahtar: string; kart: KartSecenegi | null; serbest: boolean; ad: string; birim: string; miktar: string; aciklama: string;
  uygulanan: Uygulanan | null; isEmriId: number | null; kaynak: string | null;
  // 3429-3 F3: satış siparişi ön talebinden gelen kalemin sipariş kalemi; kart siparişteki karttır.
  satisSatiriId: number | null;
  // 2871-1 a: düzenlenen talepte var olan kalem; kartı, adı ve birimi değişmez. Bağlı (fason, parça) kalemin miktarı da değişmez.
  mevcut: { id: string; bagli: boolean } | null;
  // 3100: adet alanına yazılan (yalnız giriş yardımcısı, gönderilmez); kg değişince silinir. parcaKg: düzenlenen kalemde sunucunun karşılığından.
  adet: string; parcaKg: number | null;
  // 3437-2: kabul sınırı (null: kartın zarfının tamamı). zarfNo: sınırın okunduğu kart; düzenlenen kalemde kartı hammadde olan kalemin kartı.
  kabul: KabulSiniri | null; zarfNo: number | null; kabulHatali: boolean;
  // 3462 a: kalemin termini ve üretim emri ('' boş; yeni kalem formun varsayılanını alır). emirNo: düzenlenen kalemin emri listede yoksa.
  // foy: düzenlenen kalemin kart föyü (yeni kalemde kartın ayrıntısı okunur).
  termin: string; emirId: string; emirNo: string | null; foy: readonly { ad: string; deger: string }[];
}
const TUR_ADI: Record<TalepTuru, string> = { malzeme: 'Malzeme', hizmet: 'Hizmet', fason: 'Fason' };
const bosKalem = (v: { termin: string; emirId: string } = { termin: '', emirId: '' }): KalemTaslagi => ({
  anahtar: yeniIstekKimligi(), kart: null, serbest: false, ad: '', birim: '', miktar: '', aciklama: '', uygulanan: null, isEmriId: null, kaynak: null, satisSatiriId: null, mevcut: null, adet: '', parcaKg: null, kabul: null, zarfNo: null, kabulHatali: false,
  termin: v.termin, emirId: v.emirId, emirNo: null, foy: [],
});
const mevcutKalem = (x: Talebim['kalemler'][number]): KalemTaslagi => ({
  ...bosKalem(), ad: x.ad, birim: x.birim, miktar: (x.miktar ?? '').replace('.', ','), aciklama: x.aciklama ?? '',
  mevcut: { id: x.id!, bagli: x.uygulanan !== null || x.fasonAdim !== null },
  termin: x.ihtiyacTarihi?.slice(0, 10) ?? '', emirId: x.uretimEmriId == null ? '' : String(x.uretimEmriId), emirNo: x.uretimEmriNo ?? null, foy: x.malzeme?.ayrinti ?? [],
  kabul: x.kabul ?? null, zarfNo: x.malzemeNo !== undefined && x.malzeme?.kalite != null ? x.malzemeNo : null,
  parcaKg: x.karsilik?.birim === 'adet' && x.miktar !== null && Number(x.karsilik.miktar) > 0 ? Number(x.miktar) / Number(x.karsilik.miktar) : null,
});
// Ön talepten kalem: fason adımın adı kalem adıdır (hizmet kartı seçilene kadar kart bekler), miktar emrin adedi. Plan ihtiyacında kalem
// malzeme kartıdır, miktar kalan eksik. Satış siparişi kaleminde kart ve miktar sipariş kaleminindir.
const ontalepKalemi = (o: OnTalep): KalemTaslagi => (o.kaynak === 'siparis'
  ? {
    ...bosKalem(), kart: { no: o.malzeme.no, kod: o.malzeme.kod, ad: o.malzeme.ad, birim: o.birim, kategori: null, katalogId: null },
    miktar: o.miktar.replace('.', ','), kaynak: `${o.siparisNo}${o.musteriAdi ? ` · ${o.musteriAdi}` : ''}`, satisSatiriId: o.siparisSatiriId, termin: o.gerekenTarih ?? '',
  }
  : o.kaynak === 'plan'
  ? {
    ...bosKalem(), kart: { no: o.malzeme.no, kod: o.malzeme.kod, ad: o.malzeme.ad, birim: o.birim, kategori: null, katalogId: null },
    miktar: String(o.miktar).replace('.', ','), kaynak: `${o.emirler.slice(0, 3).join(', ')}${o.emirler.length > 3 ? ` +${o.emirler.length - 3}` : ''}`, termin: o.gerekenTarih ?? '',
  }
  : {
    ...bosKalem(), serbest: true, ad: o.adim ?? `Op ${o.opNo}`, birim: o.birim, miktar: String(o.miktar), uygulanan: o.parca, isEmriId: o.isEmriId,
    kaynak: `${o.emirNo} · Op ${o.opNo}`, termin: o.gerekenTarih ?? '', emirId: String(o.uretimEmriId), emirNo: o.emirNo,
  });

// 3437-2: sınır yalnız kartlı malzeme kaleminde gider; düzenlemede sınırı gösterilen kalem her zaman gönderir (null: sınır kaldırıldı).
const kabulAlani = (tur: TalepTuru, k: KalemTaslagi): { kabul?: KabulSiniri | null } =>
  (tur !== 'malzeme' ? {} : k.mevcut !== null ? (k.zarfNo === null ? {} : { kabul: k.kabul }) : k.kart === null || k.kabul === null ? {} : { kabul: k.kabul });

// Denetim #37: miktar ortak ayrıştırıcıdan okunur ("12.5" = "12,5", virgül varsa nokta binliktir). Virgülsüz "1.250" belirsizdir,
// okunamayan miktar gibi gönderilmez (Y2: noktayı binlik sayıp silmek "12.5"i 125 yapıyordu).
const miktarOku = (m: string): string | null => {
  const v = miktarGirdisi(m);
  return /^\d+(\.\d+)?$/.test(v) ? v : null;
};

// #1192: açılır, aranabilir liste. Odaklanınca türün ilk kartları açılır; yazdıkça kod, ad ya da kart no'suyla daralır.
// 3462 a: `tabloda` verilirse kalem tablosunun hücresinde etiketsiz girdi olur (etiket ekran okuyucuya); liste tablonun kaydırmasında
// kesilmesin diye gövdeye taşınır (useAcilirKonum).
function KartArama({ tur, sec, serbesteGec, etiket, ipucu, tabloda }: {
  tur: TalepTuru; sec: (k: KartSecenegi) => void; serbesteGec?: () => void; etiket?: string; ipucu?: string; tabloda?: string;
}) {
  const [metin, metinYaz] = useState('');
  const [ara, araYaz] = useState('');
  const [acik, acikYaz] = useState(false);
  const [etkin, etkinYaz] = useState(0);
  const kap = useRef<HTMLDivElement>(null);
  const liste = `${useId()}-liste`;
  const { capa, katman } = useAcilirKonum<HTMLDivElement, HTMLDivElement>(acik && tabloda !== undefined);
  useEffect(() => {
    const z = setTimeout(() => araYaz(metin.trim()), 250);
    return () => clearTimeout(z);
  }, [metin]);
  const sonuc = useQuery({
    queryKey: anahtarlar.kartlar(tur, ara),
    queryFn: () => cagri.get('/satin-alma-malzeme-secenekleri', { sorgu: { ara, tur }, ...SURE }),
    enabled: acik,
  });
  const kartlar = sonuc.data?.malzemeler ?? [];
  const sira = Math.min(etkin, Math.max(0, kartlar.length - 1));
  const kapat = () => { acikYaz(false); etkinYaz(0); };
  const tusla = (o: KeyboardEvent<HTMLInputElement>) => {
    if (o.key === 'Escape') { if (acik) { o.preventDefault(); kapat(); } return; }
    if (o.key === 'ArrowDown' || o.key === 'ArrowUp') {
      o.preventDefault();
      if (!acik) { acikYaz(true); return; }
      const son = kartlar.length - 1;
      if (son >= 0) etkinYaz(o.key === 'ArrowDown' ? (sira >= son ? 0 : sira + 1) : (sira <= 0 ? son : sira - 1));
    } else if (o.key === 'Enter' && acik && kartlar[sira]) {
      o.preventDefault();
      sec(kartlar[sira]);
    }
  };
  const ad = etiket ?? TUR_ADI[tur];
  const girdiOzellikleri = {
    type: 'search', placeholder: `${ad} kodu, adı ya da kart no; listeden seçin`, value: metin, autoComplete: 'off',
    role: 'combobox', 'aria-expanded': acik, 'aria-controls': liste, 'aria-autocomplete': 'list' as const,
    'aria-activedescendant': acik && kartlar.length > 0 ? `${liste}-${sira}` : undefined,
    onChange: (e: { target: { value: string } }) => { metinYaz(e.target.value); etkinYaz(0); acikYaz(true); },
    onFocus: () => acikYaz(true), onClick: () => acikYaz(true), onKeyDown: tusla,
  };
  const listeKutusu = (
    <div id={liste} ref={tabloda !== undefined ? katman : undefined} className={`sa-talep-sonuc${tabloda !== undefined ? ' tc-acilir-katman' : ''}`} role="listbox"
      aria-label={`Bulunan ${ad.toLocaleLowerCase('tr')} kartları`} hidden={!acik}>
      {acik && (sonuc.isPending ? <p className="sa-talep-not">Aranıyor</p>
        : sonuc.isError ? <p className="sa-talep-not">Kartlar okunamadı.</p>
          : kartlar.length === 0 ? <p className="sa-talep-not">{ara === '' ? `Seçilebilir ${ad.toLocaleLowerCase('tr')} kartı yok.` : 'Bu aramayla kart yok.'}</p>
            : kartlar.map((k, i) => (
              // Tıklama odağı girdiden almadan seçer; liste kapanmadan kalem dolar.
              <div key={k.no} id={`${liste}-${i}`} role="option" aria-selected={i === sira} className="sa-talep-secenek"
                onMouseDown={(o) => o.preventDefault()} onMouseEnter={() => etkinYaz(i)} onClick={() => sec(k)}>
                <span className="sa-talep-no">{k.kod}</span>
                <span className="sa-talep-secenek-ad">{k.ad}</span>
                <span className="sa-talep-not">{[k.kategori, k.birim].filter(Boolean).join(' · ')}</span>
              </div>
            )))}
    </div>
  );
  if (tabloda !== undefined) {
    return (
      <div className="sa-talep-ara" ref={kap} onBlur={(o) => { if (!kap.current?.contains(o.relatedTarget as Node | null)) kapat(); }}>
        <div className="sa-talep-acilir" ref={capa}>
          <input className="tc-alan-kutu" aria-label={ad} data-satir={tabloda} {...girdiOzellikleri} />
        </div>
        {acik && createPortal(listeKutusu, document.body)}
        {serbesteGec && <span className="sa-talep-not">Listede yok mu? <button type="button" className="sa-talep-bag" onClick={serbesteGec}>Adıyla yazın</button></span>}
      </div>
    );
  }
  return (
    <div className="sa-talep-ara" ref={kap} onBlur={(o) => { if (!kap.current?.contains(o.relatedTarget as Node | null)) kapat(); }}>
      <div className="sa-talep-acilir">
        <Girdi etiket={ad} {...girdiOzellikleri} />
        {listeKutusu}
      </div>
      {serbesteGec ? (
        <p className="sa-talep-not">
          Listede yok mu? <button type="button" className="sa-talep-bag" onClick={serbesteGec}>Adıyla yazın</button>; talep ilerler, kalem kart bekler.
          Yeni kart <a href={KART_SAYFASI.yol} target="_blank" rel="noopener">{KART_SAYFASI.baslik}</a> sayfasında istenir; yeni sekmede açılır, bu form açık kalır.
        </p>
      ) : ipucu && <p className="sa-talep-not">{ipucu}</p>}
    </div>
  );
}

// 3100: kg ile alınan çubuk, levha, boruda adet giriş yardımcısıdır: adet yazılınca kg dolar, kg yazılınca yaklaşık adet görünür. Kayıt yine kg.
function AdetAlani({ k, degistir }: { k: KalemTaslagi; degistir: (d: Partial<KalemTaslagi>) => void }) {
  const kg = k.kart !== null ? parcaKg(k.kart) : k.parcaKg;
  if (kg === null) {
    const agirliksiz = k.kart !== null && k.kart.hammadde === true && (k.kart.birim ?? '').trim().toLocaleLowerCase('tr-TR') === 'kg';
    return agirliksiz ? <p className="sa-talep-not">Kartta parça ağırlığı yok; adet karşılığı hesaplanamaz.</p> : null;
  }
  const miktar = miktarOku(k.miktar);
  const yaklasik = miktar === null || !(Number(miktar) > 0) || k.adet !== '' ? null : karsilikYaz({ miktar: String(Number(miktar) / kg), birim: 'adet' });
  // Parça bölünmez: kesirli adet kg'ı değiştirmez, uyarılır (virgül sessizce atılırsa 2,5 adet 25 olur).
  const kesirli = k.adet !== '' && !/^\d+$/.test(k.adet.trim());
  return (
    <div className="sa-talep-adet">
      <Girdi etiket="Adet" inputMode="numeric" value={k.adet} hata={kesirli ? 'Adet tam sayı olur; kesirli miktarı kg olarak yazın.' : undefined} placeholder={yaklasik ?? 'Kaç parça'} disabled={k.mevcut?.bagli === true}
        onChange={(e) => {
          const adet = e.target.value;
          // Geçersiz adette kg boşalır: önceki tuşun hesapladığı kg kalıp sessizce gönderilmesin (Miktar zorunlu, form durur).
          degistir(/^\d+$/.test(adet.trim()) ? { adet, miktar: adettenKg(Number(adet.trim()), kg) } : adet.trim() === '' ? { adet } : { adet, miktar: '' });
        }} />
      {!kesirli && <p className="sa-talep-not">1 parça ≈ {kg.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} kg</p>}
    </div>
  );
}

// 3462 a: kartın föyündeki her alan ayrı sütun (kullanıcı 20.11). Sıra föyün sırasıdır; hiçbir kalemde dolu olmayan alan sütun olmaz.
// Çok değerli alan (standart, sertifika, durum...) virgülle birleşik metin değil, her değer ayrı etiket.
const FOY_SIRASI = ['Kalite', 'Form', 'Ölçü', 'Standart', 'Tolerans', 'Durum', 'İşlem', 'Yüzey', 'İstenen sertifikalar', 'Üretici ürün kodu', 'Menşei', 'GTİP', 'Açıklama'];
const FOY_BASLIGI: Record<string, string> = { Açıklama: 'Kart açıklaması', 'İstenen sertifikalar': 'Sertifikalar' };
const COK_DEGERLI = new Set(['Standart', 'Durum', 'İşlem', 'İstenen sertifikalar', 'Açıklama']);
const foyu = (k: KalemTaslagi): readonly { ad: string; deger: string }[] => k.kart?.ayrinti ?? k.foy;
export function foySutunlari(kalemler: readonly KalemTaslagi[]): string[] {
  const dolu = new Set(kalemler.flatMap((k) => foyu(k).map((x) => x.ad)));
  return [...FOY_SIRASI.filter((a) => dolu.has(a)), ...[...dolu].filter((a) => !FOY_SIRASI.includes(a))];
}
function FoyHucresi({ ad, deger }: { ad: string; deger: string | undefined }) {
  if (deger === undefined) return <span className="sa-talep-not">–</span>;
  const parcalar = COK_DEGERLI.has(ad) ? deger.split(', ').filter(Boolean) : [deger];
  return parcalar.length > 1 || COK_DEGERLI.has(ad)
    ? <span className="sa-talep-etiketler">{parcalar.map((p) => <Rozet key={p} gorunum="cizgi">{p}</Rozet>)}</span>
    : <>{deger}</>;
}

// 3437-2: kalemin kabul sınırı tek satırda (Alternatif sütunu); sınırsız kalemde kartın zarfının tamamı geçerlidir.
export const kabulOzeti = (k: KabulSiniri | null): string => (k === null ? 'Kartın alternatif sınırı' : k.yalnizAyni ? 'Yalnız aynı malzeme' : [
  k.kaliteler === null ? null : k.kaliteler.length === 0 ? 'Kalite yalnız istenen' : `Kalite muadili: ${k.kaliteler.join(', ')}`,
  k.durumlar === null ? null : k.durumlar.length === 0 ? 'Durum yalnız istenen' : `Durum muadili: ${k.durumlar.join(', ')}`,
  k.payMm === null ? null : `Ölçü en çok +${k.payMm.toLocaleString('tr-TR')} mm`,
  k.sartliKabul ? 'Şartlı muadil kabul' : null,
].filter(Boolean).join(' · ') || 'Kartın alternatif sınırı');

const zarfKarti = (tur: TalepTuru, k: KalemTaslagi): number | null =>
  (tur !== 'malzeme' ? null : k.mevcut !== null ? k.zarfNo : k.kart?.hammadde === true ? k.kart.no : null);

function AlternatifOzeti({ no, sira, kabul, ac }: { no: number; sira: number; kabul: KabulSiniri | null; ac: () => void }) {
  const z = useKabulZarfi(no).data?.zarf;
  if (z?.kapali) return <span className="sa-talep-not">{kapaliZarfNotu(z.gerekce)}</span>;
  return <span className="sa-talep-alternatif-ozet">{kabulOzeti(kabul)} <Dugme simge="edit" onClick={ac} aria-label={`Kalem ${String(sira)}: alternatif sınırını değiştir`}>Değiştir</Dugme></span>;
}

// 3462 a: her kalem tek satır; ayrıntı (ön talep kaynağı, uygulanacak parça, kabul sınırı, adet yardımcısı) satırın altında açılır.
function KalemSatiri({ tur, sira, k, foySutunlari: sutunlar, emirSecenekleri, emirDegisir, degistir, kaldir }: {
  tur: TalepTuru; sira: number; k: KalemTaslagi; foySutunlari: readonly string[]; emirSecenekleri: readonly { deger: string; baslik: string }[];
  emirDegisir: boolean; degistir: (d: Partial<KalemTaslagi>) => void; kaldir: (() => void) | null;
}) {
  // Ön talepten gelen kalemde kaynak ve bağ açık gelir (talep eden neyi çevirdiğini görsün).
  const [acik, acikYaz] = useState(k.kaynak !== null);
  const zarf = zarfKarti(tur, k);
  const ayrintiVar = k.kaynak !== null || (tur === 'hizmet' && k.mevcut === null) || zarf !== null;
  const birim = k.kart?.birim ?? (k.mevcut ? k.birim : null);
  const foy = new Map(foyu(k).map((x) => [x.ad, x.deger]));
  const ad = k.mevcut?.id ?? k.anahtar;
  const sutunSayisi = 9 + sutunlar.length + (tur === 'malzeme' ? 1 : 0);
  return (
    <>
      <tr data-kalem={sira} aria-invalid={k.kabulHatali || undefined}>
        <th scope="row" className="sa-talep-sabit">{sira}</th>
        <td className="sa-talep-sabit sa-talep-malzeme">
          {k.mevcut !== null ? (
            <span className="sa-talep-secili-ad"><b>{k.ad}</b>{k.mevcut.bagli && <Rozet ton="uyari" gorunum="cizgi">Bağlı kalem</Rozet>}</span>
          ) : k.kart !== null ? (
            <span className="sa-talep-secili-ad">
              <b>{k.kart.ad}</b> <span className="sa-talep-no">{k.kart.kod}</span>
              {k.satisSatiriId === null && <Dugme simge="edit" onClick={() => degistir({ kart: null, kabul: null, kabulHatali: false })}>Değiştir</Dugme>}
            </span>
          ) : k.serbest ? (
            <span className="sa-talep-serbest">
              <input className="tc-alan-kutu" aria-label="Kalem adı" value={k.ad} maxLength={160} required placeholder="Kalem adı" onChange={(e) => degistir({ ad: e.target.value })} />
              <span className="sa-talep-not"><Rozet ton="uyari">kart bekliyor</Rozet> <button type="button" className="sa-talep-bag" onClick={() => degistir({ serbest: false })}>Karttan seç</button></span>
            </span>
          ) : (
            <KartArama tur={tur} tabloda={`Kalem ${String(sira)}`} sec={(kart) => degistir({ kart })} serbesteGec={() => degistir({ serbest: true })} />
          )}
          {k.kaynak && <span className="sa-talep-kaynak"><Rozet ton="uyari" gorunum="cizgi">{k.isEmriId !== null ? 'Fason adım' : k.satisSatiriId !== null ? 'Satış siparişi' : 'Plan ihtiyacı'}</Rozet> {k.kaynak}</span>}
        </td>
        {sutunlar.map((s) => <td key={s} data-sutun={s}><FoyHucresi ad={s} deger={foy.get(s)} /></td>)}
        {tur === 'malzeme' && (
          <td className="sa-talep-alternatif">
            {zarf === null ? <span className="sa-talep-not">Yalnız aynı malzeme</span> : <AlternatifOzeti no={zarf} sira={sira} kabul={k.kabul} ac={() => acikYaz(true)} />}
          </td>
        )}
        <td>
          <input className="tc-alan-kutu sa-talep-sayi" aria-label={`Miktar${birim ? ` (${birim})` : ''}`} inputMode="decimal" placeholder="2,5" required
            value={k.miktar} disabled={k.mevcut?.bagli === true} onChange={(e) => degistir({ miktar: e.target.value, adet: '' })} />
          {k.kart !== null && kartKarsiligi(k.kart, miktarOku(k.miktar)) !== null && <span className="sa-talep-not" aria-live="polite">{kartKarsiligi(k.kart, miktarOku(k.miktar))}</span>}
          <AdetAlani k={k} degistir={degistir} />
        </td>
        <td>
          {birim !== null ? birim : k.serbest
            ? <input className="tc-alan-kutu sa-talep-birim" aria-label="Birim" value={k.birim} maxLength={20} required placeholder={tur === 'hizmet' ? 'saat' : 'adet'} onChange={(e) => degistir({ birim: e.target.value })} />
            : <span className="sa-talep-not">–</span>}
        </td>
        <td><input className="tc-alan-kutu" type="date" aria-label="Termin" value={k.termin} onChange={(e) => degistir({ termin: e.target.value })} /></td>
        <td>
          <select className="tc-alan-kutu" aria-label="Kalemin üretim emri" value={k.emirId} disabled={!emirDegisir || k.mevcut !== null || k.isEmriId !== null}
            onChange={(e) => degistir({ emirId: e.target.value })}>
            <option value="">Bağlı değil</option>
            {emirSecenekleri.map((e) => <option key={e.deger} value={e.deger}>{e.baslik}</option>)}
            {k.emirId !== '' && !emirSecenekleri.some((e) => e.deger === k.emirId) && <option value={k.emirId}>{k.emirNo ?? `Emir #${k.emirId}`}</option>}
          </select>
        </td>
        <td><input className="tc-alan-kutu" aria-label="Kalem açıklaması" value={k.aciklama} maxLength={500} placeholder="Ölçü, marka, kullanım yeri" onChange={(e) => degistir({ aciklama: e.target.value })} /></td>
        <td className="sa-talep-eylem">
          {ayrintiVar && <Dugme simge={acik ? 'up' : 'down'} aria-expanded={acik} aria-controls={`ayr-${ad}`} onClick={() => acikYaz(!acik)}>Ayrıntı</Dugme>}
          {kaldir && <Dugme simge="trash" aria-label={`Kalem ${String(sira)}: kaldır`} onClick={kaldir} />}
        </td>
      </tr>
      {acik && ayrintiVar && (
        <tr className="sa-talep-ayrinti-satir" id={`ayr-${ad}`}>
          <td colSpan={sutunSayisi}>
            <div className="sa-talep-ayrinti-ic">
              {k.kaynak && (
                <p className="sa-talep-kaynak">
                  <span className="sa-talep-not">{k.isEmriId !== null ? 'Bağ talebe taşınır; talep açılınca ön talep listeden düşer.' : k.satisSatiriId !== null ? 'Bağ talebe taşınır; talep açılınca kalem ön talep listesinden düşer. Kart siparişteki karttır.' : 'Talep açılınca miktarı ön talepten düşer; plan değişirse kalan yeniden hesaplanır.'}</span>
                </p>
              )}
              {tur === 'hizmet' && k.mevcut === null && (k.uygulanan !== null ? (
                <div className="sa-talep-secili">
                  <span><span className="sa-talep-not">Uygulanacak malzeme / parça</span><br /><b>{k.uygulanan.ad}</b> <span className="sa-talep-not">{k.uygulanan.kod}</span></span>
                  <Dugme simge="edit" onClick={() => degistir({ uygulanan: null })}>Değiştir</Dugme>
                </div>
              ) : (
                <KartArama tur="malzeme" etiket="Uygulanacak malzeme / parça" sec={(x) => degistir({ uygulanan: { no: x.no, kod: x.kod, ad: x.ad } })}
                  ipucu="İsteğe bağlı. Hizmet hangi parça ya da malzeme üzerinde yapılacak; satın alma teklif isterken bu bilgiyle gider." />
              ))}
              {zarf !== null && <KabulSinirlari no={zarf} kabul={k.kabul} degistir={(kabul, kabulHatali) => degistir({ kabul, kabulHatali })} />}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// Ana sayfadan satın alma talebi (kart #375): talep oturumdaki kişi adına açılır; fiyat, teklif ve tedarikçi burada yoktur.
// 2871-1 a: `duzenlenen` verilirse form o talebin taslağını düzenler (tür ve emir değişmez); kayıt talebimi-duzenle ucuna sürümle gider.
// 2876: `guncelleme` ile aynı form teklif toplanan talebin güncelleme talebini açar; eski talep değişmez, yeni talep ona bağlanır.
export function TalepAc({ taslak = null, taslakEmri = null, taslakBitti, duzenlenen = null, duzenlemeBitti, guncelleme = false }: {
  taslak?: readonly OnTalep[] | null; taslakEmri?: number | null; taslakBitti?: (gonderildi: boolean) => void; duzenlenen?: Talebim | null; duzenlemeBitti?: () => void;
  guncelleme?: boolean;
} = {}) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [tur, turYaz] = useState<TalepTuru>('malzeme');
  const [kalemler, kalemlerYaz] = useState<KalemTaslagi[]>(() => [bosKalem()]);
  const [tarih, tarihYaz] = useState('');
  const [aciklama, aciklamaYaz] = useState('');
  const [emirId, emirIdYaz] = useState('');
  const [hata, hataYaz] = useState<string | null>(null);
  const [cizimler, cizimlerYaz] = useState<SecilenCizim[]>([]);
  // Komutun kimliği başarıya ya da formun değişmesine kadar korunur: ağ kopup elle yeniden gönderilen talep ikinci kez açılmaz (KD-010).
  const [kimlik, kimlikYaz] = useState(yeniIstekKimligi);
  useEffect(() => { kimlikYaz(yeniIstekKimligi()); }, [tur, kalemler, tarih, aciklama, emirId]);
  // Ön talepten gelince form dolar: fasonda hizmet ve emir tekse o emir, planda malzeme; en erken gereken gün.
  useEffect(() => {
    if (taslak === null || taslak.length === 0) return;
    const emirler = [...new Set(taslak.map((o) => (o.kaynak === 'fason' ? o.uretimEmriId : null)))];
    turYaz(taslak.every((o) => o.kaynak !== 'fason') ? 'malzeme' : 'hizmet');
    kalemlerYaz(taslak.map(ontalepKalemi));
    tarihYaz(taslak.flatMap((o) => (o.gerekenTarih === null ? [] : [o.gerekenTarih])).sort()[0] ?? '');
    emirIdYaz(emirler.length === 1 && emirler[0] !== null ? String(emirler[0]) : '');
    hataYaz(null);
  }, [taslak]);
  useEffect(() => {
    if (duzenlenen === null) return;
    turYaz(duzenlenen.kalemler.every((x) => x.uygulanan !== null || x.fasonAdim !== null) ? 'hizmet' : 'malzeme');
    // Kalemin termini gelmezse (eski cevap) talebin terminidir.
    kalemlerYaz(duzenlenen.kalemler.map((x) => { const m = mevcutKalem(x); return m.termin === '' ? { ...m, termin: duzenlenen.ihtiyacTarihi?.slice(0, 10) ?? '' } : m; }));
    tarihYaz(duzenlenen.ihtiyacTarihi?.slice(0, 10) ?? '');
    aciklamaYaz(duzenlenen.aciklama ?? '');
    emirIdYaz('');
    hataYaz(null);
  }, [duzenlenen]);
  const temizle = () => { kalemlerYaz([bosKalem()]); tarihYaz(''); aciklamaYaz(''); emirIdYaz(''); hataYaz(null); cizimlerYaz([]); };
  // 3442-2: talep açılınca seçilen çizimler bağlanır; bağlanamayan çizim talebi geri almaz, kişiye söylenir.
  const cizimleriBagla = async (talepId: string, no: string) => {
    const l = cizimler;
    let olmayan = 0;
    for (const c of l) { try { await cizimBagla(talepId, c); } catch { olmayan += 1; } }
    if (olmayan > 0) bildir('hata', `${no}: ${String(olmayan)} çizim eklenemedi; Taleplerim'de talebi açıp yeniden ekleyin.`);
  };
  const duzenleme = useMutation({
    mutationFn: ({ id, govde }: { id: string; govde: TalebimiDuzenleYazimi }) => (guncelleme
      ? tekrarKorumaliGonder((deneme) => cagri.post('/satin-alma-talepleri/:id/guncelleme-ac', { parametre: { id }, govde: { ...govde, id: kimlik } satisfies TalebimGuncellemeYazimi, ...deneme, ...SURE }),
        { ...SURE, istekKimligi: kimlik })
      : cagri.post('/satin-alma-talepleri/:id/talebimi-duzenle', { parametre: { id }, govde, ...SURE })),
    onSuccess: async (t) => {
      if (guncelleme) await cizimleriBagla(t.id, t.no);
      bildir('tamam', guncelleme && duzenlenen !== null ? `${t.no} güncelleme talebi olarak açıldı; ${duzenlenen.no} yerinde duruyor.` : `${t.no} güncellendi.`);
      temizle();
      void istemci.invalidateQueries({ queryKey: anahtarlar.taleplerimHepsi });
      void istemci.invalidateQueries({ queryKey: anahtarlar.ozet });
      duzenlemeBitti?.();
    },
    onError: (h) => hataYaz(h instanceof ApiHatasi && h.sunucuIletisi ? h.sunucuIletisi : 'Talep kaydedilemedi; yeniden deneyin.'),
  });
  const bagli = kalemler.some((k) => k.isEmriId !== null || k.satisSatiriId !== null);
  const emirler = useQuery({ queryKey: anahtarlar.acikEmirler, queryFn: () => cagri.get('/satin-alma-acik-emirler', SURE) });
  // Taslak bir üretim emrinden geldiyse (3364) emir seçili gelir; eksiklerin hepsi istenmişse boş forma da bağ taşınır. Görünen gönderilendir:
  // emir açık emirler listesinde yoksa (planlı ya da başlamış değil) seçim boş kalır.
  // Bir kez yazılır: liste yeniden okununca kullanıcının elle değiştirdiği seçim geri alınmaz.
  const emirListesi = emirler.data?.emirler;
  const yazilanEmir = useRef<{ emir: number; taslak: readonly OnTalep[] | null } | null>(null);
  useEffect(() => {
    if (taslakEmri === null || emirListesi === undefined) return;
    if (yazilanEmir.current?.emir === taslakEmri && yazilanEmir.current.taslak === taslak) return;
    yazilanEmir.current = { emir: taslakEmri, taslak };
    const emir = emirListesi.some((e) => e.id === taslakEmri) ? String(taslakEmri) : '';
    emirIdYaz(emir);
    kalemlerYaz((l) => l.map((x) => (x.emirId === '' && x.mevcut === null ? { ...x, emirId: emir } : x)));
  }, [taslakEmri, taslak, emirListesi]);
  // 3462 a: üstteki termin ve emir varsayılandır; değişince boş ya da eski varsayılanı taşıyan kalemler izler, elle değiştirilen kalem kalır.
  const varsayilanTermin = (yeni: string) => {
    kalemlerYaz((l) => l.map((x) => (x.termin === '' || x.termin === tarih ? { ...x, termin: yeni } : x)));
    tarihYaz(yeni);
  };
  const varsayilanEmir = (yeni: string) => {
    kalemlerYaz((l) => l.map((x) => (x.mevcut === null && x.isEmriId === null && (x.emirId === '' || x.emirId === emirId) ? { ...x, emirId: yeni } : x)));
    emirIdYaz(yeni);
  };
  const tumuneUygula = () => kalemlerYaz((l) => l.map((x) => ({
    ...x, termin: tarih, ...(duzenlenen === null && x.mevcut === null && x.isEmriId === null ? { emirId } : {}),
  })));
  const emirSecenekleri = (emirler.data?.emirler ?? []).map((e) => ({ deger: String(e.id), baslik: `${e.emirNo} · ${e.parcaNo} ${e.parcaAd}` }));
  const sutunlar = foySutunlari(kalemler);
  const gonder = useMutation({
    mutationFn: (govde: HizliAcGovdesi) =>
      tekrarKorumaliGonder((deneme) => cagri.post('/satin-alma-talepleri/hizli-ac', { govde, ...deneme, ...SURE }), { ...SURE, istekKimligi: govde.id }),
    onSuccess: async (t) => {
      await cizimleriBagla(t.id, t.no);
      bildir('tamam', `${t.no} açıldı; satın almaya düştü.`);
      kalemlerYaz([bosKalem()]); tarihYaz(''); aciklamaYaz(''); emirIdYaz(''); hataYaz(null); cizimlerYaz([]);
      void istemci.invalidateQueries({ queryKey: anahtarlar.taleplerimHepsi });
      void istemci.invalidateQueries({ queryKey: anahtarlar.ozet });
      void istemci.invalidateQueries({ queryKey: anahtarlar.onTalepler });
      taslakBitti?.(true);
    },
    onError: (h) => hataYaz(h instanceof ApiHatasi && h.sunucuIletisi ? h.sunucuIletisi : 'Talep gönderilemedi; yeniden deneyin.'),
  });
  const degistir = (anahtar: string, d: Partial<KalemTaslagi>) => kalemlerYaz((l) => l.map((k) => (k.anahtar === anahtar ? { ...k, ...d } : k)));
  const eksik = kalemler.some((k) => k.mevcut === null && k.kart === null && (!k.serbest || k.ad.trim() === '' || k.birim.trim() === ''));
  const miktarsiz = kalemler.some((k) => miktarOku(k.miktar) === null);
  const belirsiz = kalemler.some((k) => belirsizMiktarVar(miktarGirdisi(k.miktar)));
  const eksiMiktar = kalemler.some((k) => /^-\s*\d/.test(miktarGirdisi(k.miktar)));

  const gonderTikla = () => {
    if (kalemler.some((k) => k.kabulHatali)) {
      hataYaz('Kabul sınırındaki ölçü payını düzeltin ya da boş bırakın.');
      return;
    }
    if (eksik || miktarsiz) {
      hataYaz(eksik ? `Her kalem için ${tur === 'hizmet' ? 'hizmeti' : 'malzemeyi'} seçin (ya da adını ve birimini yazın) ve miktarı girin.`
        : belirsiz ? BELIRSIZ_MIKTAR : eksiMiktar ? 'Miktar sıfırdan büyük olmalı.' : 'Miktarı sayı olarak yazın; ondalık için virgül, binlik için nokta (1.250,5).');
      return;
    }
    if (duzenlenen !== null) {
      duzenleme.mutate({ id: duzenlenen.id, govde: {
        surum: duzenlenen.surum!, ihtiyacTarihi: tarih === '' ? null : tarih, aciklama: aciklama.trim(),
        kalemler: kalemler.map((k) => ({
          id: k.mevcut?.id ?? null, malzemeNo: k.kart?.no ?? null, ad: k.kart || k.mevcut ? '' : k.ad.trim(), birim: k.kart || k.mevcut ? '' : k.birim.trim(),
          miktar: miktarOku(k.miktar)!, aciklama: k.aciklama.trim(), ...kabulAlani(tur, k), ihtiyacTarihi: k.termin === '' ? null : k.termin,
        })),
      } });
      return;
    }
    gonder.mutate({
      id: kimlik, tur, ihtiyacTarihi: tarih === '' ? null : tarih, aciklama: aciklama.trim(), uretimEmriId: emirId === '' ? null : Number(emirId),
      kalemler: kalemler.map((k) => ({
        malzemeNo: k.kart?.no ?? null, ad: k.kart ? '' : k.ad.trim(), birim: k.kart ? '' : k.birim.trim(), miktar: miktarOku(k.miktar)!, aciklama: k.aciklama.trim(),
        uygulananMalzemeNo: tur === 'hizmet' ? (k.uygulanan?.no ?? null) : null, isEmriId: tur === 'hizmet' ? k.isEmriId : null, ...kabulAlani(tur, k),
        // Formun varsayılanıyla aynı değer gönderilmez: sunucu talebinkini uygular.
        ...(k.termin === tarih ? {} : { ihtiyacTarihi: k.termin === '' ? null : k.termin }),
        ...(k.emirId === emirId ? {} : { uretimEmriId: k.emirId === '' ? null : Number(k.emirId) }),
        ...(tur === 'malzeme' && k.satisSatiriId !== null ? { satisSiparisSatiriId: k.satisSatiriId } : {}),
      })),
    });
  };

  return (
    <Kart baslik={duzenlenen === null ? 'Satın alma talebi' : guncelleme ? `Güncelleme talebi: ${duzenlenen.no}` : `Talebi düzenle: ${duzenlenen.no}`}>
      <form className="sa-talep" onSubmit={(e) => { e.preventDefault(); gonderTikla(); }} noValidate>
        <p className="sa-talep-not">İhtiyacınızı yazın; satın alma teklif toplar ve size durumunu bildirir.</p>
        {duzenlenen === null && <div className="sa-talep-tur" role="group" aria-label="Talep türü">
          {(['malzeme', 'hizmet'] as const).map((t) => (
            <Dugme key={t} simge={t === 'malzeme' ? 'box' : 'wrench'} tur={tur === t ? 'birincil' : 'ikincil'} aria-pressed={tur === t} disabled={bagli && t !== tur}
              onClick={() => { if (t !== tur) { turYaz(t); kalemlerYaz([bosKalem({ termin: tarih, emirId })]); } }}>{TUR_ADI[t]}</Dugme>
          ))}
        </div>}
        <div className="sa-talep-varsayilan">
          <Girdi etiket="İstenen tarih" type="date" value={tarih} onChange={(e) => varsayilanTermin(e.target.value)} ipucu="Kalemlere dolar; kalem kendi terminini taşıyabilir." />
          {duzenlenen === null && (
            <label className="tc-alan">
              <span className="tc-alan-etiket">Üretim emri (isteğe bağlı)</span>
              <select className="tc-alan-kutu" value={emirId} onChange={(e) => varsayilanEmir(e.target.value)}>
                <option value="">Üretim emrine bağlı değil</option>
                {emirSecenekleri.map((e) => <option key={e.deger} value={e.deger}>{e.baslik}</option>)}
              </select>
              <span className="sa-talep-not">{emirler.isError ? 'Açık emirler okunamadı; emre bağlamadan gönderebilirsiniz.' : 'Yalnız planlı ve başlamış emirler; kalem başına değiştirilebilir.'}</span>
            </label>
          )}
          <div className="sa-talep-uygula"><Dugme onClick={tumuneUygula} disabled={kalemler.length < 2}>Tümüne uygula</Dugme></div>
        </div>
        <div className="tc-tablo-kap sa-talep-tablo" role="region" aria-label="Kalemler" tabIndex={0}>
          <table className="tc-tablo">
            <thead>
              <tr>
                <th className="sa-talep-sabit" scope="col">#</th>
                <th className="sa-talep-sabit sa-talep-malzeme" scope="col">{TUR_ADI[tur]}</th>
                {sutunlar.map((x) => <th key={x} scope="col">{FOY_BASLIGI[x] ?? x}</th>)}
                {tur === 'malzeme' && <th scope="col">Alternatif</th>}
                <th scope="col">Miktar</th>
                <th scope="col">Birim</th>
                <th scope="col">Termin</th>
                <th scope="col">Üretim emri</th>
                <th scope="col">Açıklama</th>
                <th scope="col"><span className="sa-talep-gizli">İşlemler</span></th>
              </tr>
            </thead>
            <tbody>
              {kalemler.map((k, i) => (
                <KalemSatiri key={k.anahtar} tur={tur} sira={i + 1} k={k} foySutunlari={sutunlar} emirSecenekleri={emirSecenekleri} emirDegisir={duzenlenen === null}
                  degistir={(d) => degistir(k.anahtar, d)}
                  kaldir={kalemler.length > 1 && k.mevcut?.bagli !== true ? () => kalemlerYaz((l) => l.filter((x) => x.anahtar !== k.anahtar)) : null} />
              ))}
            </tbody>
          </table>
        </div>
        <div className="sa-talep-gonder">
          <Dugme simge="plus" onClick={() => kalemlerYaz((l) => [...l, bosKalem({ termin: tarih, emirId: duzenlenen === null ? emirId : '' })])} disabled={kalemler.length >= 50}>Kalem ekle</Dugme>
          {tur !== 'hizmet' && <span className="sa-talep-not">Kart yoksa <a href={KART_SAYFASI.yol} target="_blank" rel="noopener">{KART_SAYFASI.baslik}</a> sayfasında istenir; yeni sekmede açılır, bu form açık kalır.</span>}
        </div>
        <CokSatir etiket="Açıklama" value={aciklama} onChange={(e) => aciklamaYaz(e.target.value)} maxLength={4000} rows={2} placeholder="Nerede, ne için kullanılacak" />
        {duzenlenen !== null && !guncelleme
          ? <TalepCizimleri talepId={duzenlenen.id} yazabilir={duzenlenen.duzenlenebilir === true} />
          : <CizimSecici secilen={cizimler} degistir={cizimlerYaz} />}
        {hata && <p className="sa-talep-hata" role="alert">{hata}</p>}
        <div className="sa-talep-gonder">
          {duzenlenen !== null && <Dugme onClick={() => { temizle(); duzenlemeBitti?.(); }}>Vazgeç</Dugme>}
          {bagli && duzenlenen === null && (
            <Dugme onClick={() => { kalemlerYaz([bosKalem()]); tarihYaz(''); emirIdYaz(''); hataYaz(null); taslakBitti?.(false); }}>Vazgeç</Dugme>
          )}
          <Dugme tur="birincil" simge="check" type="submit" yukleniyor={gonder.isPending || duzenleme.isPending}>{duzenlenen === null ? 'Talebi gönder' : guncelleme ? 'Güncelleme talebini gönder' : 'Değişiklikleri kaydet'}</Dugme>
        </div>
      </form>
    </Kart>
  );
}
