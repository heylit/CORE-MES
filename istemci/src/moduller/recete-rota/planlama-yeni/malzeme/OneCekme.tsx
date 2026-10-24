import { useState } from 'react';
import { Dugme, DurumKutusu, Kart, Simge, Tablo, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { ApiHatasi, api, hataIletisi } from '../../../../ortak/veri/api.ts';
import { gunYaz, tabanMs } from './kurallar.ts';

// Malzeme öne çekme (eski zz7-malzeme-one): her açık satın alma 1, 3 ve 5 gün öne alınır, plan aynı sırayla yeniden çözülür. Tarayıcıda
// plan motoru yoktur (357 b); hesap sunucunun değerlendirme ucundadır (357 a, SOZLESME-TASLAGI.md `malzeme-one-cekme`). Uç main'e girene
// dek kart kapalıdır; açılınca bu bileşen yalnız bayrakla açılır.
export const ONE_CEKME_ACIK = false;

const GURULTU_TL = 500;

export interface OneCekmeKazanci { gun: number; tl: number | null; saat: number; geciken: number; kurtulan: string[] }
export interface OneCekmeSatiri { satinalmaSira: number; kod: string; tedarikci: string | null; soz: number | null; isler: string[]; kazanc: OneCekmeKazanci[] }
export interface OneCekmeSonucu { gunler: number[]; taban: { tl: number | null; gecikmeSaat: number; geciken: number; yerlesmeyen: number }; satirlar: OneCekmeSatiri[] }
export interface DegerlendirmeCevabi<T> { calismaSurumu: number; dataVer: number; baslangic: string; simdi: number; maliyetGorunur: boolean; sonuc: T }

type Durum = { tur: 'bos' } | { tur: 'hesap' } | { tur: 'hata'; ileti: string } | { tur: 'bitti'; cevap: DegerlendirmeCevabi<OneCekmeSonucu> };

export function oneCekmeAdresi(surum: number): string {
  return `/recete-rota/planlama-degerlendirmesi?surum=${surum}&istek=${encodeURIComponent(JSON.stringify({ tur: 'malzeme-one-cekme' }))}`;
}

export function OneCekme({ surum, acik = ONE_CEKME_ACIK, malzemeAdi }: { surum: number | null; acik?: boolean; malzemeAdi: (kod: string) => string }) {
  const [durum, durumYaz] = useState<Durum>({ tur: 'bos' });
  const ek = <span className="tc-pyz-kucuk">hangi açık siparişi erken istemeli</span>;
  if (!acik || surum === null) return <Kart baslik="Malzeme öne çekme" baslikEki={ek}><DurumKutusu durum="bos" mesaj="Plan motoru bağlanınca açılır." /></Kart>;

  const hesapla = (): void => {
    durumYaz({ tur: 'hesap' });
    api.get<DegerlendirmeCevabi<OneCekmeSonucu>>(oneCekmeAdresi(surum)).then(
      (cevap) => { durumYaz({ tur: 'bitti', cevap }); },
      (e: unknown) => {
        durumYaz({ tur: 'hata', ileti: e instanceof ApiHatasi && e.durum === 409 ? 'Çalışma değişti; sayfayı yenileyip yeniden hesaplayın.' : hataIletisi(e, 'Hesap tamamlanamadı.') });
      },
    );
  };
  const dugme = <Dugme simge="rotate" onClick={hesapla} yukleniyor={durum.tur === 'hesap'}>{durum.tur === 'bitti' ? 'Yeniden hesapla' : 'Hesapla'}</Dugme>;
  const acikla = (
    <p className="tc-pyz-kucuk">
      Her açık satın alma siparişinin gelişi 1, 3 ve 5 gün öne alınır, plan aynı sırayla yeniden çözülür. Kazanç sıra korunarak ölçülür; motor yeniden
      planlarsa daha fazlası çıkabilir. Tedarikçi erken teslimi kabul etmezse kazanç yoktur.
    </p>
  );
  if (durum.tur !== 'bitti') {
    return (
      <Kart baslik="Malzeme öne çekme" baslikEki={ek} sag={dugme}>
        {durum.tur === 'hesap' && <DurumKutusu durum="yukleniyor" mesaj="Hesaplanıyor: her sipariş için üç deneme." />}
        {durum.tur === 'hata' && <DurumKutusu durum="hata" mesaj={durum.ileti} />}
        {acikla}
      </Kart>
    );
  }

  const { cevap } = durum;
  const fg = cevap.maliyetGorunur;
  const taban = tabanMs(cevap.baslangic) ?? 0;
  const anlamli = (k: OneCekmeKazanci | undefined): boolean => (k ? (fg ? (k.tl ?? 0) >= GURULTU_TL : k.saat >= 0.5) : false);
  const uc = (r: OneCekmeSatiri): OneCekmeKazanci | undefined => r.kazanc.find((k) => k.gun === 3);
  const olcu = (r: OneCekmeSatiri): number => (fg ? uc(r)?.tl ?? 0 : (uc(r)?.saat ?? 0) * 1000 + (r.kazanc.find((k) => k.gun === 5)?.saat ?? 0));
  const satirlar = [...cevap.sonuc.satirlar].sort((a, b) => olcu(b) - olcu(a) || (a.soz ?? 0) - (b.soz ?? 0));
  const hucre = (k: OneCekmeKazanci | undefined) => {
    if (!k || !anlamli(k)) return <span className="tc-pyz-kucuk">fark yok</span>;
    const sa = k.saat >= 0.05 ? `gecikme −${k.saat.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} sa` : 'gecikme aynı';
    return <>{fg && k.tl !== null && <b className="mono">{`${k.tl.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TL`}</b>}<br /><small>{sa}{k.kurtulan.length ? ` · ${k.kurtulan.length} iş zamanında` : ''}</small></>;
  };
  const sutunlar: Sutun<OneCekmeSatiri>[] = [
    { anahtar: 'kod', baslik: 'Malzeme', hucre: (r) => <><b className="mono">{r.kod}</b> <span className="tc-pyz-kucuk">{malzemeAdi(r.kod)}</span></>, csv: (r) => r.kod },
    { anahtar: 'ted', baslik: 'Tedarikçi', hucre: (r) => r.tedarikci ?? '—' },
    { anahtar: 'soz', baslik: 'Söz verilen geliş', kirilmaz: true, hucre: (r) => gunYaz(taban, r.soz) },
    { anahtar: 'isler', baslik: 'Bağlı işler', mono: true, hucre: (r) => `${r.isler.slice(0, 3).join(', ')}${r.isler.length > 3 ? ` +${r.isler.length - 3}` : ''}` },
    ...cevap.sonuc.gunler.map((g): Sutun<OneCekmeSatiri> => ({
      anahtar: `g${g}`, baslik: `${g} gün önce`, hizala: 'sag', hucre: (r) => hucre(r.kazanc.find((k) => k.gun === g)), csv: (r) => r.kazanc.find((k) => k.gun === g)?.tl ?? null,
    })),
  ];
  const ust = satirlar.filter((r) => anlamli(uc(r))).slice(0, 3);
  return (
    <Kart baslik="Malzeme öne çekme" baslikEki={ek} sag={dugme}>
      <p className="tc-pyz-not">
        <Simge ad={ust.length ? 'flag' : 'check'} boyut="k" />
        <span>{ust.length
          ? `${ust.map((r) => `${r.kod} (${r.tedarikci ?? '—'}) 3 gün önce gelirse ${fg && uc(r)?.tl != null ? `${(uc(r)?.tl ?? 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TL kazanılır, ` : ''}gecikme ${(uc(r)?.saat ?? 0).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} sa azalır`).join('; ')}.`
          : 'Hiçbir açık siparişi öne çekmek planı belirgin iyileştirmiyor; malzeme bu planda darboğaz değil.'}</span>
      </p>
      <Tablo etiket="Malzeme öne çekme" sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(r) => r.satinalmaSira} bosMesaj="Plandaki işlere bağlı açık satın alma siparişi yok." />
      <p className="tc-pyz-kucuk">
        {fg ? `${GURULTU_TL} TL altındaki fark "fark yok" sayılır. TL, planın amaç toplamındaki düşüştür (gecikme cezası, finansman, risk). ` : 'TL farkını maliyet görme yetkisi olan görür; burada gecikme saati var. '}
        Taban: bugünkü plan, aynı sırayla çözüldüğünde.
      </p>
      {acikla}
    </Kart>
  );
}
