import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { test } from 'node:test';
import type { Uc } from './uc.ts';
import { modulBasinaUclar } from './uygulama.ts';

// ADR 0007 madde 4: 'oturum' yalnız kişinin kendi kaydını ya da her oturumun görmesi gereken veriyi okuyan uçtadır. Liste bugünkü
// durumdur; Aşama 2'de rol matrisiyle daralır. Yeni 'oturum' ucu bu listeye kendiliğinden giremez: eklemek kullanıcı kararı ister,
// çıkarmak (ucu işleme bağlamak) listeden silmektir. Her uç sahipliğini beyan eder ('kendi' | 'yok', uc.ts); kayıt seçen 'kendi'
// uçta `test` başkasının kaydının reddedildiği testi gösterir: [sunucu/moduller altındaki dosya, test başlığının parçası].
type Beyan = { readonly sahiplik: 'yok' } | { readonly sahiplik: 'kendi'; readonly test?: readonly [string, string] };

const oturumUclari = async (): Promise<Uc[]> => (await modulBasinaUclar()).flatMap((m) => m.uclar).filter((u) => u.yetki === 'oturum');

const OTURUM_UCLARI: Readonly<Record<string, Beyan>> = {
  'GET /bildirimler': { sahiplik: 'kendi', test: ['bildirim/bildirim.test.ts', 'başkasının bildirimi görünmez'] },
  'GET /bildirimler/cagri-yonlendirme/benim': { sahiplik: 'kendi' },
  'GET /bildirimler/ortada': { sahiplik: 'kendi' },
  'GET /bildirimler/push': { sahiplik: 'kendi' },
  'GET /bildirimler/sayac': { sahiplik: 'kendi' },
  'GET /bildirimler/yayinlar/:id/gorsel': { sahiplik: 'kendi', test: ['bildirim/yayin.test.ts', 'alıcı olmayan göremez'] },
  'GET /calisma-takvimi': { sahiplik: 'kendi', test: ['vardiya/vardiya.test.ts', 'VR-27 (karar 140 a)'] },
  'GET /cizimler/kucuk-resim/:revizyonId/:kare': { sahiplik: 'yok' },
  'GET /cizimler/kucuk-resimler': { sahiplik: 'yok' },
  'GET /cizimler/menu-sayaclari': { sahiplik: 'yok' },
  'GET /dosyalar/:ozet': { sahiplik: 'kendi', test: ['dosya/dosya.test.ts', 'DSK-07'] },
  'GET /finans/kur-faiz-araligi': { sahiplik: 'yok' },
  'GET /finans/kur-ozeti': { sahiplik: 'yok' },
  'GET /finans/menu-sayaclari': { sahiplik: 'yok' },
  'GET /finans/oran-araligi': { sahiplik: 'yok' },
  'GET /finans/oran-ozeti': { sahiplik: 'yok' },
  'GET /gorunum': { sahiplik: 'yok' },
  'GET /guvenlik/menu-sayaclari': { sahiplik: 'yok' },
  // Kişinin kendi oturumları: listeler ve o anki dışındakileri kapatır (2226-7 a).
  'GET /hesabim/oturumlar': { sahiplik: 'kendi' },
  'GET /hesabim/saat-cihazlari': { sahiplik: 'kendi' },
  'GET /idari-isler/menu-sayaclari': { sahiplik: 'yok' },
  'GET /ik/ben': { sahiplik: 'kendi' },
  'GET /ik/izin-gunu': { sahiplik: 'kendi', test: ['ik/puantaj.test.ts', 'soru 74:'] },
  'GET /ik/kisi-vardiyasi': { sahiplik: 'kendi', test: ['ik/puantaj.test.ts', 'soru 75:'] },
  'GET /ik/menu-sayaclari': { sahiplik: 'yok' },
  'GET /ik/puantaj': { sahiplik: 'kendi', test: ['ik/puantaj.test.ts', 'IK-67:'] },
  'GET /ik/veri': { sahiplik: 'kendi' },
  'GET /istasyonlar/secim': { sahiplik: 'yok' },
  'GET /kapali-sayfalar': { sahiplik: 'yok' },
  'GET /karsilama': { sahiplik: 'yok' },
  'GET /kisi-is-merkezleri/:kisiId': { sahiplik: 'kendi', test: ['istasyonlar/istasyonlar.test.ts', 'IS2: kişinin kısıtını'] },
  'GET /kurum': { sahiplik: 'yok' },
  'GET /kurum-logosu': { sahiplik: 'yok' },
  'GET /malzemeler/ozet': { sahiplik: 'yok' },
  'GET /nizamiye/menu-sayaclari': { sahiplik: 'yok' },
  'GET /oturum/cihaz': { sahiplik: 'kendi' },
  'GET /plan/menu-sayaclari': { sahiplik: 'yok' },
  'GET /plan/surum': { sahiplik: 'yok' },
  'GET /planli-duruslar': { sahiplik: 'yok' },
  'GET /profil': { sahiplik: 'kendi' },
  'GET /profil/menu': { sahiplik: 'kendi' },
  'GET /profil/mini-pano': { sahiplik: 'kendi' },
  'GET /profil/tema': { sahiplik: 'kendi' },
  'GET /satin-alma-menu-sayaclari': { sahiplik: 'yok' },
  'GET /satin-alma/ozet': { sahiplik: 'yok' },
  'GET /smartes/menu-sayaclari': { sahiplik: 'yok' },
  'GET /stok/malzeme-kart-bilgileri': { sahiplik: 'yok' },
  'GET /stok/menu-sayaclari': { sahiplik: 'yok' },
  'GET /stok/ozet': { sahiplik: 'yok' },
  // Düzenleyen ya da katılımcı kendi toplantısını görür, `toplantilar.oku` hepsini (kullanıcı kararı 3448-2 a, 19.11.2026).
  'GET /toplantilar': { sahiplik: 'kendi', test: ['toplantilar/toplantilar.test.ts', 'yabancı görmez'] },
  'GET /toplantilar/:id': { sahiplik: 'kendi', test: ['toplantilar/toplantilar.test.ts', 'yabancı görmez'] },
  'GET /uretim-emirleri/ozet': { sahiplik: 'yok' },
  'GET /vardiya-takvimi': { sahiplik: 'yok' },
  'GET /ziyaretcilerim': { sahiplik: 'kendi' },
  'POST /bildirimler/:id/arsivle': { sahiplik: 'kendi', test: ['bildirim/bildirim.test.ts', 'başkasının bildirimi görünmez'] },
  'POST /bildirimler/:id/okundu': { sahiplik: 'kendi', test: ['bildirim/bildirim.test.ts', 'başkasının bildirimi görünmez'] },
  'POST /bildirimler/:id/onayla': { sahiplik: 'kendi', test: ['bildirim/bildirim.test.ts', 'başkasının bildirimi görünmez'] },
  'POST /bildirimler/push/abone-ol': { sahiplik: 'kendi' },
  'POST /bildirimler/push/abonelik-sil': { sahiplik: 'kendi', test: ['bildirim/push-servis.test.ts', 'başkasının aboneliğini silme girişimi reddedilir'] },
  'POST /bildirimler/tumunu-okundu': { sahiplik: 'kendi' },
  'POST /dosyalar/:ozet/parca': { sahiplik: 'kendi', test: ['dosya/dosya.test.ts', 'DSK-06'] },
  'POST /dosyalar/eksikler': { sahiplik: 'kendi' },
  'POST /hesabim/gizlilik-taahhudu': { sahiplik: 'kendi' },
  'POST /hesabim/oturumlar/digerlerini-kapat': { sahiplik: 'kendi' },
  'POST /hesabim/parola-degistir': { sahiplik: 'kendi' },
  'POST /hesabim/pin-degistir': { sahiplik: 'kendi' },
  'POST /hesabim/saat-cihazlari/:id/kapat': { sahiplik: 'kendi', test: ['oturum/saat-belirteci.test.ts', 'başkasınınkini kapatamaz'] },
  'POST /hesabim/saat-onayla': { sahiplik: 'kendi' },
  'POST /ik/personel/:kimlik/iletisim': { sahiplik: 'kendi', test: ['ik/ik.test.ts', 'IK-14:'] },
  'POST /oturum/nabiz': { sahiplik: 'kendi' },
  'POST /profil/geri-bildirim-gonder': { sahiplik: 'kendi' },
  'POST /profil/menu-sec': { sahiplik: 'kendi' },
  'POST /profil/mini-pano-sec': { sahiplik: 'kendi' },
  'POST /profil/tema-sec': { sahiplik: 'kendi' },
  'POST /ziyaretcilerim/:id/iptal': { sahiplik: 'kendi', test: ['nizamiye/nizamiye.test.ts', 'NZ-08 çalışan başkasının ziyaretçisini'] },
  'POST /ziyaretcilerim/on-kayit': { sahiplik: 'kendi' },
};

test('oturum yetkili uçlar onaylı listeyle aynıdır (ADR 0007 madde 4)', async () => {
  const bugun = (await oturumUclari()).map((u) => `${u.yontem} ${u.yol}`);
  const yeni = bugun.filter((u) => !(u in OTURUM_UCLARI)).sort();
  const kalkan = Object.keys(OTURUM_UCLARI).filter((u) => !bugun.includes(u));
  assert.deepEqual(yeni, [], `Yeni 'oturum' ucu: kişinin kendi kaydı değilse işlem listesi ister (yetki: { biri: [...] }). ${yeni.join(', ')}`);
  assert.deepEqual(kalkan, [], `Listedeki uç artık 'oturum' değil; listeden silin: ${kalkan.join(', ')}`);
});

test('her oturum ucunun sahiplik beyanı listedekiyle aynıdır: beyanı değiştirmek listeyi de değiştirmektir', async () => {
  const farkli = (await oturumUclari())
    .filter((u) => OTURUM_UCLARI[`${u.yontem} ${u.yol}`]?.sahiplik !== u.sahiplik)
    .map((u) => `${u.yontem} ${u.yol}: tanımda ${String(u.sahiplik)}, listede ${String(OTURUM_UCLARI[`${u.yontem} ${u.yol}`]?.sahiplik)}`);
  assert.deepEqual(farkli, []);
});

// Adresten ya da sorgudan kayıt seçen 'kendi' uçta başkasının kaydını seçmek mümkündür; reddedildiği bir testle gösterilir.
// Kod 403 ya da 404 olabilir: "bulunamadı" kaydın varlığını sızdırmaz. Girdisi olmayan uç kaydı oturumdan alır, seçemez.
test("kayıt seçen her 'kendi' uç başkasının kaydını reddeden (403 ya da var olan 404: kaydın varlığı sızmaz) testini gösterir ve test dosyası vardır", async () => {
  const eksik: string[] = [];
  for (const u of await oturumUclari()) {
    const ad = `${u.yontem} ${u.yol}`;
    const beyan = OTURUM_UCLARI[ad];
    if (beyan?.sahiplik !== 'kendi') continue;
    if (beyan.test === undefined) {
      if (u.parametre !== null || u.sorgu !== null) eksik.push(`${ad}: kayıt seçiyor, ret testi gösterilmeli`);
      continue;
    }
    // Dosya içeriği okunmaz (test kaynağı metin olarak okumaz); başlık parçası okuyanın testi bulması içindir.
    const [dosya] = beyan.test;
    try {
      await access(new URL(`../moduller/${dosya}`, import.meta.url));
    } catch {
      eksik.push(`${ad}: ${dosya} yok`);
    }
  }
  assert.deepEqual(eksik, []);
});
