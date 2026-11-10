# Implementación de Gestión de Nóminas en AccountingPage.tsx

## Resumen de Cambios

Se han implementado funcionalidades completas para gestionar el pago de nóminas en el módulo de Contabilidad con generación automática de asientos contables.

### 1. Nuevas Importaciones
- `Checkbox`, `Dialog`, `DialogActions`, `DialogContent`, `DialogTitle` de Material-UI
- Necesarios para la interfaz de selección y modal de pagos

### 2. Nuevas Constantes de Cuentas
- `payableAccountCode = "210301"` (Cuentas por Pagar)
- `personalExpenseAccountCode = "510301"` (Gastos de Personal)

### 3. Nuevos Tipos
```typescript
type PayrollPaymentDraft = {
  selectedRuns: string[];
  paymentDate: string;
  bankAccount: string;
  reference: string;
  observations: string;
};
```

### 4. Nueva Función de Asientos
```typescript
function makePayrollPaymentEntry(
  payrollId: string,
  period: string,
  net: number,
  date: string,
  bankCode: string,
  reference: string,
  accounts: FinanceAccount[]
): JournalEntry
```

**Lógica de Asientos:**
- Débito: Cuentas por Pagar (210301) - monto neto
- Crédito: Banco (110101 o seleccionado) - monto neto

### 5. Nuevos Estados del Componente
- `payrollPaymentDialog: boolean` - controla visibilidad del modal
- `payrollPaymentDraft: PayrollPaymentDraft` - datos del pago en edición
- `payrollPaymentHistory: Array` - historial de pagos realizados

### 6. Nuevo Manejador de Eventos
```typescript
function registerPayrollPayment(event: FormEvent<HTMLFormElement>)
```

**Validaciones:**
- Verifica permisos (solo Contabilidad o Administrador)
- Valida nóminas seleccionadas, fecha y referencia
- Crea asientos contables automáticos
- Actualiza estado de nóminas en localStorage
- Registra historial de pagos

### 7. Nuevo Tab: "Nóminas a Pagar" (Tab 5)

#### Componentes Principales:
1. **Tabla de Nóminas Pendientes**
   - Checkboxes para seleccionar nóminas
   - Período, cantidad de empleados
   - Salario bruto, descuentos, salario neto
   - Estado ("Pendiente de pago")

2. **Botón de Acción**
   - "Pagar Seleccionadas" disponible solo para Contabilidad/Administrador
   - Abre modal de confirmación

3. **Modal de Pago**
   - Fecha de pago (date picker)
   - Selección de banco/cuenta
   - Referencia de pago (ej: "Transferencia #12345")
   - Observaciones (textarea)

4. **Historial de Pagos**
   - Tabla con pagos realizados
   - Período, fecha, monto y referencia

5. **Reportes de Nómina**
   - Total pagado (mes actual)
   - Total pendiente
   - Gastos de personal contabilizados

## Flujo de Funcionamiento

### Generación de Nóminas (HumanResourcesPage)
1. Recursos Humanos genera nóminas (PayrollRun)
2. Se crean asientos de devengo automáticamente:
   - Débito: Gastos de Personal (510301)
   - Crédito: Cuentas por Pagar (210301)
   - Crédito: Descuentos (210302)

### Pago de Nóminas (AccountingPage - nuevo)
1. Usuario abre tab "Nóminas a Pagar"
2. Ve nóminas pendientes del mes actual
3. Selecciona nóminas con checkboxes
4. Hace clic en "Pagar Seleccionadas"
5. Completa modal con:
   - Fecha de pago
   - Banco de pago
   - Referencia (ej: nº transferencia)
   - Observaciones (opcional)
6. Al confirmar:
   - Crea asiento de pago:
     * Débito: CxP (210301)
     * Crédito: Banco (110101 o seleccionado)
   - Actualiza estado de nómina a "Pagada"
   - Registra en historial de pagos
   - Guarda en localStorage (payrollRunsStorageKey y pmoptimizer-payroll-payments)

## Datos Guardados

### localStorage Keys Utilizadas
- `pmoptimizer-payroll-runs`: Nóminas con estados actualizados
- `pmoptimizer-payroll-payments`: Historial de pagos realizados

### Estructura de Datos

**Nómina actualizada:**
```json
{
  "id": "PAY-xxx",
  "period": "2024-11",
  "status": "Pagada",
  "gross": 5000000,
  "deductions": 1000000,
  "net": 4000000,
  "lines": [...]
}
```

**Registro de pago:**
```json
{
  "runId": "PAY-xxx",
  "period": "2024-11",
  "date": "2024-11-30",
  "amount": 4000000,
  "reference": "Transferencia #12345"
}
```

## Validaciones Implementadas

1. **Permiso:** Solo Contabilidad o Administrador
2. **Nóminas:** Al menos una debe estar seleccionada
3. **Fecha:** Debe ser válida (YYYY-MM-DD)
4. **Banco:** Debe seleccionarse de las cuentas disponibles
5. **Referencia:** Debe proporcionar texto
6. **Duplicación:** No crea asientos duplicados si ya existe pago

## Integración con Existente

- Reutiliza funciones: `money()`, `makeLine()`, `requiredAccount()`
- Usa sistema de persistencia: `readFinanceState()`, `saveFinanceState()`
- Compatible con estructura de `FinanceState` y `JournalEntry`
- No modifica funcionalidades existentes de facturas y cobros

## Cuentas Contables Requeridas

**Obligatorias para funcionar:**
- `110101` - Banco moneda nacional (o similar)
- `210301` - Cuentas por Pagar
- `510301` - Gastos de Personal

Si faltan, se lanza error: "Falta configurar la cuenta contable..."

## Pruebas Recomendadas

1. ✓ Compilación sin errores TypeScript
2. ✓ Carga de nóminas desde localStorage
3. ✓ Selección de nóminas con checkboxes
4. ✓ Modal se abre y cierra correctamente
5. ✓ Asientos se crean con valores correctos
6. ✓ Estados se actualizan en localStorage
7. ✓ Historial se registra y muestra
8. ✓ Reportes muestran valores correctos
9. ✓ Permisos se validan (solo Contabilidad/Admin)
10. ✓ Balance contable permanece correcto después del pago

## Notas Importantes

- Los asientos de devengo (gastos + CxP) se crean en HumanResourcesPage
- Los asientos de pago (CxP → Banco) se crean aquí
- El salario bruto se contabiliza como gasto en devengo
- El pago real solo afecta a CxP y Bancos
- Descuentos se registran como pasivo separado (210302)
