import { useId, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MODUL_ADLARI } from '#paylasilan/islem-adlari.ts';
import { kalipHatasi, numaraDonemi, numaraKur, type NumaraDonemi } from '#paylasilan/numara.ts';
import type { Ayar, AyarDegistirGovdesi, AyarlarCevabi, NumaraSayaclariCevabi } from '#paylasilan/sozlesme/ayarlar.ts';
import type { KatalogKodSiralariCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import { Dugme, DurumKutusu, Kart, Rozet, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import { ApiHatasi, api, hataIletisi } from '../../ortak/veri/api.ts';
import { GecmisDugmesi } from '../denetim/disari.ts';
import { anahtarlar } from './anahtarlar.ts';
import { gorulenDeger } from './gorulen.ts';
import './numara-kurallari.css';

type NumaraAyari = Extract<Ayar, { tur: 'numara' }>;
type NumaraSayaci = NumaraSayaclariCevabi['numaralar'][number];

// Önizlemedeki belge alanı değerleri yer tutucudur; gerçek değeri numarayı isteyen modül verir.
const ORNEK_ALANLAR: Readonly<Record<string, string>> = { FIRMA: 'FRM', PROJE: 'PRJ', PARCA: 'PRC', TUR: 'HM' };

const ornekAlanlari = (alanlar: readonly string[], firmaKodu: string | null): Record<string, string> =>
  Object.fromEntries(alanlar.map((a) => [a, a === 'FIRMA' && firmaKodu !== null ? firmaKodu : (ORNEK_ALANLAR[a] ?? a)]));

export function numaraOnizlemesi(kalip: string, alanlar: readonly string[], tarih: Date): { ornek: string } | { hata: string } {
  const hata = kalipHatasi(kalip, alanlar);
  if (hata !== null) return { hata };
  return { ornek: numaraKur(kalip, { yil: tarih.getFullYear(), ay: tarih.getMonth() + 1, sira: 1, alanlar: ornekAlanlari(alanlar, null) }) };
}

const SIFIRLANMA: Readonly<Record<NumaraDonemi, string>> = { ay: 'Her ay', yil: 'Her yıl', hep: 'Sıfırlanmaz' };

// Sayaç verilen son sıradır; sıradaki numara bir fazlasıdır. Dolu çıkarsa sunucu atlar, bu yüzden ekranda "örnek" sayılır.
export function siradakiNumara(kalip: string, alanlar: readonly string[], yil: number, ay: number, sonSira: number, firmaKodu: string | null): string {
  return numaraKur(kalip, { yil, ay, sira: sonSira + 1, alanlar: ornekAlanlari(alanlar, firmaKodu) });
}

const BOS = 'Henüz numara verilmedi';

function SayacHucreleri({ ayar, sayac, yil, ay, firmaKodu, sonSira }: {
  ayar: NumaraAyari; sayac: NumaraSayaci | undefined; yil: number; ay: number; firmaKodu: string | null; sonSira: number | null;
}) {
  const kalip = ayar.deger;
  const sifirlanma = sayac?.sifirlanma ?? (kalip === null ? null : numaraDonemi(kalip));
  return (
    <>
      <span className="tc-numara-donem" role="cell">
        <span className="tc-numara-hucre-etiket">Sıfırlanma</span>
        <span>{sifirlanma === null ? '-' : SIFIRLANMA[sifirlanma]}</span>
      </span>
      <span className="tc-numara-sayi" role="cell">
        <span className="tc-numara-hucre-etiket">Sayaç</span>
        <span className="tc-numara-mono">{sonSira === null ? '-' : sonSira}</span>
      </span>
      <span className="tc-numara-siradaki" role="cell">
        <span className="tc-numara-hucre-etiket">Sıradaki</span>
        {kalip === null || sayac === undefined
          ? <span>-</span>
          : sonSira === null
            ? <span className="tc-numara-bos">{BOS}</span>
            : <span className="tc-numara-mono tc-numara-kalin">{siradakiNumara(kalip, ayar.alanlar, yil, ay, sonSira, firmaKodu)}</span>}
      </span>
    </>
  );
}

function NumaraSatiri({ ayar, sayac, yil, ay, mesgul, degistir }: {
  ayar: NumaraAyari; sayac: NumaraSayaci | undefined; yil: number; ay: number; mesgul: boolean; degistir: (deger: string) => void;
}) {
  const [metin, setMetin] = useState(() => ayar.deger ?? '');
  const [kayitli, setKayitli] = useState(ayar.deger);
  const [acik, setAcik] = useState(false);
  const aciklamaKimligi = useId();
  const altKimligi = useId();
  if (kayitli !== ayar.deger) { setKayitli(ayar.deger); setMetin(ayar.deger ?? ''); }
  const temiz = metin.trim();
  const onizleme = numaraOnizlemesi(temiz, ayar.alanlar, new Date(yil, ay - 1, 1));
  const degisti = 'ornek' in onizleme && (temiz !== ayar.deger || ayar.gecersiz === true);
  const duzenleniyor = temiz !== (ayar.deger ?? '');
  const kullanilabilir = ['{YYYY}', '{YY}', '{AA}', '{SAYAC:n}', ...ayar.alanlar.map((a) => `{${a}}`)].join(' ');
  const firmali = ayar.deger?.includes('{FIRMA}') === true && (sayac?.sayaclar.length ?? 0) > 0;
  const tekSayac = firmali ? null : (sayac?.sayaclar[0]?.sonSira ?? null);
  const modul = sayac === undefined ? '' : (MODUL_ADLARI[sayac.modul] ?? sayac.modul);
  const gonder = (olay: FormEvent) => {
    olay.preventDefault();
    if (degisti) degistir(temiz);
  };
  const alt = 'hata' in onizleme ? onizleme.hata : duzenleniyor ? `Örnek: ${onizleme.ornek}` : null;
  const sifirlanmaMetni = ayar.deger === null ? null : SIFIRLANMA[sayac?.sifirlanma ?? numaraDonemi(ayar.deger)];
  return (
    <>
      <div className="tc-numara-satir" role="row" data-anahtar={ayar.anahtar}>
        <span className="tc-numara-modul" role="cell">{modul}</span>
        <span className="tc-numara-ad" role="rowheader">
          <span className="tc-numara-ad-metin">
            <span className="tc-numara-kalin">{ayar.baslik}</span>
            {modul !== '' && <small>{modul}</small>}
            {ayar.gecersiz === true && <Rozet ton="uyari">Kayıtlı kalıp okunamıyor; yeni kalıp kaydedin.</Rozet>}
          </span>
          <button
            type="button" className="tc-numara-bilgi" aria-expanded={acik} aria-controls={aciklamaKimligi}
            aria-label={`Açıklama: ${ayar.baslik}`} onClick={() => setAcik(!acik)}
          >
            <Simge ad="help" />
          </button>
        </span>
        <form className="tc-numara-kalip" role="cell" onSubmit={gonder}>
          {/* Uzun kalıp kesilmesin diye çok satırlı kutu; satır sonu kalıpta yoktur, Enter kaydeder. */}
          <textarea
            className="tc-alan-kutu tc-numara-mono tc-numara-kalip-kutu"
            rows={1}
            aria-label={`${ayar.baslik} kalıbı`}
            aria-describedby={alt === null ? undefined : altKimligi}
            aria-invalid={'hata' in onizleme ? true : undefined}
            value={metin}
            onChange={(olay) => setMetin(olay.target.value.replace(/[\r\n]/g, '').toLocaleUpperCase('tr-TR'))}
            onKeyDown={(olay) => { if (olay.key === 'Enter') { olay.preventDefault(); olay.currentTarget.form?.requestSubmit(); } }}
            disabled={mesgul}
          />
          {sifirlanmaMetni !== null && <span className="tc-numara-donem-kucuk">Sıfırlanma: {sifirlanmaMetni}</span>}
          {duzenleniyor && <Dugme type="submit" tur="birincil" simge="check" disabled={mesgul || !degisti}>Kaydet</Dugme>}
          {alt !== null && (
            <p id={altKimligi} className={`tc-numara-alt${'hata' in onizleme ? ' tc-numara-hata' : ''}`} role={'hata' in onizleme ? 'alert' : undefined}>{alt}</p>
          )}
        </form>
        <SayacHucreleri ayar={ayar} sayac={sayac} yil={yil} ay={ay} firmaKodu={null} sonSira={tekSayac} />
      </div>
      {firmali && sayac?.sayaclar.map((s) => (
        <div key={s.firmaKodu ?? ''} className="tc-numara-satir tc-numara-alt-satir" role="row">
          <span className="tc-numara-modul" role="cell" />
          <span className="tc-numara-ad" role="rowheader">{s.firmaKodu === null ? 'Firma kodu boş' : `Firma ${s.firmaKodu}`}</span>
          <span className="tc-numara-kalip" role="cell" />
          <SayacHucreleri ayar={ayar} sayac={sayac} yil={yil} ay={ay} firmaKodu={s.firmaKodu} sonSira={s.sonSira} />
        </div>
      ))}
      <div id={aciklamaKimligi} className="tc-numara-aciklama" role="row" hidden={!acik}>
        <p role="cell">{ayar.aciklama} Kullanılabilir alanlar: {kullanilabilir}</p>
      </div>
    </>
  );
}

// Koda gömülü biçimler: buradan değiştirilemez. Örnekler uydurmadır.
const SABITLER: readonly { ad: string; ornek: string; aciklama: string; modul: string; katalog?: true }[] = [
  { ad: 'Refakat kartı etiketi', ornek: 'ORN-UE-0042-P2', aciklama: 'Emir numarası, "-P" ve parti sırası. Kartı basan her ekran aynı biçimi kullanır.', modul: 'stok' },
  { ad: 'Bölünen emir', ornek: 'ORN-UE-0042/2', aciklama: 'Üst emrin numarası, "/" ve kol sırası; var olan numara değişmez.', modul: 'uretim-emirleri' },
  { ad: 'Stok malzeme fişi', ornek: 'SR-000123', aciklama: 'Fiş türü (SR, UG, FR, SF, SE, AF), "-" ve kayıt kimliği 6 hane. Sayaç yok, kimlik kullanılır.', modul: 'stok' },
  { ad: 'Demirbaş numarası', ornek: 'DB-00042', aciklama: '"DB-" ve kayıt kimliği 5 hane. Sayaç yok.', modul: 'idari-isler' },
  { ad: 'Malzeme katalog kodu', ornek: 'HM-ORN-00042', aciklama: 'Önek ve 5 haneli sıra; her önekin kendi sayacı var, Logo\'da dolu kod atlanır.', modul: 'malzemeler', katalog: true },
  { ad: 'Markalama seri numarası', ornek: 'PRC-2648-00007', aciklama: 'Malzeme başına şablon; sayaç malzeme, emir ya da yıl kapsamında. Markalama ekranında tanımlanır.', modul: 'markalama' },
  { ad: 'Numune lotu', ornek: 'LOT-2026-0007', aciklama: '"LOT-", yıl ve o yılın en büyük sırası + 1. Stok lot numarasından ayrıdır.', modul: 'kalite-merkezi' },
  { ad: 'Hazırlık özel madde kodu', ornek: 'ozel-c', aciklama: 'Veritabanı sırasından harfle: 1 a, 26 z, 27 aa.', modul: 'uretim-emirleri' },
  { ad: 'Rota OP numarası', ornek: '10, 20, 30', aciklama: 'Üründe verilmiş en büyük OP numarasının 10 fazlası; silinen adımın numarası yeniden verilmez.', modul: 'rota' },
];

function SabitNumaralar() {
  const siralar = useQuery({
    queryKey: anahtarlar.katalogKodSiralari,
    queryFn: () => api.get<KatalogKodSiralariCevabi>('/malzeme-katalogu-kod-siralari'),
  });
  return (
    <Kart baslik="Sabit biçimli numaralar">
      <p className="tc-ayar-aciklama tc-numara-sabit-ust">
        <Rozet ton="pasif">Salt okunur</Rozet>
        <span>Bu numaralar koda gömülüdür; buradan değiştirilemez. Örnekler uydurmadır.</span>
      </p>
      <ul className="tc-numara-sabit" aria-label="Sabit biçimli numaralar">
        {SABITLER.map((s) => (
          <li key={s.ad}>
            <span className="tc-numara-sabit-ad">
              <span className="tc-numara-kalin">{s.ad}</span>
              <small>{MODUL_ADLARI[s.modul] ?? s.modul}</small>
            </span>
            <span className="tc-numara-mono">{s.ornek}</span>
            <span className="tc-numara-sabit-aciklama">
              {s.aciklama}
              {s.katalog === true && siralar.data !== undefined && (
                <span className="tc-numara-mono tc-numara-sabit-ek">
                  {siralar.data.siralar.length === 0
                    ? 'Henüz katalog kodu verilmedi.'
                    : `Önek başına son sıra: ${siralar.data.siralar.map((x) => `${x.onek} ${String(x.sonSira)}`).join(' · ')}`}
                </span>
              )}
              {s.katalog === true && siralar.isError && <span className="tc-numara-sabit-ek">Önek sıraları alınamadı.</span>}
            </span>
            <span className="tc-numara-sabit-modul">{MODUL_ADLARI[s.modul] ?? s.modul}</span>
          </li>
        ))}
      </ul>
    </Kart>
  );
}

// 3747: Numara kuralları sekmesi. Kalıp burada düzenlenir; sayaç yalnız gösterilir (elle düzenleme yok).
export function NumaraKurallari() {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const liste = useQuery({ queryKey: anahtarlar.liste, queryFn: () => api.get<AyarlarCevabi>('/ayarlar') });
  const sayaclar = useQuery({ queryKey: anahtarlar.numaraSayaclari, queryFn: () => api.get<NumaraSayaclariCevabi>('/numara-sayaclari') });

  // Ekranın gördüğü kalıp `beklenen` olarak gider; başka yönetici arada değiştirdiyse sunucu 409 verir ve liste yenilenir.
  const degistir = useMutation({
    mutationFn: ({ anahtar, deger }: { anahtar: string; deger: string }) =>
      api.post<Ayar>(`/ayarlar/${encodeURIComponent(anahtar)}/degistir`, { deger, beklenen: gorulenDeger(istemci, anahtar) } satisfies AyarDegistirGovdesi),
    onSuccess: (guncel) => {
      istemci.setQueryData<AyarlarCevabi>(anahtarlar.liste, (onceki) =>
        onceki && { ayarlar: onceki.ayarlar.map((a) => (a.anahtar === guncel.anahtar ? guncel : a)) });
      void istemci.invalidateQueries({ queryKey: anahtarlar.numaraSayaclari });
      bildir('tamam', 'Ayar kaydedildi.');
    },
    onError: (hata) => {
      bildir('hata', hataIletisi(hata, 'Ayar kaydedilemedi.'));
      if (hata instanceof ApiHatasi && hata.durum === 409) void istemci.invalidateQueries({ queryKey: anahtarlar.liste });
    },
  });

  const ayarlar = liste.data?.ayarlar.filter((a): a is NumaraAyari => a.tur === 'numara');
  const simdi = new Date();
  const yil = sayaclar.data?.yil ?? simdi.getFullYear();
  const ay = sayaclar.data?.ay ?? simdi.getMonth() + 1;
  return (
    <>
      <Kart baslik="Numara kuralları" sag={ayarlar && <GecmisDugmesi kayitlar={ayarlar.map((a) => ({ tablo: 'ayar', anahtar: { anahtar: a.anahtar } }))} />}>
        {liste.isPending && <DurumKutusu durum="yukleniyor" />}
        {liste.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Ayarlar alınamadı.')} yenile={() => { void liste.refetch(); }} />}
        {sayaclar.isError && (
          <DurumKutusu durum="hata" mesaj={hataIletisi(sayaclar.error, 'Sayaçlar alınamadı.')} yenile={() => { void sayaclar.refetch(); }} />
        )}
        {ayarlar && (
          <div className="tc-numara-tablo" role="table" aria-label="Numara kuralları ve sayaçlar">
            <div className="tc-numara-satir tc-numara-baslik" role="row">
              <span className="tc-numara-modul" role="columnheader">Modül</span>
              <span role="columnheader">Numara</span>
              <span role="columnheader">Kalıp</span>
              <span className="tc-numara-donem" role="columnheader">Sıfırlanma</span>
              <span role="columnheader">Sayaç</span>
              <span role="columnheader">Sıradaki numara</span>
            </div>
            {ayarlar.map((ayar) => (
              <NumaraSatiri
                key={ayar.anahtar}
                ayar={ayar} sayac={sayaclar.data?.numaralar.find((n) => n.anahtar === ayar.anahtar)} yil={yil} ay={ay}
                mesgul={degistir.isPending} degistir={(deger) => { degistir.mutate({ anahtar: ayar.anahtar, deger }); }}
              />
            ))}
          </div>
        )}
        <p className="tc-ayar-aciklama">
          Sayaç bu dönemde verilen son sıradır; çakışan numara atlanınca da ilerler. Sıradaki numara örnektir: dolu çıkarsa bir
          sonraki verilir. FRM, PRJ, PRC ve HM yer tutucudur; gerçek değeri kaydı açan ekran verir. Sayaç buradan değiştirilemez.
        </p>
      </Kart>
      <SabitNumaralar />
    </>
  );
}
