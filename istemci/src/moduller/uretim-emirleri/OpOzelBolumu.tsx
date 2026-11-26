import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { AdimDurumuCevabi, HazirlikSablonuCevabi, OpSablonFarkiGovdesi, OpSablonFarklariCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { CokSatir, Dugme, Girdi, Rozet, Secim, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi, yenidenDenenebilirMi } from '../../ortak/veri/istek-kimligi.ts';
import { tarihSaatMetni } from '../../ortak/veri/zaman-metni.ts';
import { adimDurumuUcu, isEmriKomutu } from './adim-durumu.ts';
import { useAdimKomutu } from './adim-komutu.ts';
import { kaldirKomutu, kaldirilir } from './adim-tablosu.ts';
import { anahtarlar } from './anahtarlar.ts';
import { maddeGorunumu, useHazirlikMaddeleri } from './hazirlik-maddeleri.ts';
import { maddeAdiVarMi } from './op-ozel.ts';

// 3741: "Bu OP'ye özel". Yalnız bu emrin bu operasyonuna yazılır; operasyon türünün şablonu ve emir düzeyindeki fark değişmez.
// Şablon dışı madde mevcut liste uçlarıyla (liste-ekle, liste-kaldir; yetki adim-durumu-yaz), şablon maddesini bu OP'de gerekli/gerekmez yapmak
// ise sablon-farki uçlarıyla (yetki emre özel farkla aynı: projeler.sablon-yaz). Yetkiyi sunucu denetler; ekran yalnız düğmeyi gizler.
interface Ozellikler {
  emirId: number;
  isEmriId: number;
  // Adım Durumu yazma yetkisi ve açık emir (matristen gelir).
  duzenler: boolean;
  // Bu OP'nin şimdiki madde hâlleri (matristen): seçim listesi yalnız hâli değişecek maddeleri sunar.
  maddeler: readonly { madde: string; hal: string }[];
  yenile: () => Promise<void>;
}

export function OpOzelBolumu({ emirId, isEmriId, duzenler, maddeler: opMaddeleri, yenile }: Ozellikler) {
  const { bildir } = useBildirim();
  const d = useQuery({ queryKey: anahtarlar.adimDurumu(emirId), queryFn: () => api.get<AdimDurumuCevabi>(adimDurumuUcu(emirId)) });
  const sablon = useQuery({ queryKey: ['uretim-emirleri', 'hazirlik-sablonu'], queryFn: () => api.get<HazirlikSablonuCevabi>('/hazirlik-sablonu') });
  const maddeler = useHazirlikMaddeleri();
  const gorunum = maddeGorunumu(maddeler.data?.maddeler);
  const komut = useAdimKomutu(emirId, isEmriId, () => undefined);
  const [ad, adYaz] = useState('');
  const [silinecek, silinecekYaz] = useState<number | null>(null);
  const [madde, maddeYaz] = useState('');
  const [gerekli, gerekliYaz] = useState('hayir');
  const [gerekce, gerekceYaz] = useState('');
  const sonra = () => { void yenile(); };

  // Fark yazma ve geri alma tekrar korumalıdır: sonucu bilinmeyen hatadan sonra aynı kimlik, reddedilenden sonra yeni kimlik.
  const yazKimlik = useRef<string | null>(null);
  const donKimlik = useRef<string | null>(null);
  const farkYaz = useMutation({
    mutationFn: (g: OpSablonFarkiGovdesi) => {
      yazKimlik.current ??= yeniIstekKimligi();
      return api.post<OpSablonFarklariCevabi>(isEmriKomutu(emirId, isEmriId, 'sablon-farki'), g, { istekKimligi: yazKimlik.current });
    },
    onSuccess: async () => {
      yazKimlik.current = null;
      bildir('tamam', 'Bu OP için şablon farkı yazıldı.');
      gerekceYaz('');
      maddeYaz('');
      await yenile();
    },
    onError: (x) => { if (!yenidenDenenebilirMi(x)) yazKimlik.current = null; bildir('hata', hataIletisi(x, 'Fark yazılmadı.')); },
  });
  const farkDon = useMutation({
    mutationFn: (m: string) => {
      donKimlik.current ??= yeniIstekKimligi();
      return api.post<OpSablonFarklariCevabi>(isEmriKomutu(emirId, isEmriId, 'sablon-farki-kaldir'), { madde: m }, { istekKimligi: donKimlik.current });
    },
    onSuccess: async () => { donKimlik.current = null; bildir('tamam', 'Şablona dönüldü.'); await yenile(); },
    onError: (x) => { if (!yenidenDenenebilirMi(x)) donKimlik.current = null; bildir('hata', hataIletisi(x, 'Şablona dönülemedi.')); },
  });

  // Cevap önbellekte komut cevaplarıyla da güncellenir; biçimi bozuk bir cevap bölümü düşürmez, "okunamadı" gösterir.
  const adimlar = d.data?.adimlar as AdimDurumuCevabi['adimlar'] | undefined;
  const adim = adimlar?.find((a) => a.isEmriId === isEmriId);
  if (d.isPending) return <section className="tc-am-bolum tc-am-ozel" aria-label="Bu OP'ye özel"><h4>Bu OP&apos;ye özel</h4><p className="tc-emir-not">Yükleniyor…</p></section>;
  if (adim === undefined) {
    return <section className="tc-am-bolum tc-am-ozel" aria-label="Bu OP'ye özel"><h4>Bu OP&apos;ye özel</h4><p className="tc-emir-not">Özel maddeler okunamadı.</p></section>;
  }
  const ozeller = adim.liste.filter((m) => m.eklenme !== null);
  const sablonYazar = sablon.data?.yazar === true;
  // Biten adımın listesi ve şablon farkı değişmez (sunucu reddeder): yazma düğmeleri ve formlar çizilmez, tek not durur.
  const bitti = adim.durum === 'tamam';
  const yazar = duzenler && !bitti;
  const farkYazabilir = yazar && sablonYazar;
  // Etkisiz seçenek sunulmaz: "gerekmez" yalnız bu OP'de şimdi gerekli sayılan, "gerekli" yalnız şimdi gerekmeyen maddede anlamlıdır.
  // "Gerekmez" durduran maddede yazılmaz (sunucu reddeder).
  const opHali = new Map(opMaddeleri.map((m) => [m.madde, m.hal]));
  const secenekler = (maddeler.data?.maddeler ?? []).filter((m) => {
    if (!(m.acik || m.durduran) || !opHali.has(m.kod)) return false;
    const gerekmiyor = opHali.get(m.kod) === 'gerekmez';
    return gerekli === 'hayir' ? !gerekmiyor && !m.durduran : gerekmiyor;
  });
  const tekrar = maddeAdiVarMi(adim.liste.map((m) => m.ad), ad);
  const gecerli = madde !== '' && gerekce.trim() !== '';
  const ekle = () => {
    const a = ad.trim();
    if (a === '' || tekrar || komut.mesgul) return;
    komut.yap({ yol: 'liste-ekle', isEmriId, govde: { ad: a, asama: 'hazirlik', kontrol: { tur: 'onay' }, sablonaEkle: false }, mesaj: `Eklendi: ${a}`, sonra: () => { adYaz(''); sonra(); } });
  };
  const toplam = ozeller.length + adim.sablonFarklari.length;

  return (
    <section className="tc-am-bolum tc-am-ozel" aria-label="Bu OP'ye özel">
      <h4>Bu OP&apos;ye özel{toplam > 0 ? ` (${String(toplam)})` : ''}</h4>
      <p className="tc-emir-not">Yalnız bu emrin bu operasyonuna yazılır; operasyon türünün şablonu değişmez.</p>
      {ozeller.length > 0 && (
        <ul className="tc-am-ozel-liste" aria-label="Şablon dışı maddeler">
          {ozeller.map((m) => (
            <li key={m.adimId} className="tc-am-ozel-satir">
              <span className="tc-am-ozel-ad">
                <b>{m.ad}</b>
                <Rozet ton="pasif">Bu OP&apos;ye özel</Rozet>
                <small>{m.tamam ? 'Yapıldı' : 'Bekliyor'}{m.ekleyenAdi === null ? '' : ` · ${m.ekleyenAdi}`}{m.eklenme === null ? '' : ` · ${tarihSaatMetni(m.eklenme)}`}</small>
              </span>
              {yazar && kaldirilir(m) && (silinecek === m.adimId
                ? (
                  <span className="tc-am-ozel-eylem" role="group" aria-label={`${m.ad} kaldırılsın mı?`}>
                    <Dugme tur="tehlike" simge="trash" disabled={komut.mesgul} onClick={() => { silinecekYaz(null); komut.yap({ ...kaldirKomutu(adim, m), sonra }); }}>Kaldır</Dugme>
                    <Dugme onClick={() => { silinecekYaz(null); }}>Vazgeç</Dugme>
                  </span>
                )
                : <Dugme simge="trash" disabled={komut.mesgul} aria-label={`Kaldır: ${m.ad}`} title="Kaldır" onClick={() => { silinecekYaz(m.adimId); }} />)}
            </li>
          ))}
        </ul>
      )}
      {duzenler && bitti && <p className="tc-emir-not">Biten adımın listesi değişmez.</p>}
      {yazar && (
        <div className="tc-am-ozel-ekle" role="group" aria-label="Şablon dışı madde ekle">
          <Girdi etiket="Madde adı" placeholder="Örn. Bağlama aparatı hazır" maxLength={120} value={ad}
            onChange={(o) => { adYaz(o.target.value); }} onKeyDown={(o) => { if (o.key === 'Enter') ekle(); }}
            {...(tekrar ? { hata: 'Bu operasyonda aynı adlı madde zaten var.' } : {})} />
          <Dugme tur="birincil" simge="plus" disabled={ad.trim() === '' || tekrar || komut.mesgul} onClick={ekle}>Ekle</Dugme>
        </div>
      )}
      {adim.sablonFarklari.length > 0 && (
        <ul className="tc-am-ozel-liste" aria-label="Şablondan farklar">
          {adim.sablonFarklari.map((f) => (
            <li key={f.madde} className="tc-am-ozel-satir tc-am-ozel-dik">
              <span className="tc-am-ozel-ad">
                <b>{gorunum.ad(f.madde, f.madde)}</b>
                <Rozet ton={f.gerekli ? 'tamam' : 'pasif'}>{f.gerekli ? 'Bu OP\'de gerekli' : 'Bu OP\'de gerekmez'}</Rozet>
                <small>{f.kisiAdi ?? 'Kişi'} · {tarihSaatMetni(f.an)}{f.gerekce === null ? '' : ` · ${f.gerekce}`}</small>
              </span>
              {farkYazabilir && <Dugme simge="back" yukleniyor={farkDon.isPending} onClick={() => { farkDon.mutate(f.madde); }}>Şablona dön</Dugme>}
            </li>
          ))}
        </ul>
      )}
      {ozeller.length === 0 && adim.sablonFarklari.length === 0 && <p className="tc-emir-not">Bu OP şablonu aynen izliyor; özel madde yok.</p>}
      {farkYazabilir && (
        <div className="tc-am-ozel-fark" role="group" aria-label="Şablon maddesini bu OP'de değiştir">
          <Secim etiket="Şablon maddesi" value={madde} bosSecenek="Seçiniz" onChange={(o) => { maddeYaz(o.target.value); }}
            secenekler={secenekler.map((m) => ({ deger: m.kod, baslik: gorunum.ad(m.kod, m.ad) }))} />
          <Secim etiket="Bu OP'de" value={gerekli} onChange={(o) => { gerekliYaz(o.target.value); maddeYaz(''); }}
            secenekler={[{ deger: 'hayir', baslik: 'Gerekmez' }, { deger: 'evet', baslik: 'Gerekli' }]} />
          <CokSatir etiket="Gerekçe" required rows={2} maxLength={450} value={gerekce} onChange={(o) => { gerekceYaz(o.target.value); }} />
          <Dugme tur="birincil" simge="check" disabled={!gecerli} yukleniyor={farkYaz.isPending}
            onClick={() => { farkYaz.mutate({ madde, gerekli: gerekli === 'evet', gerekce: gerekce.trim() }); }}>
            Bu OP&apos;de uygula
          </Dugme>
        </div>
      )}
      {!farkYazabilir && yazar && <p className="tc-emir-not"><Simge ad="lock" boyut="k" /> Şablon maddesini bu OP&apos;de değiştirmek şablon yazma yetkisi ister.</p>}
    </section>
  );
}
