import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TeklifFormuCevabi, TeklifFormuDili, TeklifFormuIcerigi, TeklifFormuKurumu, TeklifFormuSablonu } from '#paylasilan/sozlesme/siparisler.ts';
import { CokSatir, DurumKutusu, Dugme, Girdi, Kart, Pencere, Rozet, Secim, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useKurumLogosu } from '../../ortak/veri/kurum-logosu.ts';
import { anahtarlar } from './anahtarlar.ts';
import { TeklifFormuKagidi, type FormVerisi } from './TeklifFormuKagidi.tsx';
import { FORM_ALANLARI, SART_EN_COK, useKagitOlcegi } from './teklif-formu.ts';
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
  musteri: { ad: 'ORN- Makine A.Ş.', adres: 'ORN- Sanayi Mah. 1. Cad. No: 1\nORN- İlçe / ORN- İl', vergiNo: 'ORN-VD 0000000000' },
  ilgili: '',
  toplam: { araToplam: '51660.00', iskontoTutari: '2583.00', kdvHaric: '49077.00', kdvOrani: '20', kdvTutari: '9815.40', genelToplam: '58892.40' },
};

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
  const [yeniSart, yeniSartYaz] = useState('');
  const [imlec, imlecYaz] = useState<{ alan: 'giris' | 'alt'; konum: number } | null>(null);
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
  const adHatasi = taslak.ad.trim() === '' ? 'Şablon adı boş olamaz.' : undefined;
  const baslikHatasi = taslak.icerik.baslik.trim() === '' ? 'Form başlığı boş olamaz.' : undefined;

  const kurum = kurumTaslak ?? ayar.data.kurum;
  const kurumDegisti = kurumTaslak !== null && !ayni(kurumTaslak, ayar.data.kurum);
  const kurumAlanYaz = (alan: keyof TeklifFormuKurumu, deger: string) => kurumTaslakYaz({ ...kurum, [alan]: deger });

  const alanEkle = (alan: string) => {
    const hedef = imlec?.alan ?? 'giris';
    const metin = taslak.icerik[hedef];
    const konum = Math.min(imlec?.konum ?? metin.length, metin.length);
    icerikYaz({ [hedef]: `${metin.slice(0, konum)}${alan}${metin.slice(konum)}` });
    imlecYaz({ alan: hedef, konum: konum + alan.length });
  };
  const sartTasi = (i: number, yon: -1 | 1) => {
    const s = [...taslak.icerik.sartlar];
    const j = i + yon;
    if (j < 0 || j >= s.length) return;
    [s[i], s[j]] = [s[j] ?? '', s[i] ?? ''];
    icerikYaz({ sartlar: s });
  };
  const sartEkle = () => {
    const metin = yeniSart.trim();
    if (metin === '' || taslak.icerik.sartlar.length >= SART_EN_COK) return;
    icerikYaz({ sartlar: [...taslak.icerik.sartlar, metin] });
    yeniSartYaz('');
  };
  const imlecTut = (alan: 'giris' | 'alt') => (o: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => imlecYaz({ alan, konum: o.currentTarget.selectionStart ?? o.currentTarget.value.length });

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
          <Girdi etiket="Form başlığı" required autoComplete="off" maxLength={80} value={taslak.icerik.baslik} hata={baslikHatasi} onChange={(o) => icerikYaz({ baslik: o.target.value })} />
          <CokSatir
            etiket="Giriş metni"
            ipucu="Boş bırakılırsa basılmaz."
            rows={4}
            maxLength={1000}
            value={taslak.icerik.giris}
            onChange={(o) => { icerikYaz({ giris: o.target.value }); imlecTut('giris')(o); }}
            onSelect={imlecTut('giris')}
          />
          <div className="tc-tf-cipler" role="group" aria-label="Alan ekle">
            {FORM_ALANLARI.map((a) => <button key={a} type="button" className="tc-tf-cip" onClick={() => alanEkle(a)}>{a}</button>)}
          </div>
          <p className="tc-tf-ipucu">Alan, imlecin durduğu yere eklenir; basarken teklifin bilgisiyle dolar.</p>
          <div className="tc-tf-iki">
            <Girdi etiket="İmza 1 (firma)" autoComplete="off" maxLength={60} value={taslak.icerik.imza1} onChange={(o) => icerikYaz({ imza1: o.target.value })} />
            <Girdi etiket="İmza 2 (müşteri)" autoComplete="off" maxLength={60} value={taslak.icerik.imza2} onChange={(o) => icerikYaz({ imza2: o.target.value })} />
          </div>
          <Girdi
            etiket="Alt bilgi"
            autoComplete="off"
            maxLength={200}
            value={taslak.icerik.alt}
            onChange={(o) => { icerikYaz({ alt: o.target.value }); imlecTut('alt')(o); }}
            onSelect={imlecTut('alt')}
          />
        </Kart>

        <Kart baslik={`Şartlar (${String(taslak.icerik.sartlar.length)})`} simge="list">
          {taslak.icerik.sartlar.length > 0 && (
            <ol className="tc-tf-sartlar-liste">
              {taslak.icerik.sartlar.map((s, i) => (
                <li key={`${String(i)}-${s}`}>
                  <span>{s}</span>
                  <Dugme simge="up" aria-label={`${String(i + 1)}. şartı yukarı al`} disabled={i === 0} onClick={() => sartTasi(i, -1)} />
                  <Dugme simge="down" aria-label={`${String(i + 1)}. şartı aşağı al`} disabled={i === taslak.icerik.sartlar.length - 1} onClick={() => sartTasi(i, 1)} />
                  <Dugme simge="trash" aria-label={`${String(i + 1)}. şartı sil`} onClick={() => icerikYaz({ sartlar: taslak.icerik.sartlar.filter((_, j) => j !== i) })} />
                </li>
              ))}
            </ol>
          )}
          <div className="tc-tf-ekle">
            <Girdi
              etiket="Yeni şart"
              autoComplete="off"
              maxLength={300}
              value={yeniSart}
              onChange={(o) => yeniSartYaz(o.target.value)}
              onKeyDown={(o) => { if (o.key === 'Enter') { o.preventDefault(); sartEkle(); } }}
            />
            <Dugme simge="plus" onClick={sartEkle} disabled={yeniSart.trim() === '' || taslak.icerik.sartlar.length >= SART_EN_COK}>Ekle</Dugme>
          </div>
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
