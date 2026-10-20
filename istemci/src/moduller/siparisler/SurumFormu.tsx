import { useQueryClient } from '@tanstack/react-query';
import type { TeklifAyrintiCevabi } from '#paylasilan/sozlesme/siparisler.ts';
import { CokSatir, Dugme, Girdi, Kart, useBildirim } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { useForm, type AlanHatalari } from '../../ortak/veri/form.ts';
import { anahtarlar } from './anahtarlar.ts';
import { BELIRSIZ_SAYI, belirsizSayi, bosYap, fiyatMetni, miktarMetni, sayiGirdisi } from './gorunum.ts';
import { eskiyseYenile } from './yazma.ts';

interface Degerler {
  // Talep satırlarıyla aynı sırada; her satıra bir birim fiyat.
  fiyatlar: string[];
  iskontoOrani: string;
  teslimGun: string;
  odemeKosulu: string;
  gecerlilik: string;
  aciklama: string;
}

// Önceki sürümün değerleri doldurulur (prototip: "Önceki sürümün değerleri dolduruldu").
function ilkDegerler(t: TeklifAyrintiCevabi): Degerler {
  const son = t.surumler.at(-1);
  const fiyat = new Map((son?.fiyatlar ?? []).map((f) => [f.satirId, f.birimFiyat]));
  return {
    fiyatlar: t.satirlar.map((s) => { const f = fiyat.get(s.id); return f === undefined ? '' : miktarMetni(f).replace(/\./g, ''); }),
    iskontoOrani: son ? miktarMetni(son.iskontoOrani) : '0',
    teslimGun: son?.teslimGun == null ? '' : String(son.teslimGun),
    odemeKosulu: son?.odemeKosulu ?? '',
    gecerlilik: son?.gecerlilik ?? '',
    aciklama: son?.aciklama ?? '',
  };
}

function dogrula(d: Degerler): AlanHatalari {
  const hata: AlanHatalari = {};
  d.fiyatlar.forEach((f, i) => {
    if (f.trim() === '') hata[`fiyatlar.${i}.birimFiyat`] = 'Birim fiyat zorunlu.';
    else if (belirsizSayi(f)) hata[`fiyatlar.${i}.birimFiyat`] = BELIRSIZ_SAYI;
  });
  if (belirsizSayi(d.iskontoOrani)) hata['iskontoOrani'] = BELIRSIZ_SAYI;
  const gun = d.teslimGun.trim();
  if (gun !== '' && !/^\d+$/.test(gun)) hata['teslimGun'] = 'Teslim süresi gün olarak tam sayı yazılır.';
  return hata;
}

// Yeni ya da ilk sürümü verir. Fiyat biçimi ve geçiş kuralı sunucuda denetlenir; ret iletisi formda görünür.
export function SurumFormu({ teklif }: { teklif: TeklifAyrintiCevabi }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const ilk = teklif.surumler.length === 0;

  const form = useForm<Degerler, TeklifAyrintiCevabi>({
    ilk: ilkDegerler(teklif),
    dogrula,
    hataIletisi: 'Sürüm verilemedi.',
    kaydet: (d) => api.post<TeklifAyrintiCevabi>(`/siparisler/teklifler/${teklif.id}/surum-ver`, {
      surum: teklif.surum,
      fiyatlar: teklif.satirlar.map((s, i) => ({ satirId: s.id, birimFiyat: sayiGirdisi(d.fiyatlar[i] ?? '') })),
      iskontoOrani: sayiGirdisi(d.iskontoOrani) || '0',
      teslimGun: d.teslimGun.trim() === '' ? null : Number(d.teslimGun),
      odemeKosulu: bosYap(d.odemeKosulu),
      gecerlilik: d.gecerlilik === '' ? null : d.gecerlilik,
      aciklama: bosYap(d.aciklama),
    }),
    basarili: (cevap) => {
      istemci.setQueryData(anahtarlar.teklif(cevap.id), cevap);
      void istemci.invalidateQueries({ queryKey: anahtarlar.teklifListeleri });
      bildir('tamam', cevap.sonSurumNo === null ? 'Sürüm verildi.' : `Sürüm ${cevap.sonSurumNo} verildi.`);
    },
    hatada: (hata) => eskiyseYenile(istemci, anahtarlar.teklif(teklif.id), hata),
  });
  const d = form.degerler;

  return (
    <Kart baslik={ilk ? 'Teklif hazırla' : 'Yeni sürüm hazırla'}>
      <p className="tc-sp-ipucu">{ilk ? 'Her kaleme birim fiyat girin; toplamlar kayıttan sonra sunucudan gelir.' : 'Önceki sürümün değerleri dolduruldu; değiştirip yeni sürüm olarak verin.'}</p>
      <form className="tc-sp-form" onSubmit={form.gonder} noValidate aria-label="Sürüm formu">
        {form.genelHata !== null && <p className="tc-sp-hata" role="alert">{form.eskiSurum ? 'Kayıt başkası tarafından değişti, yeniden yükleyin.' : form.genelHata}</p>}
        <ol className="tc-sp-kalemler">
          {teklif.satirlar.map((s, i) => (
            <li key={s.id} className="tc-sp-kalem" aria-label={`Kalem ${i + 1}`}>
              <div className="tc-sp-kalem-ust">
                <strong>{s.tanim}</strong>
                <span className="tc-sp-soluk">{`${miktarMetni(s.miktar)}${s.birim ? ` ${s.birim}` : ''}`}</span>
              </div>
              <Girdi
                etiket={`${s.tanim} birim fiyat (${teklif.paraBirimi})`}
                required
                inputMode="decimal"
                autoComplete="off"
                value={d.fiyatlar[i] ?? ''}
                ipucu={ilk ? undefined : `Önceki: ${fiyatMetni(teklif.surumler.at(-1)?.fiyatlar.find((f) => f.satirId === s.id)?.birimFiyat, teklif.paraBirimi)}`}
                onChange={(o) => form.degistir({ fiyatlar: d.fiyatlar.map((f, j) => (j === i ? o.target.value : f)) })}
                {...(form.hata(`fiyatlar.${i}.birimFiyat`) === undefined ? {} : { hata: form.hata(`fiyatlar.${i}.birimFiyat`) })}
              />
            </li>
          ))}
        </ol>
        <div className="tc-sp-izgara">
          <Girdi etiket="İskonto (%)" inputMode="decimal" autoComplete="off" {...form.alan('iskontoOrani')} />
          <Girdi etiket="Teslim süresi (gün)" inputMode="numeric" autoComplete="off" {...form.alan('teslimGun')} />
          <Girdi etiket="Ödeme koşulu" autoComplete="off" placeholder="Örnek: 30 gün vadeli" {...form.alan('odemeKosulu')} />
          <Girdi etiket="Geçerlilik tarihi" type="date" {...form.alan('gecerlilik')} />
        </div>
        <CokSatir etiket="Müşteriye not" placeholder="Fiyata kaplama dahildir, nakliye alıcıya aittir vb." {...form.alan('aciklama')} />
        <div className="tc-sp-alt-cubuk">
          <Dugme tur="birincil" type="submit" simge="check" yukleniyor={form.gonderiliyor}>{ilk ? 'Teklifi ver' : `Sürüm ${(teklif.sonSurumNo ?? 0) + 1} olarak ver`}</Dugme>
        </div>
      </form>
    </Kart>
  );
}
