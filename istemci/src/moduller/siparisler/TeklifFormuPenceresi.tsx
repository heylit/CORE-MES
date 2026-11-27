import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  TeklifAyrintiCevabi, TeklifFormuCevabi, TeklifFormuIcerigi, TeklifFormuMetni, TeklifFormuVerisiCevabi, TeklifSurumuCevabi,
} from '#paylasilan/sozlesme/siparisler.ts';
import { DurumKutusu, Dugme, Girdi, Kart, OnayPenceresi, Pencere, Rozet, Secim, Sekmeler, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useKurumLogosu } from '../../ortak/veri/kurum-logosu.ts';
import { AlanPaneli } from './AlanPaneli.tsx';
import { anahtarlar } from './anahtarlar.ts';
import { FormMetniAlanlari, SartAlanlari } from './FormMetniAlanlari.tsx';
import { TeklifFormuKagidi, type FormVerisi } from './TeklifFormuKagidi.tsx';
import { FORM_SOZLERI, alanBasilir, alanEtiketi, kdvOraniOku, useKagitOlcegi } from './teklif-formu.ts';
import { eskiyseYenile, useKorumaliGonderim, useYazabilir, yazmaIletisi } from './yazma.ts';
import './teklif-formu.css';

interface Ozellikler { acik: boolean; kapat: () => void; teklif: TeklifAyrintiCevabi; surum: TeklifSurumuCevabi }

const KDV_VARSAYILAN = '20';
const ayni = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const kopya = (m: TeklifFormuMetni): TeklifFormuMetni => ({ dil: m.dil, icerik: { ...m.icerik, sartlar: [...m.icerik.sartlar] } });
// 3794: gizlenince müşteriye giden formda eksik kalan ana sayılar; ön izlemenin altında sessizce yazılır.
const ANA_ALANLAR = ['sutunMiktar', 'sutunTutar', 'toplamGenel'] as const;
const SEKMELER = [{ anahtar: 'duzen', baslik: 'Düzenle', simge: 'edit' }, { anahtar: 'kagit', baslik: 'Ön izleme', simge: 'file' }] as const;

// Teklif formu penceresi (3245 d): şablon seçilir (varsayılan önce gelir), ilgili kişi ve KDV oranı yazılır; ikisi saklanmaz.
// 3461: KDV oranı sürümün oranıyla açılır (oransız eski sürümde 20); pencerede değiştirilen oran yalnız o basıma girer.
// 3328: teklifi yazan, formun metnini (başlık, giriş, şartlar, imzalar, alt bilgi) yanındaki canlı kâğıtla bu teklif için değiştirir;
// "Bu teklif için kaydet" metni teklife yazar, "Şablona dön" kaydı kaldırır. Kaydetmeden de basılır: basım ekrandaki metinle olur.
// "Yazdır / PDF" tarayıcının basım penceresini açar; PDF orada "PDF olarak kaydet" ile alınır (yeni paket yok, Türkçe harf sorunsuz).
export function TeklifFormuPenceresi({ acik, kapat, teklif, surum }: Ozellikler) {
  const ayar = useQuery({ queryKey: anahtarlar.teklifFormuAyari, queryFn: () => api.get<TeklifFormuCevabi>('/siparisler/teklif-formu'), enabled: acik });
  const logo = useKurumLogosu(acik);
  const [sablonId, sablonIdYaz] = useState<number | null>(null);
  const [ilgili, ilgiliYaz] = useState('');
  const surumKdv = surum.kdvOrani === null ? KDV_VARSAYILAN : String(Number(surum.kdvOrani)).replace('.', ',');
  const [kdvGirdi, kdvGirdiYaz] = useState(surumKdv);
  useEffect(() => { kdvGirdiYaz(surumKdv); }, [surumKdv]);
  const kdvOrani = kdvOraniOku(kdvGirdi);
  // Form müşteriye gider: sürümdeki orandan ayrılan oran sessiz kalmasın.
  const formKdvSapti = surum.kdvOrani !== null && kdvOrani !== null && Number(kdvOrani) !== Number(surum.kdvOrani);
  const sorgu = { surumNo: surum.surumNo, kdvOrani: kdvOrani ?? KDV_VARSAYILAN };
  const veri = useQuery({
    queryKey: anahtarlar.teklifFormuVerisi(teklif.id, sorgu),
    queryFn: () => api.get<TeklifFormuVerisiCevabi>(`/siparisler/teklifler/${String(teklif.id)}/form?surumNo=${String(sorgu.surumNo)}&kdvOrani=${encodeURIComponent(sorgu.kdvOrani)}`),
    enabled: acik && kdvOrani !== null,
    placeholderData: (onceki) => onceki,
  });

  const sablonlar = ayar.data?.sablonlar ?? [];
  const sablon = sablonlar.find((s) => s.id === sablonId) ?? sablonlar.find((s) => s.varsayilan) ?? sablonlar[0] ?? null;
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const korumali = useKorumaliGonderim();
  // Kabul edilen, reddedilen ya da siparişe dönen teklifin basılı metni değişmez (sunucu da reddeder); kayıtlı metinle basılır.
  const yazabilir = useYazabilir() && teklif.durum !== 'kabul' && teklif.durum !== 'red' && teklif.durum !== 'siparis';
  const [taslak, taslakYaz] = useState<TeklifFormuMetni | null>(null);
  const [gorunum, gorunumYaz] = useState<'duzen' | 'kagit'>('kagit');
  // 3794: dar ekranda küçülen kâğıt okunmazsa gerçek boyutta açılır, yana kaydırılır.
  const [buyuk, buyukYaz] = useState(false);
  const [kaydediliyor, kaydediliyorYaz] = useState(false);
  const [onay, onayYaz] = useState<'kapat' | 'sifirla' | null>(null);
  // Kayıtlı metin varsa o, yoksa seçilen şablon; şablon seçimi kayıtlı metnin yerine o şablonu taslak yapar.
  const kayitli = veri.data?.metin ?? null;
  const sablonMetni: TeklifFormuMetni | null = sablon === null ? null : { dil: sablon.dil, icerik: sablon.icerik };
  const taban = kayitli ?? sablonMetni;
  const metin = taslak ?? taban;
  const kaydedilmedi = taslak !== null && !ayni(taslak, taban);
  const icerikYaz = (p: Partial<TeklifFormuIcerigi>) => { if (metin !== null) taslakYaz({ dil: metin.dil, icerik: { ...kopya(metin).icerik, ...p } }); };
  const sablonSec = (id: number) => {
    sablonIdYaz(id);
    const s = sablonlar.find((x) => x.id === id);
    taslakYaz(s === undefined || kayitli === null ? null : kopya({ dil: s.dil, icerik: s.icerik }));
  };
  const metniYaz = async (yeni: TeklifFormuMetni | null, iletisi: string) => {
    kaydediliyorYaz(true);
    try {
      const cevap = await korumali<TeklifAyrintiCevabi>(`/siparisler/teklifler/${String(teklif.id)}/form-metni-kaydet`, { surum: teklif.surum, metin: yeni });
      istemci.setQueryData(anahtarlar.teklif(teklif.id), cevap);
      await istemci.invalidateQueries({ queryKey: ['siparisler', 'teklif', 'form', teklif.id] });
      taslakYaz(null);
      bildir('tamam', iletisi);
    } catch (h) {
      bildir('hata', yazmaIletisi(h, 'Form metni kaydedilemedi.'));
      eskiyseYenile(istemci, anahtarlar.teklif(teklif.id), h);
    } finally {
      kaydediliyorYaz(false);
    }
  };
  const baslikBos = metin !== null && metin.icerik.baslik.trim() === '';
  const kapatIste = () => { if (kaydedilmedi) onayYaz('kapat'); else kapat(); };
  const gizliAna = metin === null ? [] : ANA_ALANLAR.filter((k) => !alanBasilir(metin.icerik, k)).map((k) => alanEtiketi(metin.icerik, k, metin.dil));
  const kayit = veri.data === undefined || metin === null ? undefined : {
    musteriUnvan: veri.data.musteri.ad, musteriAdres: veri.data.musteri.adres, musteriVergiDairesi: veri.data.musteri.vergiDairesi,
    musteriVergiNo: veri.data.musteri.vergiNo, teklifTur: FORM_SOZLERI[metin.dil].satisTeklifi, teklifKonu: teklif.baslik,
  };

  const formVerisi = useMemo<FormVerisi | null>(() => {
    if (!veri.data) return null;
    const fiyat = new Map(surum.fiyatlar.map((f) => [f.satirId, f]));
    return {
      no: teklif.no, surumNo: surum.surumNo, tarih: surum.olusturma, gecerlilik: surum.gecerlilik, baslik: teklif.baslik, paraBirimi: teklif.paraBirimi,
      teslimGun: surum.teslimGun, terminTarihi: surum.terminTarihi, odemeKosulu: surum.odemeKosulu, iskontoOrani: surum.iskontoOrani,
      satirlar: teklif.satirlar.map((s) => ({
        id: s.id, kod: s.malzemeKodu, ad: s.tanim, miktar: s.miktar, birim: s.birim, yerlilik: s.yerlilikOrani,
        birimFiyat: fiyat.get(s.id)?.birimFiyat ?? null, iskontoluFiyat: fiyat.get(s.id)?.iskontoluFiyat ?? null, tutar: fiyat.get(s.id)?.tutar ?? null,
      })),
      musteri: veri.data.musteri, ilgili,
      toplam: {
        araToplam: veri.data.araToplam, iskontoTutari: veri.data.iskontoTutari, kdvHaric: veri.data.kdvHaric,
        kdvOrani: veri.data.kdvOrani, kdvTutari: veri.data.kdvTutari, genelToplam: veri.data.genelToplam,
      },
    };
  }, [veri.data, teklif, surum, ilgili]);

  // PDF'in dosya adı belge başlığından gelir; basım bitince eski başlık döner.
  useEffect(() => {
    const eski = document.title;
    const bitti = () => { document.title = eski; };
    window.addEventListener('afterprint', bitti);
    return () => { window.removeEventListener('afterprint', bitti); bitti(); };
  }, []);
  const yazdir = () => {
    document.title = `${teklif.no}-S${String(surum.surumNo)}`;
    window.print();
  };

  const hazir = metin !== null && formVerisi !== null && ayar.data !== undefined;
  const kagitOzellikleri = hazir ? { dil: metin.dil, icerik: metin.icerik, kurum: ayar.data.kurum, logo: logo.data?.logo ?? null, veri: formVerisi } : null;
  const kutu = useRef<HTMLDivElement>(null);
  const kagit = useRef<HTMLElement>(null);
  useKagitOlcegi(kutu, kagit, acik && kagitOzellikleri !== null);

  return (
    <Pencere
      acik={acik}
      kapat={kapatIste}
      baslik={`Teklif formu · ${teklif.no} · Sürüm ${String(surum.surumNo)}`}
      tur={yazabilir ? 'tam' : 'yan'}
      genis
      alt={(
        <>
          <Dugme onClick={kapatIste}>Kapat</Dugme>
          {yazabilir && (
            <Dugme tur={kaydedilmedi ? 'birincil' : 'ikincil'} simge="check" disabled={!kaydedilmedi || baslikBos || metin === null} yukleniyor={kaydediliyor}
              onClick={() => { if (metin !== null) void metniYaz(metin, 'Form metni bu teklif için kaydedildi.'); }}>
              Bu teklif için kaydet
            </Dugme>
          )}
          <Dugme tur={yazabilir && kaydedilmedi ? 'ikincil' : 'birincil'} simge="printer" onClick={yazdir} disabled={!hazir || veri.isFetching || kdvOrani === null}>Yazdır / PDF</Dugme>
        </>
      )}
    >
      <div className={yazabilir ? 'tc-sp-yigin tc-tf-pencere-govde' : 'tc-sp-yigin'}>
        <div className="tc-tf-arac">
          <Secim
            etiket="Şablon"
            secenekler={sablonlar.map((s) => ({ deger: String(s.id), baslik: s.varsayilan ? `${s.ad} (varsayılan)` : s.ad }))}
            value={sablon === null ? '' : String(sablon.id)}
            onChange={(o) => sablonSec(Number(o.target.value))}
            disabled={sablonlar.length === 0}
          />
          <Girdi etiket="İlgili kişi" ipucu="İsteğe bağlı; kaydedilmez." autoComplete="off" maxLength={80} value={ilgili} onChange={(o) => ilgiliYaz(o.target.value)} />
          <Girdi
            etiket="KDV oranı (%)"
            inputMode="decimal"
            autoComplete="off"
            value={kdvGirdi}
            {...(surum.kdvOrani === null || formKdvSapti ? {} : { ipucu: `Teklifte %${surumKdv}; burada değiştirmek teklifi değiştirmez.` })}
            onChange={(o) => kdvGirdiYaz(o.target.value)}
            hata={kdvOrani === null ? 'KDV oranı 0 ile 100 arasında, en çok iki ondalıklı bir sayıdır.' : undefined}
          />
        </div>
        {formKdvSapti && (
          <p className="tc-sp-bildirim tc-sp-bildirim-uyari" role="status">{`Bu formda %${kdvGirdi.trim()} yazacak; teklif sürümünde %${surumKdv}.`}</p>
        )}
        {ayar.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(ayar.error, 'Form şablonları alınamadı')} yenile={() => { void ayar.refetch(); }} />}
        {veri.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(veri.error, 'Form verisi alınamadı')} yenile={() => { void veri.refetch(); }} />}
        {!ayar.isError && !veri.isError && kagitOzellikleri === null && <DurumKutusu durum="yukleniyor" />}
        {kagitOzellikleri !== null && metin !== null && (
          <div className={yazabilir ? 'tc-tf-duzen tc-tf-pencere-duzen' : undefined} data-gorunum={gorunum}>
            {yazabilir && (
              <>
                <div className="tc-tf-pencere-sekme"><Sekmeler etiket="Form görünümü" sekmeler={SEKMELER} secili={gorunum} sec={gorunumYaz} /></div>
                <div className="tc-tf-sutun tc-tf-pencere-alanlar">
                  <Kart baslik="Metin" simge="edit">
                    {kayitli !== null && !kaydedilmedi && <p><Rozet ton="bilgi">Bu teklife özel metin kayıtlı</Rozet></p>}
                    {kaydedilmedi && <p><Rozet ton="uyari">Kaydedilmedi</Rozet></p>}
                    <p className="tc-tf-ipucu">Kaydedince yalnız bu teklifin formu değişir. Bütün yeni teklifler için: Sistem Ayarları › Formlar › Teklif formu. Kalem, fiyat ve koşullar tekliften gelir.</p>
                    <FormMetniAlanlari icerik={metin.icerik} degistir={icerikYaz} />
                  </Kart>
                  <Kart baslik="Alanlar" simge="layers">
                    <AlanPaneli icerik={metin.icerik} dil={metin.dil} degistir={icerikYaz} {...(kayit === undefined ? {} : { kayit })} />
                  </Kart>
                  <Kart baslik={`Şartlar (${String(metin.icerik.sartlar.length)})`} simge="list">
                    <SartAlanlari icerik={metin.icerik} degistir={icerikYaz} />
                  </Kart>
                  {(kayitli !== null || kaydedilmedi) && (
                    <div className="tc-tf-arac">
                      <Dugme simge="rotate" yukleniyor={kaydediliyor && kayitli !== null} onClick={() => onayYaz('sifirla')}>
                        Şablona sıfırla
                      </Dugme>
                    </div>
                  )}
                </div>
              </>
            )}
            <div className="tc-tf-onizleme tc-tf-sutun">
              <div className="tc-tf-buyut"><Dugme simge={buyuk ? 'fit' : 'zin'} aria-pressed={buyuk} onClick={() => buyukYaz((b) => !b)}>{buyuk ? 'Sığdır' : 'Büyüt'}</Dugme></div>
              <div ref={kutu} className="tc-tf-kutu-olcek" data-buyuk={buyuk || undefined}>
                <TeklifFormuKagidi ref={kagit} {...kagitOzellikleri} />
              </div>
              {gizliAna.length > 0 && <p className="tc-tf-sessiz-not" role="status">{`Gizli: ${gizliAna.join(', ')}. Form müşteriye bu hâliyle gider.`}</p>}
              <p className="tc-tf-ipucu">PDF için basım penceresinde hedef olarak “PDF olarak kaydet” seçilir.</p>
            </div>
          </div>
        )}
      </div>
      <OnayPenceresi
        acik={onay === 'kapat'}
        baslik="Kaydedilmemiş değişiklik var"
        onayMetni="Kaydetmeden kapat"
        tehlikeli
        onayla={() => { onayYaz(null); taslakYaz(null); kapat(); }}
        vazgec={() => onayYaz(null)}
      >
        <p>Bu teklifin formunda yaptığınız değişiklikler kaybolur.</p>
      </OnayPenceresi>
      <OnayPenceresi
        acik={onay === 'sifirla'}
        baslik="Şablona sıfırlansın mı?"
        onayMetni="Şablona sıfırla"
        tehlikeli
        yukleniyor={kaydediliyor}
        onayla={() => { onayYaz(null); if (kayitli === null) taslakYaz(null); else void metniYaz(null, 'Form şablona döndü.'); }}
        vazgec={() => onayYaz(null)}
      >
        <p>Bu teklife özel metin, alan etiketleri, gizlenen ve kaldırılan alanlar silinir; form seçili şablonla basılır.</p>
      </OnayPenceresi>
      {acik && kagitOzellikleri !== null && createPortal(<div className="tc-tf-baski"><TeklifFormuKagidi {...kagitOzellikleri} /></div>, document.body)}
    </Pencere>
  );
}
