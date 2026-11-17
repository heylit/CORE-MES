import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TeklifFormuCevabi, TeklifFormuDili, TeklifFormuIcerigi, TeklifFormuKurumu, TeklifFormuSablonu } from '#paylasilan/sozlesme/siparisler.ts';
import { CokSatir, DurumKutusu, Dugme, Girdi, Kart, Pencere, Rozet, Secim, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useKurumLogosu } from '../../ortak/veri/kurum-logosu.ts';
import { anahtarlar } from './anahtarlar.ts';
import { TeklifFormuKagidi, type FormVerisi } from './TeklifFormuKagidi.tsx';
import { FormMetniAlanlari, SartAlanlari } from './FormMetniAlanlari.tsx';
import { useKagitOlcegi } from './teklif-formu.ts';
import { surumCakismasiMi, yazmaIletisi } from './yazma.ts';
import './teklif-formu.css';

interface Taslak { ad: string; dil: TeklifFormuDili; icerik: TeklifFormuIcerigi }

const DILLER = [{ deger: 'tr', baslik: 'Türkçe' }, { deger: 'en', baslik: 'İngilizce' }] as const;

// Önizlemenin örnek teklifi: uydurma veri; gerçek teklif formu penceresinde basılır.
const ORNEK: FormVerisi = {
  no: 'ORN-T-0001', surumNo: 2, tarih: '2026-01-15', gecerlilik: '2026-02-14', baslik: 'ORN- flanş ve mil işleme', paraBirimi: 'TRY',
  teslimGun: 21, terminTarihi: null, odemeKosulu: '30 gün vadeli', iskontoOrani: '5.00',
  satirlar: [
    { id: 1, kod: 'ORN-MLZ-101', ad: 'ORN- flanş Ø120', miktar: '50.000', birim: 'adet', birimFiyat: '420.0000', iskontoluFiyat: '399.0000', tutar: '19950.00' },
    { id: 2, kod: 'ORN-MLZ-102', ad: 'ORN- mil Ø40 x 300', miktar: '120.000', birim: 'adet', birimFiyat: '185.5000', iskontoluFiyat: '176.2250', tutar: '21147.00' },
    { id: 3, kod: null, ad: 'ORN- burç (kartsız kalem)', miktar: '200.000', birim: 'adet', birimFiyat: '42.0000', iskontoluFiyat: '39.9000', tutar: '7980.00' },
  ],
  musteri: { ad: 'ORN- Makine A.Ş.', adres: 'ORN- Sanayi Mah. 1. Cad. No: 1\nORN- İlçe / ORN- İl', vergiDairesi: 'ORN- Vergi Dairesi', vergiNo: '0000000000' },
  ilgili: '',
  toplam: { araToplam: '51660.00', iskontoTutari: '2583.00', kdvHaric: '49077.00', kdvOrani: '20', kdvTutari: '9815.40', genelToplam: '58892.40' },
};

const BOS_BELGE = { no: '', yayin: '', revTarihi: '', revNo: '' };

const taslakOf = (s: TeklifFormuSablonu): Taslak => ({ ad: s.ad, dil: s.dil, icerik: { ...s.icerik, sartlar: [...s.icerik.sartlar] } });
const ayni = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// Sistem Ayarları > Formlar > Teklif formu (3245 d): şablon kütüphanesi, firma bilgileri, metinler ve şartlar; sağda canlı önizleme.
// Logo Sistem Ayarları > Genel'deki kurum logosudur; burada yalnız gösterilir.
export function TeklifFormuAyari() {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const ayar = useQuery({ queryKey: anahtarlar.teklifFormuAyari, queryFn: () => api.get<TeklifFormuCevabi>('/siparisler/teklif-formu') });
  const logo = useKurumLogosu();
  const [seciliId, seciliIdYaz] = useState<number | null>(null);
  const [taslaklar, taslaklarYaz] = useState<Record<number, Taslak>>({});
  const [kurumTaslak, kurumTaslakYaz] = useState<TeklifFormuKurumu | null>(null);
  const [kopyaAdi, kopyaAdiYaz] = useState<string | null>(null);
  const [hata, hataYaz] = useState<string | null>(null);

  const kutu = useRef<HTMLDivElement>(null);
  const kagit = useRef<HTMLElement>(null);
  useKagitOlcegi(kutu, kagit, ayar.data !== undefined);

  const yerineKoy = (cevap: TeklifFormuCevabi) => { istemci.setQueryData(anahtarlar.teklifFormuAyari, cevap); };
  const hataDurumu = (h: Error, varsayilan: string) => {
    const metin = yazmaIletisi(h, varsayilan);
    hataYaz(metin);
    bildir('hata', metin);
    if (surumCakismasiMi(h)) void istemci.invalidateQueries({ queryKey: anahtarlar.teklifFormuAyari });
  };

  const sablonKaydet = useMutation({
    mutationFn: ({ id, surum, t }: { id: number; surum: number; t: Taslak }) => api.post<TeklifFormuCevabi>(`/siparisler/teklif-formu/sablonlar/${String(id)}/kaydet`, { surum, ...t }),
    onSuccess: (cevap, { id }) => { yerineKoy(cevap); taslaklarYaz(({ [id]: _, ...geri }) => geri); hataYaz(null); bildir('tamam', 'Şablon kaydedildi.'); },
    onError: (h) => hataDurumu(h, 'Şablon kaydedilemedi.'),
  });
  const kopyala = useMutation({
    mutationFn: ({ id, ad }: { id: number; ad: string }) => api.post<TeklifFormuCevabi>(`/siparisler/teklif-formu/sablonlar/${String(id)}/kopyala`, { ad }),
    onSuccess: (cevap, { ad }) => {
      yerineKoy(cevap);
      const yeni = cevap.sablonlar.find((s) => s.ad === ad.trim());
      if (yeni) seciliIdYaz(yeni.id);
      kopyaAdiYaz(null);
      hataYaz(null);
      bildir('tamam', 'Şablon kopyalandı.');
    },
    onError: (h) => hataDurumu(h, 'Şablon kopyalanamadı.'),
  });
  const varsayilanYap = useMutation({
    mutationFn: ({ id, surum }: { id: number; surum: number }) => api.post<TeklifFormuCevabi>(`/siparisler/teklif-formu/sablonlar/${String(id)}/varsayilan-yap`, { surum }),
    onSuccess: (cevap) => { yerineKoy(cevap); hataYaz(null); bildir('tamam', 'Varsayılan şablon değişti.'); },
    onError: (h) => hataDurumu(h, 'Varsayılan değiştirilemedi.'),
  });
  const kurumKaydet = useMutation({
    mutationFn: ({ surum, kurum }: { surum: number; kurum: TeklifFormuKurumu }) => api.post<TeklifFormuCevabi>('/siparisler/teklif-formu/kurum/kaydet', { surum, kurum }),
    onSuccess: (cevap) => { yerineKoy(cevap); kurumTaslakYaz(null); hataYaz(null); bildir('tamam', 'Firma bilgileri kaydedildi.'); },
    onError: (h) => hataDurumu(h, 'Firma bilgileri kaydedilemedi.'),
  });

  if (ayar.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (ayar.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(ayar.error, 'Form şablonları alınamadı')} yenile={() => { void ayar.refetch(); }} />;
  const { sablonlar } = ayar.data;
  const sablon = sablonlar.find((s) => s.id === seciliId) ?? sablonlar.find((s) => s.varsayilan) ?? sablonlar[0];
  if (sablon === undefined) return <DurumKutusu durum="bos" mesaj="Şablon yok." />;

  const kayitli = taslakOf(sablon);
  const taslak = taslaklar[sablon.id] ?? kayitli;
  const degisti = !ayni(taslak, kayitli);
  const taslakYaz = (f: (t: Taslak) => Taslak) => taslaklarYaz((h) => ({ ...h, [sablon.id]: f(h[sablon.id] ?? kayitli) }));
  const icerikYaz = (parca: Partial<TeklifFormuIcerigi>) => taslakYaz((t) => ({ ...t, icerik: { ...t.icerik, ...parca } }));
  const belge = taslak.icerik.belge ?? BOS_BELGE;
  const belgeYaz = (alan: keyof typeof BOS_BELGE, deger: string) => icerikYaz({ belge: { ...belge, [alan]: deger } });
  const adHatasi = taslak.ad.trim() === '' ? 'Şablon adı boş olamaz.' : undefined;
  const baslikHatasi = taslak.icerik.baslik.trim() === '' ? 'Form başlığı boş olamaz.' : undefined;

  const kurum = kurumTaslak ?? ayar.data.kurum;
  const kurumDegisti = kurumTaslak !== null && !ayni(kurumTaslak, ayar.data.kurum);
  const kurumAlanYaz = (alan: keyof TeklifFormuKurumu, deger: string) => kurumTaslakYaz({ ...kurum, [alan]: deger });

  return (
    <div className="tc-tf-duzen">
      <div className="tc-tf-sutun">
        <Kart baslik="Şablonlar" simge="layers">
          <ul className="tc-tf-sablonlar">
            {sablonlar.map((s) => (
              <li key={s.id}>
                <button type="button" className="tc-tf-sablon" aria-pressed={s.id === sablon.id} onClick={() => { seciliIdYaz(s.id); hataYaz(null); }}>
                  <span className="tc-tf-sablon-ad">
                    <strong>{s.ad}</strong>
                    <small>{`${s.dil === 'en' ? 'İngilizce' : 'Türkçe'} · ${String(s.icerik.sartlar.length)} şart`}</small>
                  </span>
                  {s.varsayilan && <Rozet ton="tamam">Varsayılan</Rozet>}
                  {taslaklar[s.id] !== undefined && !ayni(taslaklar[s.id], taslakOf(s)) && <Rozet ton="uyari">Kaydedilmedi</Rozet>}
                </button>
              </li>
            ))}
          </ul>
          <div className="tc-tf-arac">
            <Dugme simge="layers" onClick={() => kopyaAdiYaz(`${sablon.ad} (kopya)`.slice(0, 80))}>Kopyala</Dugme>
            {!sablon.varsayilan && (
              <Dugme simge="check" yukleniyor={varsayilanYap.isPending} onClick={() => varsayilanYap.mutate({ id: sablon.id, surum: sablon.surum })}>Varsayılan yap</Dugme>
            )}
          </div>
        </Kart>

        <Kart baslik="Firma bilgileri" simge="building">
          <p className="tc-tf-ipucu">Bütün şablonların antetinde basılır. Logo, Sistem Ayarları › Genel’deki kurum logosudur.</p>
          <Girdi etiket="Ünvan" autoComplete="off" maxLength={200} value={kurum.unvan} onChange={(o) => kurumAlanYaz('unvan', o.target.value)} />
          <CokSatir etiket="Adres" rows={2} maxLength={400} value={kurum.adres} onChange={(o) => kurumAlanYaz('adres', o.target.value)} />
          <div className="tc-tf-iki">
            <Girdi etiket="Telefon" autoComplete="off" maxLength={60} value={kurum.telefon} onChange={(o) => kurumAlanYaz('telefon', o.target.value)} />
            <Girdi etiket="E-posta" autoComplete="off" maxLength={120} value={kurum.eposta} onChange={(o) => kurumAlanYaz('eposta', o.target.value)} />
          </div>
          <Girdi etiket="Vergi dairesi ve no" autoComplete="off" maxLength={120} value={kurum.vergi} onChange={(o) => kurumAlanYaz('vergi', o.target.value)} />
          <div className="tc-tf-arac">
            <Dugme
              tur="birincil"
              simge="check"
              disabled={!kurumDegisti}
              yukleniyor={kurumKaydet.isPending}
              onClick={() => kurumKaydet.mutate({ surum: ayar.data.kurumSurum, kurum })}
            >
              Firma bilgilerini kaydet
            </Dugme>
            {kurumDegisti && <Dugme onClick={() => kurumTaslakYaz(null)}>Vazgeç</Dugme>}
          </div>
        </Kart>

        <Kart baslik="Metinler" simge="edit">
          <div className="tc-tf-iki">
            <Girdi etiket="Şablon adı" required autoComplete="off" maxLength={80} value={taslak.ad} hata={adHatasi} onChange={(o) => taslakYaz((t) => ({ ...t, ad: o.target.value }))} />
            <Secim etiket="Dil" secenekler={DILLER} value={taslak.dil} onChange={(o) => taslakYaz((t) => ({ ...t, dil: o.target.value === 'en' ? 'en' : 'tr' }))} />
          </div>
          <FormMetniAlanlari icerik={taslak.icerik} degistir={icerikYaz} />
        </Kart>

        <Kart baslik="Doküman kutusu" simge="file">
          <p className="tc-tf-ipucu">Kalite sisteminin doküman bilgisi; antetin sağında basılır. Hepsi boşsa kutu basılmaz.</p>
          <div className="tc-tf-iki">
            <Girdi etiket="Doküman no" autoComplete="off" maxLength={40} value={belge.no} onChange={(o) => belgeYaz('no', o.target.value)} />
            <Girdi etiket="Yayın tarihi" autoComplete="off" maxLength={40} value={belge.yayin} onChange={(o) => belgeYaz('yayin', o.target.value)} />
          </div>
          <div className="tc-tf-iki">
            <Girdi etiket="Revizyon tarihi" autoComplete="off" maxLength={40} value={belge.revTarihi} onChange={(o) => belgeYaz('revTarihi', o.target.value)} />
            <Girdi etiket="Revizyon no" autoComplete="off" maxLength={20} value={belge.revNo} onChange={(o) => belgeYaz('revNo', o.target.value)} />
          </div>
        </Kart>

        <Kart baslik={`Şartlar (${String(taslak.icerik.sartlar.length)})`} simge="list">
          <SartAlanlari icerik={taslak.icerik} degistir={icerikYaz} />
        </Kart>

        {hata !== null && <p className="tc-sp-hata" role="alert">{hata}</p>}
        <div className="tc-tf-arac">
          <Dugme
            tur="birincil"
            simge="check"
            disabled={!degisti || adHatasi !== undefined || baslikHatasi !== undefined}
            yukleniyor={sablonKaydet.isPending}
            onClick={() => sablonKaydet.mutate({ id: sablon.id, surum: sablon.surum, t: taslak })}
          >
            Şablonu kaydet
          </Dugme>
          {degisti && <Dugme simge="rotate" onClick={() => taslaklarYaz(({ [sablon.id]: _, ...geri }) => geri)}>Kaydedilene dön</Dugme>}
        </div>
      </div>

      <div className="tc-tf-onizleme">
        <Kart baslik="Önizleme" simge="eye" sag={<span className="tc-tf-ipucu">Örnek teklif (ORN-)</span>}>
          <div ref={kutu} className="tc-tf-kutu-olcek">
            <TeklifFormuKagidi ref={kagit} dil={taslak.dil} icerik={taslak.icerik} kurum={kurum} logo={logo.data?.logo ?? null} veri={ORNEK} />
          </div>
        </Kart>
      </div>

      <Pencere
        acik={kopyaAdi !== null}
        kapat={() => kopyaAdiYaz(null)}
        baslik="Şablonu kopyala"
        alt={(
          <>
            <Dugme onClick={() => kopyaAdiYaz(null)} disabled={kopyala.isPending}>Vazgeç</Dugme>
            <Dugme tur="birincil" simge="layers" yukleniyor={kopyala.isPending} disabled={(kopyaAdi ?? '').trim() === ''} onClick={() => kopyala.mutate({ id: sablon.id, ad: kopyaAdi ?? '' })}>Kopyala</Dugme>
          </>
        )}
      >
        <Girdi etiket="Yeni şablonun adı" required autoComplete="off" maxLength={80} value={kopyaAdi ?? ''} onChange={(o) => kopyaAdiYaz(o.target.value)} />
      </Pencere>
    </div>
  );
}
