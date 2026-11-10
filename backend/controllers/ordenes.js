const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

// Simulación en memoria mientras configuramos BD
// En producción, esto vendrá de Azure SQL
let ordenes = [];

// GET todas las órdenes
router.get('/', (req, res) => {
  res.json({
    success: true,
    count: ordenes.length,
    data: ordenes
  });
});

// GET orden por ID
router.get('/:id', (req, res) => {
  const orden = ordenes.find(o => o.id === req.params.id);
  if (!orden) {
    return res.status(404).json({ error: 'Orden no encontrada' });
  }
  res.json({ success: true, data: orden });
});

// POST crear nueva orden
router.post('/', (req, res) => {
  try {
    const { numero_orden, tipo, titulo, descripcion, estado } = req.body;
    
    if (!numero_orden || !tipo || !titulo) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    const nuevaOrden = {
      id: uuidv4(),
      numero_orden,
      tipo,
      titulo,
      descripcion: descripcion || '',
      estado: estado || 'pendiente',
      fecha_creacion: new Date().toISOString(),
      datos: {}
    };

    ordenes.push(nuevaOrden);

    res.status(201).json({
      success: true,
      message: 'Orden creada',
      data: nuevaOrden
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT actualizar orden
router.put('/:id', (req, res) => {
  try {
    const orden = ordenes.find(o => o.id === req.params.id);
    if (!orden) {
      return res.status(404).json({ error: 'Orden no encontrada' });
    }

    Object.assign(orden, req.body, { id: orden.id }); // No permitir cambiar ID

    res.json({
      success: true,
      message: 'Orden actualizada',
      data: orden
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE orden
router.delete('/:id', (req, res) => {
  const index = ordenes.findIndex(o => o.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Orden no encontrada' });
  }

  const ordenEliminada = ordenes.splice(index, 1);
  res.json({
    success: true,
    message: 'Orden eliminada',
    data: ordenEliminada[0]
  });
});

module.exports = router;
