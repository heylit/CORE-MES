// Yeni iş ya da iş düzenleme (yan pencere). Doğrulama sunucudadır; ekran yalnız alan biçimini (sayı, saat) tarayıcıya bırakır.
import { useId, useState, type FormEvent } from 'react';
import type { Arac, Bekleyen, Is, IsGovdesi, IsTuru, Nokta } from '#paylasilan/sozlesme/sevkiyat.ts';
import { Dugme, Girdi, Pencere, Secim, useBildirim } from '../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../ortak/veri/api.ts';
import { IS_TURLERI, IS_TURU_ACIKLAMASI, IS_TURU_ADI, NOKTA_TURLERI, NOKTA_TURU_ADI } from './bicim.ts';
import { useIsKomutu } from './veri.ts';

interface Taslak {
  tarih: string; tur: IsTuru; alisNoktasiId: string; birakisNoktasiId: string; agirlikKilogram: string; paletSayisi: string; durakSuresiDakika: string;
  alisEnErken: string; alisEnGec: string; birakisEnErken: string; birakisEnGec: string; belgeNo: string; aciklama: string; sabitAracId: string;
}
const taslakOf = (is: Is | null, tarih: string): Taslak => ({
  tarih: is?.istenenTarih ?? tarih, tur: is?.tur ?? 'teslimat',
  alisNoktasiId: is?.alisNoktasiId?.toString() ?? '', birakisNoktasiId: is?.birakisNoktasiId?.toString() ?? '',
  agirlikKilogram: is?.agirlikKilogram ?? '', paletSayisi: is ? String(is.paletSayisi) : '1', durakSuresiDakika: is?.durakSuresiDakika?.toString() ?? '',
  alisEnErken: is?.alisEnErken ?? '', alisEnGec: is?.alisEnGec ?? '', birakisEnErken: is?.birakisEnErken ?? '', birakisEnGec: is?.birakisEnGec ?? '',
  belgeNo: is?.belgeNo ?? '', aciklama: is?.aciklama ?? '', sabitAracId: is?.sabitAracId?.toString() ?? '',
});
// Bekleme listesindeki kaydın işe çevrilirken ilk hâli: fasonda firmanın noktasına teslimat, alımda firmadan alım; üründe noktayı
// planlayıcı seçer. Yükü ve günü o verir.
const bekleyenTaslagi = (b: Bekleyen, tarih: string): Taslak => {
  const t = taslakOf(null, b.istenenTarih !== null && b.istenenTarih > tarih ? b.istenenTarih : tarih);
  const nokta = b.noktaId?.toString() ?? '';
  const ne = [b.malzemeAd, b.adet === null ? null : `${Number(b.adet).toLocaleString('tr-TR')} adet`].filter(Boolean).join(' · ');
  return { ...t, tur: b.kaynak === 'alim' ? 'alim' : 'teslimat', ...(b.kaynak === 'alim' ? { alisNoktasiId: nokta } : { birakisNoktasiId: nokta }), belgeNo: b.emirNo ?? b.talepNo ?? '', aciklama: ne };
};
const sayiYaDaNull = (x: string) => (x.trim() === '' ? null : Number(x.replace(',', '.')));
const metinYaDaNull = (x: string) => (x.trim() === '' ? null : x);

function isGovdesi(t: Taslak): IsGovdesi {
  const alisVar = t.tur !== 'teslimat', birakisVar = t.tur !== 'alim';
  return {
    tarih: t.tarih, tur: t.tur,
    alisNoktasiId: alisVar ? sayiYaDaNull(t.alisNoktasiId) : null, birakisNoktasiId: birakisVar ? sayiYaDaNull(t.birakisNoktasiId) : null,
    agirlikKilogram: sayiYaDaNull(t.agirlikKilogram) ?? 0, paletSayisi: sayiYaDaNull(t.paletSayisi) ?? 0, durakSuresiDakika: sayiYaDaNull(t.durakSuresiDakika),
    alisEnErken: alisVar ? metinYaDaNull(t.alisEnErken) : null, alisEnGec: alisVar ? metinYaDaNull(t.alisEnGec) : null,
    birakisEnErken: birakisVar ? metinYaDaNull(t.birakisEnErken) : null, birakisEnGec: birakisVar ? metinYaDaNull(t.birakisEnGec) : null,
    belgeNo: metinYaDaNull(t.belgeNo), aciklama: metinYaDaNull(t.aciklama), sabitAracId: sayiYaDaNull(t.sabitAracId),
  };
}

// Var olan işin gövdesi (tek alanı değiştirmek için, ör. sabit araç).
export const isinGovdesi = (is: Is): IsGovdesi => isGovdesi(taslakOf(is, is.istenenTarih));

// Noktalar türe göre sıralanır; tür adı seçenekte yazılır (ortak seçim alanında grup yok).
const noktaSecenekleri = (noktalar: readonly Nokta[]) =>
  NOKTA_TURLERI.filter((t) => t !== 'fabrika').flatMap((tur) => noktalar.filter((n) => n.tur === tur).map((n) => ({ deger: String(n.id), baslik: `${n.ad} · ${NOKTA_TURU_ADI[tur]}` })));
const TUR_SECENEKLERI = IS_TURLERI.map((t) => ({ deger: t, baslik: IS_TURU_ADI[t] }));

export function IsFormu({ is, bekleyen = null, tarih, noktalar, araclar, kapat }: {
  is: Is | null; bekleyen?: Bekleyen | null; tarih: string; noktalar: readonly Nokta[]; araclar: readonly Arac[]; kapat: () => void;
}) {
  const [t, setT] = useState<Taslak>(() => (bekleyen ? bekleyenTaslagi(bekleyen, tarih) : taslakOf(is, tarih)));
  const komut = useIsKomutu();
  const { bildir } = useBildirim();
  const formKimligi = useId();
  const alan = <K extends keyof Taslak>(ad: K) => (deger: Taslak[K]) => setT((x) => ({ ...x, [ad]: deger }));
  const secenekler = noktaSecenekleri(noktalar.filter((n) => n.aktif && n.tur !== 'fabrika'));
  const gonder = (e: FormEvent) => {
    e.preventDefault();
    const govde = isGovdesi(t);
    komut.mutate(is ? { tur: 'guncelle', id: is.id, govde: { ...govde, surum: is.surum } } : bekleyen ? { tur: 'ise-cevir', bekleyenId: bekleyen.id, govde } : { tur: 'ekle', govde }, {
      onSuccess: () => {
        bildir('tamam', is ? 'İş kaydedildi.' : 'İş sevkiyat havuzuna eklendi.');
        if (is || bekleyen) kapat(); else setT(taslakOf(null, t.tarih));
      },
    });
  };
  const pencere = (onek: 'alis' | 'birakis', baslik: string) => (
    <fieldset className="tc-sevkiyat-alan-grubu">
      <legend>{baslik}</legend>
      <Girdi etiket="En erken" type="time" value={onek === 'alis' ? t.alisEnErken : t.birakisEnErken} onChange={(e) => alan(onek === 'alis' ? 'alisEnErken' : 'birakisEnErken')(e.target.value)} />
      <Girdi etiket="En geç" type="time" value={onek === 'alis' ? t.alisEnGec : t.birakisEnGec} onChange={(e) => alan(onek === 'alis' ? 'alisEnGec' : 'birakisEnGec')(e.target.value)} />
    </fieldset>
  );
  return (
    <Pencere acik kapat={kapat} tur="yan" baslik={is ? 'İşi düzenle' : bekleyen ? 'İşe çevir' : 'Yeni iş'}
      alt={<><Dugme onClick={kapat}>Kapat</Dugme><Dugme type="submit" form={formKimligi} tur="birincil" yukleniyor={komut.isPending}>{is ? 'Kaydet' : 'Havuza ekle'}</Dugme></>}>
      <form id={formKimligi} className="tc-sevkiyat-form" onSubmit={gonder} aria-label={is ? 'İşi düzenle' : bekleyen ? 'İşe çevir' : 'Yeni iş'}>
        <Secim etiket="İş türü" ipucu={IS_TURU_ACIKLAMASI[t.tur]} secenekler={TUR_SECENEKLERI} value={t.tur} onChange={(e) => alan('tur')(e.target.value as IsTuru)} />
        <div className="tc-sevkiyat-alanlar">
          {t.tur !== 'teslimat' && <Secim etiket="Alış noktası" required bosSecenek="Seçin…" secenekler={secenekler} value={t.alisNoktasiId} onChange={(e) => alan('alisNoktasiId')(e.target.value)} />}
          {t.tur !== 'alim' && <Secim etiket={t.tur === 'teslimat' ? 'Teslim noktası' : 'Bırakış noktası'} required bosSecenek="Seçin…" secenekler={secenekler} value={t.birakisNoktasiId} onChange={(e) => alan('birakisNoktasiId')(e.target.value)} />}
          <Girdi etiket="Ağırlık (kg)" type="number" min={0} step="any" inputMode="decimal" value={t.agirlikKilogram} onChange={(e) => alan('agirlikKilogram')(e.target.value)} />
          <Girdi etiket="Palet" type="number" min={0} step={1} inputMode="numeric" value={t.paletSayisi} onChange={(e) => alan('paletSayisi')(e.target.value)} />
          <Girdi etiket="Yükleme/boşaltma (dk)" type="number" min={0} step={1} placeholder="Noktanın süresi" value={t.durakSuresiDakika} onChange={(e) => alan('durakSuresiDakika')(e.target.value)} />
          <Girdi etiket="İstenen gün" ipucu="O güne kadar planlanmazsa sonraki günlerin havuzunda gecikmiş görünür" type="date" required value={t.tarih} onChange={(e) => alan('tarih')(e.target.value)} />
        </div>
        {t.tur !== 'teslimat' && pencere('alis', 'Alış zaman aralığı')}
        {t.tur !== 'alim' && pencere('birakis', 'Bırakış zaman aralığı')}
        <div className="tc-sevkiyat-alanlar">
          <Girdi etiket="Belge no" value={t.belgeNo} maxLength={60} onChange={(e) => alan('belgeNo')(e.target.value)} />
          <Secim etiket="Sabit araç" bosSecenek="Yok (dağıtım seçer)" secenekler={araclar.map((a) => ({ deger: String(a.id), baslik: a.ad }))} value={t.sabitAracId} onChange={(e) => alan('sabitAracId')(e.target.value)} />
        </div>
        <Girdi etiket="Açıklama" value={t.aciklama} maxLength={400} onChange={(e) => alan('aciklama')(e.target.value)} />
        {komut.isError && <p role="alert" className="tc-sevkiyat-hata">{hataIletisi(komut.error, 'İş kaydedilemedi')}</p>}
      </form>
    </Pencere>
  );
}
