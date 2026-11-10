# Plan de Implementación ERP - PMOptimizer

**Fecha inicio:** 2026-11-10  
**Estado:** En progreso  
**Agentes activos:** 7

---

## 📋 Resumen de Cambios

Este documento tracking todas las mejoras al ERP según solicitud del 2026-11-10.

### Total de características a implementar: 21

| # | Módulo | Característica | Status | Prioridad | Agente |
|---|--------|---|--------|-----------|--------|
| 1 | HR | Gestión de Contratos (CRUD) | 🔄 | Alta | desarrollador-hr |
| 2 | HR | Maestro de Asociados/Empleados | 🔄 | Alta | desarrollador-hr |
| 3 | HR | Nóminas Automáticas | 🔄 | Alta | desarrollador-hr |
| 4 | HR | Distribución de Costos Indirectos | 🔄 | Media | desarrollador-hr |
| 5 | Purchasing | Cuadro Comparativo 3 Cotizaciones | 🔄 | Alta | desarrollador-purchasing |
| 6 | Planning | Gantt Interactivo | 🔄 | Alta | desarrollador-planning |
| 7 | Planning | Vista PM (totales agregados) | 🔄 | Media | desarrollador-planning |
| 8 | Supply/MRP | Avance Mantenimiento por Llamada | 🔄 | Alta | desarrollador-quality-supply |
| 9 | Supply/MRP | Vista por Roles (Supervisor/Planificador/PM) | 🔄 | Media | desarrollador-quality-supply |
| 10 | WorkOrders | Órdenes Cerradas Separadas | 🔄 | Media | desarrollador-workorders |
| 11 | WorkOrders | Reapertura de Órdenes | 🔄 | Media | desarrollador-workorders |
| 12 | Warehouse | Picking Logic | 🔄 | Alta | desarrollador-warehouse |
| 13 | Warehouse | Imprimir/Exportar Picking | 🔄 | Media | desarrollador-warehouse |
| 14 | Warehouse | Cantidad Tomada (campo) | 🔄 | Media | desarrollador-warehouse |
| 15 | Warehouse | Transferencia a Almacén Calidad | 🔄 | Alta | desarrollador-warehouse |
| 16 | Quality | Vista Checklists como Lista | 🔄 | Alta | desarrollador-quality-supply |
| 17 | Accounting | Cálculo Automático de Nóminas en CxP | 🔄 | Alta | desarrollador-accounting |
| 18 | Accounting | Asientos Contables Automáticos | 🔄 | Alta | desarrollador-accounting |
| 19 | Clients | CRUD de Clientes | 🔄 | Alta | desarrollador-clients |
| 20 | Clients | Configuración de Contrato y WBS | 🔄 | Alta | desarrollador-clients |
| 21 | Clients | Carga de Archivo de Contrato | 🔄 | Media | desarrollador-clients |

**Leyenda:** 🔄 = En progreso | ✅ = Completado | ❌ = Bloqueado

---

## 🔗 Dependencias de Módulos

```
HR (Contratos, Empleados, Nóminas)
├── → IndustrialRoutes (costo/hora)
├── → Accounting (nóminas en CxP)
└── → Planning (distribución de costos)

WorkOrders (Órdenes)
├── → SupplyPage (picking)
├── → Planning (Gantt)
└── → Quality (checklists)

Clients (Maestro de Clientes)
└── → Contracts (vincular contratos)

Purchasing (Cotizaciones)
└── → Supply (crear órdenes de compra)

Planning (Gantt)
├── → WorkOrders (datos de órdenes)
└── → HR (costos/hora)
```

---

## 📦 Archivos Modificados

### Nuevos Archivos
- `src/modules/QualityPage.tsx` - Módulo de Calidad
- `src/modules/ClientsPage.tsx` - Módulo de Clientes

### Archivos Actualizados
- `src/App.tsx` - Agregar rutas nuevas, revisar integración
- `src/modules/HumanResourcesPage.tsx` - Contratos, nóminas
- `src/modules/WorkOrders.tsx` - Órdenes cerradas, reapertura
- `src/modules/SupplyPage.tsx` - Picking logic, avance
- `src/modules/PurchasingPage.tsx` - Cotizaciones comparativas
- `src/modules/MaintenancePlanning.tsx` - Gantt interactivo
- `src/modules/AccountingPage.tsx` - Nóminas automáticas, asientos
- `src/modules/IndustrialRoutes.tsx` - Integración con HR (costo/hora)

---

## 💾 LocalStorage Keys

Se utilizan estas claves para persistencia:

```typescript
// HR
"pmoptimizer-hr-contracts"
"pmoptimizer-payroll-v2"
"pmoptimizer-hr-leaves"
"pmoptimizer-hr-employees" (existente)

// Clientes
"pmoptimizer-clients-v2"
"pmoptimizer-contracts-files"

// Compras
"pmoptimizer-quotations"

// Órdenes
"pmoptimizer-work-orders-v2"

// Almacén
"pmoptimizer-warehouse-picking"

// Calidad
"pmoptimizer-quality-checklists"

// Existing keys (se mantienen)
"pmoptimizer-equipment"
"pmoptimizer-material-master"
"pmoptimizer-finance-*"
```

---

## 🧪 Validaciones Pendientes

Después de completar los desarrollos:

- [ ] HR: Nóminas calculan correctamente
- [ ] HR: Costos se distribuyen equitativamente
- [ ] Warehouse: Picking se abre sin expandir la página
- [ ] Quality: Checklists visibles como lista
- [ ] Accounting: Asientos generados automáticamente
- [ ] Planning: Gantt filtra por contrato/año/fecha
- [ ] Planning: PM ve solo totales
- [ ] Clients: Archivo de contrato se carga/descarga
- [ ] WorkOrders: Órdenes cerradas desaparecen de lista
- [ ] Purchasing: Comparativo aparece con 3+ cotizaciones

---

## 🔄 Próximos Pasos (Post-Implementación)

1. **Integración de datos:**
   - Sincronizar datos entre módulos
   - Validar flujos end-to-end

2. **Testing:**
   - Pruebas unitarias por módulo
   - Pruebas de integración
   - Pruebas de flujo de usuario

3. **Documentación:**
   - Guía de usuario por módulo
   - Manual de configuración
   - Guía de troubleshooting

4. **Performance:**
   - Optimizar localStorage (considerar IndexedDB)
   - Mejorar carga inicial
   - Limpiar datos obsoletos

---

## 📞 Notas del Cliente (ACTUALIZAR V2.txt)

Se implementan todos los requisitos especificados en ACTUALIZAR V2.txt:
- ✅ Módulo de recursos humanos (contratos, asociados, nóminas)
- ✅ Costos de sueldos imputados al contrato (técnico) o distribuidos (indirecto)
- ✅ Cotizaciones: cuadro comparativo para elegir y adjudicar
- ✅ Planning: Gantt con filtros por contrato/año/fecha
- ✅ Llamadas futuras y demanda de materiales: lista acotada (no expande hoja)
- ✅ Supply/MRP: avance de mantenimiento por llamada (supervisor/planificador)
- ✅ PM: solo totales por contrato/mes/año
- ✅ Hoja de ruta: costo/hora desde HR según contrato
- ✅ Órdenes de trabajo: cerradas aparte, solo supervisor las ve, puede reabrir
- ✅ Almacén: picking logic, imprimir/exportar, cantidad tomada, transferir a calidad
- ✅ Calidad: checklists como lista seleccionable
- ✅ Contabilidad: nóminas automáticas en CxP, asientos contables
- ✅ Clientes: crear con contrato, WBS, cargar archivo

---

**Última actualización:** 2026-11-10 09:00  
**Responsable:** Copilot SDK + Subagentes  
**Repositorio:** https://github.com/afocontacto-sketch/pmoptimizer
