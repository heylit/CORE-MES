import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { eskiSurumMu } from '#paylasilan/hata.ts';
import type {
  HesapGovdesi, KisiDuzenleGovdesi, KisiGovdesi, KisiOzeti, PersonelCevabi, ParolaGovdesi, PinVerGovdesi, RollerCevabi,
} from '#paylasilan/sozlesme/kisiler.ts';
import type { KendiParolaGovdesi } from '#paylasilan/sozlesme/oturum.ts';
import { Dugme, DurumKutusu, Girdi, Pencere, Secim, useBildirim } from '../../ortak/arayuz/index.ts';
import { ApiHatasi, api, hataIletisi } from '../../ortak/veri/api.ts';
import { tekrarKorumaliGonder } from '../../ortak/veri/istek-kimligi.ts';
import { GecmisDugmesi } from '../denetim/disari.ts';
import { anahtarlar } from './anahtarlar.ts';
import { kullaniciAdiOner } from './kullanici-adi.ts';

// Yazma cevabındaki kişi listede yerine konur (yoksa eklenir): ikinci bir okuma beklenmez.
export function listeyeYaz(istemci: ReturnType<typeof useQueryClient>, guncel: KisiOzeti): void {
  istemci.setQueryData<PersonelCevabi>(anahtarlar.kisiler, (onceki) => {
    if (!onceki) return onceki;
    const mevcut = onceki.kisiler.some((k) => k.id === guncel.id);
    return { kisiler: mevcut ? onceki.kisiler.map((k) => (k.id === guncel.id ? guncel : k)) : [...onceki.kisiler, guncel] };
  });
}

// Kayıt başkası tarafından değiştirilmişse (409, eski sürüm) liste yenilenir: kullanıcı güncel kaydı görüp yeniden dener.
export function eskiyseYenile(istemci: ReturnType<typeof useQueryClient>, hata: unknown): void {
  if (hata instanceof ApiHatasi && eskiSurumMu(hata.govde)) void istemci.invalidateQueries({ queryKey: anahtarlar.kisiler });
}

interface FormOzellikleri {
  baslik: string;
  gonder: string;
  kapat: () => void;
  gonderiliyor: boolean;
  hazir: boolean;
  onGonder: () => void;
  children: ReactNode;
}

function Form({ baslik, gonder, kapat, gonderiliyor, hazir, onGonder, children }: FormOzellikleri) {
  const sunuldu = (o: FormEvent) => {
    o.preventDefault();
    if (hazir && !gonderiliyor) onGonder();
  };
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik={baslik}
      alt={(
        <>
          <Dugme onClick={kapat} disabled={gonderiliyor}>Vazgeç</Dugme>
          <Dugme tur="birincil" type="submit" form="tc-personel-form" disabled={!hazir} yukleniyor={gonderiliyor}>{gonder}</Dugme>
        </>
      )}
    >
      <form id="tc-personel-form" className="tc-personel-form" onSubmit={sunuldu}>{children}</form>
    </Pencere>
  );
}

export function KisiFormu({ kisi, kapat }: { kisi: KisiOzeti | null; kapat: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [ad, adYaz] = useState(kisi?.ad ?? '');
  const [sicilNo, sicilYaz] = useState(kisi?.sicilNo ?? '');
  const [gorev, gorevYaz] = useState(kisi?.gorev ?? '');
  // İK'ya bağlı kişide bu üç alan İK personel kartından gelir (1302 a); sunucu da değişikliği reddeder.
  const ozlukIk = kisi?.ozlukIk ?? false;
  const ozlukIpucu = ozlukIk
    ? `Ad, sicil no ve görev İK personel kartından gelir; İK'da değiştirin.${kisi?.ozlukCikisTarihi ? ` Çıkış: ${kisi.ozlukCikisTarihi}.` : ''}`
    : undefined;

  const kaydet = useMutation({
    // Ekleme tekrar korumalıdır: cevabı yitirilen gönderim aynı kimlikle yinelenir, ikinci kişi açılmaz.
    mutationFn: (govde: KisiGovdesi) => (kisi === null
      ? tekrarKorumaliGonder((deneme) => api.post<KisiOzeti>('/kisiler', govde, deneme))
      : api.post<KisiOzeti>(`/kisiler/${kisi.id}/duzenle`, { ...govde, surum: kisi.surum } satisfies KisiDuzenleGovdesi)),
    onSuccess: (guncel) => {
      listeyeYaz(istemci, guncel);
      bildir('tamam', kisi === null ? 'Kişi eklendi.' : 'Kişi güncellendi.');
      kapat();
    },
    onError: (hata) => {
      eskiyseYenile(istemci, hata);
      bildir('hata', hataIletisi(hata, 'Kişi kaydedilemedi.'));
    },
  });

  return (
    <Form
      baslik={kisi === null ? 'Kişi ekle' : `Düzenle: ${kisi.ad}`}
      gonder="Kaydet"
      kapat={kapat}
      gonderiliyor={kaydet.isPending}
      hazir={ad.trim() !== ''}
      onGonder={() => kaydet.mutate({ ad, sicilNo, gorev })}
    >
      <Girdi etiket="Ad" required value={ad} onChange={(o) => adYaz(o.target.value)} autoComplete="off" readOnly={ozlukIk} ipucu={ozlukIpucu} />
      <Girdi etiket="Sicil no" value={sicilNo} onChange={(o) => sicilYaz(o.target.value)} autoComplete="off" readOnly={ozlukIk} />
      <Girdi etiket="Görev" value={gorev} onChange={(o) => gorevYaz(o.target.value)} autoComplete="off" readOnly={ozlukIk} />
      {kisi !== null && (
        <GecmisDugmesi kayitlar={[
          { tablo: 'kisi', anahtar: { id: kisi.id } },
          { tablo: 'kisi_rolu', anahtar: { kisi_id: kisi.id } },
          { tablo: 'kisi_islemi', anahtar: { kisi_id: kisi.id } },
        ]} />
      )}
    </Form>
  );
}

export function HesapPenceresi({ kisi, kapat }: { kisi: KisiOzeti; kapat: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [kullaniciAdi, adYaz] = useState(() => kullaniciAdiOner(kisi.ad));
  const [parola, parolaYaz] = useState('');
  const [rolId, rolYaz] = useState('');
  const roller = useQuery({ queryKey: anahtarlar.roller, queryFn: () => api.get<RollerCevabi>('/roller') });

  const ac = useMutation({
    mutationFn: (govde: HesapGovdesi) => api.post<KisiOzeti>(`/kisiler/${kisi.id}/hesap-ac`, govde),
    onSuccess: (guncel) => {
      listeyeYaz(istemci, guncel);
      bildir('tamam', 'Hesap açıldı.');
      kapat();
    },
    onError: (hata) => {
      eskiyseYenile(istemci, hata);
      bildir('hata', hataIletisi(hata, 'Hesap açılamadı.'));
    },
  });

  return (
    <Form
      baslik={`Hesap aç: ${kisi.ad}`}
      gonder="Hesabı aç"
      kapat={kapat}
      gonderiliyor={ac.isPending}
      hazir={kullaniciAdi.trim() !== '' && parola !== '' && rolId !== ''}
      onGonder={() => ac.mutate({ kullaniciAdi, parola, rolId: Number(rolId), surum: kisi.surum })}
    >
      {roller.isError && (
        <DurumKutusu durum="hata" mesaj={hataIletisi(roller.error, 'Roller alınamadı')} yenile={() => { void roller.refetch(); }} />
      )}
      <Girdi etiket="Kullanıcı adı" required value={kullaniciAdi} onChange={(o) => adYaz(o.target.value)} autoComplete="off" />
      <Girdi
        etiket="İlk parola"
        type="password"
        required
        value={parola}
        onChange={(o) => parolaYaz(o.target.value)}
        autoComplete="new-password"
      />
      <Secim
        etiket="Rol"
        required
        bosSecenek="Rol seçin"
        value={rolId}
        onChange={(o) => rolYaz(o.target.value)}
        secenekler={(roller.data?.roller ?? []).map((r) => ({ deger: String(r.id), baslik: r.ad }))}
      />
    </Form>
  );
}

// Verilen PIN geçicidir: kişi ilk girişte kendi PIN'ini belirler. Açık oturumları kapanır.
export function PinPenceresi({ kisi, kapat }: { kisi: KisiOzeti; kapat: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [pin, pinYaz] = useState('');

  const ver = useMutation({
    mutationFn: () => api.post<unknown>(`/kisiler/${kisi.id}/pin-ver`, { pin, surum: kisi.surum } satisfies PinVerGovdesi),
    onSuccess: () => {
      void istemci.invalidateQueries({ queryKey: anahtarlar.kisiler });
      bildir('tamam', 'Geçici PIN verildi. Kişi ilk girişte kendi PIN\'ini belirleyecek.');
      kapat();
    },
    onError: (hata) => {
      eskiyseYenile(istemci, hata);
      bildir('hata', hataIletisi(hata, 'PIN verilemedi.'));
    },
  });

  return (
    <Form
      baslik={`${kisi.pinVar ? 'Yeni PIN ver' : 'PIN ver'}: ${kisi.ad}`}
      gonder="PIN ver"
      kapat={kapat}
      gonderiliyor={ver.isPending}
      hazir={/^[0-9]{6}$/.test(pin)}
      onGonder={() => ver.mutate()}
    >
      <Girdi
        etiket="Geçici PIN"
        ipucu="6 rakam. Kişiye iletin; ilk girişte kendi PIN'ini belirleyecek. Bundan sonra parolayla giremez."
        type="password"
        inputMode="numeric"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        value={pin}
        onChange={(o) => pinYaz(o.target.value.replace(/\D/g, '').slice(0, 6))}
        autoComplete="new-password"
      />
    </Form>
  );
}

// kendi: bekleme 401 döner ama oturum bitmemiştir (oturumBitirmez); oturumu açık kişi kendi parolasını eski parolasıyla değiştirir; değilse başkasınınki, eski parola sorulmaz.
export function ParolaPenceresi({ kisi, kendi, kapat }: { kisi: KisiOzeti; kendi: boolean; kapat: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [eski, eskiYaz] = useState('');
  const [yeni, yeniYaz] = useState('');

  const degistir = useMutation({
    mutationFn: () => (kendi
      ? api.post<unknown>('/hesabim/parola-degistir', { eskiParola: eski, yeniParola: yeni } satisfies KendiParolaGovdesi, { oturumBitirmez: true })
      : api.post<unknown>(`/kisiler/${kisi.id}/parola-degistir`, { yeniParola: yeni, surum: kisi.surum } satisfies ParolaGovdesi)),
    onSuccess: () => {
      // Parola kişinin sürümünü artırır; cevap kişiyi taşımadığı için liste yeniden okunur.
      void istemci.invalidateQueries({ queryKey: anahtarlar.kisiler });
      bildir('tamam', 'Parola değiştirildi.');
      kapat();
    },
    onError: (hata) => {
      eskiyseYenile(istemci, hata);
      bildir('hata', hataIletisi(hata, 'Parola değiştirilemedi.'));
    },
  });

  return (
    <Form
      baslik={kendi ? 'Parolamı değiştir' : `Parola değiştir: ${kisi.ad}`}
      gonder="Parolayı değiştir"
      kapat={kapat}
      gonderiliyor={degistir.isPending}
      hazir={yeni !== '' && (!kendi || eski !== '')}
      onGonder={() => degistir.mutate()}
    >
      {kendi && (
        <Girdi
          etiket="Eski parola"
          type="password"
          required
          value={eski}
          onChange={(o) => eskiYaz(o.target.value)}
          autoComplete="current-password"
        />
      )}
      <Girdi
        etiket="Yeni parola"
        type="password"
        required
        value={yeni}
        onChange={(o) => yeniYaz(o.target.value)}
        autoComplete="new-password"
      />
    </Form>
  );
}
