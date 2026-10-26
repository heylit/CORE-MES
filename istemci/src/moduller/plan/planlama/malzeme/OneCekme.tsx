import { useState, type ReactNode } from 'react';
import { Dugme, Kart, Simge } from '../../../../ortak/arayuz/index.ts';
import { ApiHatasi, api, hataIletisi } from '../../../../ortak/veri/api.ts';
import { gunYaz, sayiYaz, tabanMs, tlYaz } from './kurallar.ts';

// Malzeme öne çekme (eski zz7-malzeme-one; düzen ve metin eski kartındır): her açık satın alma 1, 3 ve 5 gün öne alınır, plan aynı sırayla
// yeniden çözülür. Tarayıcıda plan motoru yoktur; düğme görünür ama pasiftir (357 b). Hesap sunucunun değerlendirme ucundadır (357 a,
// SOZLESME-TASLAGI.md `malzeme-one-cekme`); uç main'e girince bayrakla açılır.
export const ONE_CEKME_ACIK = false;

const GURULTU_TL = 500;

export interface OneCekmeKazanci { gun: number; tl: number | null; saat: number; geciken: number; kurtulan: string[] }
export interface OneCekmeSatiri { satinalmaSira: number; kod: string; tedarikci: string | null; soz: number | null; isler: string[]; kazanc: OneCekmeKazanci[] }
export interface OneCekmeSonucu { gunler: number[]; taban: { tl: number | null; gecikmeSaat: number; geciken: number; yerlesmeyen: number }; satirlar: OneCekmeSatiri[] }
export interface DegerlendirmeCevabi<T> { calismaSurumu: number; dataVer: number; baslangic: string; simdi: number; maliyetGorunur: boolean; sonuc: T }

type Durum = { tur: 'bos' } | { tur: 'hesap' } | { tur: 'hata'; ileti: string } | { tur: 'bitti'; cevap: DegerlendirmeCevabi<OneCekmeSonucu> };

export function oneCekmeAdresi(surum: number): string {
  return `/plan/planlama-degerlendirmesi?surum=${surum}&istek=${encodeURIComponent(JSON.stringify({ tur: 'malzeme-one-cekme' }))}`;
}

const ACIKLAMA = 'Her açık satın alma siparişinin gelişi 1, 3 ve 5 gün öne alınır, plan aynı sırayla yeniden çözülür. Kazanç sıra korunarak ölçülür; '
  + 'motor yeniden planlarsa daha fazlası çıkabilir. Tedarikçiyle konuşmadan önce bakılacak liste budur; tedarikçi erken teslimi kabul etmezse kazanç yoktur.';

const Baslik = () => (
  <span className="tc-pyz-baslik"><Simge ad="truck" boyut="k" />Malzeme öne çekme<span className="tc-pyz-kucuk">hangi açık siparişi erken istemeli</span></span>
);

export function OneCekme({ surum, acik = ONE_CEKME_ACIK, malzemeAdi, dar = false }: {
  surum: number | null; acik?: boolean; malzemeAdi: (kod: string) => string; dar?: boolean;
}) {
  const [durum, durumYaz] = useState<Durum>({ tur: 'bos' });
  const calisir = acik && surum !== null;
  const hesapla = (): void => {
    if (!calisir) return;
    durumYaz({ tur: 'hesap' });
    api.get<DegerlendirmeCevabi<OneCekmeSonucu>>(oneCekmeAdresi(surum)).then(
      (cevap) => { durumYaz({ tur: 'bitti', cevap }); },
      (e: unknown) => {
        durumYaz({ tur: 'hata', ileti: e instanceof ApiHatasi && e.durum === 409 ? 'Çalışma değişti; sayfayı yenileyip yeniden hesaplayın.' : hataIletisi(e, 'Hesap tamamlanamadı.') });
      },
    );
  };
  const dugme = (
    <Dugme simge="rotate" onClick={hesapla} disabled={!calisir} yukleniyor={durum.tur === 'hesap'} title={calisir ? undefined : 'Plan motoru bağlanınca açılır.'}>
      {durum.tur === 'bitti' ? 'Yeniden hesapla' : 'Hesapla'}
    </Dugme>
  );
  const acikla = <p className="tc-pyz-kucuk">{ACIKLAMA}</p>;

  if (!calisir) {
    return <Kart baslikEki={<Baslik />} sag={dugme}><p className="tc-pyz-kucuk">Plan motoru bağlanınca açılır.</p>{acikla}</Kart>;
  }
  if (durum.tur === 'hesap') return <Kart baslikEki={<Baslik />} sag={dugme}><p className="tc-pyz-kucuk">Hesaplanıyor: her sipariş için üç deneme.</p></Kart>;
  if (durum.tur === 'hata') {
    return <Kart baslikEki={<Baslik />} sag={dugme}><p className="tc-pyz-uyari"><Simge ad="alert" boyut="k" />{` Hesap tamamlanamadı: ${durum.ileti}`}</p></Kart>;
  }
  if (durum.tur === 'bos') return <Kart baslikEki={<Baslik />} sag={dugme}>{acikla}</Kart>;

  const { cevap } = durum;
  const fg = cevap.maliyetGorunur;
  const taban = tabanMs(cevap.baslangic) ?? 0;
  const k = (r: OneCekmeSatiri, gun: number): OneCekmeKazanci | undefined => r.kazanc.find((x) => x.gun === gun);
  const anlamli = (x: OneCekmeKazanci | undefined): boolean => (x ? (fg ? (x.tl ?? 0) >= GURULTU_TL : x.saat >= 0.5) : false);
  const olcu = (r: OneCekmeSatiri): number => (fg ? k(r, 3)?.tl ?? 0 : (k(r, 3)?.saat ?? 0) * 1000 + (k(r, 5)?.saat ?? 0));
  const satirlar = [...cevap.sonuc.satirlar].sort((a, b) => olcu(b) - olcu(a) || (a.soz ?? 0) - (b.soz ?? 0));
  const hucre = (x: OneCekmeKazanci | undefined): ReactNode => {
    if (!x || !anlamli(x)) return <span className="tc-pyz-kucuk">fark yok</span>;
    return (
      <span className="tc-pyz-mo-h">
        {fg && <b className="mono">{tlYaz(x.tl)}</b>}
        <small>{x.saat >= 0.05 ? `gecikme −${sayiYaz(x.saat, 1)} sa` : 'gecikme aynı'}{x.kurtulan.length ? ` · ${x.kurtulan.length} iş zamanında` : ''}</small>
      </span>
    );
  };
  const ust = satirlar.filter((r) => anlamli(k(r, 3))).slice(0, 3);
  return (
    <Kart baslikEki={<Baslik />} sag={dugme}>
      <p className="tc-pyz-mo-ozet">
        <Simge ad={ust.length ? 'flag' : 'check'} boyut="k" />
        <span>{ust.length
          ? `${ust.map((r) => `${r.kod} (${r.tedarikci ?? '—'}) 3 gün önce gelirse ${fg ? `${tlYaz(k(r, 3)?.tl ?? null)} kazanılır, ` : ''}gecikme ${sayiYaz(k(r, 3)?.saat ?? 0, 1)} sa azalır`).join('; ')}.`
          : 'Hiçbir açık siparişi öne çekmek planı belirgin iyileştirmiyor; malzeme bu planda darboğaz değil.'}</span>
      </p>
      <div className="tc-tablo-kap" data-kip={dar ? 'kart' : undefined}>
        <table className="tc-tablo" aria-label="Malzeme öne çekme">
          <thead><tr>
            <th>Malzeme</th><th>Tedarikçi</th><th>Söz verilen geliş</th><th>Bağlı işler</th>
            {cevap.sonuc.gunler.map((g) => <th key={g} className="tc-pyz-num">{`${g} gün önce`}</th>)}
          </tr></thead>
          <tbody>
            {satirlar.length === 0 && <tr><td colSpan={4 + cevap.sonuc.gunler.length} className="tc-pyz-kucuk">Plandaki işlere bağlı açık satın alma siparişi yok.</td></tr>}
            {satirlar.map((r) => (
              <tr key={r.satinalmaSira} data-ton={anlamli(k(r, 3)) ? 'uyari' : undefined}>
                <td data-baslik="Malzeme"><b className="mono">{r.kod}</b> <span className="tc-pyz-kucuk">{malzemeAdi(r.kod)}</span></td>
                <td data-baslik="Tedarikçi">{r.tedarikci ?? '—'}</td>
                <td data-baslik="Söz verilen geliş"><span className="mono">{gunYaz(taban, r.soz)}</span></td>
                <td data-baslik="Bağlı işler"><span className="mono">{r.isler.slice(0, 3).join(', ')}</span>{r.isler.length > 3 && <span className="tc-pyz-kucuk">{` +${r.isler.length - 3}`}</span>}</td>
                {cevap.sonuc.gunler.map((g) => <td key={g} data-baslik={`${g} gün önce`} className="tc-pyz-num">{hucre(k(r, g))}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tc-pyz-kucuk">
        {fg ? `${sayiYaz(GURULTU_TL, 0)} TL altındaki fark "fark yok" sayılır. TL, planın amaç toplamındaki düşüştür (gecikme cezası, finansman, risk). ` : 'TL farkını maliyet görme yetkisi olan görür; burada gecikme saati var. '}
        Taban: bugünkü plan, aynı sırayla çözüldüğünde.
      </p>
      {acikla}
    </Kart>
  );
}
