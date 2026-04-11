# Launch Checklist

## Bloqueantes de salida

- Ejecutar nuevamente `supabase/schema.sql` para crear `debt_strategy_mode` y `payment_key`.
- Confirmar que el login restaura sesion y datos despues de recargar la pagina.
- Confirmar que registrar, editar y eliminar movimientos mantiene consistencia local y remota.
- Confirmar que los pagos parciales y pagos totales reaparecen tras cerrar y abrir sesion.
- Confirmar que el estado flotante de la app muestra `Cargando`, `Guardando`, `Sincronizado` y `Error` cuando corresponde.

## Pruebas manuales minimas

1. Crear cuenta nueva y confirmar acceso.
2. Iniciar sesion y registrar un ingreso.
3. Registrar una tarjeta, un prestamo, un servicio y una deuda.
4. Registrar un pago parcial y luego un pago total.
5. Recargar cada una de estas vistas: `index.html`, `analysis.html`, `credit.html`, `profile.html`, `registrar-gastos.html`.
6. Cerrar sesion e iniciar sesion otra vez con el mismo usuario.
7. Verificar que dashboard, analisis, creditos y alertas siguen mostrando los datos correctos.
8. Cambiar moneda y modo de deuda, recargar y verificar persistencia.
9. Abrir una segunda pestaña y verificar que los cambios terminan sincronizados sin vaciar la data.
10. Desconectar internet temporalmente, registrar un cambio, restaurar internet y confirmar si el estado vuelve a `Cambios guardados`.

## Criterios de aceptacion

- Ninguna pagina protegida redirige a login si la sesion existe.
- Ningun registro desaparece tras recargar.
- Los pagos no se duplican ni se pierden tras sincronizar.
- La app nunca queda silenciosamente vacia: siempre informa si esta cargando, en modo local o con error.
- Las migraciones en Supabase terminan sin errores.
