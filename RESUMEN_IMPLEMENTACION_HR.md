# Resumen de Implementación - Módulo HR

## 1. GESTIÓN DE CONTRATOS

### Operaciones CRUD Implementadas:

**CREATE** - Agregar contrato nuevo:
```
Formulario:
┌─────────────────────────────────────────────────┐
│ Código*:          CT1234                         │
│ Cliente/Proyecto*: Fiat Chile                    │
│ Tipo*:            [Fijo ▼]                       │
│ Costo/hora CLP*:  6100                           │
│ Inicio*:          2024-01-01                     │
│ Término:          2025-12-31                     │
│ Descripción:      Servicios de mantenimiento...  │
│                                                  │
│ [Guardar contrato] [Cancelar]                    │
└─────────────────────────────────────────────────┘
```

**READ** - Ver contratos:
```
Tabla de Contratos:
┌────────┬────────────┬────────┬─────────┬──────────────┬─────────────┬──────────┐
│ Código │ Cliente    │ Tipo   │ $/hora  │ Vigencia     │ Descripción │ Acciones │
├────────┼────────────┼────────┼─────────┼──────────────┼─────────────┼──────────┤
│ CT1234 │ Fiat Chile │ Mixto  │ $6,100  │ 24-01 / 25-12│ Mantenimiento...│ ✎ 🗑   │
│ CT5678 │ ENAP       │ Fijo   │ $5,500  │ 24-06 / 26-06│ Inspección... │ ✎ 🗑   │
└────────┴────────────┴────────┴─────────┴──────────────┴─────────────┴──────────┘
```

**UPDATE** - Editar contrato:
```
Click en ✎ icon → Carga el formulario con los datos del contrato
Edita campos necesarios
Click "Guardar cambios"
```

**DELETE** - Eliminar contrato:
```
Click en 🗑 icon → Contrato eliminado de localStorage
```

### localStorage
```
Key: "pmoptimizer-hr-contracts"
Valor: JSON Array de HrContract

[
  {
    id: "CT-001",
    code: "CT1234",
    client: "Fiat Chile",
    type: "mixto",
    costPerHour: 6100,
    startDate: "2024-01-01",
    endDate: "2025-12-31",
    description: "Servicios de mantenimiento integral",
    createdAt: "2026-11-10T12:00:00.000Z"
  }
]
```

---

## 2. ASOCIACIÓN DE EMPLEADOS A CONTRATOS

### Tipos de Asignación:

#### A) DIRECTO (Carga a 1 contrato específico)
```
Empleado: Camila Rojas
├─ Cargo: Técnica mecánica
├─ Asignación: [Directo ◉]
├─ Contrato: CT1234 (1 solo)
└─ Costo mensual: $1,100,000 → 100% a CT1234

localStorage:
{
  direct: true,
  contractCode: "CT1234",         // Contrato principal
  contractCodes: ["CT1234"]       // Array para compatibilidad
}
```

#### B) INDIRECTO (Distribuye costo a múltiples contratos)
```
Empleado: Paula Soto
├─ Cargo: Administración
├─ Asignación: [Indirecto ◉]
├─ Contratos: CT1234, CT5678 (múltiples)
└─ Costo mensual: $1,250,000
   ├─ CT1234: $625,000 (50%)
   └─ CT5678: $625,000 (50%)

localStorage:
{
  direct: false,
  contractCode: "",               // Vacío para indirectos
  contractCodes: ["CT1234", "CT5678"]
}
```

#### C) SUPERVISORES (Forzado a indirecto)
```
Empleado: Diego Muñoz
├─ Cargo: Supervisor de mantenimiento
├─ Asignación: [Indirecto ◉] (automático, no editable)
├─ Contratos: CT1234, CT5678
└─ Usuario: supervisor (login)

localStorage:
{
  position: "Supervisor de mantenimiento",
  direct: false,              // Siempre false
  supervisorLogin: "supervisor"
}
```

### Interfaz de Selector Múltiple:
```
Para DIRECTO:
┌────────────────────────┐
│ Contrato de servicio:  │
│ CT1234 · Fiat Chile  ◉ │ (Solo 1 seleccionable)
└────────────────────────┘

Para INDIRECTO:
┌──────────────────────────────┐
│ Contratos para prorrateo:    │
│ ☑ CT1234 · Fiat Chile       │
│ ☑ CT5678 · ENAP             │ (Múltiples seleccionables)
│ ☐ CT9999 · Minera           │
└──────────────────────────────┘
```

---

## 3. NÓMINAS AUTOMÁTICAS CON PRORRATEO

### Flujo de Generación:

```
1. Usuario selecciona período: [2024-11] ▼
2. Click "Calcular y contabilizar"
3. Sistema:
   ├─ Itera empleados
   ├─ Calcula bruto y deducciones
   ├─ Distribuye costo según tipo (directo/indirecto)
   ├─ Imputa a contratos
   ├─ Guarda en localStorage
   └─ Contabiliza asiento automático
```

### Ejemplo de Cálculo - Período 2024-11:

```
EMPLEADOS:
├─ Camila (DIRECTO, CT1234)     $1,100,000
├─ Diego  (INDIRECTO, 2 contratos) $1,450,000
└─ Paula  (INDIRECTO, 2 contratos) $1,250,000

NÓMINA CALCULADA:

Camila Rojas (DIRECTO)
├─ Bruto: $1,100,000
├─ Deducciones (20%): $220,000
├─ Neto: $880,000
└─ IMPUTACIÓN:
   └─ CT1234: $1,100,000 (100%)

Diego Muñoz (INDIRECTO - 2 contratos)
├─ Bruto: $1,450,000
├─ Deducciones (20%): $290,000
├─ Neto: $1,160,000
└─ IMPUTACIÓN (Distribuye $1,450,000):
   ├─ CT1234: $725,000 (50%)
   └─ CT5678: $725,000 (50%)

Paula Soto (INDIRECTO - 2 contratos)
├─ Bruto: $1,250,000
├─ Deducciones (20%): $250,000
├─ Neto: $1,000,000
└─ IMPUTACIÓN (Distribuye $1,250,000):
   ├─ CT1234: $625,000 (50%)
   └─ CT5678: $625,000 (50%)

TOTALES NÓMINA:
├─ Bruto total: $3,800,000
├─ Deducciones total: $760,000
└─ Neto total: $3,040,000

IMPUTACIÓN POR CONTRATO:
├─ CT1234: $2,450,000 (Camila $1,1M + Diego $725k + Paula $625k)
└─ CT5678: $1,350,000 (Diego $725k + Paula $625k)
```

### Tabla de Nómina en UI:
```
┌────────────┬──────────────────────────────┬──────────┬──────────┐
│ Colaborador│ Imputación (WBS/contrato)    │ Bruto    │ Líquido  │
├────────────┼──────────────────────────────┼──────────┼──────────┤
│ Camila Rojas│ CT1234: $1,100,000          │ $1,1M    │ $880,000 │
│ Diego Muñoz │ CT1234: $725,000 · CT5678:  │ $1,45M   │ $1,16M   │
│            │ $725,000                     │          │          │
│ Paula Soto │ CT1234: $625,000 · CT5678:  │ $1,25M   │ $1,0M    │
│            │ $625,000                     │          │          │
├────────────┼──────────────────────────────┼──────────┼──────────┤
│ TOTAL      │                              │ $3,8M    │ $3,04M   │
└────────────┴──────────────────────────────┴──────────┴──────────┘

Estado: [Pendiente de pago] [Registrar pago]
```

### localStorage Nómina:
```
Key: "pmoptimizer-payroll-v2"
Valor: JSON Array de PayrollRun

[
  {
    id: "NOM-001",
    period: "2024-11",
    createdAt: "2026-11-10T12:00:00.000Z",
    status: "Pendiente de pago",
    lines: [
      {
        employeeId: "EMP-001",
        employee: "Camila Rojas",
        gross: 1100000,
        deductions: 220000,
        net: 880000,
        allocations: [
          { contract: "CT1234", amount: 1100000 }
        ]
      },
      {
        employeeId: "EMP-002",
        employee: "Diego Muñoz",
        gross: 1450000,
        deductions: 290000,
        net: 1160000,
        allocations: [
          { contract: "CT1234", amount: 725000 },
          { contract: "CT5678", amount: 725000 }
        ]
      }
    ],
    gross: 3800000,
    deductions: 760000,
    net: 3040000
  }
]
```

---

## 4. INTEGRACIÓN CON OTROS MÓDULOS

### Funciones Exportadas:

#### Para IndustrialRoutes.tsx (Costo de órdenes)
```typescript
// Obtener costo/hora de un empleado
getEmployeeHourlyRate(name: string, fallback: number): number

// Obtener costo/hora de un contrato
getContractCostPerHour(contractCode: string, fallback: number): number

Uso:
const rate = getEmployeeHourlyRate("Camila Rojas", 6111);
const contractRate = getContractCostPerHour("CT1234", 6100);
```

#### Para AccountingPage.tsx (Asientos)
```typescript
// Leer empleados para cálculo de CxP
readHrEmployees(): Employee[]

// Leer contratos para presupuesto
readHrContracts(): HrContract[]

Uso:
const employees = readHrEmployees();
const contracts = readHrContracts();
```

### Flujo de Datos:
```
HumanResourcesPage
├─ Contratos (CRUD)
│  └─ localStorage "pmoptimizer-hr-contracts"
│
├─ Empleados + Asignación
│  └─ localStorage "pmoptimizer-hr-employees"
│
└─ Nóminas
   ├─ localStorage "pmoptimizer-payroll-v2"
   └─ Genera asientos contables automáticos
      └─ Integración con AccountingPage

Desde otros módulos:
├─ IndustrialRoutes.tsx
│  └─ Lee costo/hora por empleado o contrato
│
└─ AccountingPage.tsx
   └─ Lee nóminas para CxP y cálculo de costos
```

---

## 5. DATOS DEMO INCLUIDOS

```typescript
demoHrContracts = [
  {
    code: "CT1234",
    client: "Fiat Chile",
    type: "mixto",
    costPerHour: 6100,
    startDate: "2024-01-01",
    endDate: "2025-12-31",
    description: "Servicios de mantenimiento integral"
  }
]

demoEmployees = [
  { id: "EMP-001", name: "Camila Rojas", direct: true, contractCode: "CT1234" },
  { id: "EMP-002", name: "Diego Muñoz", direct: false, contractCodes: ["CT1234"] },
  { id: "EMP-003", name: "Paula Soto", direct: false, contractCodes: ["CT1234"] }
]
```

Se cargan automáticamente la primera vez si localStorage está vacío.

---

## 6. ESTADO DE IMPLEMENTACIÓN

✅ Completado:
- Gestión de Contratos (CRUD)
- Asociación de empleados a múltiples contratos
- Cálculo automático de nóminas
- Prorrateo de costo indirecto
- Persistencia en localStorage
- Interfaz con Material-UI
- Compatibilidad con código existente
- Funciones de exportación para otros módulos

📋 Pruebas incluidas:
- test_hr.html - Pruebas de localStorage y lógica
- IMPLEMENTACION_HR.md - Documentación técnica
- Datos demo cargables automáticamente

🚀 Próximas mejoras (opcionales):
- Gráficos de distribución de costos
- Exportar nóminas a CSV/PDF
- Histórico de cambios
- Proyecciones por período
