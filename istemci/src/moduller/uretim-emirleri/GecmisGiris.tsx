import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import type { HurdaNedenleriCevabi } from '#paylasilan/sozlesme/durus-nedenleri.ts';
import type { PersonelCevabi } from '#paylasilan/sozlesme/kisiler.ts';
import type { AdimliEmirCevabi, GecmisGirisCevabi, IsEmri } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Dugme, Girdi, IsaretKutusu, OnayPenceresi, Pencere, Secim, Simge, useBildirim, type MenuOgesi } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { tarihMetni, tarihSaatMetni } from '../../ortak/veri/zaman-metni.ts';
import { zamanMetni } from './gorunum.ts';

// 3455-1: terminal dışında yapılmış adım tarih ve adetle girilir. Süre ve OEE'ye girmez, adet akışına girer; stok hareketi yalnız
// seçilirse yazılır (3455-S1 c, varsayılan yazılmaz). İşlem yalnız yöneticidedir (3455-S2 a). Kural sunucudadır; ekran yalnız
// girilebilecek adımları önerir, ret iletisini sunucudan gösterir.
export const GECMIS_GIRIS_YETKISI = 'uretim-emirleri.gecmis-giris';
const ACILIR = new Set(['taslak', 'planli']);

export function useGecmisGirisYazar(): boolean {
  const oturum = useOturum();
  return ((oturum.data?.islemler ?? []) as readonly string[]).includes(GECMIS_GIRIS_YETKISI);
}

// Bitmiş adımlardan sonraki ilk bekleyenden başlayan, fason ve istasyonsuz adımda duran, son adımı içermeyen ardışık adımlar.
export function girilebilirAdimlar(adimlar: readonly IsEmri[]): IsEmri[] {
  const sirali = [...adimlar].sort((a, b) => a.sira - b.sira);
  if (sirali.some((a) => a.dal != null)) return [];
  const ilk = sirali.findIndex((a) => a.durum !== 'tamam');
  if (ilk < 0) return [];
  const sonuc: IsEmri[] = [];
  for (const a of sirali.slice(ilk, -1)) {
    if (a.durum !== 'bekliyor' || a.kaynak?.tur === 'fason' || a.istasyon === null) break;
    sonuc.push(a);
  }
  return sonuc;
}

export function useGecmisGirisOgesi(emir: { durum: string; malzemeNo?: number | null } | undefined): MenuOgesi[] {
  const yazar = useGecmisGirisYazar();
  const [, yaz] = useSearchParams();
  if (!yazar || emir === undefined || emir.malzemeNo == null || !ACILIR.has(emir.durum)) return [];
  return [{
    anahtar: 'gecmis-giris', baslik: 'Geçmiş üretim gir', simge: 'calendar',
    sec: () => { yaz((a) => { const n = new URLSearchParams(a); n.set('islem', 'gecmis-giris'); return n; }, { replace: true }); },
  }];
}

function useGecmisKomutu(emirId: number, bitti: () => void) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  return useMutation({
    mutationFn: ({ yol, govde }: { yol: 'gecmis-giris' | 'gecmis-giris/geri-al'; govde: object }) =>
      api.post<GecmisGirisCevabi>(`/adimli-emirler/${String(emirId)}/${yol}`, govde, { istekKimligi: yeniIstekKimligi() }),
    onSuccess: async (c, { yol }) => {
      istemci.setQueryData<AdimliEmirCevabi>(anahtarlar.adimli(emirId), { emir: c.emir });
      bildir(c.uyari === null ? 'tamam' : 'bilgi', c.uyari ?? (yol === 'gecmis-giris' ? 'Geçmiş üretim kaydedildi.' : 'Son geçmiş giriş geri alındı.'));
      bitti();
      await istemci.invalidateQueries({ queryKey: anahtarlar.hepsi });
    },
  });
}

// Sağlam elle yazılmadıkça (null) girdi eksi hurdadır; girdi ilk adımda önceki sağlam, sonra bir önceki adımın sağlamıdır.
interface AdimFormu { saglam: string | null; hurda: string; hurdaNedeniId: string; operatorId: string }
const BOS_FORM: AdimFormu = { saglam: null, hurda: '0', hurdaNedeniId: '', operatorId: '' };
const bugunMetni = (): string => new Date().toLocaleDateString('en-CA');
const sayi = (m: string): number => (m.trim() === '' ? Number.NaN : Number(m));

export function GecmisGirisPenceresi({ emirId, emirNo, adet }: { emirId: number; emirNo: string; adet: number }) {
  const [adres, yaz] = useSearchParams();
  const acik = adres.get('islem') === 'gecmis-giris';
  const d = useQuery({
    queryKey: anahtarlar.adimli(emirId),
    queryFn: () => api.get<AdimliEmirCevabi>(`/adimli-emirler/${String(emirId)}`),
    enabled: acik,
  });
  const nedenler = useQuery({
    queryKey: ['uretim-emirleri', 'gecmis-giris', 'hurda-nedenleri'] as const,
    queryFn: () => api.get<HurdaNedenleriCevabi>('/hurda-nedenleri?yalnizAktif=true'),
    enabled: acik,
  });
  const kisiler = useQuery({
    queryKey: ['uretim-emirleri', 'gecmis-giris', 'kisiler'] as const,
    queryFn: () => api.get<PersonelCevabi>('/kisiler'),
    enabled: acik,
  });
  const [son, setSon] = useState<number | null>(null);
  const [baslama, setBaslama] = useState('');
  const [bitis, setBitis] = useState('');
  const [stokaYaz, setStokaYaz] = useState(false);
  const [formlar, setFormlar] = useState<Record<number, AdimFormu>>({});
  const [eksik, setEksik] = useState<string | null>(null);
  const kapat = () => {
    yaz((a) => { const n = new URLSearchParams(a); n.delete('islem'); return n; }, { replace: true });
    setSon(null); setBaslama(''); setBitis(''); setStokaYaz(false); setFormlar({}); setEksik(null); komut.reset();
  };
  const komut = useGecmisKomutu(emirId, kapat);
  const emir = d.data?.emir;
  const adaylar = emir ? girilebilirAdimlar(emir.isEmirleri) : [];
  const sonIndeks = son === null ? -1 : adaylar.findIndex((a) => a.opNo === son);
  const secilen = sonIndeks < 0 ? [] : adaylar.slice(0, sonIndeks + 1);
  const oncekiSaglam = (() => {
    if (!emir || adaylar[0] === undefined) return adet;
    const once = [...emir.isEmirleri].sort((a, b) => a.sira - b.sira).filter((a) => a.sira < (adaylar[0]?.sira ?? 0)).at(-1);
    return once?.saglamAdet ?? adet;
  })();
  const form = (a: IsEmri): AdimFormu => formlar[a.opNo] ?? BOS_FORM;
  const hurdaSayisi = (a: IsEmri): number => sayi(form(a).hurda) || 0;
  const girdiler: number[] = [];
  const saglamlar: string[] = [];
  secilen.forEach((a, i) => {
    const girdi = i === 0 ? oncekiSaglam : sayi(saglamlar[i - 1] ?? '') || 0;
    girdiler.push(girdi);
    saglamlar.push(form(a).saglam ?? String(Math.max(0, girdi - hurdaSayisi(a))));
  });
  const degistir = (a: IsEmri, alan: keyof AdimFormu, deger: string) => {
    setFormlar((f) => ({ ...f, [a.opNo]: { ...form(a), [alan]: deger } }));
  };
  const asanlar = secilen.filter((a, i) => (sayi(saglamlar[i] ?? '') || 0) + hurdaSayisi(a) > (girdiler[i] ?? 0));
  const nedensizler = secilen.filter((a) => hurdaSayisi(a) > 0 && form(a).hurdaNedeniId === '');
  const onayla = () => {
    if (!emir) return;
    if (secilen.length === 0) { setEksik('Hangi adıma kadar bittiğini seçin.'); return; }
    if (baslama === '' || bitis === '') { setEksik('Başlama ve bitiş tarihini girin.'); return; }
    if (bitis < baslama) { setEksik('Bitiş tarihi başlama tarihinden önce olamaz.'); return; }
    if (asanlar.length > 0) { setEksik(`OP${asanlar.map((a) => String(a.opNo)).join(', OP')}: sağlam ve hurda toplamı adıma giren adedi aşamaz.`); return; }
    if (nedensizler.length > 0) { setEksik(`OP${nedensizler.map((a) => String(a.opNo)).join(', OP')}: hurda nedeni seçin.`); return; }
    const adimlar = secilen.map((a, i) => {
      const f = form(a);
      return {
        opNo: a.opNo, baslama: null, bitis: null, saglam: sayi(saglamlar[i] ?? ''), hurda: sayi(f.hurda) || 0,
        hurdaNedeniId: f.hurdaNedeniId === '' ? null : Number(f.hurdaNedeniId), operatorId: f.operatorId === '' ? null : Number(f.operatorId),
      };
    });
    if (adimlar.some((a) => !Number.isInteger(a.saglam) || a.saglam < 0 || !Number.isInteger(a.hurda) || a.hurda < 0)) {
      setEksik('Sağlam ve hurda sıfır ya da pozitif tam sayı olmalıdır.'); return;
    }
    setEksik(null);
    komut.mutate({ yol: 'gecmis-giris', govde: { surum: emir.surum, baslama, bitis, stokaYaz, adimlar } });
  };
  const nedenSecenekleri = (nedenler.data?.nedenler ?? []).map((n) => ({ deger: String(n.id), baslik: n.ad }));
  const kisiSecenekleri = (kisiler.data?.kisiler ?? []).filter((k) => k.aktif).map((k) => ({ deger: String(k.id), baslik: k.ad }));
  const bugun = bugunMetni();

  return (
    <Pencere
      acik={acik} kapat={kapat} baslik={`${emirNo}: geçmiş üretim gir`} tur="yan"
      alt={(
        <>
          <Dugme onClick={kapat} disabled={komut.isPending}>Vazgeç</Dugme>
          <Dugme tur="birincil" simge="check" yukleniyor={komut.isPending} disabled={adaylar.length === 0} onClick={onayla}>Kaydet</Dugme>
        </>
      )}
    >
      <div className="tc-gecmis">
        <p className="tc-emir-not">
          Terminal dışında yapılmış adımları girin. Kayıt süre ve OEE'ye girmez; sağlam adet sonraki adıma geçer. Son adım burada bitirilmez.
          Adım, başlama ve bitiş tarihi zorunludur.
        </p>
        {d.isPending && <p className="tc-emir-not">Adımlar okunuyor.</p>}
        {d.isError && <p className="tc-emir-hurda" role="alert">{hataIletisi(d.error, 'Adımlar alınamadı.')}</p>}
        {emir && adaylar.length === 0 && (
          <p className="tc-emir-hurda" role="alert">
            Geçmiş girilebilecek adım yok: sıradaki adım fason, istasyonsuz, başlamış ya da son adım; ya da emir dallıdır.
          </p>
        )}
        {adaylar.length > 0 && (
          <>
            <Secim etiket="Hangi adıma kadar bitti?" bosSecenek="Seçiniz" value={son === null ? '' : String(son)}
              secenekler={adaylar.map((a) => ({ deger: String(a.opNo), baslik: `OP${String(a.opNo)} ${a.ad}` }))}
              onChange={(e) => { setSon(e.target.value === '' ? null : Number(e.target.value)); }} />
            <div className="tc-gecmis-tarihler">
              <Girdi etiket="Başlama tarihi" type="date" max={bugun} value={baslama} onChange={(e) => { setBaslama(e.target.value); }} />
              <Girdi etiket="Bitiş tarihi" type="date" min={baslama === '' ? undefined : baslama} max={bugun} value={bitis} onChange={(e) => { setBitis(e.target.value); }} />
            </div>
            {secilen.map((a, i) => {
              const f = form(a);
              const hurdaVar = hurdaSayisi(a) > 0;
              return (
                <fieldset key={a.opNo} className="tc-gecmis-adim">
                  <legend><b>OP{a.opNo}</b> {a.ad}{a.istasyon && <small> · {a.istasyon.ad}</small>}<small> · girdi {girdiler[i]}</small></legend>
                  <Girdi etiket="Sağlam" type="number" inputMode="numeric" min={0} value={saglamlar[i] ?? ''}
                    onChange={(e) => { degistir(a, 'saglam', e.target.value); }} />
                  <Girdi etiket="Hurda" type="number" inputMode="numeric" min={0} value={f.hurda}
                    onChange={(e) => { degistir(a, 'hurda', e.target.value); }} />
                  {hurdaVar && (
                    <Secim etiket="Hurda nedeni" bosSecenek="Seçiniz" secenekler={nedenSecenekleri} value={f.hurdaNedeniId}
                      onChange={(e) => { degistir(a, 'hurdaNedeniId', e.target.value); }} />
                  )}
                  <Secim etiket="Operatör (biliniyorsa)" bosSecenek="Bilinmiyor" secenekler={kisiSecenekleri} value={f.operatorId}
                    onChange={(e) => { degistir(a, 'operatorId', e.target.value); }} />
                  {asanlar.includes(a) && (
                    <p className="tc-emir-hurda" role="alert">Sağlam ve hurda toplamı girdiyi ({girdiler[i]}) aşıyor.</p>
                  )}
                </fieldset>
              );
            })}
            <IsaretKutusu etiket="Stoğa hareket yaz" checked={stokaYaz} onChange={(e) => { setStokaYaz(e.target.checked); }} />
            <p className="tc-emir-not">
              {stokaYaz ? 'Sağlam ve hurda adet stok hareketi olarak da yazılır.' : 'Stok değişmez; yalnız emrin adımları ilerler.'}
            </p>
          </>
        )}
        {eksik && <p className="tc-emir-hurda" role="alert">{eksik}</p>}
        {komut.isError && <p className="tc-emir-hurda" role="alert">{hataIletisi(komut.error, 'Kaydedilemedi.')}</p>}
      </div>
    </Pencere>
  );
}

// Emrin son geçmiş girişi (özet kutusundaki "Son hareket" için); şeritle aynı sorguyu paylaşır.
export function useSonGecmisGiris(emirId: number, etkin: boolean): { zaman: string; giren: string } | null {
  const d = useQuery({
    queryKey: anahtarlar.adimli(emirId),
    queryFn: () => api.get<AdimliEmirCevabi>(`/adimli-emirler/${String(emirId)}`),
    enabled: etkin,
  });
  return (d.data?.emir.isEmirleri ?? []).reduce<{ zaman: string; giren: string } | null>((s, a) => {
    const g = a.gecmisGiris;
    return g == null || (s !== null && s.zaman >= g.zaman) ? s : { zaman: g.zaman, giren: g.giren.ad };
  }, null);
}

// Üretim aralığı girişin tarihinden; adım tarihi girilmediyse iş emrinin zamanından (emrin genel aralığıyla dolmuştur).
const gunMetni = (tarih: string | null, an: string | null): string | null =>
  tarih !== null ? tarihMetni(tarih) : an !== null ? tarihSaatMetni(an).slice(0, 10) : null;
function uretimAraligi(baslama: string | null, bitis: string | null, anBaslama: string | null, anBitis: string | null): string {
  const b = gunMetni(baslama, anBaslama);
  const s = gunMetni(bitis, anBitis);
  if (b === null || s === null) return 'tarihi yok';
  return b === s ? b : `${b} - ${s}`;
}

// Geçmiş girişle biten adımların şeridi: hangi adım, kim girdi, stok yazıldı mı. Son giriş, sonraki adım başlamadıysa geri alınır.
export function GecmisGirisSeridi({ emirId }: { emirId: number }) {
  const yazar = useGecmisGirisYazar();
  const [soruyor, setSoruyor] = useState(false);
  const d = useQuery({
    queryKey: anahtarlar.adimli(emirId),
    queryFn: () => api.get<AdimliEmirCevabi>(`/adimli-emirler/${String(emirId)}`),
  });
  const komut = useGecmisKomutu(emirId, () => { setSoruyor(false); });
  const emir = d.data?.emir;
  const girilen = (emir?.isEmirleri ?? []).filter((a) => a.gecmisGiris != null).sort((a, b) => a.sira - b.sira);
  if (!emir || girilen.length === 0) return null;
  const sonAdim = girilen.at(-1);
  return (
    <section className="tc-gecmis-serit" aria-label="Geçmiş girişle biten adımlar">
      <Simge ad="calendar" />
      <div className="tc-gecmis-serit-metin">
        <b>Geçmiş girişle biten adımlar</b>
        <ul>
          {girilen.map((a) => {
            const g = a.gecmisGiris;
            const hurda = g?.hurda ?? 0;
            return (
              <li key={a.id}>
                OP{a.opNo} {a.ad}: {a.saglamAdet ?? 0} sağlam
                {hurda > 0 && `, ${String(hurda)} hurda${g?.hurdaNedeni ? ` (${g.hurdaNedeni.ad})` : ''}`}
                <small>
                  {' · Üretim '}{uretimAraligi(g?.baslama ?? null, g?.bitis ?? null, a.baslama, a.bitis)}
                  {' · Giren '}{g?.giren.ad}, {zamanMetni(g?.zaman ?? null)}
                  {g?.operator && ` · Operatör ${g.operator.ad}`}
                  {g?.stokYazildi ? ' · Stoğa yazıldı' : ' · Stok yazılmadı'}
                </small>
              </li>
            );
          })}
        </ul>
        {komut.isError && <small className="tc-emir-hurda" role="alert">{hataIletisi(komut.error, 'Geri alınamadı.')}</small>}
      </div>
      {yazar && ACILIR.has(emir.durum) && (
        <Dugme simge="rotate" onClick={() => { setSoruyor(true); }}>OP{sonAdim?.opNo} girişini geri al</Dugme>
      )}
      <OnayPenceresi acik={soruyor} baslik={`OP${String(sonAdim?.opNo ?? '')} geçmiş girişi geri alınsın mı?`} onayMetni="Geri al" tehlikeli
        yukleniyor={komut.isPending} vazgec={() => { setSoruyor(false); komut.reset(); }}
        onayla={() => { komut.mutate({ yol: 'gecmis-giris/geri-al', govde: { surum: emir.surum } }); }}>
        <p className="tc-emir-not">Adım yeniden bekler, sayım eksiyle netlenir; stoğa yazılmışsa ters hareket yazılır. Defter satırı silinmez.</p>
      </OnayPenceresi>
    </section>
  );
}
