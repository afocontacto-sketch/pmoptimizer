# Gantt Interactivo - Guía de Uso

## Ubicación
`src/modules/MaintenancePlanning.tsx` - Nueva sección "Gantt Interactivo - Planificación de Órdenes"

## Características Principales

### 1. Diagrama de Gantt
El Gantt muestra todas las órdenes de trabajo como barras horizontales:
- **Eje X (Horizontal)**: Línea de tiempo (días/semanas/meses)
- **Eje Y (Vertical)**: Órdenes de trabajo individuales
- **Barras**: Representan orden, duración, estado

**Colores por Estado:**
- 🔵 Azul: Asignada
- 🟠 Naranja: En ejecución
- 🟢 Verde: Cierre provisorio
- ⚫ Gris: Cerrada

### 2. Filtros Dinámicos

Todos los filtros se aplican en tiempo real. Se pueden combinar:

#### Filtro "Desde"
- Selecciona fecha inicial (type="date")
- Solo muestra órdenes ≥ esta fecha
- Ejemplo: 2024-01-01

#### Filtro "Hasta"
- Selecciona fecha final (type="date")
- Solo muestra órdenes ≤ esta fecha
- Ejemplo: 2024-12-31

#### Filtro "Contrato"
- Dropdown con lista de contratos
- Filtra órdenes por contrato seleccionado
- Opciones: "Todos", "CT1234", etc.

#### Filtro "Año"
- Dropdown con años disponibles
- Muestra solo órdenes de ese año
- Opciones: "Todos", "2024", "2025", "2026"

#### Botón "Limpiar filtros"
- Reset inmediato de todos los filtros
- Vuelve a mostrar todas las órdenes
- Ícono: Clear (X)

#### Contador
- Muestra: "N órdenes mostradas"
- Se actualiza dinámicamente con filtros

### 3. Zoom

Controla el nivel de detalle temporal:

**Botón "Acercar" (Zoom In)**
- Cambio: semana → día
- Barras más anchas
- Mayor detalle temporal

**Botón "Alejar" (Zoom Out)**
- Cambio: mes → semana o semana → mes
- Barras más estrechas
- Vista general

**Ciclo de Zoom:**
- Día → Semana → Mes → Día (cicla)

### 4. Interactividad - Click en Barra

Haz click sobre cualquier barra de orden para ver detalles:

**Dialog que se abre:**
```
┌─────────────────────────────────┐
│ Detalles de Orden               │
├─────────────────────────────────┤
│ Orden:          OT-2048         │
│ Descripción:    Preventivo...   │
│ Contrato:       CT1234          │
│ Fecha Inicio:   10/11/2024      │
│ Duración:       3.5 horas       │
│ Estado:         Asignada        │
│ Equipamiento:   VEH-001         │
│ Técnico:        Camila Rojas    │
│ Costo:          63,000 CLP      │
├─────────────────────────────────┤
│           [ Cerrar ]            │
└─────────────────────────────────┘
```

**Cómo cerrar:**
- Click en botón "Cerrar"
- Click fuera del dialog
- Tecla ESC

### 5. Vistas por Rol

#### Para Supervisor / Planificador
Ver:
- ✅ Gantt completo con todas las órdenes
- ✅ Todos los filtros y zoom
- ✅ Detalles de órdenes al click

#### Para PM (Project Manager)
Además de lo anterior:
- ✅ Tabla "Totales por Contrato"
  - Contrato | Órdenes | Horas | Presupuesto
  - Agregado por contrato
  
- ✅ Tabla "Totales por Mes"
  - Mes | Órdenes | Horas | Presupuesto
  - Agregado por mes
  
- ✅ Tabla "Totales por Año"
  - Año | Órdenes | Horas | Presupuesto
  - Agregado por año

### 6. Responsividad

El Gantt se adapta a diferentes tamaños:

**Desktop (≥1200px):**
- Gantt a ancho completo
- Filtros: 4 columnas en una fila
- Tablas lado a lado (si aplica)

**Tablet (600-1199px):**
- Gantt scrolleable horizontalmente
- Filtros: 2-3 columnas
- Tablas apiladas

**Mobile (<600px):**
- Gantt muy estrecho, scrolleable
- Filtros: 1 columna cada uno
- Tablas en vertical (scroll)

---

## Casos de Uso

### Caso 1: Planificador revisa mes actual
1. Filtro "Desde": Hoy
2. Filtro "Hasta": Fin de mes
3. Zoom: Semana
4. Gantt muestra solo órdenes del mes actual
5. Detecta conflictos o sobrecargas visuales

### Caso 2: PM revisa presupuesto por contrato
1. Rol: PM Proyecto
2. Tabla "Totales por Contrato" visible
3. Filtra por Año: 2024
4. Ve presupuesto total por cliente

### Caso 3: Supervisor busca orden específica
1. Filtra por Contrato: CT1234
2. Zoom: Día (para ver precisión)
3. Busca visualmente en Gantt
4. Click en barra para detalles completos

### Caso 4: Análisis de carga de trabajo
1. Zoom: Mes (vista general)
2. Tabla "Totales por Mes" visible
3. Identifica meses picos de trabajo
4. Planifica recursos

---

## Datos Utilizados

**Origen de Órdenes:**
- `plannedCalls`: Órdenes generadas de planes de mantenimiento
- Campos: id, plan, dueDate, route

**Origen de Estados:**
- `workOrders`: Estados de órdenes creadas
- Campos: plannedCallId, status

**Origen de Contrato/Año:**
- `plan.contract`: Código de contrato
- `dueDate`: Para extraer año

**Origen de Costos/Horas:**
- `route.operations`: Operaciones de la ruta
- Campos: durationHours, hourlyCost, materials[]

---

## Troubleshooting

### "Gantt vacío sin órdenes"
1. Verificar que hay planes creados en MaintenancePlanning
2. Verificar que planes tienen "Horizonte de meses" > 0
3. Verificar que fecha inicio es correcta
4. Esperar a que se calculen plannedCalls

### "Filtros no funcionan"
1. Verificar formato de fecha: YYYY-MM-DD
2. Verificar que hay datos dentro del rango
3. Probar "Limpiar filtros" y reapplicar

### "Zoom no cambia"
1. Verificar que hay órdenes para mostrar
2. Probar click múltiples veces en mismo botón

### "Dialog no abre"
1. Verificar click directo sobre barra (no en blanco)
2. Probar con otra orden
3. Revisar console del navegador (F12) para errores

---

## Performance

El Gantt está optimizado para:
- ✅ Hasta 100 órdenes: suave (60 fps)
- ⚠️ 100-500 órdenes: aceptable (30 fps)
- ❌ >500 órdenes: considerar paginación

Para muchas órdenes, considerar:
1. Usar filtros más restrictivos
2. Limitar a 1 año
3. Implementar virtualización (versión 2.0)

---

## Próximas Mejoras

- [ ] Drag & Drop para cambiar fechas
- [ ] Exportar Gantt a PDF/PNG
- [ ] Leyenda interactiva de colores
- [ ] Multiselect de contratos
- [ ] Dependencias entre órdenes (flechas)
- [ ] Milestone/Hitos visuales
