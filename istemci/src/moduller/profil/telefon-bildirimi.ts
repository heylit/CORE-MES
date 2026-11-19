// Web Push (ADR 0031): uygulama kapalıyken de sinyal gelsin diye kişi bu cihazı Profilim'de açar (3435-1). Sinyal içeriksizdir; ayrıntıyı service worker
// iç sunucudan çeker. iPhone'da yalnız ana ekrana eklenmiş uygulamada çalışır.
export interface PushOrtami {
  // false: tarayıcı push desteklemiyor ya da bağlam güvenli değil; düğme görünmez.
  destek: boolean;
  // Tarayıcının bu site için bildirim izni; desteklenmiyorsa null. Reddedilmiş izin yalnız tarayıcı ayarından açılır.
  izin(): 'granted' | 'denied' | 'default' | null;
  // Bu cihazın açık aboneliğinin adresi; yoksa null.
  mevcut(): Promise<string | null>;
  // İzin ister ve abone olur; adresi döner. İzin verilmezse atar.
  aboneOl(acikAnahtar: string): Promise<string>;
  // Aboneliği bırakır; bıraktığı adresi döner (yoksa null).
  birak(): Promise<string | null>;
}

export function anahtarBaytlari(b64u: string): Uint8Array<ArrayBuffer> {
  const ham = atob(b64u.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64u.length % 4)) % 4));
  const sonuc = new Uint8Array(new ArrayBuffer(ham.length));
  for (let i = 0; i < ham.length; i += 1) sonuc[i] = ham.charCodeAt(i);
  return sonuc;
}

export function tarayiciPushOrtami(): PushOrtami {
  const destek = typeof window !== 'undefined' && window.isSecureContext && typeof navigator.serviceWorker !== 'undefined'
    && typeof PushManager !== 'undefined' && typeof Notification !== 'undefined';
  const abonelik = async () => (await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription()) ?? null;
  return {
    destek,
    izin: () => (destek ? Notification.permission : null),
    mevcut: async () => (destek ? (await abonelik())?.endpoint ?? null : null),
    aboneOl: async (acikAnahtar) => {
      if ((await Notification.requestPermission()) !== 'granted') throw new Error('Bildirim izni verilmedi.');
      const kayit = await navigator.serviceWorker.ready;
      const a = await kayit.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: anahtarBaytlari(acikAnahtar) });
      return a.endpoint;
    },
    birak: async () => {
      const a = await abonelik();
      if (a === null) return null;
      await a.unsubscribe();
      return a.endpoint;
    },
  };
}
