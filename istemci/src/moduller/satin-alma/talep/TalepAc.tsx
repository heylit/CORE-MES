import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { HizliAcGovdesi, MalzemeSecenekleriCevabi, OnTalep, Talebim, TalebimGuncellemeYazimi, TalebimiDuzenleYazimi, TalepTuru } from '#paylasilan/sozlesme/satin-alma.ts';
import { CokSatir, Dugme, Girdi, Kart, Rozet, Secim, useBildirim } from '../../../ortak/arayuz/index.ts';
import { ApiHatasi } from '../../../ortak/veri/api.ts';
import { BELIRSIZ_MIKTAR, belirsizMiktarVar, miktarGirdisi } from '../../../ortak/veri/miktar.ts';
import { tekrarKorumaliGonder, yeniIstekKimligi } from '../../../ortak/veri/istek-kimligi.ts';
import { KART_SAYFASI, SURE, adettenKg, anahtarlar, cagri, kartKarsiligi, karsilikYaz, parcaKg } from './ortak.ts';
import './talep.css';

type KartSecenegi = MalzemeSecenekleriCevabi['malzemeler'][number];

// Kalem ya kartlıdır (malzeme kartından seçilir) ya da adıyla yazılır ve "kart bekler"; kart bağlanmadan sipariş verilmez.
// 898 a: hizmet kalemi uygulanacak parçayı taşır; ön talepten gelen kalem fason iş emrini ve kaynağının adını taşır.
interface Uygulanan { no: number; kod: string; ad: string }
interface KalemTaslagi {
  anahtar: string; kart: KartSecenegi | null; serbest: boolean; ad: string; birim: string; miktar: string; aciklama: string;
  uygulanan: Uygulanan | null; isEmriId: number | null; kaynak: string | null;
  // 2871-1 a: düzenlenen talepte var olan kalem; kartı, adı ve birimi değişmez. Bağlı (fason, parça) kalemin miktarı da değişmez.
  mevcut: { id: string; bagli: boolean } | null;
  // 3100: adet alanına yazılan (yalnız giriş yardımcısı, gönderilmez); kg değişince silinir. parcaKg: düzenlenen kalemde sunucunun karşılığından.
  adet: string; parcaKg: number | null;
}
const TUR_ADI: Record<TalepTuru, string> = { malzeme: 'Malzeme', hizmet: 'Hizmet', fason: 'Fason' };
const bosKalem = (): KalemTaslagi => ({
  anahtar: yeniIstekKimligi(), kart: null, serbest: false, ad: '', birim: '', miktar: '', aciklama: '', uygulanan: null, isEmriId: null, kaynak: null, mevcut: null, adet: '', parcaKg: null,
});
const mevcutKalem = (x: Talebim['kalemler'][number]): KalemTaslagi => ({
  ...bosKalem(), ad: x.ad, birim: x.birim, miktar: (x.miktar ?? '').replace('.', ','), aciklama: x.aciklama ?? '',
  mevcut: { id: x.id!, bagli: x.uygulanan !== null || x.fasonAdim !== null },
  parcaKg: x.karsilik?.birim === 'adet' && x.miktar !== null && Number(x.karsilik.miktar) > 0 ? Number(x.miktar) / Number(x.karsilik.miktar) : null,
});
// Ön talepten kalem: fason adımın adı kalem adıdır (hizmet kartı seçilene kadar kart bekler), miktar emrin adedi. Plan ihtiyacında kalem
// malzeme kartıdır, miktar kalan eksik.
const ontalepKalemi = (o: OnTalep): KalemTaslagi => (o.kaynak === 'plan'
  ? {
    ...bosKalem(), kart: { no: o.malzeme.no, kod: o.malzeme.kod, ad: o.malzeme.ad, birim: o.birim, kategori: null, katalogId: null },
    miktar: String(o.miktar).replace('.', ','), kaynak: `${o.emirler.slice(0, 3).join(', ')}${o.emirler.length > 3 ? ` +${o.emirler.length - 3}` : ''}`,
  }
  : {
    ...bosKalem(), serbest: true, ad: o.adim ?? `Op ${o.opNo}`, birim: o.birim, miktar: String(o.miktar), uygulanan: o.parca, isEmriId: o.isEmriId,
    kaynak: `${o.emirNo} · Op ${o.opNo}`,
  });

// Denetim #37: miktar ortak ayrıştırıcıdan okunur ("12.5" = "12,5", virgül varsa nokta binliktir). Virgülsüz "1.250" belirsizdir,
// okunamayan miktar gibi gönderilmez (Y2: noktayı binlik sayıp silmek "12.5"i 125 yapıyordu).
const miktarOku = (m: string): string | null => {
  const v = miktarGirdisi(m);
  return /^\d+(\.\d+)?$/.test(v) ? v : null;
};

// #1192: açılır, aranabilir liste. Odaklanınca türün ilk kartları açılır; yazdıkça kod, ad ya da kart no'suyla daralır.
function KartArama({ tur, sec, serbesteGec, etiket, ipucu }: {
  tur: TalepTuru; sec: (k: KartSecenegi) => void; serbesteGec?: () => void; etiket?: string; ipucu?: string;
}) {
  const [metin, metinYaz] = useState('');
  const [ara, araYaz] = useState('');
  const [acik, acikYaz] = useState(false);
  const [etkin, etkinYaz] = useState(0);
  const kap = useRef<HTMLDivElement>(null);
  const liste = `${useId()}-liste`;
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
  return (
    <div className="sa-talep-ara" ref={kap} onBlur={(o) => { if (!kap.current?.contains(o.relatedTarget as Node | null)) kapat(); }}>
      <div className="sa-talep-acilir">
        <Girdi etiket={ad} type="search" placeholder={`${ad} kodu, adı ya da kart no; listeden seçin`} value={metin} autoComplete="off"
          role="combobox" aria-expanded={acik} aria-controls={liste} aria-autocomplete="list"
          aria-activedescendant={acik && kartlar.length > 0 ? `${liste}-${sira}` : undefined}
          onChange={(e) => { metinYaz(e.target.value); etkinYaz(0); acikYaz(true); }} onFocus={() => acikYaz(true)} onClick={() => acikYaz(true)} onKeyDown={tusla} />
        <div id={liste} className="sa-talep-sonuc" role="listbox" aria-label={`Bulunan ${ad.toLocaleLowerCase('tr')} kartları`} hidden={!acik}>
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
  const yaklasik = miktar === null || k.adet !== '' ? null : karsilikYaz({ miktar: String(Number(miktar) / kg), birim: 'adet' });
  return (
    <div className="sa-talep-adet">
      <Girdi etiket="Adet" inputMode="numeric" value={k.adet} placeholder={yaklasik ?? 'Kaç parça'} disabled={k.mevcut?.bagli === true}
        onChange={(e) => {
          const adet = e.target.value.replace(/\D/g, '');
          degistir(adet === '' ? { adet } : { adet, miktar: adettenKg(Number(adet), kg) });
        }} />
      <p className="sa-talep-not" aria-live="polite">{yaklasik !== null ? `${yaklasik} · ` : ''}1 parça ≈ {kg.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} kg</p>
    </div>
  );
}

function KalemSatiri({ tur, k, degistir, kaldir }: { tur: TalepTuru; k: KalemTaslagi; degistir: (d: Partial<KalemTaslagi>) => void; kaldir: (() => void) | null }) {
  return (
    <fieldset className="sa-talep-kalem">
      <legend className="sa-talep-gizli">Kalem</legend>
      {k.kaynak && (
        <p className="sa-talep-kaynak">
          <Rozet ton="uyari" gorunum="cizgi">{k.isEmriId !== null ? 'Fason adım' : 'Plan ihtiyacı'}</Rozet> Ön talepten: <span className="sa-talep-no">{k.kaynak}</span>
          <span className="sa-talep-not">{k.isEmriId !== null ? 'Bağ talebe taşınır; talep açılınca ön talep listeden düşer.' : 'Talep açılınca miktarı ön talepten düşer; plan değişirse kalan yeniden hesaplanır.'}</span>
        </p>
      )}
      {k.mevcut !== null ? (
        <div className="sa-talep-secili">
          <span><b>{k.ad}</b> <span className="sa-talep-not">{k.birim}</span></span>
          {k.mevcut.bagli && <Rozet ton="uyari" gorunum="cizgi">Bağlı kalem</Rozet>}
        </div>
      ) : k.kart !== null ? (
        <div className="sa-talep-secili">
          <span><b>{k.kart.ad}</b> <span className="sa-talep-not">{k.kart.kod}</span></span>
          <Dugme simge="edit" onClick={() => degistir({ kart: null })}>Değiştir</Dugme>
        </div>
      ) : k.serbest ? (
        <div className="sa-talep-serbest">
          <Girdi etiket="Kalem adı" value={k.ad} onChange={(e) => degistir({ ad: e.target.value })} maxLength={160} required />
          <Girdi etiket="Birim" value={k.birim} onChange={(e) => degistir({ birim: e.target.value })} maxLength={20} placeholder={tur === 'hizmet' ? 'saat, gün, adet' : 'adet, kg'} required />
          <p className="sa-talep-not"><Rozet ton="uyari">kart bekliyor</Rozet> <button type="button" className="sa-talep-bag" onClick={() => degistir({ serbest: false })}>Karttan seç</button></p>
        </div>
      ) : (
        <KartArama tur={tur} sec={(kart) => degistir({ kart })} serbesteGec={() => degistir({ serbest: true })} />
      )}
      {tur === 'hizmet' && k.mevcut === null && (
        <div className="sa-talep-uygulanan">
          {k.uygulanan !== null ? (
            <div className="sa-talep-secili">
              <span><span className="sa-talep-not">Uygulanacak malzeme / parça</span><br /><b>{k.uygulanan.ad}</b> <span className="sa-talep-not">{k.uygulanan.kod}</span></span>
              <Dugme simge="edit" onClick={() => degistir({ uygulanan: null })}>Değiştir</Dugme>
            </div>
          ) : (
            <KartArama tur="malzeme" etiket="Uygulanacak malzeme / parça" sec={(x) => degistir({ uygulanan: { no: x.no, kod: x.kod, ad: x.ad } })}
              ipucu="İsteğe bağlı. Hizmet hangi parça ya da malzeme üzerinde yapılacak; satın alma teklif isterken bu bilgiyle gider." />
          )}
        </div>
      )}
      <div className="sa-talep-miktar">
        <div className="sa-talep-miktar-grup">
          <Girdi etiket={`Miktar${k.kart?.birim ? ` (${k.kart.birim})` : k.mevcut ? ` (${k.birim})` : ''}`} inputMode="decimal" placeholder="Ondalık için virgül: 2,5" value={k.miktar} onChange={(e) => degistir({ miktar: e.target.value, adet: '' })} required disabled={k.mevcut?.bagli === true} />
          <AdetAlani k={k} degistir={degistir} />
          {k.kart !== null && kartKarsiligi(k.kart, miktarOku(k.miktar)) !== null && <p className="sa-talep-not" aria-live="polite">{kartKarsiligi(k.kart, miktarOku(k.miktar))}</p>}
        </div>
        <Girdi etiket="Açıklama" value={k.aciklama} onChange={(e) => degistir({ aciklama: e.target.value })} maxLength={500} placeholder="Ölçü, marka, kullanım yeri" />
      </div>
      {kaldir && <Dugme simge="trash" onClick={kaldir}>Kalemi kaldır</Dugme>}
    </fieldset>
  );
}

// Ana sayfadan satın alma talebi (kart #375): talep oturumdaki kişi adına açılır; fiyat, teklif ve tedarikçi burada yoktur.
// 2871-1 a: `duzenlenen` verilirse form o talebin taslağını düzenler (tür ve emir değişmez); kayıt talebimi-duzenle ucuna sürümle gider.
// 2876: `guncelleme` ile aynı form teklif toplanan talebin güncelleme talebini açar; eski talep değişmez, yeni talep ona bağlanır.
export function TalepAc({ taslak = null, taslakBitti, duzenlenen = null, duzenlemeBitti, guncelleme = false }: {
  taslak?: readonly OnTalep[] | null; taslakBitti?: (gonderildi: boolean) => void; duzenlenen?: Talebim | null; duzenlemeBitti?: () => void;
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
  // Komutun kimliği başarıya ya da formun değişmesine kadar korunur: ağ kopup elle yeniden gönderilen talep ikinci kez açılmaz (KD-010).
  const [kimlik, kimlikYaz] = useState(yeniIstekKimligi);
  useEffect(() => { kimlikYaz(yeniIstekKimligi()); }, [tur, kalemler, tarih, aciklama, emirId]);
  // Ön talepten gelince form dolar: fasonda hizmet ve emir tekse o emir, planda malzeme; en erken gereken gün.
  useEffect(() => {
    if (taslak === null || taslak.length === 0) return;
    const emirler = [...new Set(taslak.map((o) => (o.kaynak === 'fason' ? o.uretimEmriId : null)))];
    turYaz(taslak.every((o) => o.kaynak === 'plan') ? 'malzeme' : 'hizmet');
    kalemlerYaz(taslak.map(ontalepKalemi));
    tarihYaz(taslak.flatMap((o) => (o.gerekenTarih === null ? [] : [o.gerekenTarih])).sort()[0] ?? '');
    emirIdYaz(emirler.length === 1 && emirler[0] !== null ? String(emirler[0]) : '');
    hataYaz(null);
  }, [taslak]);
  useEffect(() => {
    if (duzenlenen === null) return;
    turYaz(duzenlenen.kalemler.every((x) => x.uygulanan !== null || x.fasonAdim !== null) ? 'hizmet' : 'malzeme');
    kalemlerYaz(duzenlenen.kalemler.map(mevcutKalem));
    tarihYaz(duzenlenen.ihtiyacTarihi?.slice(0, 10) ?? '');
    aciklamaYaz(duzenlenen.aciklama ?? '');
    emirIdYaz('');
    hataYaz(null);
  }, [duzenlenen]);
  const temizle = () => { kalemlerYaz([bosKalem()]); tarihYaz(''); aciklamaYaz(''); emirIdYaz(''); hataYaz(null); };
  const duzenleme = useMutation({
    mutationFn: ({ id, govde }: { id: string; govde: TalebimiDuzenleYazimi }) => (guncelleme
      ? tekrarKorumaliGonder((deneme) => cagri.post('/satin-alma-talepleri/:id/guncelleme-ac', { parametre: { id }, govde: { ...govde, id: kimlik } satisfies TalebimGuncellemeYazimi, ...deneme, ...SURE }),
        { ...SURE, istekKimligi: kimlik })
      : cagri.post('/satin-alma-talepleri/:id/talebimi-duzenle', { parametre: { id }, govde, ...SURE })),
    onSuccess: (t) => {
      bildir('tamam', guncelleme && duzenlenen !== null ? `${t.no} güncelleme talebi olarak açıldı; ${duzenlenen.no} yerinde duruyor.` : `${t.no} güncellendi.`);
      temizle();
      void istemci.invalidateQueries({ queryKey: anahtarlar.taleplerimHepsi });
      void istemci.invalidateQueries({ queryKey: anahtarlar.ozet });
      duzenlemeBitti?.();
    },
    onError: (h) => hataYaz(h instanceof ApiHatasi && h.sunucuIletisi ? h.sunucuIletisi : 'Talep kaydedilemedi; yeniden deneyin.'),
  });
  const bagli = kalemler.some((k) => k.isEmriId !== null);
  const emirler = useQuery({ queryKey: anahtarlar.acikEmirler, queryFn: () => cagri.get('/satin-alma-acik-emirler', SURE) });
  const gonder = useMutation({
    mutationFn: (govde: HizliAcGovdesi) =>
      tekrarKorumaliGonder((deneme) => cagri.post('/satin-alma-talepleri/hizli-ac', { govde, ...deneme, ...SURE }), { ...SURE, istekKimligi: govde.id }),
    onSuccess: (t) => {
      bildir('tamam', `${t.no} açıldı; satın almaya düştü.`);
      kalemlerYaz([bosKalem()]); tarihYaz(''); aciklamaYaz(''); emirIdYaz(''); hataYaz(null);
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
          miktar: miktarOku(k.miktar)!, aciklama: k.aciklama.trim(),
        })),
      } });
      return;
    }
    gonder.mutate({
      id: kimlik, tur, ihtiyacTarihi: tarih === '' ? null : tarih, aciklama: aciklama.trim(), uretimEmriId: emirId === '' ? null : Number(emirId),
      kalemler: kalemler.map((k) => ({
        malzemeNo: k.kart?.no ?? null, ad: k.kart ? '' : k.ad.trim(), birim: k.kart ? '' : k.birim.trim(), miktar: miktarOku(k.miktar)!, aciklama: k.aciklama.trim(),
        uygulananMalzemeNo: tur === 'hizmet' ? (k.uygulanan?.no ?? null) : null, isEmriId: tur === 'hizmet' ? k.isEmriId : null,
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
              onClick={() => { if (t !== tur) { turYaz(t); kalemlerYaz([bosKalem()]); } }}>{TUR_ADI[t]}</Dugme>
          ))}
        </div>}
        {kalemler.map((k) => (
          <KalemSatiri key={k.anahtar} tur={tur} k={k} degistir={(d) => degistir(k.anahtar, d)}
            kaldir={kalemler.length > 1 && k.mevcut?.bagli !== true ? () => kalemlerYaz((l) => l.filter((x) => x.anahtar !== k.anahtar)) : null} />
        ))}
        <div><Dugme simge="plus" onClick={() => kalemlerYaz((l) => [...l, bosKalem()])} disabled={kalemler.length >= 50}>Kalem ekle</Dugme></div>
        <div className="sa-talep-alt">
          <Girdi etiket="İstenen tarih" type="date" value={tarih} onChange={(e) => tarihYaz(e.target.value)} />
          <CokSatir etiket="Açıklama" value={aciklama} onChange={(e) => aciklamaYaz(e.target.value)} maxLength={4000} rows={2} placeholder="Nerede, ne için kullanılacak" />
        </div>
        {duzenlenen === null && <Secim etiket="Üretim emri (isteğe bağlı)" value={emirId} onChange={(e) => emirIdYaz(e.target.value)} bosSecenek="Üretim emrine bağlı değil"
          secenekler={(emirler.data?.emirler ?? []).map((e) => ({ deger: String(e.id), baslik: `${e.emirNo} · ${e.parcaNo} ${e.parcaAd}` }))}
          ipucu={emirler.isError ? 'Açık emirler okunamadı; emre bağlamadan gönderebilirsiniz.' : 'Malzeme bir emir için alınıyorsa seçin; yalnız planlı ve başlamış emirler listelenir.'} />}
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
