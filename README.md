# Świąteczne losowanie

Prosta, statyczna aplikacja Secret Santa — bez serwera, bazy danych i kont.

## Uruchomienie lokalne

Otwórz `index.html` w przeglądarce albo uruchom w katalogu projektu prosty serwer statyczny, np.:

```sh
python -m http.server 8000
```

Następnie otwórz `http://localhost:8000`. Losowanie korzysta z Web Crypto; do udostępniania linków i kopiowania działa najlepiej przez HTTPS lub localhost.

## Publikacja

**GitHub Pages:** w ustawieniach repozytorium wybierz **Pages**, źródło **Deploy from a branch**, gałąź z projektem oraz katalog główny (`/`). Po zapisaniu użyj podanego adresu HTTPS.

**Vercel:** zaimportuj repozytorium w Vercel i opublikuj jako projekt statyczny — bez komendy build i bez katalogu wyjściowego.

## Jak działa link i prywatność

Wyniki są przechowywane w części `#santa=...` wspólnego linku, a nie na serwerze ani w `localStorage`. Ponowne otwarcie tego linku zachowuje to samo losowanie. Z tego powodu nie da się unieważnić ani zmienić wyników po udostępnieniu linku — do nowego losowania utwórz nowy link.

**Każda osoba mająca link może technicznie odczytać komplet wyników.** Interfejs pokazuje uczestnikowi tylko jego wynik, ale wspólny link nie zapewnia poufności wobec jego odbiorców. Nie przesyłaj go poza grupę uczestników. Unikalne imiona są wymagane; użyj pełnych imion lub innych niepowtarzających się nazw w rodzinie.
