import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  KisiOzeti, PersonelCevabi, RolGovdesi, RolOzeti, RollerCevabi, SurumGovdesi,
} from '#paylasilan/sozlesme/kisiler.ts';
import {
  Dugme, DurumKutusu, Kart, OnayPenceresi, Pencere, Rozet, Secim, Sekmeler, Tablo, useBildirim,
  type Sekme, type Sutun,
} from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar as ortakAnahtarlar } from '../../ortak/veri/anahtarlar.ts';
import { anahtarlar } from './anahtarlar.ts';
import { YetkiMatrisi } from './YetkiMatrisi.tsx';
import { HesapPenceresi, KisiFormu, ParolaPenceresi, PinPenceresi, eskiyseYenile, listeyeYaz } from './KisiPencereleri.tsx';
import './personel.css';

type Islem = 'rol-ata' | 'rol-al';

function RolPenceresi({ kisiId, kapat }: { kisiId: number; kapat: () => void }) {
  const oturum = useOturum();
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [secili, seciliYaz] = useState('');
  const kisiler = useQuery({ queryKey: anahtarlar.kisiler, queryFn: () => api.get<PersonelCevabi>('/kisiler') });
  const roller = useQuery({ queryKey: anahtarlar.roller, queryFn: () => api.get<RollerCevabi>('/roller') });
  const kisi = kisiler.data?.kisiler.find((k) => k.id === kisiId);

  const degistir = useMutation({
    mutationFn: ({ islem, rolId, surum }: { islem: Islem; rolId: number; surum: number }) =>
      api.post<KisiOzeti>(`/kisiler/${kisiId}/${islem}`, { rolId, surum } satisfies RolGovdesi),
    onSuccess: (guncel, { islem }) => {
      istemci.setQueryData<PersonelCevabi>(anahtarlar.kisiler, (onceki) =>
        onceki && { kisiler: onceki.kisiler.map((k) => (k.id === guncel.id ? guncel : k)) });
      // Kendi rolü değişen kişinin menüsü ve düğmeleri sunucudaki yeni yetkiyle yenilenir.
      if (guncel.id === oturum.data?.id) void istemci.invalidateQueries({ queryKey: ortakAnahtarlar.oturum });
      if (islem === 'rol-ata') seciliYaz('');
      bildir('tamam', islem === 'rol-ata' ? 'Rol atandı.' : 'Rol alındı.');
    },
    onError: (hata) => {
      eskiyseYenile(istemci, hata);
      bildir('hata', hataIletisi(hata, 'Rol değişikliği yapılamadı.'));
    },
  });

  const [bekleyen, onayBekleyen] = useState<RolOzeti | null>(null);
  const sahipOlunmayan = (roller.data?.roller ?? []).filter((r) => !kisi?.roller.some((s) => s.id === r.id));

  return (
    <Pencere acik kapat={kapat} baslik={kisi ? `Roller: ${kisi.ad}` : 'Roller'} alt={<Dugme onClick={kapat}>Kapat</Dugme>}>
      {(kisiler.isPending || roller.isPending) && <DurumKutusu durum="yukleniyor" />}
      {(kisiler.isError || roller.isError) && (
        <DurumKutusu
          durum="hata"
          mesaj={hataIletisi(kisiler.error ?? roller.error, 'Roller alınamadı')}
          yenile={() => { void kisiler.refetch(); void roller.refetch(); }}
        />
      )}
      {kisi && roller.data && (
        <>
          {kisi.roller.length === 0 && <p className="tc-personel-not">Bu kişinin rolü yok.</p>}
          <ul className="tc-personel-liste" aria-label="Kişinin rolleri">
            {kisi.roller.map((rol) => (
              <li key={rol.id} className="tc-personel-satir">
                <span className="tc-personel-rol">{rol.ad}</span>
                <Dugme
                  simge="minus"
                  aria-label={`${rol.ad} rolünü al`}
                  disabled={degistir.isPending}
                  onClick={() => {
                    // Tüm yetkileri veren rol tek dokunuşla alınmaz.
                    if (rol.yonetici === true) onayBekleyen(rol);
                    else degistir.mutate({ islem: 'rol-al', rolId: rol.id, surum: kisi.surum });
                  }}
                >
                  Al
                </Dugme>
              </li>
            ))}
          </ul>
          <div className="tc-personel-ekle">
            <Secim
              etiket="Atanacak rol"
              bosSecenek="Rol seçin"
              value={secili}
              onChange={(o) => seciliYaz(o.target.value)}
              secenekler={sahipOlunmayan.map((r) => ({ deger: String(r.id), baslik: r.ad }))}
            />
            <Dugme
              tur="birincil"
              simge="plus"
              disabled={secili === ''}
              yukleniyor={degistir.isPending}
              onClick={() => degistir.mutate({ islem: 'rol-ata', rolId: Number(secili), surum: kisi.surum })}
            >
              Ata
            </Dugme>
          </div>
        </>
      )}
      <OnayPenceresi
        acik={bekleyen !== null}
        baslik="Rol alınsın mı?"
        onayMetni="Rolü al"
        tehlikeli
        yukleniyor={degistir.isPending}
        vazgec={() => onayBekleyen(null)}
        onayla={() => {
          if (bekleyen === null || kisi === undefined) return;
          degistir.mutate({ islem: 'rol-al', rolId: bekleyen.id, surum: kisi.surum }, { onSettled: () => onayBekleyen(null) });
        }}
      >
        <p>Bu rol bütün yetkileri verir. {kisi?.ad} kişisinden alınsın mı?</p>
      </OnayPenceresi>
    </Pencere>
  );
}

type Gorunum = 'kisiler' | 'matris';
const GORUNUMLER: readonly Sekme<Gorunum>[] = [
  { anahtar: 'kisiler', baslik: 'Kişiler', simge: 'user' },
  { anahtar: 'matris', baslik: 'Yetki matrisi', simge: 'lock' },
];

type Pencere = { tur: 'form' | 'hesap' | 'parola' | 'pin' | 'rol'; kisiId: number | null };

// Ctrl K'den gelen istek (kart #1236): `?yeni=1` boş formu, `?kisi=<id>` o kişinin düzenleme formunu dolu açar, `?gorunum=matris`
// yetki matrisine geçer. Yazma yine formun kendi ucundadır; yetkisi olmayana pencere açılmaz.
const ISTEK_ANAHTARLARI = ['yeni', 'kisi', 'gorunum'] as const;

// Bayrak yalnız kisiler.rol-yonet sahibine görünür; bilinmiyorsa düğme kalır, sunucu reddeder. Bayraklı kişinin kaydını
// yalnız bayraklı kullanıcı düzenler.
const bayrakli = (k: KisiOzeti): boolean => k.roller.some((r) => r.yonetici === true);

export function Personel() {
  const oturum = useOturum();
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const islemler = oturum.data?.islemler ?? [];
  const yazabilir = islemler.includes('kisiler.yaz');
  const yonetebilir = islemler.includes('kisiler.rol-yonet');
  const parolaDegistirebilir = islemler.includes('kisiler.parola-degistir');
  const kisiler = useQuery({ queryKey: anahtarlar.kisiler, queryFn: () => api.get<PersonelCevabi>('/kisiler') });
  const [acik, acikYaz] = useState<Pencere | null>(null);
  const [gorunum, gorunumYaz] = useState<Gorunum>('kisiler');
  const [pasifeAlinacak, pasifeAlinacakYaz] = useState<KisiOzeti | null>(null);

  const benBayrakli = kisiler.data?.kisiler.some((k) => k.id === oturum.data?.id && bayrakli(k)) === true;
  const secili = acik?.kisiId == null ? null : kisiler.data?.kisiler.find((k) => k.id === acik.kisiId) ?? null;
  const kapat = () => acikYaz(null);

  const [istek, istekYaz] = useSearchParams();
  useEffect(() => {
    if (!ISTEK_ANAHTARLARI.some((a) => istek.has(a)) || !oturum.data || !kisiler.data) return;
    const kisiId = Number(istek.get('kisi'));
    const hedef = Number.isInteger(kisiId) && kisiId > 0 ? kisiler.data.kisiler.find((k) => k.id === kisiId) : undefined;
    if (istek.get('gorunum') === 'matris' && yonetebilir) gorunumYaz('matris');
    else if (istek.get('yeni') === '1' && yazabilir) { gorunumYaz('kisiler'); acikYaz({ tur: 'form', kisiId: null }); }
    else if (hedef !== undefined && yazabilir && (benBayrakli || !bayrakli(hedef))) { gorunumYaz('kisiler'); acikYaz({ tur: 'form', kisiId: hedef.id }); }
    // İstek bir kez uygulanır; geri tuşu ya da yenileme pencereyi yeniden açmaz.
    istekYaz((o) => { const y = new URLSearchParams(o); for (const a of ISTEK_ANAHTARLARI) y.delete(a); return y; }, { replace: true });
  }, [istek, istekYaz, oturum.data, kisiler.data, yazabilir, yonetebilir, benBayrakli]);

  const durumDegistir = useMutation({
    mutationFn: ({ kisi, islem }: { kisi: KisiOzeti; islem: 'pasife-al' | 'aktif-yap' }) =>
      api.post<KisiOzeti>(`/kisiler/${kisi.id}/${islem}`, { surum: kisi.surum } satisfies SurumGovdesi),
    onSuccess: (guncel, { islem }) => {
      listeyeYaz(istemci, guncel);
      bildir('tamam', islem === 'pasife-al' ? 'Kişi pasife alındı.' : 'Kişi yeniden aktif yapıldı.');
    },
    onError: (hata) => {
      eskiyseYenile(istemci, hata);
      bildir('hata', hataIletisi(hata, 'Durum değiştirilemedi.'));
    },
  });

  // Pasife almak kişinin girişini kapatır: yanlış satıra dokunuş sormadan uygulanmaz.
  const pasifeAl = (kisi: KisiOzeti) => pasifeAlinacakYaz(kisi);

  const sutunlar: Sutun<KisiOzeti>[] = [
    {
      anahtar: 'ad',
      baslik: 'Ad',
      // Sicil no ve görev adın altında ikinci satırdır: ayrı sütunlar tabloyu masaüstünde karta düşürüyordu.
      hucre: (k) => (
        <span className="tc-personel-ad">
          <span>{k.ad}</span>
          {(k.sicilNo !== null || k.gorev !== null) && (
            <span className="tc-personel-alt">{[k.sicilNo, k.gorev].filter((d) => d !== null).join(' · ')}</span>
          )}
        </span>
      ),
    },
    { anahtar: 'durum', baslik: 'Durum', hucre: (k) => <Rozet ton={k.aktif ? 'tamam' : 'pasif'}>{k.aktif ? 'Aktif' : 'Pasif'}</Rozet> },
    {
      anahtar: 'giris',
      baslik: 'Giriş',
      // Kullanıcı adı yalnız rol yönetene gelir; ötekine giriş türü tek başına kalır.
      hucre: (k) => {
        const tur = !k.girisVar ? 'Yok' : k.pinVar ? 'PIN' : 'Parola';
        if (k.kullaniciAdi === null) return tur;
        return (
          <span className="tc-personel-ad">
            <span className="mono">{k.kullaniciAdi}</span>
            <span className="tc-personel-alt">{tur}</span>
          </span>
        );
      },
    },
    {
      anahtar: 'roller',
      baslik: 'Roller',
      hucre: (k) => k.roller.length === 0
        ? null
        : <span className="tc-personel-roller">{k.roller.map((r) => <Rozet key={r.id}>{r.ad}</Rozet>)}</span>,
    },
  ];
  sutunlar.push({
    anahtar: 'islem',
    baslik: 'İşlem',
    hizala: 'sag',
    kirilmaz: true,
    hucre: (k) => {
      const kendisi = k.id === oturum.data?.id;
      return (
        <span className="tc-personel-satir-islem">
          {yazabilir && (benBayrakli || !bayrakli(k)) && (
            <Dugme simge="edit" aria-label={`${k.ad} düzenle`} title="Düzenle" onClick={() => acikYaz({ tur: 'form', kisiId: k.id })} />
          )}
          {yazabilir && k.aktif && !kendisi && (
            <Dugme
              simge="stop"
              aria-label={`${k.ad} pasife al`}
              title="Pasife al"
              disabled={durumDegistir.isPending}
              onClick={() => pasifeAl(k)}
            />
          )}
          {yazabilir && !k.aktif && (
            <Dugme
              simge="check"
              aria-label={`${k.ad} yeniden aktif yap`}
              title="Yeniden aktif yap"
              disabled={durumDegistir.isPending}
              onClick={() => durumDegistir.mutate({ kisi: k, islem: 'aktif-yap' })}
            />
          )}
          {yonetebilir && !k.girisVar && (
            <Dugme simge="plus" aria-label={`${k.ad} hesap aç`} title="Hesap aç" onClick={() => acikYaz({ tur: 'hesap', kisiId: k.id })} />
          )}
          {k.girisVar && (kendisi || parolaDegistirebilir) && (
            <Dugme
              simge="lock"
              aria-label={kendisi ? 'Parolamı değiştir' : `${k.ad} parolasını değiştir`}
              title={kendisi ? 'Parolamı değiştir' : 'Parola değiştir'}
              onClick={() => acikYaz({ tur: 'parola', kisiId: k.id })}
            />
          )}
          {k.girisVar && !kendisi && parolaDegistirebilir && !bayrakli(k) && (
            <Dugme
              simge="grid"
              aria-label={`${k.ad} için PIN ver`}
              title={k.pinVar ? 'Yeni PIN ver' : 'PIN ver'}
              onClick={() => acikYaz({ tur: 'pin', kisiId: k.id })}
            />
          )}
          {yonetebilir && (
            <Dugme simge="user" aria-label={`${k.ad} rollerini düzenle`} title="Roller" onClick={() => acikYaz({ tur: 'rol', kisiId: k.id })} />
          )}
        </span>
      );
    },
  });

  return (
    <Kart
      baslik="Personel"
      sag={gorunum === 'kisiler' && (
        <span className="tc-personel-islemler">
          {yazabilir && <Dugme tur="birincil" simge="plus" onClick={() => acikYaz({ tur: 'form', kisiId: null })}>Kişi ekle</Dugme>}
          <Dugme simge="rotate" aria-label="Yenile" onClick={() => { void kisiler.refetch(); }} yukleniyor={kisiler.isFetching} />
        </span>
      )}
    >
      {/* Matris bütün yetkili rolü ele verir; sekme yalnız rol yönetene görünür (kart #586). */}
      {yonetebilir && <Sekmeler etiket="Personel görünümü" sekmeler={GORUNUMLER} secili={gorunum} sec={gorunumYaz} />}
      {yonetebilir && gorunum === 'matris' && <YetkiMatrisi />}
      {gorunum === 'kisiler' && kisiler.isPending && <DurumKutusu durum="yukleniyor" />}
      {gorunum === 'kisiler' && kisiler.isError && (
        <DurumKutusu durum="hata" mesaj={hataIletisi(kisiler.error, 'Kişiler alınamadı')} yenile={() => { void kisiler.refetch(); }} />
      )}
      {gorunum === 'kisiler' && kisiler.data && (
        <Tablo etiket="Kişiler" sutunlar={sutunlar} satirlar={kisiler.data.kisiler} satirAnahtari={(k) => k.id} bosMesaj="Kişi yok" />
      )}
      {yazabilir && acik?.tur === 'form' && (acik.kisiId === null || secili !== null) && <KisiFormu kisi={secili} kapat={kapat} />}
      {yonetebilir && acik?.tur === 'hesap' && secili !== null && <HesapPenceresi kisi={secili} kapat={kapat} />}
      {acik?.tur === 'parola' && secili !== null && (
        <ParolaPenceresi kisi={secili} kendi={secili.id === oturum.data?.id} kapat={kapat} />
      )}
      {acik?.tur === 'pin' && secili !== null && <PinPenceresi kisi={secili} kapat={kapat} />}
      {yonetebilir && acik?.tur === 'rol' && acik.kisiId !== null && <RolPenceresi kisiId={acik.kisiId} kapat={kapat} />}
      <OnayPenceresi
        acik={pasifeAlinacak !== null}
        baslik="Pasife alınsın mı?"
        onayMetni="Pasife al"
        tehlikeli
        yukleniyor={durumDegistir.isPending}
        vazgec={() => pasifeAlinacakYaz(null)}
        onayla={() => {
          if (pasifeAlinacak === null) return;
          durumDegistir.mutate({ kisi: pasifeAlinacak, islem: 'pasife-al' }, { onSettled: () => pasifeAlinacakYaz(null) });
        }}
      >
        <p>
          {pasifeAlinacak?.roller.some((r) => r.yonetici === true)
            ? `${pasifeAlinacak.ad} bütün yetkileri veren role sahip. Pasife alınırsa girişi kapanır.`
            : pasifeAlinacak?.girisVar
              ? `${pasifeAlinacak.ad} pasife alınırsa girişi kapanır.`
              : `${pasifeAlinacak?.ad ?? ''} pasife alınacak.`}
        </p>
      </OnayPenceresi>
    </Kart>
  );
}
