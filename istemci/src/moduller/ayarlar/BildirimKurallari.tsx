import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  KARSILASTIRMA_ADI, KURAL_GUNLUK_EN_COK, kuralAlanlari, type KuralAlani, type KuralKarsilastirmasi, type KuralliTur,
} from '#paylasilan/sozlesme/bildirim-kural-sabitleri.ts';
import type {
  BildirimKuralEkleGovdesi, BildirimKuralOnIzlemeCevabi, BildirimKuralSatiri, BildirimKurallariCevabi, KuralKosulu,
} from '#paylasilan/sozlesme/bildirim-kural.ts';
import type { BildirimAlicilariCevabi } from '#paylasilan/sozlesme/bildirim.ts';
import { AcKapa, Dugme, DurumKutusu, Girdi, IsaretKutusu, OnayPenceresi, Rozet, Secim, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';

// 3478-3 a: olay başına kurallar. Kural = koşul (VE) + alıcı + kanal + şablon; ön izleme görülmeden kaydedilmez. Kurallar
// `ayarlar.yaz` ile yazılır, kendi düğmesiyle kaydedilir (panelin Kaydet'i alıcı ve e-posta içindir).
export const KURAL_ANAHTARI = ['ayarlar', 'bildirim-kurallari'] as const;

type Roller = BildirimAlicilariCevabi['roller'];
type Kisiler = BildirimAlicilariCevabi['kisiler'];

const karsilastirmalar = (a: KuralAlani | undefined): KuralKarsilastirmasi[] =>
  a?.tip === 'sayi' ? ['=', '!=', '>', '>=', '<', '<='] : ['=', '!=', 'icinde'];

const degerMetni = (a: KuralAlani | undefined, d: KuralKosulu['deger']): string => {
  const ad = (x: string | number) => a?.secenekler?.find((s) => s.deger === String(x))?.etiket ?? String(x);
  return Array.isArray(d) ? d.map(ad).join(', ') : ad(d);
};

export function kosulOzeti(tur: string, kosullar: readonly KuralKosulu[]): string {
  if (kosullar.length === 0) return 'Her olayda';
  const alanlar = new Map(kuralAlanlari(tur).map((a) => [a.ad, a]));
  return kosullar.map((k) => {
    const a = alanlar.get(k.alan);
    return `${a?.etiket ?? k.alan} ${KARSILASTIRMA_ADI[k.karsilastirma]} ${degerMetni(a, k.deger)}`;
  }).join(' ve ');
}

export function useKurallar(etkin: boolean) {
  return useQuery({ queryKey: KURAL_ANAHTARI, enabled: etkin, queryFn: () => api.get<BildirimKurallariCevabi>('/bildirimler/kurallar') });
}

const govdeOf = (k: BildirimKuralSatiri) => ({
  ad: k.ad, acik: k.acik, kosullar: k.kosullar, rolIdleri: k.rolIdleri, kisiIdleri: k.kisiIdleri,
  ortada: k.ortada, eposta: k.eposta, telefon: k.telefon, sablonBaslik: k.sablonBaslik, sablonMetin: k.sablonMetin,
});

export function KuralBolumu({ tur, roller, kisiler }: { tur: KuralliTur; roller: Roller; kisiler: Kisiler }) {
  const sorgu = useKurallar(true);
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [form, setForm] = useState<BildirimKuralSatiri | 'yeni' | null>(null);
  const [silinecek, setSilinecek] = useState<BildirimKuralSatiri | null>(null);
  const [bekliyor, setBekliyor] = useState(false);
  const rolAdi = new Map(roller.map((r) => [r.id, r.ad]));
  const yenile = () => istemci.invalidateQueries({ queryKey: KURAL_ANAHTARI });

  const acikDegistir = async (k: BildirimKuralSatiri, acik: boolean) => {
    setBekliyor(true);
    try {
      await api.post(`/bildirimler/kurallar/${String(k.id)}/degistir`, { ...govdeOf(k), acik, surum: k.surum });
      bildir('tamam', `${k.ad}: ${acik ? 'açıldı' : 'kapandı'}.`);
    } catch (h) { bildir('hata', hataIletisi(h, 'Kural değiştirilemedi.')); }
    await yenile();
    setBekliyor(false);
  };
  const sil = async (k: BildirimKuralSatiri) => {
    setBekliyor(true);
    try {
      await api.post(`/bildirimler/kurallar/${String(k.id)}/sil`, { surum: k.surum });
      bildir('tamam', `${k.ad}: silindi.`);
      setSilinecek(null);
    } catch (h) { bildir('hata', hataIletisi(h, 'Kural silinemedi.')); }
    await yenile();
    setBekliyor(false);
  };

  const kurallar = (sorgu.data?.kurallar ?? []).filter((k) => k.tur === tur);
  return (
    <fieldset className="tc-eposta-grup">
      <legend>Kurallar</legend>
      <p className="tc-ayar-aciklama">
        Koşul tutunca seçilen kişilere ayrı bildirim gider. Olay kapalıyken kurallar da çalışmaz; olayı görme yetkisi olmayan kişi almaz.
      </p>
      {sorgu.isPending && <DurumKutusu durum="yukleniyor" />}
      {sorgu.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'Kurallar alınamadı.')} yenile={() => { void sorgu.refetch(); }} />}
      {sorgu.isSuccess && form === null && (
        <>
          {kurallar.length === 0 && <p className="tc-ayar-aciklama">Bu olayda kural yok.</p>}
          <ul className="tc-kural-liste" aria-label="Kurallar">
            {kurallar.map((k) => {
              const alici = [...k.rolIdleri.map((id) => rolAdi.get(id) ?? `Rol ${String(id)}`), ...(k.kisiIdleri.length > 0 ? [`${String(k.kisiIdleri.length)} kişi`] : [])].join(', ');
              return (
                <li key={k.id} className="tc-kural-satir">
                  <div className="tc-kural-govde">
                    <strong>{k.ad}</strong>
                    <span className="tc-kural-ozet">{kosulOzeti(tur, k.kosullar)}</span>
                    <span className="tc-kural-ozet">
                      <Simge ad="users" boyut="k" />
                      {alici}
                      {k.ortada && <span title="Ekran ortası"><Simge ad="expand" boyut="k" /><span className="tc-gizli-etiket">Ekran ortası</span></span>}
                      {k.eposta && <span title="E-posta"><Simge ad="mail" boyut="k" /><span className="tc-gizli-etiket">E-posta</span></span>}
                      {k.telefon && <span title="Telefon"><Simge ad="bell" boyut="k" /><span className="tc-gizli-etiket">Telefon</span></span>}
                    </span>
                    {k.gecersiz !== null && <Rozet ton="hata">{`Çalışmıyor: ${k.gecersiz}`}</Rozet>}
                  </div>
                  <div className="tc-kural-eylem">
                    <AcKapa etiket={`${k.ad}: Açık`} acik={k.acik} disabled={bekliyor} degistir={(y) => { void acikDegistir(k, y); }} />
                    <Dugme simge="edit" aria-label={`${k.ad}: düzenle`} onClick={() => { setForm(k); }} />
                    <Dugme simge="trash" aria-label={`${k.ad}: sil`} onClick={() => { setSilinecek(k); }} />
                  </div>
                </li>
              );
            })}
          </ul>
          <Dugme simge="plus" onClick={() => { setForm('yeni'); }}>Kural ekle</Dugme>
        </>
      )}
      {form !== null && (
        <KuralFormu
          key={form === 'yeni' ? 'yeni' : `${String(form.id)}:${String(form.surum)}`}
          tur={tur}
          kural={form === 'yeni' ? null : form}
          roller={roller}
          kisiler={kisiler}
          kapat={() => { setForm(null); void yenile(); }}
        />
      )}
      {silinecek && (
        <OnayPenceresi
          acik
          baslik="Kural silinsin mi?"
          tehlikeli
          onayMetni="Sil"
          yukleniyor={bekliyor}
          onayla={() => { void sil(silinecek); }}
          vazgec={() => { setSilinecek(null); }}
        >
          <p>{`"${silinecek.ad}" silinir; bu kuralla gitmiş bildirimler kalır.`}</p>
        </OnayPenceresi>
      )}
    </fieldset>
  );
}

interface KosulTaslagi { alan: string; karsilastirma: KuralKarsilastirmasi; metin: string; secilenler: string[] }

const taslakOf = (k: KuralKosulu): KosulTaslagi => ({
  alan: k.alan, karsilastirma: k.karsilastirma,
  metin: Array.isArray(k.deger) ? k.deger.join(', ') : String(k.deger),
  secilenler: Array.isArray(k.deger) ? [...k.deger] : [String(k.deger)],
});

// Taslağı gövdeye çevirir; eksik değer null döner (alan altında yazılır).
function kosulOf(t: KosulTaslagi, a: KuralAlani | undefined): KuralKosulu | null {
  if (t.karsilastirma === 'icinde') {
    const liste = a?.tip === 'secim' ? t.secilenler : t.metin.split(',').map((x) => x.trim()).filter((x) => x !== '');
    return liste.length === 0 ? null : { alan: t.alan, karsilastirma: 'icinde', deger: liste };
  }
  if (a?.tip === 'secim') return t.secilenler[0] ? { alan: t.alan, karsilastirma: t.karsilastirma, deger: t.secilenler[0] } : null;
  if (a?.tip === 'sayi') {
    const n = Number(t.metin.trim().replace(',', '.'));
    return t.metin.trim() === '' || !Number.isFinite(n) ? null : { alan: t.alan, karsilastirma: t.karsilastirma, deger: n };
  }
  return t.metin.trim() === '' ? null : { alan: t.alan, karsilastirma: t.karsilastirma, deger: t.metin.trim() };
}

function KuralFormu({ tur, kural, roller, kisiler, kapat }: {
  tur: KuralliTur; kural: BildirimKuralSatiri | null; roller: Roller; kisiler: Kisiler; kapat: () => void;
}) {
  const { bildir } = useBildirim();
  const alanlar = kuralAlanlari(tur);
  const alan = new Map(alanlar.map((a) => [a.ad, a]));
  const [ad, setAd] = useState(kural?.ad ?? '');
  const [kosullar, setKosullar] = useState<KosulTaslagi[]>(kural?.kosullar.map(taslakOf) ?? []);
  const [rolIdleri, setRolIdleri] = useState<number[]>(kural?.rolIdleri ?? []);
  const [kisiIdleri, setKisiIdleri] = useState<number[]>(kural?.kisiIdleri ?? []);
  const [ortada, setOrtada] = useState(kural?.ortada ?? false);
  const [eposta, setEposta] = useState(kural?.eposta ?? false);
  const [telefon, setTelefon] = useState(kural?.telefon ?? false);
  const [baslik, setBaslik] = useState(kural?.sablonBaslik ?? '{olay}');
  const [metin, setMetin] = useState(kural?.sablonMetin ?? '');
  const [onIzleme, setOnIzleme] = useState<{ anahtar: string; sonuc: BildirimKuralOnIzlemeCevabi } | null>(null);
  const [calisiyor, setCalisiyor] = useState<'on-izleme' | 'kaydet' | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const kisiAdi = new Map(kisiler.map((k) => [k.id, k.ad]));

  const cevrilen = kosullar.map((t) => kosulOf(t, alan.get(t.alan)));
  const kosulHatasi = cevrilen.some((x) => x === null);
  const govde: BildirimKuralEkleGovdesi = {
    tur, ad: ad.trim(), acik: kural?.acik ?? true, kosullar: cevrilen.filter((x): x is KuralKosulu => x !== null), rolIdleri, kisiIdleri,
    ortada, eposta, telefon, sablonBaslik: baslik.trim(), sablonMetin: metin.trim() === '' ? null : metin.trim(),
  };
  const anahtar = JSON.stringify(govde);
  const eksik = ad.trim() === '' ? 'Kural adı zorunlu.'
    : kosulHatasi ? 'Her koşulun değeri yazılmalı.'
      : rolIdleri.length + kisiIdleri.length === 0 ? 'En az bir rol ya da kişi seçin.'
        : baslik.trim() === '' ? 'Başlık zorunlu.' : null;
  const gorulduMu = onIzleme?.anahtar === anahtar;

  const kosulDegistir = (i: number, d: Partial<KosulTaslagi>) => { setKosullar(kosullar.map((k, j) => (j === i ? { ...k, ...d } : k))); };
  const kosulEkle = () => {
    const a = alanlar[0];
    if (a) setKosullar([...kosullar, { alan: a.ad, karsilastirma: '=', metin: '', secilenler: [] }]);
  };
  const onIzle = async () => {
    setCalisiyor('on-izleme');
    setHata(null);
    try {
      setOnIzleme({ anahtar, sonuc: await api.post<BildirimKuralOnIzlemeCevabi>('/bildirimler/kurallar/on-izleme', govde) });
    } catch (h) { setHata(hataIletisi(h, 'Ön izleme yapılamadı.')); }
    setCalisiyor(null);
  };
  const kaydet = async () => {
    setCalisiyor('kaydet');
    setHata(null);
    try {
      if (kural === null) await api.post('/bildirimler/kurallar/ekle', govde);
      else {
        const { tur: _tur, ...g } = govde;
        await api.post(`/bildirimler/kurallar/${String(kural.id)}/degistir`, { ...g, surum: kural.surum });
      }
      bildir('tamam', `${govde.ad}: kaydedildi.`);
      kapat();
    } catch (h) { setHata(hataIletisi(h, 'Kural kaydedilemedi.')); setCalisiyor(null); }
  };

  const yerTutucular = ['{olay}', ...alanlar.filter((a) => a.para !== true).map((a) => `{${a.ad}}`)].join(' ');
  const eklenebilir = kisiler.filter((k) => !kisiIdleri.includes(k.id));
  const o = onIzleme?.sonuc;
  return (
    <div className="tc-kural-form" aria-label={kural === null ? 'Yeni kural' : `${kural.ad}: düzenle`} role="group">
      <Girdi etiket="Kural adı" value={ad} maxLength={80} onChange={(e) => { setAd(e.target.value); }} />
      <div className="tc-kural-kosullar" role="group" aria-label="Koşullar">
        <span className="tc-alan-etiket">Koşullar (hepsi tutmalı)</span>
        {kosullar.length === 0 && <p className="tc-ayar-aciklama">Koşul yok: olayın her oluşunda gider.</p>}
        {kosullar.map((k, i) => {
          const a = alan.get(k.alan);
          const no = String(i + 1);
          return (
            <div key={no} className="tc-kural-kosul">
              <Secim
                etiket={`Koşul ${no}: alan`}
                value={k.alan}
                secenekler={alanlar.map((x) => ({ deger: x.ad, baslik: x.etiket }))}
                onChange={(e) => {
                  const yeni = alan.get(e.target.value);
                  kosulDegistir(i, { alan: e.target.value, karsilastirma: karsilastirmalar(yeni).includes(k.karsilastirma) ? k.karsilastirma : '=', metin: '', secilenler: [] });
                }}
              />
              <Secim
                etiket={`Koşul ${no}: karşılaştırma`}
                value={k.karsilastirma}
                secenekler={karsilastirmalar(a).map((x) => ({ deger: x, baslik: KARSILASTIRMA_ADI[x] }))}
                onChange={(e) => { kosulDegistir(i, { karsilastirma: e.target.value as KuralKarsilastirmasi }); }}
              />
              {a?.tip === 'secim' && k.karsilastirma === 'icinde' && (
                <div className="tc-cagri-rolleri" role="group" aria-label={`Koşul ${no}: değerler`}>
                  {(a.secenekler ?? []).map((s) => (
                    <IsaretKutusu
                      key={s.deger}
                      etiket={s.etiket}
                      checked={k.secilenler.includes(s.deger)}
                      onChange={(e) => { kosulDegistir(i, { secilenler: e.target.checked ? [...k.secilenler, s.deger] : k.secilenler.filter((x) => x !== s.deger) }); }}
                    />
                  ))}
                </div>
              )}
              {a?.tip === 'secim' && k.karsilastirma !== 'icinde' && (
                <Secim
                  etiket={`Koşul ${no}: değer`}
                  value={k.secilenler[0] ?? ''}
                  bosSecenek="Seçin"
                  secenekler={(a.secenekler ?? []).map((s) => ({ deger: s.deger, baslik: s.etiket }))}
                  onChange={(e) => { kosulDegistir(i, { secilenler: e.target.value === '' ? [] : [e.target.value] }); }}
                />
              )}
              {a?.tip !== 'secim' && (
                <Girdi
                  etiket={`Koşul ${no}: değer`}
                  value={k.metin}
                  inputMode={a?.tip === 'sayi' ? 'decimal' : undefined}
                  ipucu={k.karsilastirma === 'icinde' ? 'Virgülle ayırın.' : undefined}
                  hata={cevrilen[i] === null && k.metin.trim() !== '' ? 'Sayı yazın.' : undefined}
                  onChange={(e) => { kosulDegistir(i, { metin: e.target.value }); }}
                />
              )}
              <Dugme simge="x" aria-label={`Koşul ${no}: çıkar`} onClick={() => { setKosullar(kosullar.filter((_, j) => j !== i)); }} />
            </div>
          );
        })}
        <Dugme simge="plus" disabled={kosullar.length >= 10} onClick={kosulEkle}>Koşul ekle</Dugme>
      </div>
      <span className="tc-alan-etiket">Kime</span>
      <div className="tc-cagri-rolleri" role="group" aria-label="Kural alıcı rolleri">
        {roller.map((r) => (
          <IsaretKutusu
            key={r.id}
            etiket={r.ad}
            checked={rolIdleri.includes(r.id)}
            onChange={(e) => { setRolIdleri(e.target.checked ? [...rolIdleri, r.id].sort((x, y) => x - y) : rolIdleri.filter((x) => x !== r.id)); }}
          />
        ))}
      </div>
      <ul className="tc-alici-kisiler" aria-label="Kural alıcı kişileri">
        {kisiIdleri.map((id) => (
          <li key={id}>
            <Dugme simge="x" aria-label={`${kisiAdi.get(id) ?? `Kişi ${String(id)}`} çıkar`} onClick={() => { setKisiIdleri(kisiIdleri.filter((x) => x !== id)); }}>
              {kisiAdi.get(id) ?? `Kişi ${String(id)}`}
            </Dugme>
          </li>
        ))}
      </ul>
      <Secim
        etiket="Kurala kişi ekle"
        value=""
        bosSecenek="Kişi seçin"
        disabled={eklenebilir.length === 0}
        secenekler={eklenebilir.map((x) => ({ deger: String(x.id), baslik: x.ad }))}
        onChange={(e) => { const id = Number(e.target.value); if (id > 0) setKisiIdleri([...kisiIdleri, id].sort((x, y) => x - y)); }}
      />
      <span className="tc-alan-etiket">Ek kanal (Gelenler'e her zaman düşer)</span>
      <div className="tc-cagri-rolleri" role="group" aria-label="Kural kanalları">
        <IsaretKutusu etiket="Ekran ortası" checked={ortada} onChange={(e) => { setOrtada(e.target.checked); }} />
        <IsaretKutusu etiket="E-posta" checked={eposta} onChange={(e) => { setEposta(e.target.checked); }} />
        <IsaretKutusu etiket="Telefon" checked={telefon} onChange={(e) => { setTelefon(e.target.checked); }} />
      </div>
      <Girdi etiket="Bildirim başlığı" value={baslik} maxLength={200} ipucu={`Yer tutucular: ${yerTutucular}`} onChange={(e) => { setBaslik(e.target.value); }} />
      <Girdi etiket="Bildirim metni (isteğe bağlı)" value={metin} maxLength={1000} onChange={(e) => { setMetin(e.target.value); }} />
      <p className="tc-ayar-aciklama">{`Kural kişi başına günde en çok ${String(KURAL_GUNLUK_EN_COK)} bildirim gönderir. Para tutarı yalnız koşulda kullanılır, metne yazılmaz.`}</p>
      {o && (
        <div className={`tc-kural-on-izleme${gorulduMu ? '' : ' tc-kural-on-izleme-eski'}`} role="status">
          <Simge ad="search" boyut="k" />
          <p>
            {o.olay === 0
              ? `Son ${String(o.gun)} günde bu olay hiç olmadı (olay kapalıyken sayılmaz).`
              : `Son ${String(o.gun)} günde bu olay ${String(o.olay)} kez oldu; ${String(o.uyan)} tanesi koşula uydu. Kural ${String(o.kisi)} kişiye giderdi.`}
            {o.yetkisiz > 0 && ` ${String(o.yetkisiz)} kişi olayı görme yetkisi olmadığı için almaz.`}
            {!gorulduMu && ' Form değişti; yeniden ön izleyin.'}
          </p>
        </div>
      )}
      {hata && <p className="tc-alan-alt" role="alert">{hata}</p>}
      <div className="tc-eposta-eylemler">
        <Dugme onClick={kapat}>Vazgeç</Dugme>
        <Dugme simge="search" disabled={eksik !== null} yukleniyor={calisiyor === 'on-izleme'} title={eksik ?? undefined} onClick={() => { void onIzle(); }}>Ön izle</Dugme>
        <Dugme tur="birincil" simge="check" disabled={!gorulduMu || eksik !== null} yukleniyor={calisiyor === 'kaydet'} title={gorulduMu ? undefined : 'Önce ön izleyin.'} onClick={() => { void kaydet(); }}>
          Kuralı kaydet
        </Dugme>
      </div>
      {eksik !== null && <p className="tc-ayar-aciklama">{eksik}</p>}
    </div>
  );
}
