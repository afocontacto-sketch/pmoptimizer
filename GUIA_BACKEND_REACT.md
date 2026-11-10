# 🔌 GUÍA: Usar Backend en tus componentes React

**Objetivo:** Reemplazar localStorage con llamadas al backend

---

## 📚 CÓMO USAR EL HOOK `useOrdenes`

### Ejemplo básico en un componente:

```tsx
import { useOrdenes } from '../hooks/useOrdenes';

export function MiComponente() {
  const { ordenes, loading, error, backendDisponible, agregar, actualizar, eliminar } = useOrdenes();

  // Crear una orden
  const handleCrear = async () => {
    const nueva = await agregar({
      numero_orden: 'PRE-001',
      tipo: 'PRE',
      titulo: 'Mi primera orden',
      descripcion: 'Orden creada desde React',
      estado: 'pendiente'
    });
    if (nueva) {
      console.log('Orden creada:', nueva);
    }
  };

  // Actualizar una orden
  const handleActualizar = async (id: string) => {
    await actualizar(id, {
      estado: 'completada',
      titulo: 'Orden actualizada'
    });
  };

  // Eliminar una orden
  const handleEliminar = async (id: string) => {
    const ok = await eliminar(id);
    if (ok) console.log('Orden eliminada');
  };

  if (loading) return <div>Cargando...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      {!backendDisponible && <p style={{color: 'red'}}>⚠️ Backend no disponible</p>}
      
      <button onClick={handleCrear}>Crear Orden</button>
      
      <ul>
        {ordenes.map(orden => (
          <li key={orden.id}>
            {orden.numero_orden} - {orden.titulo}
            <button onClick={() => handleActualizar(orden.id)}>Actualizar</button>
            <button onClick={() => handleEliminar(orden.id)}>Eliminar</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

---

## 🚀 INTEGRACIÓN RÁPIDA

### 1. En `App.tsx` o donde manejes órdenes:

```tsx
import { useOrdenes } from './hooks/useOrdenes';

export function App() {
  const { ordenes, agregar, actualizar, eliminar } = useOrdenes();

  // Usa `ordenes` en lugar de localStorage
  // Usa `agregar()`, `actualizar()`, `eliminar()` para cambios
}
```

### 2. Reemplaza esto (localStorage):
```tsx
// ❌ VIEJO
const [ordenes, setOrdenes] = useState(() => {
  const saved = localStorage.getItem('ordenes');
  return saved ? JSON.parse(saved) : [];
});

setOrdenes(prev => [...prev, nuevaOrden]);
localStorage.setItem('ordenes', JSON.stringify(ordenes));
```

### 3. Por esto (backend):
```tsx
// ✅ NUEVO
const { ordenes, agregar } = useOrdenes();

await agregar(nuevaOrden);
// El estado se actualiza automáticamente desde el backend
```

---

## 🔄 FLUJO DE DATOS

```
React Component
     ↓
useOrdenes hook
     ↓
services/api.ts (funciones fetch)
     ↓
Backend (http://localhost:3001)
     ↓
Datos compartidos entre todos los usuarios ✅
```

---

## 📋 FUNCIONES DISPONIBLES

| Función | Descripción |
|---------|------------|
| `ordenes` | Array con todas las órdenes |
| `loading` | true mientras se cargan datos |
| `error` | Mensaje de error (si hay) |
| `backendDisponible` | true si backend está activo |
| `cargarOrdenes()` | Recargar órdenes desde el backend |
| `agregar(orden)` | Crear nueva orden |
| `actualizar(id, updates)` | Actualizar una orden |
| `eliminar(id)` | Eliminar una orden |

---

## ⚠️ CAMBIOS NECESARIOS EN TUS COMPONENTES

Busca en el código:
1. `localStorage.getItem('ordenes')`
2. `localStorage.setItem('ordenes', ...)`
3. `useState` para órdenes

Y reemplaza por `useOrdenes()`.

---

## 🧪 PROBAR EL BACKEND

```bash
# Terminal 1: Iniciar backend
cd backend
npm start

# Terminal 2: Iniciar app React
npm run dev
```

Abre: http://localhost:3000

¡Las órdenes se sincronizarán automáticamente! 🎉

---

## 🐛 Si algo no funciona

1. ¿Está corriendo el backend? `npm start` en carpeta `backend`
2. ¿Está corriendo React? `npm run dev`
3. ¿Ves errores en consola? (F12 → Console)
4. ¿El `.env.local` tiene `REACT_APP_API_URL=http://localhost:3001`?

---

**Cuéntame qué componentes necesitan actualizar para sincronizar con el backend.** 🚀
