// Lógica de análisis financiero para Flexiway
// Lee los datos de localStorage y calcula métricas para analysis.html

function getAllGastos() {
  const tarjetas = JSON.parse(localStorage.getItem('tarjetasCredito')||'[]');
  const prestamos = JSON.parse(localStorage.getItem('prestamos')||'[]');
  const servicios = JSON.parse(localStorage.getItem('servicios')||'[]');
  const deudas = JSON.parse(localStorage.getItem('deudas')||'[]');
  const customCats = JSON.parse(localStorage.getItem('customCats')||'[]');
  return { tarjetas, prestamos, servicios, deudas, customCats };
}

function calcularResumenGastos() {
  const { tarjetas, prestamos, servicios, deudas, customCats } = getAllGastos();
  let totalTarjetas = tarjetas.reduce((acc, t) => acc + (Number(t.monto)||0), 0);
  let totalPrestamos = prestamos.reduce((acc, p) => acc + (Number(p.monto)||0), 0);
  let totalServicios = servicios.reduce((acc, s) => acc + (Number(s.monto)||0), 0);
  let totalDeudas = deudas.reduce((acc, d) => acc + (Number(d.monto)||0), 0);
  let totalCustom = customCats.reduce((acc, c) => acc + (Number(c.monto)||0), 0);
  let totalGastos = totalTarjetas + totalPrestamos + totalServicios + totalDeudas + totalCustom;
  return {
    totalTarjetas, totalPrestamos, totalServicios, totalDeudas, totalCustom, totalGastos
  };
}

function mostrarKPIs() {
  const resumen = calcularResumenGastos();
  if(document.getElementById('kpi-tarjetas')) document.getElementById('kpi-tarjetas').textContent = '$' + resumen.totalTarjetas.toLocaleString();
  if(document.getElementById('kpi-prestamos')) document.getElementById('kpi-prestamos').textContent = '$' + resumen.totalPrestamos.toLocaleString();
  if(document.getElementById('kpi-servicios')) document.getElementById('kpi-servicios').textContent = '$' + resumen.totalServicios.toLocaleString();
  if(document.getElementById('kpi-deudas')) document.getElementById('kpi-deudas').textContent = '$' + resumen.totalDeudas.toLocaleString();
  if(document.getElementById('kpi-custom')) document.getElementById('kpi-custom').textContent = '$' + resumen.totalCustom.toLocaleString();
  if(document.getElementById('kpi-total')) document.getElementById('kpi-total').textContent = '$' + resumen.totalGastos.toLocaleString();
}

document.addEventListener('DOMContentLoaded', mostrarKPIs);
