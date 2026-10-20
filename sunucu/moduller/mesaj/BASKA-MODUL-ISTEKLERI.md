# mesaj: başka modül istekleri

- `kisiler` (`sunucu/moduller/kisiler/disari.ts`): `kisileriListele(db: Db)`; var olan imza, değişiklik istenmez. Etkin kişilerin no ve adı
  çerçevedeki kişi aramasına ve ada çevirmeye gider (`GET /mesaj/kisiler`).
- `denetim`, `oturum` (yalnız testte): `denetimYaz`, `kimlikCozucu`; `kisiler`: `yoneticiOlustur`, `rolAta`, `rolAl` (testte geçici rol).
