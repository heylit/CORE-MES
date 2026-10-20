import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import type { SiparisAyrintisi, SiparisEkleGovdesi, SiparisGuncelleGovdesi } from '#paylasilan/sozlesme/siparisler.ts';
import { CokSatir, Dugme, DurumKutusu, Girdi, Kart, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useForm, type AlanHatalari } from '../../ortak/veri/form.ts';
import { anahtarlar } from './anahtarlar.ts';
import { FirmaSecici, type SecilenFirma } from './FirmaSecici.tsx';
import { BELIRSIZ_SAYI, belirsizSayi, bosYap, bugun, girdiMetni, sayiGirdisi } from './gorunum.ts';
import { MalzemeSecici, type SecilenKart } from './MalzemeSecici.tsx';
import { SayfaBasligi } from './SayfaBasligi.tsx';
import { eskiyseYenile, useFiyatGorur, useKorumaliGonderim } from './yazma.ts';
import './siparisler.css';

interface SatirDegeri {
  anahtar: number;
  kart: SecilenKart | null;
  miktar: string;
  birimFiyat: string;
  termin: string;
  aciklama: string;
}

interface Degerler {
  firma: SecilenFirma | null;
  musteriSiparisNo: string;
  siparisTarihi: string;
  termin: string;
  paraBirimi: string;
  kdvOrani: string;
  odemeKosulu: string;
  aciklama: string;
  cezaOraniGun: string;
  cezaTavaniOrani: string;
  odemeVadesiGun: string;
  satirlar: SatirDegeri[];
}

let satirSayaci = 0;
const bosSatir = (): SatirDegeri => ({ anahtar: ++satirSayaci, kart: null, miktar: '', birimFiyat: '', termin: '', aciklama: '' });

function ilkDegerler(s: SiparisAyrintisi | null): Degerler {
  if (s === null) {
    return { firma: null, musteriSiparisNo: '', siparisTarihi: bugun(), termin: '', paraBirimi: 'TRY', kdvOrani: '20', odemeKosulu: '', aciklama: '', cezaOraniGun: '', cezaTavaniOrani: '', odemeVadesiGun: '', satirlar: [bosSatir()] };
  }
  return {
    firma: { id: s.firmaId, ad: s.firmaAd ?? `Firma ${s.firmaId}` },
    musteriSiparisNo: s.musteriSiparisNo ?? '',
    siparisTarihi: s.siparisTarihi,
    termin: s.termin,
    paraBirimi: s.paraBirimi,
    kdvOrani: girdiMetni(s.kdvOrani),
    odemeKosulu: s.odemeKosulu ?? '',
    aciklama: s.aciklama ?? '',
    cezaOraniGun: s.cezaOraniGun === null ? '' : girdiMetni(s.cezaOraniGun),
    cezaTavaniOrani: s.cezaTavaniOrani === null ? '' : girdiMetni(s.cezaTavaniOrani),
    odemeVadesiGun: s.odemeVadesiGun === null ? '' : String(s.odemeVadesiGun),
    satirlar: s.satirlar.map((m) => ({
      anahtar: ++satirSayaci,
      kart: { no: m.malzemeNo, kod: m.malzemeKodu, ad: m.malzemeAdi ?? m.malzemeKodu ?? `Kart ${m.malzemeNo}`, birim: m.birim },
      miktar: girdiMetni(m.miktar),
      birimFiyat: m.birimFiyat === null ? '' : girdiMetni(m.birimFiyat),
      termin: m.termin ?? '',
      aciklama: m.aciklama ?? '',
    })),
  };
}

// Biçim ve iş kuralı sunucuda denetlenir; burada yalnız boş bırakılan zorunlu alan ve belirsiz sayı yakalanır.
// Birim fiyat zorunlu değildir (201 a): fiyatsız kalem açılır, sipariş fiyatlar girilmeden onaylanamaz.
function dogrula(d: Degerler): AlanHatalari {
  const hata: AlanHatalari = {};
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
  });
  return hata;
}

const alanEsle = (alan: string): string => (alan === 'firmaId' ? 'firma' : alan.replace(/^(satirlar\.\d+)\.malzemeNo$/, '$1.kart'));

function govdeKur(d: Degerler) {
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
    cezaOraniGun: d.cezaOraniGun.trim() === '' ? null : sayiGirdisi(d.cezaOraniGun),
    cezaTavaniOrani: d.cezaTavaniOrani.trim() === '' ? null : sayiGirdisi(d.cezaTavaniOrani),
    // Boş vade null gider; proje maliyeti onu eksik sayar, plan sırası vadeyi okumaz (205 a, E-9).
    odemeVadesiGun: d.odemeVadesiGun.trim() === '' ? null : Number(d.odemeVadesiGun.trim()),
    satirlar: d.satirlar.map((s) => ({
      malzemeNo: s.kart?.no ?? 0,
      miktar: sayiGirdisi(s.miktar),
      // Fiyatı görmeyen boş gönderir; sunucu taslaktaki fiyatı korur.
      birimFiyat: s.birimFiyat.trim() === '' ? null : sayiGirdisi(s.birimFiyat),
      termin: s.termin === '' ? null : s.termin,
      aciklama: bosYap(s.aciklama),
    })),
  } satisfies SiparisEkleGovdesi;
}

interface FormOzellikleri {
  // null: yeni sipariş; dolu: taslak düzenleme.
  siparis: SiparisAyrintisi | null;
}

function Form({ siparis }: FormOzellikleri) {
  const gezin = useNavigate();
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const ekle = useKorumaliGonderim();
  const fiyatGorur = useFiyatGorur();
  const [acilisSurumu] = useState(siparis?.surum ?? null);
  const [secilecek, secilecekYaz] = useState<number | null>(null);

  const form = useForm<Degerler, SiparisAyrintisi>({
    ilk: ilkDegerler(siparis),
    dogrula,
    alanEsle,
    hataIletisi: 'Sipariş kaydedilemedi.',
    kaydet: (d) => {
      const govde = govdeKur(d);
      if (siparis === null || acilisSurumu === null) return ekle<SiparisAyrintisi>('/siparisler/ekle', govde);
      return api.post<SiparisAyrintisi>(`/siparisler/${siparis.id}/guncelle`, { ...govde, surum: acilisSurumu } satisfies SiparisGuncelleGovdesi);
    },
    basarili: (cevap) => {
      istemci.setQueryData(anahtarlar.siparis(cevap.id), cevap);
      void istemci.invalidateQueries({ queryKey: anahtarlar.siparisListeleri });
      bildir('tamam', siparis === null ? 'Sipariş taslağı açıldı.' : 'Sipariş güncellendi.');
      void gezin(`/siparisler/${cevap.id}`);
    },
    hatada: (hata) => { if (siparis !== null) eskiyseYenile(istemci, anahtarlar.siparis(siparis.id), hata); },
  });
  const d = form.degerler;

  const satirDegistir = (i: number, yama: Partial<SatirDegeri>) =>
    form.degistir({ satirlar: d.satirlar.map((s, j) => (j === i ? { ...s, ...yama } : s)) });
  const geri = siparis === null ? '/siparisler' : `/siparisler/${siparis.id}`;

  return (
    <section className="tc-sp">
      <SayfaBasligi
        baslik={siparis === null ? 'Yeni satış siparişi' : `Düzenle: ${siparis.no}`}
        alt={siparis === null ? 'Teklif süreci olmadan doğrudan sipariş taslağı açın; onay sonrası satırlar değişmez.' : 'Yalnız taslak sipariş düzenlenir.'}
        geriYol={geri}
        geriMetni={siparis === null ? 'Siparişlere dön' : 'Siparişe dön'}
      />
      <form className="tc-sp-form" onSubmit={form.gonder} noValidate>
        {form.genelHata !== null && <p className="tc-sp-hata" role="alert">{form.eskiSurum ? 'Kayıt başkası tarafından değişti, yeniden yükleyin.' : form.genelHata}</p>}
        <Kart baslik="Sipariş bilgileri">
          <div className="tc-sp-izgara">
            <FirmaSecici etiket="Müşteri" zorunlu deger={d.firma} degistir={(f) => form.degistir({ firma: f })} {...(form.hata('firma') === undefined ? {} : { hata: form.hata('firma') })} />
            <Girdi etiket="Müşteri sipariş no" autoComplete="off" {...form.alan('musteriSiparisNo')} />
            <Girdi etiket="Sipariş tarihi" type="date" required {...form.alan('siparisTarihi')} />
            <Girdi etiket="Termin" type="date" required {...form.alan('termin')} />
            <Girdi etiket="Para birimi" required autoComplete="off" maxLength={3} {...form.alan('paraBirimi')} />
            <Girdi etiket="KDV oranı (%)" required inputMode="decimal" autoComplete="off" {...form.alan('kdvOrani')} />
            <Girdi etiket="Gecikme cezası (%/gün)" inputMode="decimal" autoComplete="off" ipucu="Boş: sözleşmede ceza yok." {...form.alan('cezaOraniGun')} />
            <Girdi etiket="Ceza tavanı (%)" inputMode="decimal" autoComplete="off" {...form.alan('cezaTavaniOrani')} />
            <Girdi etiket="Ödeme vadesi (gün)" inputMode="numeric" autoComplete="off" ipucu="Proje maliyeti finansmanı bu vadeden hesaplar; plan sırası henüz okumaz." {...form.alan('odemeVadesiGun')} />
          </div>
          <Girdi etiket="Ödeme koşulu" autoComplete="off" placeholder="Örnek: 30 gün vadeli" {...form.alan('odemeKosulu')} />
          <CokSatir etiket="Açıklama" {...form.alan('aciklama')} />
        </Kart>

        <Kart baslik="Kalemler" sag={<Dugme simge="plus" onClick={() => form.degistir({ satirlar: [...d.satirlar, bosSatir()] })}>Kalem ekle</Dugme>}>
          <ol className="tc-sp-kalemler">
            {d.satirlar.map((s, i) => (
              <li key={s.anahtar} className="tc-sp-kalem" aria-label={`Kalem ${i + 1}`}>
                <div className="tc-sp-kalem-ust">
                  <strong>{`Kalem ${i + 1}`}</strong>
                  {d.satirlar.length > 1 && (
                    <Dugme simge="trash" aria-label={`Kalem ${i + 1} sil`} onClick={() => form.degistir({ satirlar: d.satirlar.filter((_, j) => j !== i) })} />
                  )}
                </div>
                <div className="tc-sp-kart-sec">
                  <Dugme simge="search" onClick={() => secilecekYaz(i)}>{s.kart === null ? 'Malzeme kartı seç' : 'Kartı değiştir'}</Dugme>
                  <span className={form.hata(`satirlar.${i}.kart`) === undefined ? 'tc-sp-secili' : 'tc-sp-secili tc-sp-hata'} role={form.hata(`satirlar.${i}.kart`) === undefined ? undefined : 'alert'}>
                    {form.hata(`satirlar.${i}.kart`) ?? (s.kart === null ? 'Kart seçilmedi' : `${s.kart.kod ?? ''} ${s.kart.ad}${s.kart.birim ? ` (${s.kart.birim})` : ''}`.trim())}
                  </span>
                </div>
                <div className="tc-sp-izgara">
                  <Girdi
                    etiket={`Kalem ${i + 1} miktar`}
                    required
                    inputMode="decimal"
                    autoComplete="off"
                    value={s.miktar}
                    onChange={(o) => satirDegistir(i, { miktar: o.target.value })}
                    {...(form.hata(`satirlar.${i}.miktar`) === undefined ? {} : { hata: form.hata(`satirlar.${i}.miktar`) })}
                  />
                  {fiyatGorur && (
                    <Girdi
                      etiket={`Kalem ${i + 1} birim fiyat`}
                      inputMode="decimal"
                      autoComplete="off"
                      ipucu="Boşsa fiyat sonra girilir; fiyatsız sipariş onaylanmaz."
                      value={s.birimFiyat}
                      onChange={(o) => satirDegistir(i, { birimFiyat: o.target.value })}
                      {...(form.hata(`satirlar.${i}.birimFiyat`) === undefined ? {} : { hata: form.hata(`satirlar.${i}.birimFiyat`) })}
                    />
                  )}
                  <Girdi
                    etiket={`Kalem ${i + 1} termin`}
                    type="date"
                    ipucu="Boşsa sipariş termini geçerlidir."
                    value={s.termin}
                    onChange={(o) => satirDegistir(i, { termin: o.target.value })}
                    {...(form.hata(`satirlar.${i}.termin`) === undefined ? {} : { hata: form.hata(`satirlar.${i}.termin`) })}
                  />
                </div>
                <Girdi
                  etiket={`Kalem ${i + 1} açıklama`}
                  autoComplete="off"
                  value={s.aciklama}
                  onChange={(o) => satirDegistir(i, { aciklama: o.target.value })}
                  {...(form.hata(`satirlar.${i}.aciklama`) === undefined ? {} : { hata: form.hata(`satirlar.${i}.aciklama`) })}
                />
              </li>
            ))}
          </ol>
        </Kart>

        <div className="tc-sp-alt-cubuk">
          <Dugme onClick={() => { void gezin(geri); }} disabled={form.gonderiliyor}>Vazgeç</Dugme>
          <Dugme tur="birincil" type="submit" simge="check" yukleniyor={form.gonderiliyor}>{siparis === null ? 'Taslak aç' : 'Kaydet'}</Dugme>
        </div>
      </form>
      <MalzemeSecici
        acik={secilecek !== null}
        kapat={() => secilecekYaz(null)}
        sec={(kart) => { if (secilecek !== null) satirDegistir(secilecek, { kart }); secilecekYaz(null); }}
      />
    </section>
  );
}

// Düzenlemede kayıt önce okunur; form ilk değerlerini yalnız ilk çizimde alır.
export function SiparisFormu({ duzenle = false }: { duzenle?: boolean }) {
  const id = Number(useParams()['id']);
  const siparis = useQuery({
    queryKey: anahtarlar.siparisDuzenle(id),
    queryFn: () => api.get<SiparisAyrintisi>(`/siparisler/${id}`),
    enabled: duzenle,
    // Form açıldığı andaki güncel kayıttan kurulur ve sonradan yenilenip içindeki yazıyı kaybetmez.
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  if (!duzenle) return <Form siparis={null} />;
  if (siparis.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (siparis.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(siparis.error, 'Sipariş alınamadı')} yenile={() => { void siparis.refetch(); }} />;
  if (siparis.data.durum !== 'taslak') {
    return <DurumKutusu durum="bos" mesaj="Yalnız taslak sipariş düzenlenir." />;
  }
  return <Form siparis={siparis.data} />;
}
