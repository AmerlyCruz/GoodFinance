# Configuracion de Supabase para Flexiway

1. Crea un proyecto en Supabase.
2. En Authentication, habilita Email si vas a usar correo y contrasena.
3. Si no quieres confirmacion por correo durante pruebas, desactiva `Confirm email`.
4. En SQL Editor ejecuta el contenido de `supabase/schema.sql`.
5. Abre `app/supabase-config.js` y pega:
   - `url`: Project URL
   - `anonKey`: anon public key
   - `siteUrl`: URL publica base donde corre la app, por ejemplo `https://tudominio.com` o `https://tudominio.com/flexiway`
6. Recarga la app.

## Confirmacion por correo

- Si Supabase envia enlaces a `localhost`, el problema esta en la URL de redireccion usada por Auth.
- Flexiway ahora intenta enviar la confirmacion a `siteUrl/login.html`.
- Si `siteUrl` esta vacio, la app usa la URL HTTP(S) actual del navegador como base.
- En Supabase Authentication > URL Configuration debes registrar esa URL publica en `Site URL` o `Redirect URLs`.

## Comportamiento

- Si `url` y `anonKey` estan vacios, Flexiway sigue funcionando en modo local con `localStorage`.
- Si completas la configuracion, el login, registro y los movimientos se sincronizan con Supabase.
- La app conserva `localStorage` como cache del navegador para no romper las vistas existentes.

## Tablas usadas

- `user_profiles`: resumen financiero y moneda activa.
- `finance_items`: ingresos, tarjetas, prestamos, servicios, deudas y categorias personalizadas.
