// TMI içinde (çerçevede, TMI köprüsüyle) açıldı mı. Köprü üst pencerelerde en üste kadar aranır (önizleme ikinci çerçevededir).
// Üst pencereye erişilemiyorsa (başka köken) gömülü sayılır: ayar gizli kalır.
export function gomuluMu(pencere: Window = window): boolean {
  try {
    for (let w = pencere; w.parent && w.parent !== w;) {
      w = w.parent;
      if (typeof (w as unknown as { __tmiArkonBagla?: unknown }).__tmiArkonBagla === 'function') return true;
    }
    return false;
  } catch {
    return true;
  }
}

// TMI içinde oturum TMI'nindir: köprü Arkon girişini reddeder (istemci baglanti.ts `cevir`, login 403), açılan PIN ekranı geçilemez.
// Bu yüzden gömülüyken ne giriş ekranı ne bosta/vardiya kilidi ne de "Kişi değiştir" vardır.
export function pinGirisiVar(girisGerekli: boolean, gomulu: boolean): boolean {
  return girisGerekli && !gomulu;
}
