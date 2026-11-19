import { useState } from 'react';
import { EMIR_TURU_ADLARI, type EMIR_TURLERI } from '#paylasilan/sozlesme/emir-turleri.ts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import type { KarsilamaYolu, SiparisAyrintisi, SiparisEkleGovdesi, SiparisGuncelleGovdesi, SiparisRevizyonGovdesi } from '#paylasilan/sozlesme/siparisler.ts';
import { CokSatir, Dugme, DurumKutusu, Girdi, Kart, KilitliDeger, Rozet, Secim, YETKI_ADI, useBildirim, useLogoRozetleri } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { FirmaKoduSecimi, kayitliKodIpucu, useFirmaKodlari } from '../../ortak/veri/firma-kodlari.tsx';
import { useForm, type AlanHatalari } from '../../ortak/veri/form.ts';
import { anahtarlar } from './anahtarlar.ts';
import type { SecilenFirma } from './FirmaSecici.tsx';
import { BELIRSIZ_SAYI, KARSILAMA_YOLU_ADLARI, belirsizSayi, bosYap, bugun, girdiMetni, gunEkle, gunSayisi, paraBirimiSecenekleri, sayiGirdisi, sifirFiyat } from './gorunum.ts';
import { KartArama } from './KartArama.tsx';
import { secilenKartMetni, type SecilenKart } from './MalzemeSecici.tsx';
import { MusteriArama } from './MusteriArama.tsx';
import { SayfaBasligi } from './SayfaBasligi.tsx';
import { eskiyseYenile, useFiyatGorur, useKorumaliGonderim } from './yazma.ts';
import './siparisler.css';

// 3429-4 (3429-2 E b): kalem siparişte partilere bölünmez; onayda tek seri emir açılır, bölme üretim emrinde yapılır. Eski kayıtların
// partileri değişmeden geri gider (rotaId null: emir türünün rotası; elle seçilmiş eski rota korunur).
type EmirTuru = (typeof EMIR_TURLERI)[number];
interface PartiDegeri { anahtar: number; emirTuru: EmirTuru; adet: string; rotaId: number | null }
let partiSayaci = 0;
const partiAnahtari = (): number => ++partiSayaci;

interface SatirDegeri {
  anahtar: number;
  // Var olan kalemin kimliği; yeni kalemde null. SIP-19: emre bağlı kalem (kilitli) bununla eşlenir, yalnız termini değişir.
  id: number | null;
  kilitli: boolean;
  kart: SecilenKart | null;
  miktar: string;
  birimFiyat: string;
  // Boş: kalem siparişin terminini izler (sunucuya null gider); dolu: kaleme elle verilmiş termin.
  termin: string;
  aciklama: string;
  partiler: PartiDegeri[];
  karsilama: KarsilamaYolu;
  // 3438 a: kart ailesinin yürürlükteki revizyonu değilse zorunlu neden.
  eskiRevizyonGerekcesi: string;
  // Seçim yürürlükteki revizyona yönlendiyse kullanıcının seçtiği eski kart; "Eski revizyonu kullan" onu geri getirir.
  eskiOneri: SecilenKart | null;
  // Kayıtlı sürümdeki kartı; sunucu siparişte zaten kayıtlı karta gerekçe sormaz, alan da zorunlu görünmez.
  kayitliKartNo: number | null;
}

interface Degerler {
  firma: SecilenFirma | null;
  musteriSiparisNo: string;
  siparisTarihi: string;
  termin: string;
  // 3244 b: terminin sipariş tarihinden gün karşılığı; hangisi yazılırsa öteki hesaplanır.
  terminGun: string;
  paraBirimi: string;
  kdvOrani: string;
  odemeKosulu: string;
  aciklama: string;
  cezaOraniGun: string;
  cezaTavaniOrani: string;
  odemeVadesiGun: string;
  satirlar: SatirDegeri[];
  // SIP-40 (3427-4 a): onaylı siparişin yeni sürümünde zorunlu; taslakta ve yeni siparişte gönderilmez.
  gerekce: string;
}

let satirSayaci = 0;
const bosSatir = (): SatirDegeri => ({
  anahtar: ++satirSayaci, id: null, kilitli: false, kart: null, miktar: '', birimFiyat: '', termin: '', aciklama: '', partiler: [], karsilama: 'uret',
  eskiRevizyonGerekcesi: '', eskiOneri: null, kayitliKartNo: null,
});

function ilkDegerler(s: SiparisAyrintisi | null): Degerler {
  if (s === null) {
    return { firma: null, musteriSiparisNo: '', siparisTarihi: bugun(), termin: '', terminGun: '', paraBirimi: 'TRY', kdvOrani: '20', odemeKosulu: '', aciklama: '', cezaOraniGun: '', cezaTavaniOrani: '', odemeVadesiGun: '', satirlar: [bosSatir()], gerekce: '' };
  }
  return {
    firma: { id: s.firmaId, ad: s.firmaAd ?? `Firma ${s.firmaId}` },
    musteriSiparisNo: s.musteriSiparisNo ?? '',
    siparisTarihi: s.siparisTarihi,
    termin: s.termin,
    terminGun: String(gunSayisi(s.siparisTarihi, s.termin) ?? ''),
    paraBirimi: s.paraBirimi,
    kdvOrani: girdiMetni(s.kdvOrani),
    odemeKosulu: s.odemeKosulu ?? '',
    aciklama: s.aciklama ?? '',
    cezaOraniGun: s.cezaOraniGun === null ? '' : girdiMetni(s.cezaOraniGun),
    cezaTavaniOrani: s.cezaTavaniOrani === null ? '' : girdiMetni(s.cezaTavaniOrani),
    odemeVadesiGun: s.odemeVadesiGun === null ? '' : String(s.odemeVadesiGun),
    satirlar: s.satirlar.map((m) => ({
      anahtar: ++satirSayaci,
      id: m.id,
      kilitli: m.emreBagli,
      kart: { no: m.malzemeNo, kod: m.malzemeKodu, ad: m.malzemeAdi ?? m.malzemeKodu ?? `Kart ${m.malzemeNo}`, birim: m.birim, aciklamalar: m.aciklamalar, yerlilikOrani: null, revizyon: m.revizyon },
      miktar: girdiMetni(m.miktar),
      birimFiyat: m.birimFiyat === null ? '' : girdiMetni(m.birimFiyat),
      termin: m.termin === null || m.termin === s.termin ? '' : m.termin,
      aciklama: m.aciklama ?? '',
      partiler: m.partiler.map((p) => ({ anahtar: partiAnahtari(), emirTuru: p.emirTuru, adet: girdiMetni(p.adet), rotaId: p.rotaId })),
      karsilama: m.karsilama,
      eskiRevizyonGerekcesi: m.eskiRevizyonGerekcesi ?? '',
      eskiOneri: null,
      kayitliKartNo: m.malzemeNo,
    })),
    gerekce: '',
  };
}

// Biçim ve iş kuralı sunucuda denetlenir; burada yalnız boş bırakılan zorunlu alan ve belirsiz sayı yakalanır.
// Birim fiyat zorunlu değildir (201 a): fiyatsız kalem açılır, sipariş fiyatlar girilmeden onaylanamaz.
// Sunucu en az REVIZYON_GEREKCESI_EN_AZ (3) harf ister; istemci sözleşmeyi değerle ithal etmez (zod).
const GEREKCE_EN_AZ = 3;
const dogrula = (yeniSurum: boolean) => (d: Degerler): AlanHatalari => {
  const hata: AlanHatalari = {};
  if (yeniSurum && d.gerekce.trim().length < GEREKCE_EN_AZ) hata['gerekce'] = 'Neden değiştiğini yazın (en az 3 harf).';
  if (d.firma === null) hata['firma'] = 'Firma seçin.';
  if (d.siparisTarihi === '') hata['siparisTarihi'] = 'Sipariş tarihi zorunlu.';
  if (d.termin === '') hata['termin'] = 'Termin zorunlu.';
  if (d.paraBirimi.trim() === '') hata['paraBirimi'] = 'Para birimi zorunlu.';
  if (d.kdvOrani.trim() === '') hata['kdvOrani'] = 'KDV oranı zorunlu.';
  for (const alan of ['cezaOraniGun', 'cezaTavaniOrani'] as const) if (belirsizSayi(d[alan])) hata[alan] = BELIRSIZ_SAYI;
  if (d.odemeVadesiGun.trim() !== '' && !/^\d+$/.test(d.odemeVadesiGun.trim())) hata['odemeVadesiGun'] = 'Ödeme vadesi tam gün olmalı.';
  d.satirlar.forEach((s, i) => {
    if (s.kart === null) hata[`satirlar.${i}.kart`] = 'Malzeme kartı seçin.';
    if (s.miktar.trim() === '') hata[`satirlar.${i}.miktar`] = 'Miktar zorunlu.';
    else if (belirsizSayi(s.miktar)) hata[`satirlar.${i}.miktar`] = BELIRSIZ_SAYI;
    if (belirsizSayi(s.birimFiyat)) hata[`satirlar.${i}.birimFiyat`] = BELIRSIZ_SAYI;
    if (s.karsilama !== 'uret') return;
    if (s.partiler.some((p) => p.adet.trim() === '')) hata[`satirlar.${i}.partiler`] = 'Parti adedini girin ya da partiyi silin.';
    else if (s.partiler.some((p) => belirsizSayi(p.adet))) hata[`satirlar.${i}.partiler`] = BELIRSIZ_SAYI;
    else if (s.partiler.length > 0 && s.miktar.trim() !== '' && !belirsizSayi(s.miktar) && binde(s.miktar) !== s.partiler.reduce((t, p) => t + binde(p.adet), 0)) {
      hata[`satirlar.${i}.partiler`] = 'Miktar eski partilerle tutmuyor; "Partileri kaldır" ile kalemi tek seri emre çevirin.';
    }
  });
  return hata;
};

// 3429-3 F: onayda yalnız "Üret" kalemi emir açar; öteki yollar emir açmaz, partiler gönderilmez.
// Sunucu yalnız mamul ve yarı mamul kartında emir açar (UE-SA-02); türü bilinen öteki kartta "Üret" sunulmaz, varsayılan "Stoktan"dır.
// "Üret"te ipucu yazılmaz: üretim çeşidi bloğu emrin nasıl açılacağını söyler.
const URETILEN_TURLER: readonly string[] = ['mamul', 'yarimamul'];
const uretilmezKart = (k: SecilenKart | null): boolean => k?.tur !== undefined && !URETILEN_TURLER.includes(k.tur);
const KARSILAMA_SECENEKLERI = (Object.keys(KARSILAMA_YOLU_ADLARI) as KarsilamaYolu[]).map((y) => ({ deger: y, baslik: KARSILAMA_YOLU_ADLARI[y] }));
const karsilamaSecenekleri = (k: SecilenKart | null) => (uretilmezKart(k) ? KARSILAMA_SECENEKLERI.filter((o) => o.deger !== 'uret') : KARSILAMA_SECENEKLERI);
const KARSILAMA_IPUCU: Record<KarsilamaYolu, string | null> = {
  uret: null,
  stok: 'Emir açılmaz; onayda eldeki stok kadar depoya ayırma isteği açılır. Eksik kalan için istek açılmaz.',
  'satin-al': 'Emir açılmaz; kalem satın alınarak karşılanır.',
};
const karsilamaIpucu = (y: KarsilamaYolu): { ipucu?: string } => { const m = KARSILAMA_IPUCU[y]; return m === null ? {} : { ipucu: m }; };

// SIP-18 sunucuda da denetler; eski partili kalemde miktar değişince ekranda parti düzenleyicisi olmadığı için çıkış "Partileri kaldır"dır.
const binde = (v: string): number => Math.round(Number(sayiGirdisi(v)) * 1000);

const alanEsle = (alan: string): string => (alan === 'firmaId' ? 'firma' : alan.replace(/^(satirlar\.\d+)\.malzemeNo$/, '$1.kart'));

// Ceza ve vade fiyat görme yetkisinin parçasıdır (3401-2 a): göremeyen göndermez (null), sunucu kayıttakini korur.
function govdeKur(d: Degerler, ticariSartGorur: boolean) {
  return {
    firmaId: d.firma?.id ?? 0,
    musteriSiparisNo: bosYap(d.musteriSiparisNo),
    siparisTarihi: d.siparisTarihi,
    termin: d.termin,
    paraBirimi: d.paraBirimi.trim().toUpperCase(),
    kdvOrani: sayiGirdisi(d.kdvOrani),
    odemeKosulu: bosYap(d.odemeKosulu),
    aciklama: bosYap(d.aciklama),
    // Boş ceza alanı "ceza yok" demektir (177-179 a: tutar ya da ceza yoksa taban ağırlık); sıfır uydurulmaz.
    cezaOraniGun: !ticariSartGorur || d.cezaOraniGun.trim() === '' ? null : sayiGirdisi(d.cezaOraniGun),
    cezaTavaniOrani: !ticariSartGorur || d.cezaTavaniOrani.trim() === '' ? null : sayiGirdisi(d.cezaTavaniOrani),
    // Boş vade null gider; proje maliyeti onu eksik sayar, plan sırası vadeyi okumaz (205 a, E-9).
    odemeVadesiGun: !ticariSartGorur || d.odemeVadesiGun.trim() === '' ? null : Number(d.odemeVadesiGun.trim()),
    satirlar: d.satirlar.map((s) => ({
      ...(s.id === null ? {} : { id: s.id }),
      malzemeNo: s.kart?.no ?? 0,
      miktar: sayiGirdisi(s.miktar),
      // Fiyatı görmeyen boş gönderir; sunucu taslaktaki fiyatı korur.
      birimFiyat: s.birimFiyat.trim() === '' ? null : sayiGirdisi(s.birimFiyat),
      termin: s.termin === '' || s.termin === d.termin ? null : s.termin,
      aciklama: bosYap(s.aciklama),
      partiler: s.karsilama === 'uret' ? s.partiler.map((p) => ({ emirTuru: p.emirTuru, adet: sayiGirdisi(p.adet), rotaId: p.rotaId })) : [],
      karsilama: s.karsilama,
      ...(eskiRevizyonda(s.kart) ? { eskiRevizyonGerekcesi: bosYap(s.eskiRevizyonGerekcesi) } : {}),
    })),
  } satisfies SiparisEkleGovdesi;
}

const eskiRevizyonda = (k: SecilenKart | null): boolean => k?.revizyon?.yururlukte === false;
const etiketli = (kod: string | null, etiket: string | null | undefined) => `${kod ?? ''}${etiket ? ` (${etiket})` : ''}`.trim();

interface FormOzellikleri {
  // null: yeni sipariş; dolu: taslak düzenleme ya da (yeniSurum) onaylı siparişin yeni sürümü.
  siparis: SiparisAyrintisi | null;
  yeniSurum?: boolean;
}

// SIP-40 (3427-4 a): onaylı siparişte müşteri, sipariş tarihi, para birimi, kalem, malzeme, miktar ve partiler değişmez (emir ve plan
// bunlarla açıldı); fiyat, termin, açıklama ve ticari şartlar değişir, kayıt gerekçeyle yeni sürüm olur.
function Form({ siparis, yeniSurum = false }: FormOzellikleri) {
  const gezin = useNavigate();
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const ekle = useKorumaliGonderim();
  const fiyatGorur = useFiyatGorur();
  const [acilisSurumu] = useState(siparis?.surum ?? null);
  // 3399 a: firma kodu sipariş numarasını belirler; yalnız açılışta seçilir.
  const { varsayilan: varsayilanFirmaKodu } = useFirmaKodlari();
  const [secilenFirmaKodu, firmaKoduYaz] = useState<string | null>(null);
  const firmaKodu = siparis === null ? (secilenFirmaKodu ?? varsayilanFirmaKodu) : siparis.firmaKodu;

  const form = useForm<Degerler, SiparisAyrintisi>({
    ilk: ilkDegerler(siparis),
    dogrula: dogrula(yeniSurum),
    alanEsle,
    hataIletisi: 'Sipariş kaydedilemedi.',
    kaydet: (d) => {
      const govde = govdeKur(d, fiyatGorur);
      if (siparis === null || acilisSurumu === null) return ekle<SiparisAyrintisi>('/siparisler/ekle', firmaKodu === null ? govde : { ...govde, firmaKodu });
      if (yeniSurum) {
        return api.post<SiparisAyrintisi>(`/siparisler/${siparis.id}/yeni-surum`, { ...govde, surum: acilisSurumu, gerekce: d.gerekce.trim() } satisfies SiparisRevizyonGovdesi);
      }
      return api.post<SiparisAyrintisi>(`/siparisler/${siparis.id}/guncelle`, { ...govde, surum: acilisSurumu } satisfies SiparisGuncelleGovdesi);
    },
    basarili: (cevap) => {
      istemci.setQueryData(anahtarlar.siparis(cevap.id), cevap);
      void istemci.invalidateQueries({ queryKey: anahtarlar.siparisListeleri });
      if (yeniSurum) void istemci.invalidateQueries({ queryKey: anahtarlar.siparisSurumleri(cevap.id) });
      bildir('tamam', siparis === null ? 'Sipariş taslağı açıldı.' : yeniSurum ? 'Yeni sürüm kaydedildi.' : 'Sipariş güncellendi.');
      void gezin(`/siparisler/${cevap.id}`);
    },
    hatada: (hata) => { if (siparis !== null) eskiyseYenile(istemci, anahtarlar.siparis(siparis.id), hata); },
  });
  const d = form.degerler;
  // Logo'ya gitmiş siparişte yeni sürüm Logo'ya gitmez; kaydetmeden önce söylenir (sürüm geçmişinde de işaretlenir).
  const logo = useLogoRozetleri('satis-siparisi', siparis === null ? [] : [siparis.id], yeniSurum);
  const logoda = siparis !== null && logo.durum(siparis.id)?.durum === 'logoda';

  const satirDegistir = (i: number, yama: Partial<SatirDegeri>) =>
    form.degistir({ satirlar: d.satirlar.map((s, j) => (j === i ? { ...s, ...yama } : s)) });
  const geri = siparis === null ? '/siparisler' : `/siparisler/${siparis.id}`;
  // Gün yazılınca tarih, tarih yazılınca gün hesaplanır; sipariş tarihi değişince tarih kalır, gün yeniden hesaplanır.
  const gunYaz = (metin: string) => {
    const gun = /^\d{1,4}$/.test(metin.trim()) ? Number(metin.trim()) : null;
    form.degistir({ terminGun: metin, ...(gun !== null && d.siparisTarihi !== '' ? { termin: gunEkle(d.siparisTarihi, gun) } : {}) });
  };
  const tarihYaz = (termin: string) => form.degistir({ termin, terminGun: String(gunSayisi(d.siparisTarihi, termin) ?? '') });
  const siparisTarihiYaz = (siparisTarihi: string) => form.degistir({ siparisTarihi, terminGun: String(gunSayisi(siparisTarihi, d.termin) ?? '') });

  return (
    <section className="tc-sp">
      <SayfaBasligi
        baslik={siparis === null ? 'Yeni satış siparişi' : yeniSurum ? `Yeni sürüm: ${siparis.no}` : `Düzenle: ${siparis.no}`}
        alt={siparis === null
          ? 'Teklif süreci olmadan doğrudan sipariş taslağı açın; onay sonrası satırlar değişmez.'
          : yeniSurum ? 'Fiyat, termin, açıklama ve ticari şartlar değişir; kayıt nedeniyle yeni sürüm olur, eski hâl sürüm geçmişinde kalır.' : 'Yalnız taslak sipariş düzenlenir.'}
        geriYol={geri}
        geriMetni={siparis === null ? 'Siparişlere dön' : 'Siparişe dön'}
      />
      <form className="tc-sp-form" onSubmit={form.gonder} noValidate>
        {yeniSurum && logoda && (
          <p className="tc-sp-bildirim tc-sp-bildirim-uyari" role="status"><strong>Sipariş Logo'da</strong> Kaydedince Logo'daki kaydı elle güncellemeniz gerekir.</p>
        )}
        {form.genelHata !== null && <p className="tc-sp-hata" role="alert">{form.eskiSurum ? 'Kayıt başkası tarafından değişti, yeniden yükleyin.' : form.genelHata}</p>}
        <Kart baslik="Sipariş bilgileri">
          <div className="tc-sp-izgara">
            {yeniSurum
              ? <Girdi etiket="Müşteri" value={d.firma?.ad ?? ''} disabled readOnly />
              : <MusteriArama deger={d.firma} degistir={(f) => form.degistir({ firma: f })} {...(form.hata('firma') === undefined ? {} : { hata: form.hata('firma') })} />}
            <Girdi etiket="Müşteri sipariş no" autoComplete="off" {...form.alan('musteriSiparisNo')} />
            <Girdi etiket="Sipariş tarihi" type="date" required={!yeniSurum} disabled={yeniSurum} {...form.alan('siparisTarihi')} onChange={(o) => siparisTarihiYaz(o.target.value)} />
            <div className="tc-sp-termin">
              <Girdi etiket="Termin (gün)" inputMode="numeric" autoComplete="off" ipucu="Sipariş tarihinden takvim günü." value={d.terminGun} onChange={(o) => gunYaz(o.target.value)} />
              <Girdi etiket="Termin" type="date" required {...form.alan('termin')} onChange={(o) => tarihYaz(o.target.value)} />
            </div>
            <Secim etiket="Para birimi" required={!yeniSurum} disabled={yeniSurum} secenekler={paraBirimiSecenekleri(d.paraBirimi)} {...form.alan('paraBirimi')} />
            <FirmaKoduSecimi deger={firmaKodu} degistir={firmaKoduYaz} kilitli={siparis !== null} {...(siparis === null ? {} : { ipucu: kayitliKodIpucu('Sipariş', siparis.no, siparis.firmaKodu) })} />
            <Girdi etiket="KDV oranı (%)" required inputMode="decimal" autoComplete="off" {...form.alan('kdvOrani')} />
            {fiyatGorur ? (
              <>
                <Girdi etiket="Gecikme cezası (%/gün)" inputMode="decimal" autoComplete="off" ipucu="Boş: sözleşmede ceza yok." {...form.alan('cezaOraniGun')} />
                <Girdi etiket="Ceza tavanı (%)" inputMode="decimal" autoComplete="off" {...form.alan('cezaTavaniOrani')} />
                <Girdi etiket="Ödeme vadesi (gün)" inputMode="numeric" autoComplete="off" ipucu="Proje maliyeti finansmanı bu vadeden hesaplar; plan sırası henüz okumaz." {...form.alan('odemeVadesiGun')} />
              </>
            ) : (
              <div className="tc-sp-yigin" role="group" aria-label="Ticari şartlar">
                <span className="tc-sp-etiket">Gecikme cezası, ceza tavanı ve ödeme vadesi</span>
                <KilitliDeger yetki={YETKI_ADI.siparisFiyati} />
              </div>
            )}
          </div>
          <Girdi etiket="Ödeme koşulu" autoComplete="off" placeholder="Örnek: 30 gün vadeli" {...form.alan('odemeKosulu')} />
          <CokSatir etiket="Açıklama" {...form.alan('aciklama')} />
        </Kart>

        <Kart baslik="Kalemler" {...(yeniSurum ? {} : { sag: <Dugme simge="plus" onClick={() => form.degistir({ satirlar: [...d.satirlar, bosSatir()] })}>Kalem ekle</Dugme> })}>
          <ol className="tc-sp-kalemler">
            {d.satirlar.map((s, i) => {
              const sabit = yeniSurum || s.kilitli;
              const gerekceZorunlu = s.kart !== null && !d.satirlar.some((k) => k.kayitliKartNo === s.kart?.no);
              const yalnizTermin = s.kilitli && !yeniSurum;
              return (
              <li key={s.anahtar} className="tc-sp-kalem" aria-label={`Kalem ${i + 1}`}>
                <div className="tc-sp-kalem-ust">
                  <strong>{`Kalem ${i + 1}`}</strong>
                  {s.kilitli && <Rozet ton="bilgi" gorunum="cizgi">Emre bağlı</Rozet>}
                  {yalnizTermin && <span className="tc-sp-parti-bos">Üretim emri açıldı; yalnız termin değişir.</span>}
                  {d.satirlar.length > 1 && !sabit && (
                    <Dugme simge="trash" aria-label={`Kalem ${i + 1} sil`} onClick={() => form.degistir({ satirlar: d.satirlar.filter((_, j) => j !== i) })} />
                  )}
                </div>
                {sabit ? (
                  <span className="tc-sp-secili">{s.kart === null ? 'Kart seçilmedi' : secilenKartMetni(s.kart)}</span>
                ) : (
                  <KartArama
                    etiket={`Kalem ${i + 1} malzeme kartı`}
                    deger={s.kart}
                    degistir={(kart, eski) => satirDegistir(i, {
                      ...(uretilmezKart(kart) && s.karsilama === 'uret' ? { karsilama: 'stok', partiler: [] } : {}), kart, eskiOneri: eski ?? null,
                    })}
                    {...(form.hata(`satirlar.${i}.kart`) === undefined ? {} : { hata: form.hata(`satirlar.${i}.kart`) })}
                  />
                )}
                {!sabit && s.eskiOneri !== null && !eskiRevizyonda(s.kart) && (
                  <p className="tc-sp-revizyon" role="status">
                    <span>{`${etiketli(s.eskiOneri.kod, s.eskiOneri.revizyon?.etiket)} yürürlükte değil; yürürlükteki ${etiketli(s.kart?.kod ?? null, s.kart?.revizyon?.etiket)} seçildi.`}</span>
                    <Dugme simge="back" onClick={() => satirDegistir(i, { kart: s.eskiOneri, eskiOneri: null })}>Eski revizyonu kullan</Dugme>
                  </p>
                )}
                {eskiRevizyonda(s.kart) && (
                  <div className="tc-sp-revizyon">
                    <Rozet ton="uyari" gorunum="cizgi">{`${s.kart?.revizyon?.etiket ?? 'Revizyon'} yürürlükte değil`}</Rozet>
                    <span className="tc-sp-ipucu">{`Yürürlükteki: ${etiketli(s.kart?.revizyon?.yururluktekiKodu ?? null, s.kart?.revizyon?.yururluktekiEtiketi)}`}</span>
                    {!sabit && (
                      <Girdi
                        etiket={`Kalem ${i + 1} eski revizyon gerekçesi`}
                        autoComplete="off"
                        required={gerekceZorunlu}
                        maxLength={300}
                        placeholder="Örnek: Müşteri bu revizyonu istedi"
                        value={s.eskiRevizyonGerekcesi}
                        onChange={(o) => satirDegistir(i, { eskiRevizyonGerekcesi: o.target.value })}
                        {...(form.hata(`satirlar.${i}.eskiRevizyonGerekcesi`) === undefined ? {} : { hata: form.hata(`satirlar.${i}.eskiRevizyonGerekcesi`) })}
                      />
                    )}
                    {sabit && s.eskiRevizyonGerekcesi !== '' && <span className="tc-sp-ipucu">{`Gerekçe: ${s.eskiRevizyonGerekcesi}`}</span>}
                  </div>
                )}
                <div className="tc-sp-izgara">
                  <Girdi
                    etiket={`Kalem ${i + 1} miktar`}
                    required
                    inputMode="decimal"
                    autoComplete="off"
                    value={s.miktar}
                    disabled={sabit}
                    onChange={(o) => satirDegistir(i, { miktar: o.target.value })}
                    {...(form.hata(`satirlar.${i}.miktar`) === undefined ? {} : { hata: form.hata(`satirlar.${i}.miktar`) })}
                  />
                  {fiyatGorur && (
                    <Girdi
                      etiket={`Kalem ${i + 1} birim fiyat`}
                      inputMode="decimal"
                      autoComplete="off"
                      ipucu={sifirFiyat(s.birimFiyat) ? 'Fiyat 0: kalem bedelsiz kaydedilir. Bedelsizse doğru; değilse fiyatı girin.' : 'Boşsa fiyat sonra girilir; fiyatsız sipariş onaylanmaz.'}
                      value={s.birimFiyat}
                      disabled={yalnizTermin}
                      onChange={(o) => satirDegistir(i, { birimFiyat: o.target.value })}
                      {...(form.hata(`satirlar.${i}.birimFiyat`) === undefined ? {} : { hata: form.hata(`satirlar.${i}.birimFiyat`) })}
                    />
                  )}
                  <div className="tc-sp-kalem-termin">
                    <Girdi
                      etiket={`Kalem ${i + 1} termin`}
                      type="date"
                      value={s.termin === '' ? d.termin : s.termin}
                      onChange={(o) => satirDegistir(i, { termin: o.target.value === d.termin ? '' : o.target.value })}
                      {...(form.hata(`satirlar.${i}.termin`) === undefined ? {} : { hata: form.hata(`satirlar.${i}.termin`) })}
                    />
                    {s.termin === '' || s.termin === d.termin
                      ? <Rozet ton="pasif" gorunum="cizgi">Sipariş termini</Rozet>
                      : (
                        <span className="tc-sp-kalem-elle">
                          <Rozet ton="uyari" gorunum="cizgi">Elle</Rozet>
                          <Dugme simge="route" onClick={() => satirDegistir(i, { termin: '' })}>Siparişe bağla</Dugme>
                        </span>
                      )}
                  </div>
                </div>
                <Secim
                  etiket={`Kalem ${i + 1} karşılama`}
                  value={s.karsilama}
                  disabled={sabit}
                  secenekler={karsilamaSecenekleri(s.kart)}
                  {...karsilamaIpucu(s.karsilama)}
                  onChange={(o) => satirDegistir(i, { karsilama: o.target.value as KarsilamaYolu })}
                />
                {s.karsilama === 'uret' && (
                <div className="tc-sp-kalem-cesit" aria-label={`Kalem ${i + 1} üretim çeşidi`}>
                  <span className="tc-sp-parti-cipleri">
                    {s.partiler.length === 0
                      ? <Rozet ton="bilgi" gorunum="cizgi">{`${s.miktar === '' ? '' : `${s.miktar} `}Seri`}</Rozet>
                      : s.partiler.map((p) => <Rozet key={p.anahtar} ton="bilgi" gorunum="cizgi">{`${p.adet} ${EMIR_TURU_ADLARI[p.emirTuru]}`}</Rozet>)}
                  </span>
                  {!sabit && (
                    <span className="tc-sp-parti-bos">
                      {s.partiler.length === 0 ? 'Onayda tek emir açılır; FAI, numune gibi partiler üretim emrinde bölünür.' : `Eski kayıt: partiler değişmeden kalır; yeni bölme üretim emrinde yapılır.${s.partiler.some((p) => p.rotaId !== null) ? ' Elle seçilmiş rota korunur.' : ''}`}
                    </span>
                  )}
                  {!sabit && !yalnizTermin && s.partiler.length > 0 && (
                    <span>
                      <Dugme simge="trash" onClick={() => satirDegistir(i, { partiler: [] })}>Partileri kaldır</Dugme>
                    </span>
                  )}
                  {form.hata(`satirlar.${i}.partiler`) !== undefined && <span className="tc-sp-hata" role="alert">{form.hata(`satirlar.${i}.partiler`)}</span>}
                </div>
                )}
                <Girdi
                  etiket={`Kalem ${i + 1} açıklama`}
                  autoComplete="off"
                  value={s.aciklama}
                  disabled={yalnizTermin}
                  onChange={(o) => satirDegistir(i, { aciklama: o.target.value })}
                  {...(form.hata(`satirlar.${i}.aciklama`) === undefined ? {} : { hata: form.hata(`satirlar.${i}.aciklama`) })}
                />
              </li>
              );
            })}
          </ol>
        </Kart>

        {yeniSurum && (
          <Kart baslik="Değişiklik nedeni">
            <CokSatir etiket="Neden değişti" required placeholder="Örnek: Müşteri termini iki hafta öne aldı" ipucu="Sürüm geçmişinde kim ve ne zamanla birlikte görünür." {...form.alan('gerekce')} />
          </Kart>
        )}

        <div className="tc-sp-alt-cubuk">
          <Dugme onClick={() => { void gezin(geri); }} disabled={form.gonderiliyor}>Vazgeç</Dugme>
          <Dugme tur="birincil" type="submit" simge="check" yukleniyor={form.gonderiliyor}>{siparis === null ? 'Taslak aç' : yeniSurum ? 'Yeni sürümü kaydet' : 'Kaydet'}</Dugme>
        </div>
      </form>
    </section>
  );
}

// Düzenlemede kayıt önce okunur; form ilk değerlerini yalnız ilk çizimde alır.
export function SiparisFormu({ duzenle = false, yeniSurum = false }: { duzenle?: boolean; yeniSurum?: boolean }) {
  const id = Number(useParams()['id']);
  const siparis = useQuery({
    queryKey: anahtarlar.siparisDuzenle(id),
    queryFn: () => api.get<SiparisAyrintisi>(`/siparisler/${id}`),
    enabled: duzenle || yeniSurum,
    // Form açıldığı andaki güncel kayıttan kurulur ve sonradan yenilenip içindeki yazıyı kaybetmez.
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  if (!duzenle && !yeniSurum) return <Form siparis={null} />;
  if (siparis.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (siparis.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(siparis.error, 'Sipariş alınamadı')} yenile={() => { void siparis.refetch(); }} />;
  if (yeniSurum) {
    if (siparis.data.durum !== 'onayli' || siparis.data.arsiv !== null) return <DurumKutusu durum="bos" mesaj="Yalnız onaylı sipariş yeni sürümle düzenlenir." />;
    return <Form siparis={siparis.data} yeniSurum />;
  }
  if (siparis.data.durum !== 'taslak') {
    return <DurumKutusu durum="bos" mesaj="Yalnız taslak sipariş düzenlenir." />;
  }
  return <Form siparis={siparis.data} />;
}
