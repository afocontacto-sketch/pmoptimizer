# Nuevas Instrucciones - Reorganización de Módulos ERP

**Fecha:** 2026-11-10  
**Referencia:** nuevas instrucciones para el proyecto.txt

---

## 📋 Reorganización de Módulos

### 1. **PLANNING** (Mejorar)
- ✅ Gantt (ya hecho)
- ✅ Crear Plan de Mantenimiento (después del Gantt)
- ❌ **REMOVER:** Llamadas futuras (mover a SUPPLY)
- ❌ **REMOVER:** Demanda de materiales (eliminar)

**Nuevas características:**
- Forecast mensual con buscador por plan de mantenimiento
- Filtrable por mes o año
- Multi-plan: seleccionar uno o más planes

---

### 2. **SUPPLY** (Reorganizar)
**ELIMINAR:**
- ❌ Órdenes de trabajo (mover a PRODUCCIÓN)
- ❌ Demanda de materiales

**AGREGAR:**
- ✅ Consulta de materiales
- ✅ Forecast de materiales
- ✅ Materiales (actualizar parámetros):
  - Punto de recompra
  - Leadtime
  - Tipo de incoterm
  - **Solo rol Ingeniería/Industrial puede crear master data**
  - Rol Supply solo actualiza parámetros
- ✅ Llamadas futuras (traer de Planning)
- ✅ **Dashboard de Stock por Almacén:**
  - Valor total del stock por almacén
  - Filtrable por almacén individual o todos
- ✅ Gráfico de bajo stock por material vs pedidos a entregar

---

### 3. **INGENIERÍA E INDUSTRIAL** (Módulo nuevo)
- ✅ Hojas de ruta (traer de Planning)
- ✅ Materiales (master data)
- ✅ **Solo este rol puede crear master data de materiales**
- Materiales también visible en Supply (lectura)

---

### 4. **PM (Project Manager)** (Dashboard dinámico)
**CAMBIOS:**
- ✅ Dashboard dinámico (principal)
- ✅ Consultar su proyecto
- ✅ Ver gastado vs presupuestado
- ✅ Ver comprometido a gastar
- ✅ Backlog: planificado vs realizado
- ✅ Horas disponibles vs gastadas
- ❌ **REMOVER:** Órdenes de trabajo (mover a PRODUCCIÓN)

---

### 5. **PRODUCCIÓN** (Módulo nuevo)
- ✅ Órdenes de trabajo (traer de PM)
- ✅ Admin y Supervisor pueden asignar órdenes
- ✅ **Supervisor puede:**
  - Crear órdenes correctivas únicamente
  - Asignar a 1+ trabajadores por orden
  - Reabrir órdenes cerradas
- ✅ Bandeja de trabajo (para técnicos)
- ✅ **Dashboard de Línea de Tiempo:**
  - Por día: trabajos y quién los hace
  - Tiempos y operación
  - Colores por estado/técnico

---

### 6. **ALMACÉN** (Mejorar)
**Nuevas características:**
- ✅ Consulta de stock por material (sin crear solicitudes)
- ✅ **Picking Parcial:**
  - Cuando decuentan material, solo queda lo faltante en orden
  - Dashboard de pedidos próximos 3 días
  - Planificación de trabajo
- ✅ Gráfico de bajo stock vs pedidos a entregar
- ✅ **Traspaso entre almacenes:**
  - Crea documento interno (como OC interna)
  - Código: 32xxxxxx
  - Al ingresar en otro almacén, se realiza el traspaso

---

### 7. **RECURSOS HUMANOS** (Mejoras)
- ✅ Botón "Recalcular" en liquidaciones
- ✅ Logo de empresa en PDF de liquidaciones
- ✅ Logo en todos los documentos PDF

---

### 8. **CALIDAD** (Dashboard)
- ✅ Dashboard 1: Órdenes pendientes vs inspeccionadas (este mes)
- ✅ Dashboard 2: Materiales inspeccionados vs por inspeccionar

---

## 🔢 Serialización de Números de Orden

**Sistema de numeración por tipo:**

| Tipo | Prefijo | Ejemplo | Rol que Crea |
|------|---------|---------|--------------|
| Preventiva | 51 | 51xxxxxx | Planificador |
| Correctiva | 61 | 61xxxxxx | Supervisor/Admin |
| OVH | 71 | 71xxxxxx | Planificador |
| Garantía | 81 | 81xxxxxx | Admin |
| Solicitud Pedido | 21 | 21xxxxxx | Almacén/Compras |
| Orden Compra | 31 | 31xxxxxx | Compras |
| OC Interna (Traspaso) | 32 | 32xxxxxx | Almacén |

---

## 📂 Estructura de Módulos Final

```
📦 App.tsx (rutas principales)
├─ 🏠 Dashboard (nuevo)
├─ 🎯 Planning
│  ├─ Gantt
│  ├─ Planes de Mantenimiento
│  └─ Forecast Mensual
├─ 📦 Supply
│  ├─ Consulta Materiales
│  ├─ Forecast Materiales
│  ├─ Parámetros Materiales
│  ├─ Dashboard Stock Almacén
│  └─ Llamadas Futuras
├─ 🛠️ Ingeniería e Industrial
│  ├─ Hojas de Ruta
│  ├─ Master Data Materiales
│  └─ [Visibilidad en Supply]
├─ 👤 PM
│  └─ Dashboard Dinámico
├─ 🏭 Producción
│  ├─ Órdenes Trabajo
│  ├─ Bandeja Trabajo
│  └─ Dashboard Línea Tiempo
├─ 📮 Almacén
│  ├─ Consulta Stock
│  ├─ Picking (parcial)
│  ├─ Dashboard Próximos 3 días
│  ├─ Gráfico Bajo Stock
│  └─ Traspasos Internos
├─ 👥 Recursos Humanos
│  ├─ [Mejoras existentes]
│  └─ Liquidaciones (logo + recalcular)
├─ ✅ Calidad
│  └─ Dashboards (órdenes + materiales)
├─ 💼 Contabilidad
├─ 🛒 Compras
├─ 👨‍💼 Clientes
└─ 📊 Reportes

```

---

## 🎯 Prioridades de Implementación

**FASE 1 (Crítica):**
1. Producción (módulo nuevo con órdenes)
2. Serialización de órdenes (implementar generador)
3. Ingeniería e Industrial (módulo nuevo)

**FASE 2 (Alta):**
4. Reorganizar Supply (eliminar órdenes, agregar stock dashboard)
5. Reorganizar Planning (eliminar llamadas, agregar forecast)
6. PM Dashboard (dinámico)
7. Almacén (picking parcial, traspaso interno)

**FASE 3 (Media):**
8. Calidad Dashboards
9. HR (recalcular, logo PDF)
10. Ajustes y refinamientos

---

## 📝 Notas Técnicas

- **Logo empresa:** Agregar en variables globales, usar en todos los PDFs
- **Serialización:** Crear generador centralizado de IDs por tipo
- **Dashboards:** Usar react-chartjs-2 o similar para gráficos
- **Línea de tiempo:** Canvas o librerías de Gantt para producción
- **Storage:** Mantener localStorage, considerar sincronización con backend futuro

---

**Estado:** Pendiente de implementación  
**Última actualización:** 2026-11-10 11:10
