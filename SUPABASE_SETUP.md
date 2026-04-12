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
- Si ya tenias el esquema anterior, vuelve a ejecutar `supabase/schema.sql` para agregar `debt_payment_capacity`, `debt_target_months`, `debt_strategy_mode`, `payment_key`, columnas de deuda enriquecidas y la tabla `finance_item_payments` con soporte de sincronizacion incremental.
- Si falla la sincronizacion, el chip flotante ahora permite abrir el detalle real del error para distinguir entre problema de esquema, RLS, auth o conectividad.

## Tablas usadas

- `user_profiles`: resumen financiero, moneda activa, capacidad mensual para abonar deudas, plazo objetivo y modo global de ataque.
- `finance_items`: ingresos, tarjetas, prestamos, servicios, deudas y categorias personalizadas con monto original, pago minimo y estado.
- `finance_item_payments`: historial estructurado de abonos parciales y pagos completos por deuda, con `payment_key` para sincronizacion por upsert.

## Migracion recomendada

1. Ejecuta nuevamente [supabase/schema.sql](supabase/schema.sql).
2. Verifica que existan `debt_payment_capacity`, `debt_target_months` y `debt_strategy_mode` en `user_profiles`, junto con las columnas nuevas en `finance_items`.
3. Verifica que exista la columna `payment_key` y su indice unico en `finance_item_payments`.
4. Verifica que exista la tabla `finance_item_payments` con sus politicas RLS.
5. Verifica que `finance_items(user_id, item_key)` y `finance_item_payments(user_id, payment_key)` usen indices unicos normales compatibles con `upsert`.
6. Inicia sesion otra vez en Flexiway y registra un abono para comprobar que la sincronizacion incremental se complete.
