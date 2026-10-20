import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Ayar, AyarDegistirGovdesi, AyarlarCevabi } from '#paylasilan/sozlesme/ayarlar.ts';
import type { AcilisTuru, GecisHizi, HareketSeviyesi } from '#paylasilan/sozlesme/ayarlar.ts';
import { AcilisOnizleme, Dugme, DurumKutusu, Kart, Rozet, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar as ortakAnahtarlar } from '../../ortak/veri/anahtarlar.ts';
import { usePerformans } from '../../ortak/veri/gorunum.ts';
import { useKurumLogosu } from '../../ortak/veri/kurum-logosu.ts';
import { anahtarlar } from './anahtarlar.ts';
import './gorunum.css';

export const GORUNUM_ANAHTARLARI = ['kabuk.hareket', 'kabuk.gecis-hizi', 'kabuk.acilis', 'kabuk.acilis-suresi'] as const;

const HAREKETLER: readonly { deger: HareketSeviyesi; ad: string; aciklama: string }[] = [
  { deger: 'kapali', ad: 'Kapalı', aciklama: 'Hiç geçiş, animasyon ve bulanıklık yok; açılış gösterisi de oynamaz. Takılan cihaz için.' },
  { deger: 'sade', ad: 'Sade', aciklama: '120 ms solma. En hafif; zayıf cihaz ve yoğun ekran için.' },
  { deger: 'orta', ad: 'Orta', aciklama: '180 ms solma ve hafif kayma. Önerilen.' },
  { deger: 'cesur', ad: 'Cesur', aciklama: '240 ms, sayfa geçişinde sarı tarama çizgisi, yaylı paneller.' },
  { deger: 'ultra', ad: 'Ultra', aciklama: '300 ms 3B derinlik ve bulanıklık. Güçlü bilgisayar için.' },
];

const GECISLER: readonly { deger: GecisHizi; ad: string; aciklama: string }[] = [
  { deger: 'hizli', ad: 'Hızlı', aciklama: 'Süreler yüzde 40 kısa. Hızlı çalışan ekip için.' },
  { deger: 'normal', ad: 'Normal', aciklama: 'Hareket dilinin kendi süreleri. Önerilen.' },
  { deger: 'yavas', ad: 'Yavaş', aciklama: 'Süreler 1,8 kat uzun. Geçişi izlemek ve sunum için.' },
];

const SURE_EN_AZ = 0.5, SURE_EN_COK = 5, SURE_VARSAYILAN = 2;
const saniye = (s: number): string => `${s.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} sn`;

const ACILISLAR: readonly { deger: AcilisTuru; ad: string; aciklama: string; simge: SimgeAdi }[] = [
  { deger: 'yok', ad: 'Kapalı', aciklama: 'Girişten sonra gösteri yok.', simge: 'x' },
  { deger: 'tezgah', ad: 'Tezgah kalkışı', aciklama: 'Logo satır satır talaşla işlenir, kontur ince takımla geçilir.', simge: 'tool' },
  { deger: 'talas', ad: 'Talaş montajı', aciklama: 'Talaşlar dört yandan girdap gibi gelip logoyu kurar.', simge: 'layers' },
  { deger: 'lazer', ad: 'Lazer kesim', aciklama: 'Işın konturu keser, sac düşer, logo soğur.', simge: 'bolt' },
  { deger: 'cmm', ad: 'Ölçüm (CMM)', aciklama: 'Prob noktaları ölçer, ölçüler çizilir, KABUL damgası basılır.', simge: 'target' },
  { deger: 'dokum', ad: 'Döküm', aciklama: 'Erimiş metal kalıbı doldurur, soğuyarak logo olur.', simge: 'sun' },
  { deger: '3b', ad: '3B ekstrüzyon', aciklama: 'Logo derinlikle döner, öne gelip parlar.', simge: 'cube' },
  { deger: 'rastgele', ad: 'Rastgele', aciklama: 'Her gösteride altısından biri.', simge: 'rotate' },
];

// Küçük sayfa taslağı: kart kendi seviyesini taşır (data-hareket), tasarım değişkenleri yalnız bu kutuda o seviyeye geçer.
// Anahtar değişince taslak yeniden kurulur ve giriş hareketi baştan oynar.
function HareketOnizleme({ seviye, hiz, tur }: { seviye: HareketSeviyesi; hiz: GecisHizi; tur: number }) {
  return (
    <div className="tc-gorunum-onizleme" data-hareket={seviye} data-gecis-hizi={hiz} aria-hidden="true" key={tur}>
      <span className="tc-gorunum-tarama" />
      <span className="tc-gorunum-baslik" />
      <span className="tc-gorunum-satir" />
      <span className="tc-gorunum-satir" />
      <span className="tc-gorunum-satir" />
    </div>
  );
}

// Hareket dili ve açılış gösterisi kartlarla seçilir; seçim hemen kaydedilir ve kabuğa yansır. Yetki Sistem Ayarları'nınkidir.
export function GorunumAyarlari() {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [performans] = usePerformans();
  const logo = useKurumLogosu();
  const liste = useQuery({ queryKey: anahtarlar.liste, queryFn: () => api.get<AyarlarCevabi>('/ayarlar') });
  const [oynat, oynatYaz] = useState<Record<string, number>>({});
  const [onizlenen, onizlenenYaz] = useState<AcilisTuru | null>(null);
  const onizlemeBitti = useCallback(() => { onizlenenYaz(null); }, []);

  const degistir = useMutation({
    mutationFn: ({ anahtar, deger }: { anahtar: string; deger: string | number }) =>
      api.post<Ayar>(`/ayarlar/${encodeURIComponent(anahtar)}/degistir`, { deger } satisfies AyarDegistirGovdesi),
    onSuccess: (guncel) => {
      istemci.setQueryData<AyarlarCevabi>(anahtarlar.liste, (onceki) =>
        onceki && { ayarlar: onceki.ayarlar.map((a) => (a.anahtar === guncel.anahtar ? guncel : a)) });
      void istemci.invalidateQueries({ queryKey: ortakAnahtarlar.gorunum });
      bildir('tamam', 'Görünüm kaydedildi.');
    },
    onError: (hata) => { bildir('hata', hataIletisi(hata, 'Görünüm kaydedilemedi.')); },
  });

  const deger = (anahtar: string): string | null => {
    const ayar = liste.data?.ayarlar.find((a) => a.anahtar === anahtar);
    return ayar?.tur === 'secim' ? ayar.deger : null;
  };
  const hareket = deger('kabuk.hareket');
  const acilis = deger('kabuk.acilis');
  const hiz = (deger('kabuk.gecis-hizi') ?? 'normal') as GecisHizi;
  const sureAyari = liste.data?.ayarlar.find((a) => a.anahtar === 'kabuk.acilis-suresi');
  const kayitliSure = sureAyari?.tur === 'sayi' && sureAyari.deger !== null ? sureAyari.deger : SURE_VARSAYILAN;
  // Kaydırıcı sürüklenirken yerel değer gösterilir; bırakınca bir kez kaydedilir.
  const [surukle, surukleYaz] = useState<number | null>(null);
  const sure = surukle ?? kayitliSure;
  const sureKaydet = () => {
    if (surukle !== null && surukle !== kayitliSure) degistir.mutate({ anahtar: 'kabuk.acilis-suresi', deger: surukle });
    surukleYaz(null);
  };
  const sec = (anahtar: string, yeni: string) => { if (deger(anahtar) !== yeni) degistir.mutate({ anahtar, deger: yeni }); };
  const yenidenOynat = (seviye: string) => { oynatYaz((o) => ({ ...o, [seviye]: (o[seviye] ?? 0) + 1 })); };

  if (liste.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (liste.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Ayarlar alınamadı.')} yenile={() => { void liste.refetch(); }} />;
  return (
    <>
      {performans && (
        <p className="tc-ayar-aciklama">
          Bu cihazda performans modu açık: seçim kaydedilir, ama bu cihazda hareket sade kalır ve açılış oynamaz. Önizlemeler yine çalışır.
        </p>
      )}
      <Kart baslik="Hareket dili">
        <p className="tc-ayar-aciklama">Sayfa geçişleri, paneller ve listelerin ne kadar hareketli olduğu. Karta dokununca seçilir ve herkese uygulanır.</p>
        <div className="tc-gorunum-kartlar" role="radiogroup" aria-label="Hareket dili">
          {HAREKETLER.map((h) => (
            <div key={h.deger} className="tc-gorunum-kart" data-secili={hareket === h.deger ? '' : undefined}>
              <button
                type="button"
                role="radio"
                aria-checked={hareket === h.deger}
                className="tc-gorunum-sec"
                disabled={degistir.isPending}
                onClick={() => { sec('kabuk.hareket', h.deger); yenidenOynat(h.deger); }}
                onMouseEnter={() => { yenidenOynat(h.deger); }}
              >
                <HareketOnizleme seviye={h.deger} hiz={hiz} tur={oynat[h.deger] ?? 0} />
                <span className="tc-gorunum-ad">
                  {h.ad}
                  {hareket === h.deger && <Rozet ton="tamam">Seçili</Rozet>}
                </span>
                <span className="tc-gorunum-aciklama">{h.aciklama}</span>
              </button>
              <Dugme simge="play" onClick={() => { yenidenOynat(h.deger); }}>Önizle</Dugme>
            </div>
          ))}
        </div>
      </Kart>
      <Kart baslik="Geçiş hızı">
        <p className="tc-ayar-aciklama">Seçili hareket dilinin hızı. Önizleme o dili bu hızla oynatır.</p>
        <div className="tc-gorunum-kartlar" role="radiogroup" aria-label="Geçiş hızı">
          {GECISLER.map((g) => (
            <div key={g.deger} className="tc-gorunum-kart" data-secili={hiz === g.deger ? '' : undefined}>
              <button
                type="button"
                role="radio"
                aria-checked={hiz === g.deger}
                className="tc-gorunum-sec"
                disabled={degistir.isPending}
                onClick={() => { sec('kabuk.gecis-hizi', g.deger); yenidenOynat(`hiz-${g.deger}`); }}
                onMouseEnter={() => { yenidenOynat(`hiz-${g.deger}`); }}
              >
                <HareketOnizleme seviye={(hareket ?? 'orta') as HareketSeviyesi} hiz={g.deger} tur={oynat[`hiz-${g.deger}`] ?? 0} />
                <span className="tc-gorunum-ad">
                  {g.ad}
                  {hiz === g.deger && <Rozet ton="tamam">Seçili</Rozet>}
                </span>
                <span className="tc-gorunum-aciklama">{g.aciklama}</span>
              </button>
              <Dugme simge="play" onClick={() => { yenidenOynat(`hiz-${g.deger}`); }}>Önizle</Dugme>
            </div>
          ))}
        </div>
      </Kart>
      <Kart baslik="Açılış gösterisi">
        <p className="tc-ayar-aciklama">Her girişte ve her çıkışta kurum logosuyla bir kez oynar; girişi ve çıkışı bekletmez, dokununca geçilir. Logo yoksa TMI yazısı işlenir.</p>
        <label className="tc-gorunum-sure">
          <span className="tc-gorunum-ad">Süre: {saniye(sure)}</span>
          <input
            type="range"
            min={SURE_EN_AZ}
            max={SURE_EN_COK}
            step={0.1}
            value={sure}
            disabled={degistir.isPending}
            aria-valuetext={saniye(sure)}
            onChange={(e) => { surukleYaz(Number(e.target.value)); }}
            onPointerUp={sureKaydet}
            onKeyUp={sureKaydet}
            onBlur={sureKaydet}
          />
          <span className="tc-gorunum-aciklama">{saniye(SURE_EN_AZ)} ile {saniye(SURE_EN_COK)} arası. Gösteri bu süreye sığacak kadar hızlanır ya da yavaşlar; "Önizle" bu süreyle oynatır.</span>
        </label>
        <div className="tc-gorunum-kartlar" role="radiogroup" aria-label="Açılış gösterisi">
          {ACILISLAR.map((a) => (
            <div key={a.deger} className="tc-gorunum-kart" data-secili={acilis === a.deger ? '' : undefined}>
              <button
                type="button"
                role="radio"
                aria-checked={acilis === a.deger}
                className="tc-gorunum-sec"
                disabled={degistir.isPending}
                onClick={() => { sec('kabuk.acilis', a.deger); }}
              >
                <span className="tc-gorunum-simge"><Simge ad={a.simge} /></span>
                <span className="tc-gorunum-ad">
                  {a.ad}
                  {acilis === a.deger && <Rozet ton="tamam">Seçili</Rozet>}
                </span>
                <span className="tc-gorunum-aciklama">{a.aciklama}</span>
              </button>
              {a.deger !== 'yok' && <Dugme simge="play" onClick={() => { onizlenenYaz(a.deger); }}>Önizle</Dugme>}
            </div>
          ))}
        </div>
      </Kart>
      {onizlenen !== null && !logo.isPending && <AcilisOnizleme tur={onizlenen} sure={sure} logo={logo.data?.logo ?? null} bitti={onizlemeBitti} />}
    </>
  );
}
