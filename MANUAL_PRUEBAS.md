# Manual de Pruebas - Órdenes Cerradas y Reapertura

## Prerequisitos
- Proyecto ejecutándose en desarrollo (`npm run dev`)
- Rol: Supervisor o Administrador (para ver sección de cerradas)
- Navegador con localStorage habilitado

## Escenarios de Prueba

### 1. Separación de Órdenes Cerradas

#### Prueba 1.1: Orden cerrada desaparece de lista activa
**Pasos**:
1. Ir a Tab 0 "Órdenes de trabajo"
2. Verificar que "Órdenes Activas" muestra todas las órdenes no cerradas
3. Cerrar una orden (Cierre provisorio → Calidad OK → Cerrar OT)
4. **Esperado**: La orden desaparece de Tab "Órdenes Activas"
5. **Verificar**: Tab "Órdenes Cerradas" ahora la contiene

#### Prueba 1.2: Solo Supervisor ve órdenes cerradas
**Pasos**:
1. Login como Supervisor
   - **Esperado**: Ve Tab "Órdenes Cerradas" en Tab 0
2. Cambiar a otro rol (PM Proyecto, Planificador, Producción, etc.)
   - **Esperado**: Tab "Órdenes Cerradas" NO aparece
3. Cambiar a Administrador
   - **Esperado**: Ve Tab "Órdenes Cerradas"

#### Prueba 1.3: Órdenes cerradas se ven grisáceas
**Pasos**:
1. Ir a Tab 0 → "Órdenes Cerradas"
2. **Esperado**: 
   - Fondo grisáceo en filas (color #f5f5f5)
   - Opacidad reducida (0.7)
   - Botón "Reabrir" disponible

---

### 2. Reapertura de Órdenes

#### Prueba 2.1: Modal de reapertura funciona
**Pasos**:
1. Ir a Tab 0 → "Órdenes Cerradas"
2. Hacer click en "Reabrir" de una orden cerrada
3. **Esperado**: Se abre Dialog con:
   - Título: "Reapertura de Orden de Trabajo"
   - Campo de texto multiline: "Motivo de reapertura"
   - Botones: "Cancelar", "Reabrir OT" (deshabilitado)

#### Prueba 2.2: Validación de motivo obligatorio
**Pasos**:
1. Abrir modal de reapertura
2. Dejar campo vacío
3. **Esperado**: Botón "Reabrir OT" está deshabilitado
4. Escribir motivo: "Se encontró defecto de soldadura"
5. **Esperado**: Botón "Reabrir OT" se habilita

#### Prueba 2.3: Reapertura exitosa
**Pasos**:
1. Abrir modal de reapertura
2. Ingresar motivo: "Rechazo de calidad - se requiere reproceso"
3. Click en "Reabrir OT"
4. **Esperado**:
   - Modal se cierra
   - Mensaje: "OT-XXXX reabierta por Usuario - Motivo: Rechazo..."
   - Orden vuelve a "Órdenes Activas"
   - Estado cambia a "Asignada"

#### Prueba 2.4: Solo Supervisor puede reabrir
**Pasos**:
1. Login como PM Proyecto o Planificador
2. Intenta acceder a "Órdenes Cerradas"
   - **Esperado**: Tab no aparece
3. Incluso si accede a base de datos, al intentar reabrir:
   - **Esperado**: Código rechaza (validación `isSupervisor`)

---

### 3. Historial de Cambios de Estado

#### Prueba 3.1: Historial se guarda en cierre
**Pasos**:
1. Crear orden y cerrarla
2. Ir a "Órdenes Cerradas"
3. Ver columna "Historial"
4. **Esperado**: Muestra:
   - Transición: "Cierre provisorio → Cerrada"
   - Usuario: "Supervisor" (o quien cerró)
   - Fecha/hora

#### Prueba 3.2: Reapertura agrega entrada al historial
**Pasos**:
1. Orden ya cerrada
2. Reabrirla con motivo: "Test de historial"
3. Ir a "Órdenes Activas"
4. Cerrar de nuevo
5. Ir a "Órdenes Cerradas"
6. Ver columna "Historial"
7. **Esperado**: Muestra 2+ transiciones:
   - Primera: "Cierre provisorio → Cerrada"
   - Segunda: "Cerrada → Asignada" (reapertura)
   - Tercera: "Asignada → Cerrada" (nuevo cierre)

---

### 4. Persistencia en localStorage

#### Prueba 4.1: Órdenes persisten después de recargar
**Pasos**:
1. Crear y cerrar una orden
2. Ir a "Órdenes Cerradas"
3. Anotar ID de la orden
4. Recargar página (F5)
5. **Esperado**: 
   - Orden sigue en "Órdenes Cerradas"
   - Datos intactos (fecha/hora, usuario)
   - Historial completo preservado

#### Prueba 4.2: Verificar clave v2 en localStorage
**Pasos**:
1. Abrir DevTools (F12) → Console
2. Ejecutar:
   ```javascript
   Object.keys(localStorage).filter(k => k.includes('work-orders'))
   ```
3. **Esperado**: 
   - Retorna: `["pmoptimizer-work-orders-v2"]`
   - NO contiene `pmoptimizer-work-orders` (v1)

#### Prueba 4.3: Datos guardados contienen info de cierre
**Pasos**:
1. Abrir DevTools → Console
2. Ejecutar:
   ```javascript
   const data = JSON.parse(localStorage.getItem('pmoptimizer-work-orders-v2'));
   const cerrada = data.find(o => o.status === 'Cerrada');
   console.log({
     closedAt: cerrada.closedAt,
     closedBy: cerrada.closedBy,
     historial: cerrada.statusHistory
   });
   ```
3. **Esperado**: Imprime objeto con:
   - `closedAt`: Timestamp ISO 8601
   - `closedBy`: Nombre del usuario
   - `historial`: Array con registros de cambios

---

### 5. Lógica de Cierre

#### Prueba 5.1: Cierre automático mueve orden
**Pasos**:
1. Orden en "Cierre provisorio" + Calidad OK
2. Click en "Cerrar OT"
3. **Esperado**:
   - Desaparece de "Órdenes Activas"
   - Aparece en "Órdenes Cerradas"
   - Campos `closedAt` y `closedBy` se establecen

#### Prueba 5.2: Otros roles no ven tab de cerradas
**Pasos**:
1. Login con diferentes roles:
   - PM Proyecto
   - Planificador
   - Producción
   - Compras
   - Calidad
   - Contabilidad
   - Ingeniería
2. **Esperado**: Tab "Órdenes Cerradas" NO aparece
3. Login como:
   - Supervisor
   - Administrador
4. **Esperado**: Tab "Órdenes Cerradas" SÍ aparece

---

## Casos Edge

### Edge 1: Intenta reabrir sin motivo
- **Acción**: Click "Reabrir", click "Reabrir OT" (vacío)
- **Esperado**: Botón deshabilitado, no hace nada

### Edge 2: Recarga durante reapertura
- **Acción**: Abrir modal, ingresar motivo, cerrar navegador
- **Esperado**: Al volver, modal cerrado, orden sigue cerrada

### Edge 3: Múltiples reaperturas
- **Acción**: Cerrar → Reabrir → Cerrar → Reabrir → Cerrar
- **Esperado**: Historial muestra todas las transiciones

### Edge 4: Cambio de rol con modal abierto
- **Acción**: Abrir modal, cambiar rol a PM Proyecto
- **Esperado**: Modal sigue abierto (sin guardar cambios), código rechaza al intentar guardar

---

## Validación Final

✅ Todas las pruebas pasan
✅ localStorage contiene `pmoptimizer-work-orders-v2`
✅ Historial es completo y auditable
✅ Solo Supervisor/Admin ven órdenes cerradas
✅ Reapertura funciona con motivo obligatorio
✅ Datos persisten entre recargas
✅ Filtros se aplican correctamente por rol

---

## Notas

- Los datos demo iniciales NO incluyen órdenes cerradas
- Primera orden cerrada se crea al probar el flujo completo
- localStorage es específico del navegador/dominio
- Limpiar localStorage: `localStorage.clear()` en DevTools
