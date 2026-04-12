# Launch Checklist

## Bloqueantes de salida

- Ejecutar nuevamente `supabase/schema.sql` y confirmar que aplica sin errores.
- Confirmar que el login restaura sesion y datos despues de recargar la pagina.
- Confirmar que registrar, editar y eliminar movimientos mantiene consistencia local y remota.
- Confirmar que los pagos parciales y pagos totales reaparecen tras cerrar y abrir sesion.
- Confirmar que el estado flotante de la app muestra `Cargando`, `Guardando`, `Sincronizado`, `Pendiente`, `Reintentando` y `Error` cuando corresponde.
- Confirmar que, ante error de sync, el chip permite abrir el detalle del fallo.

## Preflight tecnico

1. Verificar que `app/supabase-config.js` tenga `url`, `anonKey` y `siteUrl` correctos.
2. Verificar que `supabase/schema.sql` ya fue ejecutado despues del ultimo cambio de esquema.
3. Verificar que `user_profiles`, `finance_items` y `finance_item_payments` tengan RLS activa y politicas creadas.
4. Verificar que existan los indices unicos de `finance_items(user_id, item_key)` y `finance_item_payments(user_id, payment_key)`.
5. Verificar que el proyecto carga sin errores de consola al abrir `index.html`.
6. Ejecutar `npm test` y confirmar que las pruebas base del motor financiero pasan.

## Auth y sesion

1. Crear cuenta nueva y confirmar acceso.
2. Iniciar sesion con credenciales validas.
3. Intentar iniciar sesion con credenciales invalidas y confirmar mensaje visible.
4. Recargar despues del login y confirmar que la sesion se conserva.
5. Cerrar sesion y confirmar que perfil y panel lateral vuelven al estado anonimo.
6. Volver a iniciar sesion con el mismo usuario y confirmar que los datos reaparecen.
7. Probar `Recordar usuario y contrasena` y confirmar que el formulario se completa al volver.

## Datos y sincronizacion

1. Iniciar sesion y registrar un ingreso.
2. Registrar una tarjeta, un prestamo, un servicio y una deuda.
3. Editar al menos un registro existente.
4. Eliminar al menos un registro existente.
5. Registrar un pago parcial y luego un pago total.
6. Recargar `index.html`, `analysis.html`, `credit.html`, `profile.html` y `registrar-gastos.html`.
7. Confirmar que el estado pasa por `Guardando` y luego desaparece tras sincronizar.
8. Abrir una segunda pestaña y confirmar que los cambios terminan convergiendo sin vaciar datos.
9. Desconectar internet temporalmente, registrar un cambio, restaurar internet y confirmar que el estado vuelve a `Cambios guardados` o `Datos sincronizados`.
10. Forzar un error de sync conocido y confirmar que el chip muestra detalle diagnostico al hacer clic.

## Creditos y deuda

1. Crear varias deudas con tasas y vencimientos distintos.
2. Aplicar simulacion `global`, `single` y `duo`.
3. Guardar una simulacion favorita, recargar y volver a cargarla.
4. Confirmar que el orden sugerido y la prioridad sobreviven al refresh.
5. Registrar pagos y verificar que cambian exposicion total, historial y prioridad.
6. Confirmar que los pagos no se duplican ni se pierden tras sincronizar.

## Visual y layout

1. Revisar `index.html`, `analysis.html`, `credit.html`, `profile.html`, `login.html` y `signup.html` en desktop.
2. Revisar esas mismas vistas en ancho movil.
3. Abrir y cerrar sidebar, notificaciones, panel de perfil y drawers laterales.
4. Confirmar que no aparece overflow lateral, huecos blancos ni scroll horizontal inesperado.
5. Confirmar que los estados vacios siguen mostrando texto util y no paneles en blanco.

## Criterios de aceptacion

- Ninguna pagina protegida redirige a login si la sesion existe.
- Ningun registro desaparece tras recargar.
- Los pagos no se duplican ni se pierden tras sincronizar.
- La app nunca queda silenciosamente vacia: siempre informa si esta cargando, en modo local o con error.
- El chip de sync solo queda visible cuando aporta informacion real.
- Las migraciones en Supabase terminan sin errores.
- No hay overflow visual en analisis, creditos, perfil o paneles laterales.
