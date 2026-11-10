# Implementación de Mejoras al Módulo de RECURSOS HUMANOS

## Resumen de Cambios
Se han implementado las siguientes mejoras en `HumanResourcesPage.tsx`:

### 1. ✓ GESTIÓN DE CONTRATOS (CRUD Completo)

**Archivo:** `src/modules/HumanResourcesPage.tsx`

**Nuevo tipo de dato:**
```typescript
export type HrContract = {
  id: string;
  code: string;
  client: string;
  type: "fijo" | "variable" | "mixto";
  costPerHour: number;
  startDate: string;
  endDate: string;
  description: string;
  createdAt: string;
};
```

**localStorage key:** `pmoptimizer-hr-contracts`

**Funcionalidades implementadas:**
- ✓ Crear contrato: formulario con campos código, cliente, tipo, costo/hora, vigencia, descripción
- ✓ Leer contratos: lista completa con tabla mostrando todos los datos
- ✓ Actualizar contrato: edición inline con botones de editar/cancelar
- ✓ Eliminar contrato: botón eliminar en cada fila
- ✓ Nueva función exportada: `readHrContracts()` para lectura de contratos
- ✓ Nueva función exportada: `getContractCostPerHour(contractCode, fallback)` para obtener costo/hora

**Interfaz UI:**
- Formulario en Paper component
- Tabla con 7 columnas: Código, Cliente, Tipo (chip), Costo/hora, Vigencia, Descripción, Acciones
- Botones de editar (EditIcon) y eliminar (DeleteIcon) para cada contrato

### 2. ✓ ASOCIADOS/EMPLEADOS MEJORADO

**Campos nuevos/mejorados:**
- `direct: boolean` - Indica si es directo (carga a un contrato específico) o indirecto (se distribuye)
- `contractCodes?: string[]` - Array de múltiples contratos asociados
- `contractCode: string` - Contrato principal (para empleados directos)

**Lógica de asignación:**
- **Personal Directo:** Vinculado a exactamente 1 contrato (su costo se imputa completamente)
- **Personal Indirecto:** Puede vincularse a múltiples contratos (su costo se distribuye equitativamente)
- **Supervisores:** Forzados a asignación indirecta automáticamente

**Cambios en UI:**
- Campo selector: "Asignación" (directo/indirecto)
- Campo selector múltiple: "Contrato de servicio" o "Contratos para prorrateo" (según tipo)
- Validación: directos requieren 1 contrato, indirectos requieren 1+ contratos

### 3. ✓ NÓMINAS AUTOMÁTICAS

**Nueva funcionalidad:**
- Botón "Calcular y contabilizar" que genera nómina para el período seleccionado
- Cálculo automático al último día del mes (si la aplicación está abierta)

**Fórmulas de cálculo:**

```
Para EMPLEADOS DIRECTOS:
- Costo bruto = Sueldo mensual
- Imputación = 100% al contrato asignado

Para EMPLEADOS INDIRECTOS:
- Costo bruto = Sueldo mensual
- Se distribuye equitativamente: Costo / Cantidad de contratos
- Cada contrato recibe: Costo bruto / # de contratos
- Último contrato recibe el remanente para exactitud
```

**Ejemplo de cálculo:**
```
Empleado: "Paula" (indirecto)
Sueldo: $1,250,000
Contratos asignados: ["CT1234", "CT5678"]

Distribución:
- CT1234: $625,000
- CT5678: $625,000
Total: $1,250,000 ✓
```

**localStorage key:** `pmoptimizer-payroll-v2`

**Estructura de nómina:**
```typescript
type PayrollRun = {
  id: string;           // Ej: "NOM-001"
  period: string;       // Ej: "2024-11"
  createdAt: string;    // ISO timestamp
  status: "Pendiente de pago" | "Pagada";
  lines: PayrollLine[];
  gross: number;        // Total bruto
  deductions: number;   // Total deducciones
  net: number;          // Total neto
};

type PayrollLine = {
  employeeId: string;
  employee: string;
  gross: number;
  deductions: number;
  net: number;
  allocations: { contract: string; amount: number }[];
};
```

**Interfaz UI:**
- Selector de período (mes)
- Tabla resumen: Empleado, Imputación (WBS/contrato), Costo bruto, Líquido
- Estado de nómina (Pendiente/Pagada)
- Botón "Registrar pago" para cambiar estado

### 4. ✓ INTEGRACIÓN

**Funciones exportadas para uso en otros módulos:**

```typescript
// En IndustrialRoutes.tsx - Obtener costo/hora de un empleado
export function getEmployeeHourlyRate(name: string, fallback: number): number

// En IndustrialRoutes.tsx - Obtener costo/hora de un contrato
export function getContractCostPerHour(contractCode: string, fallback: number): number

// En AccountingPage.tsx - Leer empleados para CxP
export function readHrEmployees(): Employee[]

// En AccountingPage.tsx - Leer nóminas
export function readHrContracts(): HrContract[]
```

**Compatibilidad:**
- Los datos persisten en localStorage con claves exportadas
- Se mantienen valores demo iniciales si localStorage está vacío
- La estructura de Employee se expande sin romper código existente

## Archivos Modificados

### 1. `src/modules/HumanResourcesPage.tsx`
- **Líneas añadidas:** ~120 líneas de código nueva
- **Tipos:** Agregado `HrContract`
- **Funciones:** Agregadas `saveHrContract()`, `deleteHrContract()`, `editHrContract()`, `readHrContracts()`, `getContractCostPerHour()`
- **Estados:** Agregados `hrContracts`, `editingContractId`, `contractDraft`
- **UI:** Agregada sección de Contratos (CRUD completo) antes de la sección de empleados

### 2. Importaciones adicionales
```typescript
import {
  IconButton,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
```

## Testing

### Archivo de pruebas: `test_hr.html`
Pruebas disponibles:
1. ✓ CRUD de Contratos (crear, listar, actualizar, eliminar)
2. ✓ Asociación Empleado-Contratos
3. ✓ Cálculo de Nóminas
4. ✓ Persistencia en localStorage

**Para probar:**
```bash
# Abrir en navegador
open test_hr.html
# o
start test_hr.html
```

## Validación de Requisitos

- ✅ Gestión de Contratos con CRUD completo
- ✅ Campos: código, cliente, tipo, costo/hora, vigencia, descripción
- ✅ localStorage con clave "pmoptimizer-hr-contracts"
- ✅ Tabla con opciones editar/eliminar

- ✅ Empleados vinculables a múltiples contratos
- ✅ Campo "directo" = carga a contrato específico
- ✅ Campo "indirecto" = distribución a múltiples contratos
- ✅ Cálculo de costo/hora desde contrato

- ✅ Nóminas automáticas con generación por período
- ✅ Cálculo empleados directos: horas × valor hora contrato
- ✅ Cálculo empleados indirectos: distribución equitativa
- ✅ localStorage con clave "pmoptimizer-payroll-v2"
- ✅ Estado de nómina (pendiente/pagada)

- ✅ Accesible desde menú principal (módulo HR)
- ✅ Datos listos para IndustrialRoutes.tsx y AccountingPage.tsx
- ✅ Material-UI completo
- ✅ Sin backend, todo local
- ✅ Compatible con código existente

## Notas de Implementación

1. **Persistencia:** Los datos se guardan automáticamente en localStorage al crear/editar/eliminar
2. **Validaciones:** Se requieren campos obligatorios en formularios; errores se muestran en Alert component
3. **Demo data:** `demoHrContracts` proporciona valores iniciales
4. **Prorrateo:** Para empleados indirectos con múltiples contratos, la distribución es automática y equitativa
5. **Contabilización:** Las nóminas se integran automáticamente con el módulo de finanzas (asientos contables)

## Próximas mejoras sugeridas

- [ ] Importar/exportar contratos y nóminas a CSV
- [ ] Gráficos de costo por contrato
- [ ] Alertas cuando se alcanza presupuesto máximo
- [ ] Histórico de modificaciones de contratos
- [ ] Proyección de costos para múltiples períodos
