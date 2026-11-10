// src/services/api.ts
// Servicio centralizado para llamadas al backend

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export interface Orden {
  id: string;
  numero_orden: string;
  tipo: string;
  titulo: string;
  descripcion: string;
  estado: string;
  fecha_creacion: string;
  datos?: Record<string, any>;
}

// GET todas las órdenes
export async function obtenerOrdenes(): Promise<Orden[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/ordenes`);
    if (!response.ok) throw new Error('Error al obtener órdenes');
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error('Error en obtenerOrdenes:', error);
    return [];
  }
}

// GET orden por ID
export async function obtenerOrden(id: string): Promise<Orden | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/ordenes/${id}`);
    if (!response.ok) return null;
    const data = await response.json();
    return data.data || null;
  } catch (error) {
    console.error('Error en obtenerOrden:', error);
    return null;
  }
}

// POST crear nueva orden
export async function crearOrden(orden: Omit<Orden, 'id' | 'fecha_creacion'>): Promise<Orden | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/ordenes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orden)
    });
    if (!response.ok) throw new Error('Error al crear orden');
    const data = await response.json();
    return data.data || null;
  } catch (error) {
    console.error('Error en crearOrden:', error);
    return null;
  }
}

// PUT actualizar orden
export async function actualizarOrden(id: string, updates: Partial<Orden>): Promise<Orden | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/ordenes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!response.ok) throw new Error('Error al actualizar orden');
    const data = await response.json();
    return data.data || null;
  } catch (error) {
    console.error('Error en actualizarOrden:', error);
    return null;
  }
}

// DELETE eliminar orden
export async function eliminarOrden(id: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/ordenes/${id}`, {
      method: 'DELETE'
    });
    return response.ok;
  } catch (error) {
    console.error('Error en eliminarOrden:', error);
    return false;
  }
}

// Health check
export async function verificarBackend(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/health`);
    return response.ok;
  } catch (error) {
    console.error('Backend no disponible:', error);
    return false;
  }
}
