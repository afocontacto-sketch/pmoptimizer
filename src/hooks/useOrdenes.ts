// src/hooks/useOrdenes.ts
// Hook personalizado para gestionar órdenes desde el backend

import { useState, useEffect, useCallback } from 'react';
import { obtenerOrdenes, crearOrden, actualizarOrden, eliminarOrden, verificarBackend, Orden } from '../services/api';

export function useOrdenes() {
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [backendDisponible, setBackendDisponible] = useState(false);

  // Cargar órdenes al montar
  useEffect(() => {
    cargarOrdenes();
    verificarBackendStatus();
  }, []);

  // Cargar órdenes desde el backend
  const cargarOrdenes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await obtenerOrdenes();
      setOrdenes(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);

  // Crear nueva orden
  const agregar = useCallback(async (orden: Omit<Orden, 'id' | 'fecha_creacion'>) => {
    try {
      const nueva = await crearOrden(orden);
      if (nueva) {
        setOrdenes(prev => [...prev, nueva]);
        return nueva;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear orden');
    }
    return null;
  }, []);

  // Actualizar orden
  const actualizar = useCallback(async (id: string, updates: Partial<Orden>) => {
    try {
      const actualizada = await actualizarOrden(id, updates);
      if (actualizada) {
        setOrdenes(prev => prev.map(o => o.id === id ? actualizada : o));
        return actualizada;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar orden');
    }
    return null;
  }, []);

  // Eliminar orden
  const eliminar = useCallback(async (id: string) => {
    try {
      const ok = await eliminarOrden(id);
      if (ok) {
        setOrdenes(prev => prev.filter(o => o.id !== id));
        return true;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar orden');
    }
    return false;
  }, []);

  // Verificar estado del backend
  const verificarBackendStatus = useCallback(async () => {
    const disponible = await verificarBackend();
    setBackendDisponible(disponible);
  }, []);

  return {
    ordenes,
    loading,
    error,
    backendDisponible,
    cargarOrdenes,
    agregar,
    actualizar,
    eliminar,
    verificarBackend: verificarBackendStatus
  };
}
