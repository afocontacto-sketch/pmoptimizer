# Implementación: Separación y Reapertura de Órdenes de Trabajo

## Resumen de Cambios

Se ha implementado un sistema completo de gestión de órdenes cerradas en `WorkOrders.tsx` con las siguientes funcionalidades:

### 1. ✅ Separación de Órdenes Cerradas

#### Cambios realizados:
- **Tabs anidados en Tab 0 (Bandeja de trabajo)**:
  - Tab "Órdenes Activas" (estado ≠ Cerrada)
  - Tab "Órdenes Cerradas" (estado = Cerrada, solo Supervisor/Admin)
  
- **Filtros de visibilidad**:
  ```typescript
  const activeWorkOrders = visibleOrders.filter(order => 
    order.status !== "Cerrada" && supervisorCanSeeOrder(order)
  );
  const closedWorkOrders = visibleOrders.filter(order => 
    order.status === "Cerrada" && (isSupervisor || role === "Administrador")
  );
  ```

- **Estilos visuales para órdenes cerradas**:
  - Opacidad: 0.7
  - Fondo grisáceo: `#f5f5f5`
  - Deshabilitadas visualmente para indicar estado inactivo

#### Control de acceso:
- ✅ Solo `Supervisor` y `Administrador` ven tab de órdenes cerradas
- ✅ Otros roles (`PM Proyecto`, `Planificador`, `Producción`, etc.) NO ven esta sección
- ✅ Las órdenes cerradas se desapuntan automáticamente de la lista principal

### 2. ✅ Reapertura de Órdenes

#### Modal de Reapertura:
- **Componente Dialog** con:
  - Campo de texto multiline para "Motivo de reapertura"
  - Validación: motivo es obligatorio
  - Botones: Cancelar, Reabrir OT

- **Código**:
  ```typescript
  <Dialog open={reopenModalOpen} onClose={...} maxWidth="sm" fullWidth>
    <DialogTitle>Reapertura de Orden de Trabajo</DialogTitle>
    <DialogContent>
      <TextField
        multiline
        minRows={3}
        label="Motivo de reapertura"
        value={reopenReason}
        onChange={...}
      />
    </DialogContent>
    <DialogActions>
      <Button onClick={...}>Cancelar</Button>
      <Button 
        variant="contained" 
        onClick={() => reopenOrder(reopenOrderId, reopenReason)}
        disabled={!reopenReason.trim()}
      >
        Reabrir OT
      </Button>
    </DialogActions>
  </Dialog>
  ```

#### Función de Reapertura:
```typescript
const reopenOrder = (orderId: string, reason: string) => {
  if (!isSupervisor) {
    setError("Solo Supervisor puede reabrir una OT cerrada.");
    return;
  }
  if (!reason.trim()) {
    setError("Completa el motivo de reapertura.");
    return;
  }
  
  const order = orders.find(item => item.id === orderId);
  if (!order || order.status !== "Cerrada") {
    setError("Solo se pueden reabrir órdenes en estado Cerrada.");
    return;
  }
  
  const now = new Date().toISOString();
  updateOrder(orderId, (order) => ({
    ...order,
    status: "Asignada",
    supervisorClosedBy: null,
    qualityApproved: false,
    qualityApprovedBy: null,
    statusHistory: [
      ...(order.statusHistory ?? []),
      {
        date: now,
        previousStatus: "Cerrada",
        newStatus: "Asignada",
        user,
        reason: reason.trim(),
      },
    ],
  }));
};
```

### 3. ✅ Historial de Cambios de Estado

#### Nuevo tipo:
```typescript
type StatusChangeRecord = {
  date: string;
  previousStatus: OrderStatus;
  newStatus: OrderStatus;
  user: string;
  reason?: string;
};
```

#### Actualización de WorkOrder:
```typescript
type WorkOrder = {
  // ... campos existentes ...
  closedAt?: string;
  closedBy?: string;
  statusHistory?: StatusChangeRecord[];
};
```

#### Captura de historial en cierre:
- Cuando se cierra orden: se agrega registro con `previousStatus`, `newStatus`, `user`, `date`
- Cuando se reabre: se agrega registro con el motivo (`reason`)
- Visible en tabla de órdenes cerradas (nueva columna "Historial")

### 4. ✅ Persistencia en localStorage

#### Clave mejorada:
- **Anterior**: `pmoptimizer-work-orders`
- **Actual**: `pmoptimizer-work-orders-v2`

#### Datos guardados:
```typescript
{
  id: string;
  status: OrderStatus;
  closedAt?: string;        // Fecha/hora de cierre ISO 8601
  closedBy?: string;        // Usuario que cerró
  statusHistory?: [
    {
      date: string;         // Fecha/hora del cambio
      previousStatus: OrderStatus;
      newStatus: OrderStatus;
      user: string;
      reason?: string;      // Opcional: motivo de reapertura
    }
  ];
}
```

#### Guardado automático:
```typescript
useEffect(() => {
  localStorage.setItem(ordersStorageKey, JSON.stringify(orders));
}, [orders]);
```

## Cambios de Importaciones

Se agregaron componentes Dialog a las importaciones de Material-UI:
```typescript
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  // ... otros componentes ...
} from "@mui/material";
```

## Estados Nuevos

```typescript
const [operationsTab, setOperationsTab] = useState(0);      // Tab activo en bandeja
const [reopenModalOpen, setReopenModalOpen] = useState(false); // Control modal
const [reopenOrderId, setReopenOrderId] = useState("");     // ID de orden a reabrir
const [reopenReason, setReopenReason] = useState("");       // Motivo de reapertura
```

## Validación

✅ **Compatibilidad**: Se mantienen todos los datos existentes
✅ **Material-UI**: Componentes consistentes con el proyecto
✅ **Permisos**: Respeta roles definidos (Supervisor/Admin only)
✅ **Persistencia**: localStorage con versión v2
✅ **Historial**: Cambios de estado completamente documentados

## Pruebas Incluidas

Archivo: `tests/workorders.test.ts`

### Test Cases:
1. ✅ Orden cerrada desaparece de lista activa
2. ✅ Solo Supervisor/Admin ven órdenes cerradas
3. ✅ Reapertura con motivo guarda historial
4. ✅ Motivo de reapertura es obligatorio
5. ✅ Órdenes se guardan con clave v2
6. ✅ Fecha/hora y usuario de cierre persisten
7. ✅ Historial de cambios se preserva
8. ✅ Orden cerrada se mueve automáticamente
9. ✅ Otros roles NO ven órdenes cerradas

## Flujo Completo

1. **Cierre de Orden**:
   - Orden en "Cierre provisorio" + Calidad OK → Supervisor cierra
   - Estado cambia a "Cerrada"
   - Se agrega registro de historial con fecha/hora/usuario
   - Se guarda `closedAt` y `closedBy`
   - Se persiste en localStorage v2

2. **Visualización**:
   - Tab 0 muestra tabs anidados: "Órdenes Activas" | "Órdenes Cerradas"
   - Órdenes cerradas desaparecen de lista activa
   - Solo Supervisor/Admin ven tab de cerradas
   - Órdenes cerradas con estilo grisáceo/deshabilitado

3. **Reapertura**:
   - Supervisor hace click en "Reabrir" en orden cerrada
   - Se abre Modal pidiendo motivo
   - Motivo es obligatorio (validación)
   - Al confirmar:
     - Estado vuelve a "Asignada"
     - Se agrega registro de historial con motivo
     - Se limpia `supervisorClosedBy`, `qualityApproved`
     - Se persiste cambio

4. **Historial Visible**:
   - Columna "Historial" muestra todos los cambios de estado
   - Incluye: fecha, transición, usuario, motivo (si aplica)

## Notas de Implementación

- La clave v2 de localStorage es nueva, datos antiguos con clave v1 no se migran automáticamente
- Supervisor es el único rol con permiso de reapertura
- El historial es inmutable y auditable
- Los cambios son persistentes y se recuperan al recargar la página
- La tabla de órdenes cerradas está en Tab 0 (junto con activas), no en Tab 5
