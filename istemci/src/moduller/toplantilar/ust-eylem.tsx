import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { UstEylem, UstEylemOzellikleri } from '../../ortak/rota/ust-eylemler.ts';

// Hesap menüsündeki madde Toplantılarım ekranını (Profilim altı, sayfa.profil her roldedir) açar; çubukta düğme yoktur (yer 'hesap').
function ToplantilarimMaddesi({ acmaIstegi = 0 }: UstEylemOzellikleri) {
  const git = useNavigate();
  useEffect(() => { if (acmaIstegi > 0) void git('/profil/toplantilarim'); }, [acmaIstegi, git]);
  return null;
}

// Her çalışan kendi toplantısını görür (3448-2 a): yalnız oturum ister; rol matrisi değişmez.
export const ustEylemler: readonly UstEylem[] = [{
  anahtar: 'toplantilarim', sira: 82, islem: 'oturum', yer: 'hesap', hesapMaddesi: { baslik: 'Toplantılarım', simge: 'calendar' },
  dugme: ToplantilarimMaddesi,
}];
